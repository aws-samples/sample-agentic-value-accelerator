#!/bin/bash
# ============================================================
# Agent Safety — Observability Controls Deployment
# ============================================================
# Deploys the Auto Alarms Lambda + EventBridge rule.
# When agents are created/deleted, CW anomaly alarms are auto-managed.
#
# Usage:
#   ./deploy.sh --profile my-profile --region us-east-1
# ============================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
STACK_NAME="agent-safety-observability-controls"
OBS_TABLE="safety-dashboard-obs-signals"
REGISTRY_TABLE="safety-dashboard-registry"

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --stack-name) STACK_NAME="$2"; shift 2 ;;
    --obs-signals-table) OBS_TABLE="$2"; shift 2 ;;
    --registry-table) REGISTRY_TABLE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./deploy.sh [options]"
      echo "  --profile <name>            AWS CLI profile"
      echo "  --region <region>           AWS region (default: us-east-1)"
      echo "  --stack-name <name>         CF stack name (default: agent-safety-observability-controls)"
      echo "  --obs-signals-table <name>  DynamoDB obs signals table name"
      echo "  --registry-table <name>     DynamoDB registry table name"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AWS_OPTS="--region $REGION"
if [ -n "$PROFILE" ]; then
  AWS_OPTS="$AWS_OPTS --profile $PROFILE"
fi

echo ""
echo "============================================================"
echo "  📡 Agent Safety — Observability Controls"
echo "============================================================"
echo "  Stack:    $STACK_NAME"
echo "  Region:   $REGION"
echo "  Profile:  ${PROFILE:-default}"
echo "============================================================"
echo ""

echo "🚀 Deploying stack..."
aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/template.yaml" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  $AWS_OPTS \
  --parameter-overrides \
    ObsSignalsTableName="$OBS_TABLE" \
    RegistryTableName="$REGISTRY_TABLE"

echo ""
echo "============================================================"
echo "  ✅ Observability Controls deployed!"
echo "============================================================"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  $AWS_OPTS \
  --query 'Stacks[0].Outputs' \
  --output table
