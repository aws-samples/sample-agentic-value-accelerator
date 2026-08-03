# Governance Model — Access Control as a Read Model and a Write Workflow

This document frames the platform's access-control story end to end: the **decisions** the
platform makes, the **layers** that enforce them, and the two operator surfaces that make the
model legible and actionable — the **Governance Graph** (the read model) and the
**request → approve** workflow (the write workflow).

It is the narrative companion to two existing references:

- **README** → *"The governance story (the differentiator)"* — the four enforcement layers.
- **[DESIGN.md](DESIGN.md) §3 (Authentication and Identity)** — how the inbound Cognito token is
  verified and how outbound credentials (3LO / M2M / API-key) are vended.

The catalog + decision logic referenced throughout live in one file, `agent/entitlements.py`
(copied verbatim into the enforcement Lambdas by `deploy.sh`), so nothing here can drift from the
code.

---

## 1. Three decisions, one catalog

Every access question the platform answers reduces to one of three decisions about a
**principal** (a `user#<sub>` or an `agent#<workload>`):

| # | Decision | Question | Catalog dimension |
|---|----------|----------|-------------------|
| 1 | **Desk** | May this user operate this vertical (persona)? | `DESK_CATALOG` — capital_markets / insurance / banking / fintech |
| 2 | **Tool** | May this user invoke this governed tool? | `TOOL_CATALOG` — ~30 tools across the desks + shared platform surface |
| 3 | **Credential** | May this *agent* vend this outbound credential provider? | `CRED_CATALOG` — 3LO / M2M / API-key |

The store (`EntitlementsTable`) is the single source of truth: one item per
`(principal, dataType)` where `dataType ∈ {meta, tools, desks, creds}`. The semantics are
deliberately asymmetric and safe by default:

- **Unmanaged principal** (no records) → *fail-open*: everything allowed. A fresh deploy is never
  bricked before `deploy.sh` seeds defaults, and ad-hoc users keep working.
- **Managed principal** (an admin has touched it) → *default-deny*: only keys explicitly granted
  `true` are allowed.

Credentials transitively gate tools: revoking `market_m2m` blocks the `market_data` tool, because
the agent can no longer obtain the token to call it (`tools_for_creds`).

---

## 2. Four enforcement layers (defense in depth)

The same revocation is enforced at four independent layers, so no single bypass defeats it. Two
are **per-user** (they see the verified human identity) and two are **platform kill-switches**
(they engage when something is revoked for *everyone*):

1. **Runtime pre-check** *(per-user, primary)* — the agent gates each tool/desk against the
   caller's **cryptographically verified** Cognito `sub` (from JWKS-validated claims, never a
   self-asserted payload field). Fails closed on evaluation error.
2. **Gateway REQUEST interceptor** *(per-user, MCP boundary)* — denies `tools/call` at the Gateway
   itself, using the runtime-asserted principal. Fail-closed for governed tools.
3. **Cedar per-tool blocklist** *(platform kill-switch, user-side)* — a scoped `forbid` on the
   Gateway that engages when a tool is revoked for **every** managed user. The Gateway refuses the
   tool even if the runtime were bypassed.
4. **IAM least-privilege backstop** *(platform kill-switch, agent-side)* — an inline `Deny` on the
   runtime role's `secretsmanager:GetSecretValue` for a revoked provider's backing secret. Because
   every vend reads that secret *as the runtime role*, the vend fails at the AWS control plane even
   if all runtime code were bypassed.

The impersonation angle is closed: the runtime verifies the in-band user token against Cognito
JWKS and takes identity only from verified claims (see DESIGN.md §3.1 and §6.6).

---

## 3. The Governance Graph — the read model

The Access Control console shows grants as flat grids. The **Governance Graph** renders the same
data as a live node-link graph so *"who can reach what, and where is a kill-switch engaged"* is
legible at a glance. It is a pure, admin-only visualization — no writes.

**Data source.** One call, `GET /admin/graph` (admin-gated, under the existing
`/admin/{proxy+}`), returns the catalogs, every principal with its effective grants, and the
**global block overlay** the grids never surfaced: the Cedar-forbidden tools
(`cedar.get_blocked_actions()`, mapped back to tool names) and IAM-denied creds
(`iam_creds.get_blocked_cred_keys()`). Per-principal granted/denied edges are computed
client-side with the same `allows()` used everywhere else.

**Two lanes, one canvas** (dagre, left → right = *principal → capability*):

- **Lane A — user access:** `user → desk → tool-group → (expand) tool`.
- **Lane B — agent outbound:** `agent → credential → (expand) tool`.

**Readability** is the design problem (30 tools × N users). Mitigations: collapse to tool *groups*
by default; expand a group/credential on click; **focus** a user to spotlight only their reach;
and filter by desk / sensitive / denied / globally-blocked. Edge semantics reuse the app's design
tokens — green = granted, dashed dim = per-user denied, amber = credential-gated, red (animated) =
**kill-switch engaged** (Cedar/IAM), a distinct signal from an ordinary per-user deny.

> Tools with no Gateway action (`gateway_action: None` — e.g. 3LO/M2M/API-key and the local
> Browser/Code-Interpreter tools) are **runtime-enforced only** and can never appear in the Cedar
> block overlay: Cedar can't see them. The graph reflects this rather than implying they're
> Gateway-blockable.

---

## 4. Request → approve — the write workflow

The console is admin-push only. The **request → approve** workflow adds the other half: a
non-admin can *request* access, and an admin *approves* — a genuine **separation of duties**, the
requester is never the approver.

**Flow.**

1. A non-admin opens **Request access**, picks a desk/tool they lack, adds an optional reason, and
   submits → `POST /me/access-requests` (resolved *before* the admin gate, like `/me/entitlements`).
   The request is stored `PENDING` in `AccessRequestsTable`. Duplicate open requests for the same
   `(requester, kind, key)` are deduped.
2. Any online admin is notified live (`access_request_created` WebSocket frame) — the **Access
   Control** button shows a red pending-count badge.
3. The admin opens the **Requests** tab and **Approves** or **Denies**.
4. **Approve reuses the exact grant code path** as the console (`_apply_single_grant`): it
   baseline-seeds the full catalog on first management (so approving one key never silently denies
   the other 29), writes the grant, re-materializes the matching kill-switch (Cedar for tools /
   IAM for creds), and pushes `entitlements_changed` to the requester. The requester's UI updates
   live and every enforcement layer reflects the change on their next turn. A distinct
   `access_request_resolved` frame drives the outcome toast.

**Store.** `AccessRequestsTable` (PK `requestId`) with a `status-index` GSI so the admin lists
PENDING requests without a table scan. Creds are **not** user-requestable — they are an
agent-scoped, admin-only grant.

---

## 5. Why this shape

- **The read model and write workflow sit on the *same* data and the *same* grant path.** The
  graph is a projection of `EntitlementsTable`; approval calls the identical function the console's
  grid uses. There is no second source of truth and no divergent enforcement.
- **Separation of duties is real, not cosmetic.** The requester route is non-admin and pre-gate;
  the approve/deny routes are admin-gated server-side on the verified `cognito:groups`. A valid
  non-admin token is rejected at the API, not merely hidden in the UI.
- **Everything degrades safely.** The graph's block overlay is best-effort (a Cedar/IAM read
  hiccup yields an empty overlay, not a 500); an unconfigured requests store returns 503, not an
  exception; unmanaged principals render as an explicit "everything allowed" state.

---

## 6. Known simplifications

- **Admin WebSocket fan-out** resolves admin subs via Cognito then scans the connections table per
  admin — O(admins × scan). Fine at demo scale (a handful of admins); a `userId` GSI on the
  connections table would remove the scan at production scale.
- **Duplicate-request dedupe** is a read-before-write, so two truly concurrent creates could both
  pass. Acceptable for the demo; a conditional put on a `requesterSub#kind#key` attribute would
  harden it.
- **`AccessRequestsTable` uses `RemovalPolicy.DESTROY`** (like every table here) so `cleanup.sh`
  works; production should `RETAIN` the governance audit trail.

---

## Cross-reference

- **README** → *"The governance story (the differentiator)"* — the four enforcement layers, in the
  product's own voice.
- **[DESIGN.md](DESIGN.md)** — §3 (inbound verification + outbound credential flows), §6.6 (why the
  in-band token check is cryptographic, not structural).
- **`agent/entitlements.py`** — the canonical catalog + `evaluate()`/`allows()`/`tools_for_creds()`
  decision functions, plus the `tool_groups()`/`groups_for_desk()` helpers the graph reads.
- **`lambda/admin-api/`** — the admin control plane: `index.py` (routes), `cedar.py` (user-side
  kill-switch + `get_blocked_actions`), `iam_creds.py` (agent-side kill-switch +
  `get_blocked_cred_keys`).
