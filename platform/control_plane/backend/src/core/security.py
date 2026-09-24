"""
Security and authentication utilities
"""

import logging
import time
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict

from core import safe_fetch
from core.cognito_groups import ADMIN_GROUP
from core.config import settings
from core.safe_fetch import SafeFetchError, is_allowlistable_refusal

logger = logging.getLogger(__name__)

# HTTP Bearer security scheme
security = HTTPBearer()

# Cache for Cognito public keys, with the fetch time so it can expire. Without a
# TTL the JWKS was cached for the life of the process, so a Cognito signing-key
# rotation refused every token until someone restarted the container.
#
# The clock is time.monotonic(), not time.time(): a wall clock that steps
# backwards by more than the TTL makes `now - fetched_at` negative, which reads as
# "fresh" and reinstates the never-expiring cache the TTL exists to prevent.
#
# Deliberately not locked. A lock held across the fetch would collapse a
# cold-start burst into one fetch, but against a hung endpoint every waiter would
# then take the lock in turn and run its own timeout, serialising
# N x _JWKS_TIMEOUT_S with the threadpool pinned throughout - worse than N
# parallel failures. Coalescing correctly means the waiters share the leader's
# failure, and "a failure is never cached" is a property this file is tested for.
_cognito_keys: Optional[Dict] = None
_cognito_keys_time: float = 0.0
_JWKS_CACHE_TTL = 3600  # 1 hour, matching rbac._JWKS_CACHE_TTL for the same document

# Last forced refetch, on the same monotonic clock. -inf means "never", which the
# rate-limit comparison below always permits. 0.0 would instead mean "at process
# start" and would suppress the first forced refresh on a host up under a minute.
_jwks_forced_refresh_time: float = float("-inf")

# A kid missing from the cached document may mean Cognito rotated its signing keys
# inside our TTL, so one refetch is worth trying before refusing the token - that
# is what PyJWKClient does on the rbac path, and without it the two auth paths
# disagree for up to an hour after a rotation.
#
# It has to be rate limited, because the kid comes out of an UNVERIFIED token
# header: an unlimited force-refresh lets any unauthenticated caller convert one
# bogus bearer string into one outbound fetch. One refresh per minute still tracks
# a rotation inside a minute, against the hour the TTL alone would cost.
_JWKS_FORCED_REFRESH_MIN_INTERVAL_S = 60

# This fetch runs inline in token verification, and verify_token is a plain def, so
# it occupies an anyio threadpool slot while it waits. An untimed fetch against a
# hanging Cognito endpoint holds that slot until the OS gives up on the socket.
#
# 10s rather than 5, and the trade was re-examined rather than inherited: rbac
# ._JWKS_FETCH_TIMEOUT fetches the same document with 10, so a Cognito response in
# the 5-10s band would be accepted by the rbac middleware and refused here - the
# same token verifying or not depending on which auth path handled the request.
# test_jwks_fetch_timeout_matches_rbac pins the pair together and
# test_the_jwks_fetch_timeout_is_pinned_at_ten_seconds pins this value, because
# equality alone is equally happy with both sides at 30.
#
# The pre-authentication occupancy that 5s looks like it would halve is not
# actually bought by lowering this number. safe_fetch hands the value to
# http.client as the *socket* timeout, which bounds one recv rather than the
# request. Probed rather than reasoned about: against a local server that trickled a
# body in five one-byte chunks 0.6s apart, http.client with timeout=1.0 returned the
# whole body after 3.03s, and only a gap longer than 1.0s raised TimeoutError. So a
# JWKS host that trickles holds the worker for about (bytes / chunk) x timeout -
# arbitrarily long at 5 as at 10. What does bound this call site is the number of
# fetches one request can make (one - see verify_token) and the byte cap below. A
# wall-clock deadline spanning a whole fetch would have to live in safe_fetch; it
# does not today.
_JWKS_TIMEOUT_S = 10.0

# A Cognito JWKS is two RS256 keys, well under a kilobyte. safe_fetch's default cap
# is 5 MiB, and this fetch runs before authentication, so accepting that default
# lets whoever controls the JWKS host make every unauthenticated request buffer
# 5 MiB - and, per the note above, read it one trickled recv at a time. 64 KiB is
# still ~70x a realistic document. It has to be generous: safe_fetch.fetch_json
# raises response_too_large on a truncated body rather than parsing the prefix, so a
# cap set too tight would be an outage rather than a silent partial parse.
_JWKS_MAX_BYTES = 64 * 1024

# One fixed string in the 401 body for every JWKS failure, whatever the reason was.
#
# The reason used to be interpolated into the body on the grounds that it is a
# stable category with no host or address in it. That is true of the string and
# false of what it discloses to an unauthenticated caller: invalid_jwks_response -
# raised by this module, not by safe_fetch - reached the body as "Authentication
# failed: invalid_jwks_response" and said our key document came back unusable, and
# blocked_private_address says our IdP resolves into private space. An allowlist of
# reasons that are safe to echo would need editing every time safe_fetch grew a
# reason, and would be wrong in the disclosing direction until someone noticed, so
# there is no per-reason mapping here at all. The reason goes to the log; the caller
# gets the one thing that is true of all of them.
_JWKS_FAILURE_DETAIL = "Authentication failed: key_retrieval_failed"

# "Which refusals can SAFE_FETCH_ALLOWED_PRIVATE_CIDRS actually permit" is answered by
# safe_fetch.is_allowlistable_refusal, which owns the setting. A local frozenset listing
# the three allowlistable reasons used to live here; it was correct, and so was the
# identical copy in api/routes/frontier_agents.py, and neither would have failed if
# safe_fetch added a fourth reason - it would simply have stopped being mentioned.


def _jwks_url() -> str:
    return (
        f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/"
        f"{settings.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    )


def _expected_issuer() -> str:
    """Issuer the token's `iss` claim must match.

    Same construction as rbac._decode_jwt, which already verifies it. Without the
    check a correctly signed token from a *different* pool in the same region
    would be accepted, because the signature and audience can both be valid there.
    """
    return (
        f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/"
        f"{settings.COGNITO_USER_POOL_ID}"
    )


def _has_usable_signing_key(document: object) -> bool:
    """Whether this document carries at least one JWK we could verify a token with.

    A shape check that only asked for a "keys" list called {"keys": []} and
    {"keys": ["kid-1", 7]} valid, so both got cached for the full TTL - which is
    the "one bad minute at Cognito becomes an hour of refused logins" outage the
    TTL was added to prevent, arriving through the front door instead. A usable
    entry is a dict with a non-empty kid, because that is what the lookup in
    verify_token matches on.

    "At least one" rather than "every one" on purpose: refusing a whole document
    over a single unrecognised array member would make a future Cognito addition
    an outage, and _find_signing_key skips junk entries anyway.
    """
    if not isinstance(document, dict):
        return False
    keys = document.get("keys")
    if not isinstance(keys, list):
        return False
    return any(isinstance(key, dict) and key.get("kid") for key in keys)


def _find_signing_key(document: Dict, kid: str) -> Optional[Dict]:
    """The JWK carrying `kid`, or None if the document does not have it.

    Tolerates junk beside the good keys: a non-dict entry raises AttributeError on
    .get and an entry without a kid raises KeyError on subscript, and either one
    would turn "this array has one odd member" into a blanket authentication
    failure for tokens whose key is present.
    """
    for key in document.get("keys", []):
        if isinstance(key, dict) and key.get("kid") == kid:
            return key
    return None


def _load_cognito_public_keys(force_refresh: bool = False) -> tuple[Dict, bool]:
    """The JWKS document, plus whether it came out of the cache rather than the wire.

    verify_token needs that second value: a document this request pulled off the
    wire microseconds ago cannot be improved by pulling it again, so a kid miss is
    only worth a forced refetch when the document was cached. See the call site.

    Args:
        force_refresh: Refetch even inside the TTL, for a kid the cached document
            does not carry. Rate limited to one refetch per
            _JWKS_FORCED_REFRESH_MIN_INTERVAL_S; when the budget is spent the
            cached document is returned unchanged, so the caller's kid miss stays
            a kid miss instead of becoming an outbound fetch per bogus token.
    """
    global _cognito_keys, _cognito_keys_time, _jwks_forced_refresh_time

    now = time.monotonic()
    fresh = _cognito_keys is not None and (now - _cognito_keys_time) < _JWKS_CACHE_TTL

    if fresh and force_refresh:
        # Only a forced refresh spends the rate-limit budget. A refetch driven by
        # the TTL expiring is not an amplifier, so it must not be throttled here.
        if (now - _jwks_forced_refresh_time) >= _JWKS_FORCED_REFRESH_MIN_INTERVAL_S:
            _jwks_forced_refresh_time = now
            fresh = False
            # The kid itself stays out of the record: it is an unvalidated string
            # from the request, so interpolating it hands an attacker the log.
            logger.info(
                "Refetching the Cognito JWKS: a token presented a kid the cached "
                "document does not carry, which is what a signing-key rotation "
                "looks like"
            )

    if fresh:
        return _cognito_keys, True

    # safe_fetch rather than requests.get: the host is public and comes from our own
    # config, so the address check is not the reason - the timeout being mandatory
    # is, along with the capped body and a redirect off cognito-idp being
    # re-validated rather than followed.
    keys = safe_fetch.fetch_json(
        _jwks_url(), timeout=_JWKS_TIMEOUT_S, max_bytes=_JWKS_MAX_BYTES
    )

    if not _has_usable_signing_key(keys):
        # A 200 that is not a usable JWKS must not become the cached answer, and
        # must not surface later as a KeyError from the key lookup.
        raise SafeFetchError(
            "invalid_jwks_response", "no usable JWKS entry carrying a 'kid'"
        )

    # Only a success is cached. Caching a failure would turn one bad minute at
    # Cognito into a full TTL of refused logins.
    _cognito_keys = keys
    _cognito_keys_time = time.monotonic()

    return _cognito_keys, False


def get_cognito_public_keys(force_refresh: bool = False) -> Dict:
    """
    Fetch Cognito public keys for JWT validation

    Args:
        force_refresh: See _load_cognito_public_keys.

    Returns:
        Dictionary of public keys
    """
    keys, _from_cache = _load_cognito_public_keys(force_refresh=force_refresh)
    return keys


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict:
    """
    Verify JWT token from Cognito

    Args:
        credentials: HTTP Authorization header credentials

    Returns:
        Decoded JWT claims

    Raises:
        HTTPException: If token is invalid
    """
    token = credentials.credentials

    try:
        # Decode header to get kid. This happens BEFORE the JWKS fetch on purpose:
        # this path is unauthenticated, so fetching first meant any non-empty
        # bearer string - "x" - made the backend call out to Cognito.
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing kid"
            )

        # Get Cognito public keys
        keys, from_cache = _load_cognito_public_keys()
        key = _find_signing_key(keys, kid)

        if key is None and from_cache:
            # An unknown kid against a CACHED document is what a Cognito
            # signing-key rotation looks like, so try one refetch before refusing.
            # rbac.py gets this from PyJWKClient; without it that path accepts a
            # rotated token this one rejects for up to an hour.
            #
            # from_cache is the gate. If the document above came off the wire in
            # this same call, refetching it cannot return different keys, so the
            # refetch would be a wasted outbound request on the pre-authentication
            # path - and it is what let one request hold a threadpool slot across
            # two sequential JWKS sessions. Skipping it also leaves the rate-limit
            # budget unspent for a request that can actually use it.
            #
            # The rate limit lives in _load_cognito_public_keys, so a flood of
            # made-up kids cannot use this to drive a fetch per request.
            keys, _ = _load_cognito_public_keys(force_refresh=True)
            key = _find_signing_key(keys, kid)

        if key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: kid not found"
            )

        # Verify and decode token
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.COGNITO_CLIENT_ID,
            issuer=_expected_issuer(),
            options={"verify_exp": True}
        )

        return claims

    except HTTPException:
        # Ours, already generic. Re-raised so the handlers below do not rewrap it
        # into "Authentication failed: 401: ..." and bury the reason.
        raise
    except JWTError as e:
        # The detail is generic because this caller is unauthenticated and the
        # underlying message is not: it quotes claim values, and a transport
        # failure quotes the JWKS URL, which hands back COGNITO_REGION and
        # COGNITO_USER_POOL_ID. rbac._extract_role sets the same precedent - it
        # logs type(e).__name__ and keeps the message at debug. Named rather than
        # cited by line number, because line numbers rot.
        logger.warning("Token verification failed: %s", type(e).__name__, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    except SafeFetchError as e:
        # The specific reason is logged and nothing more. detail carries the URL and
        # the resolved address, so it belongs here rather than in the response; lazy
        # %-args rather than an f-string so a stray % in detail cannot raise inside
        # logging.
        logger.warning("JWKS fetch failed: %s (%s)", e.reason, e.detail, exc_info=True)
        if is_allowlistable_refusal(e.reason):
            # The one refusal an operator can legitimately be on the wrong side of:
            # split-horizon DNS, or a cognito-idp interface endpoint, resolves the
            # issuer into private space and safe_fetch refuses it by default. Name
            # the setting that fixes it - the 401 body carries one fixed category, so
            # without this line there is nowhere to go from it. The address itself
            # stays in the warning above rather than being repeated here.
            logger.error(
                "The JWKS host resolved to an address safe_fetch refuses (%s). If this "
                "deployment reaches Cognito over a private endpoint, add that CIDR to "
                "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS.",
                e.reason,
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_JWKS_FAILURE_DETAIL
        )
    except Exception as e:
        logger.warning("Authentication failed: %s", type(e).__name__, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )


def get_current_user(claims: Dict = Depends(verify_token)) -> Dict:
    """
    Get current user from JWT claims

    Args:
        claims: JWT claims from verify_token

    Returns:
        User information dictionary
    """
    return {
        "sub": claims.get("sub"),
        "user_id": claims.get("sub"),
        "username": claims.get("cognito:username"),
        "email": claims.get("email"),
        "groups": claims.get("cognito:groups", [])
    }


def require_admin(user: Dict = Depends(get_current_user)) -> Dict:
    """
    Require user to be in admin group

    The group is ADMIN_GROUP, the name the Cognito Terraform creates. See the comment
    on that constant: this check spent its life asking for a group that never existed.

    Args:
        user: Current user from get_current_user

    Returns:
        User information if admin

    Raises:
        HTTPException: If user is not admin
    """
    if ADMIN_GROUP not in user.get("groups", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    return user
