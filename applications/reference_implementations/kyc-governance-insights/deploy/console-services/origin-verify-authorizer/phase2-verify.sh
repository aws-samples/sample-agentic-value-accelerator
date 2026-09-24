#!/usr/bin/env bash
# Phase 2 verification. Proves:
#   (a) raw backend execute-api URLs + the publicly-known x-api-key are now REJECTED (401)
#       because they lack the CF-injected x-origin-verify header;
#   (b) calling the console gateway directly is ALSO rejected (gateway doesn't inject the secret);
#   (c) traffic through CloudFront /svc/* still returns 200 (CF injects x-origin-verify).
#
# Env:
#   CF_DOMAIN   CloudFront domain to test through (default TEST d3r8o92vlqvocy.cloudfront.net)
#   CF_AUTH     basic-auth "user:pass" for PROD (omit for open TEST)
#   OLD_KEY     the publicly-known key (default FsiDemo2026-ProxyAuth)
set -uo pipefail
export AWS_PAGER=""
export AWS_DEFAULT_REGION="${REGION:-us-east-1}"
CF_DOMAIN="${CF_DOMAIN:-d3r8o92vlqvocy.cloudfront.net}"
OLD_KEY="${OLD_KEY:-FsiDemo2026-ProxyAuth}"
GW="${GW:-46md2r9izf}"
REGION="${REGION:-us-east-1}"
AUTHZ="${CF_AUTH:+-u $CF_AUTH}"

code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
raw() { echo "https://$1.execute-api.${REGION}.amazonaws.com$2"; }

echo "== (a) raw backend + old key should now be 401 (locked) =="
for probe in "grounding:mindupjlp8:/health" "registry:cyrqxuao3b:/agents"; do
  svc="${probe%%:*}"; rest="${probe#*:}"; api="${rest%%:*}"; path="${rest##*:}"
  c=$(code -H "x-api-key: $OLD_KEY" -H "x-tenant-id: fsi-demo" "$(raw "$api" "$path")")
  printf "  %-10s direct raw%-9s -> %s  %s\n" "$svc" "$path" "$c" "$([ "$c" = 401 ] && echo OK || echo 'EXPECTED 401')"
done

echo "== (b) console gateway direct (no CF) should be 401 (no secret injected) =="
c=$(code -H "x-api-key: $OLD_KEY" -H "x-tenant-id: fsi-demo" "$(raw "$GW" /svc/registry/agents)")
printf "  gateway /svc/registry/agents -> %s  %s\n" "$c" "$([ "$c" = 401 ] && echo OK || echo 'EXPECTED 401')"

echo "== (c) through CloudFront should still be 200 =="
for p in "/svc/health" "/svc/registry/agents"; do
  c=$(code $AUTHZ "https://$CF_DOMAIN$p")
  printf "  CF %-24s -> %s  %s\n" "$p" "$c" "$([ "$c" = 200 ] && echo OK || echo 'EXPECTED 200')"
done
