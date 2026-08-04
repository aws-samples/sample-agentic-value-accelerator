"""AgentCore Demo Agent.

Hosted on AgentCore Runtime via the bedrock-agentcore SDK's BedrockAgentCoreApp.
The runtime is configured with a Cognito customJWTAuthorizer (inbound auth), so each
invocation carries the caller's verified JWT. The SDK validates it and hands this
process a Workload Access Token (the `WorkloadAccessToken` header), which we use to
vend a user-delegated OAuth token (via IdentityClient.get_token, USER_FEDERATION)
for the downstream Grades API — full 3-legged auth with session-binding callback.
"""
import asyncio
import json
import os
import secrets
import sys
import threading
import time
import urllib.request

import boto3
import jwt

PORT = int(os.environ.get('PORT', '8080'))
REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))
MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'  # default
# Allow-list of models the demo can switch between per request. The frontend sends a
# short key (e.g. "haiku", "nova-pro") as `model_id`; we map it to the real Bedrock
# inference-profile id here. Switching is instant — no rebuild — because the model is
# chosen per request, not baked into the container. Unknown keys fall back to
# the default. (Bedrock model access for the chosen model must be enabled in-region.)
MODELS = {
    'opus-4-8': 'us.anthropic.claude-opus-4-8',
    'sonnet-5': 'us.anthropic.claude-sonnet-5',
    'sonnet-4-6': 'us.anthropic.claude-sonnet-4-6',
    'nova-pro': 'us.amazon.nova-pro-v1:0',
    'llama4-maverick': 'us.meta.llama4-maverick-17b-instruct-v1:0',
    'gpt-oss-120b': 'openai.gpt-oss-120b-1:0',
    # Cheap fallback target kept for malformed/empty keys (not surfaced in the UI).
    'haiku': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
}

# Sentinel model key: the swarm runs its per-agent TIER (see each persona's roster in
# personas.py) instead of a single model. Reasoning agents get Opus 4.8, the rest Sonnet 5.
# Any other key forces ALL agents onto that one model (preserving the "swap the LLM" demo).
AUTO_MODEL_KEY = 'auto'
# When 'auto' is selected, this is the id used for anything NOT routed through the swarm
# (the model-identity line, the legacy converse loop) — the flagship of the tier.
AUTO_PRIMARY_MODEL = 'us.anthropic.claude-opus-4-8'


# Human-readable names so the agent can truthfully state which model is serving the
# request (LLMs can't reliably introspect their own identity — we tell it).
MODEL_NAMES = {
    'us.anthropic.claude-opus-4-8': 'Anthropic Claude Opus 4.8',
    'us.anthropic.claude-sonnet-5': 'Anthropic Claude Sonnet 5',
    'us.anthropic.claude-sonnet-4-6': 'Anthropic Claude Sonnet 4.6',
    'us.amazon.nova-pro-v1:0': 'Amazon Nova Pro',
    'us.meta.llama4-maverick-17b-instruct-v1:0': 'Meta Llama 4 Maverick',
    'openai.gpt-oss-120b-1:0': 'OpenAI GPT-OSS 120B',
    'us.anthropic.claude-haiku-4-5-20251001-v1:0': 'Anthropic Claude Haiku 4.5',
}


def _resolve_model(model_key):
    """Map a frontend model key (or a full model id) to a Bedrock model id.

    The 'auto' sentinel means "run the per-agent tier" (Opus for reasoning agents,
    Sonnet 5 for the rest) — the swarm reads that tier itself; for everything that still
    needs ONE id (model-identity line, legacy converse loop) we use the tier's flagship."""
    if not model_key:
        return MODEL_ID
    if model_key == AUTO_MODEL_KEY:
        return AUTO_PRIMARY_MODEL
    if model_key in MODELS:
        return MODELS[model_key]
    # Allow passing a full inference-profile id directly; else fall back.
    return model_key if model_key.count('.') >= 2 else MODEL_ID


def _is_auto(model_key):
    """True when the PM left the sidebar on Auto — the swarm should apply its per-agent
    tier rather than forcing every agent onto one model."""
    return (model_key or '') == AUTO_MODEL_KEY


def _model_display_name(model_id):
    return MODEL_NAMES.get(model_id, model_id)
GATEWAY_ID = os.environ.get('GATEWAY_ID', '')
GATEWAY_URL = os.environ.get('GATEWAY_URL', f'https://{GATEWAY_ID}.gateway.bedrock-agentcore.{REGION}.amazonaws.com/mcp' if GATEWAY_ID else '')
MEMORY_ID = os.environ.get('MEMORY_ID', '')
BROWSER_ID = os.environ.get('BROWSER_ID', '')
CODE_INTERPRETER_ID = os.environ.get('CODE_INTERPRETER_ID', '')
GRADES_API_URL = os.environ.get('GRADES_API_URL', '')
CREDENTIAL_PROVIDER_NAME = os.environ.get('CREDENTIAL_PROVIDER_NAME', 'agentcore-demo-grades-oauth2')
# The userdata-tool Lambda is env-suffixed (e.g. agentcore-demo-userdata-tool-strands1).
# Used ONLY as the direct-invoke fallback when the Gateway path is blocked by Cedar
# policy. Passed by deploy.sh; the unsuffixed default only works for a no-suffix deploy.
USERDATA_LAMBDA_ARN = os.environ.get('USERDATA_LAMBDA_ARN', 'agentcore-demo-userdata-tool')
# Fixed-income (FI demo): the bond-tools Lambda (screen/curve/spread/price/risk/evolve over the
# real bond universe) and the market-data S3 bucket holding the universe snapshot. The agent
# reaches the tool Lambda THROUGH AgentCore Gateway (governed MCP), not a direct invoke — the
# ARN here is only the last-resort transport fallback. The bucket is read when shipping the
# candidate pool into the Code Interpreter sandbox for the evolutionary run. Injected by deploy.sh.
BOND_TOOLS_LAMBDA_ARN = os.environ.get('BOND_TOOLS_LAMBDA_ARN', 'agentcore-demo-bond-tools')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
# Public HTTPS callback (the 3LO session-binding return URL). Pre-registered on the
# runtime's workload identity by deploy.sh. Empty in local dev.
OAUTH_RETURN_URL = os.environ.get('OAUTH_RETURN_URL', '')
# Short-lived table bridging the agent → callback: stashes the user's inbound JWT
# keyed by custom_state so the callback can present userToken to CompleteResourceTokenAuth.
OAUTH_SESSIONS_TABLE = os.environ.get('OAUTH_SESSIONS_TABLE', '')
# Machine-to-machine (2LO / client_credentials) outbound: the market-data vendor the
# agent calls AS THE FIRM (no user), plus the M2M OAuth2 credential provider name.
MARKETDATA_API_URL = os.environ.get('MARKETDATA_API_URL', '')
M2M_PROVIDER_NAME = os.environ.get('M2M_PROVIDER_NAME', 'agentcore-demo-marketdata-m2m')
# API-key vault: the Identity provider holding the FRED key, retrieved at call time
# (never a plaintext env var in the agent — contrast the bond-ingest batch Lambda).
FRED_APIKEY_PROVIDER_NAME = os.environ.get('FRED_APIKEY_PROVIDER_NAME', 'agentcore-demo-fred-apikey')
# Admin-managed RBAC: the entitlements table is the authoritative per-user / per-agent
# grant store (single source of truth, also read by the admin-api + Gateway interceptor).
# This runtime is the PRIMARY per-user enforcement point — it sees the verified caller sub,
# which the Gateway (AWS_IAM principal = the agent role) cannot. AGENT_WORKLOAD_NAME is this
# runtime's own workload identity, used to gate its OUTBOUND credential vends (the agent half).
ENTITLEMENTS_TABLE = os.environ.get('ENTITLEMENTS_TABLE', '')
AGENT_WORKLOAD_NAME = os.environ.get('AGENT_WORKLOAD_NAME', '')
# Hardening flag (default OFF to preserve the pool-less local-dev demo). When 'true', the runtime
# REFUSES to run allow-all: it treats a missing entitlements table as fail-CLOSED for governed
# tools rather than "feature off → allow". Independent of that flag, SENSITIVE tools are ALWAYS
# denied to the unauthenticated 'anon' principal (see _tool_allowed) — that guard is unconditional.
RBAC_REQUIRED = os.environ.get('RBAC_REQUIRED', '').strip().lower() in ('1', 'true', 'yes', 'on')
# Tools whose misuse is materially damaging (trade/positions/vault/governed-DB). These are denied
# to an unauthenticated caller regardless of whether the RBAC table is wired — an anonymous
# principal must never reach a write/PII tool just because the admin RBAC layer isn't deployed.
_ANON_FORBIDDEN_TOOLS = frozenset({'trade_execute', 'secure_vault', 'positions_view', 'query_holdings'})
# AgentCore Optimization A/B experiment (SAFETY VALVE): OFF by default. When 'off', every request
# is the CONTROL variant and this runtime's behavior is byte-identical to pre-Optimization — the
# treatment system-prompt override is never applied. An admin flips OPT_EXPERIMENT_FLAG to 'on'
# (via update-agent-runtime) to start the split; variant is a deterministic hash of session_id so
# a session stays on one arm for its lifetime. See _experiment_variant / _treatment_prompt.
OPT_EXPERIMENT_FLAG = os.environ.get('OPT_EXPERIMENT_FLAG', 'off').strip().lower()
OPT_CONTROL_BUNDLE_ID = os.environ.get('OPT_CONTROL_BUNDLE_ID', '')
OPT_TREATMENT_BUNDLE_ID = os.environ.get('OPT_TREATMENT_BUNDLE_ID', '')
# Cognito pool/client for VERIFYING the in-band user token (see _identity_from_context).
# The RBAC layer makes caller identity a security boundary, so the runtime must derive the
# principal from a CRYPTOGRAPHICALLY VERIFIED token — never from a self-asserted payload field.
USER_POOL_ID = os.environ.get('USER_POOL_ID', '')
USER_POOL_CLIENT_ID = os.environ.get('USER_POOL_CLIENT_ID', '')

# ── Web-browser SSRF guard (web_browser tool) ────────────────────────────────
# The browser fetches a MODEL-CHOSEN URL, so it must be constrained. Two layers:
#   1) HARD, always-on: https-only + block private/loopback/link-local/metadata and other
#      non-public IPs (the actual SSRF vector — e.g. http://169.254.169.254/… stealing the
#      instance role, or reaching 10./172.16./192.168. internal services).
#   2) Optional host allow-list (BROWSER_ALLOWED_HOSTS, comma-separated domain suffixes).
#      DEFAULT EMPTY = any PUBLIC https host is allowed, because the demo legitimately browses
#      the open web across desks (Treasury/FOMC/FRED for capital markets, plus adverse media,
#      SEC filings, breach databases and sanctions lists for insurance/banking/fintech). Set
#      it to lock the tool down to a fixed host set in production (e.g.
#      "treasury.gov,home.treasury.gov,stlouisfed.org,federalreserve.gov,sec.gov").
BROWSER_ALLOWED_HOSTS = [h.strip().lower() for h in
                         os.environ.get('BROWSER_ALLOWED_HOSTS', '').split(',') if h.strip()]

# ── Elevated (long-running / 2h-tier) budget gate ────────────────────────────
# action='start' asks for the long-running tier (kept-alive microVM, lifted budgets). Gate it
# behind an allow-list of verified Cognito subs. DEFAULT '*' = every authenticated caller may
# use it (preserves the "run autonomously for hours" demo). Set to a comma-list of subs to
# restrict; a non-entitled caller silently runs at the normal (sub-290s) tier, never hard-fails.
LONG_RUNNING_ALLOWED_SUBS = [s.strip() for s in
                             os.environ.get('LONG_RUNNING_ALLOWED_SUBS', '*').split(',') if s.strip()]

# SDK clients/primitives for AgentCore features
from bedrock_agentcore.runtime import BedrockAgentCoreApp, BedrockAgentCoreContext
from bedrock_agentcore.services.identity import IdentityClient
# Idiomatic AgentCore Identity decorators. Used for the M2M and API-key flows, which
# carry NO per-user state — so decoration-time binding of scopes/provider is a clean
# fit. The 3LO flow deliberately stays on the direct IdentityClient.get_token call
# below because it needs a per-request custom_state (user_id) the decorators can't vary.
from bedrock_agentcore.identity.auth import requires_access_token, requires_api_key
from bedrock_agentcore.memory.client import MemoryClient
from bedrock_agentcore.tools.code_interpreter_client import CodeInterpreter, code_session
from bedrock_agentcore.tools.browser_client import browser_session

_memory_client = MemoryClient(region_name=REGION)
_identity_client = IdentityClient(REGION)
app = BedrockAgentCoreApp()

# ─────────────────────────────────────────────────────────────────────────────
# AG-UI protocol event emission
#
# The entrypoint is an async generator, so BedrockAgentCoreApp streams it as SSE:
# it JSON-encodes each yielded value and wraps it as `data: {json}\n\n` itself. We
# therefore yield the AG-UI event as a plain dict (model_dump(by_alias=True) → the
# protocol's camelCase wire form) and must NOT use ag_ui.encoder (that would double
# the `data:` framing). The AG-UI bridge Lambda relays these SSE lines to the
# CopilotKit/@ag-ui/client frontend verbatim.
# ─────────────────────────────────────────────────────────────────────────────
import uuid as _uuid
from ag_ui.core import (
    RunStartedEvent, RunFinishedEvent, RunErrorEvent,
    TextMessageStartEvent, TextMessageContentEvent, TextMessageEndEvent,
    ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ToolCallResultEvent,
    CustomEvent, EventType,
)


def _ev(event):
    """Serialize an AG-UI event to its wire-form dict (camelCase via by_alias)."""
    return event.model_dump(mode='json', by_alias=True)


# ─────────────────────────────────────────────────────────────────────────────
# Security helpers: structured audit log, client-error sanitization, token redaction.
# Lightweight by design (JSON to stdout → CloudWatch); NOT a persistence layer.
# ─────────────────────────────────────────────────────────────────────────────
import re as _re

# Matches a JWT-ish triple (header.payload.signature) so we never echo a raw token to logs.
_JWT_RE = _re.compile(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b')


def _redact(text):
    """Redact anything that looks like a JWT/bearer token from a log line."""
    try:
        return _JWT_RE.sub('<redacted-token>', str(text))
    except Exception:
        return '<unprintable>'


def _audit(event, **fields):
    """Emit ONE structured security-audit line (JSON to stdout → CloudWatch). Security-relevant
    events only (tool invocation, RBAC deny, trade execution, vault access, budget exhaustion,
    identity decisions). Values are token-redacted. Best-effort — never raises."""
    try:
        rec = {'audit': event, 'ts': int(time.time())}
        # Stamp the turn's session id (from the per-turn contextvar) so an audit event can be
        # correlated to its CloudWatch execution trace (GET /trace?session_id=…) — this is what
        # makes the admin "Access history" row click through to the trace. Best-effort: events
        # emitted outside a turn (e.g. an early identity check) simply carry no session.
        try:
            _sess = _CURRENT_SESSION.get()
            if _sess:
                rec['session'] = _sess
        except Exception:
            pass
        for k, v in fields.items():
            rec[k] = _redact(v) if isinstance(v, str) else v
        print('AUDIT ' + json.dumps(rec, default=str), flush=True)
    except Exception:
        pass


def _safe_error(exc, where=''):
    """Return a GENERIC client-facing error message while logging the real detail server-side
    (redacted). Keeps raw exception text / stack internals out of the response the user sees."""
    print(f'ERROR [{where or "runtime"}]: {_redact(f"{type(exc).__name__}: {exc}")}', flush=True)
    return 'An internal error occurred while handling this request. Please try again.'


def _is_public_host(host):
    """True only if `host` resolves to a GLOBALLY-ROUTABLE (public) address — blocks
    loopback/private/link-local/metadata/multicast/reserved ranges to defeat SSRF. Resolves
    the name so a hostname that points at 169.254.169.254 / 127.0.0.1 / an RFC1918 address is
    caught too (not just literal-IP URLs)."""
    import ipaddress
    import socket
    if not host:
        return False
    addrs = set()
    try:
        # Covers both literal IPs and DNS names (getaddrinfo parses/resolves both).
        for info in socket.getaddrinfo(host, None):
            addrs.add(info[4][0])
    except Exception:
        return False
    if not addrs:
        return False
    for a in addrs:
        try:
            ip = ipaddress.ip_address(a.split('%', 1)[0])  # strip any zone id
        except ValueError:
            return False
        # is_global is False for private/loopback/link-local/reserved/multicast; also
        # explicitly reject the cloud metadata IP (link-local, so already caught — belt & braces).
        # NOTE: on ipaddress objects these are BOOL PROPERTIES, not methods — adding () would
        # raise TypeError. The guard is correct as-is (verified: blocks 169.254.169.254/RFC1918).
        if not ip.is_global or ip.is_link_local or ip.is_loopback or ip.is_private:  # nosemgrep  (is-function-without-parentheses: ipaddress is_* are properties)
            return False
    return True


def _validate_browse_url(url):
    """Return (ok, reason). Enforce https-only + block non-public hosts (SSRF guard); apply the
    optional BROWSER_ALLOWED_HOSTS suffix allow-list when configured. reason is a clean,
    user-facing string when ok is False."""
    try:
        parsed = _urlparse.urlparse(url or '')
    except Exception:
        return False, 'Malformed URL.'
    scheme = (parsed.scheme or '').lower()
    if scheme != 'https':
        return False, 'Only https:// URLs may be browsed.'
    host = (parsed.hostname or '').lower()
    if not host:
        return False, 'URL has no host.'
    if BROWSER_ALLOWED_HOSTS and not any(
            host == h or host.endswith('.' + h) for h in BROWSER_ALLOWED_HOSTS):
        return False, 'This host is not on the browser allow-list.'
    if not _is_public_host(host):
        return False, 'Refusing to browse a private, loopback, link-local, or metadata address.'
    return True, ''


def _assert_https(url):
    """Guard for the module's direct urllib calls: refuse any non-https URL before it reaches
    urlopen, which would otherwise honor file://, ftp://, and custom schemes (the SSRF /
    local-file-read vector bandit B310 flags). Every direct urlopen here targets a fixed https
    endpoint — a deploy-time env URL (Grades / Market-data / Gateway) or a hardcoded literal
    (FRED / Cognito JWKS) — so this turns that invariant into an enforced check rather than a
    comment. Returns the URL unchanged so it can wrap the argument inline; raises ValueError
    otherwise. (Model/user-supplied browsing goes through _validate_browse_url + Playwright,
    never urlopen.)"""
    if not isinstance(url, str) or not url.lower().startswith('https://'):
        raise ValueError(f'refusing non-https URL for outbound request: {url!r}')
    return url


# Short-term chat transcript for the Strands engine: {session_id: [(role, text), ...]}.
# The Strands swarm runs fresh each turn over a SINGLE message, so without this a reply
# like "3" (picking an option the agent just offered) has no context. We keep the last
# few user/assistant text turns per session and feed them in as conversational context.
# Bounded; lives only for the life of the runtime microVM (fine — a session is pinned to
# one microVM). Long-term AgentCore Memory is separate (summarized facts, not turn replay).
_chat_history = {}
_CHAT_HISTORY_TURNS = 8  # keep the last N messages (≈4 exchanges)


def _recent_history(session_id):
    """Return the recent (role, text) turns for a session (most-recent last)."""
    if not session_id:
        return []
    return _chat_history.get(session_id, [])


def _append_history(session_id, role, text):
    """Append one turn to the session transcript, bounded to the last N."""
    if not (session_id and text):
        return
    hist = _chat_history.setdefault(session_id, [])
    hist.append((role, text))
    if len(hist) > _CHAT_HISTORY_TURNS:
        del hist[:-_CHAT_HISTORY_TURNS]


SYSTEM_PROMPT = """You are an AI assistant for portfolio managers at AgentCore in a Box, a fixed-income investment firm, built on Amazon Bedrock AgentCore. The signed-in user is a portfolio manager (PM). You have access to several tools:

1. **Secure Vault** (via Gateway): Retrieve restricted compliance / market-data values (e.g. the firm's restricted-trading list, an OMS master PIN) that are held only by the Vault Lambda. You CANNOT know these values yourself — they must come from the tool, and access may be blocked by policy.
2. **Portfolio Manager Data Lookup**: Look up the PM's own information from the firm directory (profile, the funds/portfolios they manage, preferences such as their benchmark).
3. **Web Browser** (AgentCore Browser): Browse websites to get live market information (e.g. current Treasury yields, FOMC statements).
4. **Code Interpreter** (AgentCore Code Interpreter): Execute Python code (e.g. compute a fund's Sharpe ratio, max drawdown, or weighted average yield).
5. **Positions & Trading** (via AgentCore Identity, 3-legged OAuth): View positions, or EXECUTE TRADES / rebalance, in the PM's funds via the Portfolio API. This uses a user-delegated OAuth token vended by AgentCore Identity — the agent acts on behalf of the signed-in PM, and only that PM's funds are accessible. Viewing needs read consent; EXECUTING A TRADE requires a separate trade consent.

You also have **AgentCore Memory** — long-term memory of past conversations with this PM. Memory context is automatically provided in your system prompt below (under "Long-term memory about this user"). You do NOT need any tool to access memories.

When a user asks you to:
- Retrieve the restricted-trading list or any protected compliance value: use the secure_vault tool via Gateway. NEVER invent or guess the value — if the tool is unavailable or blocked by policy, tell the user you cannot retrieve it. Do not make one up.
- Look up their PM profile / the funds they manage / preferences: use the portfolio data lookup tool.
- View positions or execute a trade/rebalance: use the positions_view / trade_execute tools. The first use of each requires the PM to authorize access in their browser (viewing and trading are separate consents).
- Browse a website: use the browser.
- Run code or analyze data (e.g. Sharpe ratio, duration, weighted average yield): use the code interpreter.
- Recall what you remember about the PM (e.g. the funds they run, their benchmark): refer to the "Long-term memory" section in your context — do NOT use user_data_lookup for this.
- Remember something for next time: acknowledge it will be stored in memory automatically.

Always explain which AgentCore feature you're using for demo transparency.

=== OUTPUT FORMAT (executive-grade) ===
Write for a senior portfolio manager. Be concise and decision-oriented:
- Lead with the headline number or conclusion in **bold** on the first line.
- Present holdings, yields, or any tabular data as a GitHub-style pipe table, e.g.
  `| Ticker | Weight |` then a `|---|---|` separator row, then the rows.
- Use `- ` bullet points for short summaries; use `## ` for section headers when an answer has multiple parts.
- Put numbers in plain form (e.g. 4.21%, 1.83, -4.5%); do not wrap whole answers in code fences.
- Keep the "which AgentCore feature / which specialist handled this" transparency note to ONE short trailing *italic* line."""



# ─────────────────────────────────────────────────────────────────────────────
# AgentCore Identity 3-legged (USER_FEDERATION) consent plumbing
#
# get_token, on first use for a (workload, user) pair, returns an authorization URL
# and would then POLL the token vault (up to 600s) for consent. We cannot block the
# WebSocket that long and there is no streaming channel, so on_auth_url raises
# AuthRequiredException to surface the URL and unwind immediately. The frontend shows
# the link; the user consents (the /oauth/callback Lambda completes the binding), then
# clicks "continue" to re-send. On that second call the vault has the grant and
# returns the token directly, so the tool proceeds.
# ─────────────────────────────────────────────────────────────────────────────

class AuthRequiredException(Exception):
    """Raised when a 3LO tool needs user consent. Carries the authorization URL."""
    def __init__(self, auth_url):
        self.auth_url = auth_url
        super().__init__(auth_url)


class _NoPoll:
    """Token poller that returns immediately with no token, so get_token does not
    block for 600s when consent is still pending. We surface the auth URL via
    on_auth_url (which raises) instead; this is only a fallback."""
    async def poll_for_token(self):
        raise AuthRequiredException(None)


async def _vend_grades_token(user_id, scopes, user_jwt, force_reauth=False):
    """Vend a user-delegated (3LO USER_FEDERATION) OAuth token for the Grades API
    via AgentCore Identity. On first use (no cached consent) the Identity service
    returns an authorization URL; we raise AuthRequiredException carrying it so the
    entrypoint can send the user to consent. We pass:
      - callback_url: our public /oauth/callback (the session-binding return URL,
        pre-registered on the workload identity), and
      - custom_state: an UNGUESSABLE, single-use nonce (NOT the user id). The callback
        looks the nonce up in the oauth-sessions table to recover the user's ALREADY-
        VERIFIED inbound JWT and binds consent with that token, then deletes the nonce.
    After the user consents, the next call returns the token directly.
    force_reauth=True (set by the frontend after a logout) ignores any cached
    consent and re-prompts — so each demo starts fresh.

    SECURITY: custom_state used to be the raw user_id — guessable AND trusted verbatim
    by the callback, so an attacker who guessed/observed it could bind consent to another
    user (a CSRF-shaped hole). Now it is a 256-bit random nonce that is meaningless on its
    own: it only dereferences a server-side row holding the JWT we already verified at
    request time, and it is consumed (deleted) on first use so a replay can't rebind it."""
    workload_token = BedrockAgentCoreContext.get_workload_access_token()
    if not workload_token:
        raise RuntimeError('No workload access token in context (runtime inbound auth not JWT?).')

    # Single-use, unguessable binding nonce. Only meaningful as a key into oauth-sessions.
    state_nonce = secrets.token_urlsafe(32)

    def on_auth_url(url):
        # Consent is needed. The session was bound via the inbound JWT
        # (GetWorkloadAccessTokenForJWT), so CompleteResourceTokenAuth must later be
        # called with the user's JWT (userToken), NOT their userId. Stash that JWT
        # (passed in explicitly — the SDK may run this callback in a worker thread,
        # so a contextvar would not survive) keyed by the random nonce so the
        # /oauth/callback Lambda can look it up. JWT never travels in the URL.
        _stash_user_jwt(state_nonce, user_jwt, user_id)
        raise AuthRequiredException(url)

    kwargs = dict(
        provider_name=CREDENTIAL_PROVIDER_NAME,
        scopes=scopes,
        agent_identity_token=workload_token,
        auth_flow='USER_FEDERATION',
        on_auth_url=on_auth_url,
        token_poller=_NoPoll(),
        custom_state=state_nonce,
        force_authentication=force_reauth,
    )
    if OAUTH_RETURN_URL:
        kwargs['callback_url'] = OAUTH_RETURN_URL
    return await _identity_client.get_token(**kwargs)


_ddb = boto3.client('dynamodb', region_name=REGION)


def _stash_user_jwt(state_nonce, jwt_token, user_id=''):
    """Stash the caller's ALREADY-VERIFIED inbound JWT keyed by the single-use binding nonce
    (custom_state). The callback dereferences the nonce to recover this token and bind consent
    with it, then deletes the row. `user_id` is stored only as a non-authoritative audit hint —
    the callback binds off the token, never off this field or the (now random) key."""
    if not (jwt_token and OAUTH_SESSIONS_TABLE and state_nonce):
        print(f"OAUTH STASH SKIPPED (jwt={bool(jwt_token)} table={bool(OAUTH_SESSIONS_TABLE)} nonce={bool(state_nonce)})", flush=True)
        return
    import time as _t
    try:
        _ddb.put_item(
            TableName=OAUTH_SESSIONS_TABLE,
            Item={
                'state': {'S': state_nonce},
                'userToken': {'S': jwt_token},
                'userIdHint': {'S': user_id or ''},  # audit hint only — never used to bind
                'ttl': {'N': str(int(_t.time()) + 900)},  # 15-min expiry
            })
    except Exception as e:
        print(f"OAUTH STASH ERROR: {_redact(f'{type(e).__name__}: {e}')}", flush=True)


async def _call_grades_api(method, path, access_token, body=None):
    """Call the Grades API with the user-delegated OAuth token. Run the blocking
    urllib call in a worker thread so we don't stall the event loop."""
    def _do():
        url = f'{GRADES_API_URL}{path}'
        data = json.dumps(body).encode() if body is not None else None
        headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}
        _assert_https(url)
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
            return json.loads(resp.read().decode())
    return await asyncio.to_thread(_do)


import urllib.parse as _urlparse


async def _positions_view_tool(fund_name, user_id, user_jwt, force_reauth=False):
    token = await _vend_grades_token(user_id, ['portfolio-api/read'], user_jwt, force_reauth)
    return await _call_grades_api('GET', f'/grades?fund={_urlparse.quote(fund_name)}', token)


async def _trade_execute_tool(fund_name, ticker, side, target_allocation, user_id, user_jwt, force_reauth=False):
    # Trading needs the trade scope too — a SEPARATE consent from read (least-privilege).
    token = await _vend_grades_token(user_id, ['portfolio-api/read', 'portfolio-api/trade'], user_jwt, force_reauth)
    return await _call_grades_api('PUT', f'/grades/{_urlparse.quote(fund_name)}',
                                  token, body={'ticker': ticker, 'side': side, 'target_allocation': target_allocation})


# ─────────────────────────────────────────────────────────────────────────────
# AgentCore Identity — Machine-to-Machine (2LO / client_credentials) + API-key vault
#
# These are the two outbound flows that carry NO per-user state, so they use the
# idiomatic SDK decorators (unlike 3LO above, which needs per-request custom_state).
#
#  • @requires_access_token(auth_flow='M2M', ...) mints a client_credentials token
#    for the FIRM's application identity (no user, no consent, no on_auth_url) and
#    injects it as the `access_token` kwarg. The decorator awaits the token on the
#    running loop because the wrapped fn is async — no ThreadPoolExecutor path.
#  • @requires_api_key(...) fetches the FRED key from the Identity API-key vault and
#    injects it as `api_key`. This replaces the plaintext FRED_API_KEY env-var
#    pattern the bond-ingest batch Lambda still uses (kept there as the "before").
#
# Both decorators call BedrockAgentCoreContext.get_workload_access_token() under the
# hood — the same workload identity 3LO uses — which the JWT-authorized runtime
# populates automatically.
# ─────────────────────────────────────────────────────────────────────────────

@requires_access_token(
    provider_name=M2M_PROVIDER_NAME,
    scopes=['market-data/read'],
    auth_flow='M2M',
    into='access_token',
)
async def _fetch_market_data(dataset, *, access_token=''):
    """Call the licensed market-data vendor AS THE FIRM (M2M). access_token is a
    client-credentials token minted for the firm's application identity — it carries
    the app client_id, no user subject. Injected by the @requires_access_token
    decorator; we never touch AgentCore Identity directly here."""
    def _do():
        url = f'{MARKETDATA_API_URL}/market/{_urlparse.quote(dataset)}'
        _assert_https(url)
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {access_token}'}, method='GET')
        with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
            return json.loads(resp.read().decode())
    return await asyncio.to_thread(_do)


async def _market_data_tool(dataset):
    data = await _fetch_market_data(dataset)
    if isinstance(data, dict):
        data.setdefault('source', 'Licensed market-data vendor via AgentCore Identity M2M (client_credentials)')
        data.setdefault('principal', 'AgentCore in a Box application identity (not a user)')
    return data


# FRED series ids for the friendly indicator names the tool exposes. The macro_indicator
# backend is persona-agnostic: it accepts the UNION of every desk's indicators (all real,
# free FRED series). Each desk only SEES its own subset — that filtering happens in the
# per-persona tool-spec override (personas.MACRO_INDICATOR_SPEC / _build_tools), not here —
# so a banking agent is offered sofr/prime, a fintech agent eur_usd/card_delinquency, etc.
# There is deliberately NO crypto (no free real FRED series) and NO NOAA weather (not FRED).
_FRED_SERIES = {
    # Capital-markets + shared macro (all desks that surface rates/inflation).
    'CPI': 'CPIAUCSL',        # CPI, all urban consumers
    'unemployment': 'UNRATE',  # civilian unemployment rate
    'fed_funds': 'FEDFUNDS',   # effective federal funds rate
    'core_pce': 'PCEPILFE',    # core PCE price index
    '10y': 'DGS10',            # 10-year Treasury constant maturity
    # Banking rate environment (real FRED — the same series banking-ingest anchors to).
    'sofr': 'SOFR',            # Secured Overnight Financing Rate
    'prime': 'DPRIME',         # bank prime loan rate
    # Fintech FX pairs (real FRED daily spot; no crypto — no free real series exists).
    'eur_usd': 'DEXUSEU',      # US $ to 1 EUR
    'gbp_usd': 'DEXUSUK',      # US $ to 1 GBP
    'usd_jpy': 'DEXJPUS',      # JPY to 1 US $
    # Fintech consumer-credit environment (real FRED — fintech-ingest's cyclical anchor).
    'card_delinquency': 'DRCCLACBS',  # delinquency rate on credit-card loans, all commercial banks
    'card_chargeoff': 'CORCCACBS',    # charge-off rate on credit-card loans
    'consumer_credit': 'TOTALSL',     # total consumer credit owned & securitized
}


@requires_api_key(provider_name=FRED_APIKEY_PROVIDER_NAME, into='api_key')
async def _fetch_fred_series(series_id, *, api_key=''):
    """Fetch a live FRED economic series. api_key is retrieved from the AgentCore
    Identity API-key VAULT and injected by the @requires_api_key decorator — the key
    is never a plaintext credential held by the agent."""
    def _do():
        url = ('https://api.stlouisfed.org/fred/series/observations'
               f'?series_id={_urlparse.quote(series_id)}&api_key={_urlparse.quote(api_key)}'
               '&file_type=json&sort_order=desc&limit=13')
        with urllib.request.urlopen(_assert_https(url), timeout=15) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
            return json.loads(resp.read().decode())
    return await asyncio.to_thread(_do)


async def _macro_indicator_tool(indicator):
    series_id = _FRED_SERIES.get(indicator)
    if not series_id:
        return {'error': f'Unknown indicator: {indicator}', 'known': list(_FRED_SERIES)}
    raw = await _fetch_fred_series(series_id)
    obs = [o for o in (raw.get('observations', []) if isinstance(raw, dict) else []) if o.get('value') not in (None, '.', '')]
    latest = obs[0] if obs else None
    return {
        'indicator': indicator,
        'series_id': series_id,
        'latest': latest,
        'observations': obs[:13],
        'source': 'FRED (api key from AgentCore Identity vault)',
    }


# The verified caller principal for the CURRENT tool call, set by execute_tool and read by
# call_gateway_tool so the Gateway REQUEST interceptor can enforce per-user access at the MCP
# boundary. A ContextVar (not a global) so concurrent tool calls on the shared event loop never
# cross principals. Value is 'user#<verified-sub>' or '' when unknown.
import contextvars as _contextvars
_CURRENT_PRINCIPAL = _contextvars.ContextVar('current_principal', default='')
# The verified caller's JWT + session for the CURRENT turn, set at the top of
# process_message_events (which has both). The Gateway is now CUSTOM_JWT inbound (not AWS_IAM),
# so call_gateway_tool authenticates to the Gateway edge with the END-USER's Bearer token — the
# Gateway validates the user's identity itself, and the interceptor derives the principal from
# the verified JWT (harness path) OR the runtime-asserted __principal in the body (desk path).
_CURRENT_USER_JWT = _contextvars.ContextVar('current_user_jwt', default='')
_CURRENT_SESSION = _contextvars.ContextVar('current_session', default='')
# Session-keyed freshest-token map. A background ('start'/'poll') turn can outlive its ~1h access
# token; the frontend re-sends a freshly-minted token on every poll (see invoke()), which we stash
# here so a long-running turn's Gateway calls use the LATEST token, not the one captured at start.
# Bounded + best-effort; a missing/expired token fails closed (clean error), never SigV4.
_SESSION_JWT = {}


def _gateway_bearer_token():
    """The freshest user JWT for the current turn: the poll-refreshed session token if present,
    else the token captured at turn start. '' when unknown (→ fail closed)."""
    sess = _CURRENT_SESSION.get()
    if sess:
        tok = _SESSION_JWT.get(sess)
        if tok:
            return tok
    return _CURRENT_USER_JWT.get()


def call_gateway_tool(tool_name, arguments):
    """Call a tool through the AgentCore Gateway MCP endpoint (JWT-inbound, policy-enforced).

    The Gateway is CUSTOM_JWT inbound, so we authenticate to it as the END USER with their Cognito
    Bearer token (was SigV4 as the shared agent role). Per-user identity is therefore a property
    the Gateway itself validates — not merely a string the runtime asserts. We ALSO keep injecting
    the runtime-verified `__principal` in the tool body: it's the interceptor's primary, reliable
    principal channel (path #1), so desk entitlement enforcement is byte-identical to before and
    does not depend on whether the inbound Authorization header is forwarded to the interceptor.
    This is trustworthy because the runtime already validated the caller's JWT before we get here."""
    token = _gateway_bearer_token()
    if not token:
        # Fail closed: the Gateway is JWT-only now (no SigV4 fallback). A turn with no user token
        # cannot call governed tools — surface a clean, actionable error, never a silent wrong call.
        return {'error': 'Session token unavailable or expired — please re-run this request so the '
                         'desk can re-authenticate to the governed tool gateway.',
                'auth_expired': True}

    args = dict(arguments or {})
    _principal = _CURRENT_PRINCIPAL.get()
    if _principal:
        args['__principal'] = _principal

    body = json.dumps({
        'jsonrpc': '2.0',
        'method': 'tools/call',
        'id': '1',
        'params': {'name': tool_name, 'arguments': args}
    })

    _assert_https(GATEWAY_URL)
    http_req = urllib.request.Request(
        GATEWAY_URL, data=body.encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
        method='POST')
    resp = urllib.request.urlopen(http_req, timeout=30)  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
    result = json.loads(resp.read().decode())

    if 'error' in result:
        raw = result['error'].get('message', str(result['error']))
        # Surface a clean, demo-friendly signal for Cedar policy denials instead
        # of leaking the internal policy ID / raw authorization text.
        low = str(raw).lower()
        if 'policy' in low or 'forbid' in low or 'denied' in low or 'authoriz' in low:
            return {'error': 'Access denied by Cedar policy. This tool is currently blocked by the AgentCore policy engine.', 'blocked_by_policy': True}
        return {'error': raw}

    content = result.get('result', {}).get('content', [])
    if content and content[0].get('text'):
        try:
            return json.loads(content[0]['text'])
        except (json.JSONDecodeError, TypeError):
            return {'result': content[0]['text']}
    return {'result': str(content)}


def _extract_page_text(page):
    """Pull readable text from a loaded page using several fallbacks, so a slow or
    JS-rendered page (e.g. the Treasury yield-curve table) never yields a blank result.

    Order: data tables first (the yield curve, holdings grids, etc. live in <table>s and
    are what the demo actually wants), then <main>, then the full body. Returns the first
    non-trivial text found; '' only if the page truly had no readable text."""
    candidates = []
    # 1) Concatenate any data tables — most market-data pages put the numbers here.
    try:
        tables = page.locator('table')
        n = tables.count()
        if n:
            parts = []
            for i in range(min(n, 6)):
                try:
                    txt = tables.nth(i).inner_text(timeout=3000).strip()
                    if txt:
                        parts.append(txt)
                except Exception:
                    continue
            if parts:
                candidates.append('\n\n'.join(parts))
    except Exception as e:
        # Best-effort: table extraction is one of several fallbacks; log and continue to <main>/body.
        print(f'BROWSER extract(tables) skipped: {type(e).__name__}', flush=True)
    # 2) <main> region, then 3) whole body.
    for sel in ('main', 'body'):
        try:
            txt = page.inner_text(sel, timeout=3000).strip()
            if txt:
                candidates.append(txt)
        except Exception as e:
            print(f'BROWSER extract({sel}) skipped: {type(e).__name__}', flush=True)
            continue
    # Pick the richest candidate (body usually subsumes the tables, but if the body
    # read came back empty/short the table text still carries the actual data).
    candidates = [c for c in candidates if c]
    return max(candidates, key=len) if candidates else ''


def _browse_sync(url):
    """Synchronous AgentCore Browser + Playwright work. MUST be called off the
    event loop (via asyncio.to_thread) because Playwright's sync API refuses to
    run inside a running asyncio loop."""
    import time
    from playwright.sync_api import sync_playwright

    with browser_session(REGION, identifier=BROWSER_ID) as browser_client:
        ws_url, headers = browser_client.generate_ws_headers()
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(ws_url, headers=headers)
            context = browser.contexts[0]
            page = context.pages[0]
            # 'domcontentloaded' is far more reliable than 'load' on heavy gov/data
            # pages (which may never fully fire 'load'); we then settle the network and
            # wait for a data table to appear before reading. All waits are best-effort
            # — we read whatever is present rather than failing the whole turn.
            page.goto(url, timeout=30000, wait_until='domcontentloaded')
            try:
                page.wait_for_load_state('networkidle', timeout=12000)
            except Exception:
                pass
            # Many data pages (e.g. Treasury yields) render their numbers into a <table>
            # after first paint; wait briefly for one so we capture the actual data.
            try:
                page.wait_for_selector('table', timeout=8000)
            except Exception:
                pass
            page_content = _extract_page_text(page)[:5000]
            try:
                title = page.title()
            except Exception:
                title = ''
            # Give recording extension time to capture rendered DOM and flush to S3
            # before we tear down the CDP connection — intentional settle, not debug cruft.
            time.sleep(3)  # nosemgrep  (arbitrary-sleep: intentional CDP recording-flush settle)
            browser.close()
    out = {'url': url, 'title': title, 'content': page_content,
           'source': 'AgentCore Browser (Playwright over CDP)'}
    if not page_content:
        # Explicit, honest signal the model can relay — never a silent blank card.
        out['note'] = ('The page loaded but exposed no machine-readable text (it may be '
                       'JS-gated, paginated, or blocked). No data could be extracted.')
    return out


def _invoke_bond_tool_direct(action, args):
    """LAST-RESORT direct Lambda invoke — used ONLY when the Gateway transport itself is
    unreachable (not on a Cedar policy denial). Returns the parsed result dict; never raises."""
    try:
        lam = boto3.client('lambda', region_name=REGION)
        payload = {'action': action, 'args': args or {}}
        resp = lam.invoke(FunctionName=BOND_TOOLS_LAMBDA_ARN, Payload=json.dumps(payload).encode())
        raw = json.loads(resp['Payload'].read().decode())
        # The Lambda returns the action result directly for direct-invoke (no HTTP wrapper).
        if isinstance(raw, dict) and 'body' in raw and 'statusCode' in raw:
            return json.loads(raw['body'])
        return raw
    except Exception as e:
        return {'error': f'bond tool {action} failed: {type(e).__name__}: {e}'}


def _invoke_bond_tool(action, args):
    """Run one bond-tools action over the real universe THROUGH AgentCore Gateway (governed
    MCP), the same policy-enforced path as the vault/user-data tools — the agent never invokes
    the Lambda directly on the happy path. Returns the parsed result dict; never raises.

    Fallback policy mirrors user_data_lookup: if the Gateway TRANSPORT is unreachable we fall
    back to a direct Lambda invoke so the flagship demo still works. But a Cedar POLICY denial
    is surfaced as-is (blocked_by_policy) — the whole point of the policy toggle is that a
    block genuinely stops the tool."""
    result = call_gateway_tool(f'bond-tools___{action}', args or {})
    if isinstance(result, dict):
        if result.get('blocked_by_policy') or result.get('auth_expired'):
            # Cedar said no, or we can't authenticate the user to the JWT gateway — honor it,
            # do NOT sneak around via a direct (ungoverned) Lambda invoke.
            return result
        if 'error' in result:
            # Non-policy gateway error (transport/registration) — fall back to direct invoke
            # so a portfolio build never hard-fails on a gateway hiccup.
            print(f'GATEWAY bond {action} error, falling back to direct: {result.get("error")}', flush=True)
            return _invoke_bond_tool_direct(action, args)
    return result


# Per-vertical governed tools live behind their own Gateway targets, registered by deploy.sh
# (insurance-tools / banking-tools / fintech-tools), each backed by a Lambda that dispatches
# on the MCP tool name. personas.py owns the tool→target map so names are declared once.
def _invoke_gateway_tool(target, action, args):
    """Run one governed vertical-tool action through the AgentCore Gateway target `target`
    (the same policy-enforced MCP path as the bond/vault tools). Returns the parsed dict;
    honors a Cedar block; on a transport error returns the error (no direct-Lambda fallback —
    these verticals have no bespoke direct path, and the mock Lambdas are simple enough that a
    gateway hiccup is rare)."""
    try:
        result = call_gateway_tool(f'{target}___{action}', args or {})
        if isinstance(result, dict) and 'body' in result:
            try:
                return json.loads(result['body'])
            except Exception:
                return result
        return result
    except Exception as e:
        return {'error': f'{target} {action} failed: {type(e).__name__}: {e}'}


def _load_universe_candidates(mandate, cap=800):
    """Fetch the unbiased eligible candidate pool (via the bond-tools `evolve_pool` action)
    so we ship a bounded, sector/rating-representative list into Code Interpreter rather than
    all 3k bonds — and rather than a yield-sorted slice that would bias the GA toward the
    longest/riskiest names."""
    res = _invoke_bond_tool('evolve_pool', {'mandate': mandate, 'cap': cap})
    return res.get('bonds', []) if isinstance(res, dict) else []


def _evolve_in_code_interpreter(mandate, candidates, seed, generations, population):
    """PRIMARY evolutionary path: ship the canonical evolve.py SOURCE + the real candidate
    pool into the AgentCore Code Interpreter sandbox and run the GA there (the genuine
    'sandboxed Python for portfolio analytics' primitive on real data). Returns the parsed
    result dict, or raises so the caller can fall back to the Lambda."""
    import evolve as _evolve_mod
    src_path = _evolve_mod.__file__
    with open(src_path, 'r', encoding='utf-8') as f:
        evolve_src = f.read()
    # Ship the pool + mandate as JSON STRING LITERALS parsed inside the program. Embedding
    # json.dumps output as bare Python would be invalid (JSON true/false/null ≠ Python), so we
    # json.loads a triple-quoted string. json.dumps never emits ''' so the literal is safe.
    program = (
        evolve_src
        + "\n\n# ── injected by the agent: real candidate pool + mandate ──\n"
        + "import json as _json\n"
        + f"CANDIDATES = _json.loads('''{json.dumps(candidates)}''')\n"
        + f"MANDATE = _json.loads('''{json.dumps(mandate)}''')\n"
        + f"SEED = {int(seed)}\n"
        + f"_RESULT = run(CANDIDATES, MANDATE, SEED, generations={int(generations)}, population={int(population)})\n"
        + "print(_json.dumps(_RESULT))\n"
    )
    with code_session(REGION, identifier=CODE_INTERPRETER_ID) as ci:
        result = ci.execute_code(program)
        output = ''
        stream = result.get('stream')
        if stream:
            for event in stream:
                if 'result' in event:
                    for item in event['result'].get('content', []):
                        if isinstance(item, dict) and 'text' in item:
                            output += item['text']
                    structured = event['result'].get('structuredContent', {})
                    if not output and structured.get('stdout'):
                        output = structured['stdout']
    # The program prints exactly one JSON line (the result).
    line = output.strip().splitlines()[-1] if output.strip() else ''
    parsed = json.loads(line)
    parsed['source'] = 'AgentCore Code Interpreter (sandboxed Python GA)'
    return parsed


async def _evolve_portfolio_tool(inp):
    """Run the evolutionary portfolio construction. CI-primary, Lambda-fallback. Builds the
    candidate pool from the real universe, then evolves construction recipes against the
    PM's mandate. Returns the fitness curve + leaderboard + winning portfolio."""
    mandate = inp.get('mandate') if isinstance(inp.get('mandate'), dict) else {}
    # Accept flat mandate fields too (the model may pass them at top level).
    for k in ('duration_target', 'rating_floor', 'allow_high_yield', 'max_sector_weight',
              'max_issuer_weight', 'n_bonds', 'yield_weight', 'risk_weight', 'exclude_treasury',
              'min_duration', 'max_duration'):
        if k in inp and k not in mandate:
            mandate[k] = inp[k]
    seed = int(inp.get('seed') or 20260101)
    generations = int(inp.get('generations') or 6)
    population = int(inp.get('population') or 24)

    candidates = await asyncio.to_thread(_load_universe_candidates, mandate)
    # Trim each bond to only the fields the GA reads, so the program shipped into the sandbox
    # stays lean (the full per-CUSIP record carries price/dv01/face/maturity the GA ignores).
    _keep = ('cusip', 'ticker', 'issuer', 'sector', 'rating', 'rating_num',
             'ytm', 'mod_duration', 'convexity', 'oas', 'years', 'liquidity', 'is_treasury')
    candidates = [{k: b[k] for k in _keep if k in b} for b in candidates]
    if len(candidates) < 20:
        # Couldn't screen a pool (e.g. universe not yet ingested) — let the Lambda use the
        # full universe itself.
        return await asyncio.to_thread(_invoke_bond_tool, 'evolve_portfolio',
                                       {'mandate': mandate, 'seed': seed,
                                        'generations': generations, 'population': population})
    # PRIMARY: Code Interpreter.
    if CODE_INTERPRETER_ID:
        try:
            return await asyncio.to_thread(_evolve_in_code_interpreter, mandate, candidates,
                                           seed, generations, population)
        except Exception as e:
            print(f'CI evolve failed, falling back to Lambda: {type(e).__name__}: {e}', flush=True)
    # FALLBACK: bond-tools Lambda runs the same evolve.py.
    return await asyncio.to_thread(_invoke_bond_tool, 'evolve_portfolio',
                                   {'mandate': mandate, 'seed': seed,
                                    'generations': generations, 'population': population})


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN-MANAGED RBAC — runtime enforcement (the PRIMARY per-user boundary).
#
# The runtime is the only enforcement point that sees the VERIFIED caller sub, so it does
# the real per-user gating: (1) which TOOLS the user may call, (2) which DESK they may
# operate, and (3) which OUTBOUND credential providers THIS AGENT workload may vend. The
# Gateway interceptor + Cedar are complementary platform backstops. entitlements.py is the
# single-sourced catalog + decision logic (copied into the tool Lambdas by deploy.sh).
#
# Reads are cached per short TTL so a busy multi-tool turn doesn't hammer DynamoDB, while a
# revoke still lands within seconds (matches the "instant" story; the WS push updates the UI
# even faster).
#
# FAIL-CLOSED semantics (security boundary):
#   • RBAC feature NOT deployed (no ENTITLEMENTS_TABLE) → allow. This is a config choice, not a
#     failure — the demo can run without the RBAC layer wired.
#   • GENUINELY UNMANAGED principal (table wired, query succeeded, principal has NO records) →
#     allow. This is the documented pre-seed / ad-hoc-user default (see entitlements.py).
#   • CANNOT EVALUATE (DDB exception, or table wired but catalog import failed) → DENY that
#     turn. A load failure is NOT "unmanaged" — treating it as unmanaged would fail OPEN, which
#     is exactly the hole. The error view is not cached, so a transient blip self-heals next turn.
# ─────────────────────────────────────────────────────────────────────────────
try:
    import entitlements as _ent
except Exception as _e:  # pragma: no cover — never let a catalog import break the agent
    _ent = None
    print(f'ENTITLEMENTS IMPORT WARN: {type(_e).__name__}: {_e}', flush=True)

_ENT_CACHE = {}            # principal -> (expires_at, effective_view)
_ENT_TTL = 8               # seconds; short enough that a revoke feels instant
# Sentinel view returned when entitlements CANNOT be evaluated → callers fail closed.
_ENT_ERROR_VIEW = {'managed': False, 'error': True, 'tools': {}, 'desks': {}, 'creds': {}}


def _rbac_active():
    """True when the RBAC layer is deployed (the entitlements table is wired). When False the
    feature simply isn't turned on and every principal is allowed (documented)."""
    return bool(ENTITLEMENTS_TABLE)


def _entitlements_client():
    return boto3.resource('dynamodb', region_name=REGION).Table(ENTITLEMENTS_TABLE)


def _effective_entitlements(principal):
    """Load + cache a principal's effective entitlement view.

    Returns a view dict with an added `error` flag: False for a real (possibly unmanaged) view,
    True when the load FAILED. A genuine 'no records' result is unmanaged (error=False) → allow;
    a DDB exception is error=True → callers fail closed. The error view is NOT cached."""
    if not (_ent and ENTITLEMENTS_TABLE and principal):
        return {'managed': False, 'error': False, 'tools': {}, 'desks': {}, 'creds': {}}
    now = time.time()
    hit = _ENT_CACHE.get(principal)
    if hit and hit[0] > now:
        return hit[1]
    try:
        from boto3.dynamodb.conditions import Key
        resp = _entitlements_client().query(
            KeyConditionExpression=Key('principal').eq(principal))
        items = {it['dataType']: it for it in resp.get('Items', [])}
        eff = _ent.evaluate(items, now=now)
        eff['error'] = False
    except Exception as e:
        print(f'ENTITLEMENTS LOAD ERROR {principal}: {type(e).__name__}: {e}', flush=True)
        # Cannot evaluate → FAIL CLOSED. Do NOT cache (so a transient DDB error denies only
        # this turn) and do NOT treat as unmanaged (that would fail open — the audited hole).
        return dict(_ENT_ERROR_VIEW)
    # Cap the cache lifetime to the SOONEST upcoming grant expiry, so a time-boxed grant is
    # never served as live past its expiry (the view was expiry-collapsed at `now`; caching it
    # verbatim for the full TTL would otherwise keep a grant that lapses mid-window). Lazy
    # expiry stays exact to the second; the sweeper just makes the UI reflect it live.
    cache_until = now + _ENT_TTL
    soonest = min((e for dim in eff.get('expiries', {}).values() for e in dim.values()), default=None)
    if soonest is not None:
        cache_until = min(cache_until, soonest)
    _ENT_CACHE[principal] = (cache_until, eff)
    return eff


def _tool_allowed(user_id, tool_name):
    """(allowed, scope) — whether `user_id` may call `tool_name`, considering BOTH the user's
    direct tool grant AND the agent workload's outbound credential grants (revoking a cred
    blocks its tools). Fails CLOSED (scope='error') when entitlements can't be evaluated."""
    # UNCONDITIONAL guard (runs BEFORE any RBAC-off early-return): an unauthenticated caller
    # ('anon' — no verified token) may NEVER reach a sensitive write/PII tool, even on a deploy
    # with the RBAC table unwired. Identity is verified upstream; anon means no verified sub.
    if (not user_id or user_id == 'anon') and tool_name in _ANON_FORBIDDEN_TOOLS:
        print(f'RBAC DENY(anon→sensitive) tool={tool_name}', flush=True)
        return False, 'anon'
    if not _rbac_active():
        # RBAC feature not deployed. Default: allow (documented demo posture). But if the deploy
        # opted into RBAC_REQUIRED, a governed tool with no table to authorize it fails CLOSED.
        if RBAC_REQUIRED and tool_name in (_ent.TOOL_CATALOG if _ent else {}):
            print(f'RBAC DENY(required-but-untabled) tool={tool_name}', flush=True)
            return False, 'error'
        return True, ''
    if not _ent:
        # Table is wired but the catalog failed to import — we cannot evaluate → fail closed.
        print('RBAC: entitlements table wired but catalog unavailable — failing closed', flush=True)
        return False, 'error'
    user_eff = _effective_entitlements(_ent.user_pk(user_id))
    if user_eff.get('error'):
        return False, 'error'
    if not _ent.allows(user_eff, 'tools', tool_name):
        return False, 'user'
    # Agent-side: if this tool's backing credential provider is revoked for the agent, block it.
    if AGENT_WORKLOAD_NAME:
        agent_eff = _effective_entitlements(_ent.agent_pk(AGENT_WORKLOAD_NAME))
        if agent_eff.get('error'):
            return False, 'error'
        if tool_name in _ent.tools_for_creds(agent_eff):
            return False, 'agent-credential'
    return True, ''


def _long_running_allowed(user_id):
    """True if `user_id` may use the ELEVATED long-running tier (kept-alive microVM, 2h/40-tool
    budgets on the async start/poll path). Gated behind LONG_RUNNING_ALLOWED_SUBS:
      • '*' (default) → any authenticated caller (preserves the "run for hours" demo).
      • else → only the listed verified subs; everyone else runs at the NORMAL tier (no
        hard-fail — the request still runs, just under the sub-290s budget).
    'anon' (unauthenticated) is never elevated unless '*' is set."""
    if '*' in LONG_RUNNING_ALLOWED_SUBS:
        return True
    return bool(user_id) and user_id != 'anon' and user_id in LONG_RUNNING_ALLOWED_SUBS


def _desk_allowed(user_id, persona_id):
    """(allowed, scope) — whether `user_id` may operate the given desk/persona. Fails CLOSED
    (scope='error') when entitlements can't be evaluated."""
    if not _rbac_active():
        return True, ''
    if not _ent:
        print('RBAC: entitlements table wired but catalog unavailable — failing closed (desk)', flush=True)
        return False, 'error'
    desk = (persona_id or 'capital_markets').strip().lower() or 'capital_markets'
    user_eff = _effective_entitlements(_ent.user_pk(user_id))
    if user_eff.get('error'):
        return False, 'error'
    return _ent.allows(user_eff, 'desks', desk), ''


def _blocked_agents_for(user_id, persona_id):
    """The set of within-desk roster keys `user_id` may NOT invoke on this desk (entitlements
    `agents` dimension). Empty when RBAC is off, the agents dimension is unmanaged (fail-open),
    or entitlements can't be evaluated — a per-AGENT gate must NEVER fail closed and blank the
    whole roster; the desk gate (_desk_allowed) is the hard wall, this only narrows within an
    already-granted desk."""
    if not (_rbac_active() and _ent):
        return set()
    user_eff = _effective_entitlements(_ent.user_pk(user_id))
    if user_eff.get('error') or not user_eff.get('agents_managed'):
        return set()
    return _ent.blocked_agents(user_eff, (persona_id or '').strip().lower())


def _blocked_tools_for(user_id):
    """The set of tool names to PROACTIVELY withhold from the agent's toolset (so it never wastes a
    model call attempting a tool it lacks). Combines the user's revoked tool grants with the tools
    whose backing agent credential is revoked. Mirrors _tool_allowed's two checks but returns the
    whole blocked SET for pre-filtering. Fails OPEN (returns empty) when RBAC is off or entitlements
    can't be evaluated — a pre-filter must never over-withhold and hide a tool the user actually
    has; the per-call _tool_allowed gate stays the authoritative fail-CLOSED backstop at execution."""
    if not (_rbac_active() and _ent):
        return set()
    user_eff = _effective_entitlements(_ent.user_pk(user_id))
    if user_eff.get('error'):
        return set()
    blocked = {name for name in _ent.TOOL_CATALOG if not _ent.allows(user_eff, 'tools', name)}
    if AGENT_WORKLOAD_NAME:
        agent_eff = _effective_entitlements(_ent.agent_pk(AGENT_WORKLOAD_NAME))
        if not agent_eff.get('error'):
            blocked |= set(_ent.tools_for_creds(agent_eff))
    return blocked


def _denied_result(tool_name, scope):
    """The uniform denial payload. Shaped like the existing Cedar `blocked_by_policy` result so
    the frontend renders a denied tool call as a visible 'blocked' chip in the AG-UI timeline —
    the whole point of the demo. `scope` distinguishes a user-tool revoke from an
    agent-credential revoke for a precise, honest message."""
    label = (_ent.TOOL_CATALOG.get(tool_name, {}) or {}).get('label', tool_name) if _ent else tool_name
    if scope == 'anon':
        msg = (f"Access denied: the '{label}' tool handles trades / positions / secrets and cannot "
               f"be used without a verified signed-in identity. Please sign in and try again.")
    elif scope == 'agent-credential':
        msg = (f"Access denied: the '{label}' tool's outbound credential is revoked for this "
               f"agent by the AgentCore Identity admin. The agent cannot obtain the token to call it.")
    elif scope == 'error':
        # FAIL-CLOSED: entitlements could not be evaluated (transient DDB error / catalog
        # unavailable). Deny this turn rather than risk allowing an ungoverned call.
        msg = (f"Access to the '{label}' tool is temporarily blocked: the access-control service "
               f"could not be reached to verify your entitlements. Please retry in a moment.")
    else:
        msg = (f"Access denied by AgentCore access control: you are not granted the '{label}' tool. "
               f"Ask your administrator to grant it in the Access Control console.")
    return {'error': msg, 'blocked_by_policy': True, 'access_denied': True,
            'tool': tool_name, 'scope': scope}


async def execute_tool(tool_use, user_id, user_jwt='', force_reauth=False):
    name = tool_use['name']
    inp = tool_use['input']
    # ── RBAC gate (runtime, per-user) ─────────────────────────────────────────
    # Single choke point: EVERY governed tool call funnels through here, so this one
    # check enforces the user's tool grant + the agent's outbound-credential grant for
    # all engines (swarm/graph/converse) and all desks. handoff_to_agent and other
    # non-catalog control tools are never in TOOL_CATALOG, so they pass untouched.
    allowed, scope = _tool_allowed(user_id, name)
    if not allowed:
        print(f'RBAC DENY tool={name} user={user_id} scope={scope}', flush=True)
        _audit('rbac_deny', sub=user_id, tool=name, scope=scope, decision='deny')
        return _denied_result(name, scope)
    # Security-relevant tool invocation (post-gate = allowed). Trade/vault are flagged for
    # extra scrutiny in the audit trail; the input is intentionally NOT logged verbatim.
    _audit('tool_invoke', sub=user_id, tool=name, decision='allow',
           sensitive=name in ('trade_execute', 'secure_vault'))
    # Bind the verified principal for any Gateway call this tool makes, so the Gateway
    # REQUEST interceptor can enforce per-user access at the MCP boundary too (defense in depth).
    if _ent and user_id:
        _CURRENT_PRINCIPAL.set(_ent.user_pk(user_id))
    # Also (re)bind this tool call's user JWT here — the SAME proven contextvar pattern as
    # _CURRENT_PRINCIPAL, right next to it — so call_gateway_tool authenticates to the JWT-inbound
    # Gateway as the end user even if the engine ran the tool on a context that didn't inherit the
    # value set at the top of process_message_events. (contextvars copy across asyncio.to_thread.)
    if user_jwt:
        _CURRENT_USER_JWT.set(user_jwt)
    try:
        if name in ('bond_screen', 'curve_lookup', 'spread_lookup', 'price_bond', 'portfolio_risk'):
            # Stateless FI data/analytics tools — routed through AgentCore Gateway (governed
            # MCP), the same policy-enforced path as the vault/user-data tools.
            return await asyncio.to_thread(_invoke_bond_tool, name, inp)
        # Per-vertical governed tools (insurance/banking/fintech) + the identity-governed
        # positions-db: personas.py maps each tool name → its Gateway target; route through the
        # SAME governed MCP path as the bond tools.
        import personas
        _target = personas.VERTICAL_TOOL_TARGET.get(name)
        if _target:
            if name == 'query_holdings':
                # Identity → data scope. Inject the VERIFIED caller sub (clobbering any model value),
                # exactly like user_data_lookup below. The DB's RLS/column masking key off this. The
                # Gateway interceptor ALSO re-asserts it from the verified principal (defense in depth),
                # so a spoofed value can never widen access even on a direct Gateway call.
                inp['principal_sub'] = user_id
            return await asyncio.to_thread(_invoke_gateway_tool, _target, name, inp)
        if name == 'evolve_portfolio':
            return await _evolve_portfolio_tool(inp)
        if name == 'positions_view':
            # AgentCore Identity 3LO: vend a user-delegated token (raises
            # AuthRequiredException with the consent URL on first use).
            return await _positions_view_tool(inp.get('fund_name', 'all'), user_id, user_jwt, force_reauth)
        elif name == 'trade_execute':
            # Audit the WRITE action (fund/ticker/side are not secrets; target amount omitted).
            _audit('trade_execute', sub=user_id, fund=inp.get('fund_name', ''),
                   ticker=inp.get('ticker', ''), side=inp.get('side', ''), decision='submit')
            return await _trade_execute_tool(inp.get('fund_name', ''), inp.get('ticker', ''), inp.get('side', ''), inp.get('target_allocation', ''), user_id, user_jwt, force_reauth)
        elif name == 'secure_vault':
            # Intentionally NO direct-Lambda fallback. If the Cedar policy blocks
            # the gateway, the agent must be unable to retrieve the secret — that
            # is the whole point of the policy demo.
            _audit('vault_access', sub=user_id, secret=inp.get('secret_name', ''), decision='request')
            result = call_gateway_tool('secure-vault___secure_vault', inp)
            if 'body' in result:
                return json.loads(result['body'])
            return result
        elif name == 'user_data_lookup':
            inp['user_id'] = user_id
            result = call_gateway_tool('user-data-lookup___user_data_lookup', inp)
            # If policy blocks gateway, fall back to direct Lambda call (env-suffixed name).
            if 'error' in result and 'policy' in str(result['error']).lower():
                lam = boto3.client('lambda', region_name=REGION)
                resp = lam.invoke(FunctionName=USERDATA_LAMBDA_ARN, Payload=json.dumps(inp).encode())
                result = json.loads(resp['Payload'].read().decode())
            if 'body' in result:
                return json.loads(result['body'])
            return result
        elif name == 'web_browser':
            if not BROWSER_ID:
                return {'error': 'Browser not configured (BROWSER_ID unset)', 'source': 'AgentCore Browser'}
            url = inp.get('url', '')
            # SSRF guard: https-only + block private/loopback/link-local/metadata hosts (and
            # apply the optional host allow-list). The URL is model-chosen, so this MUST run
            # before any fetch — a blocked URL returns a clean tool error, never a request.
            ok, reason = _validate_browse_url(url)
            if not ok:
                _audit('browser_blocked', sub=user_id, url=url, reason=reason, decision='deny')
                return {'url': url, 'error': f'Blocked URL: {reason}', 'source': 'AgentCore Browser'}
            try:
                # Playwright's SYNC API cannot run inside the asyncio event loop the
                # SDK runs the entrypoint on, so do all the blocking browser work in
                # a worker thread via asyncio.to_thread.
                return await asyncio.to_thread(_browse_sync, url)
            except Exception as e:
                return {'url': url, 'error': f'Browser error: {_safe_error(e, "web_browser")}',
                        'source': 'AgentCore Browser'}
        elif name == 'code_interpreter':
            if not CODE_INTERPRETER_ID:
                return {'error': 'Code Interpreter not configured (CODE_INTERPRETER_ID unset)', 'source': 'AgentCore Code Interpreter'}
            code = inp.get('code', '')
            try:
                # The AgentCore Code Interpreter SANDBOX is the SOLE executor. There is
                # deliberately NO local exec() fallback: running model-generated Python
                # in-process would defeat the sandbox's isolation (no resource limits, no
                # network restrictions, full container privileges) — a remote-code-execution
                # hole. If the sandbox is unavailable we FAIL CLOSED (see except below).
                with code_session(REGION, identifier=CODE_INTERPRETER_ID) as ci:
                    result = ci.execute_code(code)
                    # Parse streaming response
                    output = ''
                    stream = result.get('stream')
                    if stream:
                        for event in stream:
                            if 'result' in event:
                                content = event['result'].get('content', [])
                                for item in content:
                                    if isinstance(item, dict) and 'text' in item:
                                        output += item['text']
                                structured = event['result'].get('structuredContent', {})
                                if not output and structured.get('stdout'):
                                    output = structured['stdout']
                    return {'output': output[:3000] if output else 'Code executed (no output)', 'source': 'AgentCore Code Interpreter'}
            except Exception as e:
                # FAIL CLOSED: code execution is DISABLED when the sandbox is unavailable —
                # we do NOT run arbitrary code in-process. Log detail server-side; return a
                # clear, generic user-facing message.
                print(f'CODE INTERPRETER UNAVAILABLE: {_redact(f"{type(e).__name__}: {e}")}', flush=True)
                _audit('code_interpreter_unavailable', sub=user_id, decision='fail_closed')
                return {'error': 'Code Interpreter sandbox unavailable — code execution is disabled.',
                        'source': 'AgentCore Code Interpreter'}
        elif name == 'market_data':
            # AgentCore Identity M2M (client_credentials): the agent authenticates as
            # the FIRM's application, not a user. No consent, never raises AuthRequired.
            if not MARKETDATA_API_URL:
                return {'error': 'Market-data vendor not configured (MARKETDATA_API_URL unset)', 'source': 'AgentCore Identity M2M'}
            try:
                return await _market_data_tool(inp.get('dataset', 'curve'))
            except Exception as e:
                return {'error': f'M2M market-data call failed: {type(e).__name__}: {e}', 'source': 'AgentCore Identity M2M'}
        elif name == 'macro_indicator':
            # AgentCore Identity API-key vault: the FRED key is fetched at call time,
            # never held as a plaintext credential in the agent.
            try:
                return await _macro_indicator_tool(inp.get('indicator', 'CPI'))
            except Exception as e:
                return {'error': f'FRED api-key call failed: {type(e).__name__}: {e}', 'source': 'AgentCore Identity API-key vault'}
    except AuthRequiredException:
        # Propagate so the entrypoint can surface the consent URL to the user.
        raise
    except Exception as e:
        # Sanitize: generic message to the client, full (redacted) detail to server logs.
        return {'error': _safe_error(e, f'tool:{name}')}
    return {'error': f'Unknown tool: {name}'}


def _tier_identity_line(pctx=None):
    """Describe the multi-model swarm tier for the model-identity prompt, grouped by model
    and built straight from the ACTIVE persona's roster so it never drifts from the real
    assignment. pctx is the compiled persona context (personas.compile_persona)."""
    try:
        if pctx is None:
            import personas
            pctx = personas.compile_persona(personas.DEFAULT_PERSONA)
        firm = pctx.get('firm_name', 'the firm')
        by_model = {}
        for spec in pctx['roster'].values():
            name = _model_display_name(_resolve_model(spec.get('model')))
            by_model.setdefault(name, []).append(spec['name'])
        parts = [f"{model} ({', '.join(agents)})" for model, agents in by_model.items()]
        return (
            "This request is handled by a multi-agent swarm on tiered models (via Amazon "
            "Bedrock on AgentCore Runtime): " + '; '.join(parts) + ". If asked which model "
            f"or LLM you are, explain that {firm} routes each specialist to a model matched "
            "to its task — and name the model YOU (this agent) are running on, stated below."
        )
    except Exception:
        # Never let identity composition break a turn; fall back to the flagship.
        return (f"You are currently running on the **{_model_display_name(AUTO_PRIMARY_MODEL)}** "
                "model (via Amazon Bedrock on AgentCore Runtime).")


def _persona_system_prompt(pctx):
    """Compose the base system prompt for the ACTIVE persona. The tool inventory + output
    discipline are shared platform behavior (same AgentCore primitives every desk); only the
    firm framing and the user's title change per vertical. Falls back to the verbatim
    fixed-income SYSTEM_PROMPT for the capital-markets desk so its behavior is unchanged."""
    if not pctx or pctx.get('id') == 'capital_markets':
        return SYSTEM_PROMPT
    firm = pctx.get('firm_name', 'the firm')
    kind = pctx.get('firm_kind', 'a financial-services firm')
    title = pctx.get('user_title', 'user')
    # Reuse the shared tool/output guidance from SYSTEM_PROMPT verbatim (from the first tool
    # bullet onward), only swapping the firm/user framing in the opening paragraph.
    tail = SYSTEM_PROMPT.split('You have access to several tools:', 1)[1]
    return (
        f"You are an AI assistant for {title}s at {firm}, {kind}, built on Amazon Bedrock "
        f"AgentCore. The signed-in user is a {title}. You have access to several tools:"
        f"{tail}"
    )


# ── AgentCore Optimization: A/B experiment variant assignment (default OFF) ──────────────────
_OPT_TREATMENT_PROMPT_CACHE = {}  # bundle version id → system-prompt override text (cache per microVM)


def _experiment_variant(session_id):
    """Return 'control' or 'treatment' for this session. When the experiment flag is OFF (the
    default), ALWAYS 'control' — the live path is unchanged. When ON, split deterministically by
    session_id hash so a session stays on one arm (50/50). Requires a treatment bundle to exist."""
    if OPT_EXPERIMENT_FLAG != 'on' or not OPT_TREATMENT_BUNDLE_ID:
        return 'control'
    import hashlib
    h = hashlib.sha256((session_id or '').encode()).hexdigest()
    return 'treatment' if (int(h[:8], 16) % 2 == 0) else 'control'


def _treatment_prompt():
    """Fetch the treatment configuration bundle's system-prompt override (cached per microVM).
    Returns '' on any failure so a bundle problem NEVER breaks a turn — it just falls back to the
    control prompt (fail-safe: the experiment can only improve, never break, the live path)."""
    if not OPT_TREATMENT_BUNDLE_ID:
        return ''
    if OPT_TREATMENT_BUNDLE_ID in _OPT_TREATMENT_PROMPT_CACHE:
        return _OPT_TREATMENT_PROMPT_CACHE[OPT_TREATMENT_BUNDLE_ID]
    text = ''
    try:
        cc = boto3.client('bedrock-agentcore-control', region_name=REGION)
        b = cc.get_configuration_bundle(bundleId=OPT_TREATMENT_BUNDLE_ID)
        # Bundle components are freeform; pull a system-prompt component defensively.
        comps = b.get('components', {}) or {}
        for _, comp in comps.items():
            cfg = (comp or {}).get('configuration', {}) or {}
            cand = cfg.get('systemPrompt') or cfg.get('system_prompt') or cfg.get('text')
            if isinstance(cand, str) and cand.strip():
                text = cand.strip()
                break
    except Exception as e:
        print(f'OPT treatment bundle fetch failed (falling back to control): {type(e).__name__}: {e}', flush=True)
        text = ''
    _OPT_TREATMENT_PROMPT_CACHE[OPT_TREATMENT_BUNDLE_ID] = text
    return text


def _compose_system(message, user_id, user_email, model_id, model_key='', pctx=None, session_id=''):
    """Build the full system prompt: base + live model identity + user + long-term memory.
    Shared by both engines so the agent's behavior/identity is identical across them. `pctx`
    selects the persona's firm framing (defaults to the fixed-income desk).

    AgentCore Optimization A/B (default OFF): when an experiment is running and this session is
    assigned to the treatment arm, the treatment bundle's system-prompt override is appended and
    a `variant` marker is tagged for the online-eval split. OFF → control → unchanged behavior."""
    system = _persona_system_prompt(pctx)
    # Tell the model which model it actually is, so it can answer accurately when
    # asked (it cannot reliably know this on its own). In Auto mode the swarm runs a
    # per-agent tier, so we describe the tier here and swarm_strands appends each agent's
    # own precise model; otherwise it's the single live selection.
    if _is_auto(model_key):
        system += "\n\n" + _tier_identity_line(pctx)
    else:
        system += f"\n\nYou are currently running on the **{_model_display_name(model_id)}** model (via Amazon Bedrock on AgentCore Runtime). If asked which model or LLM you are, state this exactly."
    if user_email:
        system += f"\n\nCurrent user: {user_email} (ID: {user_id})"

    # If admin RBAC has withheld tools/specialists from THIS user, tell the model plainly so it
    # explains the access boundary instead of hunting for a tool that isn't in its set. The tools
    # are already removed from every specialist's toolset (personas.scope_tools) and the revoked
    # specialists pruned from the roster (prune_roster) — this is the honest, user-facing framing.
    if pctx:
        withheld_tools = pctx.get('pruned_tools') or []
        withheld_specialists = pctx.get('pruned_agent_names') or []
        if withheld_tools or withheld_specialists:
            note = ("\n\n=== ACCESS BOUNDARY (admin-governed) ===\n"
                    "The following are NOT available to this user on this desk under AgentCore "
                    "access control. Do NOT attempt them; if the request needs one, say plainly "
                    "that it's not in the user's granted access and to request it in the Access "
                    "Control console — do NOT fabricate a result.")
            if withheld_tools:
                labels = ', '.join((_ent.TOOL_CATALOG.get(t, {}) or {}).get('label', t)
                                   if _ent else t for t in withheld_tools)
                note += f"\n- Withheld tools: {labels}"
            if withheld_specialists:
                note += f"\n- Withheld specialists: {', '.join(withheld_specialists)}"
            system += note

    # Retrieve long-term memory using MemoryClient SDK
    if MEMORY_ID:
        try:
            records = _memory_client.retrieve_memories(
                memory_id=MEMORY_ID,
                namespace=f'user/{user_id}',
                query=message,
                top_k=5)
            if records:
                ctx = '\n'.join(r.get('content', {}).get('text', '') for r in records if r.get('content'))
                if ctx:
                    system += f"\n\nLong-term memory about this user:\n{ctx}"
        except Exception as e:
            print(f"MEMORY RETRIEVE ERROR: {type(e).__name__}: {e}", flush=True)

    # AgentCore Optimization A/B (default OFF): apply the treatment prompt only when this session
    # is assigned to the treatment arm AND the treatment bundle actually yielded an override.
    variant = _experiment_variant(session_id)
    if variant == 'treatment':
        override = _treatment_prompt()
        if override:
            system += f"\n\n[Optimization treatment variant]\n{override}"
            print(f'OPT variant=treatment session={session_id[:12]} applied treatment prompt', flush=True)
        else:
            variant = 'control'  # bundle unavailable → fail safe to control
    return system


def _store_memory_async(message, final, user_id, session_id):
    """Store the turn in long-term memory off the hot path (shared by both engines)."""
    if not (MEMORY_ID and final):
        return
    def _store():
        try:
            _memory_client.create_event(
                memory_id=MEMORY_ID,
                actor_id=user_id,
                session_id=session_id or f'session-{user_id}',
                messages=[(message, 'USER'), (final, 'ASSISTANT')])
        except Exception as e:
            print(f"MEMORY ERROR: {type(e).__name__}: {e}", flush=True)
    threading.Thread(target=_store, args=()).start()


async def process_message_events(message, user_id, user_email, session_id, user_jwt='', model_key='', force_reauth=False, topology='', long_running=False, persona=''):
    """Dispatch one turn to the selected orchestration ARCHITECTURE and YIELD AG-UI events.
    Both architectures emit the SAME wire-form events (the frozen agentClient.ts contract);
    the caller (invoke) wraps them with RunStarted/RunFinished.

    Two Strands multi-agent ARCHITECTURES over the ACTIVE persona's specialists + tools,
    chosen per request by `topology` (from the sidebar):
      - 'graph'          → strands.multiagent.Graph: a deterministic DAG (parallel fan-out/
                           fan-in, converging on the committee sink).
      - 'swarm'/default  → strands.multiagent.Swarm: emergent, LLM-routed hand-offs.

    `persona` (from the login picker, e.g. 'insurance'/'banking'/'fintech', default the
    capital-markets fixed-income desk) selects the DESK — roster, prompts, tools, graph — via
    personas.compile_persona. One container image serves every vertical; only the desk swaps.

    long_running (set only on the async background-job path) lifts the engine wall-clock
    budgets toward the 8h microVM ceiling; the synchronous path leaves it False so the run
    stays under the WS bridge's 290s read timeout and ends gracefully."""
    # Bind the caller's verified JWT + session for this turn so call_gateway_tool can present it
    # as the END-USER Bearer to the CUSTOM_JWT-inbound Gateway. ContextVars (not globals) so
    # concurrent turns on the shared loop never cross tokens. Also seed the session-token map with
    # the turn's token (poll refreshes it later for long-running turns — see invoke()).
    _CURRENT_USER_JWT.set(user_jwt or '')
    _CURRENT_SESSION.set(session_id or '')
    if session_id and user_jwt:
        _SESSION_JWT[session_id] = user_jwt
    import personas
    pctx = personas.compile_persona(persona)

    # ── Content guardrail (runtime, INBOUND prompt) ───────────────────────────
    # Scan the user prompt for secrets/PII BEFORE the model or any tool sees it. A secret (e.g. a
    # pasted AWS key), SSN, or card number BLOCKS the turn; PII (email/phone/name) is MASKED so it
    # never reaches the model or a downstream tool. (scan_prompt uses Bedrock source='OUTPUT', which
    # is the mode that performs PII ANONYMIZE masking in addition to blocking — see guardrail.py.)
    # Fail-open (a guardrail outage never blocks a turn — it's a safety augmentation, not the authz
    # boundary). A block/mask is audited. `message` is rewritten to the sanitized text so the rest of
    # the turn runs on the masked prompt.
    try:
        import guardrail as _gr
    except Exception:
        _gr = None
    if _gr and _gr.enabled():
        _v = _gr.scan_prompt(message or '')
        if _v.enforced and (not _v.passed or _v.masked):
            _audit('guardrail', sub=user_id, direction='input', action=_v.action,
                   blocked=(not _v.passed), masked=_v.masked, reasons=','.join(_v.reasons))
        if not _v.passed:
            _mid = _uuid.uuid4().hex
            # Emit a machine-readable sentinel so the chat UI can render a proper "content firewall"
            # card (icon, tripped policies) instead of a bare bold line — mirrors the __tool marker
            # convention. The frontend parses the JSON after the sentinel and falls back to showing
            # `message` verbatim if anything about the marker is unexpected (never throws).
            _payload = json.dumps({
                'message': _v.message,
                'reasons': list(_v.reasons or []),
                'action': _v.action,
            })
            yield _ev(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=_mid, role='assistant'))
            yield _ev(TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id=_mid,
                delta=f"⟦AGENTCORE_GUARDRAIL_BLOCK⟧{_payload}"))
            yield _ev(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=_mid))
            return
        message = _v.text  # run the rest of the turn on the (possibly PII-masked) prompt

    # ── RBAC gate (runtime, per-user DESK) ────────────────────────────────────
    # Enforce the user's desk grant BEFORE running the desk. A revoked desk short-circuits
    # the turn with a single assistant message (rendered as a normal answer), so a user who
    # loses e.g. the Banking desk can't operate it even by selecting it at login. The tool
    # gate above is the second line of defense within an allowed desk.
    desk_ok, desk_scope = _desk_allowed(user_id, pctx.get('id'))
    if not desk_ok:
        desk_label = (_ent.DESK_CATALOG.get(pctx.get('id'), {}) or {}).get('label', pctx.get('id')) if _ent else pctx.get('id')
        _audit('rbac_deny', sub=user_id, desk=pctx.get('id'), scope=desk_scope, decision='deny')
        if desk_scope == 'error':
            # FAIL-CLOSED: entitlements unavailable — deny the desk this turn with a retry hint.
            _delta = (f"**Access temporarily blocked.** The access-control service could not be "
                      f"reached to verify your access to the **{desk_label}** desk. Please retry "
                      f"in a moment.")
        else:
            _delta = (f"**Access denied by AgentCore access control.** You are not granted the "
                      f"**{desk_label}** desk. Ask your administrator to grant desk access in the "
                      f"Access Control console.")
        _mid = _uuid.uuid4().hex
        yield _ev(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=_mid, role='assistant'))
        yield _ev(TextMessageContentEvent(
            type=EventType.TEXT_MESSAGE_CONTENT, message_id=_mid, delta=_delta))
        yield _ev(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=_mid))
        return

    # ── RBAC gate (runtime, per-AGENT / specialist) ───────────────────────────
    # Within an ALLOWED desk, narrow the roster to the specialists this user may invoke. Revoked
    # specialists are pruned out (edge-contracted from the graph so the entry→sink path stays
    # intact) BEFORE either engine builds, so a revoked specialist is never instantiated and can
    # never be a handoff target. This NEVER blanks the desk: the entry (Lead Coordinator) and
    # sink (Committee) are structural and unrevocable, and the gate fails open (see
    # _blocked_agents_for). The swarm additionally denies a handoff to a pruned name.
    _blocked = _blocked_agents_for(user_id, pctx.get('id'))
    if _blocked:
        import personas as _p
        pctx = _p.prune_roster(pctx, _blocked)
        _audit('rbac_scope_agents', sub=user_id, desk=pctx.get('id'),
               withheld=','.join(pctx.get('pruned_agents', [])), decision='scope')

    # ── RBAC gate (runtime, per-TOOL — PROACTIVE) ─────────────────────────────
    # Remove the tools this user isn't entitled to from every specialist's toolset BEFORE the
    # engines build, so the model is never offered — and never wastes a call attempting — a tool
    # it can't use. The per-call _tool_allowed gate inside execute_tool stays the authoritative
    # fail-CLOSED backstop; this pre-filter fails OPEN (never over-withholds). A withheld tool is
    # noted in the system prompt so the agent explains what it lacks instead of silently failing.
    _blocked_tools = _blocked_tools_for(user_id)
    if _blocked_tools:
        import personas as _p
        pctx = _p.scope_tools(pctx, _blocked_tools)
        if pctx.get('pruned_tools'):
            _audit('rbac_scope_tools', sub=user_id, desk=pctx.get('id'),
                   withheld=','.join(pctx.get('pruned_tools', [])), decision='scope')

    model_id = _resolve_model(model_key)
    system = _compose_system(message, user_id, user_email, model_id, model_key, pctx=pctx, session_id=session_id)

    # ── Strands SDK engines ────────────────────────────────────────────────────
    # The real Strands Agent + multiagent.{Swarm,Graph} drives the loop; the engine module
    # translates the SDK's typed stream events into our AG-UI frames (preserving the
    # __handoff/__agent/__graph/__tool keys). 3LO consent rides a shared auth-holder (Strands
    # swallows tool exceptions), surfaced as the auth_required CUSTOM event by the module.
    topo = (topology or 'swarm').strip().lower()

    # Short-term continuity: the engine runs fresh each turn, so hand it the recent
    # transcript (so a reply like "3" resolves against the menu just offered). Snapshot
    # BEFORE appending this user turn so history = strictly-prior exchanges.
    history = _recent_history(session_id)
    _append_history(session_id, 'user', message)

    committed = {'final': None}

    # Passed by reference as the engines' on_final= callback (below) and invoked by both
    # swarm_strands/graph_strands to commit the final answer; `committed` is read after the
    # run to append history + store memory. Not dead code — the linter can't see the callback.
    def _on_final(final_text):  # nosemgrep  (useless-inner-function: used as the engines' on_final= callback)
        committed['final'] = final_text

    # Both engines share the identical signature (model tier, 3LO identity, tool dispatcher,
    # history, on_final, persona_ctx). In Auto mode each agent runs its own tier; otherwise
    # all share model_id. Hand over the resolver so tier short-keys map to Bedrock ids.
    if topo == 'graph':
        import graph_strands
        run_events = graph_strands.run_graph_events
    else:
        import swarm_strands
        run_events = swarm_strands.run_swarm_events

    async for e in run_events(
            message=message, base_system=system, model_id=model_id,
            user_id=user_id, user_jwt=user_jwt, force_reauth=force_reauth,
            execute_tool=execute_tool, on_final=_on_final, history=history,
            auto_tier=_is_auto(model_key), model_resolver=_resolve_model,
            long_running=long_running, persona_ctx=pctx):
        yield e

    # On a completed answer (on_final fires only when NOT halted for consent): add the
    # assistant turn to short-term history AND persist to long-term AgentCore Memory.
    if committed['final'] is not None:
        _append_history(session_id, 'assistant', committed['final'])
        _store_memory_async(message, committed['final'], user_id, session_id)


# ── Cognito JWKS verification (the runtime's OWN identity trust boundary) ──────
# AgentCore validates the inbound bearer token at the customJWTAuthorizer, but does NOT
# forward the Authorization header into the container — so the runtime cannot rely on it.
# The bridge/websocket Lambdas therefore pass the SAME Cognito access token in-band as
# `user_token`. Before the RBAC layer, identity was cosmetic; now it is a SECURITY BOUNDARY,
# so we must VERIFY that in-band token's RS256 signature (issuer, client, expiry) against the
# pool's JWKS and take the sub from the verified claims — NOT from a self-asserted payload
# `user_id`, which any caller could set to impersonate another user. JWKS is cached per key id.
# The cache carries a TTL so a rotated signing key is picked up within _JWKS_TTL even if its kid
# were ever reused, and stale key objects don't live for the microVM's whole lifetime. A cache
# MISS (unknown kid) always forces a refetch too, so a brand-new kid is honored immediately.
_JWKS_CACHE = {}
_JWKS_FETCHED_AT = 0.0
_JWKS_TTL = 3600  # seconds; Cognito rotates infrequently, so an hour is ample.


def _cognito_public_key(token):
    """Return the RSA public key for `token`'s kid from the pool's JWKS (cached with a TTL)."""
    from jwt import algorithms
    global _JWKS_FETCHED_AT
    kid = jwt.get_unverified_header(token).get('kid', '')
    if not kid:
        raise ValueError('token has no kid')
    stale = (time.time() - _JWKS_FETCHED_AT) > _JWKS_TTL
    if kid not in _JWKS_CACHE or stale:
        url = f'https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json'
        with urllib.request.urlopen(_assert_https(url), timeout=5) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
            jwks = json.loads(resp.read().decode())
        for k in jwks.get('keys', []):
            _JWKS_CACHE[k['kid']] = algorithms.RSAAlgorithm.from_jwk(json.dumps(k))
        _JWKS_FETCHED_AT = time.time()
    if kid not in _JWKS_CACHE:
        raise ValueError(f'kid {kid} not in JWKS')
    return _JWKS_CACHE[kid]


def _verify_cognito_token(token, expected_token_use='access'):
    """Verify a Cognito token's signature + issuer + expiry + client binding + token_use and
    return its claims, or None if verification fails. This is the runtime's authoritative
    identity check — a forged, swapped, or wrong-type token is rejected here.

    FAIL-CLOSED on missing config: identity is a security boundary, so if the pool id OR the
    app client id is not configured we refuse to verify rather than skipping the client-binding
    check (an unbound token would otherwise be accepted from any client)."""
    if not (token and USER_POOL_ID and USER_POOL_CLIENT_ID):
        if token:
            print('IDENTITY VERIFY SKIPPED: USER_POOL_ID/USER_POOL_CLIENT_ID not configured '
                  '(failing closed)', flush=True)
        return None
    try:
        key = _cognito_public_key(token)
        issuer = f'https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}'
        # Cognito ACCESS tokens have no `aud` (they carry `client_id`); ID tokens carry `aud`.
        # We verify signature+iss+exp here and enforce the client binding + token_use manually
        # below so the one function handles both token shapes on the invoke path.
        claims = jwt.decode(token, key, algorithms=['RS256'], issuer=issuer,
                            options={'verify_aud': False})
        # Client binding (now REQUIRED — see fail-closed guard above).
        cid = claims.get('client_id') or claims.get('aud')
        if cid != USER_POOL_CLIENT_ID:
            print(f'IDENTITY: token client mismatch ({cid})', flush=True)
            return None
        # token_use binding: the invoke path replays the ACCESS token, so require it (defends
        # against an id-token or a refresh token being presented in its place).
        if expected_token_use:
            tu = claims.get('token_use')
            if tu != expected_token_use:
                print(f'IDENTITY: unexpected token_use ({tu}, wanted {expected_token_use})', flush=True)
                return None
        return claims
    except Exception as e:
        print(f'IDENTITY VERIFY FAILED: {type(e).__name__}: {e}', flush=True)
        return None


def _identity_from_context(context, payload):
    """Resolve the caller's identity from a CRYPTOGRAPHICALLY VERIFIED token.

    Order of trust:
      1) A forwarded Authorization header (future-proof: if AgentCore ever forwards it).
      2) The in-band `user_token` (how the bridge/WS Lambdas actually deliver it today),
         VERIFIED against Cognito JWKS.
    Identity comes ONLY from verified claims. A supplied-but-invalid token yields 'anon', and
    NO token yields 'anon' too — we NEVER trust a self-asserted payload['user_id'], so a caller
    cannot impersonate another user by setting that field. 'anon' is an unmanaged principal
    (entitlements default-allow), which is the correct posture for an unauthenticated caller —
    it can never be a specific managed user without a verified token for that sub."""
    headers = getattr(context, 'request_headers', None) or {}
    auth = headers.get('Authorization') or headers.get('authorization') or ''
    header_tok = auth[7:] if auth.lower().startswith('bearer ') else auth
    body_tok = payload.get('user_token', '') or ''

    for token in (header_tok, body_tok):
        if not token:
            continue
        claims = _verify_cognito_token(token)
        if claims and claims.get('sub'):
            email = claims.get('email') or claims.get('username') or claims.get('cognito:username', '')
            _audit('identity_verified', sub=claims['sub'])
            return claims['sub'], email
        # A token WAS supplied but failed verification → do NOT fall through to a
        # self-asserted user_id (that would be the impersonation hole). Deny identity.
        _audit('identity_rejected', reason='token_present_but_unverified')
        return 'anon', ''

    # No token at all (local dev / SigV4 probes). Identity is unauthenticated — we do NOT read
    # payload['user_id'] (self-asserted, forgeable). Treat as the anonymous principal.
    _audit('identity_anonymous', reason='no_token')
    return 'anon', ''


# ─────────────────────────────────────────────────────────────────────────────
# ASYNC LONG-RUNNING JOBS  (the "run autonomously for hours" pattern)
#
# A SYNCHRONOUS invoke is hard-capped at 15 min — by BOTH the AgentCore request timeout
# and the WebSocket Lambda's own AWS-Lambda ceiling. AgentCore's documented way to exceed
# that is the BACKGROUND-TASK pattern (runtime keeps the session's microVM alive up to 8h
# while the agent reports HealthyBusy on /ping):
#   • action='start' → register an @async_task (flips /ping to HealthyBusy → the microVM
#                      is kept ALIVE), launch the swarm/graph run on the worker event loop,
#                      BUFFER every AG-UI event, and RETURN immediately.
#   • action='poll'  → re-invoked on the SAME runtimeSessionId, so the runtime routes it to
#                      the SAME sticky microVM; it drains buffered events since the client's
#                      cursor and reports running/done.
# The buffer lives in module memory, shared across start/poll purely via microVM stickiness
# (start & poll carry the identical 48-char session id, so they land on one microVM). It is
# correct within one ≤8h microVM; if the microVM recycles the job reports 'unknown' and the
# client restarts — acceptable for the 1–2h target (no external store, per design).
#
# Concurrency: the SDK runs EVERY handler invocation and the background task on ONE dedicated
# worker event loop, so the runner's buffer-append and a poll's buffer-read interleave only at
# await points on a single thread — no locks needed. Polls are idempotent: the client sends the
# cursor it has consumed and we return events[cursor:], so a dropped WS frame loses nothing.
# ─────────────────────────────────────────────────────────────────────────────
_JOBS = {}                 # session_id -> job dict {events, state, updated, task, ...}
_JOB_TTL = 8 * 3600        # reap finished jobs after 8h (matches max microVM lifetime)


def _gc_jobs():
    """Drop old FINISHED jobs so a long-lived microVM doesn't accumulate event buffers.
    Also drop the reaped sessions' cached Gateway tokens so _SESSION_JWT can't grow unbounded."""
    now = time.time()
    for sid in [s for s, j in _JOBS.items()
                if j['state'] != 'running' and now - j['updated'] > _JOB_TTL]:
        _JOBS.pop(sid, None)
        _SESSION_JWT.pop(sid, None)


async def _run_job(job, message, user_id, user_email, session_id, user_jwt, model_key,
                   force_reauth, topology, thread_id, run_id, persona='', long_running=True):
    """Background driver: run ONE full turn and BUFFER every AG-UI event (RUN_STARTED …
    RUN_FINISHED) into job['events'] for polls to drain. Wrapped in add/complete_async_task
    so /ping stays HealthyBusy for the whole run — that is what keeps the microVM alive past
    15 min. The buffered stream is a complete, self-contained AG-UI run (same envelope the
    synchronous path emits), so the frontend renders it identically."""
    task_id = app.add_async_task('desk_run', {'session': session_id})
    try:
        job['events'].append(_ev(RunStartedEvent(
            type=EventType.RUN_STARTED, thread_id=thread_id, run_id=run_id)))
        try:
            async for event in process_message_events(
                    message, user_id, user_email, session_id, user_jwt,
                    model_key, force_reauth, topology, long_running=long_running, persona=persona):
                job['events'].append(event)
                job['updated'] = time.time()
        except AuthRequiredException as e:
            # 3LO consent (legacy converse path raises; the Strands path emits CUSTOM inline).
            job['events'].append(_ev(CustomEvent(
                type=EventType.CUSTOM, name='auth_required',
                value={'auth_url': e.auth_url,
                       'message': 'Authorization required to access your fund positions. '
                                  'Approve in the new tab, then choose "I\'ve approved — continue".'})))
        job['events'].append(_ev(RunFinishedEvent(
            type=EventType.RUN_FINISHED, thread_id=thread_id, run_id=run_id)))
        job['state'] = 'done'
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(f"JOB ERROR: {_redact(str(e))}", file=sys.stderr, flush=True)
        job['events'].append(_ev(RunErrorEvent(
            type=EventType.RUN_ERROR, message=_safe_error(e, 'async_job'))))
        job['state'] = 'error'
    finally:
        job['updated'] = time.time()
        app.complete_async_task(task_id)   # last task complete → /ping reverts to Healthy


@app.entrypoint
async def invoke(payload, context):
    """AG-UI streaming entrypoint. Yields AG-UI protocol events; BedrockAgentCoreApp
    SSE-frames each yielded dict (`data: {json}\\n\\n`). Dispatches on payload['action']:

      • 'start' → launch a background run (async long-running path), return immediately.
      • 'poll'  → drain a background run's buffered events since payload['cursor'].
      • ''/other → the LEGACY synchronous path: stream the whole run in one request
                   (vanilla frontend + any caller not using the async loop). Capped at 15 min.

    Every path is bounded by RunStarted … RunFinished/RunError. The 3LO consent surfaces as a
    Custom('auth_required') event so the run closes cleanly and the frontend re-runs the turn."""
    user_id, user_email = _identity_from_context(context, payload)
    session_id = getattr(context, 'session_id', '') or ''
    thread_id = session_id or payload.get('thread_id', '') or _uuid.uuid4().hex
    run_id = payload.get('run_id', '') or _uuid.uuid4().hex

    # Raw user JWT for this request, used to bridge to the 3LO callback
    # (CompleteResourceTokenAuth needs userToken, not userId). The runtime consumes
    # the inbound Authorization header for its own auth and does NOT forward it to the
    # container, so the bridge/websocket Lambda also passes the access token in-band as
    # `user_token`. Prefer a forwarded header if present (future-proof), else payload.
    _headers = getattr(context, 'request_headers', None) or {}
    _auth = _headers.get('Authorization') or _headers.get('authorization') or ''
    user_jwt = (_auth[7:] if _auth.lower().startswith('bearer ') else _auth) or payload.get('user_token', '')

    action = (payload.get('action') or '').strip().lower()

    # ── ASYNC 'start': register the background run and return at once ──────────
    if action == 'start':
        _gc_jobs()
        # Elevated long-running tier is entitlement-gated. A non-entitled caller still gets a
        # background job (so the async start/poll UX is unchanged) but at the NORMAL budget tier
        # rather than the 2h/40-tool tier — no caller-controlled budget elevation.
        elevated = _long_running_allowed(user_id)
        _audit('long_running_request', sub=user_id, decision='elevated' if elevated else 'normal_tier')
        job = {'events': [], 'state': 'running', 'updated': time.time(),
               'thread_id': thread_id, 'run_id': run_id, 'task': None}
        _JOBS[session_id] = job
        loop = asyncio.get_running_loop()
        # Keep a strong ref on the job (the event loop does NOT hold one) so the task
        # isn't GC'd mid-run.
        job['task'] = loop.create_task(_run_job(
            job, payload.get('message', ''), user_id, user_email, session_id, user_jwt,
            payload.get('model_id', ''), bool(payload.get('force_reauth', False)),
            payload.get('topology', ''), thread_id, run_id, payload.get('persona', ''),
            long_running=elevated))
        yield _ev(CustomEvent(type=EventType.CUSTOM, name='job_started',
                              value={'session_id': session_id}))
        return

    # ── ASYNC 'poll': stream buffered events since the client's cursor ────────
    if action == 'poll':
        # Refresh the session's Gateway bearer token from this poll's freshly-minted JWT. A
        # background turn can outlive its ~1h token; the frontend re-sends a current token every
        # poll, so the still-running turn's governed-tool calls keep authenticating (JWT-only
        # Gateway, no SigV4 fallback). Only overwrite with a non-empty token.
        if session_id and user_jwt:
            _SESSION_JWT[session_id] = user_jwt
        cursor = int(payload.get('cursor') or 0)
        job = _JOBS.get(session_id)
        if not job:
            # microVM recycled (health/8h) or unknown session — client should restart.
            yield _ev(CustomEvent(type=EventType.CUSTOM, name='poll_status',
                                  value={'state': 'unknown', 'cursor': cursor}))
            return
        events = job['events']
        new_cursor = len(events)
        for ev in events[cursor:]:
            yield ev
        yield _ev(CustomEvent(type=EventType.CUSTOM, name='poll_status',
                              value={'state': job['state'], 'cursor': new_cursor}))
        return

    # ── SYNC (legacy / vanilla path): stream the whole run in one request ─────
    yield _ev(RunStartedEvent(type=EventType.RUN_STARTED, thread_id=thread_id, run_id=run_id))
    try:
        async for event in process_message_events(
                payload.get('message', ''), user_id, user_email, session_id, user_jwt,
                payload.get('model_id', ''), bool(payload.get('force_reauth', False)),
                payload.get('topology', ''), persona=payload.get('persona', '')):
            yield event
    except AuthRequiredException as e:
        # Human-in-the-loop: surface the consent URL as a Custom event, then close the
        # run. The frontend renders an "Authorize → I've approved, continue" card and
        # re-sends the same turn; on that next run the token vault has the grant.
        yield _ev(CustomEvent(
            type=EventType.CUSTOM, name='auth_required',
            value={'auth_url': e.auth_url,
                   'message': 'Authorization required to access your fund positions. '
                              'Approve in the new tab, then choose "I\'ve approved — continue".'}))
        yield _ev(RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=thread_id, run_id=run_id))
        return
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(f"ERROR: {_redact(str(e))}", file=sys.stderr, flush=True)
        yield _ev(RunErrorEvent(type=EventType.RUN_ERROR, message=_safe_error(e, 'invoke')))
        return
    finally:
        # A sync turn is self-contained (the whole run streamed in this one request), so its cached
        # Gateway token is no longer needed once the turn ends — drop it to keep _SESSION_JWT from
        # growing unbounded on a long-lived microVM. Async jobs are keyed the same but must KEEP the
        # token across polls, so skip those (their entry is reaped by _gc_jobs).
        if session_id and session_id not in _JOBS:
            _SESSION_JWT.pop(session_id, None)

    yield _ev(RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=thread_id, run_id=run_id))


if __name__ == '__main__':
    print(f"READY on {PORT}", flush=True)
    app.run()
