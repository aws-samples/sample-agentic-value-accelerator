#!/bin/bash
# Mint a Cognito access token for an EXTERNAL MCP client (Claude Code, MCP Inspector, a custom
# agent, …) to authenticate to the AgentCore Gateway's /mcp endpoint. This is the exact bearer
# token the shipped React SPA uses — an external client is just another Cognito principal, so the
# Gateway's CUSTOM_JWT inbound auth + the per-user entitlements apply identically.
#
# Usage:
#   scripts/mcp_token.sh                      # alice@demo.com, env from .demo-env
#   scripts/mcp_token.sh bob@demo.com         # a different demo user
#   DEMO_ENV=agentcoreinabox scripts/mcp_token.sh alice@demo.com
#   PASSWORD=... scripts/mcp_token.sh someone@demo.com
#
# Prints, to STDOUT, the bare access token (nothing else) so it can be captured:
#   TOKEN=$(scripts/mcp_token.sh alice@demo.com)
# Everything else (endpoint URL, claims, hints) goes to STDERR.
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}"
USER_EMAIL="${1:-alice@demo.com}"
PASSWORD="${PASSWORD:-${DEMO_ADMIN_PASSWORD:-DemoPassword2026}}"

# Resolve the env suffix the same way deploy.sh / cleanup.sh do: explicit DEMO_ENV, else .demo-env.
DEMO_ENV="${DEMO_ENV:-}"
if [ -z "$DEMO_ENV" ] && [ -f "$(dirname "$0")/../.demo-env" ]; then
    DEMO_ENV="$(cat "$(dirname "$0")/../.demo-env")"
fi
[ -z "$DEMO_ENV" ] && { echo "ERROR: set DEMO_ENV or create .demo-env" >&2; exit 1; }

# Read the resolved IDs from the deploy outputs the deploy already wrote (gitignored).
OUT="$(dirname "$0")/../.deployment-outputs-${DEMO_ENV}.json"
CDK_OUT="$(dirname "$0")/../cdk-outputs-${DEMO_ENV}.json"
[ -f "$OUT" ] || { echo "ERROR: $OUT not found — run deploy.sh first." >&2; exit 1; }

CLIENT_ID="$(jq -r '.user_pool_client_id // empty' "$OUT")"
GATEWAY_ID="$(jq -r '.gateway_id // empty' "$OUT")"
# Fall back to the CDK outputs for the client id if the deploy-outputs file is older.
[ -z "$CLIENT_ID" ] && [ -f "$CDK_OUT" ] && \
    CLIENT_ID="$(jq -r '.[].UserPoolClientId // empty' "$CDK_OUT" | head -1)"

[ -n "$CLIENT_ID" ]  || { echo "ERROR: could not resolve user_pool_client_id" >&2; exit 1; }
[ -n "$GATEWAY_ID" ] || { echo "ERROR: could not resolve gateway_id"           >&2; exit 1; }

MCP_URL="https://${GATEWAY_ID}.gateway.bedrock-agentcore.${REGION}.amazonaws.com/mcp"

# USER_PASSWORD_AUTH is enabled on the web app client (lib/agent_core-stack.ts) precisely so a CLI/
# test client can fetch a token without the browser Hosted-UI redirect. A real external deployment
# would instead run the OAuth code+PKCE flow (same client) — this is the headless convenience path.
AUTH="$(aws cognito-idp initiate-auth --region "$REGION" \
    --client-id "$CLIENT_ID" \
    --auth-flow USER_PASSWORD_AUTH \
    --auth-parameters "USERNAME=${USER_EMAIL},PASSWORD=${PASSWORD}" 2>&1)" || {
        echo "ERROR: initiate-auth failed:" >&2; echo "$AUTH" >&2; exit 1; }

TOKEN="$(echo "$AUTH" | jq -r '.AuthenticationResult.AccessToken // empty')"
[ -n "$TOKEN" ] || { echo "ERROR: no access token (challenge=$(echo "$AUTH" | jq -r '.ChallengeName'))" >&2; exit 1; }

# Diagnostics → STDERR so STDOUT stays a clean token.
{
    echo "  user:        $USER_EMAIL"
    echo "  gateway MCP: $MCP_URL"
    echo "  expires_in:  $(echo "$AUTH" | jq -r '.AuthenticationResult.ExpiresIn')s"
    echo ""
    echo "  # quick smoke test (tools/list):"
    echo "  curl -sS -X POST '$MCP_URL' \\"
    echo "    -H \"Authorization: Bearer \$($0 $USER_EMAIL)\" \\"
    echo "    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \\"
    echo "    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'"
} >&2

echo "$TOKEN"
