# KYC - Controlled Quality Output

Governed KYC assessment for corporate banking onboarding. Two specialist agents (Credit
Analyst, Compliance Officer) produce findings; a **non-bypassable governance layer** then
applies deterministic financial checks, sanctions/PEP screening, a three-layer policy
cascade (ORG → APP → REQUEST, most-restrictive-wins) and an LLM-as-Judge quality score to
reach the final **APPROVE / ESCALATE / DECLINE / BLOCK** decision.

The point of the demo: **the LLM advises, deterministic controls decide.**

## Layout

```
agent/
  app_src/                              shared agent runtime code (base classes, tools, utils)
  use_cases/kyc_governance_insights/src/
    langchain_langgraph/                the implementation (LangGraph only)
  docker/                               agent container images
iac/terraform/                          self-contained AgentCore IaC (infra / runtime / ui)
deploy/
  governance/                           4 governance microservices + policy config (agent-facing)
  console-services/                     console backends behind one gateway (browser-facing)
ui/                                     React console (Basic + Advanced modes)
data/samples/kyc_governance_insights/   10 sample customers (CUST001-009, CUST047)
docs/                                   architecture, design decisions, runbooks
```

### Why `agent/app_src` and `agent/use_cases/<id>/src` look unusual

Those paths are the **container contract** in `agent/docker/Dockerfile.agentcore`: `app_src/`
is copied to `/app` (so `base.*`, `tools.*`, `utils.*` resolve as top-level modules) and the
selected framework directory is copied to `/app/use_cases/kyc_governance_insights/`. Keeping
the layout means the application code needs no import rewrites.

> **Vendored code — tracked debt.** `agent/app_src`, `agent/docker` and `iac/terraform` were
> copied from `applications/fsi_foundry/foundations/` when this project moved out of FSI
> Foundry, so that a reference implementation is self-contained (the convention for this
> directory). The trade-off is real: these copies will **not** inherit future fixes to
> Foundry foundations. If foundations is ever extracted into a shared library, this project
> should consume it instead.

## Deploy

Requires AWS credentials, Terraform >= 1.0, Docker/Finch, Node >= 22, Python >= 3.11.

```bash
./deploy.sh                 # full stack, in dependency order
./deploy.sh --skip-agent    # console + governance services only
./destroy.sh                # tear down
```

Order matters and `deploy.sh` enforces it:

1. **Governance services** (`deploy/governance/deploy_all.sh`) — publishes the five Lambda
   function names to SSM under `governance_ssm_prefix`. These services have no HTTP endpoint;
   the agent invokes them directly and IAM is the authorisation boundary.
2. **Console services** (`deploy/console-services/deploy_all.sh`) — tables, proxies, Cedar
   policy store, the consolidated gateway and the shared edge authorizer.
3. **Agent** (`iac/terraform`) — infra → container build/push → runtime. The runtime resolves
   the governance function names from SSM, so step 1 must come first.
4. **Seeds** — `seed_evaluations.py`, `seed_phase3.py`.
5. **UI** — build, sync to the site bucket, invalidate CloudFront.

### Governance modes

`GOVERNANCE_MODE=external` (default) makes the deployed governance services authoritative:
if one is unreachable the client **fails closed** (the policy cascade returns ESCALATE)
rather than silently self-governing in-process. `local` selects the in-process equivalents
for standalone/dev runs.

**A runtime deployed with `external` and blank governance function names will not APPROVE
anything.** Publish the SSM parameters (step 1) before deploying the runtime. The same applies
if the runtime role lacks `lambda:InvokeFunction` on the four governance functions.

## Verify

```bash
# Agent: the two canonical scenarios
#   CUST001 -> APPROVE (low risk)   CUST047 -> BLOCK (OFSI sanctions match on the UBO)
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn <arn> \
  --qualifier DEFAULT --content-type application/json --accept application/json \
  --payload fileb://payload.json /tmp/out.json

# Console services (through CloudFront, no credentials in the browser)
curl -s -o /dev/null -w '%{http_code}\n' https://<dist>.cloudfront.net/svc/health
```

## Architecture and design notes

Start with `docs/assessment-flow.md` — the end-to-end assessment flow, the prompts, and the
live console-verification layer (what is real versus staged). Then:

| Doc | Topic |
|---|---|
| `docs/DESIGN_DECISION_API_CONSOLIDATION.md` | Browser → CloudFront `/svc/*` → one gateway; no API key in the browser |
| `docs/DESIGN_DECISION_CEDAR_SHADOW_MODE.md` | Why the policy cascade shows-and-decides but never runtime-aborts |
| `docs/DESIGN_DECISION_PHASE3_CONTROLS_INLINE.md` | Reading governance data live, with fixtures as the resilience fallback |
| `docs/advanced-mode-inventory-and-priorities.md` | Every Advanced-mode surface, where it lives, and refinement priorities |
| `docs/KNOWN_GAPS.md` | Current honest gaps |

## Known gaps

- Cedar/AVP is **not** the runtime decision path: `policy-cascade` computes the tri-state
  verdict in code, while `is_authorized` is called only by the console's cedar proxy. The
  Cedar `APP-006` threshold and the config-store threshold can therefore drift.
- Basic-mode live checks run on scenario **fixtures**, not the real assessment output — they
  prove the controls work, they do not gate the decision.
- Edge auth for the console is HTTP basic-auth, not the `jwt_auth` CloudFront function used
  by the FSI Foundry UIs.

## Related

- [Reference Implementations](../README.md)
- [FSI Foundry](../../fsi_foundry/) — where this use case originally lived (as B11)
