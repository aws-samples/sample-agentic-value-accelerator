#!/bin/bash
set -euo pipefail

########################################################################
# Sales Recommend — Full Local Deploy (Zero Inputs, Zero Manual Steps)
#
# Run:
#   cd /Users/rrlloro/Projects/2026/sales-recommend/infrastructure/scripts
#   chmod +x deploy-local.sh
#   ./deploy-local.sh
#
# What it does:
#   1. Terraform init
#   2. Deploy ECR + networking + IAM + SSM
#   3. Build + push containers (podman)
#   4. Full terraform apply (creates AgentCore via CloudFormation + ECS + CloudFront)
#   5. Output the CloudFront URL
#
# All output logged to: infrastructure/scripts/logs/deploy-<timestamp>.log
########################################################################

# ==================== DEFAULTS ==========================
REGION="us-east-1"
PROJECT="sales-recommend"
STATE_BUCKET="rrlloro-tf-state-sales-recommend"
LOCK_TABLE="terraform-locks"
KNOWLEDGE_BASE_ID="H1LK4MDM6O"
MODEL_ID="global.anthropic.claude-sonnet-4-6"
AUTH_USERNAME="admin"
AUTH_PASSWORD="ChangeMe2026"
# ========================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$INFRA_DIR")"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/deploy-${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

# Logging: everything to screen AND log file
exec > >(tee -a "$LOG_FILE") 2>&1

log() { echo "[$(date '+%H:%M:%S')] $*"; }
log_section() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════"
}

log "Deploy started"
log "Log file: $LOG_FILE"
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Sales Recommend — Full Deploy                 ║"
echo "║   Region: $REGION   KB: $KNOWLEDGE_BASE_ID      ║"
echo "║   Log: logs/deploy-${TIMESTAMP}.log             ║"
echo "╚══════════════════════════════════════════════════╝"

# ---- Step 0: Check deps ----
log_section "STEP 0: Dependencies"
for cmd in terraform podman aws python3 npm; do
  if command -v "$cmd" >/dev/null 2>&1; then
    log "  ✓ $cmd"
  else
    log "  ✗ $cmd NOT FOUND"; exit 1
  fi
done
log "  AWS Identity:"
aws sts get-caller-identity 2>&1 | sed 's/^/    /'

# ---- Step 1: Terraform Init ----
log_section "STEP 1: Terraform Init"
cd "$INFRA_DIR"

terraform init -input=false \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="dynamodb_table=${LOCK_TABLE}" \
  -upgrade
log "  ✓ Initialized"

# ---- Step 2: Deploy ECR + Networking + IAM + SSM (needed before docker push) ----
log_section "STEP 2: Base Infra (ECR + VPC + IAM + SSM)"

terraform apply -input=false -auto-approve \
  -target=module.ecr \
  -target=module.networking \
  -target=module.iam \
  -target=module.ssm \
  -target=module.observability \
  -var="basic_auth_username=${AUTH_USERNAME}" \
  -var='basic_auth_password='"${AUTH_PASSWORD}"'' \
  -var="knowledge_base_id=${KNOWLEDGE_BASE_ID}" \
  -var="model_id=${MODEL_ID}" \

UI_REPO=$(terraform output -raw ui_ecr_repo_url)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_DOMAIN="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
PROJECT_FULL=$(terraform output -raw project_name_with_suffix)

log "  UI ECR:    ${UI_REPO}"
log "  Project:   ${PROJECT_FULL}"
log "  ✓ Base infra deployed"

# ---- Step 3: Package agent (code deploy) + Build/Push UI container ----
log_section "STEP 3: Package Agent (S3 code) & Build/Push UI"

# Agent — direct CODE deploy. The zip must be SELF-CONTAINED with dependencies
# pre-installed for the managed runtime's platform (ARM64 / Python 3.12),
# otherwise the runtime tries to install heavy deps at cold start and exceeds
# the 30s init limit. We vendor deps inside an arm64 python:3.12 container so
# we get correct native wheels (pydantic-core, etc.).
log "  → Packaging agent code with vendored deps (ARM64/py3.12)..."
BUILD_DIR="${INFRA_DIR}/.agent-build"
AGENT_ZIP="${INFRA_DIR}/agent-deployment.zip"
rm -rf "$BUILD_DIR" "$AGENT_ZIP"
mkdir -p "$BUILD_DIR"

# Install dependencies into the build dir using an ARM64 py3.12 image
podman run --rm --platform linux/arm64 \
  -v "$ROOT_DIR/agent:/src:ro" \
  -v "$BUILD_DIR:/out" \
  python:3.12-slim \
  pip install --no-cache-dir -r /src/requirements.txt -t /out >/dev/null
log "  ✓ Dependencies vendored"

# Add the agent entrypoint at the zip root
cp "$ROOT_DIR/agent/src/recommend.py" "$BUILD_DIR/recommend.py"

# Zip the self-contained package (deps + recommend.py at root)
( cd "$BUILD_DIR" && zip -rq "$AGENT_ZIP" . )
CODE_BUCKET="bedrock-agentcore-codebuild-sources-${ACCOUNT_ID}-${REGION}"
CODE_PREFIX="${PROJECT_FULL}/deployment.zip"
log "  → Uploading $(du -h "$AGENT_ZIP" | cut -f1) to s3://${CODE_BUCKET}/${CODE_PREFIX} ..."
aws s3 cp "$AGENT_ZIP" "s3://${CODE_BUCKET}/${CODE_PREFIX}" --region "$REGION"
rm -rf "$BUILD_DIR" "$AGENT_ZIP"
log "  ✓ Agent code uploaded (direct code deploy, self-contained)"

# UI — still container on ECS Fargate
aws ecr get-login-password --region "$REGION" | \
  podman login --username AWS --password-stdin "$ECR_DOMAIN"
log "  ✓ ECR authenticated"

# UI
log "  → Installing UI deps..."
cd "$ROOT_DIR/ui"
npm install --silent 2>/dev/null || npm install
cd "$INFRA_DIR"

log "  → Building UI..."
podman build --platform linux/amd64 -t "${PROJECT}-ui" "$ROOT_DIR/ui/"
podman tag "${PROJECT}-ui:latest" "${UI_REPO}:latest"
log "  → Pushing UI..."
podman push "${UI_REPO}:latest"
log "  ✓ UI pushed"

# ---- Step 4: Full Terraform Apply ----
# Creates AgentCore runtime via CloudFormation, ECS service, and CloudFront.
# The runtime ARN flows automatically from CloudFormation stack output
# to agentcore module output to ECS module env var.
log_section "STEP 4: Full Terraform Apply (AgentCore + ECS + CloudFront)"

terraform apply -input=false -auto-approve \
  -var="basic_auth_username=${AUTH_USERNAME}" \
  -var='basic_auth_password='"${AUTH_PASSWORD}"'' \
  -var="knowledge_base_id=${KNOWLEDGE_BASE_ID}" \
  -var="model_id=${MODEL_ID}" \

log "  ✓ Full infrastructure deployed"
log "    (Terraform uploads the wiki-agent code zip and repos.txt; the repos.txt"
log "     upload fires the dispatch Lambda -> one CodeBuild build per URL.)"

# ---- Step 5: Force ECS to pull latest image ----
log_section "STEP 5: Force ECS Redeployment"
CLUSTER=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "")
if [ -n "$CLUSTER" ]; then
  SERVICE_NAME=$(aws ecs list-services --cluster "$CLUSTER" --region "$REGION" \
    --query 'serviceArns[0]' --output text 2>/dev/null | xargs basename)
  if [ -n "$SERVICE_NAME" ] && [ "$SERVICE_NAME" != "None" ]; then
    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE_NAME" \
      --force-new-deployment --region "$REGION" > /dev/null 2>&1
    log "  ✓ ECS service redeployed"
  fi
fi

# ---- Done ----
log_section "COMPLETE"
CF_URL=$(terraform output -raw cloudfront_url 2>/dev/null || echo "(propagating...)")
RUNTIME_ARN=$(terraform output -raw agent_runtime_arn 2>/dev/null || echo "(pending)")

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           ✓ DEPLOYMENT COMPLETE                     ║"
echo "╠══════════════════════════════════════════════════════╣"
echo ""
echo "  CloudFront URL:  ${CF_URL}"
echo "  Runtime ARN:     ${RUNTIME_ARN}"
echo "  Auth:            ${AUTH_USERNAME} / ${AUTH_PASSWORD}"
echo ""
echo "  CloudFront may take 2-5 min to propagate."
echo ""
echo "╚══════════════════════════════════════════════════════╝"
log "Deploy completed at $(date)"
