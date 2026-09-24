#!/usr/bin/env bash
#
# Deploy the KYC Controlled Quality Output agent: infra -> container image -> AgentCore runtime.
#
# Self-contained replacement for the FSI Foundry CodeBuild pipeline this use case used before
# it moved to reference_implementations.
#
# State: set STATE_BUCKET (and ideally LOCK_TABLE) for a remote S3 backend — the AVA
# pipeline injects both. Without STATE_BUCKET the script runs in standalone mode and
# keeps state on local disk. Remote state uses a stable, framework-scoped key so a
# redeploy adopts the running deployment rather than trying to recreate it.
#
# The runtime resolves the five governance service URLs from SSM via governance_ssm_prefix,
# so deploy/governance/deploy_all.sh must have run first (../../deploy.sh enforces this).
#
# Usage:
#   ./deploy_agent.sh [--region us-east-1] [--framework langchain_langgraph]
#                     [--ssm-prefix /kyc-gov/demo] [--governance-mode external|local]
#                     [--project-name kyc-governance-insights] [--plan-only]
#
set -euo pipefail
export AWS_PAGER=""

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "$HERE/../../agent" && pwd)"

REGION="${AWS_REGION:-us-east-1}"
FRAMEWORK="langchain_langgraph"
SSM_PREFIX="/kyc-gov/demo"
GOV_MODE="external"
# Short prefix composed into IAM role names (64-char AWS cap) and the value recorded in
# this use case's existing state — keep it aligned with template.json's project_name.
PROJECT_NAME="ava"
USE_CASE_ID="kyc_governance_insights"
PLAN_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)           REGION="$2"; shift 2 ;;
    --framework)        FRAMEWORK="$2"; shift 2 ;;
    --ssm-prefix)       SSM_PREFIX="$2"; shift 2 ;;
    --governance-mode)  GOV_MODE="$2"; shift 2 ;;
    --project-name)     PROJECT_NAME="$2"; shift 2 ;;
    --plan-only)        PLAN_ONLY=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
export AWS_DEFAULT_REGION="$REGION"

case "$FRAMEWORK" in
  langchain_langgraph) ;;
  # Strands was removed from this reference implementation. Accepting it here would build
  # an image whose use-case COPY path does not exist, producing a runtime that cannot start.
  *) echo "ERROR: --framework must be langchain_langgraph (the only implementation shipped)" >&2; exit 1 ;;
esac

command -v terraform >/dev/null || { echo "ERROR: terraform not found" >&2; exit 1; }
DOCKER_BIN="$(command -v docker || command -v finch || true)"
[ -n "$DOCKER_BIN" ] || { echo "ERROR: neither docker nor finch found" >&2; exit 1; }

# The Terraform AWS provider cannot use the CLI's `login_session` authentication (the
# `aws login` flow): it ignores it, falls through to EC2 IMDS, and fails with "No valid
# credential sources found". Bridge the CLI session into the standard environment variables
# so terraform authenticates as we do. Harmless in CodeBuild, where the container credentials
# the provider already understands are simply re-exported.
if aws configure export-credentials --format env >/dev/null 2>&1; then
  eval "$(aws configure export-credentials --format env)"
  echo "==> credentials bridged into the environment for terraform"
fi

# use_case_name is passed explicitly, never left to a module default: agentcore_runtime.yaml
# maps it (not use_case_id) onto the container's USE_CASE_ID, AGENT_NAME and DATA_PREFIX, so a
# wrong value makes the runtime start looking for a use case that is not in the image.
TFVARS=(-var "aws_region=$REGION" -var "framework=$FRAMEWORK" -var "use_case_id=$USE_CASE_ID"
        -var "use_case_name=$USE_CASE_ID")

# project_name is declared by the infra root module only. The runtime module reads it from
# infra's state outputs, and Terraform treats an undeclared -var as a hard error, so this
# must not be added to the shared TFVARS list.
INFRA_TFVARS=("${TFVARS[@]}" -var "project_name=$PROJECT_NAME")

# ---------------------------------------------------------------------------
# Terraform state
#
# infra/ and runtime/ declare a partial `backend "s3"`; the bucket, key and lock
# table are injected here. This follows the sales-recommend reference
# implementation and the Control Plane buildspec, which pass
# -backend-config="bucket=$STATE_BUCKET" / "dynamodb_table=$LOCK_TABLE".
#
# The key is deliberately STABLE (framework-scoped, not deployment-scoped). A
# per-deployment key would hand every redeploy an empty state, and Terraform would
# then try to create an IAM role, ECR repo and AgentCore runtime whose names already
# exist. A stable key makes a redeploy converge on the running deployment.
#
# CI without a state bucket is a hard error rather than a quiet fall back to local
# state, which would be discarded with the build container and orphan every resource
# it created (architecture invariant: fail loudly, never mask missing infrastructure).
STATE_BUCKET="${STATE_BUCKET:-}"
LOCK_TABLE="${LOCK_TABLE:-}"
STATE_PREFIX="${STATE_PREFIX:-foundry/${USE_CASE_ID}/${FRAMEWORK}}"
INFRA_STATE_KEY="${STATE_PREFIX}/infra/terraform.tfstate"
RUNTIME_STATE_KEY="${STATE_PREFIX}/runtime/terraform.tfstate"

if [ -z "$STATE_BUCKET" ]; then
  if [ -n "${CODEBUILD_BUILD_ID:-}" ]; then
    echo "ERROR: STATE_BUCKET is not set but this is running in CodeBuild." >&2
    echo "       Terraform state would be written to the build container and lost, so the" >&2
    echo "       next deploy would try to recreate resources that already exist." >&2
    echo "       Refusing to deploy with throwaway state." >&2
    exit 1
  fi
  echo "==> state: LOCAL (no STATE_BUCKET set — standalone development mode)"
else
  echo "==> state: s3://${STATE_BUCKET}/${STATE_PREFIX}/{infra,runtime}/terraform.tfstate"
  [ -n "$LOCK_TABLE" ] && echo "    lock table: ${LOCK_TABLE}" \
    || echo "    WARNING: no LOCK_TABLE set — concurrent deploys are not protected by a state lock"
fi

# Build the init arguments for one component: init_args <state-key>
init_args() {
  INIT_ARGS=()
  [ -n "$STATE_BUCKET" ] || return 0
  INIT_ARGS=(-backend-config="bucket=${STATE_BUCKET}"
             -backend-config="key=$1"
             -backend-config="region=${REGION}")
  [ -n "$LOCK_TABLE" ] && INIT_ARGS+=(-backend-config="dynamodb_table=${LOCK_TABLE}")
  return 0
}

# When no state bucket is configured the partial backend has nothing to bind to, so
# the s3 backend block is neutralised for standalone runs and Terraform uses local state.
local_backend_override() {  # $1 = component dir
  if [ -n "$STATE_BUCKET" ]; then
    rm -f "$1/zz_local_backend_override.tf"
  else
    cat > "$1/zz_local_backend_override.tf" <<'EOF'
# Generated by deploy_agent.sh for standalone (no STATE_BUCKET) runs.
# Overrides the partial S3 backend so local state is used instead.
terraform {
  backend "local" {}
}
EOF
  fi
}

echo "==> 1/3 infra (IAM role, ECR repo, data bucket)"
local_backend_override "$HERE/infra"
cd "$HERE/infra"
init_args "$INFRA_STATE_KEY"
terraform init -input=false -reconfigure "${INIT_ARGS[@]+"${INIT_ARGS[@]}"}"
if [ "$PLAN_ONLY" -eq 1 ]; then
  terraform plan -input=false "${INFRA_TFVARS[@]}"
else
  terraform apply -input=false -auto-approve "${INFRA_TFVARS[@]}"
fi

ECR_REPO=$(terraform output -raw agentcore_ecr_repository 2>/dev/null || true)
if [ "$PLAN_ONLY" -eq 1 ]; then
  echo "==> plan-only: stopping before image build"; exit 0
fi
[ -n "$ECR_REPO" ] || { echo "ERROR: infra did not output agentcore_ecr_repository" >&2; exit 1; }

echo "==> 2/3 container image  (context=$AGENT_DIR)"
# Unique tag per build: AgentCore will not re-pull an unchanged :latest.
IMAGE_TAG="${FRAMEWORK}-$(date +%Y%m%d-%H%M%S)"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region "$REGION" \
  | "$DOCKER_BIN" login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

# ARM64 only — AgentCore runs arm64.
"$DOCKER_BIN" build --platform linux/arm64 \
  --build-arg USE_CASE_ID="$USE_CASE_ID" \
  --build-arg FRAMEWORK="$FRAMEWORK" \
  -t "${ECR_REPO}:${IMAGE_TAG}" \
  -f "$AGENT_DIR/docker/Dockerfile.agentcore" \
  "$AGENT_DIR"
"$DOCKER_BIN" push "${ECR_REPO}:${IMAGE_TAG}"
echo "    pushed ${ECR_REPO}:${IMAGE_TAG}"

echo "==> 3/3 runtime (AgentCore + governance wiring)"
local_backend_override "$HERE/runtime"
cd "$HERE/runtime"
init_args "$RUNTIME_STATE_KEY"
terraform init -input=false -reconfigure "${INIT_ARGS[@]+"${INIT_ARGS[@]}"}"
terraform apply -input=false -auto-approve "${TFVARS[@]}" \
  -var "image_tag=$IMAGE_TAG" \
  -var "governance_ssm_prefix=$SSM_PREFIX" \
  -var "governance_mode=$GOV_MODE" \
  -var "infra_state_bucket=$STATE_BUCKET" \
  -var "infra_state_key=$INFRA_STATE_KEY"

echo
echo "==> runtime outputs"
terraform output || true
echo
echo "Verify: CUST001 -> APPROVE, CUST047 -> BLOCK"
