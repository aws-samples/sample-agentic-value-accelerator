#!/usr/bin/env bash
#
# Service Approval v2 — agent image deploy script.
#
# Wraps the AWS CLI gotchas we hit during M1/M2a:
#   1. `aws update-agent-runtime` shorthand for --environment-variables
#      silently DROPS env vars. Must use JSON form.
#   2. Endpoint liveVersion lags the runtime version after update —
#      poll until liveVersion matches and status=READY before invoking.
#   3. First invoke after promotion can fail with ResourceNotFoundException
#      for ~30s even when status=READY. Sleep before invoking.
#
# Usage:
#   ./deploy.sh                      # build + push + update + verify
#   ./deploy.sh --skip-build         # update existing :latest, skip build
#   ./deploy.sh --smoke-test         # also run M2a Strands smoke-invoke
#
# Reads runtime ID, ECR URI, role ARN, env-var values from `terraform
# output` so it stays in sync with the IaC. Expects the runtime stack
# to already exist — `terraform apply` first if it doesn't.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Build context is the v2 module root — Dockerfile + .dockerignore live
# there alongside agent/ and plugin/ so the build can COPY both as siblings
# without coupling them under one source tree.
V2_ROOT="$SCRIPT_DIR/.."

# All v2 infra is pinned to us-east-1 by the IaC. Don't honor AWS_REGION
# from the operator's shell — it can silently mismatch (caller doing AWS
# work in another region) and the next ECR login + push hits 400 because
# the auth token is regional. Override with V2_AWS_REGION if you ever
# move the v2 stack to a different region.
REGION="${V2_AWS_REGION:-us-east-1}"
SKIP_BUILD=0
RUN_SMOKE=0

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --smoke-test) RUN_SMOKE=1 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

cd "$SCRIPT_DIR"

# ---- read state from terraform outputs ----
RUNTIME_ID="$(terraform output -raw agentcore_runtime_id)"
RUNTIME_ARN="$(terraform output -raw agentcore_runtime_arn)"
ECR_URI="$(terraform output -raw ecr_repository_url)"
ROLE_ARN="$(terraform output -raw iam_role_arn)"

# Env vars for the runtime — must be kept in sync with what main.py reads.
DDB_TABLE="$(terraform output -raw -json 2>/dev/null \
  || terraform output -json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("ddb_table_name", {}).get("value", ""))' 2>/dev/null \
  || echo "")"
# Fallback: derive from account if outputs don't expose them yet.
if [ -z "$DDB_TABLE" ]; then
  ACCT="$(aws sts get-caller-identity --query Account --output text)"
  PREFIX="ava-cp-dev-${ACCT: -6}"
  DDB_TABLE="${PREFIX}-service-approval"
  S3_BUCKET="${PREFIX}-service-approval-artifacts"
else
  S3_BUCKET="$(echo "$DDB_TABLE" | sed 's/$/-artifacts/')"
fi
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-us.anthropic.claude-opus-4-7}"

echo "=== deploy.sh =="
echo "  runtime_id : $RUNTIME_ID"
echo "  ecr_uri    : $ECR_URI"
echo "  ddb_table  : $DDB_TABLE"
echo "  s3_bucket  : $S3_BUCKET"
echo "  model_id   : $BEDROCK_MODEL_ID"
echo "  region     : $REGION"
echo

# ---- 1. build + push ----
if [ "$SKIP_BUILD" = "0" ]; then
  echo "=== [1/4] BUILD + PUSH ==="
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${ECR_URI%/*}" >/dev/null
  docker build --platform linux/arm64 -t "$ECR_URI:latest" "$V2_ROOT"
  docker push "$ECR_URI:latest"
  echo
fi

# ---- 2. update runtime (JSON form, env vars preserved) ----
echo "=== [2/4] UPDATE RUNTIME ==="
ENV_JSON="$(python3 -c "import json; print(json.dumps({'SERVICE_APPROVAL_TABLE':'$DDB_TABLE','SERVICE_APPROVAL_BUCKET':'$S3_BUCKET','BEDROCK_MODEL_ID':'$BEDROCK_MODEL_ID'}))")"
NEW_VERSION=$(aws bedrock-agentcore-control update-agent-runtime \
  --region "$REGION" \
  --agent-runtime-id "$RUNTIME_ID" \
  --agent-runtime-artifact "containerConfiguration={containerUri=$ECR_URI:latest}" \
  --network-configuration "networkMode=PUBLIC" \
  --role-arn "$ROLE_ARN" \
  --environment-variables "$ENV_JSON" \
  --query 'agentRuntimeVersion' --output text)
echo "  new runtime version: $NEW_VERSION"
echo

# ---- 3. wait for endpoint promotion ----
echo "=== [3/4] WAIT FOR ENDPOINT PROMOTION ==="
DEADLINE=$(( $(date +%s) + 1200 ))  # 20 min
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  EP_LIVE=$(aws bedrock-agentcore-control get-agent-runtime-endpoint \
    --region "$REGION" \
    --agent-runtime-id "$RUNTIME_ID" \
    --endpoint-name DEFAULT \
    --query 'liveVersion' --output text 2>/dev/null || echo "?")
  EP_STATUS=$(aws bedrock-agentcore-control get-agent-runtime-endpoint \
    --region "$REGION" \
    --agent-runtime-id "$RUNTIME_ID" \
    --endpoint-name DEFAULT \
    --query 'status' --output text 2>/dev/null || echo "?")
  printf "  [%s] liveVersion=%s status=%s\n" \
    "$(date -u +%H:%M:%S)" "$EP_LIVE" "$EP_STATUS"
  if [ "$EP_LIVE" = "$NEW_VERSION" ] && [ "$EP_STATUS" = "READY" ]; then
    echo "  endpoint promoted"
    break
  fi
  sleep 30
done
if [ "$EP_LIVE" != "$NEW_VERSION" ] || [ "$EP_STATUS" != "READY" ]; then
  echo "ERROR: endpoint never promoted to v$NEW_VERSION READY within 20 min" >&2
  exit 1
fi
echo

# ---- 4. smoke invoke (optional) ----
if [ "$RUN_SMOKE" = "1" ]; then
  echo "=== [4/4] SMOKE INVOKE ==="
  # First-invoke-after-promotion warmup. ~30s is enough; we observed
  # ResourceNotFoundException on faster retries.
  echo "  warming up (30s)..."
  sleep 30
  SLUG="m2a-smoke-$(date -u +%Y%m%dT%H%M%S)"
  SESSION="$(uuidgen | tr 'A-Z' 'a-z')-m2a-padding"
  PAYLOAD=$(mktemp); RESPONSE=$(mktemp)
  cat > "$PAYLOAD" <<JSON
{"slug": "$SLUG", "service": "amazons3", "framework": "ccmv4", "testing_mode": "skip", "smoke_test": true}
JSON
  echo "  slug=$SLUG"
  aws bedrock-agentcore invoke-agent-runtime \
    --region "$REGION" \
    --agent-runtime-arn "$RUNTIME_ARN" \
    --qualifier DEFAULT \
    --runtime-session-id "$SESSION" \
    --payload "fileb://$PAYLOAD" \
    --content-type application/json \
    --accept application/json \
    "$RESPONSE" >/dev/null
  echo "  response: $(cat "$RESPONSE")"
  echo
  echo "  Smoke invocation accepted. Strands result will land at:"
  echo "    s3://$S3_BUCKET/$SLUG/_smoke/strands-smoke.json"
  echo "  Wait ~10-30s, then run:"
  echo "    aws s3 cp s3://$S3_BUCKET/$SLUG/_smoke/strands-smoke.json - --region $REGION"
  rm -f "$PAYLOAD" "$RESPONSE"
fi

echo "=== DONE ==="
