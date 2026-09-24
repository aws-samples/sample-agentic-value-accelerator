"""Tests for the unauthenticated half of core.security: the JWKS fetch.

Everything here guards a property of the *pre-authentication* path, where the
caller has presented nothing but a string:

  - a garbage bearer token must be rejected by a local parse, not by a round trip
    to Cognito (otherwise any unauthenticated request is an outbound fetch we pay
    for and wait on),
  - the 401 must not quote the JWKS URL, which carries COGNITO_REGION and
    COGNITO_USER_POOL_ID,
  - the JWKS cache must expire, and must never cache a failure - including a 200
    that carries no usable key, which is a failure wearing a success's clothes,
  - an unknown kid against a *cached* document must buy exactly one refetch,
    because a Cognito key rotation otherwise refuses every login for the rest of
    the TTL - and no refetch at all against a document this request just fetched,
    because the kid is an attacker-chosen string that must not become a fetch per
    request and a second fetch of a document seconds old cannot answer differently,
  - a refusal the operator can act on must say so in the log without echoing the
    address into a second record.

python-jose is in the container image (requirements.txt pins python-jose 3.3.0)
but is not installed on this host, so a shim backed by PyJWT stands in for the two
functions core.security calls. The shim is deliberately thin: `decode` is
monkeypatched in every test that reaches it, and `get_unverified_header` is
PyJWT's real one, so the "does this token parse locally" behaviour under test is
real behaviour and not a stub's opinion. jose raises JWSError where PyJWT raises
DecodeError; both land in verify_token's generic handler, and the assertions here
are about the 401 that comes out either way.
"""

from __future__ import annotations

import base64
import json
import logging
import sys
import time
import types

import pytest

try:  # pragma: no cover - depends on the host, not on the code under test
    import jose  # noqa: F401
except ModuleNotFoundError:
    import jwt as _pyjwt

    _jose = types.ModuleType("jose")
    _jose_jwt = types.ModuleType("jose.jwt")
    _jose_jwt.get_unverified_header = _pyjwt.get_unverified_header
    _jose_jwt.decode = _pyjwt.decode
    _jose.jwt = _jose_jwt
    _jose.JWTError = _pyjwt.exceptions.PyJWTError
    sys.modules["jose"] = _jose
    sys.modules["jose.jwt"] = _jose_jwt

from fastapi import HTTPException  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials  # noqa: E402

from core import rbac, safe_fetch, security  # noqa: E402
from core.config import settings  # noqa: E402
from core.safe_fetch import SafeFetchError  # noqa: E402

# Obvious placeholders. They only need to be distinctive enough that a substring
# search for them in a 401 body is a real leak test.
REGION = "ap-southeast-4"
POOL_ID = "ap-southeast-4_ExamplePool"
CLIENT_ID = "example-client-id"
JWKS_URL = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}/.well-known/jwks.json"

# Anything that would let an unauthenticated caller learn where our pool lives.
LEAKY_SUBSTRINGS = (POOL_ID, "ExamplePool", REGION, "cognito-idp", "amazonaws.com", "jwks")

GOOD_JWKS = {"keys": [{"kid": "kid-1", "kty": "RSA", "n": "aaa", "e": "AQAB"}]}


@pytest.fixture(autouse=True)
def _cognito_config(monkeypatch):
    monkeypatch.setattr(settings, "COGNITO_REGION", REGION)
    monkeypatch.setattr(settings, "COGNITO_USER_POOL_ID", POOL_ID)
    monkeypatch.setattr(settings, "COGNITO_CLIENT_ID", CLIENT_ID)


def _clear_jwks_cache():
    security._cognito_keys = None
    security._cognito_keys_time = 0.0
    # -inf is the module's own "never forced a refresh" value. 0.0 would leave the
    # rate limit already spent whenever the test session starts within a minute of
    # boot, which would make the forced-refresh tests pass or fail on host uptime.
    security._jwks_forced_refresh_time = float("-inf")


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    _clear_jwks_cache()
    yield
    _clear_jwks_cache()


class FakeClock:
    """Stand-in for the `time` module with both clocks under test control.

    security.py reads only `monotonic()`; `time()` is here so a test can step the
    wall clock independently and prove the age comparison does not use it.
    """

    def __init__(self, wall: float = 1_700_000_000.0, mono: float = 1_000.0):
        self.wall = wall
        self.mono = mono

    def time(self) -> float:
        return self.wall

    def monotonic(self) -> float:
        return self.mono


class RecordingFetch:
    """Stand-in for safe_fetch.fetch_json that records every call.

    Results are consumed in order; an exception instance in the list is raised
    rather than returned, which is how the "a failure is not cached" test gets a
    failure followed by a success.
    """

    def __init__(self, *results):
        self.calls = []
        self._results = list(results) or [GOOD_JWKS]

    def __call__(self, url, **kwargs):
        self.calls.append((url, kwargs))
        result = self._results[0] if len(self._results) == 1 else self._results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def _seg(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def _token(header: dict) -> str:
    """A structurally valid JWT with an unusable signature.

    Enough for get_unverified_header to succeed, which is the only local parse
    verify_token performs before it decides whether to fetch.
    """
    sig = base64.urlsafe_b64encode(b"not-a-real-signature").rstrip(b"=").decode()
    return f"{_seg(header)}.{_seg({'sub': 'user-1'})}.{sig}"


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _install_fetch(monkeypatch, fetch) -> RecordingFetch:
    monkeypatch.setattr(safe_fetch, "fetch_json", fetch)
    return fetch


# --------------------------------------------------------------------------
# Defect 3: no outbound fetch for a token that cannot possibly verify
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "token",
    [
        "x",
        "",
        "not-a-jwt",
        "a.b",
        "aaaa.bbbb.cccc",
        "Bearer",
        "." * 12,
        _seg({"alg": "RS256"}) + ".!!!not-base64!!!.sig",
    ],
)
def test_garbage_bearer_token_never_reaches_the_network(monkeypatch, token):
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))

    with pytest.raises(HTTPException) as exc_info:
        security.verify_token(_creds(token))

    assert exc_info.value.status_code == 401
    assert fetch.calls == [], f"garbage token {token!r} triggered a JWKS fetch"


def test_header_without_kid_is_rejected_before_the_fetch(monkeypatch):
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))

    with pytest.raises(HTTPException) as exc_info:
        security.verify_token(_creds(_token({"alg": "RS256"})))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid token: missing kid"
    assert fetch.calls == []


def test_structurally_valid_token_with_a_kid_does_fetch(monkeypatch):
    """The counterweight to the tests above.

    Without this, "no fetch happened" would also pass if the fetch were removed
    entirely, or if verify_token started refusing every token before it got there.
    """
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))
    monkeypatch.setattr(security.jwt, "decode", lambda *a, **k: {"sub": "user-1"})

    claims = security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert claims == {"sub": "user-1"}
    assert len(fetch.calls) == 1
    assert fetch.calls[0][0] == JWKS_URL


# --------------------------------------------------------------------------
# Defect 1: the fetch has a timeout
# --------------------------------------------------------------------------


def test_jwks_fetch_always_passes_a_positive_timeout(monkeypatch):
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))

    security.get_cognito_public_keys()

    _url, kwargs = fetch.calls[0]
    assert "timeout" in kwargs, "an untimed JWKS fetch holds a threadpool slot open"
    assert kwargs["timeout"] > 0


def test_the_jwks_fetch_timeout_is_pinned_at_ten_seconds():
    """10s over the original 5s, written down so the trade is not re-made silently.

    Doubling a bound on a pre-authentication path is not free, and the argument for
    it is not "parity is tidy": rbac._JWKS_FETCH_TIMEOUT fetches this same document
    with 10, so at 5 a Cognito response between the two bounds verifies a token
    through the middleware and refuses the same token through this dependency.

    The occupancy that 5s appears to buy back is not for sale here. safe_fetch hands
    this number to http.client as the socket timeout, which bounds one recv rather
    than the request - probed against a local trickling server while judging this:
    with timeout=1.0, a body delivered in five one-byte chunks 0.6s apart came back
    whole after 3.03s, and only a gap longer than 1.0s raised TimeoutError. A JWKS
    host that trickles holds the worker as long as it likes at 5 or at 10. The bounds
    that do bind are pinned by test_one_request_makes_at_most_one_jwks_fetch and
    test_the_jwks_fetch_caps_the_body_far_below_the_safe_fetch_default; a wall-clock
    deadline over a whole fetch would have to be added inside safe_fetch.
    """
    assert security._JWKS_TIMEOUT_S == 10.0


def test_the_jwks_fetch_caps_the_body_far_below_the_safe_fetch_default(monkeypatch):
    """A pre-authentication fetch must not accept a 5 MiB body.

    safe_fetch's default cap is the one an authenticated, deliberate API call wants.
    Here the request is unauthenticated and the document is two RS256 keys under a
    kilobyte, so the default lets whoever controls the JWKS host make every
    unauthenticated request buffer 5 MiB, a byte at a time. The cap stays generous
    because safe_fetch.fetch_json raises response_too_large on truncation rather
    than parsing a prefix, so too tight a cap is an outage.
    """
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))

    security.get_cognito_public_keys()

    _url, kwargs = fetch.calls[0]
    assert kwargs["max_bytes"] == 64 * 1024
    assert kwargs["max_bytes"] < safe_fetch.DEFAULT_MAX_BYTES


# --------------------------------------------------------------------------
# Defect 4: the 401 body says nothing about where our pool is
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "failure",
    [
        SafeFetchError("fetch_timeout", f"timed out fetching {JWKS_URL}"),
        SafeFetchError("blocked_link_local_address", f"host=cognito-idp.{REGION}.amazonaws.com resolved=169.254.169.254"),
        OSError(f"HTTPSConnectionPool(host='cognito-idp.{REGION}.amazonaws.com', port=443): Max retries exceeded with url: /{POOL_ID}/.well-known/jwks.json"),
        ValueError(f"unexpected document at {JWKS_URL}"),
        # The refusal core.security raises itself, and the one these assertions used
        # to skip. Its reason contains "jwks", so while the reason was interpolated
        # into the body the 401 read "Authentication failed: invalid_jwks_response" -
        # an unauthenticated caller told our key document came back unusable.
        SafeFetchError("invalid_jwks_response", "no usable JWKS entry carrying a 'kid'"),
    ],
)
def test_jwks_failure_401_does_not_echo_the_pool_or_the_url(monkeypatch, failure):
    _install_fetch(monkeypatch, RecordingFetch(failure))

    with pytest.raises(HTTPException) as exc_info:
        security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert exc_info.value.status_code == 401
    detail = str(exc_info.value.detail)
    for leak in LEAKY_SUBSTRINGS:
        assert leak.lower() not in detail.lower(), f"401 detail leaked {leak!r}: {detail}"


def test_decode_failure_401_does_not_echo_the_underlying_message(monkeypatch):
    """A jose error message can quote claim values and the issuer it expected."""
    _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))

    def _raise(*_args, **_kwargs):
        raise security.JWTError(f"Invalid issuer, expected https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}")

    monkeypatch.setattr(security.jwt, "decode", _raise)

    with pytest.raises(HTTPException) as exc_info:
        security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert exc_info.value.status_code == 401
    detail = str(exc_info.value.detail)
    for leak in LEAKY_SUBSTRINGS:
        assert leak.lower() not in detail.lower(), f"401 detail leaked {leak!r}: {detail}"


@pytest.mark.parametrize(
    "outcome,reason",
    [
        (SafeFetchError("fetch_timeout", "detail"), "fetch_timeout"),
        (
            SafeFetchError("blocked_private_address", "host=idp.example.net resolved=10.0.3.19"),
            "blocked_private_address",
        ),
        (SafeFetchError("http_status_error", "status=503"), "http_status_error"),
        (SafeFetchError("response_too_large", "body exceeded the cap"), "response_too_large"),
        (
            SafeFetchError("invalid_jwks_response", "no usable JWKS entry carrying a 'kid'"),
            "invalid_jwks_response",
        ),
        # Not raised by the fetch at all: a 200 carrying no usable key, which is
        # core.security raising invalid_jwks_response itself. Same body required.
        ({"keys": []}, "invalid_jwks_response"),
    ],
)
def test_the_jwks_failure_reason_goes_to_the_log_and_not_to_the_caller(
    monkeypatch, caplog, outcome, reason
):
    """One fixed body for every refusal; the specific reason only in the log.

    Each reason is a stable category, which is why it used to be interpolated into
    the body, but the categories themselves describe this deployment:
    invalid_jwks_response says our key document came back unusable and
    blocked_private_address says our IdP resolves into private space. An allowlist of
    reasons safe to echo would need an edit every time safe_fetch grew a reason, and
    would be wrong in the disclosing direction until someone noticed, so one fixed
    string is the whole policy - and the reason has to still be recoverable by
    whoever is on call, which is what the log assertion below is for.
    """
    _install_fetch(monkeypatch, RecordingFetch(outcome))

    with caplog.at_level(logging.WARNING, logger=security.logger.name):
        with pytest.raises(HTTPException) as exc_info:
            security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authentication failed: key_retrieval_failed"
    assert reason not in str(exc_info.value.detail)
    assert any(reason in r.getMessage() for r in caplog.records), (
        "the reason left the response and never arrived in the log either"
    )


def test_kid_not_in_jwks_is_a_plain_401(monkeypatch):
    _install_fetch(monkeypatch, RecordingFetch({"keys": [{"kid": "some-other-kid"}]}))

    with pytest.raises(HTTPException) as exc_info:
        security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid token: kid not found"


# --------------------------------------------------------------------------
# Defect 2: the cache has a TTL, and never holds a failure
# --------------------------------------------------------------------------


def test_jwks_is_cached_within_the_ttl(monkeypatch):
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))

    first = security.get_cognito_public_keys()
    second = security.get_cognito_public_keys()

    assert first == second == GOOD_JWKS
    assert len(fetch.calls) == 1


def test_jwks_cache_expires_after_the_ttl(monkeypatch):
    rotated = {"keys": [{"kid": "kid-2"}]}
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS, rotated))

    assert security.get_cognito_public_keys() == GOOD_JWKS

    # Age the cache past its TTL. Before this had a TTL, a Cognito key rotation
    # refused every token until the process restarted. The clock is monotonic
    # because security.py's age comparison is - see the test below for why.
    security._cognito_keys_time = time.monotonic() - (security._JWKS_CACHE_TTL + 1)

    assert security.get_cognito_public_keys() == rotated
    assert len(fetch.calls) == 2


def test_cache_expiry_survives_a_wall_clock_step_backwards(monkeypatch):
    """The TTL is measured on a clock that cannot go backwards.

    On time.time(), an NTP correction that steps the wall clock back further than
    the TTL makes `now - fetched_at` negative, which compares as "still fresh" and
    pins the pre-rotation key set until the clock catches up - the never-expiring
    cache the TTL exists to prevent.
    """
    rotated = {"keys": [{"kid": "kid-2"}]}
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS, rotated))
    clock = FakeClock()
    monkeypatch.setattr(security, "time", clock)

    assert security.get_cognito_public_keys() == GOOD_JWKS

    clock.mono += security._JWKS_CACHE_TTL + 1
    clock.wall -= 86400  # NTP steps a day into the past

    assert security.get_cognito_public_keys() == rotated
    assert len(fetch.calls) == 2


def test_jwks_cache_ttl_matches_rbac(monkeypatch):
    """Same document, same lifetime. Two TTLs for one JWKS is a bug waiting."""
    assert security._JWKS_CACHE_TTL == rbac._JWKS_CACHE_TTL


def test_jwks_fetch_timeout_matches_rbac():
    """Same document, same patience.

    A Cognito response between the two timeouts would be accepted by the rbac
    middleware and refused by this dependency, so the same request would succeed
    or fail depending on which auth path it took.
    """
    assert security._JWKS_TIMEOUT_S == rbac._JWKS_FETCH_TIMEOUT


def test_failed_fetch_is_not_cached(monkeypatch):
    fetch = _install_fetch(
        monkeypatch, RecordingFetch(SafeFetchError("fetch_timeout", "detail"), GOOD_JWKS)
    )

    with pytest.raises(SafeFetchError):
        security.get_cognito_public_keys()

    assert security._cognito_keys is None
    assert security.get_cognito_public_keys() == GOOD_JWKS
    assert len(fetch.calls) == 2


@pytest.mark.parametrize(
    "document",
    [
        {},
        {"keys": None},
        {"keys": {"kid": "kid-1"}},
        [],
        "not json object",
        # The four below are a *list* under "keys", so a shape check that only
        # asked for a list called them valid and cached them for the full hour -
        # every login refused until the TTL ran out, which is the outage the TTL
        # itself was added to prevent.
        {"keys": []},
        {"keys": ["kid-1", 7]},
        {"keys": [{"kty": "RSA"}]},
        {"keys": [{"kid": ""}]},
    ],
)
def test_a_200_that_is_not_a_jwks_is_not_cached(monkeypatch, document):
    fetch = _install_fetch(monkeypatch, RecordingFetch(document, GOOD_JWKS))

    with pytest.raises(SafeFetchError) as exc_info:
        security.get_cognito_public_keys()

    assert exc_info.value.reason == "invalid_jwks_response"
    assert security._cognito_keys is None
    assert security.get_cognito_public_keys() == GOOD_JWKS
    assert len(fetch.calls) == 2


# --------------------------------------------------------------------------
# Defect 5: the issuer is verified, as rbac already does
# --------------------------------------------------------------------------


def test_decode_verifies_issuer_and_audience(monkeypatch):
    _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))
    captured = {}

    def _capture(token, key, **kwargs):
        captured["token"] = token
        captured["key"] = key
        captured.update(kwargs)
        return {"sub": "user-1"}

    monkeypatch.setattr(security.jwt, "decode", _capture)

    security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert captured["issuer"] == f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"
    assert captured["audience"] == CLIENT_ID
    assert captured["algorithms"] == ["RS256"]
    assert captured["options"]["verify_exp"] is True
    assert captured["key"] == GOOD_JWKS["keys"][0]


def test_expected_issuer_is_built_the_same_way_rbac_builds_it():
    """The two auth paths must expect the same issuer.

    Compared against rbac._issuer() itself, not against a re-derived f-string: a
    copy of the format string here agrees with itself no matter what rbac does, so
    it stayed green when rbac._issuer() was pointed at a different host - exactly
    the divergence this test exists to catch. The literal shape is pinned once, by
    test_decode_verifies_issuer_and_audience above.
    """
    assert security._expected_issuer() == rbac._issuer()


# --------------------------------------------------------------------------
# A signing-key rotation inside the TTL, and junk beside the good keys
# --------------------------------------------------------------------------


def test_unknown_kid_against_a_cached_document_refetches_and_then_verifies(monkeypatch):
    """Cognito can rotate its signing keys inside our hour-long TTL.

    rbac.py gets this behaviour from PyJWKClient, which force-refreshes on an
    unknown kid. Without the same thing here the middleware accepts a post-rotation
    token that this dependency refuses, for as long as the stale document lives.

    The cache is seeded rather than left cold, because a cold cache is the case
    where the refetch is pointless and is deliberately skipped - see
    test_one_request_makes_at_most_one_jwks_fetch. Seeded here means the single
    fetch this test counts is the forced one.
    """
    rotated = {"keys": [{"kid": "kid-2", "kty": "RSA", "n": "bbb", "e": "AQAB"}]}
    fetch = _install_fetch(monkeypatch, RecordingFetch(rotated))
    monkeypatch.setattr(security.jwt, "decode", lambda *a, **k: {"sub": "user-1"})

    security._cognito_keys = GOOD_JWKS
    security._cognito_keys_time = time.monotonic()

    claims = security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-2"})))

    assert claims == {"sub": "user-1"}
    assert len(fetch.calls) == 1, "an unknown kid did not trigger a refetch"
    assert security._cognito_keys == rotated


def test_one_request_makes_at_most_one_jwks_fetch(monkeypatch):
    """A cold cache plus an unknown kid must not open two JWKS sessions.

    This is the bound that answers the pre-authentication occupancy question the
    10s timeout raises: whatever one fetch can cost, one unauthenticated request
    pays it once. The forced refetch only helps against a cached document - a
    document this request pulled off the wire microseconds ago returns the same keys
    if pulled again - so it is skipped, and the rate-limit budget is left for a
    request that can use it.
    """
    fetch = _install_fetch(
        monkeypatch, RecordingFetch(GOOD_JWKS, {"keys": [{"kid": "kid-2"}]})
    )

    with pytest.raises(HTTPException) as exc_info:
        security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-nobody-has"})))

    assert exc_info.value.detail == "Invalid token: kid not found"
    assert len(fetch.calls) == 1, "a cold-cache kid miss fetched the same document twice"
    assert security._jwks_forced_refresh_time == float("-inf"), (
        "a refetch that never happened spent the rate-limit budget"
    )


def test_the_forced_refetch_is_rate_limited(monkeypatch):
    """The kid comes out of an UNVERIFIED header, so it must not be a fetch lever.

    An unauthenticated caller picks the kid. If every miss refetched, each bogus
    bearer string would become one outbound HTTPS request to Cognito - the refresh
    would be a traffic amplifier attached to the pre-authentication path.
    """
    fetch = _install_fetch(monkeypatch, RecordingFetch(GOOD_JWKS))
    creds = _creds(_token({"alg": "RS256", "kid": "kid-nobody-has"}))

    for _ in range(5):
        with pytest.raises(HTTPException) as exc_info:
            security.verify_token(creds)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token: kid not found"

    # The cold fetch, plus exactly one forced refetch however many misses arrive:
    # the first miss is against the document it just fetched so it does not refetch,
    # the second miss is against a cached one and spends the budget, and the rest
    # find the window shut.
    assert len(fetch.calls) == 2


# The two tests below bracket _JWKS_FORCED_REFRESH_MIN_INTERVAL_S with literal
# seconds - 61 on the allowed side, 59 on the refused side - rather than deriving
# the offset from the constant. A derived offset agrees with whatever the constant
# happens to say: at 0 the rate limit is gone and the pre-authentication
# fetch-per-bogus-token amplifier is back, at 86400 forced refresh never fires
# again, and a test written as `constant + 1` passes in both worlds.


def test_a_forced_refetch_is_allowed_again_61_seconds_later(monkeypatch):
    """The rate limit is a floor on the interval, not a once-per-process budget.

    A second rotation an hour later still has to be picked up; a latch would turn
    the throttle into the outage it was protecting against.
    """
    # Only the forced refetch will call this: the cache is seeded fresh below.
    rotated = {"keys": [{"kid": "kid-2"}]}
    fetch = _install_fetch(monkeypatch, RecordingFetch(rotated))
    creds = _creds(_token({"alg": "RS256", "kid": "kid-2"}))
    monkeypatch.setattr(security.jwt, "decode", lambda *a, **k: {"sub": "user-1"})
    clock = FakeClock()
    monkeypatch.setattr(security, "time", clock)

    security._cognito_keys = GOOD_JWKS
    security._cognito_keys_time = clock.mono
    security._jwks_forced_refresh_time = clock.mono - 61

    assert security.verify_token(creds) == {"sub": "user-1"}
    assert len(fetch.calls) == 1


def test_a_forced_refetch_59_seconds_after_the_last_one_is_refused(monkeypatch):
    """The other side of the bracket: inside the window, the miss stays a miss."""
    fetch = _install_fetch(monkeypatch, RecordingFetch({"keys": [{"kid": "kid-2"}]}))
    creds = _creds(_token({"alg": "RS256", "kid": "kid-2"}))
    clock = FakeClock()
    monkeypatch.setattr(security, "time", clock)

    security._cognito_keys = GOOD_JWKS
    security._cognito_keys_time = clock.mono
    security._jwks_forced_refresh_time = clock.mono - 59

    with pytest.raises(HTTPException) as exc_info:
        security.verify_token(creds)

    assert exc_info.value.detail == "Invalid token: kid not found"
    assert fetch.calls == [], "a second forced refetch got through inside the minute"


def test_the_forced_refresh_interval_is_pinned_at_one_minute():
    """The value itself, plus the two bounds it has to sit between.

    One minute still tracks a rotation inside a minute, against the hour the TTL
    alone would cost, and caps the pre-authentication amplification at one outbound
    fetch per minute no matter how many made-up kids arrive.
    """
    assert security._JWKS_FORCED_REFRESH_MIN_INTERVAL_S == 60

    # Above the fetch timeout, and the honest reading of that ordering is narrower
    # than it looks. What the 60s is for is the amplification bound: the kid comes
    # out of an UNVERIFIED token header, so this interval is the ceiling on how
    # often an unauthenticated caller can convert a made-up kid into an outbound
    # HTTPS fetch. Keeping that ceiling above the cost of the fetch it rations is
    # what makes "one per minute" a statement about the outbound load, rather than
    # about how often a *new* fetch joins the ones already running.
    #
    # It is specifically NOT the non-overlap invariant a reader is likely to infer
    # from 60 > 10. _load_cognito_public_keys stamps _jwks_forced_refresh_time = now
    # *before* it goes out, so the window reopens 60s after a fetch STARTED, and
    # nothing on this path serialises loads. 10s bounds a whole fetch only where the
    # socket timeout happens to: per the _JWKS_TIMEOUT_S note it bounds one recv, and
    # a JWKS host that trickles its body holds one fetch well past a minute. A second
    # forced fetch then does start while the first is in flight - two sockets, and two
    # threadpool slots, over one document. This assert does not prevent that, and
    # neither does anything else here.
    #
    # rbac fetches the same document and its constants deliberately sit the other way
    # round: _JWKS_FETCH_BACKOFF_FLOOR is 1.0, below its _JWKS_FETCH_TIMEOUT of 10. It
    # can afford that because its deadline is anchored at fetch END under
    # _jwks_load_lock, which frees the length to be chosen for availability and scaled
    # off what the last attempt actually cost (_JWKS_FETCH_BACKOFF_FACTOR). Neither the
    # end anchor nor the lock exists on this path, so nothing here is imported from it.
    assert security._JWKS_FORCED_REFRESH_MIN_INTERVAL_S > security._JWKS_TIMEOUT_S

    # And far below the TTL, or the TTL refetches first and forced refresh is dead
    # code that only looks like rotation coverage.
    assert security._JWKS_FORCED_REFRESH_MIN_INTERVAL_S < security._JWKS_CACHE_TTL


@pytest.mark.parametrize(
    "document",
    [
        {"keys": [{"kty": "RSA"}, GOOD_JWKS["keys"][0]]},
        {"keys": ["kid-1", GOOD_JWKS["keys"][0]]},
        {"keys": [7, {"kid": None}, GOOD_JWKS["keys"][0]]},
    ],
)
def test_junk_beside_a_good_key_still_verifies(monkeypatch, document):
    """One odd array member must not refuse a token whose key is right there.

    A dict without a kid raises KeyError under `k["kid"]`, and a non-dict entry
    raises AttributeError under `k.get("kid")`; either lands in the generic
    handler as "Authentication failed" for a token that is perfectly valid.
    """
    fetch = _install_fetch(monkeypatch, RecordingFetch(document))
    monkeypatch.setattr(security.jwt, "decode", lambda *a, **k: {"sub": "user-1"})

    claims = security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert claims == {"sub": "user-1"}
    assert len(fetch.calls) == 1, "the key was found, so nothing should have refetched"


# --------------------------------------------------------------------------
# The refusal an operator can legitimately be on the wrong side of
# --------------------------------------------------------------------------


def test_a_private_jwks_address_names_the_setting_that_permits_it(monkeypatch, caplog):
    """A refusal the operator can act on has to say so somewhere.

    Split-horizon DNS, or a cognito-idp interface endpoint, resolves the issuer
    into private space and safe_fetch refuses it. The 401 body carries only a
    category by design, so the log is the operator's only pointer and it has to
    name SAFE_FETCH_ALLOWED_PRIVATE_CIDRS. The address stays out of that record -
    the warning already carries it once, and the actionable line does not need it.
    """
    _install_fetch(
        monkeypatch,
        RecordingFetch(
            SafeFetchError(
                "blocked_private_address",
                f"host=cognito-idp.{REGION}.amazonaws.com resolved=10.0.3.19",
            )
        ),
    )

    with caplog.at_level(logging.ERROR, logger=security.logger.name):
        with pytest.raises(HTTPException) as exc_info:
            security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    assert exc_info.value.status_code == 401
    actionable = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert any("SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in m for m in actionable), (
        "a private JWKS address left the operator with only a category string"
    )
    assert not any("10.0.3.19" in m for m in actionable)


@pytest.mark.parametrize(
    "reason",
    ["blocked_link_local_address", "blocked_loopback_address", "fetch_timeout"],
)
def test_refusals_the_allowlist_cannot_override_do_not_advertise_it(monkeypatch, caplog, reason):
    """169.254.169.254 is the asset being protected, not a misconfiguration.

    safe_fetch refuses loopback and link-local whatever an operator writes into
    SAFE_FETCH_ALLOWED_PRIVATE_CIDRS, so telling them to add it there is advice
    that cannot work - and it invites someone to widen the setting looking for an
    effect it will never have.
    """
    _install_fetch(monkeypatch, RecordingFetch(SafeFetchError(reason, "detail")))

    with caplog.at_level(logging.ERROR, logger=security.logger.name):
        with pytest.raises(HTTPException):
            security.verify_token(_creds(_token({"alg": "RS256", "kid": "kid-1"})))

    actionable = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert not any("SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in m for m in actionable)
