#!/usr/bin/env bash
set -euo pipefail

# Unified deployment script for AVA Control Plane + LLM Gateway
#
# Usage:
#   ./deploy.sh local          # Local deployment via docker compose
#   ./deploy.sh local down     # Tear down local deployment
#   ./deploy.sh aws            # AWS deployment via Terraform + ECS
#
# Prerequisites:
#   Local: finch/docker with compose support, AWS credentials (for Bedrock)
#   AWS:   finch/docker, AWS CLI, Terraform, valid AWS credentials

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTROL_PLANE_DIR="$SCRIPT_DIR/.."
FRONTEND_DIR="$CONTROL_PLANE_DIR/frontend"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# --- Detect container CLI ---
detect_cli() {
  if command -v finch &>/dev/null; then
    echo "finch"
  elif command -v docker &>/dev/null; then
    echo "docker"
  else
    echo ""
  fi
}

CLI=$(detect_cli)
if [[ -z "$CLI" ]]; then
  echo "ERROR: Neither finch nor docker found. Install one to continue."
  exit 1
fi
echo "Container CLI: $CLI"

# --- Mode selection ---
MODE="${1:-}"
ACTION="${2:-up}"

if [[ -z "$MODE" ]]; then
  echo "Usage: $0 <local|aws> [action]"
  echo ""
  echo "Modes:"
  echo "  local       Deploy locally via docker compose (frontend on :3000, backend on :8000, gateway on :4000)"
  echo "  local down  Tear down local deployment"
  echo "  aws         Deploy to AWS via Terraform + ECS"
  echo ""
  echo "Prerequisites:"
  echo "  Local: $CLI compose, AWS credentials for Bedrock access"
  echo "  AWS:   $CLI, AWS CLI, Terraform, AWS credentials with admin access"
  exit 1
fi

# =============================================================================
# LOCAL MODE
# =============================================================================
deploy_local() {
  local action="${1:-up}"
  cd "$CONTROL_PLANE_DIR"

  case "$action" in
    up|start)
      echo ""
      echo "=== Building frontend ==="
      cd "$FRONTEND_DIR"
      VITE_API_URL="http://localhost:3000" npx vite build 2>&1 | tail -3

      echo ""
      echo "=== Starting local stack ==="
      cd "$CONTROL_PLANE_DIR"

      $CLI compose up --build -d

      echo ""
      echo "=== Local deployment ready ==="
      echo "  Frontend:  http://localhost:3000"
      echo "  Backend:   http://localhost:8000"
      echo "  Gateway:   http://localhost:4000"
      echo "  Master Key: sk-local-dev-key"
      echo ""
      echo "Tear down: $0 local down"
      ;;

    down|stop)
      echo "Stopping local stack..."
      $CLI compose down -v
      echo "Done."
      ;;

    logs)
      $CLI compose logs -f
      ;;

    *)
      echo "Unknown action: $action (use: up, down, logs)"
      exit 1
      ;;
  esac
}

# =============================================================================
# AWS MODE
# =============================================================================
deploy_aws() {
  AWS_PROFILE="${AWS_PROFILE:-default}"
  AWS_REGION="${AWS_REGION:-us-east-2}"
  ECS_CLUSTER="ava-litellm-test"

  echo ""
  echo "=== AWS Deployment ==="
  echo "  Profile: $AWS_PROFILE"
  echo "  Region:  $AWS_REGION"
  echo ""

  # Verify AWS credentials
  echo "Verifying AWS credentials..."
  if ! AWS_PROFILE="$AWS_PROFILE" aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "ERROR: AWS credentials not valid or expired."
    echo "  Profile: $AWS_PROFILE"
    echo "  Region:  $AWS_REGION"
    echo ""
    echo "Fix: refresh credentials or set AWS_PROFILE to a valid profile."
    exit 1
  fi
  echo "  Credentials OK"

  # Derive the ECR registry from the authenticated account (works in any account).
  ECR_ACCOUNT=$(AWS_PROFILE="$AWS_PROFILE" aws sts get-caller-identity --query Account --output text)
  ECR_BASE="${ECR_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

  # ECR Login
  echo "Logging into ECR..."
  AWS_PROFILE="$AWS_PROFILE" aws ecr get-login-password --region "$AWS_REGION" | \
    $CLI login --username AWS --password-stdin "$ECR_BASE"

  # Get frontend URL from Terraform
  cd "$CONTROL_PLANE_DIR/infrastructure/environments/dev"
  FRONTEND_URL=$(AWS_PROFILE="$AWS_PROFILE" terraform output -raw frontend_endpoint 2>/dev/null || echo "")
  if [[ -z "$FRONTEND_URL" ]]; then
    echo "WARNING: No frontend_endpoint in Terraform state. Run 'terraform apply' first."
    echo "Falling back to placeholder URL."
    FRONTEND_URL="http://localhost:3000"
  fi

  # Build frontend
  echo ""
  echo "=== Building frontend ==="
  cd "$FRONTEND_DIR"
  VITE_API_URL="$FRONTEND_URL" npx vite build 2>&1 | tail -3

  # Build and push frontend image
  echo ""
  echo "=== Building & pushing frontend image ==="
  $CLI build --platform linux/amd64 -t "$ECR_BASE/ava-control-plane-frontend:latest" .
  $CLI push "$ECR_BASE/ava-control-plane-frontend:latest"

  # Build and push backend image
  echo ""
  echo "=== Building & pushing backend image ==="
  cd "$REPO_ROOT"
  $CLI build --platform linux/amd64 \
    -f platform/control_plane/backend/Dockerfile \
    -t "$ECR_BASE/ava-control-plane-backend:latest" .
  $CLI push "$ECR_BASE/ava-control-plane-backend:latest"

  # Deploy ECS services
  echo ""
  echo "=== Deploying ECS services ==="
  for svc in ava-control-plane-frontend ava-control-plane-backend; do
    AWS_PROFILE="$AWS_PROFILE" aws ecs update-service \
      --cluster "$ECS_CLUSTER" \
      --service "$svc" \
      --force-new-deployment \
      --region "$AWS_REGION" \
      --query 'service.status' \
      --output text
    echo "  $svc: deployment triggered"
  done

  echo ""
  echo "=== AWS deployment triggered ==="
  echo "  Services will stabilize in ~90 seconds."
  echo "  Frontend: $FRONTEND_URL"
}

# =============================================================================
# MAIN
# =============================================================================
case "$MODE" in
  local)
    deploy_local "$ACTION"
    ;;
  aws)
    deploy_aws
    ;;
  *)
    echo "Unknown mode: $MODE (use: local, aws)"
    exit 1
    ;;
esac
