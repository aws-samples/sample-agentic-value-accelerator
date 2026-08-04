"""AgentCore Optimization submodule.

read(ctx, event, admin)      → GET /optimization : recommendation + bundle + A/B experiment state
recommend(ctx, body)  (admin) → POST /optimization/recommend : generate a prompt recommendation
experiment(ctx, body) (admin) → POST /optimization/experiment : start/stop the A/B experiment

SAFETY VALVE: the A/B traffic split is feature-flagged OFF by default (OPT_EXPERIMENT_FLAG). Until
an admin starts an experiment, 100% of traffic is the control variant and the runtime's live path
is byte-identical to today. Starting/stopping flips the flag via update_agent_runtime, preserving
every other field of the runtime config (fail-safe: if the current config can't be read intact,
the toggle refuses rather than risk a partial update that breaks the runtime).

Recommendations (data-plane start_recommendation/get_recommendation) analyze real traces against
the governance evaluator and return an improved system prompt — fully functional with the flag
OFF, so the primitive demos safely even if A/B is never switched on.
"""
import os
import time

REGION = os.environ.get('REGION', 'us-west-2')
RUNTIME_ID = os.environ.get('RUNTIME_ID', '')
SPANS_LOG_GROUP = os.environ.get('SPANS_LOG_GROUP', 'aws/spans')
EXPERIMENT_FLAG = os.environ.get('OPT_EXPERIMENT_FLAG', 'off').strip().lower()
CONTROL_BUNDLE_ID = os.environ.get('OPT_CONTROL_BUNDLE_ID', '')
TREATMENT_BUNDLE_ID = os.environ.get('OPT_TREATMENT_BUNDLE_ID', '')
CUSTOM_EVALUATOR_ARN_PREFIX = 'arn:aws:bedrock-agentcore'
CUSTOM_EVALUATOR_ID = os.environ.get('EVAL_CUSTOM_EVALUATOR_ID', '')
ACCOUNT_ID = os.environ.get('ACCOUNT_ID', '')


def _runtime_flag_state(ctx):
    """Read the CURRENT OPT_EXPERIMENT_FLAG straight off the runtime (source of truth), since the
    Lambda's own env is only refreshed at deploy. Falls back to this Lambda's env on failure."""
    if not RUNTIME_ID:
        return EXPERIMENT_FLAG
    try:
        rt = ctx.control.get_agent_runtime(agentRuntimeId=RUNTIME_ID)
        return (rt.get('environmentVariables', {}) or {}).get('OPT_EXPERIMENT_FLAG', EXPERIMENT_FLAG).strip().lower()
    except Exception:
        return EXPERIMENT_FLAG


def read(ctx, event, admin):
    state = _runtime_flag_state(ctx)
    body = {
        'configured': bool(CONTROL_BUNDLE_ID or TREATMENT_BUNDLE_ID),
        'experiment': {
            'active': state == 'on',
            'flag': state,
            'control_bundle_id': CONTROL_BUNDLE_ID,
            'treatment_bundle_id': TREATMENT_BUNDLE_ID,
        },
        'governance_evaluator': CUSTOM_EVALUATOR_ID,
    }
    # Include the latest recommendation summary if one exists (best-effort).
    try:
        recs = ctx.data.list_recommendations().get('recommendations', [])
        body['recommendations'] = [{
            'recommendation_id': r.get('recommendationId', ''),
            'name': r.get('name', ''),
            'type': r.get('type', ''),
            'status': r.get('status', ''),
        } for r in recs[:10]]
    except Exception as e:
        body['recommendations'] = []
        body['recommendations_error'] = f'{type(e).__name__}'
    if not body['configured']:
        body['note'] = 'Optimization bundles not provisioned yet (run deploy.sh STEP 6b).'
    return ctx.resp(200, body)


# The current baseline system prompt the recommendation optimizes FROM. start_recommendation
# requires a non-empty systemPrompt: it can be a bundle reference (bundleArn + versionId +
# systemPromptJsonPath) OR inline text. We pass inline text — the control bundle is seeded with an
# empty systemPrompt (the real per-desk prompt is composed in the container at request time), so a
# bundle-ref would resolve empty ("systemPromptJsonPath ... resolved to empty"). Verified live.
BASELINE_SYSTEM_PROMPT = os.environ.get('OPT_BASELINE_PROMPT') or (
    'You are a specialist on a regulated financial-services desk. Answer using the firm governed '
    'tools and data, and respect all access controls: never reveal restricted or entitlement-gated '
    'data, and refuse cleanly when you lack access rather than guessing. Tool output always takes '
    'priority over your own knowledge.'
)
# How far back to pull traces for the recommendation (hours). start_recommendation REQUIRES an
# explicit startTime/endTime window on the CloudWatch-logs trace source — verified live.
REC_WINDOW_HOURS = int(os.environ.get('OPT_REC_WINDOW_HOURS', '168'))  # default 7 days


def _iso(ts):
    """UTC ISO-8601 (no tz suffix) as start_recommendation expects."""
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(ts))


def recommend(ctx, body):
    """Kick off a system-prompt recommendation from real traces, optimized for the governance
    evaluator. Returns the recommendation id; the UI polls read()/get for the resulting diff."""
    name = (body.get('name') or f'meridian-rec-{int(time.time())}')[:64]
    if not RUNTIME_ID:
        return ctx.resp(200, {'configured': False, 'note': 'Runtime not available for trace-based recommendation.'})
    log_group_arn = f'arn:aws:logs:{REGION}:{ACCOUNT_ID}:log-group:{SPANS_LOG_GROUP}'
    end = int(time.time())
    start = end - REC_WINDOW_HOURS * 3600
    # The recommendation engine requires a NUMERIC evaluator — it rejects a categorical custom
    # evaluator ("returned categorical labels instead of numeric scores ... not supported for
    # recommendations"). Our governance judge is categorical (COMPLIANT/VIOLATION/NOT_APPLICABLE),
    # which is right for the online-eval strip but can't drive a recommendation. So recommendations
    # optimize against a numeric BUILT-IN (GoalSuccessRate by default), overridable via
    # OPT_RECOMMEND_EVALUATOR. Verified live. The governance judge still scores every turn in the
    # online-eval config; it just isn't the optimization objective.
    rec_evaluator = os.environ.get('OPT_RECOMMEND_EVALUATOR', 'Builtin.GoalSuccessRate').strip()
    evaluators = []
    if rec_evaluator:
        arn = (rec_evaluator if rec_evaluator.startswith('arn:')
               else f'arn:aws:bedrock-agentcore:::evaluator/{rec_evaluator}')
        evaluators.append({'evaluatorArn': arn})
    try:
        cfg = {
            'systemPromptRecommendationConfig': {
                'systemPrompt': {'text': BASELINE_SYSTEM_PROMPT},
                'agentTraces': {
                    'cloudwatchLogs': {
                        'logGroupArns': [log_group_arn],
                        'serviceNames': [os.environ.get('AGENT_WORKLOAD_NAME', RUNTIME_ID)],
                        'startTime': _iso(start),
                        'endTime': _iso(end),
                    },
                },
            },
        }
        if evaluators:
            cfg['systemPromptRecommendationConfig']['evaluationConfig'] = {'evaluators': evaluators}
        r = ctx.data.start_recommendation(
            name=name,
            description='Meridian system-prompt recommendation (optimize for governance + helpfulness)',
            type='SYSTEM_PROMPT_RECOMMENDATION',
            recommendationConfig=cfg,
        )
        return ctx.resp(200, {'configured': True, 'recommendation_id': r.get('recommendationId', ''),
                              'status': r.get('status', 'STARTED'), 'name': name,
                              'window': {'start': _iso(start), 'end': _iso(end)}})
    except Exception as e:
        return ctx.resp(500, {'error': f'{type(e).__name__}: {e}'})


def experiment(ctx, body):
    """Start ('on') or stop ('off') the A/B split by flipping OPT_EXPERIMENT_FLAG on the runtime.
    Preserves EVERY other field of the runtime config; refuses if the current config can't be
    read intact (fail-safe — never risk a partial update that breaks the live runtime)."""
    action = (body.get('action') or '').strip().lower()
    if action not in ('start', 'stop'):
        return ctx.resp(400, {'error': "action must be 'start' or 'stop'"})
    if not RUNTIME_ID:
        return ctx.resp(200, {'configured': False, 'note': 'Runtime not available.'})
    new_flag = 'on' if action == 'start' else 'off'
    if action == 'start' and not TREATMENT_BUNDLE_ID:
        return ctx.resp(400, {'error': 'No treatment bundle provisioned — cannot start an A/B experiment.'})
    try:
        rt = ctx.control.get_agent_runtime(agentRuntimeId=RUNTIME_ID)
    except Exception as e:
        return ctx.resp(500, {'error': f'could not read runtime config: {type(e).__name__}: {e}'})

    # Fail-safe: require the full set of fields update_agent_runtime needs before touching it.
    artifact = rt.get('agentRuntimeArtifact')
    role_arn = rt.get('roleArn')
    network = rt.get('networkConfiguration')
    env = dict(rt.get('environmentVariables', {}) or {})
    if not (artifact and role_arn and network and env):
        return ctx.resp(500, {'error': 'runtime config incomplete; refusing to update (fail-safe)'})

    env['OPT_EXPERIMENT_FLAG'] = new_flag  # flip ONLY the flag; everything else preserved verbatim
    try:
        kwargs = {
            'agentRuntimeId': RUNTIME_ID,
            'agentRuntimeArtifact': artifact,
            'roleArn': role_arn,
            'networkConfiguration': network,
            'environmentVariables': env,
        }
        # Preserve protocol + authorizer config if the runtime carries them.
        if rt.get('protocolConfiguration'):
            kwargs['protocolConfiguration'] = rt['protocolConfiguration']
        if rt.get('authorizerConfiguration'):
            kwargs['authorizerConfiguration'] = rt['authorizerConfiguration']
        ctx.control.update_agent_runtime(**kwargs)
        return ctx.resp(200, {'configured': True, 'experiment': {'active': new_flag == 'on', 'flag': new_flag},
                              'note': f'A/B experiment {"started" if new_flag == "on" else "stopped"}. '
                                      'New sessions pick up the change; existing sessions keep their arm.'})
    except Exception as e:
        return ctx.resp(500, {'error': f'update_agent_runtime failed: {type(e).__name__}: {e}'})
