#!/usr/bin/env bash
#
# Deploy the KYC Controlled Quality Output CONSOLE SERVICES fleet — the backends that
# turn the full governance console's mock surfaces into live data:
#   metrics-proxy, cedar-proxy, cedar-gateway, evaluations, hitl,
#   grounding-proxy, agent-registry, registry-proxy.
#
# Each service is a self-contained CloudFormation stack (inline Lambda). This
# script deploys them in dependency order, seeds the registry + evaluation
# definitions, and prints the URLs to wire into the console UI's
# runtime-config.json (metrics_api_url, cedar_api_url, registry_api_url,
# hitl_api_url, grounding_api_url, tenant_id).
#
# Auth is the CloudFront-injected x-origin-verify header validated by the shared
# API Gateway authorizer (invariant #1). There is NO API key — the old
# x-api-key path was removed when auth moved to the edge.
#
# Usage:
#   ./deploy_all.sh [--prefix kyc-gov] [--region us-east-1] \
#       [--allowed-origin URL] [--runtime-id ID]
#
set -euo pipefail

PREFIX="kyc-gov"
REGION="${AWS_REGION:-us-east-1}"
ALLOWED_ORIGIN="*"
# Resolved from AgentCore below unless --runtime-id is given. This used to default to a
# hardcoded runtime id from one specific account, which is account-specific state in
# committed config (architecture invariant MUST #2) and silently wires the console to a
# runtime that does not exist in any other account — or, after a teardown, to one that no
# longer exists anywhere.
RUNTIME_ID=""
RUNTIME_NAME_PREFIX="ava_kyc_governance_insights"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --allowed-origin) ALLOWED_ORIGIN="$2"; shift 2 ;;
    --runtime-id) RUNTIME_ID="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve the runtime the console should talk to. The agent must already be deployed —
# deploy.sh orders the agent before the console services for exactly this reason.
if [ -z "$RUNTIME_ID" ]; then
  RUNTIME_ID=$(aws bedrock-agentcore-control list-agent-runtimes --region "$REGION" \
    --query "agentRuntimes[?starts_with(agentRuntimeName,'${RUNTIME_NAME_PREFIX}')].agentRuntimeId | [0]" \
    --output text 2>/dev/null || true)
  [ "$RUNTIME_ID" = "None" ] && RUNTIME_ID=""
fi

if [ -z "$RUNTIME_ID" ]; then
  echo "ERROR: no AgentCore runtime found with a name starting '${RUNTIME_NAME_PREFIX}' in ${REGION}." >&2
  echo "       Deploy the agent first, or pass --runtime-id explicitly. Continuing would wire" >&2
  echo "       the console services to a nonexistent runtime and every assessment would fail." >&2
  exit 1
fi

echo "==> Console services (prefix=${PREFIX}, region=${REGION}, runtime=${RUNTIME_ID})"

deploy() {
  local name="$1" dir="$2"; shift 2
  local tmpl="${HERE}/${dir}/template-cfn.yaml"
  [ -f "$tmpl" ] || tmpl="${HERE}/${dir}/template.yaml"
  echo "--> ${name}"
  aws cloudformation deploy \
    --region "${REGION}" \
    --stack-name "${PREFIX}-${name}" \
    --template-file "${tmpl}" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --no-fail-on-empty-changeset \
    "$@"
}

out() { aws cloudformation describe-stacks --region "${REGION}" --stack-name "$1" \
  --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text 2>/dev/null; }

# 0. Shared edge authorizer FIRST. The proxy stacks Fn::ImportValue its ARN
#    (kyc-origin-verify-authorizer-arn) to wire the API Gateway origin-verify
#    authorizer in IaC (invariants #1 auth-at-edge + #6 durability), so it must
#    exist before them. Auth is now enforced at the gateway, not in Lambda code.
#
#    ADOPT, don't duplicate: the authorizer's physical names (function, role, log
#    group, the kyc/origin-verify secret) are fixed in the template, so deploying a
#    SECOND stack that declares them fails — CloudFormation cannot create resources
#    that already exist, and an account-level
#    AWS::EarlyValidation::ResourceExistenceCheck hook rejects the whole changeset.
#    That happens whenever the authorizer was first deployed under a different stack
#    name (e.g. by origin-verify-authorizer/phase2-deploy.sh, which uses
#    "kyc-origin-verify-authorizer" rather than the "${PREFIX}-" name used here).
#    If the export already exists, whoever owns it is authoritative — the proxy
#    stacks resolve it via ImportValue either way — so skip this step.
#    Detection uses describe-stacks, NOT list-exports: the CodeBuild deployment role is
#    granted cloudformation:DescribeStacks but NOT ListExports, so an export lookup fails
#    there and (if its error is swallowed) silently falls through to deploying a duplicate.
#    Two names are checked because the authorizer may have been created either by this
#    script or by origin-verify-authorizer/phase2-deploy.sh.
#
#    A failure to DETERMINE the answer is fatal — we never guess and deploy (invariant #5).
auth_stack_status() {  # echoes status, returns 1 when the stack genuinely does not exist
  local name="$1" out rc
  out=$(aws cloudformation describe-stacks --region "${REGION}" --stack-name "${name}" \
        --query "Stacks[0].StackStatus" --output text 2>&1); rc=$?
  if [ "${rc}" -eq 0 ]; then printf '%s' "${out}"; return 0; fi
  case "${out}" in
    *"does not exist"*|*ValidationError*) return 1 ;;
  esac
  echo "ERROR: cannot determine whether stack '${name}' exists: ${out}" >&2
  exit 1
}

AUTH_ADOPTED=""
for candidate in "${PREFIX}-origin-verify-authorizer" "kyc-origin-verify-authorizer"; do
  if status=$(auth_stack_status "${candidate}"); then
    case "${status}" in
      *ROLLBACK_COMPLETE|REVIEW_IN_PROGRESS|*_FAILED)
        echo "    ignoring unusable authorizer stack ${candidate} (${status})" ;;
      *)
        AUTH_ADOPTED="${candidate}"; break ;;
    esac
  fi
done

if [ -n "${AUTH_ADOPTED}" ]; then
  echo "--> origin-verify-authorizer: adopting existing stack ${AUTH_ADOPTED}"
  echo "    (its physical resource names are fixed, so a second stack cannot create them)"
else
  deploy "origin-verify-authorizer" "origin-verify-authorizer"
fi

# 1. Tables first (registry table + evaluation tables) — other stacks reference them.
deploy "agent-registry" "agent-registry"
deploy "evaluations"    "evaluations" \
  --parameter-overrides Environment=production

# 2. Cedar policy store (Verified Permissions) BEFORE the cedar proxy that reads it.
deploy "cedar-gateway" "cedar-gateway" \
  --parameter-overrides Environment=production
POLICY_STORE_ID=$(out "${PREFIX}-cedar-gateway" GatewayPolicyStoreId)
echo "    cedar policy store: ${POLICY_STORE_ID:-<none>}"

# 2b. Load Cedar policies (policy-as-data). The 19 policies are NO LONGER inline
#     in cedar-gateway/template-cfn.yaml — load_policies.sh is now the sole
#     mechanism that populates the store from ./cedar-gateway/policies/*.cedar.
#
#     IDEMPOTENCY: load_policies.sh is additive (it creates, never reconciles).
#     To avoid stacking duplicates on every re-deploy, we only load when the
#     store is EMPTY. To intentionally refresh after editing .cedar files, clear
#     the store's static policies first, then re-run this script (or run
#     load_policies.sh manually).
if [ -z "${POLICY_STORE_ID:-}" ] || [ "${POLICY_STORE_ID}" == "None" ]; then
  echo "ERROR: cedar policy store id not found; cannot load policies." >&2
  exit 1
fi
#     A failed read is NOT an empty store. Swallowing the error here (2>/dev/null || echo 0)
#     made a permission failure look like a fresh store, so the script tried to load
#     policies into a store it could not even read (invariant MUST NOT #5).
#     Counting is done over policy IDs rather than `length(policies)` because the CLI
#     paginates and emits one length per page ("10" then "10" for 20 policies).
POLICY_LIST=$(aws verifiedpermissions list-policies \
  --policy-store-id "${POLICY_STORE_ID}" --region "${REGION}" \
  --query 'policies[].policyId' --output text 2>&1)
if [ $? -ne 0 ]; then
  echo "ERROR: cannot read Cedar policy store ${POLICY_STORE_ID} in ${REGION}." >&2
  echo "       ${POLICY_LIST}" >&2
  echo "       The deploying principal needs verifiedpermissions:ListPolicies/GetPolicyStore." >&2
  echo "       Refusing to guess the store is empty — that would stack duplicate policies." >&2
  exit 1
fi
EXISTING_POLICIES=$(printf '%s' "${POLICY_LIST}" | tr '\t' '\n' | grep -c '[^[:space:]]' || true)
if [ "${EXISTING_POLICIES}" == "0" ]; then
  echo "==> Loading Cedar policies into ${POLICY_STORE_ID} (store is empty)"
  bash "${HERE}/cedar-gateway/load_policies.sh" \
    --store-id "${POLICY_STORE_ID}" --region "${REGION}" --environment production
else
  echo "    store already has ${EXISTING_POLICIES} policies — skipping load"
  echo "    (to refresh: clear static policies then re-run, or run load_policies.sh manually)"
fi

# 2c. Resolve the Bedrock guardrail BY NAME, the same way the policy store is resolved from
#     a stack output. The templates used to carry a hardcoded guardrail id as a parameter
#     default and nothing ever overrode it, so every deployment inherited one account's id.
#     When that guardrail was deleted, /ar-check and /check-grounding began returning 500 on
#     every call — the handlers catch the ValidationException and answer 500, so there was no
#     Lambda error metric and nothing in the logs to point at it.
# The guardrail is APP-OWNED: this app creates it, versions it, and destroy.sh removes it.
# It is deliberately NOT a shared fleet resource — an earlier revision resolved a
# hand-created "fsi-agent-guardrail" by name and hard-failed when absent, which made a
# clean account impossible to deploy into without an undocumented manual CLI step
# (invariant MUST NOT #7: every resource reproducible from a documented deploy script).
GUARDRAIL_NAME="${GUARDRAIL_NAME:-${PREFIX}-guardrail}"
GUARDRAIL_ID=$(aws bedrock list-guardrails --region "${REGION}" \
  --query "guardrails[?name=='${GUARDRAIL_NAME}'].id | [0]" --output text 2>/dev/null || true)

if [ -z "${GUARDRAIL_ID}" ] || [ "${GUARDRAIL_ID}" == "None" ]; then
  echo "    no guardrail named '${GUARDRAIL_NAME}' — creating it"
  # Policy shape mirrors the canonical AVA definition in
  # platform/control_plane/templates/agent-guardrails/iac/terraform (content filters at
  # MEDIUM, PII anonymised, profanity on, contextual grounding 0.75 / relevance 0.70) so the
  # app does not invent its own thresholds. PROMPT_ATTACK output strength must be NONE.
  GUARDRAIL_ID=$(aws bedrock create-guardrail \
    --region "${REGION}" \
    --name "${GUARDRAIL_NAME}" \
    --description "Guardrail for ${PREFIX} (app-owned, created by deploy_all.sh)" \
    --blocked-input-messaging "I can't process this request due to content policy." \
    --blocked-outputs-messaging "I can't provide this response due to content policy." \
    --content-policy-config '{"filtersConfig":[
        {"type":"SEXUAL","inputStrength":"MEDIUM","outputStrength":"MEDIUM"},
        {"type":"VIOLENCE","inputStrength":"MEDIUM","outputStrength":"MEDIUM"},
        {"type":"HATE","inputStrength":"MEDIUM","outputStrength":"MEDIUM"},
        {"type":"INSULTS","inputStrength":"MEDIUM","outputStrength":"MEDIUM"},
        {"type":"MISCONDUCT","inputStrength":"MEDIUM","outputStrength":"MEDIUM"},
        {"type":"PROMPT_ATTACK","inputStrength":"HIGH","outputStrength":"NONE"}]}' \
    --sensitive-information-policy-config '{"piiEntitiesConfig":[
        {"type":"EMAIL","action":"ANONYMIZE"},
        {"type":"PHONE","action":"ANONYMIZE"},
        {"type":"CREDIT_DEBIT_CARD_NUMBER","action":"ANONYMIZE"}]}' \
    --word-policy-config '{"managedWordListsConfig":[{"type":"PROFANITY"}]}' \
    --contextual-grounding-policy-config '{"filtersConfig":[
        {"type":"GROUNDING","threshold":0.75},
        {"type":"RELEVANCE","threshold":0.70}]}' \
    --tags "[{\"key\":\"Project\",\"value\":\"${PREFIX}\"},{\"key\":\"ManagedBy\",\"value\":\"deploy_all.sh\"}]" \
    --query "guardrailId" --output text 2>&1) || GUARDRAIL_ID=""

  if [ -n "${GUARDRAIL_ID}" ] && [ "${GUARDRAIL_ID}" != "None" ] && \
     ! printf '%s' "${GUARDRAIL_ID}" | grep -qiE "error|denied|exception"; then
    echo "    created guardrail ${GUARDRAIL_ID}"
    # ApplyGuardrail needs an immutable version; DRAFT works but mutates under the console.
    aws bedrock create-guardrail-version --region "${REGION}" \
      --guardrail-identifier "${GUARDRAIL_ID}" \
      --description "Initial version for ${PREFIX}" >/dev/null 2>&1 \
      && echo "    published version 1" \
      || echo "    WARNING: could not publish a version — the console will read DRAFT" >&2
    # Creation is eventually consistent; give the version a moment to become READY.
    sleep 5
  else
    # NOT fatal. No governance service uses the guardrail — only the console's /ar-check and
    # /check-grounding do — so the agent's APPROVE/BLOCK path is unaffected. Deploying
    # without it is better than refusing to deploy anything at all.
    echo "    WARNING: could not create the guardrail (permissions?). Continuing." >&2
    echo "             The two console controls that use it will report themselves as" >&2
    echo "             not configured; the agent decision path is unaffected." >&2
    GUARDRAIL_ID=""
  fi
fi
# ApplyGuardrail needs a published version or DRAFT. Prefer the highest published version so
# the console is not reading a mutable draft; fall back to DRAFT when none is published.
if [ -n "${GUARDRAIL_ID}" ]; then
  GUARDRAIL_VERSION=$(aws bedrock list-guardrails --guardrail-identifier "${GUARDRAIL_ID}" \
    --region "${REGION}" --query "guardrails[?version!='DRAFT'].version" --output text 2>/dev/null \
    | tr '\t' '\n' | grep -E '^[0-9]+$' | sort -n | tail -1 || true)
  [ -n "${GUARDRAIL_VERSION}" ] || GUARDRAIL_VERSION="DRAFT"
else
  GUARDRAIL_VERSION=""
fi
echo "    guardrail: ${GUARDRAIL_NAME} -> ${GUARDRAIL_ID} version ${GUARDRAIL_VERSION}"

# Contextual grounding is what /check-grounding actually calls. A guardrail without it
# answers in a way the console cannot use, so say so rather than deploying a broken control.
if [ -n "${GUARDRAIL_ID}" ] && ! aws bedrock get-guardrail --guardrail-identifier "${GUARDRAIL_ID}" \
      --guardrail-version "${GUARDRAIL_VERSION}" --region "${REGION}" \
      --query "contextualGroundingPolicy.filters[].type" --output text 2>/dev/null \
      | grep -q GROUNDING; then
  echo "    WARNING: guardrail ${GUARDRAIL_ID} v${GUARDRAIL_VERSION} has no contextual-grounding" >&2
  echo "             filter — /check-grounding will not return grounding scores." >&2
fi

# 3. Proxies / APIs. Auth is enforced by the shared origin-verify authorizer (wired in
#    each template via ImportValue) — no ApiKey parameter is passed anymore.
deploy "metrics-proxy" "metrics-proxy" \
  --parameter-overrides AgentRuntimeId="${RUNTIME_ID}" AllowedOrigin="${ALLOWED_ORIGIN}" \
    GuardrailId="${GUARDRAIL_ID}" GuardrailVersion="${GUARDRAIL_VERSION}"
deploy "cedar-proxy" "cedar-proxy" \
  --parameter-overrides PolicyStoreId="${POLICY_STORE_ID}" AllowedOrigin="${ALLOWED_ORIGIN}" \
    GuardrailId="${GUARDRAIL_ID}" GuardrailVersion="${GUARDRAIL_VERSION}"
deploy "grounding-proxy" "grounding-proxy" \
  --parameter-overrides GuardrailId="${GUARDRAIL_ID}" GuardrailVersion="${GUARDRAIL_VERSION}"
deploy "hitl" "hitl" \
  --parameter-overrides AllowedOrigin="${ALLOWED_ORIGIN}"
deploy "registry-proxy" "registry-proxy" \
  --parameter-overrides AllowedOrigin="${ALLOWED_ORIGIN}"
deploy "deterministic-validator" "deterministic-validator" \
  --parameter-overrides AllowedOrigin="${ALLOWED_ORIGIN}"
# policy-config proxy — Decision-Rules sliders -> DDB (config, not localStorage).
# Reads/writes the kyc-gov-policy-config table created by deploy/governance
# (deploy that stack first). Same fixed table names via the kyc-gov prefix.
deploy "policy-config-proxy" "policy-config-proxy" \
  --parameter-overrides AllowedOrigin="${ALLOWED_ORIGIN}"

# 3. Seed data.
echo "==> Seeding agent registry (key: agentId)"
seed_agent() {
  aws dynamodb put-item --region "${REGION}" --table-name kyc-agent-registry \
    --item "$1" >/dev/null 2>&1 || echo "   (seed skipped: $2)"
}
seed_agent '{"agentId":{"S":"orchestrator"},"name":{"S":"Orchestrator"},"role":{"S":"Routes work, manages sequence"},"tier":{"N":"3"},"status":{"S":"active"},"model":{"S":"claude-sonnet-4-5"},"runtime":{"S":"'"${RUNTIME_ID}"'"}}' "orchestrator"
seed_agent '{"agentId":{"S":"credit-analyst"},"name":{"S":"Credit Analyst"},"role":{"S":"Financial analysis, risk scoring"},"tier":{"N":"2"},"status":{"S":"active"},"model":{"S":"claude-sonnet-4-5"},"runtime":{"S":"'"${RUNTIME_ID}"'"}}' "credit-analyst"
seed_agent '{"agentId":{"S":"compliance-officer"},"name":{"S":"Compliance Officer"},"role":{"S":"Sanctions/PEP screening, regulatory checks"},"tier":{"N":"2"},"status":{"S":"active"},"model":{"S":"claude-sonnet-4-5"},"runtime":{"S":"'"${RUNTIME_ID}"'"}}' "compliance-officer"
seed_agent '{"agentId":{"S":"sanctions-screener"},"name":{"S":"Sanctions Screener"},"role":{"S":"AML screening"},"tier":{"N":"1"},"status":{"S":"active"},"model":{"S":"nova-pro"}}' "sanctions-screener"
seed_agent '{"agentId":{"S":"audit-agent"},"name":{"S":"Audit Agent"},"role":{"S":"Evidence pack generation"},"tier":{"N":"3"},"status":{"S":"active"},"model":{"S":"claude-sonnet-4-5"}}' "audit-agent"

# Seed evaluator definitions if the file + table are present.
if [ -f "${HERE}/evaluations/evaluator-definitions.json" ]; then
  echo "==> Seeding evaluator definitions"
  python3 "${HERE}/seed_evaluations.py" --region "${REGION}" 2>/dev/null || \
    echo "   (evaluator seeding skipped — run seed_evaluations.py manually)"
fi

# Output keys per stack (confirmed from templates).
METRICS_URL=$(out "${PREFIX}-metrics-proxy" ApiEndpoint)
CEDAR_URL=$(out "${PREFIX}-cedar-proxy" ApiUrl)
GROUNDING_URL=$(out "${PREFIX}-grounding-proxy" GroundingApiUrl)
HITL_URL=$(out "${PREFIX}-hitl" ApiEndpoint)
REGISTRY_URL=$(out "${PREFIX}-registry-proxy" ApiEndpoint)
VALIDATOR_URL=$(out "${PREFIX}-deterministic-validator" ValidatorApiUrl)
POLICY_CONFIG_URL=$(out "${PREFIX}-policy-config-proxy" ApiEndpoint)

# ---------------------------------------------------------------------------
# Consolidated console gateway (/svc/*)
#
# Deployed LAST because it HTTP-proxies each /svc/<service>/{proxy+} to the backend
# APIs created above, and needs their API ids. It was previously missing from this
# script entirely: the gateway existed only because it had been created by hand during
# the original routing consolidation, and its template carried hardcoded API ids from
# that one account as parameter defaults. A deploy in any other account — or after a
# teardown — produced either no gateway at all or one wired to APIs that do not exist.
api_id_from_url() {  # https://<id>.execute-api.<region>.amazonaws.com/... -> <id>
  printf '%s' "${1:-}" | sed -E 's#^https?://##; s#\..*$##'
}

require_id() {  # $1 = label, $2 = value
  if [ -z "${2:-}" ] || [ "${2}" = "None" ]; then
    echo "ERROR: could not resolve the $1 API id from its stack output." >&2
    echo "       Refusing to deploy a gateway with a missing or foreign backend id —" >&2
    echo "       every /svc/$1 call would fail or reach the wrong account." >&2
    exit 1
  fi
  printf '%s' "$2"
}

CEDAR_ID=$(require_id cedar "$(api_id_from_url "$CEDAR_URL")")
REGISTRY_ID=$(require_id registry "$(api_id_from_url "$REGISTRY_URL")")
HITL_ID=$(require_id hitl "$(api_id_from_url "$HITL_URL")")
GROUNDING_ID=$(require_id grounding "$(api_id_from_url "$GROUNDING_URL")")
VALIDATOR_ID=$(require_id validator "$(api_id_from_url "$VALIDATOR_URL")")
METRICS_ID=$(require_id metrics "$(api_id_from_url "$METRICS_URL")")
POLICY_CONFIG_ID=$(require_id policy-config "$(api_id_from_url "$POLICY_CONFIG_URL")")

# MetricsApiId was documented as a shared cross-account control-plane metrics API.
# There is no such API to resolve generically, and the in-account metrics-proxy serves
# the same routes, so both metrics parameters point at it. That keeps /svc/metrics/*
# working in any account instead of depending on one account's shared API.
deploy console-gateway console-gateway --parameter-overrides \
  CedarApiId="$CEDAR_ID" \
  RegistryApiId="$REGISTRY_ID" \
  HitlApiId="$HITL_ID" \
  GroundingApiId="$GROUNDING_ID" \
  ValidatorApiId="$VALIDATOR_ID" \
  MetricsApiId="$METRICS_ID" \
  MetricsProxyApiId="$METRICS_ID" \
  PolicyConfigApiId="$POLICY_CONFIG_ID"

GATEWAY_URL=$(out "${PREFIX}-console-gateway" GatewayEndpoint)
if [ -z "${GATEWAY_URL:-}" ] || [ "$GATEWAY_URL" = "None" ]; then
  echo "ERROR: console-gateway deployed but produced no GatewayEndpoint output." >&2
  exit 1
fi
echo "    console gateway: ${GATEWAY_URL}"

cat <<EOF

============================================================
Console services deployed. Wire these into the console UI's
runtime-config.json (or VITE_* env for standalone):

  metrics_api_url   = ${METRICS_URL:-<see stack outputs>}
  cedar_api_url     = ${CEDAR_URL:-<see stack outputs>}
  registry_api_url  = ${REGISTRY_URL:-<see stack outputs>}
  hitl_api_url      = ${HITL_URL:-<see stack outputs>}
  grounding_api_url = ${GROUNDING_URL:-<see stack outputs>}
  tenant_id         = fsi-demo

Note: registry_api_url also serves the evaluations endpoints.
If any URL is blank, run:
  aws cloudformation describe-stacks --stack-name ${PREFIX}-<svc> \\
    --query "Stacks[0].Outputs" --region ${REGION}
============================================================
EOF
