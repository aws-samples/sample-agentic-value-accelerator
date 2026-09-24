#!/usr/bin/env bash
#
# KYC - Controlled Quality Output — full deployment.
#
# Order is deliberate: the agent runtime resolves the five governance Lambda function names
# from SSM, so the governance stacks (which publish those parameters) must be deployed BEFORE
# the runtime. With GOVERNANCE_MODE=external a runtime holding blank function names fails
# closed and will not APPROVE anything — see README.md "Governance modes".
#
# Usage:
#   ./deploy.sh [--region us-east-1] [--framework langchain_langgraph]
#               [--ssm-prefix /kyc-gov/demo] [--skip-agent] [--skip-ui] [--skip-seeds]
#
set -euo pipefail
export AWS_PAGER=""

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="${AWS_REGION:-us-east-1}"
FRAMEWORK="langchain_langgraph"
SSM_PREFIX="/kyc-gov/demo"
# Underscore form, used in Terraform state keys and resource naming. Deliberately NOT
# taken from $USE_CASE_ID: the AVA pipeline injects the hyphenated template id
# (kyc-governance-insights), which would point at a state key that does not exist.
UC_ID="kyc_governance_insights"
SKIP_AGENT=0
SKIP_UI=0
SKIP_SEEDS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)     REGION="$2"; shift 2 ;;
    --framework)  FRAMEWORK="$2"; shift 2 ;;
    --ssm-prefix) SSM_PREFIX="$2"; shift 2 ;;
    --skip-agent) SKIP_AGENT=1; shift ;;
    --skip-ui)    SKIP_UI=1; shift ;;
    --skip-seeds) SKIP_SEEDS=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
export AWS_DEFAULT_REGION="$REGION"

command -v aws >/dev/null || { echo "ERROR: aws CLI not found" >&2; exit 1; }
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) || {
  echo "ERROR: no valid AWS credentials" >&2; exit 1; }

# The Terraform AWS provider cannot use the CLI's `login_session` authentication (the
# `aws login` flow): it ignores it, falls through to EC2 IMDS, and fails with "No valid
# credential sources found". Bridge the CLI session into the standard environment variables
# so terraform authenticates as we do. destroy.sh does the same — without it a laptop run
# fails partway through, after the CloudFormation stacks have already been deployed.
if aws configure export-credentials --format env >/dev/null 2>&1; then
  eval "$(aws configure export-credentials --format env)"
  echo "==> credentials bridged into the environment for terraform"
fi

echo "==> account=$ACCOUNT region=$REGION framework=$FRAMEWORK ssm_prefix=$SSM_PREFIX"

echo
echo "############ 1/5  governance services (publish SSM function names) ############"
bash "$HERE/deploy/governance/deploy_all.sh" --region "$REGION"

echo
echo "==> verifying the governance function names landed in SSM"
COUNT=$(aws ssm get-parameters-by-path --path "$SSM_PREFIX" \
          --query "length(Parameters[?ends_with(Name,'-function')])" --output text 2>/dev/null || echo 0)
if [ "${COUNT:-0}" -lt 5 ]; then
  echo "ERROR: expected 5 governance *-function parameters under $SSM_PREFIX, found ${COUNT:-0}." >&2
  echo "       The runtime would fail closed. Fix the governance deploy before continuing." >&2
  exit 1
fi
echo "    ok: $COUNT governance function names published"

# The agent runs BEFORE the console services: the console-gateway stack is parameterised
# with the AgentCore runtime id, which only exists once the runtime has been created. The
# previous order (console services first) worked solely because a runtime happened to be
# left over from an earlier deployment and its id was hardcoded as a default.
if [ "$SKIP_AGENT" -eq 0 ]; then
  echo
  echo "############ 2/5  agent (infra -> image -> runtime) ############"
  echo "    Terraform: $HERE/iac/terraform"
  echo "    Pass -var=\"governance_ssm_prefix=$SSM_PREFIX\" so the runtime resolves the function names,"
  echo "    and -var=\"governance_mode=external\"."
  ( cd "$HERE/iac/terraform" && bash ./deploy_agent.sh \
      --region "$REGION" --framework "$FRAMEWORK" --ssm-prefix "$SSM_PREFIX" )
else
  echo; echo "############ 2/5  agent — SKIPPED (--skip-agent) ############"
  echo "    Console services below resolve the runtime id from AgentCore, so they will fail"
  echo "    unless a runtime for this use case already exists."
fi

echo
echo "############ 3/5  console services ############"
bash "$HERE/deploy/console-services/deploy_all.sh" --region "$REGION"

if [ "$SKIP_SEEDS" -eq 0 ]; then
  echo
  echo "############ 4/5  seed demo data ############"
  python3 "$HERE/deploy/console-services/seed_evaluations.py" --region "$REGION"
  python3 "$HERE/deploy/console-services/seed_phase3.py"      --region "$REGION"
else
  echo; echo "############ 4/5  seeds — SKIPPED (--skip-seeds) ############"
fi

if [ "$SKIP_UI" -eq 0 ]; then
  echo
  echo "############ 5/5  console UI ############"
  ( cd "$HERE/ui" && npm install && npm run build )
  [ -f "$HERE/ui/dist/index.html" ] || { echo "ERROR: UI build produced no dist/index.html" >&2; exit 1; }

  # Publish. The site bucket and distribution are read from the ui module's Terraform
  # state (its ui_bucket_name / cloudfront_distribution_id outputs) rather than guessed
  # from a naming convention. Building without publishing would let this script report
  # success while the console kept serving the previous bundle.
  UI_TF="$HERE/iac/terraform/ui"

  # Edge auth is instantiated by this module, so it has to be applied — not merely read.
  # The signing secret is passed through the environment rather than with -var so it does
  # not appear in the process list. The AVA pipeline already exports the TF_VAR_ names;
  # map the AVA_* names across for a local run.
  export TF_VAR_fsi_app_signing_secret="${TF_VAR_fsi_app_signing_secret:-${AVA_FSI_APP_SIGNING_SECRET:-}}"
  export TF_VAR_ava_ui_login_url="${TF_VAR_ava_ui_login_url:-${AVA_UI_LOGIN_URL:-}}"

  if [ -z "$TF_VAR_fsi_app_signing_secret" ]; then
    echo "    WARNING: no AVA signing secret in the environment — edge auth will be DISABLED"
    echo "             and the console plus every /svc/* route will answer anonymous requests."
    echo "             Deploy through the AVA Control Plane, or export AVA_FSI_APP_SIGNING_SECRET,"
    echo "             to enable AVA FSI SSO."
  else
    echo "    AVA FSI SSO enabled (signing secret present)"
  fi

  # The /svc/* origin and behaviour are owned by the ui module. Resolve the gateway from
  # its stack output so nothing has to mutate CloudFront imperatively afterwards.
  # `|| true` matters: if the stack is missing the CLI exits non-zero, and under
  # `set -e` with pipefail that killed the script with a bare exit 254 before the
  # explanatory error below could print.
  SVC_DOMAIN=$(aws cloudformation describe-stacks --stack-name kyc-gov-console-gateway \
    --query "Stacks[0].Outputs[?OutputKey=='GatewayEndpoint'].OutputValue" \
    --output text --region "$REGION" 2>/dev/null || true)
  # Strip the scheme with shell parameter expansion rather than sed: BSD sed (macOS)
  # does not support the GNU `\?` operator, so `s#^https\?://##` silently leaves the
  # scheme in place there and the ui module then rejects the value.
  SVC_DOMAIN="${SVC_DOMAIN#https://}"
  SVC_DOMAIN="${SVC_DOMAIN#http://}"
  SVC_DOMAIN="${SVC_DOMAIN%/}"
  if [ -z "$SVC_DOMAIN" ] || [ "$SVC_DOMAIN" = "None" ]; then
    echo "ERROR: could not resolve the console gateway endpoint from stack kyc-gov-console-gateway." >&2
    echo "       Step 2/5 must have completed. Refusing to deploy a console whose /svc/* routes" >&2
    echo "       would be missing or, worse, left unauthenticated." >&2
    exit 1
  fi
  echo "    /svc/* origin: $SVC_DOMAIN"
  (
    cd "$UI_TF"
    if [ -n "${STATE_BUCKET:-}" ]; then
      rm -f zz_local_backend_override.tf
      terraform init -input=false -reconfigure \
        -backend-config="bucket=${STATE_BUCKET}" \
        -backend-config="key=foundry/${UC_ID}/${FRAMEWORK}/ui/terraform.tfstate" \
        -backend-config="region=${REGION}" \
        ${LOCK_TABLE:+-backend-config="dynamodb_table=${LOCK_TABLE}"} >/dev/null
    else
      # Standalone: neutralise the partial S3 backend so local state is used.
      cat > zz_local_backend_override.tf <<'EOF'
# Generated by deploy.sh for standalone (no STATE_BUCKET) runs.
terraform {
  backend "local" {}
}
EOF
      terraform init -input=false -reconfigure >/dev/null
    fi
  ) || { echo "ERROR: could not initialise the ui Terraform state" >&2; exit 1; }

  # The runtime ARN is a required input. It comes from the runtime module applied in
  # step 3/5, so a --skip-agent run on a fresh workspace cannot supply it.
  RUNTIME_ARN=$( (cd "$HERE/iac/terraform/runtime" && terraform output -raw agentcore_runtime_arn 2>/dev/null) || true)
  if [ -z "$RUNTIME_ARN" ]; then
    echo "ERROR: could not read agentcore_runtime_arn from the runtime module's state." >&2
    echo "       Run step 3/5 (the agent) before the UI, or drop --skip-agent." >&2
    exit 1
  fi

  echo "    applying the ui module (CloudFront, site bucket, proxy lambdas, edge auth)"
  ( cd "$UI_TF" && terraform apply -input=false -auto-approve \
      -var "aws_region=$REGION" \
      -var "use_case_id=$UC_ID" \
      -var "use_case_name=$UC_ID" \
      -var "framework=$FRAMEWORK" \
      -var "agentcore_runtime_arn=$RUNTIME_ARN" \
      -var "svc_gateway_domain=$SVC_DOMAIN" ) \
    || { echo "ERROR: ui terraform apply failed" >&2; exit 1; }

  UI_BUCKET=$(cd "$UI_TF" && terraform output -raw ui_bucket_name 2>/dev/null || true)
  UI_DIST=$(cd "$UI_TF" && terraform output -raw cloudfront_distribution_id 2>/dev/null || true)
  UI_URL=$(cd "$UI_TF" && terraform output -raw ui_url 2>/dev/null || true)

  if [ -z "$UI_BUCKET" ] || [ -z "$UI_DIST" ]; then
    echo "ERROR: the ui module applied but produced no ui_bucket_name/cloudfront_distribution_id." >&2
    echo "       Refusing to finish silently with a stale console." >&2
    exit 1
  fi

  echo "    bucket=$UI_BUCKET  distribution=$UI_DIST"
  # runtime-config.json IS published from the bundle. It used to be excluded here on the
  # grounds that it was account-specific and hand-maintained in the bucket — that is no
  # longer true: it now holds only same-origin relative paths (/svc/*), no api key and no
  # account id, so the committed copy is correct in every account. Excluding it meant a
  # freshly created bucket had NO runtime-config.json at all, every cfgEnv() lookup
  # returned undefined, and the console silently fell back to scripted content for every
  # live control while still looking healthy.
  aws s3 sync "$HERE/ui/dist/" "s3://${UI_BUCKET}/" --delete --region "$REGION" \
    || { echo "ERROR: UI sync to s3://${UI_BUCKET}/ failed" >&2; exit 1; }

  # Prove the config landed: without it the console has no service endpoints at all.
  aws s3api head-object --bucket "$UI_BUCKET" --key runtime-config.json >/dev/null 2>&1 \
    || { echo "ERROR: runtime-config.json is missing from s3://${UI_BUCKET}/ — the console" >&2
         echo "       would have no /svc/* endpoints and every live control would degrade." >&2
         exit 1; }
  INVALIDATION=$(aws cloudfront create-invalidation --distribution-id "$UI_DIST" \
    --paths '/*' --query "Invalidation.Id" --output text) \
    || { echo "ERROR: CloudFront invalidation failed for $UI_DIST" >&2; exit 1; }
  echo "    published; invalidation $INVALIDATION"
  [ -n "$UI_URL" ] && echo "    console: $UI_URL"

  # Publish outputs for the Control Plane. The buildspec picks up /tmp/outputs.json and
  # stores it on the deployment record; the Reference Implementations page only renders
  # its "Open App" button when one of ui_url / app_url / cloudfront_url / frontend_url is
  # present. Without this the deployment shows as successful but offers no way in — and
  # since edge auth now requires a minted handoff token, pasting the URL by hand just
  # redirects to the AVA login.
  cat > /tmp/outputs.json <<JSON
{
  "deployment_id": "${DEPLOYMENT_ID:-local}",
  "status": "success",
  "ui_url": "${UI_URL}",
  "cloudfront_distribution_id": "${UI_DIST}",
  "ui_bucket": "${UI_BUCKET}",
  "svc_gateway_url": "https://${SVC_DOMAIN}",
  "agentcore_runtime_arn": "${RUNTIME_ARN}",
  "governance_ssm_prefix": "${SSM_PREFIX}"
}
JSON
  echo "    wrote /tmp/outputs.json (ui_url -> Open App button in the Control Plane)"
else
  echo; echo "############ 5/5  UI — SKIPPED (--skip-ui) ############"
fi

echo
echo "==> done. Verify:"
echo "    curl -s -o /dev/null -w '%{http_code}\\n' https://<dist>.cloudfront.net/svc/health"
echo "    CUST001 -> APPROVE, CUST047 -> BLOCK"
