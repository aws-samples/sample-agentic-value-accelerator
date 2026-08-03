"""Gateway console — the live backend for the admin-only "Gateway" section of the UI.

This module powers the four interactive surfaces that make Michelle's Gateway-requirement checklist
demonstrable in the product (not just in a doc):

  1. build_console()      → the console bootstrap: the real MCP endpoint, the governed targets
                            (derived from the single-sourced tool catalog), the live rate-limit caps,
                            and the guardrail configuration. Pure read of config already in this env.
  2. guardrail_scan()     → a LIVE Bedrock ApplyGuardrail call. Paste a prompt with a secret / SSN /
                            PII and see the real verdict — blocked, masked, or clean, with the exact
                            policies that tripped. Same guardrail the runtime enforces on every turn.
  3. ratelimit_burst()    → fires N logical calls through the IDENTICAL fixed-window algorithm the
                            Gateway REQUEST interceptor runs (same DynamoDB table, same atomic ADD,
                            same single-sourced caps), and returns the per-call allow/deny sequence so
                            you can watch the throttle engage at the (cap+1)th call. Runs under a
                            test-principal namespace so it never throttles real governed traffic.
  4. mcp_proxy()          → forwards a raw MCP JSON-RPC request (tools/list, tools/call) to the real
                            Gateway /mcp endpoint using the caller's OWN access token — i.e. the EXACT
                            path an external MCP client (Claude Code, M365 Copilot, a custom agent)
                            takes. The per-user policy applies identically, so the console shows the
                            live tool catalog and can prove allow→deny for the signed-in identity.

Everything here is admin-gated upstream in index.handler (the caller's verified ID token must carry
the admins group). guardrail_scan and mcp_proxy fail SOFT (return a structured error the UI renders)
so a guardrail outage or a Gateway hiccup degrades the panel rather than 500-ing the console.
"""
import json
import os
import time
import urllib.request
import urllib.error

import boto3

import entitlements as E  # single-sourced catalog + rate-limit caps (copied in by deploy.sh)
try:
    import guardrail as _guardrail  # copied in by deploy.sh from agent/guardrail.py
except Exception:  # pragma: no cover - guardrail module optional (fail-open like the runtime)
    _guardrail = None

REGION = os.environ.get('REGION', os.environ.get('AWS_REGION', 'us-west-2'))
GATEWAY_ID = os.environ.get('GATEWAY_ID', '')
GUARDRAIL_ID = os.environ.get('GUARDRAIL_ID', '')
GUARDRAIL_VERSION = os.environ.get('GUARDRAIL_VERSION', 'DRAFT')
RATE_LIMIT_TABLE = os.environ.get('RATE_LIMIT_TABLE', '')

# The AgentCore Gateway MCP endpoint (streamable-HTTP). Same URL an external client points at.
MCP_URL = (f'https://{GATEWAY_ID}.gateway.bedrock-agentcore.{REGION}.amazonaws.com/mcp'
           if GATEWAY_ID else '')

# Burst-test bounds — keep a demo click cheap and the DynamoDB writes bounded.
BURST_MAX = 40

_ddb = boto3.resource('dynamodb', region_name=REGION)
_rl_table = _ddb.Table(RATE_LIMIT_TABLE) if RATE_LIMIT_TABLE else None


# ─────────────────────────────────────────────────────────────────────────────
# 1. Console bootstrap
# ─────────────────────────────────────────────────────────────────────────────
def build_console():
    """Everything the Gateway console needs to render its live map in one call: the MCP endpoint,
    the governed tool targets (single-sourced from the catalog), the rate-limit caps, and the
    guardrail config. No side effects — pure read of this Lambda's resolved configuration."""
    # Governed targets, grouped by the pillar each tool sits behind (Lambda target, OpenAPI/EKS,
    # governed DB, browser/code). This is the "which identity can reach which MCP/tool" surface,
    # so we expose the catalog the interceptor + runtime enforce against.
    targets = []
    for key, meta in E.TOOL_CATALOG.items():
        targets.append({
            'key': key,
            'label': meta.get('label', key),
            'group': meta.get('group', ''),
            'pillar': meta.get('pillar', ''),
            'gateway_action': meta.get('gateway_action', ''),
            'sensitive': bool(meta.get('sensitive')),
        })

    # Rate-limit caps, per dimension, with the per-tool overrides made explicit.
    per_tool_overrides = {}
    for tool_key in (E.RATE_LIMITS.get('per_tool') or {}):
        spec = E.rate_limit_for('per_tool', tool=tool_key)
        if spec:
            per_tool_overrides[tool_key] = spec
    rate_limits = {
        'window_seconds': E.RATE_LIMIT_WINDOW_SECONDS,
        'per_user': E.rate_limit_for('per_user'),
        'per_app': E.rate_limit_for('per_app'),
        'per_tool_default': E.rate_limit_for('per_tool', tool='__default__'),
        'per_tool': per_tool_overrides,
    }

    return {
        'mcp_url': MCP_URL,
        'gateway_id': GATEWAY_ID,
        'region': REGION,
        'targets': targets,
        'target_count': len(targets),
        'rate_limits': rate_limits,
        'guardrail': {
            'enabled': bool(GUARDRAIL_ID),
            'id': GUARDRAIL_ID,
            'version': GUARDRAIL_VERSION,
            # A plain-language summary of what the guardrail does (the CfnGuardrail policy in CDK):
            # secrets/SSN/cards BLOCK the turn; contact PII is masked. Kept here so the UI can label
            # the tester without hard-coding policy detail that could drift.
            'blocks': ['AWS secret/access keys', 'Private-key blocks', 'US SSN', 'Credit-card numbers'],
            'masks': ['Email addresses', 'Phone numbers', 'Names'],
        },
        'generated_at': int(time.time()),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Live guardrail scan
# ─────────────────────────────────────────────────────────────────────────────
def guardrail_scan(text, source='OUTPUT'):
    """Apply the real Bedrock guardrail to `text` and return a UI-shaped verdict. `source='OUTPUT'`
    is the mode that BOTH blocks secrets AND masks PII (see agent/guardrail.py). Fail-soft: an
    unconfigured/errored guardrail returns enforced=False rather than raising."""
    if not GUARDRAIL_ID:
        return {'enabled': False, 'enforced': False, 'passed': True, 'action': 'DISABLED',
                'blocked': False, 'masked': False, 'text': text, 'reasons': ['not_configured'],
                'message': 'No guardrail is configured in this environment.'}
    if _guardrail is None:
        return {'enabled': True, 'enforced': False, 'passed': True, 'action': 'ERROR',
                'blocked': False, 'masked': False, 'text': text, 'reasons': ['module_unavailable'],
                'message': 'Guardrail module not bundled.'}
    v = _guardrail.check(text or '', source=source)
    return {
        'enabled': True,
        'enforced': bool(v.enforced),
        'passed': bool(v.passed),
        'blocked': (not v.passed),
        'masked': bool(v.masked),
        'action': v.action,
        'text': v.text,          # the (possibly masked) text the model would have seen
        'reasons': list(v.reasons or []),
        'message': v.message,
        'guardrail_id': GUARDRAIL_ID,
        'guardrail_version': GUARDRAIL_VERSION,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Rate-limit burst test (mirrors gateway-interceptor _rate_limited exactly)
# ─────────────────────────────────────────────────────────────────────────────
def ratelimit_burst(sub, tool, count):
    """Fire `count` logical calls through the SAME fixed-window limiter the Gateway interceptor runs
    on every entitled tools/call — same table, same atomic ADD, same bucket math, same single-sourced
    caps (E.rate_limit_for). Returns the per-call allow/deny sequence so the UI can show the throttle
    engaging at the (cap+1)th call.

    We namespace the principal as `console-burst#<sub>` so the demo NEVER throttles the admin's real
    governed traffic — it exercises the identical mechanism on an isolated counter. The cap that bites
    first is whichever dimension is smallest for this tool (usually per-tool)."""
    if not _rl_table:
        return {'error': 'Rate-limit table not configured in this environment.', 'calls': []}
    try:
        count = max(1, min(BURST_MAX, int(count)))
    except (TypeError, ValueError):
        count = 10
    tool = str(tool or '').strip()
    if tool not in E.TOOL_CATALOG:
        return {'error': f'unknown tool: {tool}', 'calls': []}

    principal = f'console-burst#{sub}'
    client_id = f'console-burst-app#{sub}'
    now = int(time.time())

    # The three dimensions, exactly as the interceptor builds them (per_user, per_app, per_tool).
    su = E.rate_limit_for('per_user')
    sa = E.rate_limit_for('per_app')
    st = E.rate_limit_for('per_tool', tool=tool)
    dims = []
    if su:
        dims.append(('per_user', f'u#{principal}', su))
    if sa:
        dims.append(('per_app', f'a#{client_id}', sa))
    if st:
        dims.append(('per_tool', f't#{principal}#{tool}', st))

    calls = []
    first_denied_at = None
    for i in range(count):
        denied_dim, denied_spec = None, None
        for dimension, rate_key, spec in dims:
            window = spec['window_seconds']
            bucket = int(now // window)
            pk = f'{rate_key}@{bucket}'
            try:
                resp = _rl_table.update_item(
                    Key={'rlKey': pk},
                    UpdateExpression='ADD #c :one SET #ttl = if_not_exists(#ttl, :exp)',
                    ExpressionAttributeNames={'#c': 'count', '#ttl': 'ttl'},
                    ExpressionAttributeValues={':one': 1, ':exp': (bucket + 2) * window},
                    ReturnValues='UPDATED_NEW',
                )
                current = int(resp.get('Attributes', {}).get('count', 0))
            except Exception as e:  # fail-open, same as the interceptor
                print(f'CONSOLE burst rate-limit error ({dimension}), failing open: '
                      f'{type(e).__name__}: {e}', flush=True)
                continue
            if current > spec['count']:
                denied_dim, denied_spec = dimension, spec
                break
        allowed = denied_dim is None
        if not allowed and first_denied_at is None:
            first_denied_at = i + 1
        calls.append({
            'n': i + 1,
            'allowed': allowed,
            'dimension': denied_dim,          # which cap tripped (None if allowed)
            'limit': (denied_spec or {}).get('count') if denied_spec else None,
        })

    return {
        'tool': tool,
        'tool_label': E.TOOL_CATALOG.get(tool, {}).get('label', tool),
        'count': count,
        'window_seconds': E.RATE_LIMIT_WINDOW_SECONDS,
        'dimensions': {d[0]: d[2] for d in dims},   # the caps that applied
        'first_denied_at': first_denied_at,
        'calls': calls,
        'note': ('Runs the identical fixed-window algorithm the Gateway interceptor enforces, '
                 'against the live rate-limit table, under an isolated test principal so it does '
                 'not throttle real governed traffic.'),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. MCP proxy — the real external-client path
# ─────────────────────────────────────────────────────────────────────────────
def mcp_proxy(access_token, rpc):
    """Forward an MCP JSON-RPC request to the real Gateway /mcp endpoint with the caller's OWN access
    token — i.e. exactly what an external MCP client sends. Returns the parsed JSON-RPC result. The
    Gateway applies the same per-user policy, so tools/list reflects the signed-in identity's live
    catalog and tools/call is subject to the real allow/deny. Fail-soft on any transport error."""
    if not MCP_URL:
        return {'error': 'Gateway MCP endpoint not configured (GATEWAY_ID missing).'}
    if not access_token:
        return {'error': 'No access token supplied for the Gateway call.'}
    if not isinstance(rpc, dict) or 'method' not in rpc:
        return {'error': 'Body must be a JSON-RPC object with a "method".'}

    payload = json.dumps({
        'jsonrpc': '2.0',
        'id': rpc.get('id', 1),
        'method': rpc.get('method'),
        'params': rpc.get('params', {}),
    }).encode()

    req = urllib.request.Request(MCP_URL, data=payload, method='POST')
    req.add_header('Authorization', f'Bearer {access_token}')
    req.add_header('Content-Type', 'application/json')
    # The Gateway may reply as a single JSON body OR an SSE (text/event-stream) frame; accept both.
    req.add_header('Accept', 'application/json, text/event-stream')
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode('utf-8', 'replace')
            ctype = resp.headers.get('Content-Type', '')
    except urllib.error.HTTPError as e:
        body = ''
        try:
            body = e.read().decode('utf-8', 'replace')
        except Exception:
            pass
        # A 403 here IS the demo's denied beat (the Gateway policy rejected this identity/tool).
        return {'error': f'Gateway returned {e.code}', 'status': e.code, 'body': body[:2000]}
    except Exception as e:
        return {'error': f'{type(e).__name__}: {e}'}

    parsed = _parse_mcp_body(raw, ctype)
    return parsed if parsed is not None else {'error': 'Could not parse Gateway response',
                                              'raw': raw[:2000]}


def _parse_mcp_body(raw, content_type):
    """Parse the Gateway's reply — either a plain JSON body or an SSE stream where the JSON-RPC
    payload rides on `data:` lines. Returns the parsed dict, or None if nothing parseable."""
    raw = (raw or '').strip()
    if not raw:
        return None
    # Plain JSON first.
    if 'text/event-stream' not in (content_type or ''):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            pass
    # SSE: concatenate the data: payloads and take the last parseable JSON object.
    last = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith('data:'):
            chunk = line[len('data:'):].strip()
            if not chunk or chunk == '[DONE]':
                continue
            try:
                last = json.loads(chunk)
            except (ValueError, TypeError):
                continue
    if last is not None:
        return last
    # Last resort: try the whole body as JSON.
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None
