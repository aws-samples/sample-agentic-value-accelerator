#!/usr/bin/env bash
# Bring up the local demo stack and verify it is actually showing LIVE data.
#
# Written for the live presentation: one command, and every line it prints is a
# fact it just measured rather than an assumption. Read-only against AWS except
# for the stack it starts.
#
# Usage:
#   ./demo-check.sh          # bring up backend + verify
#   ./demo-check.sh verify   # verify only, skip bring-up
#
# It deliberately does NOT start the `frontend` compose service: that maps
# 3000:80 and collides with the host `npm run dev` Vite server, which is what
# the demo is driven from. Vite proxies /api to localhost:8000.
set -uo pipefail
cd "$(dirname "$0")" || exit 1

PASS=0; FAIL=0; WARN=0
ok()   { printf '  [ OK ]  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  [FAIL]  %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  [warn]  %s\n' "$1"; WARN=$((WARN+1)); }
hdr()  { printf '\n== %s ==\n' "$1"; }

# The whole point of the override file. An ambient AWS_REGION would otherwise
# beat .env and silently point the control-plane tier at an empty region.
unset AWS_REGION AWS_DEFAULT_REGION

if [ "${1:-up}" = "up" ]; then
  hdr "Bringing up stack"
  docker compose up -d backend >/dev/null 2>&1
  printf '  waiting for backend'
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://localhost:8000/ping 2>/dev/null)" = "200" ] && break
    printf '.'; sleep 2
  done
  printf '\n'
fi

hdr "Backend reachable"
if [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:8000/ping 2>/dev/null)" = "200" ]; then
  ok "http://localhost:8000/ping -> 200"
else
  bad "backend not answering on :8000 - run 'docker compose up -d backend' and check 'docker compose logs backend'"
  echo; echo "ABORTING: nothing else can be verified without the backend."; exit 1
fi

hdr "Region tiers (tier 1 MUST be us-east-2)"
TIERS=$(docker compose logs backend 2>/dev/null | grep "REGION-TIER   [123]" | tail -3)
echo "$TIERS" | sed 's/^.*REGION-TIER/  REGION-TIER/'
if echo "$TIERS" | grep -q "1 control plane    us-east-2"; then
  ok "tier 1 = us-east-2 (where all 21 fsi-control-plane-* tables live)"
else
  bad "tier 1 is NOT us-east-2 - docker-compose.override.yaml is not loading; AVA sources will read an empty region"
fi

hdr "AWS credentials inside the container"
CRED=$(docker compose exec -T backend python -c "
import boto3
c = boto3.Session().get_credentials()
print(c.method if c else 'NONE')
try:
    boto3.client('sts', region_name='us-east-2').get_caller_identity()
    print('STS_OK')
except Exception as e:
    print('STS_FAIL', type(e).__name__)
" 2>/dev/null | tr -d '\r')
echo "$CRED" | grep -q "shared-credentials-file" && ok "creds resolved from mounted ~/.aws" \
  || warn "cred source: $(echo "$CRED" | head -1) (expected shared-credentials-file)"
echo "$CRED" | grep -q "STS_OK" && ok "STS call succeeded from container" \
  || bad "STS failed from container: $(echo "$CRED" | grep STS_FAIL) - if EndpointConnectionError, Docker Desktop DNS flapped; restart Docker Desktop"

hdr "Data sources (cold prewarm can take ~2min)"
curl -s -m 300 http://localhost:8000/api/v1/govern/data-sources/status | python -c "
import sys, json, collections
d = json.load(sys.stdin)
items = d.get('sources') or d.get('data_sources') or []
if isinstance(items, dict): items = list(items.values())
if not items:
    print('  [FAIL]  no sources returned'); sys.exit(9)
t = collections.Counter(str(i.get('status')) for i in items)
for k, v in t.most_common(): print('  %-18s %d' % (k, v))
hard = [i for i in items if str(i.get('status')) in ('error', 'not_probed')]
print()
if hard:
    for i in hard:
        print('  [FAIL]  %-20s %-12s %s' % (i.get('source_id'), i.get('status'), str(i.get('detail') or i.get('error'))[:60]))
    sys.exit(9)
print('  [ OK ]  %d sources, zero errors, zero unprobed' % len(items))
expected_degraded = {'detective': 'not_enabled', 'security-lake': 'access_denied'}
for sid, st in expected_degraded.items():
    got = next((str(i.get('status')) for i in items if i.get('source_id') == sid), 'MISSING')
    print('  [ OK ]  %s = %s (known, degrades honestly)' % (sid, got) if got == st
          else '  [warn]  %s = %s (expected %s)' % (sid, got, st))
print()
print('  -- AVA group --')
for i in [x for x in items if x.get('group') == 'ava']:
    print('     %-20s %-16s %-10s %s' % (i.get('source_id'), i.get('status'), i.get('region'),
                                          str(i.get('detail') or '')[:40]))
"
[ $? -eq 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

hdr "Live flags on the demo endpoints"
for p in /api/v1/govern/command-center/data \
         /api/v1/govern/agentcore/agents \
         /api/v1/govern/agentcore/posture \
         /api/v1/govern/data-catalog/summary; do
  R=$(curl -s -m 180 "http://localhost:8000$p" | python -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: print('UNPARSED'); sys.exit()
f = []
def walk(o):
    if isinstance(o, dict):
        if 'live' in o: f.append(o.get('live'))
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o[:1]: walk(v)
walk(d)
print('%d/%d' % (sum(1 for x in f if x is True), len(f)) if f else 'NO_FLAG')
" 2>/dev/null)
  case "$R" in
    UNPARSED|NO_FLAG|"") bad "$p -> $R" ;;
    0/*) bad "$p -> $R live nodes (all mock)" ;;
    *)   ok "$p -> $R live nodes" ;;
  esac
done

hdr "Through the Vite proxy (the path the browser actually uses)"
V=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://localhost:3000/ 2>/dev/null)
if [ "$V" = "200" ]; then
  A=$(curl -s -m 60 http://localhost:3000/api/v1/govern/agentcore/agents | python -c "
import sys, json
d = json.load(sys.stdin)
print('live=%s agents=%d' % (d.get('live'), len(d.get('agents') or d.get('items') or [])))
" 2>/dev/null)
  case "$A" in
    live=True*) ok ":3000 proxy -> $A" ;;
    *)          bad ":3000 proxy -> ${A:-no data}" ;;
  esac
else
  warn "Vite dev server not running on :3000 - start it with: (cd frontend && npm run dev)"
fi

hdr "Summary"
printf '  %d passed, %d failed, %d warnings\n' "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -gt 0 ]; then
  echo "  NOT DEMO READY - address the [FAIL] lines above."; exit 1
fi
echo "  Demo ready."
