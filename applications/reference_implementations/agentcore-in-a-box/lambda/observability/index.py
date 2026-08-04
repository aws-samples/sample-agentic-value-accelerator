"""
Observability read-back Lambda — surfaces REAL AgentCore / CloudWatch GenAI
Observability telemetry back to the UI's observability panel.

The agent runs on AgentCore Runtime with ADOT auto-instrumentation (see agent/Dockerfile),
so OpenTelemetry emits GenAI metrics + spans to CloudWatch with NO app code. This Lambda
reads that telemetry back:

  1) CloudWatch GetMetricData over the `bedrock-agentcore` namespace — the RELIABLE source
     for token usage (gen_ai.client.token.usage) and model latency
     (gen_ai.client.operation.duration). Verified live: these metrics carry dimensions
     gen_ai.request.model, gen_ai.operation.name, gen_ai.token.type (input|output), gen_ai.system.
  2) CloudWatch Logs Insights over the runtime OTEL log stream (otel-rt-logs) — per-span
     detail (model calls, tool invocations) parsed from the EMF/OTEL JSON log bodies, when
     present. Degrades gracefully to empty if Logs Insights returns nothing in the window.

It also computes the deep-link to the CloudWatch GenAI Observability console for the agent.

Contract: GET /observability?window=<minutes>  (Cognito-authorized, like /policy/toggle)
Returns JSON the frontend hydrates the observability strip with. NEVER throws to the client —
every source is wrapped so a partial outage still returns the pieces that worked.
"""
import json
import os
import time

import boto3

REGION = os.environ.get('REGION', 'us-west-2')
# The runtime id (e.g. agentcore_demo_agent_meridian-l2N3pkDi7S) + its DEFAULT log group.
RUNTIME_ID = os.environ.get('RUNTIME_ID', '')
ACCOUNT_ID = os.environ.get('ACCOUNT_ID', '')
NAMESPACE = 'bedrock-agentcore'

# AgentCore Runtime (via Strands + ADOT auto-instrumentation) exports distributed
# TRACES to CloudWatch Transaction Search, which lands them as OTEL span records in this
# shared log group. Every span is tagged with attributes.session.id == our threadId, so a
# single turn's full execution tree (swarm → agent → tool/model) is recoverable by session.
SPANS_LOG_GROUP = 'aws/spans'

_cw = boto3.client('cloudwatch', region_name=REGION)
_logs = boto3.client('logs', region_name=REGION)


def _runtime_log_group():
    # The DEFAULT endpoint log group holds the otel-rt-logs stream.
    return f'/aws/bedrock-agentcore/runtimes/{RUNTIME_ID}-DEFAULT'


def _genai_observability_deeplink():
    """Deep-link to the CloudWatch GenAI Observability console, Bedrock AgentCore tab.
    The console reads region from the hash route; we anchor the user there and they can
    drill into this agent's sessions/traces. (Console hash params are not a stable public
    contract, so we link to the agent landing view rather than a fragile per-session URL.)"""
    return (f'https://{REGION}.console.aws.amazon.com/cloudwatch/home?region={REGION}'
            f'#gen-ai-observability:agent-list')


# CloudWatch Metrics Insights (SQL) — REQUIRED here, not plain MetricStat. The
# bedrock-agentcore GenAI metrics are dimensioned by 6 keys (model, token.type, system,
# server.address/port, operation); a MetricStat query must pin ALL of them or it matches
# nothing (verified: pinning only token.type returned 0). Metrics Insights aggregates
# across the unspecified dimensions, which is what a roll-up needs. ONE Expression query
# per GetMetricData call (batching Expression queries errors "Maximum number of queries (1)").
def _insights(expr, start, end, period=3600):
    """Run one Metrics Insights SQL query; return its flat list of period values."""
    r = _cw.get_metric_data(
        MetricDataQueries=[{'Id': 'q', 'Expression': expr, 'Period': period, 'ReturnData': True}],
        StartTime=start, EndTime=end, ScanBy='TimestampDescending')
    res = (r.get('MetricDataResults') or [{}])[0]
    return res.get('Values', []) or []


def _read_metrics(window_min):
    """Pull token usage + latency over the window via Metrics Insights SQL. Returns
    input/output tokens, model-invocation count, and latency avg/max (seconds)."""
    now = int(time.time())
    start = now - window_min * 60
    period = 300 if window_min <= 360 else 3600
    # These Metrics Insights queries interpolate only module-level literal constants
    # (NS/TOK/DUR below) — no request data reaches the query string, so B608 is a false
    # positive here. The time window rides in StartTime/EndTime/Period params, not the SQL.
    NS = '"bedrock-agentcore"'
    TOK = '"gen_ai.client.token.usage"'
    DUR = '"gen_ai.client.operation.duration"'
    try:
        tok_in = sum(_insights(f"SELECT SUM({TOK}) FROM {NS} WHERE \"gen_ai.token.type\" = 'input'", start, now, period))  # nosec B608
        tok_out = sum(_insights(f"SELECT SUM({TOK}) FROM {NS} WHERE \"gen_ai.token.type\" = 'output'", start, now, period))  # nosec B608
        lat_avg_vals = _insights(f"SELECT AVG({DUR}) FROM {NS}", start, now, period)  # nosec B608
        lat_max_vals = _insights(f"SELECT MAX({DUR}) FROM {NS}", start, now, period)  # nosec B608
        cnt = sum(_insights(f"SELECT COUNT({DUR}) FROM {NS}", start, now, period))  # nosec B608
        lat_avg = (sum(lat_avg_vals) / len(lat_avg_vals)) if lat_avg_vals else 0.0
        lat_max = max(lat_max_vals) if lat_max_vals else 0.0
        return {
            'tokens': {'input': int(tok_in), 'output': int(tok_out), 'total': int(tok_in + tok_out)},
            'model_invocations': int(cnt),
            'latency_seconds': {'avg': round(lat_avg, 3), 'max': round(lat_max, 3)},
            'source': 'cloudwatch-metrics-insights:bedrock-agentcore',
        }
    except Exception as e:
        return {'error': f'metrics unavailable: {type(e).__name__}: {e}'}


def _per_model_tokens(window_min):
    """Token usage per model via a single GROUP BY Metrics Insights query. Returns
    [{model, total}] — the per-model split that proves multi-model usage in the panel."""
    now = int(time.time())
    start = now - window_min * 60
    NS = '"bedrock-agentcore"'
    TOK = '"gen_ai.client.token.usage"'
    try:
        r = _cw.get_metric_data(
            MetricDataQueries=[{'Id': 'q',
                                # Literal constants only (TOK/NS) — no request data in the query. B608 false positive.
                                'Expression': f'SELECT SUM({TOK}) FROM {NS} GROUP BY "gen_ai.request.model"',  # nosec B608
                                'Period': max(3600, window_min * 60), 'ReturnData': True}],
            StartTime=start, EndTime=now)
        out = []
        for res in r.get('MetricDataResults', []):
            # Label is the GROUP BY value (the model id).
            out.append({'model': res.get('Label', '?'),
                        'total': int(sum(res.get('Values', []) or [0]))})
        return out
    except Exception as e:
        return [{'error': f'per-model unavailable: {type(e).__name__}: {e}'}]


# ── Spans-based rollup (PRIMARY source for the telemetry strip) ───────────────────
# The bedrock-agentcore EMF metrics (Metrics Insights, above) are laggy and frequently
# return 0 for a window whose activity is already visible in the trace spans — which made
# the strip read "0 tokens / 0 calls" while the per-turn Execution Trace showed 30k tokens
# for the SAME turn. The aws/spans data (same source the trace uses) is immediate and
# reliable, so we roll it up here and use it first, falling back to Metrics Insights only
# when spans return nothing. One GROUP BY query over the window's chat spans.
def _safe_session_id(session_id):
    """Defense-in-depth guard for the two CloudWatch Insights queries that interpolate a
    caller-supplied session_id into their query STRING (Insights has no bind-parameter API,
    so the id must be embedded as text). The handler already validates session_id, but we
    re-assert the same alnum+hyphen, <=128-char allowlist right at the interpolation point so
    a future caller of these builders can't reintroduce an injection. Returns the id unchanged;
    raises ValueError on anything outside the allowlist (callers already wrap these in try)."""
    if (not isinstance(session_id, str) or not session_id or len(session_id) > 128
            or not session_id.replace('-', '').isalnum()):
        raise ValueError(f'unsafe session_id for Insights query: {session_id!r}')
    return session_id


def _rollup_query(session_id=None):
    """The chat-span rollup query, optionally scoped to one session.id. When a session is
    given the strip reflects THIS conversation; otherwise it's an account-wide window."""
    sess_clause = f'and `attributes.session.id` = "{_safe_session_id(session_id)}" ' if session_id else ''
    return (
        'fields `attributes.gen_ai.usage.input_tokens` as in_tok, '
        '`attributes.gen_ai.usage.output_tokens` as out_tok, durationNano, '
        '`attributes.gen_ai.request.model` as model '
        '| filter name like /^chat / and ispresent(`attributes.gen_ai.request.model`) '
        f'{sess_clause}'
        '| stats sum(in_tok) as tin, sum(out_tok) as tout, count(*) as calls, '
        'avg(durationNano) as avgdur, max(durationNano) as maxdur by model'
    )


def _read_metrics_from_spans(window_min, session_id=None):
    """Roll up token usage + model-call count + latency from aws/spans chat spans over
    the window. Scoped to session_id when given (else account-wide). Returns None if no
    spans / query failed, so the caller can fall back to Metrics Insights."""
    now = int(time.time())
    start = now - window_min * 60
    try:
        rows = _run_insights_query(SPANS_LOG_GROUP, _rollup_query(session_id), start, now)
    except Exception:
        return None
    if not rows:
        return None

    tin = tout = calls = 0
    lat_avg_weighted = 0.0
    lat_max = 0.0
    per_model = []
    for row in rows:
        model = row.get('model') or '?'
        c = _as_int(row.get('calls'))
        m_in = _as_int(row.get('tin'))
        m_out = _as_int(row.get('tout'))
        avgdur = float(row.get('avgdur') or 0) / 1e9
        maxdur = float(row.get('maxdur') or 0) / 1e9
        tin += m_in
        tout += m_out
        calls += c
        lat_avg_weighted += avgdur * c
        lat_max = max(lat_max, maxdur)
        per_model.append({'model': model, 'total': m_in + m_out})
    if calls == 0:
        return None
    metrics = {
        'tokens': {'input': tin, 'output': tout, 'total': tin + tout},
        'model_invocations': calls,
        'latency_seconds': {'avg': round(lat_avg_weighted / calls, 3), 'max': round(lat_max, 3)},
        'source': 'cloudwatch-transaction-search:aws/spans',
    }
    per_model.sort(key=lambda m: m['total'], reverse=True)
    return metrics, per_model


# ── Per-turn execution trace (real CloudWatch spans, by session) ──────────────────
# Logs Insights over aws/spans, filtered to one session.id. The dotted OTEL attribute
# keys must be backtick-quoted. We pull every span for the turn and reduce it to the
# three things the UI shows: a per-AGENT roll-up (invoke_agent spans carry agent name +
# token usage), a per-TOOL list (execute_tool spans carry tool name + duration), and a
# per-MODEL-CALL list (chat spans carry model + in/out tokens). The query is read-only.
_TRACE_QUERY = (
    'fields `attributes.session.id` as sid, name, durationNano, '
    '`attributes.gen_ai.operation.name` as op, '
    '`attributes.gen_ai.agent.name` as agent, '
    '`attributes.gen_ai.tool.name` as tool, '
    '`attributes.gen_ai.tool.status` as tool_status, '
    '`attributes.gen_ai.request.model` as model, '
    '`attributes.gen_ai.usage.input_tokens` as in_tok, '
    '`attributes.gen_ai.usage.output_tokens` as out_tok, '
    '`attributes.gen_ai.code_interpreter.id` as ci_id '
    '| filter sid = "{sid}" '
    '| sort durationNano desc '
    '| limit 400'
)


def _run_insights_query(log_group, query, start, end, timeout_s=12):
    """Start a Logs Insights query and poll to completion. Returns list-of-dicts rows
    (field→value). Never throws — returns [] with the error captured by the caller."""
    q = _logs.start_query(
        logGroupName=log_group, startTime=start, endTime=end,
        queryString=query, limit=1000,
    )
    qid = q['queryId']
    waited = 0.0
    while waited < timeout_s:
        # Bounded poll of the async CloudWatch Logs Insights query — no boto3 waiter exists
        # for get_query_results, so sleep-between-polls is the canonical pattern.
        time.sleep(0.6)  # nosemgrep  (arbitrary-sleep: bounded poll of async Logs Insights query)
        waited += 0.6
        r = _logs.get_query_results(queryId=qid)
        status = r.get('status')
        if status == 'Complete':
            return [{f['field']: f['value'] for f in row} for row in r.get('results', [])]
        if status in ('Failed', 'Cancelled', 'Timeout'):
            return []
    return []


def _as_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _read_trace(session_id, window_min, start_override=None, end_override=None):
    """Reconstruct one turn's execution trace from CloudWatch spans. Returns a UI-shaped
    summary: top-line counts, per-agent roll-up, per-tool list, per-model-call list.

    When the caller knows the exact turn window (start_override/end_override epoch secs),
    we bound the Insights query to it so the trace reflects ONE turn rather than the whole
    session (all turns share session.id). A small pad absorbs span clock skew/ingest."""
    now = int(time.time())
    if start_override:
        start = max(0, int(start_override) - 30)
        end = min(now, int(end_override or now) + 30) if end_override else now
    else:
        start = now - window_min * 60
        end = now
    try:
        rows = _run_insights_query(
            SPANS_LOG_GROUP, _TRACE_QUERY.format(sid=_safe_session_id(session_id)), start, end)
    except Exception as e:
        return {'error': f'trace unavailable: {type(e).__name__}: {e}', 'session_id': session_id}

    agents = {}      # agent name → {name, count, duration_s, input_tokens, output_tokens}
    tools = []       # [{tool, duration_s, status}]
    models = []      # [{model, duration_s, input_tokens, output_tokens}]
    swarm_duration = 0.0
    primitives = {}  # AgentCore primitive span name → {count, duration_s}
    total_in = total_out = 0
    handoffs = 0

    for row in rows:
        name = row.get('name', '') or ''
        if name.startswith('@'):
            continue
        op = row.get('op', '')
        dur_s = round(_as_int(row.get('durationNano')) / 1e9, 3)
        in_tok = _as_int(row.get('in_tok'))
        out_tok = _as_int(row.get('out_tok'))

        if op == 'invoke_agent' and row.get('agent'):
            a = agents.setdefault(row['agent'], {
                'name': row['agent'], 'count': 0, 'duration_s': 0.0,
                'input_tokens': 0, 'output_tokens': 0})
            a['count'] += 1
            # An agent can be re-entered; keep its longest span as the representative wall time.
            a['duration_s'] = max(a['duration_s'], dur_s)
            a['input_tokens'] += in_tok
            a['output_tokens'] += out_tok
        elif op == 'invoke_swarm':
            swarm_duration = max(swarm_duration, dur_s)
        elif op == 'execute_tool' and row.get('tool'):
            tname = row['tool']
            if tname == 'handoff_to_agent':
                handoffs += 1
                continue  # hand-offs are counted, not shown as a data tool
            tools.append({'tool': tname, 'duration_s': dur_s,
                          'status': row.get('tool_status', '')})
        elif name.startswith('chat ') or (op == 'chat' and name != 'chat'):
            # The CLIENT-side "chat <model>" span is the authoritative per-call record
            # (carries the resolved model id); the INTERNAL bare "chat" duplicates it.
            models.append({'model': row.get('model', '') or name.replace('chat ', ''),
                           'duration_s': dur_s, 'input_tokens': in_tok, 'output_tokens': out_tok})
            total_in += in_tok
            total_out += out_tok
        elif name.startswith('Bedrock AgentCore.'):
            label = name.replace('Bedrock AgentCore.', '')
            p = primitives.setdefault(label, {'name': label, 'count': 0, 'duration_s': 0.0})
            p['count'] += 1
            p['duration_s'] = round(p['duration_s'] + dur_s, 3)

    agent_list = sorted(agents.values(), key=lambda a: a['duration_s'], reverse=True)
    tools.sort(key=lambda t: t['duration_s'], reverse=True)
    models.sort(key=lambda m: m['duration_s'], reverse=True)
    primitive_list = sorted(primitives.values(), key=lambda p: p['duration_s'], reverse=True)

    # Wall time = the swarm span if present, else the widest model/agent envelope we saw.
    wall = swarm_duration or (max([a['duration_s'] for a in agent_list], default=0.0))

    return {
        'session_id': session_id,
        'found': bool(rows),
        'summary': {
            'agents_invoked': len(agent_list),
            'tool_calls': len(tools),
            'handoffs': handoffs,
            'model_calls': len(models),
            'total_tokens': total_in + total_out,
            'input_tokens': total_in,
            'output_tokens': total_out,
            'wall_seconds': round(wall, 2),
        },
        'agents': agent_list,
        'tools': tools,
        'models': models,
        'primitives': primitive_list,
        'source': 'cloudwatch-transaction-search:aws/spans',
    }


def handler(event, context):
    qs = (event.get('queryStringParameters') or {})

    # Route by path: /trace surfaces one turn's execution trace; default = the telemetry strip.
    raw_path = (event.get('rawPath')
                or (event.get('requestContext', {}).get('http', {}) or {}).get('path', '')
                or '')
    if raw_path.endswith('/trace'):
        session_id = (qs.get('session_id') or '').strip()
        try:
            window_min = max(1, min(int(qs.get('window', '180')), 1440))
        except (TypeError, ValueError):
            window_min = 180
        if not session_id or len(session_id) > 128 or not session_id.replace('-', '').isalnum():
            return _response(400, {'error': 'session_id required'})

        # Optional precise turn bounds (epoch seconds) so the trace reflects one turn.
        def _opt_int(key):
            try:
                return int(qs[key])
            except (KeyError, TypeError, ValueError):
                return None
        return _response(200, _read_trace(
            session_id, window_min,
            start_override=_opt_int('start'), end_override=_opt_int('end')))

    try:
        window_min = max(1, min(int(qs.get('window', '60')), 1440))
    except (TypeError, ValueError):
        window_min = 60

    # Optional session scope: when the UI passes the active session_id, the strip reflects
    # THIS conversation. Validated like the /trace path. Absent → account-wide window.
    session_id = (qs.get('session_id') or '').strip()
    if session_id and (len(session_id) > 128 or not session_id.replace('-', '').isalnum()):
        session_id = ''
    scoped = bool(session_id)

    # PRIMARY: roll up from spans (immediate + reliable, agrees with the trace panel).
    # FALLBACK: Metrics Insights over the bedrock-agentcore EMF namespace (laggy, and
    # account-wide only — so we only fall back for the unscoped view).
    spans_rollup = _read_metrics_from_spans(window_min, session_id or None)
    if spans_rollup:
        metrics, per_model = spans_rollup
    elif scoped:
        # No spans yet for this brand-new session — return a clean zeroed scoped result
        # rather than account-wide Metrics Insights (which would mislabel other turns).
        metrics = {
            'tokens': {'input': 0, 'output': 0, 'total': 0},
            'model_invocations': 0,
            'latency_seconds': {'avg': 0.0, 'max': 0.0},
            'source': 'cloudwatch-transaction-search:aws/spans',
        }
        per_model = []
    else:
        metrics = _read_metrics(window_min)
        per_model = _per_model_tokens(window_min)

    body = {
        'window_minutes': window_min,
        'scope': 'session' if scoped else 'account',
        'runtime_id': RUNTIME_ID,
        'metrics': metrics,
        'per_model': per_model,
        'console_deeplink': _genai_observability_deeplink(),
        'observability': {
            'platform': 'Amazon CloudWatch GenAI Observability',
            'instrumentation': 'OpenTelemetry (ADOT) — auto-instrumented on AgentCore Runtime',
            'log_group': _runtime_log_group(),
        },
    }
    return _response(200, body)


def _response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body),
    }
