#!/usr/bin/env bash
#
# Deploy all four KYC Controlled Quality Output governance services and print the
# environment-variable block to wire into the AgentCore runtime.
#
# Each service is a self-contained CloudFormation stack (inline Lambda + HTTP
# API), so this is just four `aws cloudformation deploy` calls plus a DynamoDB
# seed. Safe to re-run — CloudFormation updates in place.
#
# Usage:
#   ./deploy_all.sh [--prefix kyc-gov] [--region us-east-1]
#
set -euo pipefail

PREFIX="kyc-gov"
REGION="${AWS_REGION:-us-east-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Deploying governance services (prefix=${PREFIX}, region=${REGION})"

deploy() {
  local name="$1" dir="$2"; shift 2
  echo "--> ${name}"
  aws cloudformation deploy \
    --region "${REGION}" \
    --stack-name "${PREFIX}-${name}" \
    --template-file "${HERE}/${dir}/template.yaml" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides "ResourcePrefix=${PREFIX}" "$@" \
    --no-fail-on-empty-changeset
}

# Policy config store first + seed, so policy-cascade can read it immediately.
# (policy-cascade fails loud with 503 if the config row is absent — invariant #5.)
deploy "policy-config"       "policy-config"
echo "==> Seeding policy-config DynamoDB table (baseline thresholds + prohibited jurisdictions)"
python3 "${HERE}/policy-config/seed_policy_config.py" --prefix "${PREFIX}" --region "${REGION}"

deploy "deterministic-check" "deterministic-check"
deploy "sanctions-pep"       "sanctions-pep"
deploy "policy-cascade"      "policy-cascade" "PolicyConfigTable=${PREFIX}-policy-config"
deploy "llm-judge"           "llm-judge"

echo "==> Seeding sanctions + PEP DynamoDB tables"
python3 "${HERE}/sanctions-pep/seed_lists.py" --prefix "${PREFIX}" --region "${REGION}"

out() { aws cloudformation describe-stacks --region "${REGION}" --stack-name "$1" \
  --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }

# Function NAMES, not URLs. These services have no public endpoint: the AgentCore
# runtime invokes them directly and IAM is the only thing that authorises the call.
DET_FN=$(out "${PREFIX}-deterministic-check" DeterministicCheckFunctionName)
SANC_FN=$(out "${PREFIX}-sanctions-pep" SanctionsCheckFunctionName)
PEP_FN=$(out "${PREFIX}-sanctions-pep" PepCheckFunctionName)
POL_FN=$(out "${PREFIX}-policy-cascade" PolicyCascadeFunctionName)
JUDGE_FN=$(out "${PREFIX}-llm-judge" LlmJudgeFunctionName)

for pair in "deterministic-check:$DET_FN" "sanctions-check:$SANC_FN" "pep-check:$PEP_FN" \
            "policy-cascade:$POL_FN" "llm-judge:$JUDGE_FN"; do
  if [ -z "${pair#*:}" ] || [ "${pair#*:}" = "None" ]; then
    echo "ERROR: ${pair%%:*} stack produced no function-name output." >&2
    echo "       The runtime would fail closed on that check. Fix the stack before continuing." >&2
    exit 1
  fi
done

cat <<EOF

============================================================
Governance services deployed — no public endpoints.

The AgentCore runtime resolves these function names from SSM
(/kyc-gov/<env>/*-function) and invokes them with its IAM role:

  DETERMINISTIC_CHECK_FUNCTION = ${DET_FN}
  SANCTIONS_CHECK_FUNCTION     = ${SANC_FN}
  PEP_CHECK_FUNCTION           = ${PEP_FN}
  POLICY_CASCADE_FUNCTION      = ${POL_FN}
  LLM_JUDGE_FUNCTION           = ${JUDGE_FN}

For local / container testing, export those names and give the
caller lambda:InvokeFunction on them:

  export DETERMINISTIC_CHECK_FUNCTION="${DET_FN}"
  export SANCTIONS_CHECK_FUNCTION="${SANC_FN}"
  export PEP_CHECK_FUNCTION="${PEP_FN}"
  export POLICY_CASCADE_FUNCTION="${POL_FN}"
  export LLM_JUDGE_FUNCTION="${JUDGE_FN}"

  aws lambda invoke --function-name "${SANC_FN}" \\
    --payload '{"name":"Omega Trading LLC"}' /dev/stdout
============================================================
EOF
