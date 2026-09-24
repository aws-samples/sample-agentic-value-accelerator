# Architecture Invariants — KYC Governance Console

**Purpose:** Non-negotiable patterns. Every spec, every PR, every deploy MUST satisfy these. Kiro must reference this doc before implementing anything.

---

## 1. Authentication & Authorization at the Edge

- **ALL API endpoints** use API Gateway authorizers (Cognito or Lambda authorizer). NEVER validate auth tokens, API keys, or credentials inside Lambda business logic.
- The Lambda function assumes the request is already authenticated by the time it executes.
- No `x-api-key` checks, no `Authorization` header parsing, no Cognito token validation in Lambda handler code.
- **Why:** Separation of concerns. Auth is infrastructure, not application logic. Mixing them makes security posture unauditable and creates inconsistency across endpoints.

## 2. Governance Enforcement is External

- The agent runtime MUST NOT contain fallback logic that replicates governance decisions.
- All governance checks (deterministic, sanctions/PEP, policy-cascade, LLM-judge) are called as external HTTP services.
- If `GOVERNANCE_MODE=external` and a service is unreachable, the agent FAILS LOUDLY (returns error/escalates). It does NOT silently self-govern with in-process logic.
- **Why:** If the agent can produce its own governance decision, there is no enforcement boundary. The agent is self-governing. Raphael: "we cannot rely on hardcoded gates in the agent."

## 3. Cedar/AVP is the Policy Engine

- Policy decisions (APPROVE / ESCALATE / BLOCK) are determined by Cedar policies evaluated via Amazon Verified Permissions.
- The `policy-cascade` service reads Cedar policy context at evaluation time — NOT hardcoded thresholds in environment variables.
- Slider/config changes write to the Cedar policy store (AVP) or a config store that AVP reads. This makes decisions runtime-configurable without code redeployment.
- **Why:** "Config not code." If policy thresholds are baked into Lambda env vars, changing them requires a redeploy. That's code, not config.

## 4. No localStorage for Persistent State

- Browser `localStorage` is for UI preferences (theme, collapsed panels) ONLY.
- Any state that affects governance decisions, policy configuration, or business logic MUST be persisted server-side (DynamoDB, AVP policy store, etc.).
- Sliders, toggles, and config controls that affect agent behaviour MUST POST to a backend endpoint.
- **Why:** localStorage is per-browser, ephemeral, and invisible to the backend. If a slider "changes policy" but only writes localStorage, it's theater.

## 5. No Hardcoded Thresholds in Services

- Risk thresholds, score boundaries, jurisdiction lists, and policy parameters MUST be read from a config store (DynamoDB or AVP context) at request time.
- They MUST NOT be baked into Lambda environment variables or hardcoded in source.
- **Why:** Environment variables require redeployment to change. That violates "config not code" and makes the demo's configurability claim false.

## 6. Infrastructure Durability

- All deployed resources MUST be reproducible from IaC (CloudFormation/Terraform) without manual intervention.
- If a stack is deployed with specific parameter values (e.g. governance URLs), those values MUST be in tfvars/parameter files committed to git — not just passed ad-hoc on the CLI.
- A clean `terraform apply` or `deploy_all.sh` from the repo MUST produce a working system without secret knowledge.
- **Why:** "Works on my machine" deployments are tech debt bombs. If creds expire and someone redeploys from the repo, nothing should regress.

## 7. Separation of Control Plane and Data Plane

- Control-plane logic (auth, policy evaluation, governance decisions, config management) lives OUTSIDE the agent/application code boundary.
- Data-plane logic (KYC processing, document analysis, customer evaluation) lives INSIDE the agent.
- The agent calls control-plane services; it does not implement them.
- **Why:** This is the fundamental architecture principle of the demo. The entire story is "agents run autonomously but are externally governed." If control-plane logic leaks into the agent, the story is false.

---

## Verification Checklist (apply to every change)

Before any spec is marked "done":

- [ ] No auth logic in Lambda business code?
- [ ] All governance calls go to external services (no in-process fallback when GOVERNANCE_MODE=external)?
- [ ] Policy decisions read from Cedar/AVP or config store (not env vars or hardcoded values)?
- [ ] Persistent state stored server-side (not localStorage)?
- [ ] All parameters in IaC with committed values (not ad-hoc CLI)?
- [ ] Agent cannot produce governance decisions independently?

---

*Created: 2026-07-22. Triggered by: repeated architectural violations caught by Raphael Fuchs across multiple sessions.*
