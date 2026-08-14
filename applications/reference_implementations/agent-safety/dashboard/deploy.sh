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
#   3. Main stack (DynamoDB, Lambda, IAM, ECS Express Mode)
# ===========================================================================
set -euo pipefail

REGION="us-east-1"
PROFILE=""
STACK_NAME="agent-safety-dashboard"
ECR_STACK_NAME="agent-safety-ecr"
ECR_REPO="safety-dashboard"
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ALLOWED_CIDR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --stack-name) STACK_NAME="$2"; shift 2 ;;
    --ecr-repo) ECR_REPO="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --allowed-cidr) ALLOWED_CIDR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./deploy.sh [options]"
      echo "  --profile <name>          AWS CLI profile"
      echo "  --admin-email <email>     Admin user email (default: admin@agent-safety.local)"
      echo "  --admin-password <pass>   Admin password (default: random-generated per deploy)"
      echo "  --allowed-cidr <cidr>     CIDR allowed to access dashboard (default: auto-detect your IP)"
      echo "  --region <region>         AWS region (default: us-east-1)"
      echo "  --stack-name <name>       Main stack name (default: agent-safety-dashboard)"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$ADMIN_EMAIL" ]; then
  ADMIN_EMAIL="admin@agent-safety.local"
  echo "ℹ️  Using default admin email: $ADMIN_EMAIL"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  # No hardcoded fallback — a public repo reader must not be able to guess it.
  # Generate a strong random password. Suffix Aa1! satisfies Cognito's default
  # complexity policy (upper + lower + digit + symbol). Operator passing
  # --admin-password takes precedence.
  ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)Aa1!"
  echo "ℹ️  No --admin-password provided; generated one for this deploy:"
  echo "   ADMIN_PASSWORD=$ADMIN_PASSWORD"
  echo "   Save this — you'll need it if you sign in via the Cognito Hosted UI."
  echo "   (AVA SSO handoff bypasses this password; it's only for the fallback path.)"
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
# Unique image tag per build so CloudFormation sees a changed ImageUri and ECS rolls out.
IMAGE_TAG=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"

# Auto-detect deployer's public IP if no CIDR was provided
if [ -z "$ALLOWED_CIDR" ]; then
  echo ""
  echo "🔍 Detecting your public IP for ALB security group..."
  MY_IP=$(curl -s --max-time 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]') || true
  if [ -n "$MY_IP" ]; then
    ALLOWED_CIDR="${MY_IP}/32"
    echo "   Detected: $MY_IP → ALB will allow HTTPS from $ALLOWED_CIDR"
  else
    ALLOWED_CIDR="10.0.0.0/8"
    echo "   ⚠️  Could not detect IP — falling back to $ALLOWED_CIDR"
  fi
fi

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

# Phase 0: Pre-flight + CloudWatch Transaction Search (one-time per region/account)
echo ""
echo "🔧 Phase 0: Pre-flight checks..."

# Ensure ECS service-linked roles exist (required for Express Mode)
# These are idempotent — no error if they already exist
echo "   Ensuring ECS service-linked roles exist..."
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com \
  $AWS_OPTS 2>/dev/null || true
aws iam create-service-linked-role --aws-service-name elasticloadbalancing.amazonaws.com \
  $AWS_OPTS 2>/dev/null || true
aws iam create-service-linked-role --aws-service-name ecs.application-autoscaling.amazonaws.com \
  $AWS_OPTS 2>/dev/null || true
echo "   ✅ Service-linked roles ready"

# Enable CloudWatch Transaction Search
echo "   Enabling CloudWatch Transaction Search..."
# Create resource policy for X-Ray → CloudWatch Logs
aws logs put-resource-policy \
  --policy-name TransactionSearchXRayAccess \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TransactionSearchXRayAccess\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"xray.amazonaws.com\"},\"Action\":\"logs:PutLogEvents\",\"Resource\":[\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:aws/spans:*\",\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/application-signals/data:*\"],\"Condition\":{\"ArnLike\":{\"aws:SourceArn\":\"arn:aws:xray:${REGION}:${ACCOUNT_ID}:*\"},\"StringEquals\":{\"aws:SourceAccount\":\"${ACCOUNT_ID}\"}}}]}" \
  $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || true
# Set trace destination to CloudWatch Logs
aws xray update-trace-segment-destination --destination CloudWatchLogs \
  $AWS_OPTS --no-cli-pager > /dev/null 2>&1 || true
echo "   ✅ Transaction Search enabled"

# Check for Cognito domain cooldown (domains take ~30min to release after deletion)
echo "   Checking Cognito domain availability..."
COGNITO_DOMAIN="${STACK_NAME}-${ACCOUNT_ID}"
DOMAIN_STATUS=$(aws cognito-idp describe-user-pool-domain --domain "$COGNITO_DOMAIN" \
  $AWS_OPTS --query 'DomainDescription.Status' --output text 2>/dev/null) || true
if [ -n "$DOMAIN_STATUS" ] && [ "$DOMAIN_STATUS" != "None" ] && [ "$DOMAIN_STATUS" != "" ]; then
  # Domain exists — check if it belongs to a different user pool (stale)
  DOMAIN_POOL=$(aws cognito-idp describe-user-pool-domain --domain "$COGNITO_DOMAIN" \
    $AWS_OPTS --query 'DomainDescription.UserPoolId' --output text 2>/dev/null) || true
  EXISTING_POOL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text 2>/dev/null) || true
  if [ "$DOMAIN_POOL" != "$EXISTING_POOL" ] && [ -n "$DOMAIN_POOL" ] && [ "$DOMAIN_POOL" != "None" ]; then
    echo "   ⏳ Cognito domain '$COGNITO_DOMAIN' is in cooldown (owned by pool: $DOMAIN_POOL)."
    echo "      Waiting up to 5 minutes for release..."
    for i in $(seq 1 30); do
      sleep 10
      CHECK=$(aws cognito-idp describe-user-pool-domain --domain "$COGNITO_DOMAIN" \
        $AWS_OPTS --query 'DomainDescription.Status' --output text 2>/dev/null) || true
      if [ -z "$CHECK" ] || [ "$CHECK" = "None" ] || [ "$CHECK" = "" ]; then
        echo "   ✅ Cognito domain released"
        break
      fi
      if [ $i -eq 30 ]; then
        echo "   ⚠️  Cognito domain still not released after 5 min. Deploy may fail on UserPoolDomain resource."
        echo "      If it does, wait ~30 minutes and retry."
      fi
    done
  else
    echo "   ✅ Cognito domain available (or belongs to current stack)"
  fi
else
  echo "   ✅ Cognito domain available"
fi

# Phase 0b: VPC — ensure a VPC with IGW exists
echo ""
echo "🌐 Phase 0b: Ensuring VPC with Internet Gateway..."
VPC_STACK_NAME="${STACK_NAME}-vpc"
# Check if default VPC has an IGW
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters 'Name=isDefault,Values=true' $AWS_OPTS \
  --query 'Vpcs[0].VpcId' --output text 2>/dev/null) || true
DEFAULT_VPC_HAS_IGW=false
if [ -n "$DEFAULT_VPC" ] && [ "$DEFAULT_VPC" != "None" ]; then
  IGW_COUNT=$(aws ec2 describe-internet-gateways \
    --filters "Name=attachment.vpc-id,Values=$DEFAULT_VPC" "Name=attachment.state,Values=available" \
    $AWS_OPTS --query 'length(InternetGateways)' --output text 2>/dev/null) || true
  if [ "$IGW_COUNT" -gt 0 ] 2>/dev/null; then
    DEFAULT_VPC_HAS_IGW=true
  fi
fi

if [ "$DEFAULT_VPC_HAS_IGW" = true ]; then
  echo "   Default VPC $DEFAULT_VPC has IGW — using it"
  DASHBOARD_VPC_ID="$DEFAULT_VPC"
  DASHBOARD_SUBNETS=""
else
  echo "   Default VPC missing or has no IGW — creating dedicated VPC..."
  aws cloudformation deploy \
    --template-file "$SCRIPT_DIR/vpc-stack.yaml" \
    --stack-name "$VPC_STACK_NAME" \
    $AWS_OPTS \
    --no-fail-on-empty-changeset || { echo "❌ VPC stack failed."; exit 1; }
  DASHBOARD_VPC_ID=$(aws cloudformation describe-stacks --stack-name "$VPC_STACK_NAME" $AWS_OPTS \
    --query 'Stacks[0].Outputs[?OutputKey==`VpcId`].OutputValue' --output text 2>/dev/null)
  SUBNET1=$(aws cloudformation describe-stacks --stack-name "$VPC_STACK_NAME" $AWS_OPTS \
    --query 'Stacks[0].Outputs[?OutputKey==`PublicSubnet1Id`].OutputValue' --output text 2>/dev/null)
  SUBNET2=$(aws cloudformation describe-stacks --stack-name "$VPC_STACK_NAME" $AWS_OPTS \
    --query 'Stacks[0].Outputs[?OutputKey==`PublicSubnet2Id`].OutputValue' --output text 2>/dev/null)
  DASHBOARD_SUBNETS="${SUBNET1},${SUBNET2}"
  echo "   ✅ VPC $DASHBOARD_VPC_ID created with subnets $DASHBOARD_SUBNETS"
fi

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
python3 deploy.py --region "$REGION" --repo-name "$ECR_REPO" --image-tag "$IMAGE_TAG" $PROFILE_FLAG || {
  echo "❌ Container image build/push failed. Is your container runtime (docker/finch) running?"; exit 1
}
echo "   ✅ Image pushed"

# Phase 3: Main stack
echo ""
echo "🚀 Phase 3: Deploying main stack (DynamoDB + Lambda + Cognito + ECS Express Mode)..."

# Wait if stack is currently in progress (from a previous run)
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null) || true
if [[ "$STACK_STATUS" == *"IN_PROGRESS"* ]]; then
  echo "   Stack is $STACK_STATUS — waiting for it to complete..."
  aws cloudformation wait stack-create-complete --stack-name "$STACK_NAME" $AWS_OPTS 2>/dev/null || \
  aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME" $AWS_OPTS 2>/dev/null || true
  echo "   Stack ready."
fi

# ECS Express Mode keeps INACTIVE services registered indefinitely after deletion.
# A short hash ensures each deployment gets a unique service name, avoiding collisions.
ECS_SVC_HASH=$(echo "${STACK_NAME}-${ACCOUNT_ID}-${REGION}" | shasum | cut -c1-6)

# Note: DynamoDB tables (and all other resources) are deleted with the stack — no
# DeletionPolicy: Retain — so a teardown leaves no orphaned tables to import. A fresh
# deploy simply recreates everything cleanly.

# Build parameter overrides
CF_PARAMS="ImageUri=$IMAGE_URI AdminEmail=$ADMIN_EMAIL AllowedIngressCidr=$ALLOWED_CIDR DashboardVpcId=$DASHBOARD_VPC_ID ECSServiceName=${STACK_NAME}-${ECS_SVC_HASH}"
if [ -n "$DASHBOARD_SUBNETS" ]; then
  CF_PARAMS="$CF_PARAMS DashboardSubnets=$DASHBOARD_SUBNETS"
fi

# AVA FSI SSO — pipe through when the AVA control plane's CodeBuild
# exports these env vars. When empty (standalone deploy from a laptop),
# the FastAPI backend falls back to its Cognito login flow unchanged.
if [ -n "${AVA_FSI_APP_SIGNING_SECRET:-}" ]; then
  CF_PARAMS="$CF_PARAMS AvaFsiAppSigningSecret=${AVA_FSI_APP_SIGNING_SECRET}"
fi
if [ -n "${AVA_UI_LOGIN_URL:-}" ]; then
  CF_PARAMS="$CF_PARAMS AvaUiLoginUrl=${AVA_UI_LOGIN_URL}"
fi

aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/template.yaml" \
  --stack-name "$STACK_NAME" \
  $AWS_OPTS \
  --parameter-overrides $CF_PARAMS \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset || { echo "❌ Main stack failed."; exit 1; }
echo "   ✅ Main stack deployed"

# Phase 4: Post-deploy — Lambda layer + Cognito config
echo ""
echo "📦 Phase 4a: Creating boto3 Lambda layer (for AgentCore stop_runtime_session)..."
LAYER_DIR=$(mktemp -d)
pip3 install "boto3>=1.42.80" -t "$LAYER_DIR/python" --quiet --upgrade --no-cache-dir 2>/dev/null
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
  # Get CloudFront URL if available
  CF_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' --output text 2>/dev/null) || true
  CALLBACK_URLS="$DASHBOARD_URL"
  if [ -n "$CF_URL" ] && [ "$CF_URL" != "None" ]; then
    CALLBACK_URLS="$CALLBACK_URLS https://$CF_URL"
    echo "   Including CloudFront URL: https://$CF_URL"
  fi
  echo "   Updating Cognito callback URLs with: $CALLBACK_URLS"
  aws cognito-idp update-user-pool-client \
    --user-pool-id "$USER_POOL_ID" \
    --client-id "$CLIENT_ID" \
    --supported-identity-providers COGNITO \
    --callback-urls $CALLBACK_URLS \
    --logout-urls $CALLBACK_URLS \
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
fi

# Phase 4c: Harden Express Mode ALB security group
# Express Mode auto-creates an ALB SG with 0.0.0.0/0 on ports 80 and 443.
# Our custom SG (from CF template) is additive — it doesn't replace the default.
# This step strips the wide-open rules from the Express Mode-created ALB SG.
# When CloudFront is enabled, we allow only CloudFront IPs via managed prefix list.
echo ""
echo "🔒 Phase 4c: Hardening ALB security group (removing 0.0.0.0/0 rules)..."
ECS_ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:AmazonECSManaged,Values=true" "Name=group-name,Values=ecs-express-gateway-alb-*" \
  $AWS_OPTS --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null) || true
if [ -n "$ECS_ALB_SG" ] && [ "$ECS_ALB_SG" != "None" ]; then
  # Remove all 0.0.0.0/0 and ::/0 inbound rules (HTTP and HTTPS)
  aws ec2 revoke-security-group-ingress --group-id "$ECS_ALB_SG" \
    --ip-permissions \
    '[{"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},{"IpProtocol":"tcp","FromPort":80,"ToPort":80,"Ipv6Ranges":[{"CidrIpv6":"::/0"}]},{"IpProtocol":"tcp","FromPort":443,"ToPort":443,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},{"IpProtocol":"tcp","FromPort":443,"ToPort":443,"Ipv6Ranges":[{"CidrIpv6":"::/0"}]}]' \
    $AWS_OPTS 2>/dev/null || true

  # Check if CloudFront is enabled
  CF_DIST_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" $AWS_OPTS \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text 2>/dev/null) || true

  if [ -n "$CF_DIST_ID" ] && [ "$CF_DIST_ID" != "None" ]; then
    # CloudFront enabled — allow only CloudFront IPs via managed prefix list
    CF_PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists \
      --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" \
      $AWS_OPTS --query 'PrefixLists[0].PrefixListId' --output text 2>/dev/null) || true
    if [ -n "$CF_PREFIX_LIST" ] && [ "$CF_PREFIX_LIST" != "None" ]; then
      aws ec2 authorize-security-group-ingress --group-id "$ECS_ALB_SG" \
        --ip-permissions \
        "[{\"IpProtocol\":\"tcp\",\"FromPort\":443,\"ToPort\":443,\"PrefixListIds\":[{\"PrefixListId\":\"$CF_PREFIX_LIST\",\"Description\":\"HTTPS from CloudFront only\"}]}]" \
        $AWS_OPTS 2>/dev/null || true
      echo "   ✅ ALB SG $ECS_ALB_SG hardened — HTTPS from CloudFront only (prefix: $CF_PREFIX_LIST)"
    else
      echo "   ⚠️  CloudFront prefix list not found — falling back to CIDR"
      aws ec2 authorize-security-group-ingress --group-id "$ECS_ALB_SG" \
        --ip-permissions \
        "[{\"IpProtocol\":\"tcp\",\"FromPort\":443,\"ToPort\":443,\"IpRanges\":[{\"CidrIp\":\"$ALLOWED_CIDR\",\"Description\":\"HTTPS from corporate network only\"}]}]" \
        $AWS_OPTS 2>/dev/null || true
    fi
  else
    # No CloudFront — use CIDR-based restriction
    ALLOWED_CIDR="${ALLOWED_CIDR:-10.0.0.0/8}"
    aws ec2 authorize-security-group-ingress --group-id "$ECS_ALB_SG" \
      --ip-permissions \
      "[{\"IpProtocol\":\"tcp\",\"FromPort\":443,\"ToPort\":443,\"IpRanges\":[{\"CidrIp\":\"$ALLOWED_CIDR\",\"Description\":\"HTTPS from corporate network only\"}]}]" \
      $AWS_OPTS 2>/dev/null || true
    echo "   ✅ ALB SG $ECS_ALB_SG hardened — HTTPS from $ALLOWED_CIDR only"
  fi
else
  echo "   ⚠️  Express Mode ALB SG not found — skipping hardening"
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
