"""
OAuth2 3LO callback endpoint for AgentCore Identity session binding.

When a user consents at the Cognito hosted UI, AgentCore Identity redirects the
browser here with `session_id` (the authorization session URI) and `state` (our
custom_state — now a single-use, UNGUESSABLE nonce, NOT the user id). This endpoint
dereferences the nonce to the user's ALREADY-VERIFIED inbound JWT (stashed server-side
by the runtime at request time), calls CompleteResourceTokenAuth with that userToken so
AgentCore can fetch and store the delegated token, and CONSUMES the nonce (delete-on-use)
so it can't be replayed. The agent's next call then retrieves the delegated token.

Security posture: the `state` value is now meaningless on its own — it is a 256-bit
random nonce that only keys a server-side row holding a JWT we verified when the flow
started. We NEVER bind off a value echoed in the redirect (the old code trusted
custom_state=user_id verbatim, a CSRF-shaped hole). If the nonce doesn't resolve to a
stashed token, we FAIL CLOSED (no userId fallback) — an unbound/forged/replayed callback
cannot complete the token exchange.
"""
import json
import os
import boto3

region = os.environ.get('REGION', 'us-west-2')
OAUTH_SESSIONS_TABLE = os.environ.get('OAUTH_SESSIONS_TABLE', '')
# bedrock-agentcore (data plane) hosts complete_resource_token_auth.
client = boto3.client('bedrock-agentcore', region_name=region)
_ddb = boto3.client('dynamodb', region_name=region)


def _consume_user_token(state):
    """Atomically look up AND delete the stashed inbound JWT keyed by the single-use nonce
    (custom_state). The session was bound via that JWT, so CompleteResourceTokenAuth must be
    called with userToken. delete_item with ReturnValues=ALL_OLD both reads and consumes the
    row in one call, so a replayed callback finds nothing and fails closed. Returns the token
    or None."""
    if not (OAUTH_SESSIONS_TABLE and state):
        return None
    try:
        r = _ddb.delete_item(
            TableName=OAUTH_SESSIONS_TABLE,
            Key={'state': {'S': state}},
            ReturnValues='ALL_OLD',
        )
        return r.get('Attributes', {}).get('userToken', {}).get('S')
    except Exception as e:
        print(f'oauth-sessions consume error: {type(e).__name__}: {e}', flush=True)
        return None


def handler(event, context):
    qs = event.get('queryStringParameters') or {}
    # Log exactly what AgentCore sends so we can confirm param names + values.
    print(json.dumps({'callback_query_params': {k: (v[:60] if isinstance(v, str) else v) for k, v in qs.items()},
                      'raw_path': event.get('rawPath'), 'raw_qs': event.get('rawQueryString', '')[:300]}, default=str), flush=True)
    session_uri = qs.get('session_id') or qs.get('sessionUri') or qs.get('sessionId') or ''
    state = qs.get('state', '')  # a single-use, unguessable binding nonce (NOT the user id)

    if not session_uri or not state:
        return _html(400, 'Missing authorization parameters',
                     'This page must be reached from the AgentCore authorization redirect.')

    # Dereference the nonce to the ALREADY-VERIFIED inbound JWT and consume it (single-use).
    # FAIL CLOSED: if it doesn't resolve (unknown/expired/replayed nonce), we do NOT fall back
    # to binding by a redirect-supplied identifier — we refuse to complete the exchange.
    user_token = _consume_user_token(state)
    if not user_token:
        print('oauth-callback DENY: state nonce did not resolve to a stashed token', flush=True)
        return _html(403, 'Authorization could not be verified',
                     'This authorization link is invalid, has expired, or was already used. '
                     'Please return to the chat and start the approval again.')

    try:
        client.complete_resource_token_auth(
            sessionUri=session_uri,
            userIdentifier={'userToken': user_token},
        )
        return _html(200, 'Authorization complete ✅',
                     'You can return to the chat and choose <strong>"I\'ve approved — continue"</strong>. '
                     'The agent can now access your fund positions on your behalf.')
    except Exception as e:
        print(f'CompleteResourceTokenAuth error: {type(e).__name__}: {e}', flush=True)
        return _html(500, 'Authorization could not be completed',
                     f'Please return to the chat and try again. ({type(e).__name__})')


def _html(code, title, body):
    page = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>body{{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f8;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
.card{{background:#fff;border-radius:12px;padding:40px;max-width:460px;text-align:center;
box-shadow:0 4px 24px rgba(0,0,0,.08)}}h1{{font-size:20px;color:#232f3e;margin:0 0 12px}}
p{{color:#5a6b7b;line-height:1.5;margin:0}}</style></head>
<body><div class="card"><h1>{title}</h1><p>{body}</p></div></body></html>"""
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'text/html; charset=utf-8'},
        'body': page,
    }
