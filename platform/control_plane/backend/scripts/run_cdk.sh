#!/usr/bin/env bash
# run_cdk.sh — Executes CDK deploy inside CodeBuild.
# Required env vars: DEPLOYMENT_ID, AWS_REGION
# Optional env vars: TARGET_ROLE_ARN (triggers cross-account role assumption)
# Outputs: /codebuild/output/outputs.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="/codebuild/output/outputs.json"

echo "[cdk] Starting CDK execution for deployment ${DEPLOYMENT_ID:-UNKNOWN}"

# --- Validate required environment variables ---
for var in DEPLOYMENT_ID AWS_REGION; do
  if [[ -z "${!var:-}" ]]; then
    echo "[cdk] ERROR: Required environment variable ${var} is not set"
    exit 1
  fi
done

# --- Optionally assume cross-account role ---
if [[ -n "${TARGET_ROLE_ARN:-}" ]]; then
  echo "[cdk] Cross-account role detected, assuming role..."
  # shellcheck source=assume_role.sh
  source "${SCRIPT_DIR}/assume_role.sh"
fi

# --- Install dependencies if package.json exists ---
if [[ -f "package.json" ]]; then
  echo "[cdk] Installing npm dependencies..."
  npm ci || {
    echo "[cdk] ERROR: npm ci failed"
    exit 1
  }
fi

# --- CDK deploy ---
echo "[cdk] Running cdk deploy..."
cdk deploy --require-approval never \
  --context deploymentId="${DEPLOYMENT_ID}" \
  --context awsRegion="${AWS_REGION}" \
  --outputs-file "${OUTPUT_FILE}" || {
  echo "[cdk] ERROR: cdk deploy failed"
  exit 1
}

# --- Verify outputs file exists ---
if [[ ! -f "${OUTPUT_FILE}" ]]; then
  echo "[cdk] WARNING: No outputs file generated, creating empty outputs"
  mkdir -p "$(dirname "${OUTPUT_FILE}")"
  echo '{}' > "${OUTPUT_FILE}"
fi

echo "[cdk] Deployment ${DEPLOYMENT_ID} completed successfully"
echo "[cdk] Outputs written to ${OUTPUT_FILE}"
