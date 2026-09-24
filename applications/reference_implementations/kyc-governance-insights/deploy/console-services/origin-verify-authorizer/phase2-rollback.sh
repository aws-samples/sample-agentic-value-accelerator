#!/usr/bin/env bash
# Phase 2 rollback — detach the origin-verify authorizer from the backend routes and delete
# the authorizers. Non-destructive: backends fall back to their in-Lambda x-api-key check and
# keep working through CloudFront (which still sends x-api-key). Run this if Phase 2 causes any
# breakage. Leaving the x-origin-verify CF header in place is harmless after rollback.
set -euo pipefail
export AWS_PAGER=""
REGION="${REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$REGION"
AUTH_NAME="kyc-origin-verify"
BACKENDS="${BACKENDS:-cedar:xgkacmjesb registry:cyrqxuao3b hitl:tovdy9yzy9 grounding:mindupjlp8 validator:n79e2ivfai}"

for pair in $BACKENDS; do
  svc="${pair%%:*}"; api="${pair##*:}"
  echo "=== $svc ($api) ==="
  aid=$(aws apigatewayv2 get-authorizers --api-id "$api" --region "$REGION" \
        --query "Items[?Name=='${AUTH_NAME}'].AuthorizerId | [0]" --output text)
  # set every CUSTOM route back to NONE
  routes=$(aws apigatewayv2 get-routes --api-id "$api" --region "$REGION" \
           --query 'Items[?AuthorizationType==`CUSTOM`].[RouteId,RouteKey]' --output text)
  while read -r rid rkey; do
    [ -z "$rid" ] && continue
    aws apigatewayv2 update-route --api-id "$api" --region "$REGION" \
        --route-id "$rid" --authorization-type NONE >/dev/null
    echo "  route '$rkey' ($rid) -> NONE"
  done <<< "$routes"
  if [ "$aid" != "None" ] && [ -n "$aid" ]; then
    aws apigatewayv2 delete-authorizer --api-id "$api" --region "$REGION" --authorizer-id "$aid"
    echo "  deleted authorizer $aid"
  fi
done
echo "DONE (rollback). Optional: python3 phase2-cf-inject-header.py remove <dist-id>"
