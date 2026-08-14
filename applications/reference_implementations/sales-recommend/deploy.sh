#!/bin/bash
set -euo pipefail

########################################################################
# Sales Recommend — AVA-Compatible Headless Deploy
#
# This is the entrypoint AVA's CodeBuild calls. Also works standalone
# for local testing. Takes ZERO parameters — uses env vars or defaults.
#
# AVA env vars (injected by pipeline, or auto-defaulted here):
#   DEPLOYMENT_ID, STATE_BUCKET, LOCK_TABLE, AWS_TARGET_REGION, ACTION
########################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

# ── Defaults (AVA overrides these via env vars) ──────────────────────
REGION="${AWS_TARGET_REGION:-${AWS_REGION:-us-east-1}}"
# Capture whether AVA injected a DEPLOYMENT_ID *before* we default it. When AVA
# provides it, we scope the Terraform state key per-deployment so parallel
# deploys in a shared account never clobber each other's state. Locally (no
# DEPLOYMENT_ID) we keep a stable state key so iterative re-runs reuse state.
PROVIDED_DEPLOYMENT_ID="${DEPLOYMENT_ID:-}"
DEPLOYMENT_ID="${DEPLOYMENT_ID:-$(openssl rand -hex 4)}"
PROJECT="sales-recommend"
# NOTE: the Knowledge Base is fully self-provisioned by the `knowledge-base`
# Terraform module (OpenSearch Serverless + S3 + KB). The legacy
# `knowledge_base_id` variable is deprecated/unused, so we no longer set or
# pass it here — the previous hardcoded id pointed at a KB that does not exist
# in a fresh account.
MODEL_ID="${MODEL_ID:-global.anthropic.claude-sonnet-4-6}"
AUTH_USERNAME="${AUTH_USERNAME:-admin}"
AUTH_PASSWORD="${AUTH_PASSWORD:-AVA-Deploy-2026}"
ACTION="${ACTION:-deploy}"

# State backend — auto-created if not exists
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STATE_BUCKET="${STATE_BUCKET:-${PROJECT}-tfstate-${ACCOUNT_ID}-${REGION}}"
LOCK_TABLE="${LOCK_TABLE:-terraform-locks}"

# Per-deployment state isolation: AVA injects a unique DEPLOYMENT_ID, so each
# deployment gets its own state object. Local runs (no injected id) use a stable
# key so re-running deploy.sh updates the same stack instead of orphaning it.
if [ -n "$PROVIDED_DEPLOYMENT_ID" ]; then
  STATE_KEY="${PROJECT}/${PROVIDED_DEPLOYMENT_ID}/terraform.tfstate"
else
  STATE_KEY="${PROJECT}/terraform.tfstate"
fi

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Sales Recommend — AVA Deploy                       ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "  Action:        ${ACTION}"
echo "  Region:        ${REGION}"
echo "  Deployment ID: ${DEPLOYMENT_ID}"
echo "  State Bucket:  ${STATE_BUCKET}"
echo "  State Key:     ${STATE_KEY}"
echo "  Lock Table:    ${LOCK_TABLE}"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Handle destroy action ────────────────────────────────────────────
if [ "$ACTION" = "destroy" ]; then
  exec "$SCRIPT_DIR/destroy.sh"
fi

# ── Step 1: Ensure state backend exists ──────────────────────────────
echo "→ Ensuring Terraform state backend..."
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" 2>/dev/null || true
else
  aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || true
fi
aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled 2>/dev/null || true

aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" 2>/dev/null || true

echo "  ✓ State backend ready"

# ── Step 2: Terraform Init ───────────────────────────────────────────
echo ""
echo "→ Terraform init..."
cd "$INFRA_DIR"
terraform init -input=false -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="dynamodb_table=${LOCK_TABLE}" \
  -backend-config="region=${REGION}"

# ── Step 3: Deploy base infrastructure (ECR + networking + IAM + SSM) ─
echo ""
echo "→ Deploying base infrastructure (ECR, VPC, IAM, SSM)..."
terraform apply -input=false -auto-approve \
  -target=module.ecr \
  -target=module.networking \
  -target=module.iam \
  -target=module.ssm \
  -target=module.observability \
  -var="aws_region=${REGION}" \
  -var="deployment_id=${DEPLOYMENT_ID}" \
  -var="model_id=${MODEL_ID}" \
  -var="basic_auth_username=${AUTH_USERNAME}" \
  -var="basic_auth_password=${AUTH_PASSWORD}" \
  -var="fsi_app_signing_secret=${AVA_FSI_APP_SIGNING_SECRET:-}" \
  -var="ava_ui_login_url=${AVA_UI_LOGIN_URL:-}"

# NOTE: the agent is deployed via AgentCore *code* deploy (a self-contained S3
# zip, see Step 4 below), NOT a container — so there is intentionally no agent
# ECR repository or `agent_ecr_repo_url` output. Only the UI is containerized.
UI_REPO=$(terraform output -raw ui_ecr_repo_url)
ECR_DOMAIN="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "  UI ECR:    ${UI_REPO}"
echo "  ✓ Base infrastructure deployed"

# ── Step 4: Build and push containers ────────────────────────────────
echo ""
echo "→ Authenticating Docker with ECR..."
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ECR_DOMAIN"

echo "→ Packaging agent code (self-contained, ARM64/py3.12) for AgentCore code deploy..."
# The agentcore module is a CODE deploy: it reads a self-contained zip from
# s3://bedrock-agentcore-codebuild-sources-<acct>-<region>/<project>/deployment.zip
# (data.aws_s3_object.agent_code), so the zip MUST exist before the full apply.
# Vendor deps for the managed runtime platform (ARM64 / Python 3.12) so cold
# start doesn't exceed the init limit installing heavy deps.
PROJECT_FULL=$(terraform output -raw project_name_with_suffix)
BUILD_DIR="${INFRA_DIR}/.agent-build"
AGENT_ZIP="${INFRA_DIR}/agent-deployment.zip"
rm -rf "$BUILD_DIR" "$AGENT_ZIP"
mkdir -p "$BUILD_DIR"
docker run --rm --platform linux/arm64 \
  -v "$SCRIPT_DIR/agent:/src:ro" \
  -v "$BUILD_DIR:/out" \
  public.ecr.aws/docker/library/python:3.12-slim \
  pip install --no-cache-dir -r /src/requirements.txt -t /out >/dev/null
cp "$SCRIPT_DIR/agent/src/recommend.py" "$BUILD_DIR/recommend.py"
( cd "$BUILD_DIR" && zip -rq "$AGENT_ZIP" . )
CODE_BUCKET="bedrock-agentcore-codebuild-sources-${ACCOUNT_ID}-${REGION}"
CODE_PREFIX="${PROJECT_FULL}/deployment.zip"
# Ensure the shared AgentCore code bucket exists (may not in a fresh account).
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket --bucket "$CODE_BUCKET" --region "$REGION" 2>/dev/null || true
else
  aws s3api create-bucket --bucket "$CODE_BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || true
fi
echo "→ Uploading agent code to s3://${CODE_BUCKET}/${CODE_PREFIX} ..."
aws s3 cp "$AGENT_ZIP" "s3://${CODE_BUCKET}/${CODE_PREFIX}" --region "$REGION"
rm -rf "$BUILD_DIR" "$AGENT_ZIP"
echo "  ✓ Agent code uploaded (self-contained code deploy)"

echo "→ Building UI container..."
docker build --platform linux/arm64 -t "${PROJECT}-ui" "$SCRIPT_DIR/ui/"
docker tag "${PROJECT}-ui:latest" "${UI_REPO}:latest"
echo "→ Pushing UI container..."
docker push "${UI_REPO}:latest"
echo "  ✓ UI pushed"

# ── Step 5: Full Terraform apply ─────────────────────────────────────
echo ""
echo "→ Full Terraform apply (AgentCore + ECS + CloudFront)..."
terraform apply -input=false -auto-approve \
  -var="aws_region=${REGION}" \
  -var="deployment_id=${DEPLOYMENT_ID}" \
  -var="model_id=${MODEL_ID}" \
  -var="basic_auth_username=${AUTH_USERNAME}" \
  -var="basic_auth_password=${AUTH_PASSWORD}" \
  -var="fsi_app_signing_secret=${AVA_FSI_APP_SIGNING_SECRET:-}" \
  -var="ava_ui_login_url=${AVA_UI_LOGIN_URL:-}"

echo "  ✓ Full infrastructure deployed"

# ── Step 6: Force ECS to pull latest image ───────────────────────────
echo ""
echo "→ Forcing ECS service redeployment..."
CLUSTER=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "")
if [ -n "$CLUSTER" ]; then
  SERVICE_NAME=$(aws ecs list-services --cluster "$CLUSTER" --region "$REGION" \
    --query 'serviceArns[0]' --output text 2>/dev/null | xargs -I{} basename {})
  if [ -n "$SERVICE_NAME" ] && [ "$SERVICE_NAME" != "None" ]; then
    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE_NAME" \
      --force-new-deployment --region "$REGION" > /dev/null 2>&1 || true
    echo "  ✓ ECS service redeployed"
  fi
fi

# ── Done ─────────────────────────────────────────────────────────────
CF_URL=$(terraform output -raw cloudfront_url 2>/dev/null || echo "(propagating...)")
RUNTIME_ARN=$(terraform output -raw agent_runtime_arn 2>/dev/null || echo "(pending)")

# ── Emit outputs for the AVA Control Plane ───────────────────────────
# AVA's CodeBuild buildspec collects /tmp/outputs.json and stores it on the
# deployment record. The Reference Implementations UI wires the "Open App"
# button to outputs.ui_url / outputs.app_url, so publish the CloudFront URL
# under both keys. Only publish a real https URL (skip the propagating stub).
APP_URL=""
if [[ "$CF_URL" == https://* ]]; then
  APP_URL="$CF_URL"
fi
cat > /tmp/outputs.json <<JSON
{
  "deployment_id": "${DEPLOYMENT_ID}",
  "status": "success",
  "app_url": "${APP_URL}",
  "ui_url": "${APP_URL}",
  "cloudfront_url": "${CF_URL}",
  "agent_runtime_arn": "${RUNTIME_ARN}"
}
JSON
echo "→ Wrote /tmp/outputs.json"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           ✓ DEPLOYMENT COMPLETE                     ║"
echo "╠══════════════════════════════════════════════════════╣"
echo ""
echo "  CloudFront URL:  ${CF_URL}"
echo "  Runtime ARN:     ${RUNTIME_ARN}"
echo "  Auth:            ${AUTH_USERNAME} / ${AUTH_PASSWORD}"
echo "  Deployment ID:   ${DEPLOYMENT_ID}"
echo ""
echo "  CloudFront may take 2-5 min to propagate."
echo ""
echo "╚══════════════════════════════════════════════════════╝"
