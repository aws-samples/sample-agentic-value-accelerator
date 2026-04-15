#!/bin/bash
# ============================================================
# Agent Safety — Cost Controls Deployment
# ============================================================
# Deploys: SNS topic, EventBridge rule, Auto Budget Lambda,
#          Stop Sessions Lambda, boto3 Lambda layer.
#
# Usage:
#   ./deploy.sh --profile mbavadiy-Admin --region us-east-2
#   ./deploy.sh --profile mbavadiy-Admin --region us-east-2 \
#     --cost-signals-table safety-dashboard-cost-signals \
#     --registry-table safety-dashboard-registry
# ============================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
STACK_NAME="agent-safety-cost-controls"
COST_SIGNALS_TABLE="cost-signals"
REGISTRY_TABLE="agent-registry"
SESSION_TABLE="session-token-usage"
INTERVENTION_TABLE="intervention-log"

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --stack-name) STACK_NAME="$2"; shift 2 ;;
    --cost-signals-table) COST_SIGNALS_TABLE="$2"; shift 2 ;;
    --registry-table) REGISTRY_TABLE="$2"; shift 2 ;;
    --session-table) SESSION_TABLE="$2"; shift 2 ;;
    --intervention-table) INTERVENTION_TABLE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./deploy.sh --profile <profile> [options]"
      echo "  --region <region>                 AWS region (default: us-east-1)"
      echo "  --cost-signals-table <name>       DynamoDB table (default: cost-signals)"
      echo "  --registry-table <name>           DynamoDB table (default: agent-registry)"
      echo "  --session-table <name>            DynamoDB table (default: session-token-usage)"
      echo "  --intervention-table <name>       DynamoDB table (default: intervention-log)"
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
echo "  Agent Safety — Cost Controls Deploy"
echo "============================================================"
echo "  Region:     $REGION"
echo "  Stack:      $STACK_NAME"
echo "  Tables:     cost=$COST_SIGNALS_TABLE registry=$REGISTRY_TABLE"
echo "              sessions=$SESSION_TABLE interventions=$INTERVENTION_TABLE"
echo "============================================================"

# Step 1: Deploy CF stack
echo ""
echo "🚀 Step 1: Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/template.yaml" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    CostSignalsTableName="$COST_SIGNALS_TABLE" \
    RegistryTableName="$REGISTRY_TABLE" \
    SessionTableName="$SESSION_TABLE" \
    InterventionTableName="$INTERVENTION_TABLE" \
  $AWS_OPTS \
  --no-fail-on-empty-changeset || { echo "❌ Stack failed."; exit 1; }
echo "   ✅ Stack deployed"

# Step 2: Create and attach boto3 Lambda layer
echo ""
echo "📦 Step 2: Creating boto3 Lambda layer..."
LAYER_DIR=$(mktemp -d)
pip3 install "boto3>=1.42.49" -t "$LAYER_DIR/python" --quiet 2>/dev/null
(cd "$LAYER_DIR" && zip -r "$LAYER_DIR/layer.zip" python -q)
LAYER_ARN=$(aws lambda publish-layer-version \
  --layer-name "${STACK_NAME}-boto3-agentcore" \
  --description "boto3 with bedrock-agentcore stop_runtime_session support" \
  --zip-file "fileb://$LAYER_DIR/layer.zip" \
  --compatible-runtimes python3.11 python3.12 python3.13 \
  $AWS_OPTS --query 'LayerVersionArn' --output text 2>/dev/null) || true
rm -rf "$LAYER_DIR"

if [ -n "$LAYER_ARN" ]; then
  echo "   Layer: $LAYER_ARN"
  # Attach to both Lambdas
  for FUNC in "${STACK_NAME}-StopSessions" "${STACK_NAME}-AutoBudget"; do
    aws lambda update-function-configuration \
      --function-name "$FUNC" \
      --layers "$LAYER_ARN" \
      $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || true
    echo "   ✅ Layer attached to $FUNC"
  done
else
  echo "   ⚠️  Layer creation skipped"
fi

# Done
echo ""
echo "============================================================"
echo "  ✅ Cost Controls deployed!"
echo "============================================================"
aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table --no-cli-pager 2>/dev/null
