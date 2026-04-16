#!/usr/bin/env bash
# run_terraform.sh — Executes Terraform init, plan, and apply inside CodeBuild.
# Required env vars: STATE_BUCKET, STATE_LOCK_TABLE, DEPLOYMENT_ID, AWS_REGION
# Optional env vars: TARGET_ROLE_ARN (triggers cross-account role assumption)
# Outputs: /codebuild/output/outputs.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="/codebuild/output/outputs.json"

echo "[terraform] Starting Terraform execution for deployment ${DEPLOYMENT_ID:-UNKNOWN}"

# --- Validate required environment variables ---
for var in STATE_BUCKET STATE_LOCK_TABLE DEPLOYMENT_ID AWS_REGION; do
  if [[ -z "${!var:-}" ]]; then
    echo "[terraform] ERROR: Required environment variable ${var} is not set"
    exit 1
  fi
done

# --- Optionally assume cross-account role ---
if [[ -n "${TARGET_ROLE_ARN:-}" ]]; then
  echo "[terraform] Cross-account role detected, assuming role..."
  # shellcheck source=assume_role.sh
  source "${SCRIPT_DIR}/assume_role.sh"
fi

# --- Build backend config ---
STATE_KEY="deployments/${DEPLOYMENT_ID}/terraform.tfstate"

echo "[terraform] State backend: s3://${STATE_BUCKET}/${STATE_KEY}"
echo "[terraform] Lock table:    ${STATE_LOCK_TABLE}"
echo "[terraform] Region:        ${AWS_REGION}"

# --- Terraform init ---
echo "[terraform] Running terraform init..."
terraform init \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="region=${AWS_REGION}" \
  -backend-config="dynamodb_table=${STATE_LOCK_TABLE}" \
  -input=false || {
  echo "[terraform] ERROR: terraform init failed"
  exit 1
}

# --- Terraform plan ---
echo "[terraform] Running terraform plan..."
terraform plan -input=false -out=tfplan || {
  echo "[terraform] ERROR: terraform plan failed"
  exit 1
}

# --- Terraform apply ---
echo "[terraform] Running terraform apply..."
terraform apply -auto-approve -input=false tfplan || {
  echo "[terraform] ERROR: terraform apply failed"
  exit 1
}

# --- Capture outputs ---
echo "[terraform] Capturing outputs to ${OUTPUT_FILE}..."
mkdir -p "$(dirname "${OUTPUT_FILE}")"
terraform output -json > "${OUTPUT_FILE}" || {
  echo "[terraform] ERROR: Failed to capture terraform outputs"
  exit 1
}

echo "[terraform] Deployment ${DEPLOYMENT_ID} completed successfully"
echo "[terraform] Outputs written to ${OUTPUT_FILE}"
