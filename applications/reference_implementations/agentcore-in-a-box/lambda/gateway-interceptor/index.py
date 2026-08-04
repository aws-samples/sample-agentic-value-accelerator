"""
AgentCore Gateway REQUEST interceptor — the PLATFORM per-user enforcement boundary.

This Lambda is attached to the Gateway as a REQUEST interceptor (wired by deploy.sh via
update-gateway --interceptor-configurations). It runs INSIDE the Gateway, before any tool
Lambda is invoked, and can short-circuit a `tools/call` with a denial. This is the strongest
enforcement point in the stack: even if the runtime's own pre-check were bypassed and someone
called the Gateway directly with the agent's credentials, the Gateway itself refuses a tool the
caller isn't entitled to.

═══════════════════════════════════════════════════════════════════════════════════════
HOW THE PRINCIPAL IS RESOLVED (ONE cryptographic source of truth: the verified Bearer JWT)
═══════════════════════════════════════════════════════════════════════════════════════
The Gateway is CUSTOM_JWT-inbound (Cognito): EVERY caller — runtime desk or config-only harness —
must present the END-USER's Bearer token, which the Gateway validates at the edge AND forwards to
this interceptor as the `Authorization` header. So the AUTHORITATIVE principal is always the `sub`
of that token, RE-VERIFIED here (RS256 sig + issuer + client + expiry against the pool JWKS). Both
callers resolve identically:

  • The RUNTIME DESKS (agent/main.py) authenticate to the Gateway as the end user and ALSO inject a
    runtime-asserted `arguments['__principal'] = 'user#<verified-sub>'`. That body value is NO LONGER
    trusted as an identity source — it is used ONLY as a tamper cross-check: if it is present and
    disagrees with the verified JWT sub, the call is DENIED (an impersonation attempt). It is then
    stripped before the request reaches the tool.
  • The config-only HARNESS ("AgentCore Express") runs a managed loop with no __principal hook; it
    is authorized purely from the verified `Authorization: Bearer <user_jwt>` sub — the same source.

WHY THIS CLOSED A HOLE: the Gateway is CUSTOM_JWT, so an authenticated user could call it DIRECTLY
with their OWN valid token but a forged `__principal=user#<someone-else>`. The old code returned the
body `__principal` verbatim BEFORE verifying anything, so that forgery impersonated the victim at
the very boundary this file calls "strongest". Now identity comes only from the verified token, and
a mismatched `__principal` is an explicit deny. The dormant, unverified `X-Meridian-Principal`
header channel (nothing ever set it) is removed.

DEGRADED FALLBACK (documented, narrow): if USER_POOL_ID is not configured at all, this interceptor
cannot verify ANY token, so it falls back to trusting the runtime-asserted `__principal` (a
pool-less local dev deploy still works). Whenever verification IS possible — the real/prod path,
and the only path on which the Gateway can even be CUSTOM_JWT — the strict match is enforced.

═══════════════════════════════════════════════════════════════════════════════════════
FAIL-CLOSED posture for GOVERNED tools (default deny)
═══════════════════════════════════════════════════════════════════════════════════════
This interceptor is described in the README as the "strongest layer" — the platform MCP
boundary — so it must be credible. It therefore DEFAULTS TO DENY for any tool the platform
governs (every tool in E.TOOL_CATALOG) when it cannot positively authorize the call:

  • Governed tool + no identifiable principal  → DENY (was previously fail-OPEN — the hole).
  • Governed tool + identified MANAGED principal lacking the grant → DENY (unchanged).
  • Governed tool + interceptor error → DENY (was previously fail-OPEN).
  • UNGOVERNED tool (not in the catalog), or a non-tools/call method → ALLOW (nothing to gate).
  • Governed tool + identified principal WITH the grant → ALLOW.

Narrow, documented exception: an UNGOVERNED tool (one not present in the catalog) is allowed
even when identity is unknown, and a hard interceptor crash before we can even parse the method
falls through to ALLOW as the last resort — otherwise a single interceptor bug would brick the
whole Gateway for every tool and user. Everything the platform actually models is fail-closed.

IDENTITY TRUST: identity is derived ONLY from the forwarded `Authorization: Bearer <user_jwt>`,
whose RS256 signature is VERIFIED here against the pool's JWKS (issuer + client + expiry), mirroring
the runtime's own check. The runtime-asserted `__principal` in the tool body is NOT an identity
source — it is a tamper cross-check (must match the verified sub) and is stripped before forwarding.
An unverified `sub` is never used to authorize (that was a spoofing hole).

entitlements.py is the single-sourced catalog + decision logic (copied in by deploy.sh).
"""
import json
import os
import time

import boto3

import entitlements as E

REGION = os.environ.get('REGION', 'us-west-2')
ENTITLEMENTS_TABLE = os.environ.get('ENTITLEMENTS_TABLE', '')
# Fixed-window rate-limit counter table (per-user / per-app / per-tool). Empty → rate limiting OFF
# (fail-open: a missing throttle store must never brick the Gateway; authorization is separate).
RATE_LIMIT_TABLE = os.environ.get('RATE_LIMIT_TABLE', '')
# Optional JSON to OVERRIDE the entitlements RATE_LIMITS at deploy/demo time (e.g. dial a cap down
# to 2/min to trigger a throttle live). Shallow-merged over E.RATE_LIMITS so only the named
# dimensions change. Applied once at import.
_RL_OVERRIDE = os.environ.get('RATE_LIMITS_JSON', '')
if _RL_OVERRIDE:
    try:
        E.RATE_LIMITS.update(json.loads(_RL_OVERRIDE))
        print(f'INTERCEPTOR rate-limit override applied: {list(json.loads(_RL_OVERRIDE))}', flush=True)
    except Exception as _e:
        print(f'INTERCEPTOR bad RATE_LIMITS_JSON ignored: {type(_e).__name__}: {_e}', flush=True)
# The OpenAPI target whose backend (Aurora positions-db) governs rows/columns by identity. For a
# tools/call on this target we OVERWRITE arguments.principal_sub with the crypto-verified sub before
# forwarding, so the DB's RLS scope can't be spoofed by a model-supplied value. Empty → feature off.
GOVERNED_DB_TARGET = os.environ.get('GOVERNED_DB_TARGET', '')
# Cognito pool/client for VERIFYING the forwarded Authorization JWT (issuer + client + RS256 sig).
# Injected by deploy.sh; if absent the interceptor cannot verify tokens and falls back to trusting
# the runtime-asserted __principal (documented pool-less local-dev degradation).
USER_POOL_ID = os.environ.get('USER_POOL_ID', '')
USER_POOL_CLIENT_ID = os.environ.get('USER_POOL_CLIENT_ID', '')

_ddb = boto3.resource('dynamodb', region_name=REGION)
_table = _ddb.Table(ENTITLEMENTS_TABLE) if ENTITLEMENTS_TABLE else None
_rl_table = _ddb.Table(RATE_LIMIT_TABLE) if RATE_LIMIT_TABLE else None

# JWKS public-key cache (per kid), same approach as agent/main.py's runtime verifier — with a
# TTL so a rotated Cognito key is picked up within _JWKS_TTL and stale key objects don't persist
# for the container's whole warm lifetime. A cache MISS (unknown kid) also forces a refetch.
_JWKS_CACHE = {}
_JWKS_FETCHED_AT = 0.0
_JWKS_TTL = 3600  # seconds


def _effective(principal):
    """Load a principal's effective entitlement view. Returns None on any error so the caller
    can FAIL CLOSED for governed tools (we must not silently treat a DB error as 'unmanaged →
    allow-all', which is exactly the fail-open hole we're closing)."""
    if not (_table and principal):
        return None
    try:
        from boto3.dynamodb.conditions import Key
        resp = _table.query(KeyConditionExpression=Key('principal').eq(principal))
        items = {it['dataType']: it for it in resp.get('Items', [])}
        return E.evaluate(items)
    except Exception as e:
        print(f'INTERCEPTOR entitlements load ERROR {principal}: {type(e).__name__}: {e}', flush=True)
        return None


def _bare_tool(namespaced):
    """Map a Gateway tool name 'target___tool' → the bare 'tool' catalog key. Tool names
    never contain '___', so the last segment is the tool."""
    if not namespaced:
        return ''
    return namespaced.split('___')[-1]


def _asserted_principal(body):
    """The runtime-asserted __principal in the tool arguments, or '' if absent. NOT an identity
    source on its own — used only to CROSS-CHECK against the verified JWT sub (impersonation guard)."""
    try:
        p = (body.get('params', {}) or {}).get('arguments', {}) or {}
        return p.get('__principal') or ''
    except Exception:
        return ''


def _principal_from_event(mcp_req, body):
    """Resolve the caller's principal from the ONE cryptographic source of truth — the verified
    `Authorization: Bearer <user_jwt>` sub — and DENY on a mismatched runtime-asserted __principal.

    Returns (principal, deny_reason, client_id):
      • (E.user_pk(sub), '', <client_id>)  — verified; if __principal was present it MATCHED.
      • ('', 'impersonation', '')  — verified sub present but __principal names a DIFFERENT principal
                                     → forged body → the handler must DENY.
      • (asserted, '', '')         — DEGRADED fallback: pool not configured (USER_POOL_ID unset), so
                                     no token can be verified; trust the runtime __principal (dev).
      • ('', '', '')               — no identity at all → handler fails closed for governed tools.

    `client_id` is the verified JWT's app client id (Cognito `client_id`/`aud`), used ONLY for the
    per-application rate-limit dimension — it is never an authorization input.
    """
    headers = mcp_req.get('headers', {}) or {}
    asserted = _asserted_principal(body)

    # 1) The authoritative principal: the VERIFIED sub of the forwarded Authorization JWT. The
    #    Gateway is CUSTOM_JWT, so this header is present for every real caller (desk and harness).
    claims = {}
    for k, v in headers.items():
        if k.lower() == 'authorization' and v and not v.startswith('AWS4-'):
            tok = v[7:] if v.lower().startswith('bearer ') else v
            claims = _verified_jwt_claims(tok)
            break
    verified_sub = claims.get('sub', '')
    client_id = claims.get('client_id') or claims.get('aud') or ''

    if verified_sub:
        verified_pk = E.user_pk(verified_sub)
        # 2) If the runtime asserted a __principal, it MUST match the verified identity. A mismatch
        #    is an impersonation attempt (a user calling the Gateway directly with their own token
        #    but a forged __principal for someone else) → DENY.
        if asserted and asserted != verified_pk:
            print(f'INTERCEPTOR DENY(impersonation): asserted {_redact(asserted)} != verified '
                  f'{_redact(verified_pk)}', flush=True)
            return '', 'impersonation', ''
        return verified_pk, '', client_id

    # 3) No verifiable identity. If the pool is configured we COULD have verified but didn't (missing
    #    or invalid token) → derive no principal (governed tools then fail closed). Only when the pool
    #    is entirely unconfigured (local dev, no CUSTOM_JWT possible) do we fall back to the asserted
    #    __principal so a pool-less deploy still functions.
    if not USER_POOL_ID and asserted:
        return asserted, '', ''
    return '', '', ''


def _assert_https(url):
    """Reject any non-https URL before it reaches urlopen (which would otherwise honor
    file://, ftp://, and custom schemes — the vector bandit B310 flags). The JWKS URL below
    is a hardcoded https Cognito endpoint, so this enforces that invariant rather than
    asserting it in a comment. Returns the URL unchanged; raises ValueError otherwise."""
    if not isinstance(url, str) or not url.lower().startswith('https://'):
        raise ValueError(f'refusing non-https URL for outbound request: {url!r}')
    return url


def _cognito_public_key(token):
    """Return the RSA public key for `token`'s kid from the pool's JWKS (cached with a TTL)."""
    import jwt
    from jwt import algorithms
    import urllib.request
    import time
    global _JWKS_FETCHED_AT
    kid = jwt.get_unverified_header(token).get('kid', '')
    if not kid:
        raise ValueError('token has no kid')
    stale = (time.time() - _JWKS_FETCHED_AT) > _JWKS_TTL
    if kid not in _JWKS_CACHE or stale:
        url = f'https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json'
        with urllib.request.urlopen(_assert_https(url), timeout=5) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
            jwks = json.loads(resp.read().decode())
        for jk in jwks.get('keys', []):
            _JWKS_CACHE[jk['kid']] = algorithms.RSAAlgorithm.from_jwk(json.dumps(jk))
        _JWKS_FETCHED_AT = time.time()
    if kid not in _JWKS_CACHE:
        raise ValueError(f'kid {kid} not in JWKS')
    return _JWKS_CACHE[kid]


def _verified_jwt_claims(token):
    """VERIFY a Cognito access/ID token (RS256 sig + issuer + expiry, and client binding) and
    return its CLAIMS dict, or {} if it doesn't verify or the pool isn't configured. Mirrors the
    runtime's _verify_cognito_token so both boundaries trust identity identically. Callers use
    claims['sub'] for identity/authorization and claims['client_id'] for the per-app rate limit."""
    if not (token and USER_POOL_ID):
        return {}
    try:
        import jwt
        key = _cognito_public_key(token)
        issuer = f'https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}'
        claims = jwt.decode(token, key, algorithms=['RS256'], issuer=issuer,
                            options={'verify_aud': False})
        if USER_POOL_CLIENT_ID:
            cid = claims.get('client_id') or claims.get('aud')
            if cid != USER_POOL_CLIENT_ID:
                print(f'INTERCEPTOR: JWT client mismatch ({cid})', flush=True)
                return {}
        return claims
    except Exception as e:
        print(f'INTERCEPTOR JWT VERIFY FAILED: {type(e).__name__}: {e}', flush=True)
        return {}


def _allow(body, strip_principal=True, inject_principal_sub=None):
    """Continue: forward the (optionally cleaned) request to the target.

    strip_principal — remove the internal `__principal` channel so it never reaches the tool.
    inject_principal_sub — if set (bare Cognito sub), OVERWRITE arguments.principal_sub with it
        before forwarding. Used for the governed-DB (OpenAPI) target so the SQL layer's RLS scope
        is keyed off the VERIFIED identity, not any model-supplied value. Applied AFTER the strip
        so both transforms land in one rewritten arguments object."""
    fwd = body
    try:
        params = body.get('params', {}) or {}
        args = params.get('arguments', {})
        if isinstance(args, dict) and (
                (strip_principal and '__principal' in args) or inject_principal_sub):
            new_args = {k: v for k, v in args.items()
                        if not (strip_principal and k == '__principal')}
            if inject_principal_sub:
                new_args['principal_sub'] = inject_principal_sub
            fwd = {**body, 'params': {**params, 'arguments': new_args}}
    except Exception:
        fwd = body
    return {'interceptorOutputVersion': '1.0',
            'mcp': {'transformedGatewayRequest': {'body': fwd}}}


def _deny(body, tool_label, message=None):
    """Short-circuit with an MCP tool error (HTTP 200, result.isError) — the documented,
    client-friendly deny form. The Gateway returns this immediately without calling the target.
    `message` overrides the default authorization-denial text (used for rate-limit denials)."""
    rpc_id = body.get('id', 1) if isinstance(body, dict) else 1
    msg = message or (f"Access denied by AgentCore Gateway policy: you are not granted the "
           f"'{tool_label}' tool. This denial is enforced at the Gateway (MCP) boundary. Ask your "
           f"administrator to grant access in the Access Control console.")
    return {
        'interceptorOutputVersion': '1.0',
        'mcp': {
            'transformedGatewayResponse': {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json'},
                'body': {
                    'jsonrpc': '2.0',
                    'id': rpc_id,
                    'result': {
                        'isError': True,
                        'content': [{'type': 'text', 'text': msg}],
                    },
                },
            },
        },
    }


def _redact(principal):
    """Never log a full Cognito sub/email. Emit only the kind + a short hash prefix so logs are
    correlatable without exposing PII."""
    if not principal:
        return '<none>'
    try:
        import hashlib
        kind, _, ident = principal.partition('#')
        h = hashlib.sha256(ident.encode()).hexdigest()[:8] if ident else 'anon'
        return f'{kind}#{h}'
    except Exception:
        return '<redacted>'


def _is_governed_tool(tool):
    """True iff this tool is one the platform models (and therefore gates). Tools not in the
    catalog are not governed by this layer, so they pass through even without identity."""
    return tool in E.TOOL_CATALOG


def _rl_deny_msg(dimension, spec, tool_label):
    """The client-facing message for a rate-limit denial — names the dimension + the cap so the
    caller (and the demo audience) sees exactly which quota tripped."""
    dim = {'per_user': 'per-user', 'per_app': 'per-application', 'per_tool': f"per-tool ('{tool_label}')"}.get(dimension, dimension)
    return (f"Rate limit exceeded: the {dim} quota of {spec['count']} calls / "
            f"{spec['window_seconds']}s was reached. This throttle is enforced at the AgentCore "
            f"Gateway (MCP) boundary. Retry after the window resets.")


def _rate_limited(principal, client_id, tool, now):
    """Fixed-window rate-limit check across THREE dimensions (per-user, per-app, per-tool). Returns
    (dimension, spec) for the FIRST dimension that is over its cap, or (None, None) if all pass.

    Implementation: one DynamoDB item per (dimension-key, window-bucket), an atomic ADD to its
    counter, and a TTL so the item self-expires one window after creation. The window bucket is
    floor(now / window), so all calls in the same window share one counter and it resets cleanly at
    the boundary — no sweeper. FAIL-OPEN on any DynamoDB error or when the table is unconfigured:
    rate limiting is an abuse guard, not an authorization boundary, so a throttle-store outage must
    not deny legitimate governed calls (authorization already ran and passed by this point)."""
    if not _rl_table:
        return None, None
    # (dimension, rate_key, spec) for each configured dimension. rate_key namespaces the counter so
    # the three dimensions never collide, and per-tool is scoped to the USER so it's per-user-per-tool.
    dims = []
    su = E.rate_limit_for('per_user')
    if su:
        dims.append(('per_user', f'u#{principal}', su))
    sa = E.rate_limit_for('per_app')
    if sa and client_id:
        dims.append(('per_app', f'a#{client_id}', sa))
    st = E.rate_limit_for('per_tool', tool=tool)
    if st:
        dims.append(('per_tool', f't#{principal}#{tool}', st))

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
        except Exception as e:
            # Fail-open: never let a counter error deny a governed call that already passed authz.
            print(f'INTERCEPTOR rate-limit check error ({dimension}), failing open: '
                  f'{type(e).__name__}: {e}', flush=True)
            continue
        if current > spec['count']:
            return dimension, spec
    return None, None


def handler(event, context):
    """REQUEST interception point — FAIL CLOSED for governed tools.

    A `tools/call` for a GOVERNED tool is DENIED unless we can positively authorize it (known
    principal WITH the grant). Unknown principal, entitlements-load error, or a managed principal
    lacking the grant all DENY. Ungoverned tools and non-tools/call methods pass through; a hard
    crash before we can parse the method is the only last-resort ALLOW (so one bug can't brick
    the whole Gateway)."""
    try:
        mcp = event.get('mcp', {}) or {}
        mcp_req = mcp.get('gatewayRequest', {}) or {}
        body = mcp_req.get('body', {}) or {}
        if not isinstance(body, dict):
            return _allow(body, strip_principal=False)

        method = body.get('method', '')
        if method != 'tools/call':
            # tools/list, initialize, ping, etc. — never gate; pass through untouched.
            return _allow(body, strip_principal=False)

        tool_ns = (body.get('params', {}) or {}).get('name', '')
        tool = _bare_tool(tool_ns)

        # Ungoverned tool → nothing for this layer to enforce; allow.
        if not _is_governed_tool(tool):
            return _allow(body)

        principal, deny_reason, client_id = _principal_from_event(mcp_req, body)
        if deny_reason == 'impersonation':
            # A forged __principal that disagreed with the verified JWT sub → DENY unconditionally.
            print(f'INTERCEPTOR DENY(impersonation, governed) tool={tool_ns}', flush=True)
            return _deny(body, (E.TOOL_CATALOG.get(tool, {}) or {}).get('label', tool))
        if not principal:
            # Governed tool but we cannot identify the caller → FAIL CLOSED (was fail-open).
            print(f'INTERCEPTOR DENY(no-principal, governed) tool={tool_ns}', flush=True)
            return _deny(body, (E.TOOL_CATALOG.get(tool, {}) or {}).get('label', tool))

        eff = _effective(principal)
        if eff is None:
            # Entitlements load failed for a governed tool → FAIL CLOSED (was fail-open).
            print(f'INTERCEPTOR DENY(entitlements-unavailable) tool={tool} principal={_redact(principal)}', flush=True)
            return _deny(body, (E.TOOL_CATALOG.get(tool, {}) or {}).get('label', tool))

        if E.allows(eff, 'tools', tool):
            # Authorization passed. NOW apply rate limiting (per-user / per-app / per-tool) so we only
            # meter calls the caller is actually entitled to make. Over-quota → deny at the boundary.
            rl_dim, rl_spec = _rate_limited(principal, client_id, tool, time.time())
            if rl_dim:
                label = (E.TOOL_CATALOG.get(tool, {}) or {}).get('label', tool)
                print(f'INTERCEPTOR RATE-LIMIT DENY dim={rl_dim} tool={tool} '
                      f'principal={_redact(principal)}', flush=True)
                return _deny(body, label, message=_rl_deny_msg(rl_dim, rl_spec, label))
            # For the governed-DB (OpenAPI) target, re-assert the VERIFIED identity as principal_sub
            # so the backend's RLS/column scope can't be spoofed by a model-supplied value. `principal`
            # is 'user#<sub>'; the backend keys off the bare sub.
            target_ns = tool_ns.split('___')[0] if '___' in tool_ns else ''
            if GOVERNED_DB_TARGET and target_ns == GOVERNED_DB_TARGET:
                bare_sub = principal.split('#', 1)[1] if '#' in principal else principal
                return _allow(body, inject_principal_sub=bare_sub)
            return _allow(body)

        label = (E.TOOL_CATALOG.get(tool, {}) or {}).get('label', tool)
        print(f'INTERCEPTOR DENY tool={tool} principal={_redact(principal)} managed={eff.get("managed")}', flush=True)
        return _deny(body, label)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f'INTERCEPTOR ERROR (last-resort allow): {type(e).__name__}: {e}', flush=True)
        # Last resort ONLY: a crash before we could even classify the method. Narrow, documented
        # exception so a single interceptor bug can't brick the entire Gateway for every tool.
        try:
            return _allow(event.get('mcp', {}).get('gatewayRequest', {}).get('body', {}), strip_principal=False)
        except Exception:
            return {'interceptorOutputVersion': '1.0', 'mcp': {'transformedGatewayRequest': {}}}
