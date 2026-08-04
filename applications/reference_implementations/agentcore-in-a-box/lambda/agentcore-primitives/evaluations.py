"""AgentCore Evaluations submodule.

read(ctx, event)   → GET /evaluations : live online-eval scores + trends (read-back, never throws)
run(ctx, body, sub) → POST /evaluations/run : on-demand `evaluate` of a specific session/turn

Read-back sources (both best-effort; a partial outage still returns the pieces that worked):
  1) CloudWatch metrics, namespace `Bedrock-AgentCore/Evaluations` — score trends per evaluator.
  2) CloudWatch Logs Insights over the results log group
     `/aws/bedrock-agentcore/evaluations/results/<config-id>` — recent per-turn result records
     (OTEL GenAI evaluation events: evaluator id, score/label, reasoning, trace/session ids).
The custom governance judge (EVAL_CUSTOM_EVALUATOR_ID) is highlighted separately so the UI can
foreground the "did it respect access controls" signal.
"""
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed

REGION = os.environ.get('REGION', 'us-west-2')
ONLINE_CONFIG_ID = os.environ.get('EVAL_ONLINE_CONFIG_ID', '')
CUSTOM_EVALUATOR_ID = os.environ.get('EVAL_CUSTOM_EVALUATOR_ID', '')
BUILTIN_ARNS = [a for a in os.environ.get('EVAL_BUILTIN_ARNS', '').split(',') if a]
EVAL_METRIC_NS = 'Bedrock-AgentCore/Evaluations'
# The judges' reasoning is the whole point of the detail panel, so keep it whole. Cap only to
# bound the payload, and clip on a WORD boundary with an ellipsis so it never severs mid-word
# ("…calculatio", "…or expres") — the UI renders the full sentence(s), not a ragged stub.
_REASONING_MAX = 2000


def _clip(s, limit=_REASONING_MAX):
    s = (s or '').strip()
    if len(s) <= limit:
        return s
    cut = s[:limit]
    sp = cut.rfind(' ')
    if sp > limit * 0.6:  # prefer a word boundary, but don't chop off most of the text
        cut = cut[:sp]
    return cut.rstrip() + '…'


def _valid_session_id(session_id):
    """True iff session_id is safe to embed in a Logs Insights query string (Insights has no
    bind-parameter API, so _session_spans interpolates it as text). Allowlist: non-empty,
    <=128 chars, alphanumeric + hyphen only — admits no quotes/spaces/pipes, closing the
    query-injection surface. Callers reject with a 400 before reaching the query."""
    return bool(session_id) and len(session_id) <= 128 and session_id.replace('-', '').isalnum()


def _results_log_group():
    return f'/aws/bedrock-agentcore/evaluations/results/{ONLINE_CONFIG_ID}' if ONLINE_CONFIG_ID else ''


def _recent_results(ctx, window_min, session_id=''):
    """Most recent per-turn evaluation result records via Logs Insights. Returns [] on any
    failure (log group not created yet, no results in window, Insights timeout)."""
    lg = _results_log_group()
    if not lg:
        return []
    try:
        # The result events follow OTEL GenAI conventions; we surface the evaluator, score/label,
        # reasoning, and the trace/session ids so the UI can link back to a turn.
        q = ('fields @timestamp, @message | sort @timestamp desc | limit 40')
        end = int(time.time())
        start = end - window_min * 60
        sq = ctx.logs.start_query(logGroupName=lg, startTime=start, endTime=end, queryString=q)
        qid = sq['queryId']
        for _ in range(10):  # poll up to ~5s
            # Bounded poll of the async CloudWatch Logs Insights query — no boto3 waiter
            # exists for get_query_results, so sleep-between-polls is the canonical pattern.
            time.sleep(0.5)  # nosemgrep  (arbitrary-sleep: bounded poll of async Logs Insights query)
            r = ctx.logs.get_query_results(queryId=qid)
            if r.get('status') in ('Complete', 'Failed', 'Cancelled'):
                break
        out = []
        for row in r.get('results', []):
            msg = next((f['value'] for f in row if f['field'] == '@message'), '')
            try:
                rec = json.loads(msg)
            except (TypeError, ValueError):
                continue
            # Be liberal about shape — OTEL event bodies vary. Pull the common fields defensively.
            body = rec.get('body', rec)
            attrs = rec.get('attributes', body) or {}
            item = {
                'evaluator': attrs.get('evaluator.id') or attrs.get('gen_ai.evaluation.name') or body.get('evaluatorId', ''),
                'score': attrs.get('gen_ai.evaluation.score', body.get('score')),
                'label': attrs.get('gen_ai.evaluation.label') or body.get('label') or body.get('verdict', ''),
                'reasoning': _clip(body.get('reasoning') or attrs.get('gen_ai.evaluation.explanation') or ''),
                'session_id': attrs.get('session.id') or body.get('sessionId', ''),
                'trace_id': attrs.get('trace.id') or body.get('traceId', ''),
            }
            if session_id and item['session_id'] and item['session_id'] != session_id:
                continue
            out.append(item)
        return out
    except Exception as e:
        print(f'EVAL results read failed: {type(e).__name__}: {e}', flush=True)
        return []


def _score_trends(ctx, window_min):
    """Average score per evaluator over the window, from the Evaluations metric namespace.
    Best-effort; returns [] if metrics aren't present yet."""
    try:
        metrics = ctx.cw.list_metrics(Namespace=EVAL_METRIC_NS).get('Metrics', [])
        if not metrics:
            return []
        queries, meta = [], []
        for i, m in enumerate(metrics[:20]):
            queries.append({
                'Id': f'm{i}',
                'MetricStat': {
                    'Metric': {'Namespace': EVAL_METRIC_NS, 'MetricName': m['MetricName'],
                               'Dimensions': m.get('Dimensions', [])},
                    'Period': 3600, 'Stat': 'Average',
                },
                'ReturnData': True,
            })
            dims = {d['Name']: d['Value'] for d in m.get('Dimensions', [])}
            meta.append({'metric': m['MetricName'], 'dimensions': dims})
        end = int(time.time())
        res = ctx.cw.get_metric_data(
            MetricDataQueries=queries,
            StartTime=end - window_min * 60, EndTime=end,
        )
        out = []
        for i, r in enumerate(res.get('MetricDataResults', [])):
            vals = r.get('Values', [])
            if vals:
                out.append({**meta[i], 'avg': round(sum(vals) / len(vals), 3), 'points': len(vals)})
        return out
    except Exception as e:
        print(f'EVAL trends read failed: {type(e).__name__}: {e}', flush=True)
        return []


def read(ctx, event):
    qs = event.get('queryStringParameters') or {}
    session_id = (qs.get('session_id') or '').strip()
    # Optional session scope; drop anything outside the allowlist to '' (account-wide) rather
    # than error — read is best-effort. _recent_results only uses it for a Python-side filter,
    # but keep the id clean so it never reaches a query un-validated.
    if session_id and not _valid_session_id(session_id):
        session_id = ''
    try:
        window_min = max(5, min(int(qs.get('window', '1440')), 10080))
    except (TypeError, ValueError):
        window_min = 1440
    configured = bool(ONLINE_CONFIG_ID)
    body = {
        'configured': configured,
        'online_config_id': ONLINE_CONFIG_ID,
        'custom_evaluator_id': CUSTOM_EVALUATOR_ID,
        'builtin_evaluators': BUILTIN_ARNS,
        'governance_evaluator': CUSTOM_EVALUATOR_ID,  # the UI foregrounds this one
        'results': _recent_results(ctx, window_min, session_id) if configured else [],
        'trends': _score_trends(ctx, window_min) if configured else [],
    }
    if not configured:
        body['note'] = 'Online evaluation not provisioned yet (run deploy.sh STEP 6b).'
    return ctx.resp(200, body)


def _session_spans(ctx, session_id, window_min):
    """Assemble the OTEL spans for ONE session from the aws/spans log group, in the shape the
    data-plane `evaluate` expects. Verified live, the API is strict:
      • evaluationInput.sessionSpans must carry the raw exported span objects;
      • every span needs a non-null endTimeUnixNano (in-flight spans are rejected outright);
      • ALL spans must belong to a SINGLE session (`session.id` attribute) — mixing sessions
        fails with SessionValidationException, so we filter to the requested session.id.
    Returns (spans, scanned_count). Best-effort: [] if the group/stream isn't there yet."""
    if not _valid_session_id(session_id):
        # Defense in depth: callers already validate, but never interpolate an unchecked id
        # into the query string (no bind-parameter API for Logs Insights).
        raise ValueError(f'unsafe session_id for Insights query: {session_id!r}')
    try:
        end = int(time.time())
        start = end - window_min * 60
        # Logs Insights over the raw span group, filtered to the session, newest first.
        # NOTE: Insights treats a dotted key as a NESTED path, so the OTEL `session.id` attribute
        # is addressed as `attributes.session.id` — NOT backtick-quoted (`attributes.`session.id``
        # matches nothing). Verified live. We still re-check session.id in Python below.
        q = ('fields @message | filter attributes.session.id = "' + session_id + '"'
             ' | sort @timestamp desc | limit 200')
        sq = ctx.logs.start_query(logGroupName='aws/spans', startTime=start, endTime=end, queryString=q)
        qid = sq['queryId']
        r = {}
        # Cap the span-read at ~6s so the concurrent evaluate fan-out below still fits inside the
        # API Gateway 29s integration timeout.
        for _ in range(12):
            # Bounded poll of the async CloudWatch Logs Insights query — no boto3 waiter
            # exists for get_query_results, so sleep-between-polls is the canonical pattern.
            time.sleep(0.5)  # nosemgrep  (arbitrary-sleep: bounded poll of async Logs Insights query)
            r = ctx.logs.get_query_results(queryId=qid)
            if r.get('status') in ('Complete', 'Failed', 'Cancelled'):
                break
        spans, scanned = [], 0
        for row in r.get('results', []):
            msg = next((f['value'] for f in row if f['field'] == '@message'), '')
            try:
                span = json.loads(msg)
            except (TypeError, ValueError):
                continue
            scanned += 1
            # Only complete spans for exactly this session (defensive — the filter should already
            # guarantee session.id, but the log filter can be permissive on nested keys).
            if span.get('endTimeUnixNano') is None:
                continue
            if (span.get('attributes') or {}).get('session.id') != session_id:
                continue
            spans.append(span)
        return spans, scanned
    except Exception as e:
        print(f'EVAL session-spans read failed: {type(e).__name__}: {e}', flush=True)
        return [], 0


def run(ctx, body, sub):
    """On-demand: evaluate a specific session's turn now. The data-plane `evaluate` needs the
    session's OTEL spans passed inline (it does NOT resolve them from a session id alone), so we
    pull them from aws/spans first, then run each evaluator over the assembled single-session
    span set. Honest about partials: if spans aren't in CloudWatch yet, or the exported spans are
    missing their linked GenAI log events (a known limitation of log-reconstructed spans — the
    continuous online-eval config is the authoritative scoring path), the per-evaluator error is
    surfaced rather than hidden."""
    session_id = (body.get('session_id') or '').strip()
    if not _valid_session_id(session_id):
        return ctx.resp(400, {'error': 'valid session_id required (alphanumeric + hyphen, <=128 chars)'})
    try:
        window_min = max(5, min(int(body.get('window', '1440')), 10080))
    except (TypeError, ValueError):
        window_min = 1440

    evaluator_ids = list(BUILTIN_ARNS)
    if CUSTOM_EVALUATOR_ID:
        evaluator_ids.append(CUSTOM_EVALUATOR_ID)
    if not evaluator_ids:
        return ctx.resp(200, {'configured': False,
                              'note': 'No evaluators provisioned yet (run deploy.sh STEP 5b/6b).'})

    spans, scanned = _session_spans(ctx, session_id, window_min)
    if not spans:
        return ctx.resp(200, {
            'configured': True, 'session_id': session_id, 'scores': [],
            'governance_evaluator': CUSTOM_EVALUATOR_ID,
            'note': ('No complete spans found for this session in aws/spans yet. Traces can take a '
                     'minute to land; the continuous online evaluation scores every sampled turn '
                     'automatically (see the Evaluations strip).'),
        })

    evaluation_input = {'sessionSpans': spans}
    # `evaluate` runs ONE evaluator per call. Running the ~6 evaluators SEQUENTIALLY (each an
    # LLM-as-judge call) blows past the API Gateway 29s integration timeout → 503. Fan them out
    # concurrently instead so wall-clock ≈ the slowest single evaluator, not their sum.
    def _one(ev):
        try:
            r = ctx.data.evaluate(evaluatorId=ev, evaluationInput=evaluation_input)
            return {'evaluator': ev, 'result': _slim_eval_result(r)}
        except Exception as e:
            return {'evaluator': ev, 'error': f'{type(e).__name__}: {e}'}

    scores = []
    # Overall deadline: return partial results before API Gateway's 29s cap rather than 503.
    deadline = time.time() + 22
    with ThreadPoolExecutor(max_workers=min(8, len(evaluator_ids))) as pool:
        futures = {pool.submit(_one, ev): ev for ev in evaluator_ids}
        try:
            for fut in as_completed(futures, timeout=max(1, deadline - time.time())):
                scores.append(fut.result())
        except TimeoutError:
            done_evs = {s['evaluator'] for s in scores}
            for fut, ev in futures.items():
                if ev not in done_evs:
                    scores.append({'evaluator': ev, 'error': 'TimeoutError: evaluator did not '
                                   'finish in time (the continuous online eval scores it anyway)'})
    return ctx.resp(200, {'configured': True, 'session_id': session_id, 'spans_evaluated': len(spans),
                          'governance_evaluator': CUSTOM_EVALUATOR_ID, 'scores': scores})


def _slim_eval_result(r):
    """Reduce an evaluate() response to the fields the UI shows (score/label/reasoning), or the
    per-result error the service reports. The live shape is:
      evaluationResults: [{evaluatorId, context.spanContext, score?/label?/reasoning?,
                           errorMessage?, errorCode?}]
    A result can carry an errorMessage/errorCode (e.g. LogEventMissingException) instead of a
    score — surface that honestly so the UI doesn't show a blank."""
    results = r.get('evaluationResults') or r.get('results') or []
    if isinstance(results, list) and results:
        first = results[0]
        if first.get('errorMessage') or first.get('errorCode'):
            return {'error_code': first.get('errorCode', ''),
                    'error': (first.get('errorMessage') or '')[:400]}
        return {
            'score': first.get('score'),
            'label': first.get('label') or first.get('verdict', ''),
            'reasoning': _clip(first.get('reasoning') or first.get('explanation') or ''),
        }
    return {'raw': str(r)[:600]}
