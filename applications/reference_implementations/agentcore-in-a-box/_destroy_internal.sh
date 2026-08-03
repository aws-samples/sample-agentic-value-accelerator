#!/bin/bash
set -euo pipefail

# Derive region from env; fall back to us-west-2.
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}"

# Resolve the env suffix the SAME way deploy.sh does: explicit DEMO_ENV, else the
# persisted .demo-env file. Guarantees we tear down exactly the instance deployed
# from this checkout.
if [ -z "${DEMO_ENV:-}" ] && [ -f .demo-env ]; then
    DEMO_ENV="$(cat .demo-env)"
fi
export DEMO_ENV="${DEMO_ENV:-}"
if [ -z "$DEMO_ENV" ]; then
    echo "ERROR: No DEMO_ENV set and no .demo-env file found — can't identify the deployment to remove." >&2
    echo "       Set DEMO_ENV=<suffix> (the one used at deploy time) and re-run." >&2
    exit 1
fi
STACK_NAME="AgentCoreDemoStack-$DEMO_ENV"; OUTPUTS_FILE=".deployment-outputs-$DEMO_ENV.json"

# Teardown is DESTRUCTIVE: it deletes the CDK stack (Cognito user pool, DynamoDB data tables,
# S3 buckets) and all AgentCore resources. Require an explicit confirmation unless --force /
# FORCE=1 is given, so a stray `./cleanup.sh` can't silently wipe a demo. (Data tables keep
# PITR + the stack keeps RemovalPolicy.DESTROY for demo teardown; PROD would use RETAIN.)
FORCE="${FORCE:-}"
for _arg in "$@"; do case "$_arg" in --force|-f) FORCE=1 ;; esac; done

echo "========================================="
echo "AgentCore Demo - Cleanup (env='${DEMO_ENV:-live}')"
echo "========================================="

if [ -z "$FORCE" ]; then
    echo ""
    echo "WARNING: this will PERMANENTLY DELETE stack '$STACK_NAME' and its data:"
    echo "  - Cognito user pool (all demo users)"
    echo "  - DynamoDB tables: entitlements, grades/positions, userdata, oauth-sessions, + universes"
    echo "  - S3 buckets (website, market data, agent code) and all AgentCore resources"
    echo ""
    echo "  TIP: to keep a copy of the data tables first, export them, e.g.:"
    echo "       aws dynamodb export-table-to-point-in-time --table-arn <arn> --s3-bucket <bucket>"
    echo "       (PITR is enabled on the data tables, so a point-in-time export is available.)"
    echo ""
    printf "Type the env suffix ('%s') to confirm teardown: " "$DEMO_ENV"
    read -r _confirm
    if [ "$_confirm" != "$DEMO_ENV" ]; then
        echo "Confirmation did not match — aborting. (Re-run with --force to skip this prompt.)"
        exit 1
    fi
fi

if [ ! -f "$OUTPUTS_FILE" ]; then
    echo "No $OUTPUTS_FILE found. Nothing to clean up."
    exit 0
fi

RUNTIME_ID=$(jq -r '.runtime_id // empty' "$OUTPUTS_FILE")
GATEWAY_ID=$(jq -r '.gateway_id // empty' "$OUTPUTS_FILE")
MEMORY_ID=$(jq -r '.memory_id // empty' "$OUTPUTS_FILE")
POLICY_ENGINE_ID=$(jq -r '.policy_engine_id // empty' "$OUTPUTS_FILE")
POLICY_ID=$(jq -r '.policy_id // empty' "$OUTPUTS_FILE")
BROWSER_ID=$(jq -r '.browser_id // empty' "$OUTPUTS_FILE")
CODE_INTERPRETER_ID=$(jq -r '.code_interpreter_id // empty' "$OUTPUTS_FILE")
CREDENTIAL_PROVIDER_NAME=$(jq -r '.credential_provider_name // empty' "$OUTPUTS_FILE")
M2M_PROVIDER_NAME=$(jq -r '.m2m_provider_name // empty' "$OUTPUTS_FILE")
APIKEY_PROVIDER_NAME=$(jq -r '.apikey_provider_name // empty' "$OUTPUTS_FILE")
# Newer ops-plane primitives (Evaluations / Registry / Harness / Optimization).
EVALUATOR_ID=$(jq -r '.evaluator_id // empty' "$OUTPUTS_FILE")
EVAL_ONLINE_CONFIG_ID=$(jq -r '.eval_online_config_id // empty' "$OUTPUTS_FILE")
REGISTRY_ID=$(jq -r '.registry_id // empty' "$OUTPUTS_FILE")
HARNESS_ID=$(jq -r '.harness_id // empty' "$OUTPUTS_FILE")
OPT_CONTROL_BUNDLE_ID=$(jq -r '.opt_control_bundle_id // empty' "$OUTPUTS_FILE")
OPT_TREATMENT_BUNDLE_ID=$(jq -r '.opt_treatment_bundle_id // empty' "$OUTPUTS_FILE")

echo "Deleting AgentCore resources..."

# Delete in reverse dependency order

# Delete all gateway targets before deleting the gateway itself
if [ -n "$GATEWAY_ID" ]; then
    echo "  Deleting gateway targets..."
    TARGET_IDS=$(aws bedrock-agentcore-control list-gateway-targets \
        --gateway-identifier "$GATEWAY_ID" \
        --region "$REGION" \
        --query "items[].targetId" --output text 2>/dev/null || echo "")
    for TARGET_ID in $TARGET_IDS; do
        aws bedrock-agentcore-control delete-gateway-target \
            --gateway-identifier "$GATEWAY_ID" \
            --target-id "$TARGET_ID" \
            --region "$REGION" 2>/dev/null || true
        echo "    Deleted target: $TARGET_ID"
    done
fi

# Delete the runtime's non-DEFAULT endpoints before the runtime itself. DEFAULT is removed
# with the runtime and cannot be deleted on its own. Enumerate rather than assume "demo_endpoint"
# so any extra endpoints (e.g. created during A/B testing) are caught too. The delete is ASYNC
# and slow, so we only FIRE it here (head start while the ops-plane primitives below delete) —
# the actual wait + runtime delete happens further down, once those are out of the way.
if [ -n "$RUNTIME_ID" ]; then
    echo "  Deleting runtime endpoints..."
    EP_NAMES=$(aws bedrock-agentcore-control list-agent-runtime-endpoints \
        --agent-runtime-id "$RUNTIME_ID" --region "$REGION" \
        --query "runtimeEndpoints[?name!='DEFAULT'].name" --output text 2>/dev/null || echo "")
    for EP in $EP_NAMES; do
        echo "    Deleting endpoint: $EP"
        # NOTE: this API takes --endpoint-name (NOT --name). With the wrong flag the call fails
        # silently (swallowed by `|| true`), the endpoint never clears, and the later
        # delete-agent-runtime then hits ConflictException — orphaning the runtime. (Bug fixed
        # 2026-07-20; the harness variant below already used --endpoint-name.)
        aws bedrock-agentcore-control delete-agent-runtime-endpoint \
            --agent-runtime-id "$RUNTIME_ID" --endpoint-name "$EP" --region "$REGION" 2>/dev/null || true
    done
fi

# ── Newer ops-plane primitives, in reverse dependency order ──
# Registry: delete all records before the registry.
if [ -n "$REGISTRY_ID" ]; then
    echo "  Deleting registry records + registry..."
    REC_IDS=$(aws bedrock-agentcore-control list-registry-records --registry-id "$REGISTRY_ID" \
        --region "$REGION" --query "registryRecords[].recordId" --output text 2>/dev/null || echo "")
    for RID in $REC_IDS; do
        aws bedrock-agentcore-control delete-registry-record --registry-id "$REGISTRY_ID" --record-id "$RID" --region "$REGION" 2>/dev/null || true
    done
    aws bedrock-agentcore-control delete-registry --registry-id "$REGISTRY_ID" --region "$REGION" 2>/dev/null || true
fi
# Harness: delete non-DEFAULT endpoints, WAIT for them to clear, then delete the harness.
# (DeleteHarness fails with ConflictException while non-DEFAULT endpoints still exist, and the
# endpoint delete is async — so a fire-and-forget delete here silently orphans the harness.)
if [ -n "$HARNESS_ID" ]; then
    echo "  Deleting harness endpoints + harness..."
    HEP_NAMES=$(aws bedrock-agentcore-control list-harness-endpoints --harness-id "$HARNESS_ID" \
        --region "$REGION" --query "endpoints[?endpointName!='DEFAULT'].endpointName" --output text 2>/dev/null || echo "")
    for HEP in $HEP_NAMES; do
        echo "    Deleting harness endpoint: $HEP"
        aws bedrock-agentcore-control delete-harness-endpoint --harness-id "$HARNESS_ID" --endpoint-name "$HEP" --region "$REGION" 2>/dev/null || true
    done
    # Wait (bounded) for the non-DEFAULT endpoints to disappear, then delete the harness, retrying
    # on the ConflictException that means an endpoint is still tearing down.
    for _i in $(seq 1 20); do
        LEFT=$(aws bedrock-agentcore-control list-harness-endpoints --harness-id "$HARNESS_ID" \
            --region "$REGION" --query "length(endpoints[?endpointName!='DEFAULT'])" --output text 2>/dev/null || echo "0")
        [ "$LEFT" = "0" ] || [ -z "$LEFT" ] || [ "$LEFT" = "None" ] && break
        sleep 15
    done
    for _i in $(seq 1 12); do
        DEL_OUT=$(aws bedrock-agentcore-control delete-harness --harness-id "$HARNESS_ID" --region "$REGION" 2>&1) && break
        echo "$DEL_OUT" | grep -qi "ConflictException" || break   # non-conflict error → stop retrying
        sleep 15
    done
fi
# Evaluations: delete the online-eval config before the custom evaluator (built-ins are not deletable).
[ -n "$EVAL_ONLINE_CONFIG_ID" ] && echo "  Deleting online-eval config + evaluator..." && \
    aws bedrock-agentcore-control delete-online-evaluation-config --online-evaluation-config-id "$EVAL_ONLINE_CONFIG_ID" --region "$REGION" 2>/dev/null || true
[ -n "$EVALUATOR_ID" ] && aws bedrock-agentcore-control delete-evaluator --evaluator-id "$EVALUATOR_ID" --region "$REGION" 2>/dev/null || true
# Optimization: delete both configuration bundles.
[ -n "$OPT_CONTROL_BUNDLE_ID" ] && echo "  Deleting optimization bundles..." && \
    aws bedrock-agentcore-control delete-configuration-bundle --bundle-id "$OPT_CONTROL_BUNDLE_ID" --region "$REGION" 2>/dev/null || true
[ -n "$OPT_TREATMENT_BUNDLE_ID" ] && aws bedrock-agentcore-control delete-configuration-bundle --bundle-id "$OPT_TREATMENT_BUNDLE_ID" --region "$REGION" 2>/dev/null || true

[ -n "$POLICY_ID" ] && aws bedrock-agentcore-control delete-policy --policy-engine-id "$POLICY_ENGINE_ID" --policy-id "$POLICY_ID" --region "$REGION" 2>/dev/null || true
[ -n "$POLICY_ENGINE_ID" ] && aws bedrock-agentcore-control delete-policy-engine --policy-engine-id "$POLICY_ENGINE_ID" --region "$REGION" 2>/dev/null || true
# Runtime: its (async, slow) endpoint deletes were FIRED above. DeleteAgentRuntime fails with
# ConflictException while any endpoint still exists, so wait for the non-DEFAULT endpoints to
# clear, then retry the delete on conflict. A fire-and-forget delete here (the old behaviour)
# silently orphaned the runtime — which then collided with the next same-name deploy.
if [ -n "$RUNTIME_ID" ]; then
    echo "  Waiting for runtime endpoints to clear, then deleting runtime..."
    for _i in $(seq 1 20); do
        LEFT=$(aws bedrock-agentcore-control list-agent-runtime-endpoints --agent-runtime-id "$RUNTIME_ID" \
            --region "$REGION" --query "length(runtimeEndpoints[?name!='DEFAULT'])" --output text 2>/dev/null || echo "0")
        [ "$LEFT" = "0" ] || [ -z "$LEFT" ] || [ "$LEFT" = "None" ] && break
        sleep 15
    done
    for _i in $(seq 1 12); do
        DEL_OUT=$(aws bedrock-agentcore-control delete-agent-runtime --agent-runtime-id "$RUNTIME_ID" --region "$REGION" 2>&1) && break
        echo "$DEL_OUT" | grep -qi "ConflictException" || break   # non-conflict error → stop retrying
        sleep 15
    done
fi
[ -n "$GATEWAY_ID" ] && aws bedrock-agentcore-control delete-gateway --gateway-identifier "$GATEWAY_ID" --region "$REGION" 2>/dev/null || true
[ -n "$MEMORY_ID" ] && aws bedrock-agentcore-control delete-memory --memory-id "$MEMORY_ID" --region "$REGION" 2>/dev/null || true

# Delete browser and code interpreter by ID (the APIs require --browser-id / --code-interpreter-id,
# not a name). IDs are saved to .deployment-outputs.json by deploy.sh.
[ -n "$BROWSER_ID" ] && aws bedrock-agentcore-control delete-browser \
    --browser-id "$BROWSER_ID" --region "$REGION" 2>/dev/null || true
[ -n "$CODE_INTERPRETER_ID" ] && aws bedrock-agentcore-control delete-code-interpreter \
    --code-interpreter-id "$CODE_INTERPRETER_ID" --region "$REGION" 2>/dev/null || true

# FRED API-key credential provider (falls back to the current default name if the
# outputs file predates it). The API-key vault holds the real FRED key.
[ -z "$APIKEY_PROVIDER_NAME" ] && APIKEY_PROVIDER_NAME="agentcore-demo-fred-apikey${DEMO_ENV:+-$DEMO_ENV}"
aws bedrock-agentcore-control delete-api-key-credential-provider --name "$APIKEY_PROVIDER_NAME" --region "$REGION" 2>/dev/null || true

# 3LO Grades OAuth2 credential provider (Grades table/Lambda/API are CDK-owned).
[ -n "$CREDENTIAL_PROVIDER_NAME" ] && aws bedrock-agentcore-control delete-oauth2-credential-provider \
    --name "$CREDENTIAL_PROVIDER_NAME" --region "$REGION" 2>/dev/null || true

# M2M market-data OAuth2 credential provider (market-data API/client are CDK-owned).
[ -z "$M2M_PROVIDER_NAME" ] && M2M_PROVIDER_NAME="agentcore-demo-marketdata-m2m${DEMO_ENV:+-$DEMO_ENV}"
aws bedrock-agentcore-control delete-oauth2-credential-provider \
    --name "$M2M_PROVIDER_NAME" --region "$REGION" 2>/dev/null || true

# Positions-db API-key credential provider (the Aurora cluster + resolver are CDK-owned, so
# cdk destroy handles them; the credential provider is control-plane, so delete it explicitly).
[ -z "$POSITIONS_DB_PROVIDER_NAME" ] && POSITIONS_DB_PROVIDER_NAME="agentcore-demo-positions-db-key${DEMO_ENV:+-$DEMO_ENV}"
aws bedrock-agentcore-control delete-api-key-credential-provider \
    --name "$POSITIONS_DB_PROVIDER_NAME" --region "$REGION" 2>/dev/null || true

# CDK owns the ECR repo and has emptyOnDelete=true, so cdk destroy handles image cleanup.
echo "Destroying CDK stack '$STACK_NAME' (CDK-owned ECR repo is emptied automatically)..."
npx cdk destroy "$STACK_NAME" --force

# Sweep orphaned CloudWatch log groups. `cdk destroy` removes the CDK-managed LogGroup constructs,
# but Lambda-service-auto-created groups (when a function logs before its CDK LogGroup exists) and
# the AgentCore runtime/endpoint groups are NOT stack-managed — they linger with deterministic names
# (`/aws/lambda/agentcore-demo-*-<env>`, `/aws/bedrock-agentcore/runtimes/<runtime-id>-*`). On a
# same-name redeploy the Lambda groups collide (AlreadyExists) and roll the whole stack back, so
# delete them here. Scope tightly to THIS env's suffix to never touch a sibling env's logs.
echo "Sweeping orphaned CloudWatch log groups for env '$DEMO_ENV'..."
ORPHAN_LGS=$(aws logs describe-log-groups --region "$REGION" \
    --log-group-name-prefix "/aws/lambda/agentcore-demo-" \
    --query "logGroups[?ends_with(logGroupName, '-${DEMO_ENV}')].logGroupName" --output text 2>/dev/null || echo "")
# The AgentCore runtime/endpoint groups are keyed by the runtime ID, not the env suffix.
if [ -n "$RUNTIME_ID" ]; then
    RT_LGS=$(aws logs describe-log-groups --region "$REGION" \
        --log-group-name-prefix "/aws/bedrock-agentcore/runtimes/${RUNTIME_ID}" \
        --query "logGroups[].logGroupName" --output text 2>/dev/null || echo "")
    ORPHAN_LGS="$ORPHAN_LGS $RT_LGS"
fi
for LG in $ORPHAN_LGS; do
    [ -z "$LG" ] && continue
    aws logs delete-log-group --log-group-name "$LG" --region "$REGION" 2>/dev/null \
        && echo "    Deleted log group: $LG" || true
done

rm -f "$OUTPUTS_FILE" "cdk-outputs-${DEMO_ENV}.json" ".demo-creds-${DEMO_ENV}" ".demo-creds"
# Remove the persisted suffix only if it matches what we just tore down, so the
# next deploy.sh starts fresh with a new auto-generated suffix.
if [ -f .demo-env ] && [ "$(cat .demo-env)" = "$DEMO_ENV" ]; then
    rm -f .demo-env
fi
echo "Cleanup complete! (env '$DEMO_ENV' removed)"
