#!/usr/bin/env bash
#
# seed_metrics.sh — provision + seed the KYC governance "metrics-history" read path.
#
# What it does (idempotent, safe to re-run):
#   1. Verifies AWS credentials are present/valid (fails fast otherwise).
#   2. Ensures the consolidated console gateway exposes the
#      `ANY /svc/metrics/metrics-history` route, pointing at the in-account
#      metrics-proxy integration. The route is created ONLY if absent; an
#      existing route is left untouched.
#   3. Runs seed_phase3.py to (re)seed kyc-metrics-history (+ pinned evaluation
#      records) in DynamoDB. seed_phase3.py is itself idempotent.
#   4. Curls the metrics-history endpoint and asserts HTTP 200.
#
# Every identifier is overridable so this stays portable across accounts.
#
# Usage:
#   ./seed_metrics.sh [--region us-east-1] [--gateway-id 46md2r9izf] \
#                     [--integration-id krzr5xcibc] [--verify-url URL] \
#                     [--skip-verify]
#
# Optional env (only used for the verify curl against an edge-protected gateway):
#   API_KEY        value sent as the x-api-key header      (default: FsiDemo2026-ProxyAuth)
#   ORIGIN_VERIFY  value sent as the x-origin-verify header (default: unset)
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
GATEWAY_ID="46md2r9izf"
INTEGRATION_ID="krzr5xcibc"
ROUTE_KEY="ANY /svc/metrics/metrics-history"
VERIFY_URL=""
SKIP_VERIFY=0
API_KEY="${API_KEY:-FsiDemo2026-ProxyAuth}"
ORIGIN_VERIFY="${ORIGIN_VERIFY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)         REGION="$2"; shift 2 ;;
    --gateway-id)     GATEWAY_ID="$2"; shift 2 ;;
    --integration-id) INTEGRATION_ID="$2"; shift 2 ;;
    --verify-url)     VERIFY_URL="$2"; shift 2 ;;
    --skip-verify)    SKIP_VERIFY=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${VERIFY_URL:=https://${GATEWAY_ID}.execute-api.${REGION}.amazonaws.com/svc/metrics/metrics-history}"

# 1. Credentials -------------------------------------------------------------
echo "==> Checking AWS credentials ..."
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: no valid AWS credentials (aws sts get-caller-identity failed)." >&2
  echo "       Refresh your credentials and re-run." >&2
  exit 1
fi
echo "    ok ($(aws sts get-caller-identity --query Account --output text) / ${REGION})"

# 2. Ensure the metrics-history route on the console gateway -----------------
echo "==> Ensuring route '${ROUTE_KEY}' on gateway ${GATEWAY_ID} ..."
EXISTING_ROUTE_ID="$(aws apigatewayv2 get-routes \
  --api-id "${GATEWAY_ID}" --region "${REGION}" \
  --query "Items[?RouteKey=='${ROUTE_KEY}'].RouteId | [0]" \
  --output text 2>/dev/null || echo "None")"

if [[ -n "${EXISTING_ROUTE_ID}" && "${EXISTING_ROUTE_ID}" != "None" ]]; then
  echo "    route already present (${EXISTING_ROUTE_ID}) — leaving unchanged."
else
  echo "    creating route -> integrations/${INTEGRATION_ID}"
  aws apigatewayv2 create-route \
    --api-id "${GATEWAY_ID}" --region "${REGION}" \
    --route-key "${ROUTE_KEY}" \
    --target "integrations/${INTEGRATION_ID}" >/dev/null
  echo "    route created."
fi

# 3. Seed DynamoDB -----------------------------------------------------------
echo "==> Seeding metrics history (seed_phase3.py) ..."
python3 "${HERE}/seed_phase3.py" --region "${REGION}"

# 4. Verify endpoint ---------------------------------------------------------
if [[ "${SKIP_VERIFY}" == "1" ]]; then
  echo "==> Skipping endpoint verification (--skip-verify)."
  echo "Done."
  exit 0
fi

echo "==> Verifying ${VERIFY_URL} ..."
CURL_ARGS=(-s -o /dev/null -w '%{http_code}' -H "x-api-key: ${API_KEY}")
if [[ -n "${ORIGIN_VERIFY}" ]]; then
  CURL_ARGS+=(-H "x-origin-verify: ${ORIGIN_VERIFY}")
fi
HTTP_CODE="$(curl "${CURL_ARGS[@]}" "${VERIFY_URL}" || echo "000")"

if [[ "${HTTP_CODE}" == "200" ]]; then
  echo "    HTTP 200 — metrics-history endpoint is live."
  echo "Done."
else
  echo "    HTTP ${HTTP_CODE} (expected 200)." >&2
  echo "    If the gateway is edge-protected, pass ORIGIN_VERIFY=<secret> (x-origin-verify)" >&2
  echo "    or verify via the CloudFront URL with --verify-url." >&2
  exit 1
fi
