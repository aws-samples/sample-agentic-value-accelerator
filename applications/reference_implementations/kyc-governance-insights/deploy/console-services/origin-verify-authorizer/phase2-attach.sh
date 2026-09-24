#!/usr/bin/env bash
# Phase 2 — attach the shared origin-verify authorizer to the KYC-exclusive backend HTTP APIs.
# Idempotent: re-running reuses an existing authorizer of the same name per API.
#
# Order of the overall rollout (see DESIGN_DECISION_API_CONSOLIDATION.md, Phase 2):
#   1. deploy the authorizer stack (template-cfn.yaml) — CFN generates the secret in Secrets Manager
#   2. add the x-origin-verify header to CloudFront on BOTH dists  (phase2-cf-inject-header.py add)
#   3. run THIS script for ONE backend first (BACKENDS="validator:n79e2ivfai") and verify
#   4. run THIS script for all five, then phase2-verify.sh
#
# Metrics (dfa5nbg508) is intentionally excluded — shared with control-plane offerings.json.
set -euo pipefail
export AWS_PAGER=""
REGION="${REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$REGION"
AUTH_FN="${AUTH_FN:-kyc-origin-verify-authorizer}"
AUTH_NAME="kyc-origin-verify"
IDENTITY_SOURCE='$request.header.x-origin-verify'

# service:apiId  (override by exporting BACKENDS, e.g. BACKENDS="validator:n79e2ivfai")
BACKENDS="${BACKENDS:-cedar:xgkacmjesb registry:cyrqxuao3b hitl:tovdy9yzy9 grounding:mindupjlp8 validator:n79e2ivfai}"

ACCT=$(aws sts get-caller-identity --query Account --output text)
FN_ARN=$(aws lambda get-function --function-name "$AUTH_FN" --query 'Configuration.FunctionArn' --output text)
AUTH_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FN_ARN}/invocations"
echo "acct=$ACCT  authorizer=$FN_ARN"

for pair in $BACKENDS; do
  svc="${pair%%:*}"; api="${pair##*:}"
  echo "=== $svc ($api) ==="

  # reuse an existing authorizer of the same name, else create one
  aid=$(aws apigatewayv2 get-authorizers --api-id "$api" --region "$REGION" \
        --query "Items[?Name=='${AUTH_NAME}'].AuthorizerId | [0]" --output text)
  if [ "$aid" = "None" ] || [ -z "$aid" ]; then
    aid=$(aws apigatewayv2 create-authorizer --api-id "$api" --region "$REGION" \
          --name "$AUTH_NAME" --authorizer-type REQUEST \
          --identity-source "$IDENTITY_SOURCE" \
          --authorizer-payload-format-version 2.0 --enable-simple-responses \
          --authorizer-result-ttl-in-seconds 300 \
          --authorizer-uri "$AUTH_URI" \
          --query AuthorizerId --output text)
    echo "  created authorizer $aid"
  else
    echo "  reuse authorizer $aid"
  fi

  # allow this API to invoke the authorizer Lambda (idempotent add-permission)
  aws lambda add-permission --function-name "$AUTH_FN" \
      --statement-id "authz-${api}" --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:${REGION}:${ACCT}:${api}/authorizers/${aid}" \
      >/dev/null 2>&1 && echo "  added invoke permission" || echo "  invoke permission already present"

  # attach the authorizer to every route on the API
  routes=$(aws apigatewayv2 get-routes --api-id "$api" --region "$REGION" \
           --query 'Items[].[RouteId,RouteKey]' --output text)
  while read -r rid rkey; do
    [ -z "$rid" ] && continue
    aws apigatewayv2 update-route --api-id "$api" --region "$REGION" \
        --route-id "$rid" --authorization-type CUSTOM --authorizer-id "$aid" >/dev/null
    echo "  route '$rkey' ($rid) -> CUSTOM/$aid"
  done <<< "$routes"
done
echo "DONE. Now run phase2-verify.sh"
