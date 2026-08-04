#!/usr/bin/env bash
set -euo pipefail

# Deploy the Control Plane frontend to ECS
# Usage: ./deploy-frontend.sh [--profile AWS_PROFILE] [--region REGION]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Defaults
AWS_PROFILE="${AWS_PROFILE:-default}"
AWS_REGION="${AWS_REGION:-us-east-2}"
ECS_CLUSTER="ava-litellm-test"
ECS_SERVICE="ava-control-plane-frontend"
# Frontend ALB URL baked into the build as VITE_API_URL. Set to your deployment's
# ALB (e.g. http://<alb-name>.<region>.elb.amazonaws.com) or override via env.
FRONTEND_URL="${FRONTEND_URL:-http://<frontend-alb-dns>.${AWS_REGION}.elb.amazonaws.com}"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --region) AWS_REGION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Derive the ECR registry from the authenticated account (works in any account).
AWS_ACCOUNT_ID=$(AWS_PROFILE="$AWS_PROFILE" aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPO="${ECR_REGISTRY}/ava-control-plane-frontend"

# --- Detect container CLI ---
if command -v finch &>/dev/null; then
  CLI=finch
elif command -v docker &>/dev/null; then
  CLI=docker
else
  echo "ERROR: Neither finch nor docker found. Install one to continue."
  exit 1
fi
echo "Using container CLI: $CLI"

# --- Build frontend ---
echo "Building frontend..."
cd "$FRONTEND_DIR"
VITE_API_URL="$FRONTEND_URL" npx vite build

# --- Build Docker image ---
echo "Building Docker image with $CLI..."
$CLI build --platform linux/amd64 -t "$ECR_REPO:latest" .

# --- ECR login ---
echo "Logging into ECR..."
AWS_PROFILE="$AWS_PROFILE" aws ecr get-login-password --region "$AWS_REGION" | \
  $CLI login --username AWS --password-stdin "$ECR_REGISTRY"

# --- Push ---
echo "Pushing image..."
$CLI push "$ECR_REPO:latest"

# --- Force new deployment ---
echo "Deploying to ECS..."
AWS_PROFILE="$AWS_PROFILE" aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment \
  --region "$AWS_REGION" \
  --query 'service.status' \
  --output text

echo ""
echo "Deploy triggered. Service will stabilize in ~90 seconds."
echo "Frontend URL: $FRONTEND_URL"
