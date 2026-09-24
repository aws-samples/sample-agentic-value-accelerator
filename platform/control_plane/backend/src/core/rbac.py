"""Role-Based Access Control middleware with Cognito JWT validation"""

import json
import logging
import threading
import time
from enum import IntEnum
from typing import Any, Optional

from anyio import to_thread
from fastapi import HTTPException, Request

from core.config import settings

logger = logging.getLogger(__name__)


def _is_dev_auth_allowed() -> bool:
    """Check if dev auth bypass is allowed in current environment.

    Dev auth is never allowed in production, even if USE_DEV_AUTH=True.
    """
    if settings.ENVIRONMENT.lower() == "production":
        if settings.USE_DEV_AUTH:
            logger.warning(
                "USE_DEV_AUTH is True but ENVIRONMENT=production - dev auth bypass disabled"
            )
        return False
    return settings.USE_DEV_AUTH


class Role(IntEnum):
    VIEWER = 0
    OPERATOR = 1
    ADMIN = 2

ROLE_MAP = {"viewer": Role.VIEWER, "operator": Role.OPERATOR, "admin": Role.ADMIN}

# ---------------------------------------------------------------------------
# Cognito JWKS client - one instance per JWKS URL, reused process-wide.
#
# _decode_jwt used to build a fresh PyJWKClient on every call, so the client's
# own key-set cache never got a chance to hit: any caller, including an
# unauthenticated one presenting a garbage token, drove one outbound HTTPS fetch
# of the JWKS document per request. The hand-rolled dict cache that used to live
# here had zero callers and fetched with urlopen() and no timeout at all.
#
# PyJWKClient does both the caching and the timeout itself (cache_jwk_set /
# lifespan / timeout are present in the pinned 2.8.0 and in the 2.10.1 on dev
# hosts).
#
# Sharing the client is necessary but not sufficient. get_signing_key() answers a
# kid it does not recognise with get_signing_keys(refresh=True), which skips the
# cache and fetches - and the kid is the one field of an unverified token a caller
# picks freely, so an attacker sending a fresh random kid per request kept the
# per-request fetch even with the cache in place. _signing_key_for_token below
# reads the kid first and answers it from the cached set, which is the ordering
# core/security.py's verify_token already uses for the same reason.
#
# This is the one JWKS fetch in the backend that does not go through safe_fetch:
# PyJWKClient owns the socket and accepts only a timeout and an ssl_context, so
# unlike core/security.py this path has no capped body and follows redirects. Every
# bound it does accept is therefore set. The host is trusted platform config
# (COGNITO_REGION / COGNITO_USER_POOL_ID, interpolated below without shape
# validation, exactly as in core/security.py) - whoever can set those values can
# already point verification at a key set they control.
# ---------------------------------------------------------------------------
_JWKS_CACHE_TTL = 3600  # 1 hour - how long a fetched key set is reused
# 10s matches safe_fetch.DEFAULT_TIMEOUT_S and core/security.py's _JWKS_TIMEOUT_S,
# which fetches the same document (tests/test_security_jwks.py asserts the two stay
# equal: a response between two different bounds would be accepted by one auth path
# and refused by the other). PyJWKClient's own default is 30, which is the bound
# this path used to get, and it would hold the worker running the fetch for half a
# minute on a hung endpoint - on a path reachable pre-authentication.
_JWKS_FETCH_TIMEOUT = 10

# Backoff between outbound JWKS fetches, process-wide. This is what caps the
# pre-authentication amplification: the kid is the one field of an unverified token a
# caller picks freely, and without a gate here every made-up kid bought one outbound
# HTTPS fetch. One fetch per window instead, whatever the request rate.
#
# A per-kid negative cache does not substitute for this. The attack is a *fresh*
# invented kid per request, and a fresh kid is by construction never in a negative
# cache, so every request would still be allowed its refresh; remembering misses only
# helps against a kid that repeats, which is not the attack.
#
# The window is measured from when an attempt FINISHED, not when it started, and that
# is load-bearing rather than cosmetic. Every reader of the deadline holds
# _jwks_load_lock and the fetch runs under that same lock, so a request queued behind
# a fetch cannot read the deadline until that fetch has already set it - which means a
# backoff far shorter than the attempt it waited on still refuses the whole queue.
# Not *any* positive backoff, though: waiters take the lock one at a time and each
# reads the deadline when its turn comes, so a queue that takes longer to drain than
# the backoff lasts would see the window reopen partway down it. A refused waiter only
# does a cache check and a clock compare, so draining is orders of magnitude faster
# than fetching and at the 1.0s floor this needs an implausible queue - it is a
# precision point about the wording, not a hole to defend. Both halves of the anchoring
# were measured, 8 queued requests against a 2s hang with a 0.5s window: anchored at
# the start, which is what this did, 8 fetches returning 2s apart (2.0, 4.0, ... 16.0s)
# - the pile-up; anchored at the end, 1 fetch.
#
# Because the deadline is anchored at the end, its length is free to be chosen for
# availability instead of being pinned above _JWKS_FETCH_TIMEOUT, so it scales with
# how long the last attempt actually cost:
#   - connection refused, NXDOMAIN, a 503 - the ordinary Cognito blip - fails in
#     milliseconds and rests the endpoint for one floor.
#   - a real hang burns the full timeout and rests it for ~15s, because an endpoint
#     that needs 10s to fail is not one to go straight back to.
# The flat 15s this used to be charged the fast case the slow case's price: a cold key
# set plus one refused connection answered 401 "Invalid token" to *valid* tokens for
# 15s. The floor still holds the ceiling at one fetch per second process-wide, and one
# in flight, which is decoupled from the request rate - the defect was one per request.
#
# What the gate does not buy, measured rather than assumed: a request arriving while a
# fetch is in flight blocks on _jwks_load_lock for the whole of it and only then finds
# the window closed. Its latency is the full hang, not fail-fast, and it holds an anyio
# threadpool slot while it waits. The gate bounds that to one hang per window instead
# of one per request. Bounding the wait itself would mean 401ing a legitimate
# cold-start burst whose fetch is merely slow, so it is not done here.
_JWKS_FETCH_BACKOFF_FLOOR = 1.0
_JWKS_FETCH_BACKOFF_FACTOR = 1.5

_jwks_lock = threading.Lock()  # guards the client singleton only
_jwks_client: Optional[Any] = None
_jwks_client_url: Optional[str] = None

# Serialises key-set loads and carries the monotonic deadline before which no new
# fetch may start. Set in a `finally`, so an attempt that raised or hung still rests
# the endpoint - otherwise the storm queued behind it is unbounded.
_jwks_load_lock = threading.Lock()
_jwks_fetch_blocked_until: Optional[float] = None


def _fetch_backoff(elapsed: float) -> float:
    """How long to refuse new JWKS fetches after an attempt that took `elapsed`.

    Always strictly greater than `elapsed`, so a slow endpoint is rested for longer
    than it just cost, and never below the floor, so a fast failure still cannot be
    retried once per request.
    """
    return max(_JWKS_FETCH_BACKOFF_FLOOR, elapsed * _JWKS_FETCH_BACKOFF_FACTOR)


class _SigningKeyUnavailableError(Exception):
    """No verification key could be produced for this token, without going out.

    Its own type so the log line distinguishes a made-up kid from a real transport
    failure, and its message says which of the two it was - an operator reading
    "unknown kid" while Cognito is actually down looks in the wrong place.
    _extract_role turns either one into the same generic 401. The message never
    contains the kid, which is caller-controlled.
    """


def _issuer() -> str:
    """Cognito issuer URL for the configured user pool."""
    return f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/{settings.COGNITO_USER_POOL_ID}"


def _jwks_url() -> str:
    return f"{_issuer()}/.well-known/jwks.json"


def _get_jwks_client(client_cls: Any) -> Any:
    """Return the cached JWKS client, building it on first use.

    Rebuilt only when the JWKS URL changes (region or pool id reconfigured), so
    verifications share one key-set cache. The lock dedupes construction and
    nothing else: client_cls.__init__ does no I/O (it stores fields and builds an
    empty cache), and it is released before any fetch, so on its own it would still
    let a cold-start burst put one request's fetch on the wire per request. The
    lock that dedupes the fetch is _jwks_load_lock, in _signing_key_for_token.

    The PyJWKClient class is passed in rather than imported here so that
    _decode_jwt's try/except around `import jwt` stays the single import site -
    an ImportError raised in here would bypass its dev-mode fallback.
    """
    global _jwks_client, _jwks_client_url

    url = _jwks_url()
    with _jwks_lock:
        if _jwks_client is None or _jwks_client_url != url:
            _jwks_client = client_cls(
                url,
                cache_jwk_set=True,
                lifespan=_JWKS_CACHE_TTL,
                timeout=_JWKS_FETCH_TIMEOUT,
            )
            _jwks_client_url = url
        return _jwks_client


def _cached_jwk_set(jwk_client: Any) -> Any:
    """The client's cached JWKS document, or None. Never fetches.

    PyJWKClient has no cache-only accessor - get_jwk_set() fetches whenever the
    cache is cold, and that is the call an unknown kid must not be able to reach.
    jwk_set_cache is the cache the constructor above asks for with cache_jwk_set,
    and it reports None once lifespan has passed.
    """
    cache = getattr(jwk_client, "jwk_set_cache", None)
    if cache is None:
        return None
    return cache.get()


def _match_kid(jwk_client: Any, kid: str, *, refresh: bool) -> Any:
    """PyJWT's own signing-key lookup, with the fetch decision left to the caller.

    Deliberately PyJWT's matcher rather than a scan of the raw document: it also
    drops keys that are not usable for signature verification, so a kid that
    appears in the JWKS as an encryption key is a miss here too instead of falling
    through to a forced refresh.

    With refresh=False this cannot fetch as long as _cached_jwk_set() is non-None,
    which is why callers check that first.
    """
    return jwk_client.match_kid(jwk_client.get_signing_keys(refresh=refresh), kid)


def _signing_key_for_token(jwk_client: Any, pyjwt: Any, token: str) -> Any:
    """Resolve the token's signing key without letting its kid drive a fetch.

    get_signing_key_from_jwt() would fetch the whole JWKS document on any kid it
    does not recognise, so before this an unauthenticated caller got one outbound
    HTTPS request per attempt just by varying a header field. Here an unrecognised
    kid costs a dict scan, and the fetch it may need is rate limited.
    """
    kid = pyjwt.get_unverified_header(token).get("kid")  # no signature check, no I/O
    if not kid:
        raise _SigningKeyUnavailableError("token header carries no kid")

    if _cached_jwk_set(jwk_client) is not None:
        # The common case: warm cache, known kid, no lock and no I/O. If lifespan
        # expires between the check and the call one unserialised fetch gets
        # through, which is one per worker per hour, not a per-request lever.
        key = _match_kid(jwk_client, kid, refresh=False)
        if key is not None:
            return key

    # Either the cache is cold (first request, expired lifespan, or a failed fetch
    # cleared it - PyJWT's fetch_data caches the None in a finally) or the kid is
    # new to us, which is what a real key rotation looks like. Both need the
    # network, so both go through one gate.
    global _jwks_fetch_blocked_until
    with _jwks_load_lock:
        # Recheck under the lock: while we waited, another request may have loaded a
        # set that contains this kid. That is what holding the lock across the fetch
        # buys - one fetch for a cold-start burst instead of one per request.
        cached = _cached_jwk_set(jwk_client)
        if cached is not None:
            key = _match_kid(jwk_client, kid, refresh=False)
            if key is not None:
                return key

        blocked_until = _jwks_fetch_blocked_until
        if blocked_until is not None and time.monotonic() < blocked_until:
            # Which of the two it is decides where an operator looks, so say it.
            raise _SigningKeyUnavailableError(
                "kid not in the cached key set and the refresh window is closed"
                if cached is not None
                else "no key set cached and the JWKS fetch window is closed"
            )

        started = time.monotonic()
        try:
            key = _match_kid(jwk_client, kid, refresh=True)
        finally:
            # Anchored at the end of the attempt, which is what makes the backoff
            # length independent of _JWKS_FETCH_TIMEOUT. See the constants above.
            finished = time.monotonic()
            _jwks_fetch_blocked_until = finished + _fetch_backoff(finished - started)

    if key is None:
        raise _SigningKeyUnavailableError("kid absent from the freshly fetched key set")
    return key


def _decode_jwt(token: str) -> dict:
    """Decode and verify a Cognito JWT token."""
    try:
        import jwt as pyjwt
        from jwt import PyJWKClient
    except ImportError:
        # Fallback: if PyJWT not installed, decode without verification in dev mode
        if _is_dev_auth_allowed():
            logger.warning("PyJWT not installed - using unverified decode in dev mode")
            import base64
            payload = token.split(".")[1]
            payload += "=" * (4 - len(payload) % 4)
            return json.loads(base64.b64decode(payload))
        raise HTTPException(status_code=500, detail="PyJWT not installed")

    jwk_client = _get_jwks_client(PyJWKClient)
    signing_key = _signing_key_for_token(jwk_client, pyjwt, token)
    return pyjwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.COGNITO_CLIENT_ID,
        issuer=_issuer(),
    )


def _extract_role(request: Request) -> Role:
    auth = request.headers.get("Authorization", "")
    dev_auth_allowed = _is_dev_auth_allowed()

    # Dev mode: check for x-user-email header to simulate different users
    if dev_auth_allowed:
        user_email = request.headers.get("x-user-email", "admin@example.com").lower()
        # Map user email to role
        if user_email == "demo@example.com":
            logger.warning("Dev auth bypass: granting VIEWER role for demo user")
            return Role.VIEWER
        elif user_email in ["admin@example.com", "dev@example.com"]:
            logger.warning("Dev auth bypass: granting ADMIN role for dev user")
            return Role.ADMIN
        # Default to admin in dev mode if no token
        if not auth:
            logger.warning("Dev auth bypass: no auth header, granting ADMIN role")
            return Role.ADMIN

    if not auth or not auth.startswith("Bearer "):
        if dev_auth_allowed:
            logger.warning("Dev auth bypass: missing/invalid auth header, granting ADMIN role")
            return Role.ADMIN
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = auth.split(" ", 1)[1]

    # Skip validation in dev mode when Cognito is not configured
    if dev_auth_allowed and not settings.COGNITO_USER_POOL_ID:
        role_str = request.headers.get("x-user-role", "admin").lower()
        # %r, not interpolation: the value is caller-supplied, and a raw one would
        # let it forge extra log lines.
        logger.warning("Dev auth bypass: Cognito not configured, using x-user-role header (%r)", role_str)
        return ROLE_MAP.get(role_str, Role.VIEWER)

    try:
        claims = _decode_jwt(token)
    except Exception as e:
        # Log only the error type to avoid leaking sensitive info from error messages
        logger.error("JWT validation failed: %s", type(e).__name__)
        # %r on the message: PyJWT quotes the token's own kid back ("Unable to find
        # a signing key that matches: ..."), and a kid is caller-controlled JSON
        # that can carry CR/LF. repr escapes it into one line.
        logger.debug("JWT error details (debug only): %r", str(e))
        if dev_auth_allowed:
            logger.warning("Dev auth bypass: JWT validation failed, granting ADMIN role")
            return Role.ADMIN
        raise HTTPException(status_code=401, detail="Invalid token")

    # Extract role from cognito:groups
    groups = claims.get("cognito:groups", [])
    if "admin" in groups:
        return Role.ADMIN
    if "operator" in groups:
        return Role.OPERATOR
    return Role.VIEWER


def require_role(min_role: Role):
    async def checker(request: Request):
        # _extract_role does blocking work - a JWKS fetch on a cold cache, then an
        # RSA signature verification - and this dependency is `async def`, so
        # calling it inline stalls the whole event loop for the duration.
        #
        # This is the only caller that has the hop. Every other caller of
        # _extract_role / _decode_jwt still runs it inline inside an `async def`
        # handler and still blocks the loop (the full set, from grepping both names:
        # api/routes/users.py:55 and :71 in get_current_user,
        # api/routes/fsi_sso.py:64 and :73 in sign_app_token, and
        # api/routes/evaluations.py:361 in run_events - the SSE auth check, whose own
        # docstring already reasons about the threadpool). Each wants the same
        # to_thread.run_sync wrapper; those files have other owners.
        user_role = await to_thread.run_sync(_extract_role, request)
        if user_role < min_role:
            raise HTTPException(status_code=403, detail=f"Requires {min_role.name.lower()} role or higher")
        return user_role
    return checker
