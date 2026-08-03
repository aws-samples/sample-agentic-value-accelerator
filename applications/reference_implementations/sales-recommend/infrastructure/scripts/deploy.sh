#!/bin/bash
set -euo pipefail

########################################################################
# Sales Recommend — Full Deploy Script
# Builds containers, pushes to ECR, and applies Terraform.
########################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$INFRA_DIR")"
REGION="${AWS_REGION:-us-east-1}"

echo "============================================"
echo "  Sales Recommend — Deploy"
echo "============================================"
echo ""

# --- 1. Get ECR repo URLs from Terraform ---
cd "$INFRA_DIR"

# Ensure Terraform is initialized
if [ ! -d ".terraform" ]; then
  echo "→ Terraform not initialized. Running terraform init..."
  terraform init
fi

# First apply to create ECR repos (needed before we can push)
echo "→ Applying Terraform (ECR + networking)..."
terraform apply -target=module.ecr -target=module.networking -auto-approve

AGENT_REPO=$(terraform output -raw agent_ecr_repo_url 2>/dev/null || echo "")
UI_REPO=$(terraform output -raw ui_ecr_repo_url 2>/dev/null || echo "")

if [ -z "$AGENT_REPO" ] || [ -z "$UI_REPO" ]; then
  echo "ERROR: Could not get ECR repo URLs from Terraform output."
  exit 1
fi

ACCOUNT_ID=$(echo "$AGENT_REPO" | cut -d. -f1)
ECR_DOMAIN="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# --- 2. Authenticate Docker with ECR ---
echo ""
echo "→ Authenticating Docker with ECR..."
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ECR_DOMAIN"

# --- 3. Build and push Agent container ---
echo ""
echo "→ Building agent container..."
docker build --platform linux/amd64 -t sales-recommend-agent "$ROOT_DIR/agent"
docker tag sales-recommend-agent:latest "$AGENT_REPO:latest"

echo "→ Pushing agent container..."
docker push "$AGENT_REPO:latest"

# --- 4. Build and push UI container ---
echo ""
echo "→ Building UI container..."
docker build --platform linux/amd64 -t sales-recommend-ui "$ROOT_DIR/ui"
docker tag sales-recommend-ui:latest "$UI_REPO:latest"

echo "→ Pushing UI container..."
docker push "$UI_REPO:latest"

# --- 5. Full Terraform apply ---
echo ""
echo "→ Applying full Terraform configuration..."
cd "$INFRA_DIR"
terraform apply -auto-approve

# --- 6. Force ECS service update (pull latest image) ---
echo ""
echo "→ Forcing ECS service update..."
CLUSTER=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "sales-recommend-cluster")
SERVICE="sales-recommend-ui"
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --force-new-deployment \
  --region "$REGION" \
  > /dev/null 2>&1 || echo "  (ECS update skipped — service may not exist yet)"

# --- 7. Done ---
echo ""
echo "============================================"
echo "  ✓ Deploy complete!"
echo "============================================"
echo ""
CF_URL=$(terraform output -raw cloudfront_url 2>/dev/null || echo "(pending)")
echo "  CloudFront URL: $CF_URL"
echo ""
echo "  Default auth: check SSM /sales-recommend/auth/*"
echo ""
