"""
AgentCore ops-plane Lambda — the single backend for the four newer AgentCore primitives:
Evaluations, Registry, Harness, and Optimization.

One Lambda, path-dispatched (the same "one function serves several routes" shape the
observability Lambda uses for /observability + /trace). Each primitive lives in its own
submodule (evaluations.py / registry.py / harness.py / optimization.py) and is reached by
rawPath. This keeps one IAM role, one bundle, and one env-var surface for all four.

Auth model (identical to the rest of the app):
  • Every route is Cognito-authorized at the API Gateway edge (HttpUserPoolAuthorizer), so
    the VERIFIED JWT claims arrive in requestContext.authorizer.jwt.claims. We never parse a
    raw token here.
  • READ routes (GET) are open to any authenticated user.
  • MUTATING / admin routes are gated in-Lambda on the verified `cognito:groups` claim
    containing `admins` (server-side; a valid non-admin token is rejected, not just hidden).

Contract per route (all JSON, Cognito-authorized):
  GET  /evaluations                 → live online-eval scores + trends (read-back)
  POST /evaluations/run             → on-demand `evaluate` of a specific session/turn
  GET  /registry                    → list registry records + statuses
  POST /registry/search             → semantic/keyword search over approved records
  POST /registry/curate    (admin)  → submit / approve / reject / deprecate a record
  POST /harness/invoke              → invoke the managed-config "Meridian Express" harness
  GET  /optimization                → recommendation + bundle + A/B experiment state
  POST /optimization/recommend (admin) → generate a prompt/tool recommendation from traces
  POST /optimization/experiment (admin) → start / stop the A/B experiment (default OFF)

Read routes NEVER throw to the client (partial data degrades gracefully, matching the
observability Lambda). Mutating routes surface a clean error envelope so the action panels
can show it.
"""
import json
import os

import boto3

REGION = os.environ.get('REGION', 'us-west-2')
ACCOUNT_ID = os.environ.get('ACCOUNT_ID', '')
ADMIN_GROUP = os.environ.get('ADMIN_GROUP', 'admins')

# Both AgentCore planes. Control plane creates/curates; data plane invokes/evaluates/searches.
# boto3 1.43.42 (pinned in requirements.txt) exposes every op we use on the correct client
# (verified: CreateHarness/CreateEvaluator/... on -control; InvokeHarness/Evaluate/
# SearchRegistryRecords on the data plane).
_ac_control = boto3.client('bedrock-agentcore-control', region_name=REGION)
_ac_data = boto3.client('bedrock-agentcore', region_name=REGION)
_cw = boto3.client('cloudwatch', region_name=REGION)
_logs = boto3.client('logs', region_name=REGION)


# ─────────────────────────── shared HTTP helpers ───────────────────────────
def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body, default=str),
    }


def _claims(event):
    """The JWT claims the API Gateway HttpUserPoolAuthorizer already verified
    (signature/issuer/expiry/audience). We never parse the raw token ourselves."""
    try:
        return event['requestContext']['authorizer']['jwt']['claims'] or {}
    except (KeyError, TypeError):
        return {}


def _caller(event):
    c = _claims(event)
    return c.get('sub', ''), (c.get('email') or c.get('cognito:username') or ''), c.get('cognito:groups', [])


def is_admin(groups):
    """Normalize the cognito:groups claim (list, "[admins]" string, or comma/space list)
    and test membership of the admins group. Mirrors agent/entitlements.is_admin so the
    admin gate is identical to the rest of the app."""
    if not groups:
        return False
    if isinstance(groups, str):
        groups = groups.strip().strip('[]').replace('"', '')
        groups = [g.strip() for g in groups.replace(',', ' ').split()]
    try:
        return ADMIN_GROUP in set(groups)
    except TypeError:
        return False


def _method(event):
    return (event.get('requestContext', {}).get('http', {}) or {}).get('method', '')


def _raw_path(event):
    return (event.get('rawPath')
            or (event.get('requestContext', {}).get('http', {}) or {}).get('path', '')
            or '')


def _body(event):
    try:
        return json.loads(event.get('body') or '{}')
    except (TypeError, ValueError):
        return {}


# Clients + helpers the submodules share, handed over as a small context object so each
# submodule stays import-light and testable.
class Ctx:
    region = REGION
    account_id = ACCOUNT_ID
    control = _ac_control
    data = _ac_data
    cw = _cw
    logs = _logs
    resp = staticmethod(_resp)


CTX = Ctx()


def handler(event, context):
    path = _raw_path(event)
    method = _method(event)
    sub, email, groups = _caller(event)
    if not sub:
        return _resp(401, {'error': 'Unauthenticated'})

    admin = is_admin(groups)
    body = _body(event)

    # Lazy-import per primitive so a syntax error in one submodule can't take down the others,
    # and so each phase's module is added without touching this dispatcher.
    try:
        if path.endswith('/evaluations/run') and method == 'POST':
            import evaluations
            return evaluations.run(CTX, body, sub)
        if '/evaluations' in path and method == 'GET':
            import evaluations
            return evaluations.read(CTX, event)

        if path.endswith('/registry/search') and method == 'POST':
            import registry
            return registry.search(CTX, body)
        if path.endswith('/registry/curate') and method == 'POST':
            if not admin:
                return _resp(403, {'error': 'Forbidden: admin group required'})
            import registry
            return registry.curate(CTX, body, email)
        if '/registry' in path and method == 'GET':
            import registry
            return registry.read(CTX, event)

        if path.endswith('/harness/versions') and method == 'GET':
            import harness
            return harness.versions(CTX, event)
        if path.endswith('/harness/endpoint') and method == 'POST':
            # Rollback / pin a named endpoint to a specific immutable version — a governance
            # action, so admin-gated (same as registry curate / optimization experiment).
            if not admin:
                return _resp(403, {'error': 'Forbidden: admin group required'})
            import harness
            return harness.set_endpoint(CTX, body)
        if path.endswith('/harness/invoke') and method == 'POST':
            import harness
            # Pass the whole event so invoke can read the caller's raw Bearer JWT (the harness is
            # now OAuth-JWT inbound — it authenticates the REAL end user, not a shared SigV4 role).
            return harness.invoke(CTX, body, sub, event)
        if '/harness' in path and method == 'GET':
            import harness
            return harness.describe(CTX, event)

        if path.endswith('/optimization/recommend') and method == 'POST':
            if not admin:
                return _resp(403, {'error': 'Forbidden: admin group required'})
            import optimization
            return optimization.recommend(CTX, body)
        if path.endswith('/optimization/experiment') and method == 'POST':
            if not admin:
                return _resp(403, {'error': 'Forbidden: admin group required'})
            import optimization
            return optimization.experiment(CTX, body)
        if '/optimization' in path and method == 'GET':
            import optimization
            return optimization.read(CTX, event, admin)

        return _resp(404, {'error': f'No route for {method} {path}'})
    except Exception as e:
        # Mutating routes want the error surfaced; keep it generic to the client, detail to logs.
        import traceback
        traceback.print_exc()
        return _resp(500, {'error': f'{type(e).__name__}: {e}'})
