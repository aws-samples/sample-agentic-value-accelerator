#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# deploy.sh — Deploy the Observability Stack (Langfuse v3)
#
# Deploys networking-base (VPC) then a Langfuse pattern of your choice.
#
# Usage:
#   ./deploy.sh                          # Interactive — prompts for pattern
#   ./deploy.sh --pattern ecs            # ECS Fargate (default)
#   ./deploy.sh --pattern eks            # EKS with managed data stores
#   ./deploy.sh --pattern eks-pods       # EKS with all pods
#   ./deploy.sh --destroy                # Destroy Langfuse + networking
#
# Environment variables (all optional):
#   AWS_REGION              — AWS region (default: us-east-1)
#   AWS_PROFILE             — AWS CLI profile to use
#   TF_VAR_project_name     — Project name for networking (default: networking)
#   AUTO_APPROVE            — Set to "true" to skip Terraform prompts
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
NETWORKING_DIR="$(cd "${TEMPLATE_DIR}/../networking-base/iac/terraform" && pwd)"

AWS_REGION="${AWS_REGION:-us-east-1}"
AUTO_APPROVE="${AUTO_APPROVE:-false}"
PATTERN=""
DESTROY=false

# ---------- helpers ----------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

tf_auto_flag() {
  [[ "${AUTO_APPROVE}" == "true" ]] && echo "-auto-approve" || echo ""
}

# ---------- argument parsing -------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pattern)
      PATTERN="$2"; shift 2 ;;
    --destroy)
      DESTROY=true; shift ;;
    --auto-approve)
      AUTO_APPROVE=true; shift ;;
    -h|--help)
      sed -n '3,/^###/p' "$0" | head -n -1 | sed 's/^# \?//'
      exit 0 ;;
    *)
      error "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------- pattern selection ------------------------------------------------

resolve_pattern_dir() {
  case "$1" in
    ecs)       echo "${TEMPLATE_DIR}/iac/terraform_ecs" ;;
    eks)       echo "${TEMPLATE_DIR}/iac/terraform_eks" ;;
    eks-pods)  echo "${TEMPLATE_DIR}/iac/terraform_eks_pods" ;;
    *)         error "Invalid pattern: $1"; exit 1 ;;
  esac
}

select_pattern() {
  if [[ -n "${PATTERN}" ]]; then
    return
  fi

  echo ""
  info "Select a Langfuse deployment pattern:"
  echo ""
  echo "  1) ecs       — ECS Fargate with managed data stores (recommended)"
  echo "  2) eks       — EKS with managed data stores"
  echo "  3) eks-pods  — EKS with all services as pods"
  echo ""
  read -rp "Enter choice [1]: " choice
  choice="${choice:-1}"

  case "${choice}" in
    1|ecs)       PATTERN="ecs" ;;
    2|eks)       PATTERN="eks" ;;
    3|eks-pods)  PATTERN="eks-pods" ;;
    *)           error "Invalid choice: ${choice}"; exit 1 ;;
  esac
}

# ---------- prerequisite checks ----------------------------------------------

check_prerequisites() {
  local missing=0

  for cmd in terraform aws; do
    if ! command -v "$cmd" &>/dev/null; then
      error "Required command not found: ${cmd}"
      missing=1
    fi
  done

  if [[ "${PATTERN}" == "ecs" ]] && ! command -v docker &>/dev/null; then
    warn "Docker not found — image push step will be skipped"
  fi

  if [[ ${missing} -ne 0 ]]; then
    exit 1
  fi

  # Verify AWS credentials
  if ! aws sts get-caller-identity ${AWS_PROFILE:+--profile "$AWS_PROFILE"} &>/dev/null; then
    error "AWS credentials not configured. Set AWS_PROFILE or run 'aws configure'."
    exit 1
  fi

  local account_id
  account_id=$(aws sts get-caller-identity ${AWS_PROFILE:+--profile "$AWS_PROFILE"} --query Account --output text)
  info "AWS Account: ${account_id} | Region: ${AWS_REGION}"
}

# ---------- deploy networking ------------------------------------------------

deploy_networking() {
  info "Deploying networking-base (VPC)..."

  if [[ ! -d "${NETWORKING_DIR}" ]]; then
    error "Networking directory not found: ${NETWORKING_DIR}"
    exit 1
  fi

  pushd "${NETWORKING_DIR}" > /dev/null

  terraform init -input=false
  terraform apply $(tf_auto_flag) -input=false

  success "Networking-base deployed"

  # Verify auto-generated tfvars
  local pattern_dir
  pattern_dir="$(resolve_pattern_dir "${PATTERN}")"
  if [[ -f "${pattern_dir}/network.auto.tfvars.json" ]]; then
    success "Network variables injected into ${PATTERN} pattern"
  else
    warn "network.auto.tfvars.json not found in ${pattern_dir} — Terraform may prompt for VPC vars"
  fi

  popd > /dev/null
}

# ---------- push images (ECS only) -------------------------------------------

push_images() {
  if [[ "${PATTERN}" != "ecs" ]]; then
    return
  fi

  if ! command -v docker &>/dev/null; then
    warn "Skipping image push — Docker not available"
    warn "Run scripts/push-images-to-ecr.sh manually after deploying"
    return
  fi

  info "Pushing container images to ECR..."
  AWS_REGION="${AWS_REGION}" "${SCRIPT_DIR}/push-images-to-ecr.sh"
  success "Images pushed to ECR"
}

# ---------- deploy langfuse --------------------------------------------------

deploy_langfuse() {
  local pattern_dir
  pattern_dir="$(resolve_pattern_dir "${PATTERN}")"

  info "Deploying Langfuse (${PATTERN} pattern)..."

  if [[ ! -d "${pattern_dir}" ]]; then
    error "Pattern directory not found: ${pattern_dir}"
    exit 1
  fi

  pushd "${pattern_dir}" > /dev/null

  terraform init -input=false
  terraform apply $(tf_auto_flag) -input=false

  echo ""
  success "Langfuse deployed successfully!"
  echo ""
  info "Outputs:"
  terraform output
  echo ""

  popd > /dev/null
}

# ---------- destroy ----------------------------------------------------------

destroy_all() {
  select_pattern

  local pattern_dir
  pattern_dir="$(resolve_pattern_dir "${PATTERN}")"

  warn "This will destroy the Langfuse stack and networking infrastructure."
  if [[ "${AUTO_APPROVE}" != "true" ]]; then
    read -rp "Are you sure? (yes/no): " confirm
    if [[ "${confirm}" != "yes" ]]; then
      info "Aborted."
      exit 0
    fi
  fi

  # Destroy Langfuse first
  if [[ -d "${pattern_dir}" ]] && [[ -d "${pattern_dir}/.terraform" ]]; then
    info "Destroying Langfuse (${PATTERN})..."
    pushd "${pattern_dir}" > /dev/null
    terraform destroy $(tf_auto_flag) -input=false
    popd > /dev/null
    success "Langfuse destroyed"
  else
    warn "No Terraform state found for ${PATTERN} — skipping"
  fi

  # Destroy networking
  if [[ -d "${NETWORKING_DIR}" ]] && [[ -d "${NETWORKING_DIR}/.terraform" ]]; then
    info "Destroying networking-base..."
    pushd "${NETWORKING_DIR}" > /dev/null
    terraform destroy $(tf_auto_flag) -input=false
    popd > /dev/null
    success "Networking destroyed"
  else
    warn "No Terraform state found for networking — skipping"
  fi

  success "Teardown complete"
}

# ---------- main -------------------------------------------------------------

main() {
  echo ""
  echo "========================================"
  echo "  Observability Stack — Langfuse v3"
  echo "========================================"
  echo ""

  if [[ "${DESTROY}" == true ]]; then
    destroy_all
    exit 0
  fi

  select_pattern
  check_prerequisites

  echo ""
  info "Pattern:  ${PATTERN}"
  info "Region:   ${AWS_REGION}"
  echo ""

  deploy_networking
  push_images
  deploy_langfuse

  echo ""
  success "Deployment complete!"
  info "Langfuse will be available after DB migrations finish (~2-3 minutes)"
  echo ""
}

main
