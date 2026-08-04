#!/usr/bin/env bash
set -euo pipefail

BUCKET="${NOTES_BUCKET:-compliance-deadline-monitor-notes}"
REGION="${AWS_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Creating bucket ${BUCKET} (if needed)..."
aws s3 mb "s3://${BUCKET}" --region "${REGION}" 2>/dev/null || true

echo "Uploading sample analyst notes..."
aws s3 sync "${SCRIPT_DIR}/sample-analyst-notes/" "s3://${BUCKET}/analyst-notes/" --region "${REGION}"

echo "✅ Uploaded $(ls "${SCRIPT_DIR}/sample-analyst-notes/"*.txt | wc -l | tr -d ' ') analyst notes to s3://${BUCKET}/analyst-notes/"
