#!/usr/bin/env bash
# assume_role.sh — Assumes a cross-account IAM role via STS and exports temporary credentials.
# Required env vars: TARGET_ROLE_ARN, DEPLOYMENT_ID
# Exports: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
set -euo pipefail

echo "[assume_role] Starting cross-account role assumption"

if [[ -z "${TARGET_ROLE_ARN:-}" ]]; then
  echo "[assume_role] ERROR: TARGET_ROLE_ARN is not set"
  exit 1
fi

if [[ -z "${DEPLOYMENT_ID:-}" ]]; then
  echo "[assume_role] ERROR: DEPLOYMENT_ID is not set"
  exit 1
fi

SESSION_NAME="fsi-deploy-${DEPLOYMENT_ID}"
# STS session names are limited to 64 characters
SESSION_NAME="${SESSION_NAME:0:64}"

echo "[assume_role] Assuming role: ${TARGET_ROLE_ARN}"
echo "[assume_role] Session name:  ${SESSION_NAME}"

CREDENTIALS=$(aws sts assume-role \
  --role-arn "${TARGET_ROLE_ARN}" \
  --role-session-name "${SESSION_NAME}" \
  --duration-seconds 3600 \
  --output json 2>&1) || {
  echo "[assume_role] ERROR: Failed to assume role ${TARGET_ROLE_ARN}"
  echo "[assume_role] Details: ${CREDENTIALS}"
  exit 1
}

export AWS_ACCESS_KEY_ID=$(echo "${CREDENTIALS}" | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "${CREDENTIALS}" | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "${CREDENTIALS}" | jq -r '.Credentials.SessionToken')

if [[ -z "${AWS_ACCESS_KEY_ID}" || "${AWS_ACCESS_KEY_ID}" == "null" ]]; then
  echo "[assume_role] ERROR: Failed to extract credentials from STS response"
  exit 1
fi

echo "[assume_role] Successfully assumed role ${TARGET_ROLE_ARN}"
