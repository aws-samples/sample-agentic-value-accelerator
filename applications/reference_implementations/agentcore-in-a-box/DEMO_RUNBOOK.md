# Meridian Asset Management — AgentCore Demo Runbook

**Capabilities covered.** Gateway, Runtime, Policy, Identity + 3LO, Browser, Code Interpreter, Memory, the policy toggle, and observability — all driven from the chat UI.

## Access

| | |
|---|---|
| **Demo URL** | the CloudFront URL printed by `deploy.sh` (stand up your own instance) |
| **Region** | your target region (default `us-west-2`) |
| **Alice** | `alice@demo.com` / `Demo1234` — PM, Investment-Grade Credit: Core Bond Fund, Short Duration Income Fund |
| **Bob** | `bob@demo.com` / `Demo1234` — PM, Government & Rates: Government Securities Fund |

> **Note:** Deploy your own isolated instance with the steps in the [README](README.md) (`deploy.sh`); it prints the CloudFront URL and creates the seeded PM users (Alice & Bob) and their funds automatically.

Hard-refresh the page if you deployed recently (CloudFront cache).

## Pre-demo checklist
- Policy toggle is **ON / enabled** (`permit`) — the default. Vault works.
- Runtime is **READY** (check in the AgentCore console if a demo was idle a while).
- Gateway targets `secure-vault` + `user-data-lookup` are **READY**.
- Observability is flowing (spans visible in CloudWatch GenAI Observability / X-Ray).

## Suggested demo flow (use the Quick Prompt buttons in the left panel)

1. **Gateway + Policy (the headline)** — click **"Gateway: Restricted List"** ("What's on the firm's restricted trading list right now?").
   - With the toggle **ON**: agent returns the restricted list via the Secure Vault Lambda (Gateway/MCP tool).
   - Flip the **Secure Vault** toggle **OFF** (Cedar policy → `forbid`), ask again:
     agent says it's **blocked by policy and cannot retrieve or invent it**.
   - This is the key moment: the value is unknowable to the model, so the block is real.
     Flip back ON when done.
2. **Identity** — **"Identity: My Funds"**. Alice sees her PM profile + funds (Core Bond Fund, Short Duration Income Fund).
   Log in as Bob to show different data (Government Securities Fund). Data is keyed by Cognito `sub`.
3. **Identity 3LO (on-behalf-of)** — **"Positions 3LO: View"** then **"Trade 3LO: Execute"**. The agent calls the
   downstream Portfolio API *on the PM's behalf* via 3-legged OAuth; first use prompts a one-time consent,
   and viewing vs. trading are **separate** consents (read can't escalate to trade). Each trade is audit-logged.
4. **Browser** — **"Browser: Treasury Yields"**. Live US Treasury par-yield-curve fetch via AgentCore Browser (Playwright/CDP).
5. **Code Interpreter** — **"Code Interpreter: Sharpe"**. Runs Python in the sandbox (computes Sharpe ratio + max drawdown from real AGG month-end closes).
6. **Memory** — **"Memory: Store"** (the PM's funds + benchmark) then start a **New Session** and **"Memory: Recall"**.
   Note: extraction is async (~30–60s), so a just-stored fact may not appear in an
   immediate recall — recall surfaces previously-extracted long-term memories.

## Observability (show in AWS Console)
**CloudWatch → GenAI Observability → Bedrock AgentCore** (us-west-2).
- **Agent View** → `agentcore_demo_agent_v2`: token usage, latency, error rate.
- **Sessions** → pick a session → open a **Trace** → span timeline.
- Spans to point out: `AgentCore.Runtime.Invoke`, **`AgentCore.Policy.AuthorizeAction`**
  (the Cedar decision itself), `AgentCore.Gateway.InvokeTool.secure-vault___secure_vault`.
- Lambda spans (vault, userdata, policy-toggle) propagate into the same traces.

## Gotchas / talking points
- **Policy name** in the console is still `MathToolAccess-io4iau3thk` (cosmetic — it gates
  the vault tool; the Cedar statement is what enforces).
- The policy toggle calls the **JWT-authorized `/policy/toggle` HTTP endpoint**, isolated
  from the public chat handler (the admin policy permission isn't on the chat path).
- Memory extraction is asynchronous — don't promise instant recall of a fact stored seconds ago.

## If something looks off
- Toggle does nothing → check `agentcore-demo-policy-toggle` Lambda has
  `POLICY_ENGINE_ID` + `POLICY_ID` env vars set.
- Vault always blocked → policy stuck on `forbid`; re-enable via the toggle.
- No traces in console → confirm CloudWatch Transaction Search is ON (it is, account-wide).
