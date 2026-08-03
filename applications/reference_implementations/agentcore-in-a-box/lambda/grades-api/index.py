"""
Portfolio API Lambda — a self-contained downstream resource server.

This is the resource the agent reaches *on behalf of the portfolio manager (PM)* via
a 3-legged (USER_FEDERATION) AgentCore Identity OAuth token. It is deliberately NOT
the same thing as the user_data_lookup tool: it sits behind its own API Gateway
protected by a Cognito JWT authorizer enforcing the `portfolio-api/*` resource-server
scopes, so the delegated token is a real, audience-scoped credential — not a re-check
of the inbound login. Viewing positions needs portfolio-api/read; EXECUTING a trade
needs portfolio-api/trade — a separate, explicit consent (least-privilege you can demo).

Crucially, identity is taken from the **validated JWT claims** injected by the API
Gateway authorizer (requestContext.authorizer.jwt.claims), never from the request
body. That is what makes per-user, per-action attribution trustworthy: the audit
log line below records the PM the token was actually issued to — exactly what you
want when an agent executes a trade in a fund.

NOTE: the HTTP route path stays /grades and /grades/{category} (internal, never
user-visible) to preserve the existing API Gateway wiring; the query/body keys and
the data model below are what carry the portfolio meaning.

Data model: partition key userId = the PM's Cognito sub; sort key dataType =
the fund name (e.g. "Core Bond Fund"); the item holds a map of ticker → allocation.
"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])


def _claims(event):
    """Pull the validated JWT claims the HTTP API JWT authorizer attached."""
    try:
        return event['requestContext']['authorizer']['jwt']['claims']
    except (KeyError, TypeError):
        return {}


def _resp(code, payload):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(payload, default=str),
    }


def handler(event, context):
    claims = _claims(event)
    # Cognito access tokens use `sub` for the user id and `username` for the alias
    # (email, for an email-aliased pool). These come from the authorizer, not body.
    user_id = claims.get('sub', '')
    username = claims.get('username', claims.get('cognito:username', user_id))

    if not user_id:
        # No validated identity → the authorizer let an unauthenticated call through,
        # or this was invoked directly. Refuse rather than guess.
        return _resp(401, {'error': 'No authenticated user in token claims'})

    method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')

    if method == 'GET':
        return _handle_get(event, user_id, username)
    elif method in ('PUT', 'POST'):
        return _handle_update(event, user_id, username)
    return _resp(405, {'error': f'Method {method} not allowed'})


def _handle_get(event, user_id, username):
    """GET /grades?fund=<name>|all — read the PM's positions (their funds)."""
    qs = event.get('queryStringParameters') or {}
    fund = qs.get('fund', qs.get('class', qs.get('category', 'all')))

    try:
        if fund == 'all':
            r = table.query(KeyConditionExpression=Key('userId').eq(user_id))
            items = r.get('Items', [])
        else:
            r = table.get_item(Key={'userId': user_id, 'dataType': fund})
            items = [r['Item']] if 'Item' in r else []
        return _resp(200, {'pm': username, 'positions': items})
    except Exception as e:
        return _resp(500, {'error': str(e)})


def _handle_update(event, user_id, username):
    """PUT /grades/{fund} — execute a trade (set a new target allocation for an
    instrument) in one of the PM's funds, with an audit log.
    Body: {"ticker": "TLT", "side": "buy", "target_allocation": "20%"} (or {"update": {...}})."""
    fund = (event.get('pathParameters') or {}).get('category', '')
    try:
        body = json.loads(event.get('body') or '{}')
    except (json.JSONDecodeError, TypeError):
        body = {}
    payload = body.get('update', body)
    ticker = payload.get('ticker')
    side = payload.get('side')
    target_allocation = payload.get('target_allocation')

    if not fund:
        return _resp(400, {'error': 'fund path parameter is required'})

    try:
        existing = table.get_item(Key={'userId': user_id, 'dataType': fund}).get('Item', {})
        positions = dict(existing.get('positions', {})) if isinstance(existing.get('positions'), dict) else {}
        before = dict(positions)
        if ticker and target_allocation is not None:
            positions[ticker] = target_allocation
        item = {'userId': user_id, 'dataType': fund, 'positions': positions}
        table.put_item(Item=item)

        # AUDIT LOG — the per-action, per-user record the demo points at. Executing a
        # trade is exactly the kind of write you want provably attributed: which PM's
        # delegated token authorized it, which instrument, side, before/after allocation.
        print(json.dumps({
            'audit': 'trade_execute',
            'user_id': user_id,
            'portfolio_manager': username,
            'fund': fund,
            'ticker': ticker,
            'side': side,
            'before_allocation': before.get(ticker) if ticker else before,
            'after_allocation': target_allocation,
        }, default=str), flush=True)

        return _resp(200, {'pm': username, 'fund': fund, 'ticker': ticker, 'side': side,
                           'target_allocation': target_allocation, 'positions': positions})
    except Exception as e:
        return _resp(500, {'error': str(e)})
