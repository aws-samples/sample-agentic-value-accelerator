#!/bin/bash
# ============================================================
# Agent Safety Controls — Destroy All Resources
# ============================================================
# Deletes all CloudFormation stacks in reverse order:
#   1. Agent (AgentCore Runtime)
#   2. Cost Controls (Lambdas, EventBridge, SNS)
#   3. Dashboard (ECS Express Mode, Cognito, DynamoDB, Lambda)
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
      echo "Usage: ./destroy-all.sh --profile <profile> --region <region>"
      echo "  --agent-name <name>   Agent name (default: safety_demo_agent)"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$PROFILE" ]; then echo "❌ --profile is required"; exit 1; fi

AWS_OPTS="--region $REGION --profile $PROFILE"
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

# 2b. Delete Evaluation Controls stack
delete_stack "agent-safety-eval-controls"

# 2c. Delete Kill Switch stack
delete_stack "agent-safety-kill-switch"

# 2d. Delete Observability Controls stack
delete_stack "agent-safety-observability-controls"

# 2e. Delete Event-Driven Signals stack
delete_stack "agent-safety-event-driven-signals"

# 3. Delete Cognito domain (must be done before dashboard stack if pool deletion fails)
echo ""
echo "🔐 Removing Cognito domain..."
ACCOUNT_ID=$(aws sts get-caller-identity $AWS_OPTS --query Account --output text)
POOL_ID=$(aws cloudformation describe-stacks --stack-name "$DASHBOARD_STACK" $AWS_OPTS \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text 2>/dev/null) || true
if [ -n "$POOL_ID" ] && [ "$POOL_ID" != "None" ]; then
  DOMAIN="${DASHBOARD_STACK}-${ACCOUNT_ID}"
  aws cognito-idp delete-user-pool-domain --domain "$DOMAIN" --user-pool-id "$POOL_ID" $AWS_OPTS 2>/dev/null || true
  echo "   Waiting for Cognito domain to release (up to 60s)..."
  for i in $(seq 1 12); do
    CHECK=$(aws cognito-idp describe-user-pool-domain --domain "$DOMAIN" $AWS_OPTS \
      --query 'DomainDescription.Status' --output text 2>/dev/null) || true
    if [ -z "$CHECK" ] || [ "$CHECK" = "None" ] || [ "$CHECK" = "" ]; then
      break
    fi
    sleep 5
  done
  echo "   ✅ Cognito domain released"
fi

# 3b. Delete ECS Express Mode service explicitly and wait for full removal
echo ""
echo "🧹 Deleting ECS Express Mode service..."
ECS_SERVICE_ARN=$(aws cloudformation describe-stacks --stack-name "$DASHBOARD_STACK" $AWS_OPTS \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardServiceArn`].OutputValue' --output text 2>/dev/null) || true
if [ -n "$ECS_SERVICE_ARN" ] && [ "$ECS_SERVICE_ARN" != "None" ]; then
  aws ecs delete-express-gateway-service --service "$ECS_SERVICE_ARN" $AWS_OPTS 2>/dev/null || true
  echo "   Waiting for ECS service to be fully removed (up to 5 min)..."
  for i in $(seq 1 30); do
    SVC_STATUS=$(aws ecs describe-express-gateway-service --service "$ECS_SERVICE_ARN" $AWS_OPTS \
      --query 'service.status.statusCode' --output text 2>/dev/null) || true
    if [ -z "$SVC_STATUS" ] || [ "$SVC_STATUS" = "None" ] || [ "$SVC_STATUS" = "" ]; then
      echo "   ✅ ECS Express service fully removed"
      break
    fi
    if [ "$SVC_STATUS" = "INACTIVE" ]; then
      # INACTIVE is the terminal state for ECS Express — it won't be fully removed
      echo "   ✅ ECS Express service is INACTIVE (terminal state)"
      break
    fi
    sleep 10
  done
else
  echo "   No ECS service found — skipping"
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

# 6. Delete VPC stack (if created by deploy)
delete_stack "${DASHBOARD_STACK}-vpc"

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

# 8. Safety-net cleanup of DynamoDB tables. Tables are now deleted with the stack
#    (no DeletionPolicy: Retain), so this normally finds nothing — it only removes
#    a table if a prior stack deletion left one behind.
echo ""
echo "🗄️  Verifying DynamoDB tables are removed..."
for TABLE in safety-dashboard-registry safety-dashboard-sessions safety-dashboard-interventions \
             safety-dashboard-cost-signals safety-dashboard-obs-signals safety-dashboard-eval-signals; do
  if aws dynamodb describe-table --table-name "$TABLE" $AWS_OPTS > /dev/null 2>&1; then
    aws dynamodb delete-table --table-name "$TABLE" $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || true
    echo "   Deleting: $TABLE"
  fi
done
# Wait for all tables to be fully deleted
echo "   Waiting for table deletions to complete..."
for TABLE in safety-dashboard-registry safety-dashboard-sessions safety-dashboard-interventions \
             safety-dashboard-cost-signals safety-dashboard-obs-signals safety-dashboard-eval-signals; do
  for i in $(seq 1 30); do
    if ! aws dynamodb describe-table --table-name "$TABLE" $AWS_OPTS > /dev/null 2>&1; then
      break
    fi
    sleep 2
  done
done
echo "   ✅ DynamoDB tables deleted"

echo ""
echo "============================================================"
echo "  ✅ All resources destroyed!"
echo "============================================================"
