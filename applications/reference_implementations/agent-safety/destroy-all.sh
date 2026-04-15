#!/bin/bash
# ============================================================
# Agent Safety Controls — Destroy All Resources
# ============================================================
# Deletes all CloudFormation stacks in reverse order:
#   1. Agent (AgentCore Runtime)
#   2. Cost Controls (Lambdas, EventBridge, SNS)
#   3. Dashboard (App Runner, Cognito, DynamoDB, Lambda)
#   4. ECR (container registry)
#   5. Cognito User Pool domain (must be deleted before pool)
#   6. Lambda layers
#
# Usage:
#   ./destroy-all.sh --profile mbavadiy-Admin --region us-east-2
#   ./destroy-all.sh --profile mbavadiy-Admin --region us-east-2 --agent-name safety_demo_agent
# ============================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
AGENT_NAME="safety_demo_agent"
DASHBOARD_STACK="agent-safety-dashboard"
COST_STACK="agent-safety-cost-controls"
ECR_STACK="agent-safety-ecr"

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --agent-name) AGENT_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./destroy-all.sh --region <region> [--profile <profile>]"
      echo "  --agent-name <name>   Agent name (default: safety_demo_agent)"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$PROFILE" ]; then
  AWS_OPTS="--region $REGION"
else
  AWS_OPTS="--region $REGION --profile $PROFILE"
fi
AGENT_STACK="agent-$(echo $AGENT_NAME | tr '_' '-')"

echo ""
echo "============================================================"
echo "  🗑️  Agent Safety Controls — Destroy All"
echo "============================================================"
echo "  Region:  $REGION"
echo "  Stacks:  $AGENT_STACK, $COST_STACK, $DASHBOARD_STACK, $ECR_STACK"
echo "============================================================"
echo ""
read -p "⚠️  This will DELETE all resources. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then echo "Cancelled."; exit 0; fi

delete_stack() {
  local STACK=$1
  echo ""
  echo "🗑️  Deleting stack: $STACK"
  STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" $AWS_OPTS \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null) || true
  if [ -z "$STATUS" ] || [ "$STATUS" = "None" ]; then
    echo "   Stack doesn't exist — skipping"
    return
  fi
  if [[ "$STATUS" == *"IN_PROGRESS"* ]]; then
    echo "   Stack is $STATUS — waiting..."
    aws cloudformation wait stack-delete-complete --stack-name "$STACK" $AWS_OPTS 2>/dev/null || \
    aws cloudformation wait stack-create-complete --stack-name "$STACK" $AWS_OPTS 2>/dev/null || \
    aws cloudformation wait stack-update-complete --stack-name "$STACK" $AWS_OPTS 2>/dev/null || true
  fi
  aws cloudformation delete-stack --stack-name "$STACK" $AWS_OPTS 2>/dev/null || true
  echo "   Waiting for deletion..."
  aws cloudformation wait stack-delete-complete --stack-name "$STACK" $AWS_OPTS 2>/dev/null || true
  echo "   ✅ $STACK deleted"
}

# 1. Delete Agent stack
delete_stack "$AGENT_STACK"

# 2. Delete Cost Controls stack
delete_stack "$COST_STACK"

# 3. Delete Cognito domain (must be done before dashboard stack if pool deletion fails)
echo ""
echo "🔐 Removing Cognito domain..."
POOL_ID=$(aws cloudformation describe-stacks --stack-name "$DASHBOARD_STACK" $AWS_OPTS \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text 2>/dev/null) || true
if [ -n "$POOL_ID" ] && [ "$POOL_ID" != "None" ]; then
  DOMAIN="${DASHBOARD_STACK}-$(aws sts get-caller-identity $AWS_OPTS --query Account --output text)"
  aws cognito-idp delete-user-pool-domain --domain "$DOMAIN" --user-pool-id "$POOL_ID" $AWS_OPTS 2>/dev/null || true
  echo "   ✅ Cognito domain removed"
fi

# 4. Delete Dashboard stack
delete_stack "$DASHBOARD_STACK"

# 5. Delete ECR stack (images + repo)
echo ""
echo "🧹 Cleaning ECR images..."
aws ecr batch-delete-image --repository-name safety-dashboard \
  --image-ids "$(aws ecr list-images --repository-name safety-dashboard $AWS_OPTS --query 'imageIds' --output json 2>/dev/null)" \
  $AWS_OPTS 2>/dev/null || true
delete_stack "$ECR_STACK"

# 6. Delete Lambda layers
echo ""
echo "🧹 Cleaning Lambda layers..."
for LAYER_NAME in "${DASHBOARD_STACK}-boto3-agentcore" "${COST_STACK}-boto3-agentcore" "boto3-agentcore"; do
  VERSIONS=$(aws lambda list-layer-versions --layer-name "$LAYER_NAME" $AWS_OPTS \
    --query 'LayerVersions[*].Version' --output text 2>/dev/null) || true
  for V in $VERSIONS; do
    aws lambda delete-layer-version --layer-name "$LAYER_NAME" --version-number "$V" $AWS_OPTS 2>/dev/null || true
  done
done
echo "   ✅ Layers cleaned"

echo ""
echo "============================================================"
echo "  ✅ All resources destroyed!"
echo "============================================================"
