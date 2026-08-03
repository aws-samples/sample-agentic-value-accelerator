"""
Admin API — the control plane for the admin-managed, fine-grained RBAC layer.

This Lambda is the ONLY writer to the entitlements table. Every route is gated by a
server-side admin check: the caller's VERIFIED Cognito ID token (validated upstream by
the API Gateway HttpUserPoolAuthorizer) must carry `cognito:groups` containing the
`admins` group. A non-admin JWT — even a perfectly valid one — gets 403 on every route.
This is the real admin boundary: it does NOT rely on the frontend hiding the console.

Routes (all under the Cognito-authorized HTTP API):
  GET  /admin/catalog                 → the tool/desk/cred catalogs (for the console UI)
  GET  /admin/principals              → all users (from Cognito) + agents, each with their
                                        effective entitlements, for the grant grid
  GET  /admin/entitlements/{principal}→ one principal's raw grants
  POST /admin/grant                   → { principal, kind, key, value }  (single toggle)
                                        or { principal, kind, grants:{k:bool} } (bulk set)
  GET  /admin/audit                   → the runtime's security-audit trail (identity/RBAC/
                                        privileged actions), read back from CloudWatch Logs
                                        Insights. See audit.py.
  GET  /me/entitlements               → the CALLER's own effective view (NOT admin-gated;
                                        every user may read their own grants for the UI)

On every write the Lambda (a) upserts the entitlements item, (b) re-materializes the
per-tool Cedar policy set on the Gateway (the platform kill-switch layer — a scoped
`forbid` for any tool globally revoked for everyone), and (c) pushes an
`entitlements_changed` frame to the affected principal's live WebSocket connections so
the user's UI reflects the change within ~1s. Server-side enforcement (runtime +
interceptor) is already live on their very next turn regardless of the push.

Bundles a current boto3 (Lambda's built-in lacks the bedrock-agentcore-control policy
operations) — same pattern as lambda/policy-toggle. entitlements.py is copied in by
deploy.sh (single-sourced from agent/entitlements.py).
"""
import json
import os
import time
import uuid

import boto3

import entitlements as E
import cedar  # local module: per-tool Cedar policy re-materialization (USER-side kill-switch)
import iam_creds  # local module: per-cred IAM Deny on the runtime role (AGENT-side kill-switch)
import audit  # local module: reads the runtime's AUDIT log lines back via CloudWatch Logs Insights
import gateway_console  # local module: the live "Gateway" console (MCP endpoint, guardrail scan,
                        # rate-limit burst test, MCP proxy) — see lambda/admin-api/gateway_console.py

REGION = os.environ.get('REGION', 'us-west-2')
ENTITLEMENTS_TABLE = os.environ.get('ENTITLEMENTS_TABLE', '')
ACCESS_REQUESTS_TABLE = os.environ.get('ACCESS_REQUESTS_TABLE', '')
USER_POOL_ID = os.environ.get('USER_POOL_ID', '')
CONNECTIONS_TABLE = os.environ.get('CONNECTIONS_TABLE', '')
# Runtime id (deploy.sh-injected post-create) → the CloudWatch log group the audit reader queries.
RUNTIME_ID = os.environ.get('RUNTIME_ID', '')
WS_ENDPOINT = os.environ.get('WS_ENDPOINT', '')  # https://{apiId}.execute-api...{stage}
# Comma-separated agent workload names the admin can govern (outbound cred grants).
AGENT_WORKLOADS = [a for a in os.environ.get('AGENT_WORKLOADS', '').split(',') if a]

# Cap on the free-text justification a requester may attach (defensive; avoids a giant item).
REASON_MAX = 2000

# Just-in-time grant policy. A grant may be TIME-BOXED: the admin/approver sets a TTL and the
# grant auto-lapses (lazily at every enforcement point; the sweeper pushes the live UI update).
DEFAULT_GRANT_TTL = 8 * 3600         # 8h — a standard "working session" scoped grant
MAX_GRANT_TTL = 30 * 24 * 3600       # 30d hard ceiling on any single time-boxed grant
BREAK_GLASS_TTL = 15 * 60            # 15m — emergency self-grant window (heightened logging)

# Map an entitlements grant KIND → its DynamoDB dataType sort-key. The strings happen to be
# identical today, but going through E.DT_* keeps this honest if they ever diverge.
_DT_BY_KIND = {'tools': E.DT_TOOLS, 'desks': E.DT_DESKS, 'creds': E.DT_CREDS, 'agents': E.DT_AGENTS}


def _catalog_for(kind):
    """The catalog dict for a grant kind (single-sourced from entitlements)."""
    return {'tools': E.TOOL_CATALOG, 'desks': E.DESK_CATALOG,
            'creds': E.CRED_CATALOG, 'agents': E.AGENT_CATALOG}.get(kind, {})


def _is_sensitive(kind, key):
    """Whether granting (kind,key) should REQUIRE a written justification. Cross-vertical DESK
    access is inherently sensitive (separation of duties); tools/agents flagged `sensitive` in
    the catalog are too. Mirrored client-side so the UI asks for a reason on the same targets."""
    if kind == 'desks':
        return True
    return bool(_catalog_for(kind).get(key, {}).get('sensitive'))


def _clamp_ttl(ttl):
    """Coerce a requested TTL (seconds) into (0, MAX_GRANT_TTL]; None/invalid → DEFAULT_GRANT_TTL."""
    try:
        ttl = int(ttl)
    except (TypeError, ValueError):
        return DEFAULT_GRANT_TTL
    if ttl <= 0:
        return DEFAULT_GRANT_TTL
    return min(ttl, MAX_GRANT_TTL)

_ddb = boto3.resource('dynamodb', region_name=REGION)
_table = _ddb.Table(ENTITLEMENTS_TABLE) if ENTITLEMENTS_TABLE else None
_areq = _ddb.Table(ACCESS_REQUESTS_TABLE) if ACCESS_REQUESTS_TABLE else None
_cognito = boto3.client('cognito-idp', region_name=REGION)


# ─────────────────────────────────────────────────────────────────────────────
# Request identity — trust ONLY the claims the API Gateway authorizer verified.
# ─────────────────────────────────────────────────────────────────────────────
def _claims(event):
    """The verified JWT claims injected by the HttpUserPoolAuthorizer. We never parse the
    raw token here — API Gateway already validated signature/issuer/expiry/audience."""
    try:
        return event['requestContext']['authorizer']['jwt']['claims'] or {}
    except (KeyError, TypeError):
        return {}


def _caller(event):
    c = _claims(event)
    sub = c.get('sub', '')
    email = c.get('email') or c.get('cognito:username') or c.get('username', '')
    groups = c.get('cognito:groups', [])
    return sub, email, groups


# ─────────────────────────────────────────────────────────────────────────────
# Entitlements table access
# ─────────────────────────────────────────────────────────────────────────────
def _scan_all(table, **kwargs):
    """Fully-paginated scan. A single DynamoDB scan returns at most 1 MB and, with a
    FilterExpression, only the matches WITHIN that page — so a naive scan silently misses
    items once the table grows past one page. This drives the Cedar re-materialize (which must
    see EVERY managed user or it could fail to engage the global block) and the WS-push
    connection lookup, so it must be exhaustive."""
    items, lek = [], None
    while True:
        if lek:
            kwargs['ExclusiveStartKey'] = lek
        resp = table.scan(**kwargs)
        items += resp.get('Items', [])
        lek = resp.get('LastEvaluatedKey')
        if not lek:
            return items


def _read_principal(principal):
    """All items for one principal, keyed by dataType."""
    resp = _table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('principal').eq(principal),
    )
    return {it['dataType']: it for it in resp.get('Items', [])}


def _effective(principal):
    return E.evaluate(_read_principal(principal), now=time.time())


def _write_grants(principal, kind, grants, actor, label=None, agent_kind='user', expiries=None):
    """Upsert the {kind} grants map for a principal and stamp/create its meta item so the
    principal becomes MANAGED (default-deny thereafter).

    `expiries` is an optional {key: epoch_seconds} map of TIME-BOXED grants. A key absent from
    `expiries` is a STANDING grant. We prune expiries whose key is not granted-true (a revoked
    key carries no expiry) so the item never accumulates stale entries."""
    dt = _DT_BY_KIND[kind]
    now = int(time.time())
    grants = {k: bool(v) for k, v in grants.items()}
    expiries = {k: int(e) for k, e in (expiries or {}).items() if grants.get(k) and e}
    _table.put_item(Item={
        'principal': principal,
        'dataType': dt,
        'grants': grants,
        'expiries': expiries,
        'updated_at': now,
        'updated_by': actor,
    })
    # meta marks the principal managed; keep label/kind for the console listing.
    meta = _table.get_item(Key={'principal': principal, 'dataType': E.DT_META}).get('Item') or {}
    _table.put_item(Item={
        'principal': principal,
        'dataType': E.DT_META,
        'managed': True,
        'label': label or meta.get('label', principal),
        'kind': meta.get('kind', agent_kind),
        'updated_at': now,
        'updated_by': actor,
    })


# ─────────────────────────────────────────────────────────────────────────────
# Platform kill-switch — an explicit admin-forced global block overlay
# ─────────────────────────────────────────────────────────────────────────────
# The global block computed below is DERIVED: a tool is blocked only when every managed user
# is already revoked it. That is the emergent floor, but it can't express a deliberate one-tap
# "kill this MCP tool for everyone right now" — an operator shouldn't have to revoke it from N
# users first. So we keep a single explicit overlay item the admin toggles directly; the
# re-materialize below UNIONS it with the derived set. Stored as one row so it's atomic and
# trivially readable: principal='__platform__', dataType='forced_blocks', grants={'tools':{...},
# 'creds':{...}} (key→true). Disengaging removes the key; if that tool is ALSO derived-blocked
# (nobody has it), it correctly stays blocked — the overlay only ADDS, never overrides a denial.
_PLATFORM_PK = '__platform__'
_DT_FORCED = 'forced_blocks'


def _read_forced_blocks():
    """The admin-forced kill-switch overlay: {'tools': set(names), 'creds': set(keys)}. Empty on
    a fresh platform (no row yet). Only Gateway-fronted (Cedar-representable) tools are kept for
    the tools dim — a forced block on a runtime-only tool has no Gateway backstop to engage."""
    item = _table.get_item(Key={'principal': _PLATFORM_PK, 'dataType': _DT_FORCED}).get('Item') or {}
    grants = item.get('grants') or {}
    tools = {t for t, on in (grants.get('tools') or {}).items()
             if on and (E.TOOL_CATALOG.get(t) or {}).get('gateway_action')}
    creds = {c for c, on in (grants.get('creds') or {}).items() if on and c in E.CRED_CATALOG}
    return {'tools': tools, 'creds': creds}


def _write_forced_block(kind, key, engaged, actor):
    """Toggle ONE key in the forced-block overlay and persist. Returns the updated overlay."""
    item = _table.get_item(Key={'principal': _PLATFORM_PK, 'dataType': _DT_FORCED}).get('Item') or {}
    grants = item.get('grants') or {}
    dim = dict(grants.get(kind) or {})
    if engaged:
        dim[key] = True
    else:
        dim.pop(key, None)
    grants[kind] = dim
    _table.put_item(Item={
        'principal': _PLATFORM_PK,
        'dataType': _DT_FORCED,
        'grants': grants,
        'updated_at': int(time.time()),
        'updated_by': actor,
    })
    return _read_forced_blocks()


# ─────────────────────────────────────────────────────────────────────────────
# Side effects on write: Cedar re-materialize + WS push
# ─────────────────────────────────────────────────────────────────────────────
def _rematerialize_cedar():
    """Recompute the platform-layer per-tool Cedar policy set: a tool is globally
    FORBIDDEN (scoped forbid, all principals) iff EVERY managed user is denied it AND at
    least one user is managed, OR it is in the admin-forced kill-switch overlay. This keeps
    the Gateway (principal-agnostic under AWS_IAM) as a real kill-switch backstop, without
    fighting the per-user runtime/interceptor layer. Best-effort: never fail a grant on a
    Cedar hiccup."""
    try:
        forced = _read_forced_blocks()['tools']  # explicit admin kill-switch overlay
        # Which tools should be globally blocked? Scan managed users' tool grants (paginated).
        managed_users = []
        for it in _scan_all(
            _table,
            FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq(E.DT_TOOLS)
            & boto3.dynamodb.conditions.Attr('principal').begins_with('user#'),
        ):
            managed_users.append({k: bool(v) for k, v in (it.get('grants') or {}).items()})
        blocked = set(forced)  # forced blocks engage even with zero managed users
        for tool, spec in E.TOOL_CATALOG.items():
            if not spec.get('gateway_action'):
                continue  # only Gateway-fronted tools have a Cedar action
            if managed_users and all(not u.get(tool, False) for u in managed_users):
                blocked.add(tool)
        cedar.apply_tool_blocks(blocked)
        return {'blocked': sorted(blocked)}
    except Exception as e:
        print(f'CEDAR REMATERIALIZE WARN: {type(e).__name__}: {e}', flush=True)
        return {'error': str(e)}


def _rematerialize_cred_iam():
    """Recompute the AGENT-side IAM backstop: a credential provider's backing secret is
    explicitly DENIED on the runtime role (so the outbound vend fails at the AWS control
    plane) iff EVERY governed agent workload is revoked that cred AND at least one agent is
    managed. Mirror of _rematerialize_cedar for the creds dimension — see iam_creds.py.
    Best-effort: never fail a grant on an IAM hiccup (runtime pre-check stays primary)."""
    try:
        forced = _read_forced_blocks()['creds']  # explicit admin kill-switch overlay
        # Which creds should be globally blocked? Scan managed agents' cred grants (paginated).
        managed_agents = []
        for it in _scan_all(
            _table,
            FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq(E.DT_CREDS)
            & boto3.dynamodb.conditions.Attr('principal').begins_with('agent#'),
        ):
            managed_agents.append({k: bool(v) for k, v in (it.get('grants') or {}).items()})
        blocked = set(forced)  # forced blocks engage even with zero managed agents
        for cred in E.CRED_CATALOG:
            if managed_agents and all(not a.get(cred, False) for a in managed_agents):
                blocked.add(cred)
        iam_creds.apply_cred_blocks(blocked)
        return {'blocked': sorted(blocked)}
    except Exception as e:
        print(f'IAM-CREDS REMATERIALIZE WARN: {type(e).__name__}: {e}', flush=True)
        return {'error': str(e)}


def _raw_expiries(current, kind):
    """The stored {key: epoch} expiries map for a dataType from a _read_principal() result."""
    item = current.get(_DT_BY_KIND[kind]) or {}
    out = {}
    for k, v in (item.get('expiries') or {}).items():
        try:
            out[k] = int(v)
        except (TypeError, ValueError):
            continue
    return out


def _apply_single_grant(principal, kind, key, value, actor, label=None, expires_at=None):
    """Apply ONE grant toggle end-to-end, exactly as POST /admin/grant does: baseline-seed the
    full catalog the first time a principal is managed (so setting one key doesn't implicitly
    deny the other N), write the grants + meta, re-materialize the matching platform backstop
    (Cedar for user tools / IAM Deny for agent creds), and push the entitlements_changed frame.

    `expires_at` (epoch seconds) time-boxes THIS key; None → a standing grant (and clears any
    prior expiry on the key). Revoking (value=False) always clears the expiry.

    This is the SINGLE grant code path shared by the admin grant grid AND the request-approval
    flow, so an approval fires the same real side-effects. Returns the side-effect results."""
    current = _read_principal(principal)
    eff = E.evaluate(current)
    grants = dict(eff.get(kind, {}))
    if not grants:
        grants = E.default_grants_for(kind, all_true=True)
    grants[key] = bool(value)
    expiries = _raw_expiries(current, kind)
    if value and expires_at:
        expiries[key] = int(expires_at)
    else:
        expiries.pop(key, None)   # standing grant or revoke → no expiry on this key
    agent_kind = 'agent' if principal.startswith('agent#') else 'user'
    _write_grants(principal, kind, grants, actor=actor, label=label, agent_kind=agent_kind, expiries=expiries)
    cedar_result = _rematerialize_cedar() if kind == 'tools' else {'blocked': 'unchanged'}
    iam_creds_result = _rematerialize_cred_iam() if kind == 'creds' else {'blocked': 'unchanged'}
    _push_to_principal(principal)
    return {'cedar': cedar_result, 'iam_creds': iam_creds_result}


def _push_frame_to_sub(sub, frame_dict):
    """Push an arbitrary JSON frame to every live WS connection owned by a user (by sub).
    The connections table PK is connectionId, so we scan (paginated) filtered on userId.
    Best-effort — never raises; prunes GoneException connections. Returns the count pushed."""
    if not (CONNECTIONS_TABLE and WS_ENDPOINT and sub):
        return 0
    pushed = 0
    try:
        conns = _ddb.Table(CONNECTIONS_TABLE)
        items = _scan_all(
            conns,
            FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(sub),
            ProjectionExpression='connectionId',
        )
        if not items:
            return 0
        apigw = boto3.client('apigatewaymanagementapi', endpoint_url=WS_ENDPOINT, region_name=REGION)
        data = json.dumps(frame_dict, default=_json_default).encode()
        for it in items:
            cid = it['connectionId']
            try:
                apigw.post_to_connection(ConnectionId=cid, Data=data)
                pushed += 1
            except apigw.exceptions.GoneException:
                conns.delete_item(Key={'connectionId': cid})
            except Exception as e:
                print(f'WS PUSH WARN {cid}: {type(e).__name__}: {e}', flush=True)
    except Exception as e:
        print(f'WS PUSH SCAN WARN: {type(e).__name__}: {e}', flush=True)
    return pushed


def _push_to_principal(principal):
    """Push an entitlements_changed frame to every live WS connection owned by this user
    so the browser re-renders instantly. principal is 'user#<sub>'; we match on userId."""
    if not principal.startswith('user#'):
        return
    sub = principal.split('#', 1)[1]
    _push_frame_to_sub(sub, {'type': 'entitlements_changed', 'entitlements': _effective(principal)})


def _admin_subs():
    """The Cognito subs of every member of the admins group (for admin-directed WS fan-out).
    Cheaper than _list_users (one paginated ListUsersInGroup, no per-user group lookups)."""
    subs = []
    try:
        paginator = _cognito.get_paginator('list_users_in_group')
        for page in paginator.paginate(UserPoolId=USER_POOL_ID, GroupName=E.ADMIN_GROUP):
            for u in page.get('Users', []):
                attrs = {a['Name']: a['Value'] for a in u.get('Attributes', [])}
                sub = attrs.get('sub', '')
                if sub:
                    subs.append(sub)
    except Exception as e:
        print(f'ADMIN SUBS WARN: {type(e).__name__}: {e}', flush=True)
    return subs


def _notify_admins(frame_dict):
    """Fan a frame out to every live connection owned by an admin (e.g. a new pending request).
    Best-effort. NOTE: O(admins x connections-scan) — fine at demo scale (few admins)."""
    for sub in _admin_subs():
        _push_frame_to_sub(sub, frame_dict)


# ─────────────────────────────────────────────────────────────────────────────
# Access requests — the self-service "request → admin approve" workflow store.
# One item per request in AccessRequestsTable (PK requestId), with a status-index GSI
# so the admin can list PENDING without a table scan.
# ─────────────────────────────────────────────────────────────────────────────
_REQ_STATUSES = ('PENDING', 'APPROVED', 'DENIED')


def _find_pending_request(requester_sub, kind, key):
    """Return an existing PENDING request for the same (requester, kind, key), if any — the
    dedupe guard so a user can't stack duplicate open requests for the same grant."""
    try:
        resp = _areq.query(
            IndexName='status-index',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('status').eq('PENDING'),
        )
        for it in resp.get('Items', []):
            if it.get('requesterSub') == requester_sub and it.get('kind') == kind and it.get('key') == key:
                return it
    except Exception as e:
        print(f'REQ DEDUPE WARN: {type(e).__name__}: {e}', flush=True)
    return None


def _list_requests_by_status(status):
    """All requests in a given status, newest first (GSI query, no scan)."""
    resp = _areq.query(
        IndexName='status-index',
        KeyConditionExpression=boto3.dynamodb.conditions.Key('status').eq(status),
        ScanIndexForward=False,  # createdAt descending → newest first
    )
    return resp.get('Items', [])


def _list_requests_for_sub(sub):
    """A requester's own requests (across all statuses). Small per-user volume → scan filter."""
    return _scan_all(
        _areq,
        FilterExpression=boto3.dynamodb.conditions.Attr('requesterSub').eq(sub),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Principal listing (users from Cognito + agents from env)
# ─────────────────────────────────────────────────────────────────────────────
def _list_users():
    """List Cognito users with their groups, joined to their effective entitlements."""
    users = []
    paginator = _cognito.get_paginator('list_users')
    for page in paginator.paginate(UserPoolId=USER_POOL_ID):
        for u in page.get('Users', []):
            attrs = {a['Name']: a['Value'] for a in u.get('Attributes', [])}
            sub = attrs.get('sub', '')
            if not sub:
                continue
            email = attrs.get('email', u.get('Username', ''))
            principal = E.user_pk(sub)
            eff = _effective(principal)
            groups = []
            try:
                gr = _cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=u['Username'])
                groups = [g['GroupName'] for g in gr.get('Groups', [])]
            except Exception:
                pass
            users.append({
                'principal': principal,
                'sub': sub,
                'email': email,
                'groups': groups,
                'is_admin': E.ADMIN_GROUP in groups,
                'entitlements': eff,
            })
    return users


def _sub_to_email():
    """A {sub: email} map for every Cognito user — used to render the audit trail's actor subs
    as human emails. Cheaper than _list_users (no per-user group lookup, no entitlements join)."""
    out = {}
    try:
        paginator = _cognito.get_paginator('list_users')
        for page in paginator.paginate(UserPoolId=USER_POOL_ID):
            for u in page.get('Users', []):
                attrs = {a['Name']: a['Value'] for a in u.get('Attributes', [])}
                sub = attrs.get('sub', '')
                if sub:
                    out[sub] = attrs.get('email', u.get('Username', ''))
    except Exception as e:
        print(f'SUB->EMAIL WARN: {type(e).__name__}: {e}', flush=True)
    return out


def _list_agents():
    agents = []
    for name in (AGENT_WORKLOADS or ['meridian-agent']):
        principal = E.agent_pk(name)
        agents.append({
            'principal': principal,
            'name': name,
            'entitlements': _effective(principal),
        })
    return agents


# ─────────────────────────────────────────────────────────────────────────────
# HTTP handler
# ─────────────────────────────────────────────────────────────────────────────
def handler(event, context):
    method = (event.get('requestContext', {}).get('http', {}) or {}).get('method', '')
    raw_path = event.get('rawPath', '') or event.get('requestContext', {}).get('http', {}).get('path', '')
    sub, email, groups = _caller(event)

    if not sub:
        return _resp(401, {'error': 'Unauthenticated'})

    # ---- Self-service route: any authenticated user may read THEIR OWN entitlements ----
    if raw_path.endswith('/me/entitlements') and method == 'GET':
        eff = _effective(E.user_pk(sub))
        return _resp(200, {'principal': E.user_pk(sub), 'email': email,
                           'is_admin': E.is_admin(groups), 'entitlements': eff})

    # ---- Self-service access requests: any authenticated user may CREATE a request for a
    #      desk/tool/agent they lack, LIST their own, and break-glass self-grant. Resolved here,
    #      BEFORE the admin gate. Matches both '/me/access-requests' and its '/break-glass' tail. ----
    if '/me/access-requests' in raw_path:
        if _areq is None:
            return _resp(503, {'error': 'Access-requests store not configured'})

        # Break-glass emergency self-grant: /me/access-requests/break-glass (POST). A short-TTL
        # (15m), fully-audited, admin-alerted self-grant for a desk/tool/agent the user lacks —
        # the "security-first" escape hatch when waiting for approval isn't an option. It is NOT
        # a bypass of governance: it auto-expires fast, is loudly logged, alerts every admin in
        # real time, and is capped to the SAME sensitivity rules as a normal grant.
        if raw_path.endswith('/me/access-requests/break-glass') and method == 'POST':
            body = json.loads(event.get('body') or '{}')
            kind, key = body.get('kind', ''), body.get('key', '')
            reason = (body.get('reason') or '').strip()[:REASON_MAX]
            if kind not in E.REQUESTABLE_KINDS:
                return _resp(400, {'error': f'kind must be one of {E.REQUESTABLE_KINDS}'})
            if key not in _catalog_for(kind):
                return _resp(400, {'error': f'unknown {kind} key: {key}'})
            if not reason:
                return _resp(400, {'error': 'Break-glass REQUIRES a written justification.'})
            if E.allows(_effective(E.user_pk(sub)), kind, key):
                return _resp(409, {'error': 'You already have access to this.'})
            now = int(time.time())
            expires_at = now + BREAK_GLASS_TTL
            label = _catalog_for(kind).get(key, {}).get('label', key)
            # Heightened logging — this line is the audit signal a SIEM would alert on.
            print(f'BREAK_GLASS self-grant user={sub} email={email} kind={kind} key={key} '
                  f'ttl={BREAK_GLASS_TTL}s reason={reason!r}', flush=True)
            _apply_single_grant(E.user_pk(sub), kind, key, True,
                                actor=f'break-glass:{email or sub}', label=label, expires_at=expires_at)
            # Record it as an auto-approved request for the audit trail + admin visibility.
            item = {
                'requestId': str(uuid.uuid4()), 'requesterSub': sub, 'requesterEmail': email or sub,
                'kind': kind, 'key': key, 'label': label, 'reason': reason,
                'status': 'APPROVED', 'createdAt': now, 'decidedBy': 'break-glass',
                'decidedAt': now, 'breakGlass': True, 'expiresAt': expires_at,
            }
            _areq.put_item(Item=item)
            _notify_admins({'type': 'break_glass_used', 'request': _strip_req(item)})
            return _resp(201, {'request': _strip_req(item), 'expiresAt': expires_at,
                               'entitlements': _effective(E.user_pk(sub))})

        if method == 'GET':
            mine = sorted(_list_requests_for_sub(sub),
                          key=lambda r: int(r.get('createdAt', 0)), reverse=True)
            # Include the requestable catalog subset (desks + agents + tools) so the non-admin
            # request form can render labels — non-admins cannot reach /admin/catalog.
            return _resp(200, {
                'requests': [_strip_req(r) for r in mine],
                'catalog': {'tools': E.TOOL_CATALOG, 'desks': E.DESK_CATALOG, 'agents': E.AGENT_CATALOG},
                'break_glass_ttl': BREAK_GLASS_TTL,
            })

        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            kind = body.get('kind', '')
            key = body.get('key', '')
            reason = (body.get('reason') or '').strip()[:REASON_MAX]
            # creds are an AGENT-scoped grant — not user-requestable. desks/agents/tools only.
            if kind not in E.REQUESTABLE_KINDS:
                return _resp(400, {'error': f'kind must be one of {E.REQUESTABLE_KINDS}'})
            catalog = _catalog_for(kind)
            if key not in catalog:
                return _resp(400, {'error': f'unknown {kind} key: {key}'})
            # Sensitive targets (cross-desk access, execution/controls/fraud specialists+tools)
            # REQUIRE a written justification — separation of duties made explicit.
            if _is_sensitive(kind, key) and not reason:
                return _resp(400, {'error': 'A written justification is required to request this.'})
            # If the requester already HAS this grant, there's nothing to request.
            if E.allows(_effective(E.user_pk(sub)), kind, key):
                return _resp(409, {'error': 'You already have access to this.'})
            # Dedupe: an open PENDING for the same (requester, kind, key) → return it, idempotent.
            existing = _find_pending_request(sub, kind, key)
            if existing:
                return _resp(200, {'request': _strip_req(existing), 'deduped': True})

            now = int(time.time())
            # A requester may ASK for a time-boxed grant (e.g. "just for today"); the approving
            # admin can override. Clamp to policy. 0/absent → the admin decides at approval.
            req_ttl = _clamp_ttl(body['ttl_seconds']) if body.get('ttl_seconds') else 0
            item = {
                'requestId': str(uuid.uuid4()),
                'requesterSub': sub,
                'requesterEmail': email or sub,
                'kind': kind,
                'key': key,
                'label': catalog[key].get('label', key),
                'reason': reason,
                'ttlSeconds': req_ttl,
                'status': 'PENDING',
                'createdAt': now,
                'decidedBy': '',
                'decidedAt': 0,
            }
            _areq.put_item(Item=item)
            # Notify any online admin so the pending badge lights up live.
            _notify_admins({'type': 'access_request_created', 'request': _strip_req(item)})
            return _resp(201, {'request': _strip_req(item)})

        return _resp(404, {'error': f'No route for {method} {raw_path}'})

    # ---- Everything below is ADMIN-ONLY. Enforced server-side on the verified JWT. ----
    if not E.is_admin(groups):
        return _resp(403, {'error': 'Forbidden: admin group required',
                           'hint': 'Your identity is valid but lacks the admins group.'})

    try:
        if raw_path.endswith('/admin/catalog') and method == 'GET':
            return _resp(200, {
                'tools': E.TOOL_CATALOG,
                'desks': E.DESK_CATALOG,
                'creds': E.CRED_CATALOG,
                'agents': E.AGENT_CATALOG,
                'admin_group': E.ADMIN_GROUP,
                'grant_ttl': {'default': DEFAULT_GRANT_TTL, 'max': MAX_GRANT_TTL, 'break_glass': BREAK_GLASS_TTL},
            })

        if raw_path.endswith('/admin/principals') and method == 'GET':
            return _resp(200, {'users': _list_users(), 'agents': _list_agents()})

        # The governance-graph read model: everything the who-can-reach-what visualization
        # needs in one call — the catalogs (+ group ordering), every principal with its
        # effective grants, and the GLOBAL kill-switch state (Cedar-forbidden tools + IAM-denied
        # creds). The frontend computes per-principal granted/denied edges client-side via
        # allows(); the graph endpoint only adds the global-block overlay the grid never showed.
        if raw_path.endswith('/admin/graph') and method == 'GET':
            try:
                blocked_actions = cedar.get_blocked_actions()  # namespaced gateway_action strings
            except Exception:
                blocked_actions = []
            # Map Cedar gateway_action strings back to tool NAMES for the UI.
            action_to_tool = {spec.get('gateway_action'): name
                              for name, spec in E.TOOL_CATALOG.items() if spec.get('gateway_action')}
            blocked_tools = sorted({action_to_tool[a] for a in blocked_actions if a in action_to_tool})
            try:
                blocked_creds = sorted(iam_creds.get_blocked_cred_keys())
            except Exception:
                blocked_creds = []
            # The forced overlay lets the UI tell an operator kill-switch (disengageable in one
            # tap) apart from an emergent block (a tool nobody happens to hold).
            try:
                forced = _read_forced_blocks()
                forced_out = {'tools': sorted(forced['tools']), 'creds': sorted(forced['creds'])}
            except Exception:
                forced_out = {'tools': [], 'creds': []}
            return _resp(200, {
                'generated_at': int(time.time()),
                'catalog': {
                    'tools': E.TOOL_CATALOG,
                    'desks': E.DESK_CATALOG,
                    'creds': E.CRED_CATALOG,
                    'groups': E.tool_groups(),
                    'desk_groups': {d: E.groups_for_desk(d) for d in E.DESK_CATALOG},
                },
                'users': _list_users(),
                'agents': _list_agents(),
                'global_blocks': {'tools': blocked_tools, 'creds': blocked_creds},
                'forced_blocks': forced_out,
            })

        # Admin list of access requests (default PENDING) — served from the status GSI, no scan.
        if raw_path.endswith('/admin/access-requests') and method == 'GET':
            if _areq is None:
                return _resp(503, {'error': 'Access-requests store not configured'})
            status = (event.get('queryStringParameters') or {}).get('status', 'PENDING').upper()
            if status not in _REQ_STATUSES:
                return _resp(400, {'error': f'status must be one of {_REQ_STATUSES}'})
            items = sorted(_list_requests_by_status(status),
                           key=lambda r: int(r.get('createdAt', 0)), reverse=True)
            return _resp(200, {'requests': [_strip_req(r) for r in items], 'status': status})

        # Audit trail (READ): the runtime's security-audit lines (identity decisions, RBAC denials,
        # tool/agent scoping, trade/vault access, break-glass) read back from CloudWatch Logs
        # Insights. Admin-only — this data names who was denied/touched what. Query params:
        #   window : minutes to look back (default 720 = 12h; clamped 1..10080 = 7d)
        #   lens   : 'security' (default; hides the noisy identity_verified/tool_invoke allow-stream)
        #            or 'all'
        #   type   : optional single audit event type to pin (drill-down; allowlisted server-side)
        if raw_path.endswith('/admin/audit') and method == 'GET':
            qs = event.get('queryStringParameters') or {}
            try:
                window = max(1, min(int(qs.get('window', '720')), 7 * 24 * 60))
            except (TypeError, ValueError):
                window = 720
            lens = qs.get('lens', 'security')
            if lens not in ('security', 'all'):
                lens = 'security'
            event_type = qs.get('type') or None
            result = audit.read_audit(window, lens=lens, sub_to_email=_sub_to_email(),
                                      event_type=event_type)
            return _resp(200, result)

        # ── Gateway console (the "Gateway" section) — all admin-gated above ──────────────────────
        # The live backend for Michelle's Gateway-requirement checklist made interactive:
        #   GET  /admin/gateway/console      → bootstrap (MCP endpoint, targets, caps, guardrail meta)
        #   POST /admin/guardrail/scan       → live ApplyGuardrail on pasted text (blocks/masks)
        #   POST /admin/ratelimits/test      → real fixed-window burst (same algo as the interceptor)
        #   POST /admin/gateway/mcp          → proxy a JSON-RPC to the real Gateway /mcp with the
        #                                      caller's OWN access token (the external-client path)
        if raw_path.endswith('/admin/gateway/console') and method == 'GET':
            return _resp(200, gateway_console.build_console())

        if raw_path.endswith('/admin/guardrail/scan') and method == 'POST':
            body = json.loads(event.get('body') or '{}')
            text = body.get('text', '')
            source = body.get('source', 'OUTPUT')
            if source not in ('INPUT', 'OUTPUT'):
                source = 'OUTPUT'
            if not isinstance(text, str) or not text.strip():
                return _resp(400, {'error': 'Provide non-empty "text" to scan.'})
            if len(text) > 8000:
                text = text[:8000]  # ApplyGuardrail input cap for the demo
            # Loud audit line — a scan of pasted content is a governance action worth recording.
            print(f'GUARDRAIL_SCAN admin={email or sub} source={source} len={len(text)}', flush=True)
            return _resp(200, gateway_console.guardrail_scan(text, source=source))

        if raw_path.endswith('/admin/ratelimits/test') and method == 'POST':
            body = json.loads(event.get('body') or '{}')
            tool = body.get('tool', '')
            count = body.get('count', 10)
            print(f'RATELIMIT_BURST admin={email or sub} tool={tool} count={count}', flush=True)
            return _resp(200, gateway_console.ratelimit_burst(sub, tool, count))

        if raw_path.endswith('/admin/gateway/mcp') and method == 'POST':
            body = json.loads(event.get('body') or '{}')
            # The external-client credential being exercised: the caller's OWN Cognito ACCESS token,
            # sent by the browser in the body (the ID token already authenticated this admin route;
            # the Gateway's customJWT authorizer validates the access token's client_id). Fall back
            # to a raw Authorization header only if the client chose to forward it that way.
            access_token = body.get('access_token', '')
            if not access_token:
                hdrs = event.get('headers') or {}
                xat = hdrs.get('x-mcp-access-token') or hdrs.get('X-Mcp-Access-Token') or ''
                access_token = xat
            rpc = body.get('rpc') or {'method': body.get('method'), 'params': body.get('params', {}),
                                      'id': body.get('id', 1)}
            print(f'MCP_PROXY admin={email or sub} method={rpc.get("method")}', flush=True)
            return _resp(200, gateway_console.mcp_proxy(access_token, rpc))

        # Approve / deny a specific request: /admin/access-requests/{id}/(approve|deny)
        if '/admin/access-requests/' in raw_path and method == 'POST':
            if _areq is None:
                return _resp(503, {'error': 'Access-requests store not configured'})
            tail = raw_path.split('/admin/access-requests/', 1)[1]
            parts = [p for p in tail.split('/') if p]
            if len(parts) != 2 or parts[1] not in ('approve', 'deny'):
                return _resp(404, {'error': 'expected /admin/access-requests/{id}/(approve|deny)'})
            req_id, action = _url_unescape(parts[0]), parts[1]
            req = _areq.get_item(Key={'requestId': req_id}).get('Item')
            if not req:
                return _resp(404, {'error': 'request not found'})
            if req.get('status') != 'PENDING':
                return _resp(409, {'error': f"request already {req.get('status')}"})

            now = int(time.time())
            side_effects = {}
            if action == 'approve':
                # Time-box the approval. Precedence: the admin's explicit ttl_seconds in the POST
                # body → the requester's asked-for ttlSeconds → the JIT DEFAULT. `expires_at=None`
                # (standing) only when the admin explicitly posts ttl_seconds<=0 with a flag.
                abody = json.loads(event.get('body') or '{}')
                if abody.get('standing') is True:
                    expires_at = None      # admin deliberately grants standing (no expiry)
                else:
                    ttl = abody.get('ttl_seconds') or req.get('ttlSeconds') or DEFAULT_GRANT_TTL
                    expires_at = now + _clamp_ttl(ttl)
                # Reuse the SAME grant code path as the admin grid → real Cedar/IAM side-effects
                # + the entitlements_changed WS push to the requester.
                side_effects = _apply_single_grant(
                    E.user_pk(req['requesterSub']), req['kind'], req['key'], True,
                    actor=email or sub, label=req.get('label'), expires_at=expires_at,
                )
                req['expiresAt'] = expires_at or 0
                new_status = 'APPROVED'
            else:
                new_status = 'DENIED'

            req['status'] = new_status
            req['decidedBy'] = email or sub
            req['decidedAt'] = now
            _areq.put_item(Item=req)
            # Tell the requester the outcome (a distinct frame from entitlements_changed).
            _push_frame_to_sub(req['requesterSub'], {
                'type': 'access_request_resolved',
                'request': _strip_req(req),
            })
            return _resp(200, {'request': _strip_req(req), **side_effects})

        if '/admin/entitlements/' in raw_path and method == 'GET':
            principal = raw_path.split('/admin/entitlements/', 1)[1]
            principal = _url_unescape(principal)
            return _resp(200, {'principal': principal, 'entitlements': _effective(principal),
                               'raw': {k: _strip(v) for k, v in _read_principal(principal).items()}})

        # Platform kill-switch — engage/disengage a GLOBAL block on one MCP tool (or agent cred)
        # directly, without revoking it per-user first. Writes the admin-forced overlay and
        # re-materializes the matching backstop (Cedar forbid for tools / IAM Deny for creds).
        # This is the deliberate operator control the read-only Overview tile reflects.
        if raw_path.endswith('/admin/global-block') and method == 'POST':
            body = json.loads(event.get('body') or '{}')
            kind = body.get('kind', '')
            key = body.get('key', '')
            engaged = bool(body.get('engaged', False))
            if kind not in ('tools', 'creds'):
                return _resp(400, {'error': "kind must be 'tools' | 'creds'"})
            catalog = E.TOOL_CATALOG if kind == 'tools' else E.CRED_CATALOG
            if key not in catalog:
                return _resp(400, {'error': f'unknown {kind} key: {key}'})
            # A tool with no Cedar action has no Gateway backstop — refuse rather than pretend.
            if kind == 'tools' and not (E.TOOL_CATALOG.get(key) or {}).get('gateway_action'):
                return _resp(400, {'error': f"'{key}' is runtime-enforced only — no Gateway kill-switch"})
            forced = _write_forced_block(kind, key, engaged, actor=email or sub)
            print(f'KILL_SWITCH admin={email or sub} kind={kind} key={key} engaged={engaged}', flush=True)
            result = _rematerialize_cedar() if kind == 'tools' else _rematerialize_cred_iam()
            return _resp(200, {
                'kind': kind, 'key': key, 'engaged': engaged,
                'forced_blocks': {'tools': sorted(forced['tools']), 'creds': sorted(forced['creds'])},
                'backstop': result,
            })

        if raw_path.endswith('/admin/grant') and method == 'POST':
            body = json.loads(event.get('body') or '{}')
            principal = body.get('principal', '')
            kind = body.get('kind', '')
            # 'agents' is USER-scoped (per-specialist invocation), alongside tools/desks; 'creds'
            # is AGENT-scoped (outbound credentials). Keep the scope guards precise.
            if kind not in ('tools', 'desks', 'creds', 'agents'):
                return _resp(400, {'error': "kind must be 'tools' | 'desks' | 'creds' | 'agents'"})
            if not (principal.startswith('user#') or principal.startswith('agent#')):
                return _resp(400, {'error': "principal must be 'user#<sub>' or 'agent#<name>'"})
            # A user cannot manage cred grants (that's the agent's outbound story); an agent
            # only has cred grants (never tools/desks/agents). Guard so the grid can't post nonsense.
            if principal.startswith('user#') and kind == 'creds':
                return _resp(400, {'error': 'creds are an agent-scoped grant, not user-scoped'})
            if principal.startswith('agent#') and kind != 'creds':
                return _resp(400, {'error': 'agents only carry cred grants'})

            # Time-boxing: expires_at wins if given; else ttl_seconds-from-now; else standing.
            now = int(time.time())
            if body.get('expires_at'):
                expires_at = int(body['expires_at'])
            elif body.get('ttl_seconds'):
                expires_at = now + _clamp_ttl(body['ttl_seconds'])
            else:
                expires_at = None       # admin grid default = STANDING grant (unchanged behavior)

            label = body.get('label')
            if 'grants' in body and isinstance(body['grants'], dict):
                # Bulk set — baseline-seed then overlay every provided key, one write. Preserve
                # existing expiries; apply expires_at to every key newly (or still) set true here.
                current = _read_principal(principal)
                grants = dict(E.evaluate(current).get(kind, {}))
                if not grants:
                    grants = E.default_grants_for(kind, all_true=True)
                expiries = _raw_expiries(current, kind)
                for k, v in body['grants'].items():
                    grants[k] = bool(v)
                    if bool(v) and expires_at:
                        expiries[k] = expires_at
                    else:
                        expiries.pop(k, None)   # revoke or standing → clear this key's expiry
                agent_kind = 'agent' if principal.startswith('agent#') else 'user'
                _write_grants(principal, kind, grants, actor=email or sub, label=label,
                              agent_kind=agent_kind, expiries=expiries)
                cedar_result = _rematerialize_cedar() if kind == 'tools' else {'blocked': 'unchanged'}
                iam_creds_result = _rematerialize_cred_iam() if kind == 'creds' else {'blocked': 'unchanged'}
                _push_to_principal(principal)
            else:
                # Single toggle — shares the exact grant code path used by request-approval.
                key = body.get('key', '')
                catalog = _catalog_for(kind)
                if key not in catalog:
                    return _resp(400, {'error': f'unknown {kind} key: {key}'})
                se = _apply_single_grant(principal, kind, key, body.get('value', False),
                                         actor=email or sub, label=label, expires_at=expires_at)
                cedar_result, iam_creds_result = se['cedar'], se['iam_creds']

            return _resp(200, {
                'principal': principal,
                'entitlements': _effective(principal),
                'cedar': cedar_result,
                'iam_creds': iam_creds_result,
            })

        return _resp(404, {'error': f'No route for {method} {raw_path}'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return _resp(500, {'error': f'{type(e).__name__}: {e}'})


def _strip(item):
    """Drop the PK/SK from an item for the raw view."""
    return {k: v for k, v in item.items() if k not in ('principal', 'dataType')}


def _strip_req(item):
    """Normalize an access-request item for the wire: coerce DynamoDB Decimals on the
    numeric fields to ints so the JSON is clean (the generic _json_default handles the rest)."""
    out = dict(item)
    for k in ('createdAt', 'decidedAt', 'ttlSeconds', 'expiresAt'):
        if k in out and out[k] is not None:
            try:
                out[k] = int(out[k])
            except (TypeError, ValueError):
                pass
    return out


def _url_unescape(s):
    try:
        import urllib.parse
        return urllib.parse.unquote(s)
    except Exception:
        return s


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body, default=_json_default),
    }


def _json_default(o):
    # DynamoDB numbers come back as Decimal — make them JSON-serializable.
    from decimal import Decimal
    if isinstance(o, Decimal):
        return int(o) if o % 1 == 0 else float(o)
    return str(o)
