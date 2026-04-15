#!/bin/bash
# ===========================================================================
# Agent Safety Dashboard — One-click deploy
#
# Usage:
#   ./deploy.sh --profile mbavadiy-Admin
#   ./deploy.sh --profile mbavadiy-Admin --region eu-west-1
#
# Phases:
#   1. ECR stack (creates repo)
#   2. Docker build (linux/amd64) + push to ECR
#   3. Main stack (DynamoDB, Lambda, IAM, App Runner)
# ===========================================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
STACK_NAME="agent-safety-dashboard"
ECR_STACK_NAME="agent-safety-ecr"
ECR_REPO="safety-dashboard"
ADMIN_EMAIL=""
ADMIN_PASSWORD=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --stack-name) STACK_NAME="$2"; shift 2 ;;
    --ecr-repo) ECR_REPO="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./deploy.sh --profile <aws-profile> --admin-email <email> [options]"
      echo "  --profile <name>          AWS CLI profile"
      echo "  --admin-email <email>     Admin user email (required)"
      echo "  --admin-password <pass>   Admin password (optional, prompted if not set)"
      echo "  --region <region>         AWS region (default: us-east-1)"
      echo "  --stack-name <name>       Main stack name (default: agent-safety-dashboard)"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$ADMIN_EMAIL" ]; then
  echo "❌ --admin-email is required"
  echo "   Usage: ./deploy.sh --profile <profile> --admin-email user@company.com"
  exit 1
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  echo -n "Enter admin password for $ADMIN_EMAIL: "
  read -s ADMIN_PASSWORD
  echo ""
  if [ -z "$ADMIN_PASSWORD" ]; then
    echo "❌ Password cannot be empty"
    exit 1
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AWS_OPTS="--region $REGION"
if [ -n "$PROFILE" ]; then
  AWS_OPTS="$AWS_OPTS --profile $PROFILE"
  export AWS_PROFILE="$PROFILE"
fi

# Verify credentials
ACCOUNT_ID=$(aws sts get-caller-identity $AWS_OPTS --query Account --output text 2>/dev/null) || {
  echo "❌ Cannot get AWS credentials."; exit 1
}
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest"

echo ""
echo "============================================================"
echo "  Agent Safety Dashboard — Deploy"
echo "============================================================"
echo "  Account:    $ACCOUNT_ID"
echo "  Region:     $REGION"
echo "  ECR Stack:  $ECR_STACK_NAME"
echo "  Main Stack: $STACK_NAME"
echo "  Image URI:  $IMAGE_URI"
echo "============================================================"

# Phase 0: Enable CloudWatch Transaction Search (one-time per region)
echo ""
echo "� Phase 0: Enabling CloudWatch Transaction Search..."
# Create resource policy for X-Ray → CloudWatch Logs
aws logs put-resource-policy \
  --policy-name TransactionSearchXRayAccess \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TransactionSearchXRayAccess\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"xray.amazonaws.com\"},\"Action\":\"logs:PutLogEvents\",\"Resource\":[\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:aws/spans:*\",\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/application-signals/data:*\"],\"Condition\":{\"ArnLike\":{\"aws:SourceArn\":\"arn:aws:xray:${REGION}:${ACCOUNT_ID}:*\"},\"StringEquals\":{\"aws:SourceAccount\":\"${ACCOUNT_ID}\"}}}]}" \
  $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || true
# Set trace destination to CloudWatch Logs
aws xray update-trace-segment-destination --destination CloudWatchLogs \
  $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || true
echo "   ✅ Transaction Search enabled"

# Phase 1: ECR
echo ""
echo "📦 Phase 1: Creating ECR repository..."
aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/ecr-stack.yaml" \
  --stack-name "$ECR_STACK_NAME" \
  $AWS_OPTS \
  --parameter-overrides ECRRepoName="$ECR_REPO" \
  --no-fail-on-empty-changeset || { echo "❌ ECR stack failed."; exit 1; }
echo "   ✅ ECR ready"

# Phase 2: Build + Push
echo ""
echo "🐳 Phase 2: Building and pushing Docker image (linux/amd64)..."
cd "$SCRIPT_DIR"
PROFILE_FLAG=""
if [ -n "$PROFILE" ]; then PROFILE_FLAG="--profile $PROFILE"; fi
python3 deploy.py --region "$REGION" --repo-name "$ECR_REPO" $PROFILE_FLAG || {
  echo "❌ Docker build/push failed. Is Docker running?"; exit 1
}
echo "   ✅ Image pushed"

# Phase 3: Main stack
echo ""
echo "🚀 Phase 3: Deploying main stack (DynamoDB + Lambda + Cognito + App Runner)..."

# Wait if stack is currently in progress (from a previous run)
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null) || true
if [[ "$STACK_STATUS" == *"IN_PROGRESS"* ]]; then
  echo "   Stack is $STACK_STATUS — waiting for it to complete..."
  aws cloudformation wait stack-create-complete --stack-name "$STACK_NAME" $AWS_OPTS 2>/dev/null || \
  aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME" $AWS_OPTS 2>/dev/null || true
  echo "   Stack ready."
fi

aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/template.yaml" \
  --stack-name "$STACK_NAME" \
  $AWS_OPTS \
  --parameter-overrides ImageUri="$IMAGE_URI" AdminEmail="$ADMIN_EMAIL" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset || { echo "❌ Main stack failed."; exit 1; }
echo "   ✅ Main stack deployed"

# Phase 4: Post-deploy — Lambda layer + Cognito config
echo ""
echo "📦 Phase 4a: Creating boto3 Lambda layer (for AgentCore stop_runtime_session)..."
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
  LAMBDA_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
    --query 'Stacks[0].Outputs[?OutputKey==`StopSessionsLambdaArn`].OutputValue' --output text 2>/dev/null)
  if [ -n "$LAMBDA_NAME" ]; then
    FUNC_NAME=$(echo "$LAMBDA_NAME" | awk -F: '{print $NF}')
    aws lambda update-function-configuration \
      --function-name "$FUNC_NAME" \
      --layers "$LAYER_ARN" \
      $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || true
    echo "   ✅ Layer attached to $FUNC_NAME"
  fi
else
  echo "   ⚠️  Layer creation skipped (pip3 not available or failed)"
fi

echo ""
echo "🔐 Phase 4b: Configuring Cognito auth..."

DASHBOARD_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' --output text 2>/dev/null)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text 2>/dev/null)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoAppClientId`].OutputValue' --output text 2>/dev/null)

if [ -n "$DASHBOARD_URL" ] && [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ]; then
  # Add App Runner URL to Cognito callback/logout URLs
  echo "   Updating Cognito callback URLs with: $DASHBOARD_URL"
  aws cognito-idp update-user-pool-client \
    --user-pool-id "$USER_POOL_ID" \
    --client-id "$CLIENT_ID" \
    --supported-identity-providers COGNITO \
    --callback-urls "http://localhost:8000" "$DASHBOARD_URL" \
    --logout-urls "http://localhost:8000" "$DASHBOARD_URL" \
    --allowed-o-auth-flows code \
    --allowed-o-auth-scopes openid email profile \
    --allowed-o-auth-flows-user-pool-client \
    --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    $AWS_OPTS --no-cli-pager > /dev/null 2>&1
  echo "   ✅ Cognito callback URLs updated"

  # Set admin password (permanent, no force-change)
  echo "   Setting admin password..."
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$USER_POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD" \
    --permanent \
    $AWS_OPTS > /dev/null 2>&1
  echo "   ✅ Admin password set"

  # Update App Runner with COGNITO_REDIRECT_URI pointing to the actual URL
  echo "   Updating App Runner with redirect URI..."
  aws apprunner update-service \
    --service-arn $(aws apprunner list-services $AWS_OPTS --query "ServiceSummaryList[?ServiceName=='agent-safety-dashboard'].ServiceArn" --output text) \
    --source-configuration "{\"ImageRepository\":{\"ImageIdentifier\":\"$IMAGE_URI\",\"ImageRepositoryType\":\"ECR\",\"ImageConfiguration\":{\"Port\":\"8000\",\"RuntimeEnvironmentVariables\":{\"AWS_REGION\":\"$REGION\",\"REGISTRY_TABLE\":\"safety-dashboard-registry\",\"SESSION_TABLE\":\"safety-dashboard-sessions\",\"INTERVENTION_TABLE\":\"safety-dashboard-interventions\",\"COST_SIGNALS_TABLE\":\"safety-dashboard-cost-signals\",\"OBS_SIGNALS_TABLE\":\"safety-dashboard-obs-signals\",\"EVAL_SIGNALS_TABLE\":\"safety-dashboard-eval-signals\",\"STOP_SESSIONS_LAMBDA\":\"SafetyDashboard-StopSessions\",\"BUDGET_PREFIX\":\"agent-\",\"ALLOWED_ORIGINS\":\"*\",\"COGNITO_USER_POOL_ID\":\"$USER_POOL_ID\",\"COGNITO_APP_CLIENT_ID\":\"$CLIENT_ID\",\"COGNITO_DOMAIN\":\"${STACK_NAME}-${ACCOUNT_ID}.auth.${REGION}.amazoncognito.com\",\"COGNITO_REGION\":\"$REGION\",\"COGNITO_REDIRECT_URI\":\"$DASHBOARD_URL\"}}}}" \
    $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || echo "   ⚠️  App Runner update skipped (may need manual COGNITO_REDIRECT_URI update)"
  echo "   ✅ App Runner updated with redirect URI"
fi

# Done
echo ""
echo "============================================================"
echo "  ✅ Deployment complete!"
echo "============================================================"
echo ""
aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table --no-cli-pager 2>/dev/null
echo ""
echo "🌐 Open the DashboardUrl above to access your dashboard."
echo "🔑 Sign in with: $ADMIN_EMAIL and the password you provided."
