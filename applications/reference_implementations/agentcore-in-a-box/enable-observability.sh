#!/bin/bash
# Enable tracing (X-Ray) and application logs (CloudWatch) delivery for the
# non-runtime AgentCore resources: gateway, memory, browser, code-interpreter.
# The runtime itself emits spans via ADOT in its container (see agent/Dockerfile);
# this script wires up the service-side delivery for everything else.
#
# Idempotent: re-running tolerates "already exists" errors.
# Prereq: CloudWatch Transaction Search must be enabled (it is, account-wide).
set -uo pipefail

# Derive region from env; fall back to us-west-2.
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}"
# Derive account from active credentials (portable across accounts).
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# Resolve the env suffix the SAME way deploy.sh/cleanup.sh do: explicit DEMO_ENV,
# else the persisted .demo-env file. deploy.sh always writes a suffixed outputs file.
if [ -z "${DEMO_ENV:-}" ] && [ -f .demo-env ]; then
    DEMO_ENV="$(cat .demo-env)"
fi
DEMO_ENV="${DEMO_ENV:-}"
if [ -z "$DEMO_ENV" ]; then
    echo "ERROR: No DEMO_ENV set and no .demo-env found — run deploy.sh first." >&2
    exit 1
fi
OUTPUTS_FILE=".deployment-outputs-$DEMO_ENV.json"

if [ ! -f "$OUTPUTS_FILE" ]; then
    echo "ERROR: $OUTPUTS_FILE not found. Run deploy.sh first." >&2
    exit 1
fi

GATEWAY_ID=$(jq -r '.gateway_id // empty' "$OUTPUTS_FILE")
MEMORY_ID=$(jq -r '.memory_id // empty' "$OUTPUTS_FILE")
CODE_INTERPRETER_ID=$(jq -r '.code_interpreter_id // empty' "$OUTPUTS_FILE")
# All three AgentCore Identity credential providers — 3LO (USER_FEDERATION), M2M
# (client_credentials), and the FRED API-key vault. Each gets span/log delivery so the
# per-flow traceability isn't limited to 3LO (that was a coverage gap).
CREDENTIAL_PROVIDER_NAME=$(jq -r '.credential_provider_name // empty' "$OUTPUTS_FILE")
M2M_PROVIDER_NAME=$(jq -r '.m2m_provider_name // empty' "$OUTPUTS_FILE")
APIKEY_PROVIDER_NAME=$(jq -r '.apikey_provider_name // empty' "$OUTPUTS_FILE")

if [ -z "$GATEWAY_ID" ] || [ -z "$MEMORY_ID" ] || [ -z "$CODE_INTERPRETER_ID" ]; then
    echo "ERROR: One or more required IDs missing from .deployment-outputs.json" >&2
    echo "  GATEWAY_ID=$GATEWAY_ID  MEMORY_ID=$MEMORY_ID  CODE_INTERPRETER_ID=$CODE_INTERPRETER_ID" >&2
    exit 1
fi

# NOTE: browser is intentionally excluded — the log-delivery API rejects browser
# resources ("not allowed for this LogType"). Browser observability comes from
# session recording (already enabled on agentcore_demo_browser), viewed in the
# AgentCore console, not via CloudWatch vended-log delivery.
RESOURCES=(
  "gateway|${GATEWAY_ID}|arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:gateway/${GATEWAY_ID}"
  "memory|${MEMORY_ID}|arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:memory/${MEMORY_ID}"
  "code-interpreter|${CODE_INTERPRETER_ID}|arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:code-interpreter-custom/${CODE_INTERPRETER_ID}"
)

# AgentCore Identity span/log delivery for ALL THREE credential providers. This is
# what surfaces the GetWorkloadAccessTokenForJWT (carrying user_sub) and
# GetResourceOAuth2Token / GetResourceApiKey (carrying workload.identity.id, oauth2.flow)
# spans in the aws/spans log group — the per-user, per-action traceability the demo points
# at. Covering M2M + the API-key vault (not just 3LO) closes the earlier coverage gap.
if [ -n "$CREDENTIAL_PROVIDER_NAME" ]; then
  RESOURCES+=(
    "identity|${CREDENTIAL_PROVIDER_NAME}|arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:token-vault/default/oauth2credentialprovider/${CREDENTIAL_PROVIDER_NAME}"
  )
fi
if [ -n "$M2M_PROVIDER_NAME" ]; then
  RESOURCES+=(
    "identity|${M2M_PROVIDER_NAME}|arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:token-vault/default/oauth2credentialprovider/${M2M_PROVIDER_NAME}"
  )
fi
if [ -n "$APIKEY_PROVIDER_NAME" ]; then
  RESOURCES+=(
    "identity|${APIKEY_PROVIDER_NAME}|arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:token-vault/default/apikeycredentialprovider/${APIKEY_PROVIDER_NAME}"
  )
fi

# One shared X-Ray trace destination (deliveryDestinationType=XRAY).
echo "Creating shared X-Ray trace destination..."
TRACE_DEST_ARN=$(aws logs put-delivery-destination \
  --name "agentcore-demo-traces-xray" \
  --delivery-destination-type XRAY \
  --region "$REGION" \
  --query "deliveryDestination.arn" --output text 2>/dev/null || \
  aws logs get-delivery-destination --name "agentcore-demo-traces-xray" --region "$REGION" \
    --query "deliveryDestination.arn" --output text 2>/dev/null)
echo "  Trace destination: $TRACE_DEST_ARN"

for entry in "${RESOURCES[@]}"; do
  IFS='|' read -r RTYPE RID RARN <<< "$entry"
  echo ""
  echo "=== $RTYPE ($RID) ==="

  # --- Application logs: source -> CloudWatch Logs group ---
  LOG_GROUP="/aws/vendedlogs/bedrock-agentcore/${RTYPE}/APPLICATION_LOGS/${RID}"
  aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null \
    && echo "  Created log group $LOG_GROUP" || echo "  Log group exists: $LOG_GROUP"

  aws logs put-delivery-source --name "${RID}-logs-src" --log-type APPLICATION_LOGS \
    --resource-arn "$RARN" --region "$REGION" >/dev/null 2>&1 \
    && echo "  + logs delivery-source" || echo "  logs delivery-source exists/failed"

  LOG_DEST_ARN=$(aws logs put-delivery-destination --name "${RID}-logs-dest" \
    --delivery-destination-type CWL \
    --delivery-destination-configuration "destinationResourceArn=arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}" \
    --region "$REGION" --query "deliveryDestination.arn" --output text 2>/dev/null)
  if [ -n "$LOG_DEST_ARN" ]; then
    aws logs create-delivery --delivery-source-name "${RID}-logs-src" \
      --delivery-destination-arn "$LOG_DEST_ARN" --region "$REGION" >/dev/null 2>&1 \
      && echo "  + logs delivery linked" || echo "  logs delivery exists/failed"
  fi

  # --- Traces: source -> shared X-Ray destination (memory & gateway support TRACES) ---
  if [ "$RTYPE" = "memory" ] || [ "$RTYPE" = "gateway" ]; then
    aws logs put-delivery-source --name "${RID}-traces-src" --log-type TRACES \
      --resource-arn "$RARN" --region "$REGION" >/dev/null 2>&1 \
      && echo "  + traces delivery-source" || echo "  traces delivery-source exists/failed"
    if [ -n "$TRACE_DEST_ARN" ]; then
      aws logs create-delivery --delivery-source-name "${RID}-traces-src" \
        --delivery-destination-arn "$TRACE_DEST_ARN" --region "$REGION" >/dev/null 2>&1 \
        && echo "  + traces delivery linked" || echo "  traces delivery exists/failed"
    fi
  fi
done

echo ""
echo "Done. Verify with: aws logs describe-deliveries --region $REGION"
