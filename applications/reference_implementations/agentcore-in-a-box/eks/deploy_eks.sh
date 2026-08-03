#!/bin/bash
set -euo pipefail
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# WS2 — Deploy the EKS market-data service and expose it as a GOVERNED MCP tool via the AgentCore
# Gateway (OpenAPI target). Run AFTER deploy.sh, against the SAME env. Fully additive + idempotent:
# it never touches the main stack; it only adds an ECR image, K8s workload, an HTTPS front door, a
# credential provider, and ONE gateway-target ('market-data'). Re-runnable — it reconciles in place.
#
# The path proven by this script (Michelle's exact ask — an internal EKS API becomes a governed tool):
#   external MCP client / agent → AgentCore Gateway (CUSTOM_JWT + interceptor RBAC + rate limit)
#      → OpenAPI target → API Gateway HTTP API (HTTPS + valid cert, injects api-key)
#         → public Classic ELB → EKS pods (validate the injected api-key) → quotes
#
# Why the API Gateway hop: the Gateway OpenAPI target requires an HTTPS URL with a valid cert. A
# plain k8s type=LoadBalancer gives a Classic ELB on HTTP only. API Gateway HTTP API gives us the
# HTTPS execute-api URL (trusted cert) for free and transparently proxies to the ELB — the same
# "API Gateway fronts the backend" shape the positions-db (Aurora) target already uses.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# Env suffix — same resolution as deploy.sh (explicit DEMO_ENV else .demo-env).
DEMO_ENV="${DEMO_ENV:-}"
[ -z "$DEMO_ENV" ] && [ -f "$ROOT/.demo-env" ] && DEMO_ENV="$(cat "$ROOT/.demo-env")"
[ -z "$DEMO_ENV" ] && { echo "ERROR: set DEMO_ENV or create .demo-env"; exit 1; }
SFX="-$DEMO_ENV"; STACK_NAME="AgentCoreDemoStack-$DEMO_ENV"
CDK_OUTPUTS="$ROOT/cdk-outputs-$DEMO_ENV.json"
DEPLOY_OUT="$ROOT/.deployment-outputs-$DEMO_ENV.json"
CONTAINER_CLI="$(command -v finch || command -v docker)"

echo "=== EKS market-data → Gateway (env=$DEMO_ENV, region=$REGION) ==="

# ── Resolve Gateway + market bucket (schema store) from the deploy outputs ──
GATEWAY_ID="$(jq -r '.gateway_id // empty' "$DEPLOY_OUT" 2>/dev/null || echo "")"
[ -z "$GATEWAY_ID" ] && GATEWAY_ID="$(aws bedrock-agentcore-control list-gateways --region "$REGION" \
    --query "items[?name=='agentcore-demo-gateway${SFX}'].gatewayId | [0]" --output text 2>/dev/null || echo "")"
[ -z "$GATEWAY_ID" ] || [ "$GATEWAY_ID" = "None" ] && { echo "ERROR: could not resolve Gateway id"; exit 1; }
MARKET_BUCKET="$(jq -r --arg s "$STACK_NAME" '.[$s].MarketBucketName' "$CDK_OUTPUTS")"
echo "  Gateway: $GATEWAY_ID"

CLUSTER="agentcore-demo-eks"
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/agentcore-demo-market-data${SFX}"
IMAGE_TAG="${IMAGE_TAG:-v1}"
IMAGE="${ECR_REPO}:${IMAGE_TAG}"
PROVIDER_NAME="agentcore-demo-market-data-key${SFX}"
TARGET_NAME="market-data"
API_NAME="agentcore-demo-market-data-proxy${SFX}"

# ── 1) ECR: create repo + build/push the image (linux/amd64 to match the t3 nodes) ──
echo "[1/6] Building + pushing image to ECR..."
aws ecr describe-repositories --repository-names "agentcore-demo-market-data${SFX}" --region "$REGION" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "agentcore-demo-market-data${SFX}" --region "$REGION" >/dev/null
aws ecr get-login-password --region "$REGION" | "$CONTAINER_CLI" login --username AWS --password-stdin "${ECR_REPO%%/*}" >/dev/null 2>&1
"$CONTAINER_CLI" build --platform linux/amd64 -t "$IMAGE" "$HERE/app" >/dev/null
"$CONTAINER_CLI" push "$IMAGE" >/dev/null
echo "  pushed $IMAGE"

# ── 2) kubeconfig + apply manifests (Deployment/Service/Secret) ──
echo "[2/6] Applying Kubernetes manifests..."
aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION" >/dev/null
# The shared API key the Gateway will inject + the app validates. Stable per env (persisted) so a
# re-run doesn't rotate it out from under the credential provider.
KEY_FILE="$ROOT/.eks-market-key-$DEMO_ENV"
if [ -f "$KEY_FILE" ]; then API_KEY="$(cat "$KEY_FILE")"; else
    API_KEY="mk_$(python3 -c 'import secrets;print(secrets.token_hex(20))')"; echo "$API_KEY" > "$KEY_FILE"; fi
API_KEY_B64="$(printf '%s' "$API_KEY" | base64)"
sed -e "s#__IMAGE__#${IMAGE}#g" -e "s#__API_KEY_B64__#${API_KEY_B64}#g" \
    "$HERE/k8s/market-data.yaml.tmpl" | kubectl apply -f - >/dev/null
kubectl -n agentcore-demo rollout status deploy/market-data --timeout=180s

# ── 3) wait for the ELB hostname the Service provisions ──
echo "[3/6] Waiting for the ELB hostname..."
ELB_HOST=""
for i in $(seq 1 40); do
    ELB_HOST="$(kubectl -n agentcore-demo get svc market-data -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")"
    [ -n "$ELB_HOST" ] && break
    sleep 10
done
[ -z "$ELB_HOST" ] && { echo "ERROR: ELB hostname not assigned in time"; exit 1; }
echo "  ELB: $ELB_HOST"
# Poll the ELB /healthz until it serves (target registration can lag the DNS assignment).
echo "  waiting for ELB health..."
for i in $(seq 1 40); do
    curl -fsS "http://${ELB_HOST}/healthz" >/dev/null 2>&1 && { echo "  ELB healthy"; break; }
    sleep 10
done

# ── 4) API Gateway HTTP API in front of the ELB (gives HTTPS + a valid cert) ──
echo "[4/6] Creating API Gateway HTTPS front door..."
API_ID="$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text 2>/dev/null || echo "")"
[ "$API_ID" = "None" ] && API_ID=""
if [ -z "$API_ID" ]; then
    API_ID="$(aws apigatewayv2 create-api --name "$API_NAME" --protocol-type HTTP \
        --region "$REGION" --query ApiId --output text)"
fi
# HTTP_PROXY integration → the ELB. ANY method, greedy path, so /quote and /healthz both pass through
# (the app validates the api-key on /quote). The Gateway forwards the injected header untouched.
INTEG_ID="$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" \
    --query "Items[0].IntegrationId" --output text 2>/dev/null || echo "")"
[ "$INTEG_ID" = "None" ] && INTEG_ID=""
if [ -z "$INTEG_ID" ]; then
    INTEG_ID="$(aws apigatewayv2 create-integration --api-id "$API_ID" \
        --integration-type HTTP_PROXY --integration-method ANY \
        --integration-uri "http://${ELB_HOST}/{proxy}" --payload-format-version 1.0 \
        --region "$REGION" --query IntegrationId --output text)"
    aws apigatewayv2 create-route --api-id "$API_ID" --route-key 'ANY /{proxy+}' \
        --target "integrations/${INTEG_ID}" --region "$REGION" >/dev/null
    aws apigatewayv2 create-stage --api-id "$API_ID" --stage-name '$default' \
        --auto-deploy --region "$REGION" >/dev/null
fi
MARKET_DATA_API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"
echo "  HTTPS front door: $MARKET_DATA_API_URL"
# Smoke-test through the HTTPS front door WITH the api-key (proves the whole proxy chain).
sleep 5
curl -fsS -X POST "${MARKET_DATA_API_URL}/quote" -H "x-agentcore-api-key: ${API_KEY}" \
    -H 'Content-Type: application/json' -d '{"symbols":["SPY"]}' >/dev/null 2>&1 \
    && echo "  end-to-end (APIGW→ELB→pod) OK" || echo "  WARNING: end-to-end smoke not green yet (may settle shortly)"

# ── 5) API_KEY credential provider (the Gateway injects the key as x-agentcore-api-key) ──
echo "[5/6] Creating/refreshing the Gateway API_KEY credential provider..."
aws bedrock-agentcore-control create-api-key-credential-provider \
    --name "$PROVIDER_NAME" --api-key "$API_KEY" --region "$REGION" >/dev/null 2>&1 \
|| aws bedrock-agentcore-control update-api-key-credential-provider \
    --name "$PROVIDER_NAME" --api-key "$API_KEY" --region "$REGION" >/dev/null 2>&1 \
|| echo "  (provider create/update skipped)"
PROVIDER_ARN="$(aws bedrock-agentcore-control get-api-key-credential-provider \
    --name "$PROVIDER_NAME" --region "$REGION" --query 'credentialProviderArn' --output text 2>/dev/null || echo "")"
[ -z "$PROVIDER_ARN" ] || [ "$PROVIDER_ARN" = "None" ] && { echo "ERROR: could not resolve credential-provider ARN"; exit 1; }

# ── 6) OpenAPI schema → S3, then the Gateway target (delete+recreate to reload the schema) ──
echo "[6/6] Registering the Gateway OpenAPI target..."
OPENAPI_LOCAL="/tmp/market_data_openapi_${DEMO_ENV}.json"
sed "s#MARKET_DATA_API_URL_PLACEHOLDER#${MARKET_DATA_API_URL}#g" "$HERE/openapi.json" > "$OPENAPI_LOCAL"
OPENAPI_S3_KEY="gateway-schemas/market_data_openapi.json"
aws s3 cp "$OPENAPI_LOCAL" "s3://${MARKET_BUCKET}/${OPENAPI_S3_KEY}" --region "$REGION" >/dev/null
EXISTING_TARGET="$(aws bedrock-agentcore-control list-gateway-targets --gateway-identifier "$GATEWAY_ID" \
    --region "$REGION" --query "items[?name=='${TARGET_NAME}'].targetId | [0]" --output text 2>/dev/null || echo "")"
if [ -n "$EXISTING_TARGET" ] && [ "$EXISTING_TARGET" != "None" ]; then
    echo "  ${TARGET_NAME} target exists ($EXISTING_TARGET) — deleting to reload schema/URL"
    aws bedrock-agentcore-control delete-gateway-target --gateway-identifier "$GATEWAY_ID" \
        --target-id "$EXISTING_TARGET" --region "$REGION" >/dev/null 2>&1 || true
    for _t in $(seq 1 10); do
        aws bedrock-agentcore-control get-gateway-target --gateway-identifier "$GATEWAY_ID" \
            --target-id "$EXISTING_TARGET" --region "$REGION" >/dev/null 2>&1 || break
        sleep 3
    done
fi
aws bedrock-agentcore-control create-gateway-target \
    --gateway-identifier "$GATEWAY_ID" \
    --name "$TARGET_NAME" \
    --description "Realtime market quotes served by an internal service on Amazon EKS (OpenAPI target; governed by the Gateway interceptor + Cedar + per-user rate limits)." \
    --credential-provider-configurations '[{
        "credentialProviderType": "API_KEY",
        "credentialProvider": {
            "apiKeyCredentialProvider": {
                "providerArn": "'"$PROVIDER_ARN"'",
                "credentialParameterName": "x-agentcore-api-key",
                "credentialLocation": "HEADER"
            }
        }
    }]' \
    --target-configuration '{
        "mcp": {
            "openApiSchema": {
                "s3": {"uri": "s3://'"$MARKET_BUCKET"'/'"$OPENAPI_S3_KEY"'"}
            }
        }
    }' \
    --region "$REGION" 2>&1 | head -5 || echo "  target create failed (may already exist)"

# Persist the resolved endpoints for the verify script + docs.
jq -n --arg url "$MARKET_DATA_API_URL" --arg elb "$ELB_HOST" --arg api "$API_ID" \
      --arg img "$IMAGE" --arg prov "$PROVIDER_ARN" \
    '{market_data_api_url:$url, elb_host:$elb, apigw_id:$api, image:$img, provider_arn:$prov}' \
    > "$ROOT/.eks-outputs-$DEMO_ENV.json"

echo ""
echo "=== DONE. market-data is live as a governed Gateway tool (market-data___market_quote). ==="
echo "  HTTPS API : $MARKET_DATA_API_URL"
echo "  ELB       : $ELB_HOST"
echo "  Verify    : eks/verify_eks.sh   (mints a token, calls the tool through the Gateway)"
