#!/usr/bin/env bash
# run_cloudformation.sh — Deploys a CloudFormation stack using AWS CLI.
# Required env vars: DEPLOYMENT_ID, AWS_REGION, TEMPLATE_ID
# Optional env vars: TARGET_ROLE_ARN, STACK_NAME, CFN_TEMPLATE_FILE
# Outputs: /codebuild/output/outputs.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="/codebuild/output/outputs.json"

echo "[cfn] Starting CloudFormation execution for deployment ${DEPLOYMENT_ID:-UNKNOWN}"

# --- Validate required environment variables ---
for var in DEPLOYMENT_ID AWS_REGION TEMPLATE_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "[cfn] ERROR: Required environment variable ${var} is not set"
    exit 1
  fi
done

# --- Optionally assume cross-account role ---
if [[ -n "${TARGET_ROLE_ARN:-}" ]]; then
  echo "[cfn] Cross-account role detected, assuming role..."
  # shellcheck source=assume_role.sh
  source "${SCRIPT_DIR}/assume_role.sh"
fi

# --- Resolve stack name and template file ---
STACK_NAME="${STACK_NAME:-fsi-${TEMPLATE_ID}-${DEPLOYMENT_ID}}"
# Sanitize stack name: CloudFormation allows [a-zA-Z0-9-]
STACK_NAME=$(echo "${STACK_NAME}" | sed 's/[^a-zA-Z0-9-]/-/g' | cut -c1-128)
CFN_TEMPLATE_FILE="${CFN_TEMPLATE_FILE:-template.yaml}"

echo "[cfn] Stack name:    ${STACK_NAME}"
echo "[cfn] Template file: ${CFN_TEMPLATE_FILE}"
echo "[cfn] Region:        ${AWS_REGION}"

if [[ ! -f "${CFN_TEMPLATE_FILE}" ]]; then
  echo "[cfn] ERROR: Template file ${CFN_TEMPLATE_FILE} not found"
  exit 1
fi

# --- Deploy stack ---
echo "[cfn] Running aws cloudformation deploy..."
aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${CFN_TEMPLATE_FILE}" \
  --region "${AWS_REGION}" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
  --no-fail-on-empty-changeset || {
  echo "[cfn] ERROR: CloudFormation deploy failed"
  exit 1
}

# --- Capture outputs ---
echo "[cfn] Capturing stack outputs..."
mkdir -p "$(dirname "${OUTPUT_FILE}")"
OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --query 'Stacks[0].Outputs' \
  --output json 2>&1) || {
  echo "[cfn] ERROR: Failed to describe stack outputs"
  echo "[cfn] Details: ${OUTPUTS}"
  exit 1
}

# Convert CloudFormation output format to simple key-value JSON
echo "${OUTPUTS}" | jq '
  if . == null then {}
  else [.[] | {(.OutputKey): .OutputValue}] | add // {}
  end
' > "${OUTPUT_FILE}" || {
  echo "[cfn] ERROR: Failed to parse stack outputs"
  exit 1
}

echo "[cfn] Deployment ${DEPLOYMENT_ID} completed successfully"
echo "[cfn] Outputs written to ${OUTPUT_FILE}"
