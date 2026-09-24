#!/usr/bin/env bash
#
# Tear down KYC - Controlled Quality Output. Reverse of deploy.sh: UI first, then the agent
# runtime and its infra (they depend on the governance SSM parameters), then console
# services, then governance.
#
# Terraform state: set STATE_BUCKET (and ideally LOCK_TABLE) to use the same remote state
# the deploy wrote — the AVA pipeline injects both. Without it, this script would attach to
# an EMPTY local state and "destroy" nothing while still deleting the CloudFormation
# stacks, leaving the AgentCore runtime, IAM role, ECR repo and S3 buckets orphaned.
#
# Shared, account-wide resources are PRESERVED by default (see PRESERVE_SHARED below).
#
# Usage: ./destroy.sh [--region us-east-1] [--framework langchain_langgraph|strands]
#                     [--yes] [--include-shared]
#
set -uo pipefail
export AWS_PAGER=""

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="${AWS_REGION:-us-east-1}"
FRAMEWORK="langchain_langgraph"
UC_ID="kyc_governance_insights"
ASSUME_YES=0
INCLUDE_SHARED=0
# Must match deploy_agent.sh's PROJECT_NAME. infra composes it into resource_prefix, and
# therefore into the IAM role name, which AWS caps at 64 characters. See INFRA_TFVARS below.
PROJECT_NAME="ava"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)         REGION="$2"; shift 2 ;;
    --framework)      FRAMEWORK="$2"; shift 2 ;;
    --project-name)   PROJECT_NAME="$2"; shift 2 ;;
    --yes)            ASSUME_YES=1; shift ;;
    --include-shared) INCLUDE_SHARED=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
export AWS_DEFAULT_REGION="$REGION"

# CI has no TTY, so the confirmation prompt below can never be answered there. Treat a
# CodeBuild run as pre-confirmed: the Control Plane already asked the operator.
[ -n "${CODEBUILD_BUILD_ID:-}" ] && ASSUME_YES=1

STATE_BUCKET="${STATE_BUCKET:-}"
LOCK_TABLE="${LOCK_TABLE:-}"
STATE_PREFIX="${STATE_PREFIX:-foundry/${UC_ID}/${FRAMEWORK}}"

if [ -z "$STATE_BUCKET" ] && [ -n "${CODEBUILD_BUILD_ID:-}" ]; then
  echo "ERROR: STATE_BUCKET is not set but this is running in CodeBuild." >&2
  echo "       Terraform would attach to an empty local state and destroy nothing, while" >&2
  echo "       the CloudFormation stacks below would still be deleted — orphaning the" >&2
  echo "       runtime, IAM role, ECR repo and buckets. Refusing to run a partial teardown." >&2
  exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")
if [ "$ACCOUNT" = "UNKNOWN" ]; then
  echo "ERROR: no working AWS credentials (aws sts get-caller-identity failed)." >&2
  exit 1
fi

# The Terraform AWS provider cannot use the CLI's `login_session` authentication (the
# `aws login` flow): it ignores it, falls through to EC2 IMDS, and fails with
# "No valid credential sources found". Bridge the CLI session into the standard
# environment variables for this process so terraform authenticates as we do.
# Without this the destroys below fail while the bucket emptying and CloudFormation
# deletions still happen — a half-torn-down deployment.
if aws configure export-credentials --format env >/dev/null 2>&1; then
  eval "$(aws configure export-credentials --format env)"
  echo "==> credentials bridged into the environment for terraform"
else
  echo "WARNING: 'aws configure export-credentials' is unavailable; terraform will have to" >&2
  echo "         find credentials on its own. If it cannot, this run will abort rather than" >&2
  echo "         delete anything else." >&2
fi
cat <<EOF

This DELETES the KYC Controlled Quality Output deployment:
  account            : $ACCOUNT
  region             : $REGION
  terraform state    : ${STATE_BUCKET:+s3://$STATE_BUCKET/$STATE_PREFIX}${STATE_BUCKET:-LOCAL (standalone)}
  console UI         : terraform destroy in iac/terraform/ui (CloudFront, site bucket, proxy lambdas)
  agent runtime      : terraform destroy in iac/terraform/{runtime,infra}
  console services   : CloudFormation stacks kyc-gov-* + the shared origin-verify authorizer
  governance services: CloudFormation stacks kyc-gov-* (governance) + their SSM parameters
  data               : DynamoDB tables, the Cedar policy store and its policies, and the
                       S3 data bucket are destroyed with their stacks — contents included
EOF
if [ "$INCLUDE_SHARED" -eq 1 ]; then
  cat <<EOF
  shared resources   : ALSO DELETING the account-wide X-Ray resource policy and the AVA
                       AgentCore fleet dashboard. Other AgentCore runtimes in this account
                       lose trace ingestion and the fleet view.
EOF
else
  cat <<EOF
  shared resources   : PRESERVING the account-wide X-Ray resource policy
                       (AgentCoreObservabilityXRayAccess) and the AVA AgentCore fleet
                       dashboard, which other runtimes in this account depend on.
                       Pass --include-shared to remove them too.
EOF
fi
echo

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Type 'destroy' to continue: " ans || ans=""
  [ "${ans:-}" = "destroy" ] || { echo "aborted"; exit 1; }
fi

TFVARS=(-var "aws_region=$REGION" -var "framework=$FRAMEWORK"
        -var "use_case_id=$UC_ID" -var "use_case_name=$UC_ID")

# infra ONLY. project_name is declared by the infra root module (and ui), not by runtime,
# and Terraform treats an undeclared -var as a hard error — so it cannot go in TFVARS.
#
# It must be passed explicitly here because the AVA pipeline drops a generated
# `deploy.auto.tfvars.json` into every Terraform directory containing
# `project_name = "<application id>"`. Terraform auto-loads that file, so without an
# explicit -var the teardown computes
#   resource_prefix = "kyc-governance-insights-kycgov-langgraph"
# while deploy_agent.sh built the deployment with "ava-kycgov-langgraph". The resulting IAM
# role name is 65 characters, one over the AWS limit, so `plan -destroy` fails validation
# and the whole teardown aborts leaving every infra resource running. A laptop run never
# sees this: the generated tfvars file only exists inside the pipeline workspace.
INFRA_TFVARS=("${TFVARS[@]}" -var "project_name=$PROJECT_NAME")

FAILED=0

tf_init() {  # $1 = module dir, $2 = state key suffix (infra|runtime|ui)
  cd "$HERE/iac/terraform/$1" || return 1
  if [ -n "$STATE_BUCKET" ]; then
    rm -f zz_local_backend_override.tf
    terraform init -input=false -reconfigure \
      -backend-config="bucket=${STATE_BUCKET}" \
      -backend-config="key=${STATE_PREFIX}/$2/terraform.tfstate" \
      -backend-config="region=${REGION}" \
      ${LOCK_TABLE:+-backend-config="dynamodb_table=${LOCK_TABLE}"} >/dev/null
  else
    cat > zz_local_backend_override.tf <<'EOF'
terraform {
  backend "local" {}
}
EOF
    terraform init -input=false -reconfigure >/dev/null
  fi
}

# Remove every object version and delete marker. These buckets have versioning enabled, so
# `aws s3 rm --recursive` only removes current versions and DeleteBucket then still fails
# with BucketNotEmpty ("You must delete all versions in the bucket").
empty_bucket() {  # $1 = bucket name
  local b="$1" payload
  [ -n "$b" ] || return 0
  aws s3api head-bucket --bucket "$b" >/dev/null 2>&1 || return 0
  echo "    emptying s3://$b (all versions + delete markers)"
  while :; do
    payload=$(aws s3api list-object-versions --bucket "$b" --max-keys 500 --output json 2>/dev/null \
      | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin) or {}
except Exception:
    print(""); raise SystemExit
items = [{"Key": o["Key"], "VersionId": o["VersionId"]}
         for o in (d.get("Versions") or []) + (d.get("DeleteMarkers") or [])]
print(json.dumps({"Objects": items, "Quiet": True}) if items else "")
')
    [ -n "$payload" ] || break
    aws s3api delete-objects --bucket "$b" --delete "$payload" >/dev/null 2>&1 || break
  done
}

# DeleteRepository fails with RepositoryNotEmptyException while images remain.
empty_ecr() {  # $1 = repository name
  local r="$1" ids
  [ -n "$r" ] || return 0
  aws ecr describe-repositories --repository-names "$r" >/dev/null 2>&1 || return 0
  echo "    deleting all images in ECR repository $r"
  while :; do
    ids=$(aws ecr list-images --repository-name "$r" --query 'imageIds[:100]' --output json 2>/dev/null)
    case "${ids:-[]}" in
      ""|"[]"|"null") break ;;
    esac
    aws ecr batch-delete-image --repository-name "$r" --image-ids "$ids" >/dev/null 2>&1 || break
  done
}

# Pull bucket names and the ECR repo out of Terraform state rather than guessing them from
# naming conventions — the access-logs bucket has no module output.
state_resource_names() {  # $1 = terraform type, $2 = attribute
  terraform state pull 2>/dev/null | python3 -c '
import json, sys
want_type, attr = sys.argv[1], sys.argv[2]
try:
    s = json.load(sys.stdin)
except Exception:
    raise SystemExit
for r in s.get("resources", []):
    if r.get("type") == want_type:
        for inst in r.get("instances", []):
            v = (inst.get("attributes") or {}).get(attr)
            if v:
                print(v)
' "$1" "$2"
}

# Drop shared, account-wide resources from state so terraform leaves them in place.
preserve_shared() {
  for addr in aws_xray_resource_policy.agentcore_observability \
              'aws_cloudwatch_dashboard.fleet[0]' \
              'aws_xray_resource_policy.agentcore_observability[0]'; do
    terraform state rm "$addr" >/dev/null 2>&1 \
      && echo "    preserved (removed from state): $addr"
  done
  return 0
}

# Prove a destroy plan can actually run, and SHOW WHY when it cannot. Discarding the plan
# output (the previous behaviour) left the operator with "not viable" and nothing to act
# on, which is the opposite of failing loudly: the teardown stops, resources keep running
# and billing, and the reason is gone. The plan runs ONCE and its output is kept.
plan_destroy_viable() {  # $1 = label, rest = -var arguments
  local label="$1"; shift
  local log="${TMPDIR:-/tmp}/destroy-plan-${label}.log"
  if terraform plan -destroy -input=false "$@" >"$log" 2>&1; then
    return 0
  fi
  echo "ERROR: $label destroy plan failed — terraform reported:" >&2
  # Terraform frames diagnostics with box-drawing characters; fall back to the tail when
  # the failure is not a framed diagnostic (a backend/credential error, for example).
  if grep -aqE "^│|Error:" "$log" 2>/dev/null; then
    grep -aE "^│|Error:" "$log" | head -30 >&2
  else
    tail -30 "$log" >&2
  fi
  echo "    full plan output kept at: $log" >&2
  return 1
}

echo "==> 1/4 console UI (CloudFront, site bucket, proxy lambdas)"
if tf_init ui ui; then
  # agentcore_runtime_arn and use_case_name are required with no defaults. During a
  # teardown the runtime ARN only has to be syntactically present — every resource that
  # consumes it is being removed — but prefer the real value when the state still has it.
  UI_RUNTIME_ARN=$(terraform output -raw agentcore_runtime_arn 2>/dev/null || true)
  [ -n "$UI_RUNTIME_ARN" ] || \
    UI_RUNTIME_ARN="arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT}:runtime/pending-destroy"

  UI_VARS=(-var "aws_region=$REGION" -var "use_case_id=$UC_ID"
           -var "use_case_name=$UC_ID" -var "framework=$FRAMEWORK"
           -var "agentcore_runtime_arn=$UI_RUNTIME_ARN")

  # Confirm the plan is viable BEFORE emptying the bucket. Emptying first and then failing
  # destroys the deployed bundle while leaving the bucket and distribution in place.
  if plan_destroy_viable ui "${UI_VARS[@]}"; then
    # Every bucket this module owns; versioned buckets need all versions removed.
    while read -r b; do empty_bucket "$b"; done < <(state_resource_names aws_s3_bucket bucket)
    terraform destroy -input=false -auto-approve "${UI_VARS[@]}" \
      || { echo "ERROR: ui destroy failed" >&2; FAILED=1; }
  else
    echo "ERROR: ui destroy plan is not viable — leaving the UI untouched." >&2
    FAILED=1
  fi
else
  echo "ERROR: could not initialise ui state — skipping (nothing destroyed here)" >&2
  FAILED=1
fi

echo "==> 2/4 agent runtime"
if tf_init runtime runtime; then
  [ "$INCLUDE_SHARED" -eq 1 ] || preserve_shared
  terraform destroy -input=false -auto-approve "${TFVARS[@]}" \
    -var "image_tag=unused-for-destroy" \
    -var "governance_ssm_prefix=" -var "governance_mode=external" \
    -var "infra_state_bucket=${STATE_BUCKET}" \
    -var "infra_state_key=${STATE_PREFIX}/infra/terraform.tfstate" \
    || { echo "ERROR: runtime destroy failed" >&2; FAILED=1; }
else
  echo "ERROR: could not initialise runtime state — skipping" >&2
  FAILED=1
fi

echo "==> 3/4 agent infra (IAM role, ECR repo, data bucket)"
if tf_init infra infra; then
  # As above: prove the destroy can run before emptying the bucket, so a failure does not
  # wipe the sample data while leaving the bucket standing.
  if plan_destroy_viable infra "${INFRA_TFVARS[@]}"; then
    # Every bucket this module owns (data AND access-logs), plus the ECR images.
    while read -r b; do empty_bucket "$b"; done < <(state_resource_names aws_s3_bucket bucket)
    while read -r r; do empty_ecr "$r"; done < <(state_resource_names aws_ecr_repository name)
    terraform destroy -input=false -auto-approve "${INFRA_TFVARS[@]}" \
      || { echo "ERROR: infra destroy failed" >&2; FAILED=1; }
  else
    echo "ERROR: infra destroy plan is not viable — leaving infra untouched." >&2
    FAILED=1
  fi
else
  echo "ERROR: could not initialise infra state — skipping" >&2
  FAILED=1
fi

# The guardrail is app-owned (created by console-services/deploy_all.sh), so this script
# removes it. Only the app's own default name is deleted: if GUARDRAIL_NAME was overridden
# to point at someone else's guardrail, deleting it would break whatever else uses it.
echo "==> 3b/4 Bedrock guardrail (app-owned)"
GUARDRAIL_NAME="${GUARDRAIL_NAME:-kyc-gov-guardrail}"
if [ "$GUARDRAIL_NAME" != "kyc-gov-guardrail" ]; then
  echo "    skipping: GUARDRAIL_NAME is overridden to '$GUARDRAIL_NAME' — not ours to delete"
else
  GID=$(aws bedrock list-guardrails --region "$REGION" \
    --query "guardrails[?name=='$GUARDRAIL_NAME'].id | [0]" --output text 2>/dev/null || true)
  if [ -z "$GID" ] || [ "$GID" = "None" ]; then
    echo "    none found — nothing to delete"
  else
    # Deleting the guardrail removes all its versions.
    if aws bedrock delete-guardrail --region "$REGION" --guardrail-identifier "$GID" 2>/dev/null; then
      echo "    deleted guardrail $GID ($GUARDRAIL_NAME)"
    else
      echo "    WARNING: could not delete guardrail $GID — remove it by hand if unused" >&2
      FAILED=1
    fi
  fi
fi

echo "==> 4/4 CloudFormation stacks"
# Console services first: their handlers ImportValue the authorizer's export, so the
# authorizer stack cannot be deleted until they are gone.
CONSOLE_STACKS="console-gateway policy-config-proxy deterministic-validator registry-proxy
                hitl grounding-proxy cedar-proxy metrics-proxy cedar-gateway evaluations
                agent-registry"
GOV_STACKS="llm-judge policy-cascade sanctions-pep deterministic-check policy-config"

for s in $CONSOLE_STACKS $GOV_STACKS; do
  echo "    deleting kyc-gov-$s"
  aws cloudformation delete-stack --stack-name "kyc-gov-$s" 2>/dev/null || true
done

echo "    waiting for those stacks to finish deleting"
for s in $CONSOLE_STACKS $GOV_STACKS; do
  aws cloudformation wait stack-delete-complete --stack-name "kyc-gov-$s" 2>/dev/null || true
done

# Only now is the shared authorizer's export unused. Two names exist in the wild: the
# prefixed one this project deploys (kyc-gov-*) and an unprefixed legacy stack from the
# original phase2 rollout. Deleting only the legacy name left the real one behind.
for AUTH_STACK in "kyc-gov-origin-verify-authorizer" "kyc-origin-verify-authorizer"; do
  echo "    deleting $AUTH_STACK"
  aws cloudformation delete-stack --stack-name "$AUTH_STACK" 2>/dev/null || true
  aws cloudformation wait stack-delete-complete --stack-name "$AUTH_STACK" 2>/dev/null || true
done

echo
echo "=== remaining kyc stacks (expect none) ==="
aws cloudformation describe-stacks \
  --query "Stacks[?starts_with(StackName,'kyc')].[StackName,StackStatus]" --output text 2>/dev/null

if [ "$FAILED" -ne 0 ]; then
  echo
  echo "ERROR: at least one Terraform teardown step failed — resources may still exist." >&2
  echo "       Do NOT treat this deployment as destroyed. Re-run after fixing the cause." >&2
  exit 1
fi

echo
echo "Teardown complete."
[ "$INCLUDE_SHARED" -eq 1 ] || echo "Preserved: account-wide X-Ray policy + AVA fleet dashboard (other runtimes use them)."
echo "Not removed here: Bedrock guardrails and any manually created log groups — remove deliberately."
