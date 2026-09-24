# BUILD_TASK: Basic Mode — Hybrid Live Cedar Decision

> Goal (from Roshan): the Basic-mode dashboard numbers are staged (illustrative), but the
> demo's core claim — "governance is deterministic and real" — should be backed by a REAL,
> reproducible policy decision at the climax. Wire the decision step to the live Cedar policy
> store; keep everything else staged; degrade gracefully if the API is unavailable.

## Design

- **Live signal:** at the policy-decision stage (`currentStep >= 4`, i.e. "Overall Assessment"
  onward), `BasicModeView` calls the cedar-proxy `POST /evaluate` (AVP `is-authorized`
  passthrough) against production store `L3yUSPSB7oD9EoarS8ZS9m`.
- **Payload** (`buildCedarPayload`) mirrors the narrative so the live decision matches the story:
  - Omega (block): sanctions 92, PEP level 3, £2.5M → **DENY** (ORG-001 amount, ORG-003 sanctions,
    ORG-004 PEP, APP-006 risk).
  - Acme (approve): clean, £100k → **ALLOW** (DEFAULT-001).
- **UI:** a badge in the Operational Dashboard header — `✓ Verified live by Cedar — ALLOW` or
  `⛔ Verified live by Cedar — DENY (N forbids)`, with determining policy IDs in the tooltip.
- **Graceful fallback:** `evaluateAuthorization` returns `null` on missing config / non-2xx /
  5s timeout. Null → no badge, staged dials stand. The demo never breaks.
- Dials, telemetry, and all other numbers remain **staged** (illustrative) — unchanged.

## Backend fix (prerequisite — done + deployed)

The cedar-proxy `/evaluate` handler previously called `is_authorized` WITHOUT forwarding
`entities`/`context`, so the principal was never `in AllAgents`, the DEFAULT-001 permit never
matched, and it returned **DENY for everything**. Fixed to forward `entities` + `context` and
return `determiningPolicies` as `reasons`. Redeployed stack `kyc-cedar-proxy`.

Verified on the live proxy (`xgkacmjesb`):
- Block → `DENY`, reasons `[ORG-001, ORG-003, ORG-004, APP-006]`
- Approve → `ALLOW`, reasons `[DEFAULT-001]`

## Config / infra fixes

- `runtime-config.json` `cedar_api_url` was pointing at an **old/orphan** proxy
  (`hf87s4kwmk`); corrected to the live stack API **`xgkacmjesb`**.
  - NOTE: `deploy.sh` excludes `runtime-config.json` from the S3 sync, so the DEPLOYED site's
    `runtime-config.json` in S3 must be updated separately for the live path to work there.
- cedar-proxy CORS `AllowedOrigin` widened to `*` (API-key gated) so the live call works from
  localhost / test URL / anywhere. Security note: the `x-api-key` remains the real gate; tighten
  the origin later if desired.

## Files

- `src/api/cedar.ts` — new `evaluateAuthorization(payload)` + `AuthzResult` (stale
  `evaluatePolicy` left untouched).
- `src/components/BasicMode/BasicModeView.tsx` — `buildCedarPayload`, `liveCedar` state, effect,
  live badge.
- `public/runtime-config.json` — `cedar_api_url` → `xgkacmjesb`.
- `deploy/console-services/cedar-proxy/template-cfn.yaml` — `/evaluate` forwards entities/context.

## Acceptance Criteria

- [x] cedar-proxy `/evaluate` forwards entities + context; returns determining policies
- [x] Live proxy verified: block→DENY, approve→ALLOW
- [x] Frontend calls live proxy at decision step; shows Verified-live badge
- [x] Graceful fallback to staged when API unavailable (null result → no badge)
- [x] Build passes
- [ ] Reviewed on localhost (badge appears at step 5+ for both scenarios)
- [ ] Deployed to test URL + S3 runtime-config updated + verified

## Deferred
- Wiring the other four dials (Accuracy/Security/Product/Legal) to live signals — intentionally
  NOT done (they don't produce a smooth per-step progression live; see analysis).
