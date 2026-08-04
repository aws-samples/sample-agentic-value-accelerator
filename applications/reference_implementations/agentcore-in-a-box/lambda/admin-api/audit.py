"""
Audit-trail reader — the READ side of the governance story.

The runtime already emits ONE structured security-audit line per security-relevant event
(`_audit(...)` in agent/main.py → `AUDIT {json}` to stdout → the runtime's CloudWatch log
group). Those lines are the source of truth: identity decisions, per-tool RBAC denials, the
proactive tool/agent scoping, trade/vault access, blocked browser URLs, break-glass, budget
elevation. Nothing writes them to a queryable store — so this module reads them BACK via a
CloudWatch Logs Insights query over the runtime's `-DEFAULT` log group, mirroring the pattern
the observability Lambda already uses for spans (see lambda/observability/index.py).

Why read-back and not a DynamoDB writer on the runtime? Two reasons: (1) it keeps the runtime
hot path free of an extra synchronous write per security event, and (2) CloudWatch is already
the authoritative, tamper-evident, retention-managed sink these lines land in — re-deriving a
second copy would only add drift. The trade-off is query latency (a few seconds) and the
Insights window, both fine for an admin "access history" panel.

This is admin-only data (it names who was denied what, who touched the vault, whose identity
was rejected), so the ONLY caller is the admin-gated /admin/audit route in index.py — never the
open observability Lambda. Self-contained like cedar.py / iam_creds.py (NOT deploy.sh-copied):
it imports only boto3 + the local entitlements module for catalog labels.
"""
import json
import os
import time

import boto3

REGION = os.environ.get('REGION', 'us-west-2')
# The runtime id (e.g. agentcore_demo_agent_meridian2-fNP82g8R42), injected by deploy.sh
# post-runtime-create — same pattern as the observability Lambda's RUNTIME_ID.
RUNTIME_ID = os.environ.get('RUNTIME_ID', '')

_logs = boto3.client('logs', region_name=REGION)

# Every audit event type the runtime emits (agent/main.py `_audit(...)` call sites), mapped to
# a human label + a SEVERITY the UI colours by. Severity is about governance attention, not
# system health: a denial/rejection is `warn`, an actively-sensitive privileged action
# (trade/vault/break-glass) is `alert`, routine allows are `info`. An unknown event type
# degrades to info with its raw name — new _audit() events surface without a code change here.
EVENT_META = {
    # Identity decisions (who the runtime believed the caller was, verified vs rejected).
    'identity_verified':          {'label': 'Identity verified',        'severity': 'info',  'category': 'identity'},
    'identity_rejected':          {'label': 'Identity REJECTED',        'severity': 'alert', 'category': 'identity'},
    'identity_anonymous':         {'label': 'Anonymous (no token)',     'severity': 'info',  'category': 'identity'},
    # Access-control decisions — the heart of the governance story.
    'rbac_deny':                  {'label': 'Access denied',            'severity': 'warn',  'category': 'access'},
    'rbac_scope_tools':           {'label': 'Tools withheld (scoped)',  'severity': 'warn',  'category': 'access'},
    'rbac_scope_agents':          {'label': 'Specialists withheld',     'severity': 'warn',  'category': 'access'},
    # Content firewall — the Bedrock guardrail on the inbound prompt. A hard BLOCK (secret/SSN/
    # card) is `alert`; a PII MASK (email/phone/name allowed through, redacted) is `warn`. The
    # per-event severity is refined in _shape_event from the `blocked` field (both share this type).
    'guardrail':                  {'label': 'Content firewall stopped a prompt', 'severity': 'alert', 'category': 'content'},
    # Privileged / sensitive actions that DID happen (allowed) — worth an audit eye.
    'trade_execute':              {'label': 'Trade submitted',          'severity': 'alert', 'category': 'privileged'},
    'vault_access':               {'label': 'Vault secret requested',   'severity': 'alert', 'category': 'privileged'},
    'browser_blocked':            {'label': 'Browser URL blocked',      'severity': 'warn',  'category': 'privileged'},
    'code_interpreter_unavailable': {'label': 'Code sandbox unavailable', 'severity': 'info', 'category': 'privileged'},
    'tool_invoke':                {'label': 'Tool invoked',             'severity': 'info',  'category': 'tool'},
    'long_running_request':       {'label': 'Long-running request',     'severity': 'info',  'category': 'tool'},
}

# The high-frequency, low-signal event types. Every turn emits several identity_verified +
# tool_invoke(allow) lines; in the default "security" lens we exclude them at the QUERY level
# (cheaper + keeps the window meaningful) so denials/scoping/privileged actions aren't buried.
_NOISY_TYPES = ('identity_verified', 'tool_invoke')

# Hard ceiling on rows we pull back from Insights per call (defensive; the panel paginates in UI).
_MAX_EVENTS = 300


def _runtime_log_group():
    """The runtime's DEFAULT endpoint log group — where the AUDIT stdout lines land (verified
    live: 327 AUDIT lines/24h in this group, streams named [runtime-logs]...)."""
    return f'/aws/bedrock-agentcore/runtimes/{RUNTIME_ID}-DEFAULT'


def _run_insights_query(log_group, query, start, end, timeout_s=20):
    """Start a Logs Insights query and poll to completion. Returns list-of-dicts rows
    (field→value). Never throws — returns [] on failure/timeout (caller reports the state)."""
    q = _logs.start_query(
        logGroupName=log_group, startTime=int(start), endTime=int(end),
        queryString=query, limit=1000,
    )
    qid = q['queryId']
    waited = 0.0
    while waited < timeout_s:
        # No boto3 waiter exists for get_query_results — bounded sleep-between-polls is the
        # canonical pattern (same as the observability Lambda's span reader).
        time.sleep(0.6)  # nosemgrep  (arbitrary-sleep: bounded poll of async Logs Insights query)
        waited += 0.6
        r = _logs.get_query_results(queryId=qid)
        status = r.get('status')
        if status == 'Complete':
            return [{f['field']: f['value'] for f in row} for row in r.get('results', [])]
        if status in ('Failed', 'Cancelled', 'Timeout'):
            return []
    return []


def _parse_audit_line(message):
    """Extract the JSON object from an `AUDIT {json}` log line. The runtime prints
    `'AUDIT ' + json.dumps(rec)`, sometimes behind a CloudWatch timestamp/prefix, so we split on
    the first 'AUDIT ' marker and JSON-parse the tail. Returns the dict or None if it isn't one."""
    if not message or 'AUDIT ' not in message:
        return None
    tail = message.split('AUDIT ', 1)[1].strip()
    try:
        obj = json.loads(tail)
        return obj if isinstance(obj, dict) else None
    except (ValueError, TypeError):
        return None


def _shape_event(obj, sub_to_email):
    """Turn a parsed audit dict into the UI wire shape. Resolves the actor sub → email when we
    can (falls back to the raw sub), attaches label/severity/category, and carries the
    event-specific detail fields (tool/desk/scope/withheld/reason/…) through as `detail`."""
    etype = obj.get('audit', '?')
    meta = EVENT_META.get(etype, {'label': etype, 'severity': 'info', 'category': 'other'})
    sub = obj.get('sub', '') or ''
    severity, label = meta['severity'], meta['label']
    # A guardrail event shares one type but two outcomes — a hard block (alert) vs a PII mask
    # (warn, prompt still ran). Refine both from the fields the runtime already emitted.
    if etype == 'guardrail' and not _as_bool(obj.get('blocked')):
        severity, label = 'warn', 'Content firewall masked PII'
    # The turn's session id ties this event to its CloudWatch execution trace (GET /trace).
    # Surface it top-level so the UI can offer a click-through; keep it out of the detail chips.
    session = obj.get('session', '') or ''
    # Detail = every field that isn't structural. Keep it small + already-safe (the runtime
    # never logs secrets/inputs verbatim; see _audit's redaction contract).
    detail = {k: v for k, v in obj.items() if k not in ('audit', 'ts', 'sub', 'session')}
    return {
        'type': etype,
        'label': label,
        'severity': severity,
        'category': meta['category'],
        'ts': _as_int(obj.get('ts')),
        'actor_sub': sub,
        'actor_email': sub_to_email.get(sub, '') if sub else '',
        'session': session,
        'detail': detail,
    }


def _as_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _as_bool(v):
    """Coerce an audit field to bool. The runtime emits a real JSON bool, but be tolerant of a
    stringified 'true'/'false' surviving the log round-trip."""
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() == 'true'


def read_audit(window_min, lens='security', sub_to_email=None, event_type=None):
    """Read the audit trail over the last `window_min` minutes.

    lens='security' (default) excludes the two noisy allow-stream types so denials/scoping/
    privileged actions surface; lens='all' returns everything. `event_type`, when given, pins
    the query to ONE audit type (e.g. 'rbac_deny') for drill-down. `sub_to_email` maps actor
    subs → emails for display (built by the caller from the Cognito user list).

    Returns { events, summary, window_minutes, lens, log_group, source, [error] }. NEVER throws:
    a query/parse failure yields an empty events list with an `error` string so the panel can
    say "couldn't reach CloudWatch" rather than blank out."""
    sub_to_email = sub_to_email or {}
    now = int(time.time())
    start = now - int(window_min) * 60
    if not RUNTIME_ID:
        return {'events': [], 'summary': {}, 'window_minutes': window_min, 'lens': lens,
                'log_group': '', 'source': 'unconfigured',
                'error': 'RUNTIME_ID not set — audit log group unknown (deploy.sh injects it).'}

    # Build the Insights query. We interpolate ONLY module-level literals + a validated event_type
    # (allowlisted against EVENT_META below), never free caller text — no injection surface.
    filters = ['filter @message like /AUDIT /']
    if event_type and event_type in EVENT_META:
        # Anchor on the exact `"audit": "<type>"` token so 'rbac_deny' can't match 'rbac_deny_x'.
        filters.append(f'filter @message like /"audit": "{event_type}"/')
    elif lens == 'security':
        for noisy in _NOISY_TYPES:
            filters.append(f'filter @message not like /"audit": "{noisy}"/')
    query = ('fields @timestamp, @message | '
             + ' | '.join(filters)
             + f' | sort @timestamp desc | limit {_MAX_EVENTS}')

    try:
        rows = _run_insights_query(_runtime_log_group(), query, start, now)
    except Exception as e:  # pragma: no cover - defensive; _run_insights_query already swallows
        return {'events': [], 'summary': {}, 'window_minutes': window_min, 'lens': lens,
                'log_group': _runtime_log_group(), 'source': 'cloudwatch-logs-insights',
                'error': f'{type(e).__name__}: {e}'}

    events, summary = [], {}
    for row in rows:
        obj = _parse_audit_line(row.get('@message', ''))
        if not obj:
            continue
        ev = _shape_event(obj, sub_to_email)
        events.append(ev)
        summary[ev['type']] = summary.get(ev['type'], 0) + 1

    return {
        'events': events,
        'summary': summary,
        'window_minutes': int(window_min),
        'lens': lens,
        'log_group': _runtime_log_group(),
        'source': 'cloudwatch-logs-insights',
        'generated_at': now,
    }
