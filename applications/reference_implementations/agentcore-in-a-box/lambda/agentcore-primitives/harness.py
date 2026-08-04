"""AgentCore Harness submodule — production shape.

The Harness is a REAL AgentCore primitive (GA): a managed Strands agent loop running inside
AgentCore Runtime. You declare config (model + system prompt + tools + memory + LIMITS) and AWS
runs the loop in an isolated microVM. This module exposes it to the demo UI:

  GET  /harness            → describe(): the DECLARED CONFIG (model, system prompt, tools, the
                             execution-limit caps, inbound-auth mode) + a live status read.
  GET  /harness/versions   → versions(): the immutable version history + named endpoints (the
                             prod rollout surface — each update makes a new immutable version;
                             endpoints pin a version; rollback = repoint an endpoint).
  POST /harness/endpoint   → set_endpoint(): create/repoint a named endpoint to a target version
                             (rollback / promote). ADMIN-gated (a governance action).
  POST /harness/invoke     → invoke(): invoke the harness AS THE SIGNED-IN USER.

WHY invoke() does NOT use boto3 invoke_harness:
  The harness is now CUSTOM_JWT inbound (OAuth). boto3's invoke_harness signs SigV4 as the
  Lambda role, which (a) the JWT-inbound harness rejects and (b) would NOT propagate per-user
  identity to downstream tools (AWS docs: per-user scoping requires the Bearer-JWT inbound path).
  So we call the raw data-plane HTTP endpoint with the CALLER's Cognito Bearer token:
      POST https://bedrock-agentcore.<region>.amazonaws.com/harnesses/invoke?harnessArn=<arn>
      Authorization: Bearer <user id token>
      X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: <session id, >=33 chars>
  The response is an event STREAM; we drain it and return the assembled text + stop reason +
  usage, so the UI renders one answer (no streaming transport needed for this panel).

APIGW 29s cap: this Lambda sits behind API Gateway (29s hard timeout), and invoke_harness drains
a full agent turn. We pass a SHORT per-invocation `timeoutSeconds` + tight `maxIterations` in the
request body so a turn cannot outlast the window — the harness's own defaults (3600s / 75 iters)
would blow the cap. These per-call overrides do not change the harness's declared defaults.
"""
import json
import os
import uuid
import urllib.request
import urllib.error

REGION = os.environ.get('REGION', 'us-west-2')
HARNESS_ARN = os.environ.get('HARNESS_ARN', '')
HARNESS_ID = os.environ.get('HARNESS_ID', '')
HARNESS_MODEL = os.environ.get('HARNESS_MODEL', 'us.anthropic.claude-sonnet-4-6')
# The SAME AgentCore Memory the Runtime desks read/write. A config-only harness attaches Memory
# for short-term (in-session) continuity, but it has NO code hook to do the desks' cross-session
# recall — retrieve summarized records for THIS user and put them in front of the model. So we do
# that recall here in the invoke Lambda (which already has the verified caller identity), exactly
# mirroring agent/main.py: retrieve_memory_records(namespace='user/<sub>', query=<message>) and
# inject the hits as a context preamble. Empty MEMORY_ID → recall is skipped (feature-flagged off).
HARNESS_MEMORY_ID = os.environ.get('MEMORY_ID', '')
HARNESS_MEMORY_TOP_K = int(os.environ.get('HARNESS_MEMORY_TOP_K', '5'))
# Named endpoint the invoke path targets. DEFAULT tracks the latest version; a pinned endpoint
# (e.g. 'production') lets an operator roll forward/back independently. deploy.sh creates the
# endpoint named here; empty → target the harness's DEFAULT (bare ARN).
HARNESS_ENDPOINT = os.environ.get('HARNESS_ENDPOINT', 'demo_endpoint')

# Per-invocation caps that keep a single turn inside the API Gateway 29s window. These OVERRIDE
# the harness defaults for THIS call only (the harness keeps its own prod defaults for other
# callers, e.g. Step Functions). ~24s leaves headroom under 29s for the drain + JSON round-trip.
INVOKE_TIMEOUT_SECONDS = int(os.environ.get('HARNESS_INVOKE_TIMEOUT', '24'))
INVOKE_MAX_ITERATIONS = int(os.environ.get('HARNESS_INVOKE_MAX_ITERATIONS', '8'))

# Friendly model label so the UI shows "Sonnet 4.6" not the cross-region profile id.
_MODEL_LABEL = {
    'us.anthropic.claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'anthropic.claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'global.anthropic.claude-sonnet-4-6': 'Claude Sonnet 4.6',
}


def _model_label(model_id):
    if not model_id:
        return 'Claude Sonnet 4.6'
    if model_id in _MODEL_LABEL:
        return _MODEL_LABEL[model_id]
    if 'sonnet-4-6' in model_id or 'sonnet4-6' in model_id:
        return 'Claude Sonnet 4.6'
    if 'sonnet' in model_id:
        return 'Claude Sonnet'
    if 'opus' in model_id:
        return 'Claude Opus'
    if 'haiku' in model_id:
        return 'Claude Haiku'
    return model_id


def _bearer_from_event(event, body):
    """The Cognito token to forward to the harness's JWT authorizer.

    IMPORTANT: the harness authorizer validates the `client_id` claim, which exists ONLY on a
    Cognito ACCESS token — an ID token carries `aud` instead and is rejected ("Claim 'client_id'
    value mismatch", verified live). The API Gateway HttpUserPoolAuthorizer that fronts THIS Lambda
    accepts the ID token (what the frontend sends as getIdToken()), so the raw Authorization header
    here is the ID token. We therefore prefer an explicit ACCESS token the frontend passes in the
    body (`access_token`); only if that's absent do we fall back to the header (works if the caller
    authenticated with an access token). Returns '' if neither is present (invoke fails cleanly)."""
    at = (body.get('access_token') or '').strip()
    if at:
        return at[7:] if at.lower().startswith('bearer ') else at
    headers = event.get('headers', {}) or {}
    for k, v in headers.items():
        if k.lower() == 'authorization' and v:
            return v[7:] if v.lower().startswith('bearer ') else v
    return ''


def describe(ctx, event):
    """GET /harness — the DECLARED CONFIG of AgentCore Express (the whole point of the primitive:
    the agent is configuration, not code). Read from get-harness live where possible, falling
    back to the env-known shape so the panel always renders. Read route — never throws."""
    configured = bool(HARNESS_ARN)
    system_prompt = (
        'You are AgentCore Express, a concise fixed-income desk assistant running on the managed '
        'AgentCore Harness. You have a sandboxed code interpreter and a managed browser, and you '
        'remember the user mandate across sessions (AgentCore Memory). Respect all access controls: '
        'never reveal restricted or entitlement-gated data, and refuse cleanly when you lack access '
        'rather than guessing.'
    )
    out = {
        'configured': configured,
        'harness_arn': HARNESS_ARN,
        'harness_id': HARNESS_ID,
        'name': 'AgentCore Express',
        'model': _model_label(HARNESS_MODEL),
        'model_id': HARNESS_MODEL,
        'system_prompt': system_prompt,
        'endpoint': HARNESS_ENDPOINT,
        # Inbound auth is now the SAME as the Runtime desks: the caller's Cognito JWT. This is what
        # makes the harness authenticate the REAL user (per-user identity), not a shared role.
        'inbound_auth': 'Cognito OAuth (JWT) — authenticates the signed-in user',
        # The declared execution limits (cost/runaway caps) — a first-class prod property.
        'limits': {
            'max_iterations': int(os.environ.get('HARNESS_MAX_ITERATIONS', '12')),
            'max_tokens': int(os.environ.get('HARNESS_MAX_TOKENS', '8192')),
            'timeout_seconds': int(os.environ.get('HARNESS_TIMEOUT_SECONDS', '3600')),
            'truncation': 'sliding_window',
            'invoke_timeout_seconds': INVOKE_TIMEOUT_SECONDS,   # the short per-call override
        },
        # The declared building blocks — the managed sandboxes + memory the harness gets purely
        # from config (no container, no orchestration code), all under the signed-in user's identity.
        'components': [
            {'kind': 'model', 'label': 'Foundation model', 'value': _model_label(HARNESS_MODEL),
             'detail': 'Managed ConverseStream loop (Strands) — no container, no orchestration code.'},
            {'kind': 'code', 'label': 'Code interpreter', 'value': 'AgentCore Code Interpreter',
             'detail': 'A managed Python/JS sandbox — declared as a tool, no sandbox code to run.'},
            {'kind': 'browser', 'label': 'Web browser', 'value': 'AgentCore Browser',
             'detail': 'A managed headless browser for live lookups — declared, not built.'},
            {'kind': 'memory', 'label': 'Long-term memory', 'value': 'AgentCore Memory',
             'detail': 'The same memory store the desks use — recalls the user mandate across sessions.'},
            {'kind': 'identity', 'label': 'Inbound auth', 'value': 'Cognito JWT (per-user)',
             'detail': 'The caller signs in with their own Cognito token — the harness runs as the signed-in user, not a shared service role.'},
        ],
        # Honest contrast: the harness is config-not-code AND authenticates the real user, but the
        # per-user GOVERNED-TOOL surface is a Runtime-desk capability — the desks’ agent code injects
        # the interceptor principal on each Gateway call, a hook a config-only harness doesn’t have
        # (and a Cognito-backed on-behalf-of exchange to the JWT gateway isn’t supported).
        'contrast': ('Declared entirely as config (model + system prompt + tool/memory references + '
                     'limits) and authenticated as the signed-in user — versus the desks’ hand-built '
                     'Strands swarm/graph on AgentCore Runtime. The desks’ per-user GOVERNED-tool '
                     'access needs that orchestration code, so it stays a Runtime-desk capability; '
                     'the harness shows the config-vs-code trade-off with managed sandboxes + memory.'),
        'governed_tools_note': ('Per-user governed-Gateway tools are a Runtime-desk capability '
                                '(their agent code asserts the interceptor principal). The config-only '
                                'harness uses the managed Code Interpreter + Browser sandboxes.'),
    }
    if not configured:
        out['note'] = 'Harness not provisioned yet (run deploy.sh STEP 5b).'
        return ctx.resp(200, out)
    try:
        if HARNESS_ID:
            h = ctx.control.get_harness(harnessId=HARNESS_ID).get('harness', {})
            out['status'] = h.get('status', '')
            out['version'] = h.get('harnessVersion', '')
            mc = (h.get('model') or {}).get('bedrockModelConfig') or {}
            if mc.get('modelId'):
                out['model_id'] = mc['modelId']
                out['model'] = _model_label(mc['modelId'])
                out['components'][0]['value'] = out['model']
            sp = h.get('systemPrompt')
            if isinstance(sp, list) and sp and sp[0].get('text'):
                out['system_prompt'] = sp[0]['text']
            tools = h.get('tools') or []
            if tools:
                out['tool_count'] = len(tools)
            # Live limits override the env-declared shape if present (drift-aware).
            for src, dst in (('maxIterations', 'max_iterations'), ('maxTokens', 'max_tokens'),
                             ('timeoutSeconds', 'timeout_seconds')):
                if h.get(src) is not None:
                    out['limits'][dst] = h[src]
    except Exception as e:
        print(f'HARNESS describe live-read failed (using declared shape): {type(e).__name__}: {e}', flush=True)
        out['status'] = out.get('status', 'READY')
    return ctx.resp(200, out)


def versions(ctx, event):
    """GET /harness/versions — the immutable version history + named endpoints. This is the
    production rollout surface: each update() makes a new immutable version; a named endpoint pins
    a version; rollback = repoint the endpoint at an earlier version. Read route — never throws."""
    out = {'configured': bool(HARNESS_ID), 'harness_id': HARNESS_ID,
           'endpoint': HARNESS_ENDPOINT, 'versions': [], 'endpoints': []}
    if not HARNESS_ID:
        out['note'] = 'Harness not provisioned yet (run deploy.sh STEP 5b).'
        return ctx.resp(200, out)
    try:
        resp = ctx.control.list_harness_versions(harnessId=HARNESS_ID)
        for v in resp.get('harnessVersions', []):
            out['versions'].append({
                'version': v.get('harnessVersion', ''),
                'status': v.get('status', ''),
                'created_at': v.get('createdAt', ''),
                'model_id': ((v.get('model') or {}).get('bedrockModelConfig') or {}).get('modelId', ''),
            })
    except Exception as e:
        print(f'HARNESS list_harness_versions failed: {type(e).__name__}: {e}', flush=True)
        out['versions_error'] = f'{type(e).__name__}'
    try:
        resp = ctx.control.list_harness_endpoints(harnessId=HARNESS_ID)
        for ep in resp.get('endpoints', []):
            # Live field names (verified against the API): endpointName + liveVersion. Fall back to
            # the older name/targetVersion spellings so this is robust across API revisions.
            out['endpoints'].append({
                'name': ep.get('endpointName') or ep.get('name', ''),
                'target_version': ep.get('liveVersion') or ep.get('targetVersion', ''),
                'status': ep.get('status', ''),
                'description': ep.get('description', ''),
            })
    except Exception as e:
        print(f'HARNESS list_harness_endpoints failed: {type(e).__name__}: {e}', flush=True)
        out['endpoints_error'] = f'{type(e).__name__}'
    return ctx.resp(200, out)


def set_endpoint(ctx, body):
    """POST /harness/endpoint (admin) — create or repoint a named endpoint to a target version.
    This is how a real operator rolls forward to a new version or ROLLS BACK to a known-good one
    without touching the harness config. Idempotent create-or-update."""
    if not HARNESS_ID:
        return ctx.resp(200, {'configured': False,
                              'note': 'Harness not provisioned yet (run deploy.sh STEP 5b).'})
    name = (body.get('endpoint_name') or HARNESS_ENDPOINT or '').strip()
    target = str(body.get('target_version') or '').strip()
    if not name or not target:
        return ctx.resp(400, {'error': 'endpoint_name and target_version are required'})
    desc = (body.get('description') or f'Repointed to version {target} via ops console').strip()[:256]
    # Try update first (the demo_endpoint already exists); fall back to create for a new name.
    try:
        ctx.control.update_harness_endpoint(
            harnessId=HARNESS_ID, endpointName=name, targetVersion=target, description=desc)
        return ctx.resp(200, {'ok': True, 'action': 'updated', 'endpoint_name': name,
                              'target_version': target})
    except Exception as e_upd:
        try:
            ctx.control.create_harness_endpoint(
                harnessId=HARNESS_ID, endpointName=name, targetVersion=target, description=desc)
            return ctx.resp(200, {'ok': True, 'action': 'created', 'endpoint_name': name,
                                  'target_version': target})
        except Exception as e_cre:
            return ctx.resp(500, {'error': f'endpoint update failed: {type(e_upd).__name__}: {e_upd}; '
                                           f'create failed: {type(e_cre).__name__}: {e_cre}'})


def _invoke_url():
    """The data-plane invoke URL, targeting the named endpoint (qualifier) when set so we exercise
    the production endpoint surface, not just the bare DEFAULT."""
    base = f'https://bedrock-agentcore.{REGION}.amazonaws.com/harnesses/invoke?harnessArn={HARNESS_ARN}'
    if HARNESS_ENDPOINT and HARNESS_ENDPOINT != 'DEFAULT':
        base += f'&qualifier={HARNESS_ENDPOINT}'
    return base


def _recall_memory(ctx, sub, query):
    """Retrieve the caller's long-term memory records the SAME way the Runtime desks do, so the
    harness can honestly recall the user's mandate across sessions.

    The desks (agent/main.py) store each turn via CreateEvent under actor/namespace `user/<sub>`
    and retrieve with a semantic query; the memory strategy distils those events into retrievable
    records. We read the identical namespace here (sub == the verified Cognito `sub`) via the raw
    data-plane RetrieveMemoryRecords op (the higher-level MemoryClient the desks use isn't bundled
    in this Lambda; boto3 1.43.42 exposes the op directly). Returns a short newline-joined context
    string (best hits first) or '' when there's nothing to recall / on any error — recall is a
    best-effort augmentation and must never fail the invoke."""
    if not (HARNESS_MEMORY_ID and sub and query):
        return ''
    try:
        resp = ctx.data.retrieve_memory_records(
            memoryId=HARNESS_MEMORY_ID,
            namespace=f'user/{sub}',
            searchCriteria={'searchQuery': query, 'topK': HARNESS_MEMORY_TOP_K})
        parts = []
        for rec in resp.get('memoryRecordSummaries', []) or []:
            text = ((rec.get('content') or {}).get('text') or '').strip()
            if text:
                parts.append(text)
        return '\n'.join(parts)
    except Exception as e:
        print(f'HARNESS memory recall failed (continuing without): {type(e).__name__}: {e}', flush=True)
        return ''


def invoke(ctx, body, sub, event):
    """POST /harness/invoke — invoke AgentCore Express AS THE SIGNED-IN USER (OAuth JWT inbound).

    We forward the caller's already-verified Cognito Bearer token to the harness's own JWT
    authorizer via the raw data-plane HTTP endpoint (boto3 invoke_harness would sign SigV4 as the
    Lambda role instead — wrong identity, and rejected by a JWT-inbound harness). A short per-call
    timeout + iteration cap keep the turn inside the API Gateway 29s window."""
    if not HARNESS_ARN:
        return ctx.resp(200, {'configured': False,
                              'note': 'Harness not provisioned yet (run deploy.sh STEP 5b).'})
    message = (body.get('message') or '').strip()
    if not message:
        return ctx.resp(400, {'error': 'message required'})

    token = _bearer_from_event(event, body)
    if not token:
        # The harness is JWT-inbound; without the caller's token we cannot authenticate them.
        return ctx.resp(401, {'error': 'Missing bearer token — cannot authenticate to the harness.'})

    # Session id must be >= 33 chars (AgentCore Runtime constraint). Reuse a caller-supplied one
    # (to continue a conversation in the same microVM) else derive a stable-length id.
    session_id = (body.get('session_id') or '').strip()
    if len(session_id) < 33:
        session_id = f'harness-{sub}-{uuid.uuid4().hex}'[:64]
        if len(session_id) < 33:
            session_id = (session_id + uuid.uuid4().hex)[:64]

    # Cross-session recall: pull this user's stored mandate/preferences from the SAME AgentCore
    # Memory the desks write, and hand it to the model as a grounding preamble on this turn. This
    # is how the config-only harness delivers the "remembers your mandate across sessions" promise
    # without an in-loop retrieval tool — the recall happens here, app-side, under the verified
    # caller identity. Bounded so a large recall can't blow the model's input budget.
    recalled = _recall_memory(ctx, sub, message)
    if recalled:
        preamble = (
            'Long-term memory about the signed-in user (from AgentCore Memory — the same store the '
            'desks use). Treat it as authoritative context for this request:\n'
            f'{recalled[:4000]}\n\n---\n\n'
        )
        user_text = preamble + message
    else:
        user_text = message

    # Only forward SAFE, app-controlled fields. We deliberately do NOT pass through any caller-
    # supplied model / tools / skills / additionalParams (AWS docs: InvokeHarness input is trusted
    # and those fields can redirect inference, override headers, or assume roles). The short
    # timeout + iteration cap fit the APIGW window and bound cost for this call only.
    req_body = json.dumps({
        'messages': [{'role': 'user', 'content': [{'text': user_text}]}],
        'timeoutSeconds': INVOKE_TIMEOUT_SECONDS,
        'maxIterations': INVOKE_MAX_ITERATIONS,
    }).encode()

    http_req = urllib.request.Request(
        _invoke_url(), data=req_body, method='POST',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}',
            'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': session_id,
        })

    text_parts = []
    stop_reason = ''
    usage = {}
    # Real tool activity observed in the harness's ConverseStream, so the UI can render honest
    # tool-call steps (never faked): the managed agent loop emits a contentBlockStart carrying
    # start.toolUse.{toolUseId,name} when it invokes a tool. We record each tool's name in the
    # order it ran. If the managed loop surfaces no tool blocks, this stays empty and the UI shows
    # only the answer — we never invent activity that didn't happen.
    tool_uses = []
    _seen_tool_ids = set()
    try:
        # ~26s socket timeout: below the 29s APIGW cap, above the harness's own 24s turn timeout,
        # so a turn that legitimately hits its cap returns a clean stop rather than a socket abort.
        with urllib.request.urlopen(http_req, timeout=26) as resp:  # nosec B310  (scheme pinned https)
            raw_bytes = resp.read()
            ctype = (resp.headers.get('Content-Type') or '').lower()
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode('utf-8', 'replace')[:400]
        except Exception:
            pass
        return ctx.resp(200, {'configured': True, 'session_id': session_id,
                              'error': f'Harness invoke failed (HTTP {e.code}). {detail}'.strip(),
                              'source': 'AgentCore Harness'})
    except Exception as e:
        return ctx.resp(200, {'configured': True, 'session_id': session_id,
                              'error': f'{type(e).__name__}: {e}', 'source': 'AgentCore Harness'})

    # The response is a stream of event objects framed one of several ways. InvokeHarness uses the
    # Bedrock ConverseStream schema, which over the wire is AWS event-stream BINARY framing
    # (application/vnd.amazon.eventstream) — NOT text — so we decode that with botocore first and
    # fall back to text (JSON array / NDJSON / SSE) for any other framing. We parse the two events
    # we care about: contentBlockDelta.delta.text (the answer) and messageStop.stopReason / metadata.
    raw = ''  # decoded text form, only populated for the text framings (used by the fallback below)
    if 'vnd.amazon.eventstream' in ctype or _looks_like_eventstream(raw_bytes):
        events = _iter_eventstream(raw_bytes)
    else:
        raw = raw_bytes.decode('utf-8', 'replace')
        events = _iter_events(raw)
    for obj in events:
        if 'contentBlockDelta' in obj:
            delta = obj['contentBlockDelta'].get('delta', {}) or {}
            if 'text' in delta:
                text_parts.append(delta['text'])
        elif 'contentBlockStart' in obj:
            # A tool-use content block opening — record the tool name once per toolUseId so the UI
            # can show the real steps the managed loop took (Code Interpreter / Browser / etc.).
            start = (obj['contentBlockStart'].get('start') or {})
            tu = start.get('toolUse') or {}
            tu_id = tu.get('toolUseId') or tu.get('name')
            tu_name = tu.get('name')
            if tu_name and tu_id not in _seen_tool_ids:
                _seen_tool_ids.add(tu_id)
                tool_uses.append(tu_name)
        elif 'messageStop' in obj:
            stop_reason = obj['messageStop'].get('stopReason', '') or stop_reason
        elif 'metadata' in obj:
            usage = obj['metadata'].get('usage', {}) or obj['metadata'] or usage
        elif 'runtimeClientError' in obj:
            return ctx.resp(200, {'configured': True, 'session_id': session_id,
                                  'error': obj['runtimeClientError'].get('message', 'runtime error'),
                                  'text': ''.join(text_parts), 'source': 'AgentCore Harness'})
        elif 'output' in obj and isinstance(obj.get('output'), dict):
            # Some framings return a final assembled {output:{message:{content:[{text}]}}}.
            for c in (obj['output'].get('message', {}) or {}).get('content', []) or []:
                if isinstance(c, dict) and c.get('text'):
                    text_parts.append(c['text'])

    text = ''.join(text_parts).strip()
    if not text and raw:
        # Last-resort: if we couldn't parse a known event shape, try a plain {text:...} / message.
        text = _fallback_text(raw)

    return ctx.resp(200, {
        'configured': True,
        'session_id': session_id,
        'endpoint': HARNESS_ENDPOINT,
        'text': text or '(no text)',
        'stop_reason': stop_reason,
        'usage': usage,
        # Real tools the managed loop invoked this turn, in order (may be empty). The UI renders
        # these as honest AG-UI-style tool steps; it never fabricates activity.
        'tool_uses': tool_uses,
        # Signal whether long-term memory was recalled + injected for this turn, so the UI can show
        # "grounded in your saved mandate" rather than leaving it invisible.
        'memory_recalled': bool(recalled),
        'source': 'AgentCore Harness (managed config — invoked as the signed-in user)',
    })


def _looks_like_eventstream(raw_bytes):
    """Heuristic when the Content-Type is missing/misleading: AWS event-stream messages start with
    a 4-byte big-endian total length followed by a 4-byte header length, and are NOT valid UTF-8
    JSON text. We only claim event-stream if the bytes don't decode as JSON/SSE text starting with
    a JSON/`data:` token — cheap and safe (a false negative just routes to the text parser)."""
    if not raw_bytes:
        return False
    head = raw_bytes[:16].lstrip()
    # Text framings begin with '[' (array), '{' (object), or 'data:' (SSE). Anything else with
    # non-printable bytes in the prefix is almost certainly the binary event-stream framing.
    if head[:1] in (b'[', b'{') or head[:5].lower() == b'data:':
        return False
    return any(b < 0x09 or (0x0e <= b < 0x20) for b in raw_bytes[:8])


def _iter_eventstream(raw_bytes):
    """Yield event dicts from AWS event-stream BINARY framing (the ConverseStream wire format used
    by InvokeHarness). Uses the vendored botocore parser; each message payload is a JSON event
    object. Best-effort: on any parse failure we yield nothing (the caller then shows a clean
    'no text' rather than crashing)."""
    try:
        from botocore.eventstream import EventStreamBuffer
    except Exception as e:
        print(f'HARNESS eventstream parser unavailable: {type(e).__name__}: {e}', flush=True)
        return
    try:
        buf = EventStreamBuffer()
        buf.add_data(raw_bytes)
        for event in buf:
            payload = event.payload
            if not payload:
                continue
            try:
                obj = json.loads(payload.decode('utf-8', 'replace'))
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(obj, dict):
                # ConverseStream event-stream messages carry the event as the message body and put
                # the event TYPE in a header. Normal events use `:event-type` (e.g. contentBlockDelta);
                # ERRORS use `:exception-type` (e.g. runtimeClientError) with `:message-type=exception`.
                # Normalize BOTH to the same {<type>: {...}} shape _iter_events yields so the invoke
                # loop's contentBlockDelta / messageStop / runtimeClientError branches all match.
                hdrs = event.headers or {}
                etype = hdrs.get(':event-type') or hdrs.get(':exception-type')
                if etype and etype not in obj:
                    yield {etype: obj}
                else:
                    yield obj
    except Exception as e:
        print(f'HARNESS eventstream decode failed: {type(e).__name__}: {e}', flush=True)
        return


def _iter_events(raw):
    """Yield event dicts from the invoke response, tolerating three framings: a JSON array of
    events, newline-delimited JSON, or SSE (`data: {json}`)."""
    raw = raw.strip()
    if not raw:
        return
    # 1) JSON array or single object.
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            for o in parsed:
                if isinstance(o, dict):
                    yield o
            return
        if isinstance(parsed, dict):
            # A dict with a top-level 'stream'/'events' list, or a single event.
            for key in ('stream', 'events'):
                if isinstance(parsed.get(key), list):
                    for o in parsed[key]:
                        if isinstance(o, dict):
                            yield o
                    return
            yield parsed
            return
    except (json.JSONDecodeError, TypeError):
        pass
    # 2) Newline / SSE framed.
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('data:'):
            line = line[5:].strip()
        if not line or line == '[DONE]':
            continue
        try:
            o = json.loads(line)
            if isinstance(o, dict):
                yield o
        except json.JSONDecodeError:
            continue


def _fallback_text(raw):
    """Best-effort text extraction when no known event shape matched — keeps the panel from
    showing a blank card on an unexpected (but non-error) framing."""
    try:
        o = json.loads(raw.strip())
        if isinstance(o, dict):
            for k in ('text', 'message', 'output', 'completion'):
                v = o.get(k)
                if isinstance(v, str) and v.strip():
                    return v.strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return ''
