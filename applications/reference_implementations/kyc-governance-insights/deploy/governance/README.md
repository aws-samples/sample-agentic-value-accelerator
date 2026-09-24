# KYC Controlled Quality Output — Governance Services

This directory contains the four **governance controls** that make this use case
distinct from `kyc_banking`. Each is an independent AWS service (HTTP API →
Lambda) that the agent orchestrator calls after the specialist agents finish
their analysis. Together they form a non-bypassable governance layer: even when
the agents recommend approval, an ORG-layer hard gate (sanctions match,
prohibited jurisdiction) can block the onboarding.

| Service | Directory | What it does | Route |
|---|---|---|---|
| Deterministic check | `deterministic-check/` | Recomputes financial ratios from raw statements and compares to the agent's claimed values (catches hallucinated numbers). | `POST /deterministic-check` |
| Sanctions / PEP | `sanctions-pep/` | Fuzzy-matches the entity name against OFAC/OFSI + PEP watch lists held in DynamoDB. | `POST /sanctions-check`, `POST /pep-check` |
| Policy cascade | `policy-cascade/` | Evaluates the 3-layer ORG→APP→REQ policy cascade, most-restrictive-wins (BLOCK > ESCALATE > ALLOW). | `POST /policy-cascade` |
| LLM-as-Judge | `llm-judge/` | Scores the agent's assessment on 5 quality dimensions via Bedrock Claude Haiku. | `POST /llm-judge` |

## Architecture: services + in-process fallback

The use case works **with or without** these services deployed:

- **Deployed** → the orchestrator calls the services via the five environment
  variables below. This is the production-faithful path (DynamoDB watch lists,
  a real Bedrock judge call, independently deployable/scalable services).
- **Not deployed** (env vars empty) → the orchestrator uses the equivalent
  in-process logic in `src/langchain_langgraph/governance.py`. The
  thresholds and rules are identical, so the demo scenarios still produce the
  same decisions. The only degraded control is the LLM-judge, which returns
  neutral scores flagged `unscored` (no local model call).

This mirrors how `kyc_banking` deploys the *core* assessment; the governance
services are an additive companion stack.

## Deploy

Prereqs: AWS credentials for the target account, `aws` CLI, `python3` with
`boto3` (for seeding DynamoDB).

```bash
cd deploy/governance
./deploy_all.sh --prefix kyc-gov --region us-east-1
```

The script deploys all four CloudFormation stacks, seeds the sanctions/PEP
tables from `sanctions-pep/seed_lists.json`, and prints the five function names.

Each stack is self-contained (inline Lambda code, no S3 packaging step) and can
also be deployed individually:

```bash
aws cloudformation deploy \
  --stack-name kyc-gov-deterministic-check \
  --template-file deterministic-check/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides ResourcePrefix=kyc-gov
```

## Wire the URLs into the runtime

The AgentCore runtime template
(`foundations/iac/agentcore/runtime/agentcore_runtime.yaml`) exposes five
parameters — pass the URLs printed by `deploy_all.sh` as parameter overrides
when deploying the `kyc_governance_insights` runtime:

| Runtime parameter | Env var seen by the container | Source output |
|---|---|---|
| `DeterministicCheckFunctionName` | `DETERMINISTIC_CHECK_FUNCTION` | `kyc-gov-deterministic-check` → `DeterministicCheckFunctionName` |
| `SanctionsCheckFunctionName` | `SANCTIONS_CHECK_FUNCTION` | `kyc-gov-sanctions-pep` → `SanctionsCheckFunctionName` |
| `PepCheckFunctionName` | `PEP_CHECK_FUNCTION` | `kyc-gov-sanctions-pep` → `PepCheckFunctionName` |
| `PolicyCascadeFunctionName` | `POLICY_CASCADE_FUNCTION` | `kyc-gov-policy-cascade` → `PolicyCascadeFunctionName` |
| `LlmJudgeFunctionName` | `LLM_JUDGE_FUNCTION` | `kyc-gov-llm-judge` → `LlmJudgeFunctionName` |

These are Lambda **function names**, not URLs. The services have no HTTP endpoint:
the AgentCore runtime invokes them directly and its IAM role is the only thing that
authorises the call. They previously sat behind public API Gateway endpoints with no
authorizer, so anyone who discovered a URL could screen names against the sanctions
list, read the match thresholds out of the responses, or run the LLM judge on this
account's Bedrock budget.

Under `GOVERNANCE_MODE=external` (the default) a missing or unreachable function fails
**closed** — the policy cascade returns ESCALATE rather than falling back to in-process
logic, so the agent can never self-govern.

## Thresholds (kept in sync with `src/.../governance.py`)

- Sanctions fuzzy match ≥ **0.70** → match (SequenceMatcher ratio)
- PEP fuzzy match ≥ **0.60** → match
- Risk score ≥ **60** → ESCALATE, ≥ **80** → BLOCK
- Deterministic tolerances: ratios ±0.05, net margin ±0.01, payment % ±1.0

## Test after deploy

There is no URL to curl. Invoke the functions directly — the caller needs
`lambda:InvokeFunction` on them (the runtime role has it; an operator normally has it
via their admin role):

```bash
# Sanctions — Omega should match (score 1.0 on exact name)
aws lambda invoke --function-name "$SANCTIONS_CHECK_FUNCTION" \
  --payload '{"name":"Omega Trading Ltd"}' /dev/stdout | jq

# Policy cascade — a sanctions hit blocks regardless of risk
aws lambda invoke --function-name "$POLICY_CASCADE_FUNCTION" \
  --payload '{"riskScore":81,"sanctionsHit":true,"jurisdiction":"GB"}' /dev/stdout | jq
```

The handlers accept the payload either at the top level (direct invoke, as above) or
nested under `body` (the API Gateway proxy shape), so older callers still work.
