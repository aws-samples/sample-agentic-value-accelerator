"""AWS Agent Registry submodule.

NOTE (2026-08-06 namespace migration): AWS Agent Registry is in public preview under the
`bedrock-agentcore` namespace and moves to the `agent-registry` namespace on 2026-08-06. When
that lands, the ctx.control / ctx.data clients used here must be re-pointed to the new service
name and IAM policies updated. See registry-faq (Migration from public preview).

read(ctx, event)      → GET /registry : list records + statuses (control-plane list)
search(ctx, body)     → POST /registry/search : semantic/keyword search over APPROVED records
curate(ctx, body, by) → POST /registry/curate (admin) : validate / submit / approve / reject / deprecate

Auth model: the registry itself uses AWS_IAM inbound auth, so search/list/curate all run with
THIS Lambda's IAM role. End-user identity is verified at the API-GW edge (Cognito); the admin
gate for curate is enforced in index.py before this module is called.

────────────────────────────────────────────────────────────────────────────────────
PRE-ONBOARDING VALIDATION  ("an MCP must follow this auth pattern")
────────────────────────────────────────────────────────────────────────────────────
Approval used to be a bare status flip — a human clicks Approve and nothing inspects the thing
being approved. That answers "who decides" but not "what must be true before it can even be put
forward". `_validate_descriptor()` is the automated admission gate: it parses the record's
descriptor and enforces the platform's non-negotiable rules BEFORE a record can leave DRAFT.

It runs as a HARD GATE on `submit` (a descriptor that fails cannot enter PENDING_APPROVAL), and is
also exposed as a read-only `validate` action so an author/admin can dry-run the checks. The rules
below encode exactly Michelle's requirement — a registered MCP must be reachable ONLY through a
governed, JWT-authenticated boundary (the AgentCore Gateway), never a raw/cleartext endpoint.
"""
import json
import os
from urllib.parse import urlparse

REGION = os.environ.get('REGION', 'us-west-2')
REGISTRY_ID = os.environ.get('REGISTRY_ID', '')

# ── Admission-check policy (tunable via env; defaults are the strict/demo-true posture) ──
# All remote/server URLs must be TLS. A cleartext MCP endpoint is rejected outright.
_REQUIRE_HTTPS = os.environ.get('REGISTRY_REQUIRE_HTTPS', 'true').lower() != 'false'
# An MCP remote must terminate at a GOVERNED auth boundary. The AgentCore Gateway host
# (*.gateway.bedrock-agentcore.<region>.amazonaws.com) IS that boundary (CUSTOM_JWT inbound), so a
# remote pointing there provably follows "must be JWT-authenticated". Extra approved auth hosts can
# be allow-listed via REGISTRY_APPROVED_AUTH_HOSTS (comma-separated substrings) for real MCPs that
# front their own OAuth2/JWT — the pattern check, not a hardcoded single endpoint.
_GATEWAY_HOST_MARK = '.gateway.bedrock-agentcore.'
_EXTRA_AUTH_HOSTS = [h.strip() for h in os.environ.get('REGISTRY_APPROVED_AUTH_HOSTS', '').split(',') if h.strip()]
# Non-MCP records (a desk agent, an A2A/AG-UI app) must name an owning team so the catalog has a
# responsible party — one of these keys must be present & non-empty in the descriptor content.
_OWNER_KEYS = ('team', 'owner', 'desk', 'ownerTeam', 'owning_team')

# Valid target states for curation (maps the UI action → the control-plane status).
_CURATE_STATUS = {'approve': 'APPROVED', 'reject': 'REJECTED', 'deprecate': 'DEPRECATED'}


def _check(name, ok, detail):
    """One admission-check line — {name, pass, detail} — so the UI can render a checklist."""
    return {'name': name, 'pass': bool(ok), 'detail': detail}


def _host_is_governed(url):
    """True iff `url` terminates at a governed auth boundary — the AgentCore Gateway (CUSTOM_JWT)
    or an explicitly allow-listed auth host. This is the concrete "must follow the auth pattern"."""
    try:
        host = (urlparse(url).hostname or '').lower()
    except Exception:
        return False
    if _GATEWAY_HOST_MARK in host:
        return True
    return any(h.lower() in host for h in _EXTRA_AUTH_HOSTS)


def _mcp_remotes(content):
    """Every remote/endpoint URL declared in an MCP server.json (remotes[].url, plus any
    top-level `url`). Returns a list of (kind, url) for the checks to iterate."""
    urls = []
    for r in (content.get('remotes') or []):
        if isinstance(r, dict) and r.get('url'):
            urls.append((r.get('type') or 'remote', r['url']))
    if content.get('url'):  # some server.json variants put a single url at the top level
        urls.append(('url', content['url']))
    return urls


def _validate_descriptor(record):
    """Run the pre-onboarding admission checks against a fetched registry record.

    Returns { ok: bool, descriptor_type, checks: [ {name, pass, detail} ], reasons: [str] }.
    `reasons` is the subset of failing check details (what the caller shows on a rejection).
    A descriptor we cannot parse fails CLOSED — an un-inspectable thing must not be onboarded."""
    dtype = (record.get('descriptorType') or '').upper()
    desc = record.get('descriptors') or {}
    checks = []

    # 1) Extract + parse the inline content for this descriptor type.
    inline, parse_detail = None, ''
    try:
        if dtype == 'MCP':
            inline = (desc.get('mcp') or {}).get('server', {}).get('inlineContent')
        else:
            # CUSTOM / A2A / AG-UI / AGENT_SKILLS / HTTP all carry {<lower>: {inlineContent}}.
            branch = desc.get(dtype.lower()) or next((v for v in desc.values() if isinstance(v, dict)), {})
            inline = branch.get('inlineContent') if isinstance(branch, dict) else None
        content = json.loads(inline) if isinstance(inline, str) else (inline or {})
        if not isinstance(content, dict):
            content, parse_detail = {}, 'descriptor content is not a JSON object'
    except Exception as e:
        content, parse_detail = {}, f'{type(e).__name__}: {e}'
    checks.append(_check('descriptor parses', bool(content) and not parse_detail,
                         parse_detail or 'descriptor content is valid JSON'))

    # 2) Identity basics every record needs.
    checks.append(_check('declares name', bool(content.get('name') or record.get('name')),
                         'record/descriptor has a name'))
    checks.append(_check('declares version', bool(content.get('version') or record.get('recordVersion')),
                         'record/descriptor has a version'))

    if dtype == 'MCP':
        remotes = _mcp_remotes(content)
        checks.append(_check('declares an endpoint', bool(remotes),
                             f'{len(remotes)} remote endpoint(s) declared' if remotes
                             else 'MCP server.json declares no remotes[].url'))
        # 3) TLS on every endpoint.
        if _REQUIRE_HTTPS:
            bad_tls = [u for _, u in remotes if not str(u).lower().startswith('https://')]
            checks.append(_check('endpoints are TLS (https)', bool(remotes) and not bad_tls,
                                 'no endpoint to check' if not remotes
                                 else 'all endpoints use https' if not bad_tls
                                 else f'cleartext/none-TLS endpoint(s): {bad_tls}'))
        # 4) THE auth-pattern rule: every endpoint must sit behind the governed Gateway.
        ungoverned = [u for _, u in remotes if not _host_is_governed(u)]
        checks.append(_check('endpoints behind governed JWT boundary', bool(remotes) and not ungoverned,
                             'all endpoints route through the AgentCore Gateway (CUSTOM_JWT)'
                             if remotes and not ungoverned
                             else f'endpoint(s) not behind an approved auth boundary: {ungoverned}'))
    else:
        # 5) Non-MCP records must name an owning team.
        owner = next((str(content[k]) for k in _OWNER_KEYS if content.get(k)), '')
        checks.append(_check('names an owning team', bool(owner),
                             f'owner/team = {owner!r}' if owner
                             else f'descriptor declares no owner (one of {list(_OWNER_KEYS)})'))

    ok = all(c['pass'] for c in checks)
    reasons = [c['detail'] for c in checks if not c['pass']]
    return {'ok': ok, 'descriptor_type': dtype, 'checks': checks, 'reasons': reasons}


def _fetch_record(ctx, record_id):
    """Fetch one record (for validation). Returns the record dict or None."""
    try:
        r = ctx.control.get_registry_record(registryId=REGISTRY_ID, recordId=record_id)
        # The API returns the record fields at the top level (see get-registry-record shape).
        return r if r.get('recordId') else (r.get('registryRecord') or r)
    except Exception as e:
        print(f'REGISTRY get_registry_record failed: {type(e).__name__}: {e}', flush=True)
        return None


def _slim_record(r):
    return {
        'record_id': r.get('recordId', ''),
        'name': r.get('name', ''),
        'description': r.get('description', ''),
        'descriptor_type': r.get('descriptorType', ''),
        'version': r.get('version') or r.get('recordVersion', ''),
        'status': r.get('status', ''),
        'updated_at': str(r.get('updatedAt', '')),
    }


def read(ctx, event):
    if not REGISTRY_ID:
        return ctx.resp(200, {'configured': False, 'records': [],
                              'note': 'Registry not provisioned yet (run deploy.sh STEP 5b).'})
    qs = event.get('queryStringParameters') or {}
    status = (qs.get('status') or '').strip().upper()
    records, token = [], None
    try:
        # Paginate list_registry_records; optionally filter by status.
        while True:
            kwargs = {'registryId': REGISTRY_ID, 'maxResults': 50}
            if status:
                kwargs['status'] = status
            if token:
                kwargs['nextToken'] = token
            r = ctx.control.list_registry_records(**kwargs)
            records.extend(_slim_record(x) for x in (r.get('registryRecords') or r.get('records') or []))
            token = r.get('nextToken')
            if not token or len(records) >= 200:
                break
    except Exception as e:
        # Read route: never throw — return what we have plus a soft error note.
        print(f'REGISTRY list failed: {type(e).__name__}: {e}', flush=True)
        return ctx.resp(200, {'configured': True, 'registry_id': REGISTRY_ID, 'records': records,
                              'error': f'{type(e).__name__}'})
    return ctx.resp(200, {'configured': True, 'registry_id': REGISTRY_ID, 'records': records})


def search(ctx, body):
    if not REGISTRY_ID:
        return ctx.resp(200, {'configured': False, 'results': [],
                              'note': 'Registry not provisioned yet.'})
    query = (body.get('query') or '').strip()
    if not query:
        return ctx.resp(400, {'error': 'query required'})
    try:
        # Data-plane semantic/keyword search — only APPROVED records are returned by the service.
        r = ctx.data.search_registry_records(
            searchQuery=query,
            registryIds=[REGISTRY_ID],
            maxResults=min(int(body.get('max_results', 10)), 25),
        )
        results = [_slim_record(x) for x in (r.get('registryRecords') or r.get('records') or [])]
        return ctx.resp(200, {'configured': True, 'query': query, 'results': results})
    except Exception as e:
        # Search is user-triggered; surface a clean error (the panel shows it).
        return ctx.resp(200, {'configured': True, 'query': query, 'results': [],
                              'error': f'{type(e).__name__}: {e}'})


def curate(ctx, body, by):
    """Admin-only (gate enforced in index.py). action ∈ {validate, submit, approve, reject, deprecate}.

    `submit` is now GATED: the record must pass the pre-onboarding admission checks (governed
    JWT boundary, TLS, required fields) before it can enter PENDING_APPROVAL. `validate` runs the
    same checks read-only (no state change) so an author can dry-run them. A failed submit returns
    422 with the per-check results so the console can render exactly what to fix."""
    if not REGISTRY_ID:
        return ctx.resp(200, {'configured': False, 'note': 'Registry not provisioned yet.'})
    record_id = (body.get('record_id') or '').strip()
    action = (body.get('action') or '').strip().lower()
    if not record_id:
        return ctx.resp(400, {'error': 'record_id required'})
    reason = (body.get('reason') or f'Curated by {by}')[:1024]

    # validate / submit both need the admission-check verdict first.
    if action in ('validate', 'submit'):
        record = _fetch_record(ctx, record_id)
        if record is None:
            return ctx.resp(404, {'error': f'record {record_id} not found', 'record_id': record_id})
        verdict = _validate_descriptor(record)
        if action == 'validate':
            # Read-only dry run — never mutates state.
            return ctx.resp(200, {'configured': True, 'record_id': record_id, 'action': 'validate',
                                  'validation': verdict})
        if not verdict['ok']:
            # HARD GATE: a non-conforming descriptor cannot leave DRAFT.
            print(f'REGISTRY submit BLOCKED for {record_id}: {verdict["reasons"]}', flush=True)
            return ctx.resp(422, {'configured': True, 'record_id': record_id, 'action': 'submit',
                                  'error': 'Pre-onboarding validation failed',
                                  'validation': verdict})

    try:
        if action == 'submit':
            r = ctx.control.submit_registry_record_for_approval(registryId=REGISTRY_ID, recordId=record_id)
        elif action in _CURATE_STATUS:
            r = ctx.control.update_registry_record_status(
                registryId=REGISTRY_ID, recordId=record_id,
                status=_CURATE_STATUS[action], statusReason=reason)
        else:
            return ctx.resp(400, {'error': f'unknown action {action!r}; expected validate/submit/approve/reject/deprecate'})
        out = {'configured': True, 'record_id': record_id, 'action': action,
               'status': r.get('status', ''), 'by': by}
        # Surface the passed admission checks on a successful submit (proof the gate ran, not skipped).
        if action == 'submit':
            out['validation'] = verdict
        return ctx.resp(200, out)
    except Exception as e:
        # Mutating route: surface the error so the console shows why it failed.
        return ctx.resp(500, {'error': f'{type(e).__name__}: {e}', 'record_id': record_id, 'action': action})
