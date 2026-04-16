#!/bin/bash

# Full Control Plane Deployment Script
# Deploys infrastructure, backend, frontend, and creates a Cognito user.
# Prerequisites: AWS credentials exported, Docker running, Node.js installed, Terraform installed.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
INFRA_DIR="$SCRIPT_DIR"
BACKEND_DIR="$REPO_ROOT/platform/control_plane/backend"
FRONTEND_DIR="$REPO_ROOT/platform/control_plane/frontend"

# ============================================================================
# Preflight Checks
# ============================================================================

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Control Plane Full Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo

echo "Running preflight checks..."

# AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured. Export your credentials and try again.${NC}"
    exit 1
fi
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || echo "us-east-1")}"
echo -e "${GREEN}  AWS account: ${AWS_ACCOUNT} (${AWS_REGION})${NC}"

# Docker
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker is not running.${NC}"
    exit 1
fi
echo -e "${GREEN}  Docker: running${NC}"

# Terraform
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Error: Terraform is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}  Terraform: $(terraform version -json | python3 -c "import sys,json;print(json.load(sys.stdin)['terraform_version'])")${NC}"

# Node
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}  Node: $(node --version)${NC}"

echo

# ============================================================================
# Step 1: Terraform
# ============================================================================

echo -e "${BLUE}[1/6] Infrastructure${NC}"

cd "$INFRA_DIR"

if [ ! -f terraform.tfvars ]; then
    echo "Creating terraform.tfvars from example..."
    cp terraform.tfvars.example terraform.tfvars
fi

# Check for stale terraform state from a different AWS account
if [ -f terraform.tfstate ]; then
    STATE_ACCOUNT=$(python3 -c "
import json, sys
try:
    with open('terraform.tfstate') as f:
        state = json.load(f)
    for r in state.get('resources', []):
        for i in r.get('instances', []):
            arn = i.get('attributes', {}).get('arn', '')
            if ':' in arn:
                parts = arn.split(':')
                if len(parts) >= 5 and parts[4]:
                    print(parts[4])
                    sys.exit(0)
except Exception:
    pass
" 2>/dev/null)

    if [ -n "$STATE_ACCOUNT" ] && [ "$STATE_ACCOUNT" != "$AWS_ACCOUNT" ]; then
        echo -e "${YELLOW}  Existing terraform state references account ${STATE_ACCOUNT}${NC}"
        echo -e "${YELLOW}  but current credentials are for account ${AWS_ACCOUNT}.${NC}"
        echo
        read -p "  Back up and reset state for clean deployment? (yes/no): " reset_state
        if [ "$reset_state" = "yes" ]; then
            backup="terraform.tfstate.backup.${STATE_ACCOUNT}.$(date +%Y%m%d%H%M%S)"
            mv terraform.tfstate "$backup"
            [ -f terraform.tfstate.backup ] && mv terraform.tfstate.backup "${backup}.prev"
            echo -e "${GREEN}  State backed up to ${backup} and reset.${NC}"
        else
            echo -e "${RED}  Cannot proceed with mismatched state. Either reset the state or switch AWS credentials.${NC}"
            exit 1
        fi
    fi
fi

# Clean terraform cache if state was reset
if [ ! -f terraform.tfstate ]; then
    rm -rf .terraform .terraform.lock.hcl
fi

terraform init -input=false
terraform plan -out=tfplan

echo
echo -e "${YELLOW}Review the plan above.${NC}"
read -p "Apply? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Deployment cancelled.${NC}"
    rm -f tfplan
    exit 0
fi

terraform apply tfplan
rm -f tfplan

# Capture outputs
ECR_REPO=$(terraform output -raw ecr_repository_url)
FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)
API_ENDPOINT=$(terraform output -raw api_endpoint)
FRONTEND_URL=$(terraform output -raw frontend_url)
COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id)
ECS_CLUSTER=$(terraform output -raw ecs_cluster_name)
ECS_SERVICE=$(terraform output -raw ecs_service_name)

# Get region from the ECR repo URL (authoritative from terraform)
AWS_REGION=$(echo "$ECR_REPO" | sed 's/.*\.ecr\.\(.*\)\.amazonaws\.com.*/\1/')

echo -e "${GREEN}  Infrastructure deployed.${NC}"
echo

# ============================================================================
# Step 2: Backend Docker Image
# ============================================================================

echo -e "${BLUE}[2/6] Backend Docker image${NC}"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
echo "  Logging into ECR ($ECR_REGISTRY)..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "  Building linux/amd64 image..."
docker build \
    --platform linux/amd64 \
    -f "$BACKEND_DIR/Dockerfile" \
    -t "${ECR_REPO}:latest" \
    "$REPO_ROOT"

echo "  Pushing to ECR..."
docker push "${ECR_REPO}:latest"

echo -e "${GREEN}  Backend image pushed.${NC}"
echo

# ============================================================================
# Step 3: ECS Deployment
# ============================================================================

echo -e "${BLUE}[3/6] ECS rolling deployment${NC}"

aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service "$ECS_SERVICE" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --query 'service.deployments[0].rolloutState' \
    --output text

echo "  Waiting for tasks to stabilize..."
aws ecs wait services-stable \
    --cluster "$ECS_CLUSTER" \
    --services "$ECS_SERVICE" \
    --region "$AWS_REGION" 2>/dev/null || true

echo -e "${GREEN}  ECS service updated.${NC}"
echo

# ============================================================================
# Step 4: Frontend Build
# ============================================================================

echo -e "${BLUE}[4/6] Frontend build${NC}"

cat > "$FRONTEND_DIR/.env.production" <<EOF
VITE_API_URL=${API_ENDPOINT}
VITE_COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
VITE_COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
VITE_COGNITO_REGION=${AWS_REGION}
EOF

cd "$FRONTEND_DIR"
npm install --silent
npm run build

echo -e "${GREEN}  Frontend built.${NC}"
echo

# ============================================================================
# Step 5: Frontend Deploy
# ============================================================================

echo -e "${BLUE}[5/6] Frontend deploy to S3 + CloudFront${NC}"

aws s3 sync "$FRONTEND_DIR/dist/" "s3://$FRONTEND_BUCKET/" --delete --quiet
aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_ID" \
    --paths "/*" \
    --query 'Invalidation.Status' \
    --output text

echo -e "${GREEN}  Frontend deployed.${NC}"
echo

# ============================================================================
# Step 6: Cognito User
# ============================================================================

echo -e "${BLUE}[6/6] Cognito user${NC}"

read -p "  Create a Cognito user? (yes/no): " create_user
if [ "$create_user" = "yes" ]; then
    read -p "  Email: " user_email

    if aws cognito-idp admin-create-user \
        --user-pool-id "$COGNITO_USER_POOL_ID" \
        --username "$user_email" \
        --temporary-password "TempPass1234!" \
        --user-attributes "Name=email,Value=$user_email" \
        --region "$AWS_REGION" &> /dev/null; then
        echo -e "${GREEN}  User created: $user_email${NC}"
        echo -e "${YELLOW}  Temporary password: TempPass1234!${NC}"
        echo "  You will be prompted to set a new password on first login."
    else
        echo -e "${YELLOW}  Could not create user (may already exist).${NC}"
    fi
else
    echo "  Skipped."
fi

echo

# ============================================================================
# Summary
# ============================================================================

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Deployment complete${NC}"
echo -e "${GREEN}============================================${NC}"
echo
echo -e "  Frontend:  ${FRONTEND_URL}"
echo -e "  API:       ${API_ENDPOINT}"
echo -e "  Cognito:   ${COGNITO_USER_POOL_ID}"
echo -e "  ECR:       ${ECR_REPO}"
echo
