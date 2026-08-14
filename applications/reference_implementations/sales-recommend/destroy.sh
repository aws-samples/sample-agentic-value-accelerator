#!/bin/bash
set -euo pipefail

########################################################################
# Sales Recommend — AVA-Compatible Headless Destroy
#
# Tears down all infrastructure. Called by AVA CodeBuild when ACTION=destroy,
# or by deploy.sh when it detects ACTION=destroy, or directly.
########################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

REGION="${AWS_TARGET_REGION:-${AWS_REGION:-us-east-1}}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PROJECT="sales-recommend"
PROVIDED_DEPLOYMENT_ID="${DEPLOYMENT_ID:-}"
STATE_BUCKET="${STATE_BUCKET:-${PROJECT}-tfstate-${ACCOUNT_ID}-${REGION}}"
LOCK_TABLE="${LOCK_TABLE:-terraform-locks}"

# Must match deploy.sh: target the same per-deployment state object so we
# destroy the intended stack (AVA injects DEPLOYMENT_ID for destroy too).
if [ -n "$PROVIDED_DEPLOYMENT_ID" ]; then
  STATE_KEY="${PROJECT}/${PROVIDED_DEPLOYMENT_ID}/terraform.tfstate"
else
  STATE_KEY="${PROJECT}/terraform.tfstate"
fi

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Sales Recommend — DESTROY                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

cd "$INFRA_DIR"

# Init with backend config
terraform init -input=false -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="dynamodb_table=${LOCK_TABLE}" \
  -backend-config="region=${REGION}" 2>/dev/null || true

# Capture the deployment-scoped project name BEFORE destroying state — it's
# used to locate the one artifact deploy.sh creates outside Terraform (the
# AgentCore code zip) so we can remove it and leave nothing behind.
PROJECT_FULL=$(terraform output -raw project_name_with_suffix 2>/dev/null || echo "")

# Destroy all resources
terraform destroy -input=false -auto-approve \
  -var="aws_region=${REGION}" \
  -var="deployment_id=${DEPLOYMENT_ID:-}" \
  -var="basic_auth_password=unused" 2>/dev/null || true

# ── Clean up the one artifact created imperatively by deploy.sh ──────────
# deploy.sh uploads the self-contained agent code zip to the shared AgentCore
# code bucket at s3://bedrock-agentcore-codebuild-sources-<acct>-<region>/<project>/deployment.zip.
# It is not tracked in Terraform state, so remove it here to avoid leaving a
# residual object behind. The bucket itself is an account-level bootstrap
# bucket (reused by every AgentCore deploy in the account) and is intentionally
# left in place — same treatment as the Terraform state bucket.
if [ -n "$PROJECT_FULL" ]; then
  CODE_BUCKET="bedrock-agentcore-codebuild-sources-${ACCOUNT_ID}-${REGION}"
  echo "→ Removing agent code artifact s3://${CODE_BUCKET}/${PROJECT_FULL}/deployment.zip ..."
  aws s3 rm "s3://${CODE_BUCKET}/${PROJECT_FULL}/deployment.zip" --region "$REGION" 2>/dev/null || true
fi

echo ""
cat > /tmp/outputs.json <<JSON
{
  "deployment_id": "${DEPLOYMENT_ID:-}",
  "status": "destroyed"
}
JSON
echo "  ✓ All resources destroyed."
echo ""
