"""Unit tests for core.rbac's Cognito JWKS client.

Covers the fix where _decode_jwt built a fresh PyJWKClient per call, so the
client's key-set cache never hit and every request - including an unauthenticated
one carrying a garbage token - drove one outbound JWKS fetch, on the event loop.
And where the module also carried a dead _get_jwks() that fetched with urlopen()
and no timeout at all, which is the shape a future reader copies.

Sharing the client was not enough on its own, which is what most of this file is
about: PyJWKClient.get_signing_key_from_jwt() answers any kid it does not
recognise with get_signing_keys(refresh=True), so a caller who has not
authenticated and simply invents a kid per request still got one outbound HTTPS
fetch per request with the cache bypassed. _FakeJWKClient below implements that
real PyJWT behaviour, so the fetch-count assertions fail if rbac ever goes back to
calling it.

What is asserted:
  1. One client is constructed across N verifications, not N.
  2. It is constructed with a non-None, positive timeout and real key-set caching,
     and the fetch backoff always outlasts the attempt that earned it - without
     charging a millisecond-fast failure what a full-timeout hang costs.
  3. The kwargs and the client API rbac depends on are accepted by the installed
     PyJWT, so a version bump fails here instead of at runtime in the auth path.
  4. The client is rebuilt when the JWKS URL changes (pool/region reconfigured).
  5. An unrecognised kid is cheap: no fetch with a warm cache once the window has
     been used, and a cold-start burst produces one fetch, not one per request -
     including when the backoff is shorter than the attempt queued behind, which is
     what anchoring the deadline at the end of the attempt buys. Waiters are honestly
     slow, not fail-fast, and that latency is asserted rather than described.
  6. A real key rotation is still picked up once the window reopens, and the window
     does reopen on its own.
  7. A JWKS failure yields a generic 401 that leaks neither issuer nor pool id, in
     detail, in headers, and in the response bytes on the wire, even when the
     underlying exception message contains both.
  8. require_role runs the blocking verification off the event loop, still returns
     the role / raises 403, and still surfaces a 401 raised inside the thread.
  9. Nothing in the module fetches without a timeout.
"""

import ast
import asyncio
import base64
import inspect
import json
import threading
import time
import types

import pytest

from core import rbac
from core.config import settings


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    """The client cache is module state; a leaked instance would make test 1 lie.

    _jwks_fetch_blocked_until is reset for the same reason in reverse: a window left
    closed by an earlier test would make a later fetch-count assertion pass for
    the wrong reason.
    """
    rbac._jwks_client = None
    rbac._jwks_client_url = None
    rbac._jwks_fetch_blocked_until = None
    yield
    rbac._jwks_client = None
    rbac._jwks_client_url = None
    rbac._jwks_fetch_blocked_until = None


def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _token(kid: str = "kid-1") -> str:
    """A structurally valid JWS whose header names `kid`.

    The signature is never checked here, but the header has to really decode:
    rbac now reads the kid before going anywhere near the network.
    """
    header = _b64u(json.dumps({"alg": "RS256", "kid": kid}).encode())
    payload = _b64u(json.dumps({"sub": "u1"}).encode())
    return f"{header}.{payload}.{_b64u(b'not-a-real-signature')}"


class _FakeKey:
    def __init__(self, kid):
        self.key_id = kid
        self.key = f"public-key-for-{kid}"


def _jwks_client_cls(remote_kids=("kid-1",), *, fetch_delay=0.0, fetch_error=None):
    """A PyJWKClient stand-in that records constructions and counts real fetches.

    Mirrors the members core.rbac touches - jwk_set_cache, get_signing_keys,
    match_kid - with PyJWT's own semantics: a fetch populates the cache, a failed
    fetch clears it (fetch_data puts the None in a `finally`), and
    get_signing_key_from_jwt force-refreshes on an unrecognised kid. That last one
    is deliberately faithful so the fetch-count tests fail if rbac starts calling
    it again.
    """
    state = types.SimpleNamespace(
        constructions=[],
        fetches=0,
        remote_kids=list(remote_kids),
        fetch_delay=fetch_delay,
        fetch_error=fetch_error,
    )

    class _Cache:
        def __init__(self):
            self.doc = None

        def get(self):
            return self.doc

    class _FakeJWKClient:
        def __init__(self, uri, **kwargs):
            state.constructions.append((uri, kwargs))
            self.uri = uri
            self.kwargs = kwargs
            self.jwk_set_cache = _Cache()

        def _fetch(self):
            state.fetches += 1
            if state.fetch_delay:
                time.sleep(state.fetch_delay)
            if state.fetch_error is not None:
                self.jwk_set_cache.doc = None
                raise state.fetch_error
            self.jwk_set_cache.doc = {"keys": [{"kid": k} for k in state.remote_kids]}

        def get_signing_keys(self, refresh=False):
            if refresh or self.jwk_set_cache.get() is None:
                self._fetch()
            return [_FakeKey(k["kid"]) for k in self.jwk_set_cache.get()["keys"]]

        @staticmethod
        def match_kid(signing_keys, kid):
            for key in signing_keys:
                if key.key_id == kid:
                    return key
            return None

        def get_signing_key_from_jwt(self, token):
            import jwt as pyjwt

            kid = pyjwt.get_unverified_header(token).get("kid")
            key = self.match_kid(self.get_signing_keys(), kid)
            if key is None:
                key = self.match_kid(self.get_signing_keys(refresh=True), kid)
            if key is None:
                raise RuntimeError(f'Unable to find a signing key that matches: "{kid}"')
            return key

    return _FakeJWKClient, state


def _install_client(monkeypatch, cls, pool_id="us-east-1_TESTPOOL"):
    """Point _decode_jwt at a fake client and a configured pool."""
    import jwt as pyjwt

    monkeypatch.setattr(pyjwt, "PyJWKClient", cls)
    monkeypatch.setattr(settings, "COGNITO_USER_POOL_ID", pool_id)
    return pyjwt


def _request(**headers):
    """_extract_role only ever does request.headers.get(...)."""
    return types.SimpleNamespace(headers=headers)


# ---------------------------------------------------------------------------
# 1 + 2: one client, with a timeout
# ---------------------------------------------------------------------------

def test_client_constructed_once_across_many_verifications():
    cls, state = _jwks_client_cls()

    for _ in range(25):
        client = rbac._get_jwks_client(cls)
        assert isinstance(client, cls)

    assert len(state.constructions) == 1, (
        f"expected one JWKS client for 25 verifications, got {len(state.constructions)}"
    )


def test_repeated_decode_reuses_one_client(monkeypatch):
    """The live path: _decode_jwt must not build a client per call."""
    cls, state = _jwks_client_cls()
    pyjwt = _install_client(monkeypatch, cls)
    monkeypatch.setattr(pyjwt, "decode", lambda token, key, **kw: {"sub": "u1", "kw": kw})

    for _ in range(10):
        claims = rbac._decode_jwt(_token())
        assert claims["sub"] == "u1"

    assert len(state.constructions) == 1, (
        f"_decode_jwt built {len(state.constructions)} clients for 10 decodes"
    )
    # The verified issuer must still be the pool's issuer, not the JWKS URL.
    assert claims["kw"]["issuer"] == "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TESTPOOL"


def test_client_is_constructed_with_a_timeout():
    cls, state = _jwks_client_cls()

    rbac._get_jwks_client(cls)

    (uri, kwargs) = state.constructions[0]
    assert uri == rbac._jwks_url()
    assert "timeout" in kwargs, "JWKS fetch was constructed without a timeout"
    assert kwargs["timeout"] is not None
    assert kwargs["timeout"] > 0
    # Caching has to be on, or the module-level instance buys nothing.
    assert kwargs["cache_jwk_set"] is True
    assert kwargs["lifespan"] == rbac._JWKS_CACHE_TTL


def test_module_timeout_constant_is_a_real_bound():
    assert rbac._JWKS_FETCH_TIMEOUT is not None
    assert 0 < rbac._JWKS_FETCH_TIMEOUT <= 30, (
        "timeout must be positive and no looser than PyJWKClient's own default"
    )


@pytest.mark.parametrize("elapsed", [0.0, 0.001, 0.05, 0.5, 1.0, 2.0, 9.999, 10.0, 30.0])
def test_backoff_always_outlasts_the_attempt_that_earned_it(elapsed):
    """A slow endpoint is rested for longer than it just cost, at every duration.

    The relationship the old flat window expressed as a single `> _JWKS_FETCH_TIMEOUT`
    comparison, which said nothing about durations below the timeout.
    """
    assert rbac._fetch_backoff(elapsed) > elapsed


def test_a_fast_failure_costs_far_less_availability_than_a_slow_one():
    """The point of scaling the backoff: a Cognito blip is not a Cognito hang.

    While the window is closed and the key set is cold, *valid* tokens get 401
    "Invalid token" - so the window length is an availability bound on the pre-auth
    path, and charging a connection-refused the same 15s as a full hang was the
    regression. The floor is what keeps the amplification ceiling finite.
    """
    refused_fast = rbac._fetch_backoff(0.005)  # connection refused / NXDOMAIN / 503
    hung = rbac._fetch_backoff(rbac._JWKS_FETCH_TIMEOUT)  # burnt the whole timeout

    assert refused_fast == rbac._JWKS_FETCH_BACKOFF_FLOOR
    assert refused_fast <= 1.0, "a fast failure must not hold valid tokens off for long"
    assert hung >= rbac._JWKS_FETCH_TIMEOUT * 1.5
    assert hung > refused_fast * 10, "the two failure modes are not being told apart"
    # Finite floor, or the ceiling goes back to one outbound fetch per request.
    assert rbac._JWKS_FETCH_BACKOFF_FLOOR > 0
    assert rbac._JWKS_FETCH_BACKOFF_FACTOR > 1


# ---------------------------------------------------------------------------
# 3: the kwargs and the client API survive the installed PyJWT
# ---------------------------------------------------------------------------

def test_installed_pyjwt_accepts_the_kwargs_we_pass():
    """Guards against a PyJWT bump silently dropping timeout/lifespan.

    PyJWKClient.__init__ does no I/O - it only stores fields and builds the
    key-set cache - so constructing a real one here is safe and offline.
    """
    from jwt import PyJWKClient

    params = inspect.signature(PyJWKClient.__init__).parameters
    for kwarg in ("timeout", "cache_jwk_set", "lifespan"):
        assert kwarg in params, f"installed PyJWT has no PyJWKClient({kwarg}=...)"

    real = rbac._get_jwks_client(PyJWKClient)
    assert real.timeout == rbac._JWKS_FETCH_TIMEOUT
    assert real.jwk_set_cache is not None, "key-set caching did not take effect"


def test_installed_pyjwt_has_the_cache_only_api_rbac_relies_on():
    """rbac resolves a kid without fetching, which needs three members.

    jwk_set_cache.get() to read the cached document without touching the network,
    get_signing_keys(refresh=...) to leave the fetch decision to us, and match_kid
    to do the lookup with PyJWT's own signing-key filtering. If a bump renames any
    of them, an unknown kid quietly goes back to fetching once per request.
    """
    from jwt import PyJWKClient

    assert "refresh" in inspect.signature(PyJWKClient.get_signing_keys).parameters
    assert callable(PyJWKClient.match_kid)

    real = rbac._get_jwks_client(PyJWKClient)
    assert rbac._cached_jwk_set(real) is None, "a fresh client must report a cold cache"


# ---------------------------------------------------------------------------
# 4: rebuilt when the target changes
# ---------------------------------------------------------------------------

def test_client_rebuilt_when_jwks_url_changes(monkeypatch):
    cls, state = _jwks_client_cls()

    monkeypatch.setattr(settings, "COGNITO_USER_POOL_ID", "us-east-1_POOLONE")
    rbac._get_jwks_client(cls)
    rbac._get_jwks_client(cls)
    assert len(state.constructions) == 1

    monkeypatch.setattr(settings, "COGNITO_USER_POOL_ID", "us-east-1_POOLTWO")
    rbac._get_jwks_client(cls)

    assert len(state.constructions) == 2
    assert "us-east-1_POOLONE" in state.constructions[0][0]
    assert "us-east-1_POOLTWO" in state.constructions[1][0]


# ---------------------------------------------------------------------------
# 5: an unknown kid must not buy an outbound fetch
# ---------------------------------------------------------------------------

def test_known_kid_never_fetches_once_the_cache_is_warm(monkeypatch):
    cls, state = _jwks_client_cls(remote_kids=("kid-1",))
    pyjwt = _install_client(monkeypatch, cls)
    monkeypatch.setattr(pyjwt, "decode", lambda token, key, **kw: {"sub": "u1"})

    rbac._decode_jwt(_token("kid-1"))
    assert state.fetches == 1, "the cold cache should be loaded exactly once"

    for _ in range(10):
        rbac._decode_jwt(_token("kid-1"))

    assert state.fetches == 1, (
        f"a warm cache and a known kid fetched {state.fetches - 1} more times"
    )


def test_unknown_kid_does_not_fetch_per_request(monkeypatch):
    """The amplification this change exists to remove.

    PyJWKClient.get_signing_key_from_jwt() would fetch the whole document for each
    of these, because every kid is one it has never seen.
    """
    cls, state = _jwks_client_cls(remote_kids=("kid-1",))
    pyjwt = _install_client(monkeypatch, cls)
    monkeypatch.setattr(pyjwt, "decode", lambda token, key, **kw: {"sub": "u1"})

    rbac._decode_jwt(_token("kid-1"))  # warm the cache the way a real user would
    state.fetches = 0
    rbac._jwks_fetch_blocked_until = None  # open the window, so the first miss may refresh

    # Broad raises with the type checked afterwards, deliberately: naming the
    # exception class in the `with` would make this fail on the attribute lookup if
    # the guard were removed, hiding the fetch count that is the actual claim.
    refusals = []
    for attempt in range(5):
        with pytest.raises(Exception) as exc_info:
            rbac._decode_jwt(_token(f"attacker-{attempt}"))
        refusals.append(type(exc_info.value).__name__)

    assert state.fetches == 1, (
        f"5 made-up kids drove {state.fetches} outbound JWKS fetches; the window "
        "allows one"
    )
    assert refusals == ["_SigningKeyUnavailableError"] * 5, refusals


def test_token_without_a_kid_is_refused_without_any_fetch(monkeypatch):
    cls, state = _jwks_client_cls()
    _install_client(monkeypatch, cls)

    header = _b64u(json.dumps({"alg": "RS256"}).encode())
    token = f"{header}.{_b64u(b'{}')}.{_b64u(b'sig')}"

    with pytest.raises(Exception) as exc_info:
        rbac._decode_jwt(token)

    assert state.fetches == 0, "a token with no kid reached the network"
    assert type(exc_info.value).__name__ == "_SigningKeyUnavailableError"


def test_unknown_kid_is_refused_while_the_window_is_closed(monkeypatch):
    cls, state = _jwks_client_cls(remote_kids=("kid-1",))
    pyjwt = _install_client(monkeypatch, cls)
    monkeypatch.setattr(pyjwt, "decode", lambda token, key, **kw: {"sub": "u1"})

    rbac._decode_jwt(_token("kid-1"))  # this cold load consumes the window
    state.fetches = 0

    with pytest.raises(Exception) as exc_info:
        rbac._decode_jwt(_token("kid-2"))

    assert state.fetches == 0, "a closed window still let a forced refresh out"
    assert type(exc_info.value).__name__ == "_SigningKeyUnavailableError"


def test_cold_start_burst_makes_a_single_fetch(monkeypatch):
    """The claim _get_jwks_client's docstring used to make and could not keep.

    Its lock only dedupes construction; the fetch is deduped by _jwks_load_lock,
    without which each of these threads would find an empty cache and load it.
    """
    cls, state = _jwks_client_cls(remote_kids=("kid-1",), fetch_delay=0.2)
    pyjwt = _install_client(monkeypatch, cls)
    monkeypatch.setattr(pyjwt, "decode", lambda token, key, **kw: {"sub": "u1"})

    threads_n = 8
    start = threading.Barrier(threads_n)
    results = []

    def _verify():
        start.wait()
        try:
            results.append(rbac._decode_jwt(_token("kid-1")))
        except Exception as exc:  # recorded, not raised: this runs off the main thread
            results.append(exc)

    threads = [threading.Thread(target=_verify) for _ in range(threads_n)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert len(state.constructions) == 1
    assert state.fetches == 1, (
        f"a {threads_n}-way cold-start burst made {state.fetches} JWKS fetches"
    )
    assert results == [{"sub": "u1"}] * threads_n, f"burst results: {results}"


def test_a_failed_fetch_costs_one_attempt_but_every_waiter_pays_its_full_latency(
    monkeypatch,
):
    """Cognito is down and the cache is cold: one attempt, not one per request.

    PyJWT clears the cache when a fetch fails, so without the window each waiter
    would take its own full-timeout turn at the dead socket.

    The latency assertions are the honest half, and this test used to be named for
    the opposite of what it does: the waiters do NOT fail fast. They are blocked on
    _jwks_load_lock for the whole in-flight attempt and only then see the closed
    window, so each one costs a full fetch duration of wall clock and of anyio
    threadpool occupancy. What the window bounds is the number of those durations -
    one per window rather than one per request. Measured at the module's real
    constants: 8 waiters behind a 2s hang each returned at 2.000s.
    """
    delay = 0.4
    cls, state = _jwks_client_cls(
        fetch_delay=delay, fetch_error=RuntimeError("cognito down")
    )
    _install_client(monkeypatch, cls)

    threads_n = 8
    start = threading.Barrier(threads_n)
    failures = []
    latencies = []

    def _verify():
        start.wait()
        began = time.monotonic()
        try:
            rbac._decode_jwt(_token("kid-1"))
            failures.append("decoded")
        except Exception as exc:
            failures.append(type(exc).__name__)
        latencies.append(time.monotonic() - began)

    threads = [threading.Thread(target=_verify) for _ in range(threads_n)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert state.fetches == 1, (
        f"{threads_n} requests against a failing JWKS endpoint made {state.fetches} "
        "attempts; the window allows one"
    )
    assert failures.count("RuntimeError") == 1, failures
    assert failures.count("_SigningKeyUnavailableError") == threads_n - 1, failures

    assert len(latencies) == threads_n
    # Not fail-fast: every waiter waited out the attempt it was queued behind.
    assert min(latencies) >= delay * 0.9, (
        f"a waiter returned in {min(latencies):.3f}s, under the {delay}s attempt it "
        "was queued behind - the lock-and-recheck structure this pins has changed, so "
        "re-measure before rewording the comments that cite it"
    )
    # There is deliberately no upper bound on the latency here, and that leaves a real
    # gap rather than closing one. The mutations this test was written against -
    # serialising the attempts, or sleeping until the window reopens instead of refusing
    # - each move state.fetches off 1, so for those the count assertion above is what
    # fires and a ceiling would add nothing. That does not generalise to every mutation
    # that inflates a waiter's latency. Measured counterexample: a sleep-then-refuse
    # with no recheck (0.13s per waiter immediately before the closed-window raise,
    # 0.91s cumulative, still inside the 1.0s floor) keeps state.fetches at 1 and passes
    # this test, yet took max waiter latency to 1.384s against a 0.4s attempt - an upper
    # bound of delay*3 would have caught it. It is left out because a wall-clock ceiling
    # across 8 threads is the assertion most likely to fail on a loaded machine for no
    # reason, not because nothing could trip it. So what this test pins is the attempt
    # count and the not-fail-fast floor; latency growth above that floor is uncovered.


def test_a_hung_fetch_cannot_pile_up_even_with_a_backoff_shorter_than_it(monkeypatch):
    """The reason the deadline is anchored at the END of an attempt.

    Every reader of the deadline holds _jwks_load_lock and the fetch runs under that
    same lock, so a queued request cannot read the deadline until the attempt it waited
    on has set it. A backoff much shorter than the attempt therefore still refuses the
    whole queue, which is what frees the backoff length from _JWKS_FETCH_TIMEOUT and
    lets it be chosen for availability instead. The bound is drain time, not zero: each
    waiter reads the deadline when it gets the lock, so a queue slower to drain than the
    backoff would see the window reopen. A refused waiter only does a cache check and a
    clock compare, which is why 8 of them stay inside even the 0.01s backoff below.

    Anchored at the START - which is what this module did - the property holds only
    while the window outlasts the fetch, so this configuration (backoff far shorter
    than the hang) is exactly the one that regresses: measured on that version, 8
    queued requests made 8 fetches and returned 2s apart.
    """
    delay = 0.4
    monkeypatch.setattr(rbac, "_JWKS_FETCH_BACKOFF_FLOOR", 0.01)
    monkeypatch.setattr(rbac, "_JWKS_FETCH_BACKOFF_FACTOR", 0.01)
    assert rbac._fetch_backoff(delay) < delay * 0.5, "the backoff is not shorter than the hang"

    cls, state = _jwks_client_cls(fetch_delay=delay, fetch_error=RuntimeError("hung"))
    _install_client(monkeypatch, cls)

    threads_n = 8
    start = threading.Barrier(threads_n)
    done = []

    def _verify():
        start.wait()
        try:
            rbac._decode_jwt(_token("kid-1"))
        except Exception as exc:
            done.append(type(exc).__name__)

    threads = [threading.Thread(target=_verify) for _ in range(threads_n)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)

    assert len(done) == threads_n, done
    assert state.fetches == 1, (
        f"{threads_n} requests behind one {delay}s attempt made {state.fetches} "
        "fetches; the fetch deadline is being measured from the start of the attempt "
        "again, so the queue outlives the window and each waiter gets its own turn"
    )


def test_the_window_reopens_after_the_backoff_and_not_before(monkeypatch):
    """A closed window is a delay, not a latch: recovery must not need a restart."""
    monkeypatch.setattr(rbac, "_JWKS_FETCH_BACKOFF_FLOOR", 0.15)
    cls, state = _jwks_client_cls(remote_kids=("kid-1",))
    pyjwt = _install_client(monkeypatch, cls)
    monkeypatch.setattr(pyjwt, "decode", lambda token, key, **kw: {"sub": "u1"})

    rbac._decode_jwt(_token("kid-1"))  # cold load consumes the window
    assert state.fetches == 1

    with pytest.raises(Exception) as exc_info:
        rbac._decode_jwt(_token("kid-2"))  # still inside the backoff
    assert type(exc_info.value).__name__ == "_SigningKeyUnavailableError"
    assert state.fetches == 1, "the closed window let a forced refresh out"

    time.sleep(0.2)  # > the patched floor
    state.remote_kids.append("kid-2")
    rbac._decode_jwt(_token("kid-2"))

    assert state.fetches == 2, "the window never reopened; a rotation would never land"


# ---------------------------------------------------------------------------
# 6: rotation still works
# ---------------------------------------------------------------------------

def test_rotation_is_picked_up_once_the_window_reopens(monkeypatch):
    cls, state = _jwks_client_cls(remote_kids=("kid-1",))
    pyjwt = _install_client(monkeypatch, cls)
    monkeypatch.setattr(pyjwt, "decode", lambda token, key, **kw: {"sub": "u1", "key": key})

    rbac._decode_jwt(_token("kid-1"))

    # Cognito rotates: a kid we hold no key for is now legitimate.
    state.remote_kids.append("kid-2")
    rbac._jwks_fetch_blocked_until = time.monotonic() - 0.001  # the window has reopened

    claims = rbac._decode_jwt(_token("kid-2"))

    assert claims["key"] == "public-key-for-kid-2", "the refreshed key set was not used"
    assert state.fetches == 2, f"expected one forced refresh, saw {state.fetches - 1}"


# ---------------------------------------------------------------------------
# 7: generic 401, no target echoed
# ---------------------------------------------------------------------------

_LEAK_POOL_ID = "us-east-1_XYZ"
_LEAKY_FETCH_MESSAGE = (
    f"Fail to fetch data from the url, err: "
    f"https://cognito-idp.us-east-1.amazonaws.com/{_LEAK_POOL_ID}/.well-known/jwks.json"
)
_LEAK_CANARIES = (
    _LEAK_POOL_ID,
    "cognito-idp",
    "amazonaws.com",
    "jwks.json",
    _LEAKY_FETCH_MESSAGE,
)


def _install_leaky_jwks(monkeypatch):
    cls, state = _jwks_client_cls(fetch_error=RuntimeError(_LEAKY_FETCH_MESSAGE))
    _install_client(monkeypatch, cls, pool_id=_LEAK_POOL_ID)
    # Dev auth would swallow the failure and hand back ADMIN, so turn it off.
    monkeypatch.setattr(rbac, "_is_dev_auth_allowed", lambda: False)
    return state


def test_jwks_failure_raises_generic_401_without_leaking_issuer(monkeypatch):
    """The leak loop runs over every field of the 401 that reaches a client.

    Not over repr(): the installed starlette builds it as exactly
        f"{class_name}(status_code={self.status_code!r}, detail={self.detail!r})"
    (read in site-packages/starlette/exceptions.py), and __init__ never calls
    super().__init__, so .args is empty - repr sees neither args nor headers. With
    detail pinned by the equality below, repr is fully determined and a leak loop over
    it cannot fail, which is what the previous two versions of this assertion did.
    detail and headers are the two fields the exception hands the client, so those are
    what get checked; the wire test below covers the serialised result.
    """
    _install_leaky_jwks(monkeypatch)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        rbac._extract_role(_request(Authorization=f"Bearer {_token()}"))

    raised = exc_info.value
    assert raised.status_code == 401
    assert str(raised.detail) == "Invalid token"

    carried = f"{raised.detail!r} {raised.headers!r}"
    for leak in _LEAK_CANARIES:
        assert leak not in carried, f"the 401 carried {leak!r}"


def test_the_401_on_the_wire_leaks_nothing(monkeypatch):
    """The same claim against the bytes a client actually receives.

    Strictly the larger surface: fastapi's http_exception_handler forwards
    exc.headers into the response (read in site-packages/fastapi/exception_handlers.py),
    so a leak routed through headers while detail stays "Invalid token" shows up here
    and provably cannot show up in repr(exc).
    """
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient

    state = _install_leaky_jwks(monkeypatch)

    app = FastAPI()

    @app.get("/guarded")
    async def _guarded(role: rbac.Role = Depends(rbac.require_role(rbac.Role.VIEWER))):
        return {"role": int(role)}

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/guarded", headers={"Authorization": f"Bearer {_token()}"})

    assert state.fetches == 1, "the request never reached the JWKS fetch it must fail on"
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token"}

    on_the_wire = "\n".join(
        [str(response.status_code)]
        + [f"{name}: {value}" for name, value in response.headers.items()]
        + [response.text]
    )
    for leak in _LEAK_CANARIES:
        assert leak not in on_the_wire, f"the 401 response carried {leak!r}"


def test_dev_auth_still_falls_back_on_jwks_failure(monkeypatch):
    """The deliberate dev-mode bypass must survive the client refactor."""
    cls, _state = _jwks_client_cls(fetch_error=RuntimeError("boom"))
    _install_client(monkeypatch, cls)
    monkeypatch.setattr(rbac, "_is_dev_auth_allowed", lambda: True)

    role = rbac._extract_role(
        _request(Authorization=f"Bearer {_token()}", **{"x-user-email": "nobody@example.com"})
    )
    assert role == rbac.Role.ADMIN


# ---------------------------------------------------------------------------
# 8: off the event loop, same answers
# ---------------------------------------------------------------------------

def test_require_role_runs_verification_off_the_event_loop(monkeypatch):
    seen = {}

    def _spy(request):
        seen["thread"] = threading.get_ident()
        return rbac.Role.ADMIN

    monkeypatch.setattr(rbac, "_extract_role", _spy)

    async def _drive():
        seen["loop_thread"] = threading.get_ident()
        return await rbac.require_role(rbac.Role.VIEWER)(_request())

    role = asyncio.run(_drive())

    assert role == rbac.Role.ADMIN
    assert seen["thread"] != seen["loop_thread"], (
        "the blocking JWT/JWKS verification ran on the event loop thread"
    )


@pytest.mark.parametrize(
    "user_role,min_role,allowed",
    [
        (rbac.Role.VIEWER, rbac.Role.VIEWER, True),
        (rbac.Role.ADMIN, rbac.Role.OPERATOR, True),
        (rbac.Role.VIEWER, rbac.Role.OPERATOR, False),
        (rbac.Role.OPERATOR, rbac.Role.ADMIN, False),
    ],
)
def test_require_role_gate_unchanged(monkeypatch, user_role, min_role, allowed):
    monkeypatch.setattr(rbac, "_extract_role", lambda request: user_role)

    from fastapi import HTTPException

    async def _drive():
        return await rbac.require_role(min_role)(_request())

    if allowed:
        assert asyncio.run(_drive()) == user_role
    else:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_drive())
        assert exc_info.value.status_code == 403
        assert min_role.name.lower() in str(exc_info.value.detail)


def test_require_role_propagates_a_401_raised_inside_the_thread(monkeypatch):
    """The most-travelled failure path of the function that gained the thread hop.

    anyio.to_thread.run_sync re-raises rather than wrapping, so FastAPI still sees
    the HTTPException. If it ever wrapped it in an ExceptionGroup, pytest.raises
    below stops matching and every rejected request would become a 500.
    """
    from fastapi import HTTPException

    def _raise(request):
        raise HTTPException(status_code=401, detail="Missing authorization token")

    monkeypatch.setattr(rbac, "_extract_role", _raise)

    async def _drive():
        return await rbac.require_role(rbac.Role.VIEWER)(_request())

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_drive())

    assert exc_info.value.status_code == 401
    assert str(exc_info.value.detail) == "Missing authorization token"


# ---------------------------------------------------------------------------
# 9: nothing here fetches without a timeout
# ---------------------------------------------------------------------------

_FETCH_NAMES = {"urlopen", "urlretrieve"}


def test_any_direct_fetch_in_rbac_carries_a_timeout():
    """JWKS I/O belongs to PyJWKClient, which _get_jwks_client hands a timeout.

    The dead helper this replaced called urlopen() with no timeout at all. The ban
    is on the untimed call, not on the name: a correctly bounded fetch added here
    later is fine and must not have to fight the test to exist.
    """
    tree = ast.parse(inspect.getsource(rbac))

    offenders = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        via_requests = (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id == "requests"
        )
        if name in _FETCH_NAMES or via_requests:
            if not any(kw.arg == "timeout" for kw in node.keywords):
                offenders.append(f"line {node.lineno}: {name}()")

    assert not offenders, (
        f"rbac.py fetches without a timeout: {offenders}. A timeout-less fetch here "
        "is the pattern the next reader copies."
    )
    assert not hasattr(rbac, "_get_jwks"), "dead _get_jwks() is still exported"


def test_rbac_does_not_use_get_signing_key_from_jwt():
    """That call is the amplification: it refreshes on any kid it has not seen.

    Structural because the cost is invisible in a passing functional test - it
    returns the right key, it just buys the attacker a fetch to do it.
    """
    source = inspect.getsource(rbac)
    tree = ast.parse(source)

    called = {
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }

    assert "get_signing_key_from_jwt" not in called, (
        "rbac calls get_signing_key_from_jwt again; it force-refreshes the key set "
        "for any unrecognised kid, which is one outbound fetch per bogus request"
    )
