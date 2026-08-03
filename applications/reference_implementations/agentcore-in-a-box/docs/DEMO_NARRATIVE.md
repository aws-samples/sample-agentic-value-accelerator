# Meridian Asset Management — AgentCore Live Demo Narrative

**Audience:** Developers, Solutions Architects, technical leaders (financial-services lean)
**Runtime:** ~25–35 minutes with Q&A buffer
**Presenter prep:** Read the [logistics appendix](#appendix-presenter-logistics) first. Pre-consent the 3LO grant before going live.

---

## Cold Open — The Problem Worth Solving

> *Before touching the UI, set the stage.*

"Picture a portfolio manager at a fixed-income shop. They want an AI assistant that can actually *do* the job around the edges: pull a restricted-trading list from compliance, look up the funds they run, check live Treasury yields, run portfolio analytics, remember their mandate, and — the big one — **execute a trade on their behalf** with an auditable trail of who authorized it. Not just chat. *Act.*

The challenge is that 'just wire a Lambda to the model' gets messy fast. You end up writing glue code for auth, session routing, tool access control, memory storage — all before you've shipped a single feature. And in a regulated environment, when you need to prove in an audit that *the agent* executed a trade on behalf of *this specific PM*, that plumbing gets expensive.

**Amazon Bedrock AgentCore** is the managed infrastructure layer that handles all of that. Today we'll demo six capabilities — live, in a single agent — and I want you to understand *why* each piece exists.

Meet our PM: **Alice Chen**, on Meridian's Investment-Grade Credit desk. She runs the Core Bond Fund and a Short Duration Income Fund. Let's give her an assistant."

---

## Opening the App — The Architecture Moment

**Action:** Navigate to the demo URL. Sign in via the Cognito Hosted UI as `alice@demo.com` / `Demo1234`.

"The app opens with an architecture diagram as the first message. Alice's identity — her Cognito `sub` — flows through the entire system. Every call the agent makes is scoped to her. That identity plumbing is handled by AgentCore, not custom middleware.

In one sentence: a containerized agent in **AgentCore Runtime**, calling tools through **AgentCore Gateway** (a SigV4-signed MCP endpoint), with tool access controlled by **Cedar policies**, per-user data isolated by **Identity**, and a **Memory** layer that persists facts across sessions — all traced end-to-end in CloudWatch."

---

## Act 1 — Gateway: The Agent Reaches Out

**Narrative beat:** *The simplest trust boundary is between the model and the tools it calls. AgentCore Gateway is how we cross it safely.*

**Action:** Click **"Gateway: Restricted List"** → prompt: *"What's on the firm's restricted trading list right now?"*

**Expected result:** Agent returns the restricted list from the Secure Vault, names the tool (`secure_vault` via AgentCore Gateway), and explains what it did.

> **Teaching point:** That list lives only in the Vault Lambda — the model cannot produce it by reasoning or recall. This matters enormously for the next act.

"The agent sent an MCP JSON-RPC request through the Gateway — a managed, SigV4-authenticated endpoint — which resolved the Lambda target and returned the value. Clean, auditable, and the model never needed to 'know' the value itself."

---

## Act 2 — Policy: The Block That Is Genuinely Real

**Narrative beat:** *'Policy-controlled' only means something if the agent can't cheat.*

**Action:** In the sidebar, flip the **Secure Vault** toggle **OFF**. Status changes to `Vault Access: Disabled`. Ask the restricted-list question again.

**Expected result:** Agent says it's blocked by policy and *cannot* retrieve or invent the list.

> **Say this clearly:** "The model has no escape hatch. The list is not in its training data, not in the conversation history, not in the system prompt. It lives only in the Lambda. The Cedar policy blocked the gateway call. The agent cannot fake an answer — and it says so honestly. That's a real guardrail: not advisory, genuinely preventive. If we'd used a math problem, the model could answer unaided and the block would look cosmetic. We chose a compliance value the model cannot know. The block is structural."

**Action:** Flip the toggle back **ON**. "Policy changes take effect immediately — no redeploy."

---

## Act 3 — Identity: Alice Is Not Bob

**Narrative beat:** *Per-user isolation is the first thing enterprise customers ask about.*

**Action:** Click **"Identity: My Funds"** → *"Look up my portfolio manager profile and the funds I manage."*

**Expected result:** Alice's IG-Credit profile + her two funds (Core Bond Fund, Short Duration Income Fund).

"The agent didn't ask 'what's your user ID?' Alice's Cognito JWT was validated by the Runtime's inbound authorizer, her `sub` extracted, and that sub traveled on every downstream call. If Bob logged in, the same prompt returns *his* Government Securities Fund. Same code path, different identity, zero extra work for the agent author."

---

## Act 4 — Browser: Live Market Data in the Loop

**Narrative beat:** *The market moves. Your agent should be able to read it.*

**Action:** Click **"Browser: Treasury Yields"** → prompt to browse the live US Treasury par-yield-curve page and report today's key yields.

**Expected result:** Agent navigates the live Treasury page in a managed Chromium session, extracts the page text, and returns today's yields across maturities.

> **Why this URL:** the data is *live* and changes daily, so a correct answer proves the agent genuinely browsed — it can't be answered from training data, and it's exactly the kind of reference data a rates PM checks every morning.

"A real HTTP request to a live URL, rendered in a managed AgentCore Browser instance, content streamed back — no web-search API key, no HTML parsing in our code, and the session is isolated, recorded, and billed to the runtime, not the agent container."

---

## Act 5 — Code Interpreter: Analytics Without Contamination

**Narrative beat:** *Model-generated code running inside your container is a security risk. There's a better way.*

**Action:** Click **"Code Interpreter: Sharpe"** → prompt feeds a real series of AGG month-end closes and asks for the monthly returns, annualized Sharpe ratio, and max drawdown.

**Expected result:** Agent writes Python, runs it in the AgentCore Code Interpreter sandbox, and returns the computed Sharpe ratio and max drawdown.

"The agent submitted that Python to the **AgentCore Code Interpreter** — a managed, isolated environment with resource limits and network restrictions, not the agent container that holds your credentials and IAM role. Running model-generated code inside your container — which some frameworks do as a fallback — is a meaningful risk. This keeps the boundary clean, and it lets a PM run real analytics (Sharpe, drawdown, duration) on demand."

---

## Act 6 — Memory: The Agent Remembers

**Narrative beat:** *A new conversation that forgets everything isn't an assistant — it's a stateless function.*

**Action:** Click **"Memory: Store"** → *"Remember that I manage the Core Bond Fund and Short Duration Income Fund, and my benchmark is the Bloomberg US Aggregate."* Then click **"New Session"**, then **"Memory: Recall"** → *"Which funds do I manage and what's my benchmark?"*

**Expected result:** In a fresh session (no carried-over history), the agent recalls the funds and benchmark from long-term memory.

> **Teaching point:** "Two mechanisms. **Short-term memory** is the in-process message list, scoped to a session. **Long-term memory** is the AgentCore Memory service: the agent writes events after each turn, the service extracts semantic facts, and those are retrieved on the next conversation. Alice's mandate is still there next week, in a different session."

> **Async caveat:** extraction takes ~30–60s. If recall shows nothing, the fact isn't indexed yet — do 'Store' a minute before 'Recall' in a live demo.

---

## Act 7 — Identity 3LO: The Agent Trades *On Behalf Of* You

**Narrative beat:** *This is where it gets real for agentic security in financial services.*

"Everything so far had the agent calling tools it's authorized to call. But a downstream system that books trades needs to know *who* authorized the action — not just that an agent did it. The Portfolio API is a separate service with its own OAuth2 resource server. The agent is not Alice — it can't just present her credentials. We need **three-legged auth**: the agent acts, but only with a token Alice herself delegated."

**Action:** Click **"Positions 3LO: View"** → *"Show me the positions in my Core Bond Fund."*

**First-time result:** Agent returns an authorization link ("To access your fund positions I need your authorization…"). Alice clicks it → Cognito Hosted UI → consents → `/oauth/callback` binds the grant. Re-send the prompt.

**Second-time result:** Agent returns the Core Bond Fund's positions (ticker → target allocation) from the Portfolio API.

> **The centerpiece:** "The token the agent used was a **user-delegated OAuth token** issued by AgentCore Identity, scoped to Alice's identity and the `portfolio-api/read` scope. The Portfolio API accepted it because it trusts AgentCore Identity as its authorization server. In the CloudWatch trace you'll see the **agent's workload identity** and Alice's **user subject** as distinct principals: 'the agent acted on behalf of Alice,' not 'Alice acted directly.' In a regulated shop, that distinction is the audit trail."

### Act 7b — Scoped consent: read is not trade (the encore)

**Action:** Click **"Trade 3LO: Execute"** → *"Buy and increase TLT to a 20% target allocation in my Core Bond Fund."*

**Expected result:** The agent prompts for authorization **again** — even though Alice just consented for the position lookup.

> **Lean into it:** "Why ask again? Because this isn't the same request. The lookup needed `portfolio-api/read`. Executing a trade needs `portfolio-api/trade`. AgentCore Identity caches consent **per scope set** — read consent does **not** silently grant trade. This is least-privilege enforced at the token vault: a read grant can never be escalated into trade authority without the user explicitly approving the trade scope. Once she does, the trade books — and the **Portfolio API Lambda writes an audit log line** with the PM, fund, instrument, side, and before/after allocation. That's the provable, per-action attribution you need when an agent moves money."

### Act 7c — M2M: The Agent Acts *As the Firm*

**Action:** Click **"Licensed Market Feed"** → *"Pull the firm's licensed market-data vendor feed for the current Treasury curve…"*

**Expected result:** The curve comes back immediately — **no consent prompt this time.**

> **Lean into it:** "Notice what *didn't* happen: Alice wasn't asked to authorize anything. That's the point. A market-data vendor doesn't license Alice — it licenses *Meridian*. So the agent authenticated with a **machine-to-machine** token: client-credentials, minted by AgentCore Identity for the firm's *application* identity, carrying no user subject at all. Three-legged OAuth was 'the agent acts on behalf of *you*.' This is 'the agent acts as *the firm*.' Same Identity service, opposite credential shape — and each is correct for its downstream. The vendor's audit log records the *application* that pulled the data, not a person, which is exactly right."

### Act 7d — API-key vault: No Plaintext Secrets

**Action:** Click **"Live CPI & Fed Funds"** → *"Pull the latest CPI print and the current fed funds rate from FRED…"*

**Expected result:** Live macro prints come back, sourced from FRED.

> **Lean into it:** "Not everything speaks OAuth. FRED wants a plain API key. The naive way is to bake that key into the agent as an environment variable — and now your secret is sitting in a container image, a config file, a log. Instead, the key lives in the **AgentCore Identity API-key vault**. The tool fetches it *at call time* with one decorator — `@requires_api_key` — and it never touches the agent's environment. The outbound secret is managed exactly like the OAuth credentials: centrally, rotatably, out of the code."

---

## Act 8 — Evaluations: Grading the Agent, Live

**Action:** Point at the **Evaluations strip** under the observability strip. After a turn, click **"Evaluate this turn."**

- The strip shows built-in scores (helpfulness, correctness, tool selection) **and** a custom **Governance** verdict — *did the agent respect access controls / refuse restricted data?* On the policy-blocked vault turn from Act 2, the governance judge reads **COMPLIANT** (it refused, cleanly).
- These aren't narrated: an **online-eval config** samples live spans continuously; scores land in CloudWatch (`Bedrock-AgentCore/Evaluations`) and read back into the strip. The custom judge is an LLM-as-judge you defined in one CLI call.

## Act 9 — Registry: A Governed Catalog With Real Approval

**Action:** Open **Registry** (top bar). Sign in as `admin@demo.com`.

- The desk agents + the governed MCP tool surface are catalogued. Records start in **DRAFT**. As admin, **Submit → Approve** one and watch its status move `DRAFT → PENDING_APPROVAL → APPROVED`; only then does it appear in **search**.
- A non-admin can search/browse but **cannot** curate — the curate call is rejected server-side on the verified `cognito:groups`, same as Access Control.

## Act 10 — Harness: The Same Tools, as Config Not Code

**Action:** Open **Express** (top bar). Ask *"Summarize my mandate and list the governed tools you can use."*

- *Meridian Express* answers using the **same** Gateway tools and the **same** AgentCore Memory the desks use — but it is **configuration**, not code: a model + system prompt + tool references, run by the managed harness loop. No container, no orchestration code.
- The talking point: the desks run a hand-built 11-agent Strands swarm on **Runtime** (full control); Express is the **Harness** path (declare config, ship in minutes). Same governed substrate underneath — you pick the trade-off.

## Act 11 — Optimization: Improve, Safely

**Action:** Open **Optimize** (admin). Click **Generate** (a recommendation), then note the **A/B experiment** card.

- **Recommendation:** analyzes real traces against the governance judge and proposes an improved system prompt — off the hot path, safe to run anytime.
- **A/B experiment:** the card reads **OFF · 100% control — live path unchanged (safety valve)**. Starting it flips the runtime flag; new sessions split 50/50 control vs. a treatment configuration bundle, each scored by online eval. Stress the safety valve: the live path is byte-identical until an admin explicitly starts the experiment.

---

## The Observability Payoff

**Action:** Open **CloudWatch → GenAI Observability → Bedrock AgentCore** (your region).

- **Agent View** → token usage, latency, error rate (ADOT auto-instrumentation; no code in our agent).
- **Sessions** → open the session with the policy-blocked vault call → the span shows the Cedar decision `PolicyEffect: Forbid`; the model never got the result.
- **Spans to call out:** `AgentCore.Runtime.Invoke`, `AgentCore.Policy.AuthorizeAction` (the Cedar evaluation), `AgentCore.Gateway.InvokeTool.secure-vault___secure_vault`, and on the 3LO trade, `GetResourceOauth2Token` (`oauth2.flow=USER_FEDERATION`) carrying the workload identity + Alice's subject. On the M2M market-data call the same `GetResourceOauth2Token` span shows `oauth2.flow=M2M` with **no** user subject (the agent acted as the firm), and the FRED call surfaces a `GetResourceApiKey` span (the key came from the vault, not the environment).
- The **trade audit log** for the `agentcore-demo-grades-api` Lambda shows the `"audit":"trade_execute"` record — your evidence that Alice delegated authority, the agent used it, and the trade booked at this timestamp.

---

## Close — What We Just Built

"Alice logged in once. From that single session she: pulled a **restricted compliance value** through a policy-controlled Gateway; got her **own funds** without the agent seeing another PM's data; **browsed live Treasury yields** in an isolated managed browser; **ran portfolio analytics** in a sandbox that can't touch her credentials; had the assistant **remember her mandate** across sessions; **executed an audited trade on her behalf** with a delegated token she explicitly authorized; watched the agent pull a **licensed vendor feed as the firm** over a machine-to-machine credential with no user involved; and got **live macro data** with an outbound API key that never left the Identity vault.

One agent, and the **complete Identity picture**: on-behalf-of the user (3LO), as the firm (M2M), and an API-key vault for outbound secrets — plus per-user isolation, Gateway, Policy, Browser, Code Interpreter, and Memory. And around it, the **operate-in-production plane**: Evaluations grading every turn (including a governance judge), a governed Registry with a real approval workflow, a config-only Harness companion over the same tools, and Optimization closing the loop with recommendations + a safety-valved A/B. None required us to write auth middleware, manage browser infrastructure, build a session store, wire an audit trail, or stand up an eval harness. That's AgentCore — **12 of its 13 services, live** — the operational substrate so you focus on what the agent *does*, not what it *runs on*."

---

## Appendix: Presenter Logistics

### Timing guide
| Segment | Time |
|---|---|
| Cold open + architecture | 2–3 min |
| Gateway (restricted list) | 2 min |
| Policy toggle (block + restore) | 3 min |
| Identity (Alice's funds) | 2 min |
| Browser (Treasury yields) | 2 min |
| Code Interpreter (Sharpe/drawdown) | 2 min |
| Memory (store → new session → recall) | 3 min |
| 3LO positions + trade (consent ×2) | 5 min |
| M2M market feed + API-key macro (no consent) | 2 min |
| Observability (console) | 3–4 min |
| Close | 1–2 min |
| **Total** | **~27–32 min** |

### Pre-demo checklist (run 10 minutes before going live)
- [ ] **Policy toggle is ON** — sidebar shows `Vault Access: Enabled`.
- [ ] **Pre-consent the 3LO grants for Alice** — run "Positions 3LO: View" *and* "Trade 3LO: Execute" once and complete both consents. The grants persist; the live demo skips straight to results. If you skip this, budget ~90s per live consent.
- [ ] **M2M + API-key need NO pre-consent** — "Licensed Market Feed" and "Live CPI & Fed Funds" work on the first click (no user consent by design). Worth stating out loud as the contrast to 3LO. (Ensure `.fred-key` was present at deploy so the FRED vault is populated; otherwise the macro tool reports unconfigured.)
- [ ] **Seed a memory** ≥60s before recall (extraction is async).
- [ ] **Hard-refresh** if you redeployed (CloudFront caches the frontend).
- [ ] **Confirm CloudWatch Transaction Search is ON** in the account.
- [ ] **Reset between runs** if needed: invoke the `agentcore-demo-reset` Lambda to wipe demo memories and restore baseline positions.

### If a live call is slow
- Gateway/vault: 2–4s. Narrate SigV4 signing + Cedar evaluation.
- Browser (Treasury page): 10–20s — Playwright renders the page, waits for network idle, plus a recording flush. Explain the CDP architecture.
- 3LO on a cold consent: 10–15s for the Cognito redirect round-trip. Walk the flow on a slide while it runs.

### Naming notes (cosmetic vs. wiring)
- The HTTP route path stays `/grades` and the DynamoDB table is `agentcore-demo-grades` — internal infrastructure names kept stable to preserve wiring; never shown to the user. The **data** they carry is fund positions, and the OAuth scopes are `portfolio-api/read` and `portfolio-api/trade`.
- The console policy may show a legacy name; the Cedar statement is what enforces. Fresh deploys create `SecureVaultAccess`.

### "Alice did it" vs. "the agent did it for Alice"
> "Alice is the **resource owner**. The agent is the **client** acting under a delegated grant. The token presented to the Portfolio API was issued by AgentCore Identity's OAuth2 authorization server — not Cognito directly. The Portfolio API is a **resource server** trusting AgentCore Identity as its issuer. So it sees: issued-by=AgentCore Identity, subject=Alice, scope=portfolio-api/trade, authorized-by=Alice (at consent). The agent's workload identity appears separately in the trace as the entity that requested the token. Two facts: *who authorized* and *who executed*. Both captured."
