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
# REGION PREFLIGHT
# =============================================================================
#
# AVA reads two unrelated regions and a wrong answer for the second one is SILENT. Bedrock,
# CloudWatch, CloudTrail and Service Quotas are all per-region and none of them errors when
# asked about a region you did not mean - they answer 200 with that region's inventory. So
# the AI estate renders as zero, which reads as "we have no agents" rather than "you are
# looking in the wrong place". There is no exception to catch and nothing in the logs.
#
# Terraform asks for this at plan time (var.govern_aws_region has no default, so it prompts).
# Compose has no equivalent, hence this function. Two jobs:
#
#   1. Ask, once, when GOVERN_AWS_REGION is stated nowhere - then persist the answer to .env
#      so it is asked once per checkout rather than on every `up`. A prompt that reappears
#      every time is a prompt people learn to press Enter through.
#   2. Report what the containers will ACTUALLY receive, by asking `compose config` rather
#      than by re-deriving it here. Reimplementing Compose's interpolation in bash would be
#      a second implementation of the rule, free to drift from the first. It also catches the
#      case that reading .env cannot: Compose precedence is shell environment > .env, so an
#      exported AWS_REGION silently beats the file.
_REGION_RE='^[a-z]{2}(-[a-z]+)+-[0-9]$'

# Resolved value of one env key, straight out of `compose config`. Each of the three region
# keys appears exactly once in the rendered config.
resolved_env() {
  cd "$CONTROL_PLANE_DIR"
  $CLI compose config 2>/dev/null \
    | sed -n "s/^[[:space:]]*$1:[[:space:]]*//p" \
    | head -1 \
    | tr -d '"'
}

preflight_regions() {
  cd "$CONTROL_PLANE_DIR"

  local cp_region
  cp_region="$(resolved_env AWS_REGION)"
  [[ -z "$cp_region" ]] && cp_region="(unset)"

  # Stated in the shell, or stated in .env? Either counts as answered. `+x` rather than `-n`
  # on purpose: GOVERN_AWS_REGION="" is a real answer meaning "same as AWS_REGION", and
  # treating it as unset would re-ask a question the deployer already answered.
  local answered=""
  [[ -n "${GOVERN_AWS_REGION+x}" ]] && answered="shell environment"
  if [[ -z "$answered" ]] && grep -qE '^[[:space:]]*GOVERN_AWS_REGION=' .env 2>/dev/null; then
    answered=".env"
  fi

  if [[ -z "$answered" ]]; then
    if [[ ! -t 0 ]]; then
      # Non-interactive (CI, piped input). Do not hang, and do not pretend this was decided.
      # Name the region being fallen back to rather than saying "the default": the compose
      # default is us-east-1, which is a fact about the demo account and not a recommendation,
      # and it can differ from the control-plane region without anything looking wrong.
      local fallback
      fallback="$(resolved_env GOVERN_AWS_REGION)"
      [[ -z "$fallback" ]] && fallback="$cp_region (empty means 'same as AWS_REGION')"
      echo ""
      echo "WARNING: GOVERN_AWS_REGION is not set in the shell or in .env, and there is no"
      echo "         terminal to ask. Falling back to $fallback."
      echo "         If your Bedrock estate is not there, AVA will show an empty AI estate"
      echo "         rather than an error - AWS answers the wrong region with that region's"
      echo "         inventory, not with a failure. Set GOVERN_AWS_REGION to decide this."
    else
      echo ""
      echo "─────────────────────────────────────────────────────────────────────────────"
      echo " Which region is your AI estate in?"
      echo "─────────────────────────────────────────────────────────────────────────────"
      echo ""
      echo " AVA tracks two regions that answer different questions:"
      echo ""
      # printf, not echo: the region is variable-width, and with echo the '?' below drifts
      # out of the column it is meant to be sitting in.
      printf '   %-15s %-12s %s\n' "control plane" "$cp_region" "AVA's own tables - already set"
      printf '   %-15s %-12s %s\n' "governed fleet" "?" "your Bedrock agents, AgentCore runtimes,"
      printf '   %-15s %-12s %s\n' "" "" "guardrails, and their CloudWatch metrics"
      echo ""
      echo " Press Enter to use the control-plane region ($cp_region) - correct if your AI"
      echo " estate and AVA are in the same place."
      echo ""
      echo " Or enter a region if the estate is elsewhere (e.g. us-east-1 while the control"
      echo " plane is in us-east-2). A wrong value here does not error: AVA reads that"
      echo " region's inventory instead and the estate renders as zero."
      echo ""

      local answer=""
      while true; do
        read -r -p " Governed-fleet region [Enter = $cp_region]: " answer || answer=""
        if [[ -z "$answer" ]] || [[ "$answer" =~ $_REGION_RE ]]; then
          break
        fi
        echo "   Not a region. Expected something like us-east-1 or eu-west-2 - check for a"
        echo "   missing hyphen ('us-east1' is not a region, and a malformed region reads as"
        echo "   an empty estate rather than failing). Press Enter to use $cp_region."
      done

      # Persist so this is asked once per checkout. .env is gitignored, so this is a local
      # config write, not a repo change. Empty is written deliberately: the compose file uses
      # the ${VAR-default} form, under which an explicitly empty value stays empty and the
      # backend resolves it to AWS_REGION - which is exactly what "press Enter" meant. Under
      # the ${VAR:-default} form it would come back as the default instead, which is why that
      # form is not used for this variable.
      printf '\n# Governed-fleet region (tier 2). Empty means "same as AWS_REGION".\n' >> .env
      printf 'GOVERN_AWS_REGION=%s\n' "$answer" >> .env
      if [[ -z "$answer" ]]; then
        echo ""
        echo " Recorded GOVERN_AWS_REGION= (empty, i.e. same as AWS_REGION) in .env."
      else
        echo ""
        echo " Recorded GOVERN_AWS_REGION=$answer in .env."
      fi
      echo " Edit or delete that line to change it; you will not be asked again."
      export GOVERN_AWS_REGION="$answer"
    fi
  fi

  # Report what the containers will actually get. Authoritative, because it comes from
  # `compose config` after any answer above was exported.
  local r_cp r_fleet r_guard
  r_cp="$(resolved_env AWS_REGION)"
  r_fleet="$(resolved_env GOVERN_AWS_REGION)"
  r_guard="$(resolved_env GUARDRAILS_TABLE_REGION)"

  echo ""
  echo "=== Region resolution (from '$CLI compose config', not from .env) ==="
  printf '  control plane      %s\n' "${r_cp:-(unset)}"
  if [[ -z "$r_fleet" ]]; then
    printf '  governed fleet     %s   (inherited from the control plane)\n' "${r_cp:-(unset)}"
  else
    printf '  governed fleet     %s\n' "$r_fleet"
  fi
  if [[ -z "$r_guard" ]]; then
    printf '  guardrails table   %s   (inherited from the control plane)\n' "${r_cp:-(unset)}"
  else
    printf '  guardrails table   %s\n' "$r_guard"
  fi

  # Compose precedence is shell env > .env, so a stale export outranks the file silently.
  # Worth naming, because .env is where anyone debugging this will look first.
  local env_file_region
  env_file_region="$(sed -n 's/^[[:space:]]*AWS_REGION=//p' .env 2>/dev/null | head -1)"
  if [[ -n "${AWS_REGION+x}" && -n "$env_file_region" && "$AWS_REGION" != "$env_file_region" ]]; then
    echo ""
    echo "  NOTE: your shell exports AWS_REGION=$AWS_REGION, which overrides .env"
    echo "        ($env_file_region). Compose precedence is shell environment > .env, so the"
    echo "        value above is what the containers get - not what .env says."
  fi
}

# =============================================================================
# LOCAL MODE
# =============================================================================
deploy_local() {
  local action="${1:-up}"
  cd "$CONTROL_PLANE_DIR"

  case "$action" in
    up|start)
      preflight_regions

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
