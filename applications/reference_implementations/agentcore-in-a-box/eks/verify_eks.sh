#!/bin/bash
set -euo pipefail
# Verify the EKS market-data tool END-TO-END through the AgentCore Gateway, exactly as an external
# MCP client would: mint a Cognito token, list tools (expect market-data___market_quote), call it
# (expect live quotes served by an EKS pod), then flip the entitlement and expect a Gateway deny.
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"
REGION="${AWS_REGION:-us-west-2}"
DEMO_ENV="${DEMO_ENV:-}"; [ -z "$DEMO_ENV" ] && [ -f "$ROOT/.demo-env" ] && DEMO_ENV="$(cat "$ROOT/.demo-env")"
USER_EMAIL="${1:-alice@demo.com}"

GW="$(jq -r '.gateway_id' "$ROOT/.deployment-outputs-$DEMO_ENV.json")"
MCP="https://${GW}.gateway.bedrock-agentcore.${REGION}.amazonaws.com/mcp"
TOKEN="$(DEMO_ENV="$DEMO_ENV" "$ROOT/scripts/mcp_token.sh" "$USER_EMAIL" 2>/dev/null)"
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')

echo "=== 1) tools/list — expect market-data___market_quote present ==="
curl -sS -X POST "$MCP" "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c 'import sys,json; t=[x["name"] for x in json.load(sys.stdin).get("result",{}).get("tools",[])]; print("  market-data present:", "market-data___market_quote" in t); print("  total tools:", len(t))'

echo "=== 2) tools/call market-data___market_quote {symbols:[SPY,TLT,AAPL]} ==="
curl -sS -X POST "$MCP" "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"market-data___market_quote","arguments":{"symbols":["SPY","TLT","AAPL"]}}}' \
  | python3 -c 'import sys,json; r=json.load(sys.stdin).get("result",{}); print("  isError:", r.get("isError")); c=r.get("content",[]); print("  ", (c[0].get("text","")[:400]) if c else r)'

echo ""
echo "To see the DENY beat: revoke market_quote for this user in the Access Control console"
echo "(or flip grants.market_quote=false on user#<sub>/tools in the entitlements table), then re-run."
