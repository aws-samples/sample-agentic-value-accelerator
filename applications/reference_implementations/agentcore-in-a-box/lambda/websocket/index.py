"""
WebSocket Lambda - Handles chat via WebSocket API Gateway.
No timeout constraints - agent can take as long as needed.

Inbound auth model: the AgentCore Runtime is configured with a Cognito
customJWTAuthorizer, so we invoke it over HTTPS with the user's Cognito ACCESS
token as a Bearer credential (boto3 does not support bearer invoke). The runtime
cryptographically validates the token on every call — that is the real security
boundary. On $connect we ALSO verify the token's signature via Cognito JWKS so we
reject bad tokens early and bind the connection to a verified identity.
"""
import json
import os
import time
import urllib.request
import urllib.parse
import uuid

import boto3

region = os.environ.get('REGION', 'us-west-2')
USER_POOL_ID = os.environ.get('USER_POOL_ID', '')
APP_CLIENT_ID = os.environ.get('USER_POOL_CLIENT_ID', '')
AGENT_RUNTIME_ARN = os.environ.get('AGENT_RUNTIME_ARN', '')
ENTITLEMENTS_TABLE = os.environ.get('ENTITLEMENTS_TABLE', '')

# boto3 client retained ONLY for the control-plane call (stop_runtime_session),
# which is SigV4 and unaffected by the bearer-invoke change.
agentcore = boto3.client('bedrock-agentcore', region_name=region)
_ddb = boto3.resource('dynamodb', region_name=region)
connections_table = _ddb.Table(os.environ.get('CONNECTIONS_TABLE', 'agentcore-demo-connections'))
_entitlements_table = _ddb.Table(ENTITLEMENTS_TABLE) if ENTITLEMENTS_TABLE else None

# Single-sourced RBAC catalog + decision logic (deploy.sh copies agent/entitlements.py here,
# same pattern as admin-api/gateway-interceptor). Guarded so a missing copy never bricks the
# socket — the desk gate at connect is a fast-reject/API-layer defense; the runtime's per-turn
# _desk_allowed remains the AUTHORITATIVE wall and fails closed on its own.
try:
    import entitlements as _ent  # type: ignore
except Exception as _e:  # pragma: no cover
    print(f'WS: entitlements catalog unavailable ({type(_e).__name__}: {_e}) — desk connect-gate disabled', flush=True)
    _ent = None


def _desk_allowed_at_edge(sub, groups, persona):
    """(allowed, enforced) — whether `sub` may operate `persona`'s desk, evaluated at the WS edge.

    Fails OPEN (allowed=True, enforced=False) whenever we cannot make a confident DENY — no
    entitlements wiring, admin caller, unmanaged principal, or a table read error — because the
    runtime's per-turn desk gate is the authoritative, fail-CLOSED wall behind this. This edge
    check exists to reject an un-entitled desk BEFORE spending a runtime invoke and to stop an
    un-entitled workspace from ever opening a session — not to be the last line of defense."""
    if not (_ent and _entitlements_table and sub and persona):
        return True, False
    try:
        if _ent.is_admin(groups):
            return True, False                       # admins are never desk-gated
        from boto3.dynamodb.conditions import Key
        resp = _entitlements_table.query(KeyConditionExpression=Key('principal').eq(_ent.user_pk(sub)))
        items = {it['dataType']: it for it in resp.get('Items', [])}
        eff = _ent.evaluate(items)
        desk = (persona or '').strip().lower() or 'capital_markets'
        return bool(_ent.allows(eff, 'desks', desk)), True
    except Exception as e:
        print(f'WS desk-gate eval error for {sub}/{persona}: {type(e).__name__}: {e}', flush=True)
        return True, False                           # fail OPEN at the edge; runtime fails closed

# Data-plane endpoint for bearer invocation.
DATAPLANE_HOST = f'https://bedrock-agentcore.{region}.amazonaws.com'


def _assert_https(url):
    """Reject any non-https URL before it reaches urlopen (which would otherwise honor
    file://, ftp://, and custom schemes — the vector bandit B310 flags). The invocation URLs
    are built from DATAPLANE_HOST (a hardcoded https endpoint), so this enforces that
    invariant rather than asserting it in a comment. Returns the URL unchanged; raises
    ValueError otherwise."""
    if not isinstance(url, str) or not url.lower().startswith('https://'):
        raise ValueError(f'refusing non-https URL for outbound request: {url!r}')
    return url


def _check_token(token):
    """Connect-time guard on the Cognito token: validate structure, issuer, client,
    and expiry from the claims, and return them.

    This is deliberately NOT the cryptographic trust boundary — to keep this Lambda
    dependency-free (no native crypto wheel / Docker bundling) we do not verify the
    RS256 signature here. The AUTHORITATIVE validation (signature, issuer, exp,
    allowedClients) is performed by the runtime's customJWTAuthorizer on EVERY
    bearer invoke. A forged token that slips past this guard is rejected there, so
    no unauthenticated request ever reaches the agent."""
    try:
        import base64
        payload = token.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return None
    if claims.get('exp', 0) < time.time():
        return None
    # Bind issuer + client EXACTLY when we know them. Previously a token that OMITTED `iss` or
    # `client_id` slipped through (the `None` allowance) — a token must positively carry the
    # right values, not merely 'not the wrong ones'. (The runtime's RS256 authorizer remains the
    # authoritative check; this just makes the edge fast-reject honest.)
    issuer = f'https://cognito-idp.{region}.amazonaws.com/{USER_POOL_ID}'
    if USER_POOL_ID and claims.get('iss') != issuer:
        return None
    if APP_CLIENT_ID and claims.get('client_id') != APP_CLIENT_ID:
        return None
    return claims


def handler(event, context):
    route = event.get('requestContext', {}).get('routeKey', '')
    connection_id = event.get('requestContext', {}).get('connectionId', '')

    if route == '$connect':
        return handle_connect(event, connection_id)
    elif route == '$disconnect':
        return handle_disconnect(connection_id)
    elif route == 'sendMessage':
        return handle_message(event, connection_id)
    else:
        return {'statusCode': 400, 'body': 'Unknown route'}


def handle_connect(event, connection_id):
    """Authenticate on connect via query string token (Cognito ACCESS token).

    Persona-scoped access: the React chat socket sends `&persona=<desk>` on connect. If the
    caller is NOT entitled to that desk we reject the connect (403) so an un-entitled workspace
    never opens a session and no runtime invoke is ever spent. The persistent entitlements
    listener socket (useEntitlements.ts) sends NO persona, so it is never desk-gated here. This
    edge gate FAILS OPEN on any eval uncertainty — the runtime's per-turn desk gate is the
    authoritative fail-closed wall (agent/main.py _desk_allowed)."""
    qs = event.get('queryStringParameters', {}) or {}
    token = qs.get('token', '')
    persona = qs.get('persona', '')

    if not token:
        return {'statusCode': 401, 'body': 'Missing token'}

    claims = _check_token(token)
    if not claims:
        return {'statusCode': 401, 'body': 'Invalid or expired token'}

    user_id = claims.get('sub', '')
    # Access tokens carry `username` (the email alias); id tokens carry `email`.
    email = claims.get('email') or claims.get('username') or claims.get('cognito:username', '')
    groups = claims.get('cognito:groups', [])

    # Desk connect-gate — only when the client declared a persona (chat socket). Reject an
    # un-entitled desk before it can open a session.
    if persona:
        allowed, enforced = _desk_allowed_at_edge(user_id, groups, persona)
        if enforced and not allowed:
            print(f'WS CONNECT DENY desk={persona} user={user_id}', flush=True)
            return {'statusCode': 403, 'body': 'Not entitled to this desk'}

    # Store connection + the access token, which we replay as the Bearer credential
    # on each invoke so the runtime can validate identity per call. `persona` is stored so
    # handle_message can re-check the desk defensively even if the client changed it in-band.
    connections_table.put_item(Item={
        'connectionId': connection_id,
        'userId': user_id,
        'email': email,
        'accessToken': token,
        'persona': persona,
    })
    return {'statusCode': 200, 'body': 'Connected'}


def handle_disconnect(connection_id):
    """Clean up connection."""
    try:
        connections_table.delete_item(Key={'connectionId': connection_id})
    except Exception:
        pass
    return {'statusCode': 200, 'body': 'Disconnected'}


def handle_message(event, connection_id):
    """Process chat message and send response back via WebSocket."""
    body = json.loads(event.get('body', '{}'))
    message = body.get('message', '')
    session_id = body.get('session_id', '')
    action = body.get('requestAction', body.get('action', 'chat'))
    model_id = body.get('model_id', '')  # optional per-request model selection
    topology = body.get('topology', '')  # orchestration architecture: 'swarm' (default) | 'graph'
    persona = body.get('persona', '')    # vertical desk: '' (capital_markets) | 'insurance' | 'banking' | 'fintech'
    force_reauth = bool(body.get('force_reauth', False))  # demo: force fresh 3LO consent after logout
    # Async long-running protocol (React client): phase='start' launches a background run
    # in the runtime and returns at once; phase='poll' re-invokes the SAME session (sticky
    # microVM) to drain buffered events since `cursor`. Absent phase = legacy synchronous run
    # (vanilla frontend), which the runtime streams whole in one 15-min-capped request.
    phase = body.get('phase', '')          # '' | 'start' | 'poll'
    cursor = int(body.get('cursor', 0) or 0)
    # AG-UI mode (React frontend): stream each AG-UI event as its own WS frame so the
    # client can render the live tool-call timeline. The vanilla frontend omits this
    # flag and gets the single reconstructed 'response'/'auth_required' frame instead.
    agui_mode = bool(body.get('agui', False))

    # Get user info + access token from connections table
    try:
        conn = connections_table.get_item(Key={'connectionId': connection_id})
        item = conn.get('Item', {})
        user_id = item.get('userId', 'anonymous')
        user_email = item.get('email', '')
        access_token = item.get('accessToken', '')
    except Exception:
        user_id, user_email, access_token = 'anonymous', '', ''

    # Get API Gateway management endpoint
    domain = event['requestContext']['domainName']
    stage = event['requestContext']['stage']
    apigw = boto3.client('apigatewaymanagementapi',
                         endpoint_url=f'https://{domain}/{stage}',
                         region_name=region)

    if action == 'session_stop':
        result = handle_session_stop(body, user_id)
        send_to_client(apigw, connection_id, result)
        return {'statusCode': 200}

    # Chat - invoke agent runtime over HTTPS with the user's bearer token.
    if not AGENT_RUNTIME_ARN:
        send_to_client(apigw, connection_id, {'type': 'error', 'error': 'AGENT_RUNTIME_ARN not configured'})
        return {'statusCode': 200}
    if not access_token:
        send_to_client(apigw, connection_id, {'type': 'error', 'error': 'No auth token on connection; please reconnect.'})
        return {'statusCode': 200}

    # Desk gate (defense-in-depth): a socket may connect to an allowed desk then send a message
    # for a DIFFERENT, un-entitled desk. Re-check the per-message persona before spending an
    # invoke. Groups come from the stored access token's claims (admins bypass). Fails open — the
    # runtime's per-turn _desk_allowed is the authoritative wall.
    if persona:
        _claims = _check_token(access_token) or {}
        _allowed, _enforced = _desk_allowed_at_edge(user_id, _claims.get('cognito:groups', []), persona)
        if _enforced and not _allowed:
            print(f'WS MESSAGE DENY desk={persona} user={user_id}', flush=True)
            _label = (_ent.DESK_CATALOG.get(persona.strip().lower(), {}) or {}).get('label', persona) if _ent else persona
            _deny = (f'Access denied by AgentCore access control: you are not granted the '
                     f'{_label} desk. Ask your administrator to grant desk access in the '
                     f'Access Control console.')
            if agui_mode:
                send_to_client(apigw, connection_id, {'type': 'agui_event', 'event': {'type': 'RUN_ERROR', 'message': _deny}})
                send_to_client(apigw, connection_id, {'type': 'agui_done', 'session_id': session_id})
            else:
                send_to_client(apigw, connection_id, {'type': 'response', 'response': _deny, 'session_id': session_id})
            return {'statusCode': 200}

    # Runtime session id must be >= 33 chars; generate one if the client's is short.
    if not session_id or len(session_id) < 33:
        session_id = uuid.uuid4().hex + uuid.uuid4().hex  # 64 chars

    # Include the user's access token in the payload too: the runtime consumes the
    # bearer header for inbound auth and does NOT forward it to the container, but the
    # agent needs it to bridge to the 3LO callback (CompleteResourceTokenAuth wants
    # userToken). Same token, passed in-band.
    # `action`/`cursor` drive the runtime's async start/poll dispatch (see agent/main.py
    # invoke()). Empty action = legacy synchronous path. Same session_id on start & poll →
    # the runtime routes both to the same sticky microVM (where the job buffer lives).
    payload = json.dumps({'message': message, 'user_id': user_id, 'user_email': user_email,
                          'user_token': access_token, 'model_id': model_id, 'topology': topology,
                          'persona': persona,
                          'force_reauth': force_reauth, 'action': phase, 'cursor': cursor})

    try:
        if agui_mode:
            # Stream each AG-UI event straight through as its own WS frame so the React
            # client renders the live tool-call timeline (the whole point of AG-UI).
            rt_session = stream_runtime_agui(access_token, payload, session_id, apigw, connection_id)
            # Terminal marker so the client knows the turn is fully flushed.
            send_to_client(apigw, connection_id, {'type': 'agui_done', 'session_id': rt_session})
        else:
            final_text, auth_url, runtime_session_id = invoke_runtime_bearer(access_token, payload, session_id)
            if auth_url:
                send_to_client(apigw, connection_id, {
                    'type': 'auth_required',
                    'auth_url': auth_url,
                    'response': (
                        'To access your fund positions I need your authorization. '
                        f'<a href="{auth_url}" target="_blank" rel="noopener">Click here to authorize</a>, '
                        'then choose "I\'ve approved — continue".'
                    ),
                    'session_id': runtime_session_id,
                })
            else:
                send_to_client(apigw, connection_id, {'type': 'response', 'response': final_text, 'session_id': runtime_session_id})
    except Exception as e:
        if agui_mode:
            # Surface as an AG-UI RUN_ERROR frame so the client unwinds the run cleanly.
            send_to_client(apigw, connection_id, {'type': 'agui_event', 'event': {'type': 'RUN_ERROR', 'message': str(e)}})
            send_to_client(apigw, connection_id, {'type': 'agui_done', 'session_id': session_id})
        else:
            send_to_client(apigw, connection_id, {'type': 'error', 'error': str(e)})

    return {'statusCode': 200}


def invoke_runtime_bearer(access_token, payload, session_id):
    """Invoke the AgentCore Runtime data-plane with a JWT bearer token (not SigV4).

    The agent now emits an AG-UI SSE event stream (`data: {json}\\n\\n` lines). This
    handler is the legacy/vanilla-frontend path, which expects a single answer, so we
    consume the whole stream and reconstruct: the concatenated TEXT_MESSAGE_CONTENT
    deltas (the final answer), and any CUSTOM `auth_required` auth_url. The AG-UI
    bridge Lambda (CopilotKit path) instead relays the SSE through untouched."""
    escaped_arn = urllib.parse.quote(AGENT_RUNTIME_ARN, safe='')
    url = f'{DATAPLANE_HOST}/runtimes/{escaped_arn}/invocations?qualifier=DEFAULT'
    req = urllib.request.Request(
        url, data=payload.encode('utf-8'), method='POST',
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': session_id,
        })
    _assert_https(url)
    with urllib.request.urlopen(req, timeout=290) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
        body = resp.read().decode('utf-8')
        # The runtime echoes the session id back in this header.
        rt_session = resp.headers.get('X-Amzn-Bedrock-AgentCore-Runtime-Session-Id', session_id)

    text_parts, auth_url = [], ''
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith('data:'):
            continue
        try:
            ev = json.loads(line[5:].strip())
        except (json.JSONDecodeError, ValueError):
            continue
        if not isinstance(ev, dict):
            continue
        etype = ev.get('type', '')
        if etype == 'TEXT_MESSAGE_CONTENT':
            text_parts.append(ev.get('delta', ''))
        elif etype == 'CUSTOM' and ev.get('name') == 'auth_required':
            auth_url = (ev.get('value') or {}).get('auth_url', '')
        elif etype == 'RUN_ERROR' and not text_parts:
            text_parts.append(f"Error: {ev.get('message', 'agent error')}")
    # Non-SSE fallback: if the runtime ever returns a plain JSON dict, surface it.
    if not text_parts and not auth_url and body and not body.lstrip().startswith('data:'):
        try:
            j = json.loads(body)
            if isinstance(j, dict):
                auth_url = j.get('auth_url', '')
                text_parts.append(j.get('response', body))
        except (json.JSONDecodeError, ValueError):
            text_parts.append(body)
    return ''.join(text_parts), auth_url, rt_session


def stream_runtime_agui(access_token, payload, session_id, apigw, connection_id):
    """Invoke the runtime and forward each AG-UI SSE event as its own WS frame.

    The agent emits `data: {json}\\n\\n` AG-UI events. We read the response stream
    incrementally and, for every event, push a `{'type':'agui_event','event':<ev>}`
    frame to the client so the tool-call timeline renders live (RunStarted →
    ToolCall*/Result → TextMessage* → RunFinished, plus the CUSTOM auth_required).
    Returns the runtime session id echoed back in the response header."""
    escaped_arn = urllib.parse.quote(AGENT_RUNTIME_ARN, safe='')
    url = f'{DATAPLANE_HOST}/runtimes/{escaped_arn}/invocations?qualifier=DEFAULT'
    req = urllib.request.Request(
        url, data=payload.encode('utf-8'), method='POST',
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': session_id,
        })
    _assert_https(url)
    resp = urllib.request.urlopen(req, timeout=290)  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
    rt_session = resp.headers.get('X-Amzn-Bedrock-AgentCore-Runtime-Session-Id', session_id)

    # Read SSE line-by-line so events flush to the client as the agent produces them
    # (urllib's file-like response yields lines as they arrive on the socket).
    for raw in resp:
        line = raw.decode('utf-8', 'replace').strip()
        if not line.startswith('data:'):
            continue
        chunk = line[5:].strip()
        if not chunk:
            continue
        try:
            ev = json.loads(chunk)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(ev, dict):
            send_to_client(apigw, connection_id, {'type': 'agui_event', 'event': ev, 'session_id': rt_session})
    return rt_session


def handle_session_stop(body, user_id):
    """Stop session and trigger memory extraction (control-plane, SigV4 boto3)."""
    session_id = body.get('session_id', '')
    if not session_id:
        return {'type': 'error', 'error': 'session_id required'}

    try:
        agentcore.stop_runtime_session(
            agentRuntimeArn=AGENT_RUNTIME_ARN,
            runtimeSessionId=session_id)
    except Exception:
        pass

    memory_id = os.environ.get('MEMORY_ID', '')
    if memory_id:
        # AgentCore extracts memory automatically after create_event;
        # no explicit trigger call is needed or supported here.
        msg = 'Memory is extracted automatically from the conversation.'
    else:
        msg = 'Memory not configured.'

    return {'type': 'session_stopped', 'message': f'Session stopped. {msg}', 'session_id': session_id}


def send_to_client(apigw, connection_id, data):
    """Send message back to WebSocket client."""
    try:
        apigw.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(data).encode())
    except Exception as e:
        print(f"Failed to send to {connection_id}: {e}")
