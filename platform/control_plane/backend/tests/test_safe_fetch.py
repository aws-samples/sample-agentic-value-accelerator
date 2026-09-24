"""Tests for core.safe_fetch.

Every test here fails against a plain `urllib.request.urlopen`, which is the
point: these are the fetches the routes used to perform.

Three of them exist because the obvious implementation passes the obvious tests
and still reaches the instance metadata service - CGNAT via `is_private`,
multicast via `is_global`, and IMDS wrapped in NAT64 via either one. See
`test_classify_rejects_addresses_that_a_single_predicate_would_allow`.
"""

from __future__ import annotations

import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from core import safe_fetch
from core.safe_fetch import (
    SafeFetchError,
    _ADDRESS_REFUSALS,
    _ALLOWLIST_CANNOT_OVERRIDE,
    _classify,
    _with_params,
    fetch,
    fetch_json,
    is_allowlistable_refusal,
    validate_url,
)

IMDS = "169.254.169.254"
ECS_METADATA = "169.254.170.2"


# --------------------------------------------------------------------------
# Address classification
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "addr,expected",
    [
        (IMDS, "blocked_link_local_address"),
        (ECS_METADATA, "blocked_link_local_address"),
        ("127.0.0.1", "blocked_loopback_address"),
        ("0.0.0.0", "blocked_unspecified_address"),
        ("10.0.0.1", "blocked_private_address"),
        ("172.16.0.1", "blocked_private_address"),
        ("192.168.1.1", "blocked_private_address"),
        ("::1", "blocked_loopback_address"),
        ("fd00::1", "blocked_private_address"),
        ("fe80::1", "blocked_link_local_address"),
        ("240.0.0.1", "blocked_reserved_address"),
    ],
)
def test_classify_rejects_the_obvious_internal_addresses(addr, expected):
    assert _classify(addr) == expected


@pytest.mark.parametrize(
    "addr,why",
    [
        ("100.64.0.1", "CGNAT: ipaddress reports is_private=False for this"),
        ("224.0.0.1", "multicast: ipaddress reports is_global=True for this"),
        (
            "64:ff9b::a9fe:a9fe",
            "IMDS behind the NAT64 well-known prefix: is_global=True AND is_private=False",
        ),
        ("::ffff:169.254.169.254", "IMDS as an IPv4-mapped IPv6 address"),
        ("::ffff:127.0.0.1", "loopback as an IPv4-mapped IPv6 address"),
    ],
)
def test_classify_rejects_addresses_that_a_single_predicate_would_allow(addr, why):
    """The three cases that make this a conjunction rather than one property.

    An implementation gating on `is_private` alone admits 100.64.0.1. One gating
    on `is_global` alone admits 224.0.0.1. Either one admits IMDS wrapped in
    NAT64, which is reachable from any IPv6-only subnet using DNS64.
    """
    assert _classify(addr) is not None, why


@pytest.mark.parametrize("addr", ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2001:4860:4860::8888"])
def test_classify_allows_public_addresses(addr):
    """The guard must not be so broad that it blocks the legitimate case.

    Deliberately NOT using 192.0.2.0/24 here: this interpreter reports RFC 5737
    documentation space as is_private=True, so it is blocked - correctly, since it
    is not routable. Using it as the "public" fixture would have asserted the
    opposite of what the code does.
    """
    assert _classify(addr) is None


@pytest.mark.parametrize("addr", ["192.0.2.1", "198.51.100.1", "203.0.113.1"])
def test_classify_rejects_non_routable_documentation_space(addr):
    """RFC 5737 ranges are is_private=True here, so they are refused.

    Recorded as an explicit expectation rather than a surprise, because these are
    the addresses documentation and tests reach for when they want "some public
    IP", and a reader who tried one would otherwise think the guard was broken.
    """
    assert _classify(addr) == "blocked_private_address"


def test_classify_rejects_garbage():
    assert _classify("not-an-address") == "unresolvable_address"


# --------------------------------------------------------------------------
# URL validation
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url,reason",
    [
        ("file:///etc/passwd", "blocked_scheme"),
        ("file://C:/Windows/win.ini", "blocked_scheme"),
        ("gopher://example.com:11211/_stats", "blocked_scheme"),
        ("ftp://example.com/x", "blocked_scheme"),
        ("dict://example.com:11211/", "blocked_scheme"),
        ("//example.com/x", "blocked_scheme"),
        ("http://user:pw@example.com/", "blocked_url_credentials"),
        ("http:///nohost", "invalid_url"),
        ("", "invalid_url"),
    ],
)
def test_validate_url_refuses_non_fetchable_urls(url, reason):
    with pytest.raises(SafeFetchError) as exc:
        validate_url(url)
    assert exc.value.reason == reason


def _fake_getaddrinfo(*addresses: str):
    """Return a getaddrinfo stand-in resolving any host to `addresses`."""

    def _resolve(host, port, *args, **kwargs):
        out = []
        for a in addresses:
            family = socket.AF_INET6 if ":" in a else socket.AF_INET
            sockaddr = (a, port, 0, 0) if family == socket.AF_INET6 else (a, port)
            out.append((family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", sockaddr))
        return out

    return _resolve


def test_validate_url_blocks_a_public_hostname_that_resolves_to_imds(monkeypatch):
    """The whole attack in one test: the URL looks fine, DNS does the work."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))
    with pytest.raises(SafeFetchError) as exc:
        validate_url("http://metadata.example.com/latest/meta-data/iam/security-credentials/")
    assert exc.value.reason == "blocked_link_local_address"


def test_validate_url_blocks_when_only_one_of_several_addresses_is_internal(monkeypatch):
    """Every resolved address must pass, not just the first.

    A host with one public and one private record would otherwise be a coin flip
    that succeeds often enough to be dismissed as a flake.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("8.8.8.8", "10.1.2.3"))
    with pytest.raises(SafeFetchError) as exc:
        validate_url("http://mixed.example.com/")
    assert exc.value.reason == "blocked_private_address"


def test_validate_url_accepts_a_public_host(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("8.8.8.8"))
    target = validate_url("https://example.com/.well-known/openid-configuration?x=1")
    assert (target.scheme, target.port, target.ip) == ("https", 443, "8.8.8.8")
    assert target.path == "/.well-known/openid-configuration?x=1"


def test_refusal_reason_does_not_echo_the_target(monkeypatch):
    """Several callers put error text in a response body.

    Echoing the resolved address of a blocked target hands back exactly the
    information the refusal withheld, turning a block into the port scan it
    prevented. The specifics belong in `detail`, which only reaches logs.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))
    with pytest.raises(SafeFetchError) as exc:
        validate_url("http://metadata.example.com/")
    assert IMDS not in exc.value.reason
    assert "metadata.example.com" not in exc.value.reason
    assert IMDS in exc.value.detail  # still diagnosable


# --------------------------------------------------------------------------
# DNS rebinding: the connection must go to the address that was validated
# --------------------------------------------------------------------------


def test_connects_to_the_validated_address_not_a_second_resolution(monkeypatch):
    """Validate-then-connect-by-name resolves twice and checks once.

    This fake DNS answers public first and IMDS afterwards. A correct
    implementation never asks a second time, so the socket must be opened to the
    public address. An implementation that hands the hostname to the socket layer
    opens IMDS here while having "validated" successfully.
    """
    answers = [["8.8.8.8"], [IMDS], [IMDS]]

    def _resolve(host, port, *args, **kwargs):
        current = answers.pop(0) if answers else [IMDS]
        return _fake_getaddrinfo(*current)(host, port)

    monkeypatch.setattr(socket, "getaddrinfo", _resolve)

    attempted: list[tuple[str, int]] = []

    def _create_connection(address, timeout=None, *a, **kw):
        attempted.append(address)
        raise OSError("connection refused by test")

    monkeypatch.setattr(socket, "create_connection", _create_connection)

    with pytest.raises(SafeFetchError) as exc:
        fetch("http://rebind.example.com/", timeout=1)

    assert exc.value.reason == "fetch_failed"
    assert attempted == [("8.8.8.8", 80)], f"connected to {attempted} instead of the validated address"


# --------------------------------------------------------------------------
# Live-server behaviour: redirects, size cap
# --------------------------------------------------------------------------


class _Handler(BaseHTTPRequestHandler):
    redirect_to: str | None = None
    payload: bytes = b"ok"
    # Per-subclass list of every request's headers, so a test can assert on what
    # actually arrived rather than on what it hoped was sent.
    received: list[dict[str, str]] = []
    bodies: list[bytes] = []

    def _handle(self):
        type(self).received.append({k.lower(): v for k, v in self.headers.items()})
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            type(self).bodies.append(self.rfile.read(length))
        if self.redirect_to:
            self.send_response(302)
            self.send_header("Location", self.redirect_to)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(self.payload)))
        self.end_headers()
        self.wfile.write(self.payload)

    def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler's required name
        self._handle()

    def do_POST(self):  # noqa: N802 - as above
        self._handle()

    def log_message(self, *args):
        pass


@pytest.fixture
def loopback_allowed(monkeypatch):
    """Permit loopback ONLY, so the tests can host a server at all.

    Every other rule stays live - in particular link-local, which is what the
    redirect test asserts is still enforced on hop 2. Relaxing loopback is the
    minimum needed to have a test server; relaxing more would test a different
    guard than the one that ships.
    """
    real = safe_fetch._classify

    def _relaxed(raw: str):
        reason = real(raw)
        return None if reason in ("blocked_loopback_address", "blocked_unspecified_address") else reason

    monkeypatch.setattr(safe_fetch, "_classify", _relaxed)
    return _relaxed


class _Server(str):
    """The server's URL, carrying the handler class that recorded its requests.

    A `str` subclass so every existing `fetch(url)` call site is unchanged while
    tests that need to assert on received headers can reach `.received`.
    """

    handler: type

    def __new__(cls, url: str, handler: type):
        obj = super().__new__(cls, url)
        obj.handler = handler
        return obj

    @property
    def received(self) -> list[dict[str, str]]:
        return self.handler.received


@pytest.fixture
def server():
    def _start(redirect_to=None, payload=b"ok"):
        # `received` must be a fresh list per subclass, or the two servers in a
        # redirect test share one and the assertion cannot tell them apart.
        handler = type(
            "H",
            (_Handler,),
            {"redirect_to": redirect_to, "payload": payload, "received": [], "bodies": []},
        )
        httpd = HTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        return httpd, f"http://127.0.0.1:{httpd.server_port}/", handler

    started = []

    def _factory(**kwargs):
        httpd, url, handler = _start(**kwargs)
        started.append(httpd)
        # The handler class is returned alongside the URL so a test can inspect
        # what that specific server received.
        return _Server(url, handler)

    yield _factory
    for httpd in started:
        httpd.shutdown()
        httpd.server_close()


def test_fetches_a_permitted_url(loopback_allowed, server):
    url = server(payload=b'{"ok": true}')
    resp = fetch(url, timeout=5)
    assert resp.status == 200
    assert resp.json() == {"ok": True}
    assert resp.truncated is False


def test_a_redirect_to_imds_is_blocked_on_the_second_hop(loopback_allowed, server):
    """A first-hop-only check is defeated by a 302.

    The server here is permitted. It answers with `Location:` pointing at the
    metadata service, which is what a hostile agent-card host would do.
    """
    url = server(redirect_to=f"http://{IMDS}/latest/meta-data/iam/security-credentials/")
    with pytest.raises(SafeFetchError) as exc:
        fetch(url, timeout=5)
    assert exc.value.reason == "blocked_link_local_address"


def test_a_redirect_to_a_file_url_is_blocked(loopback_allowed, server):
    url = server(redirect_to="file:///etc/passwd")
    with pytest.raises(SafeFetchError) as exc:
        fetch(url, timeout=5)
    assert exc.value.reason == "blocked_scheme"


def test_a_permitted_redirect_is_followed(loopback_allowed, server):
    """Re-validating every hop must not mean refusing every hop."""
    final = server(payload=b"final")
    hop = server(redirect_to=final)
    resp = fetch(hop, timeout=5)
    assert resp.status == 200
    assert resp.body == b"final"
    assert resp.final_url == final


def test_too_many_redirects_is_refused(loopback_allowed, server):
    target = server(payload=b"final")
    hop = server(redirect_to=target)
    with pytest.raises(SafeFetchError) as exc:
        fetch(hop, timeout=5, max_redirects=0)
    assert exc.value.reason == "too_many_redirects"


def test_credentials_are_dropped_across_a_cross_origin_redirect(loopback_allowed, server):
    """`urlopen` replays Authorization to the redirect target. This must not.

    urllib's redirect handler strips only content-length/content-type, so every
    caller in this codebase that sets `Authorization: Bearer <master key>` hands
    that key to whatever host the first hop redirects to. Two servers on
    different ports are two different origins, which is all this needs to prove.
    """
    final = server(payload=b"landed")
    hop = server(redirect_to=final)

    resp = fetch(hop, timeout=5, headers={"Authorization": "Bearer super-secret-master-key"})

    assert resp.status == 200 and resp.body == b"landed"
    # The first hop is the origin we chose to authenticate to, so it gets the header.
    assert "authorization" in hop.received[0]
    # The second is a different origin. It must have received the request WITHOUT it.
    assert final.received, "the redirect target was never reached"
    assert "authorization" not in final.received[0], (
        f"master key leaked to the redirect target: {final.received[0].get('authorization')!r}"
    )


def test_credentials_survive_a_same_origin_redirect(loopback_allowed, server):
    """Dropping on every redirect would break ordinary same-host auth flows.

    The rule is origin-scoped, not redirect-scoped - otherwise this guard becomes
    the reason a legitimate authenticated fetch starts failing, which is how a
    security control gets switched off.
    """
    url = server(payload=b"ok")
    resp = fetch(url, timeout=5, headers={"Authorization": "Bearer keep-me"})
    assert resp.status == 200
    assert url.received[0].get("authorization") == "Bearer keep-me"


def test_body_is_capped(loopback_allowed, server):
    """A caller-supplied URL can answer with an unbounded stream.

    Without a cap, one request to a route that echoes the body is a memory
    exhaustion primitive.
    """
    url = server(payload=b"x" * 100_000)
    resp = fetch(url, timeout=5, max_bytes=1024)
    assert len(resp.body) == 1024
    assert resp.truncated is True


def test_fetch_json_refuses_a_truncated_body_instead_of_parsing_less(loopback_allowed, server):
    """A body cut at max_bytes must not be reported as the upstream's answer.

    The dangerous shape is a large-but-valid response silently becoming a shorter
    document: spend and audit callers would render zeros and empty rows under a
    Live badge, with no exception anywhere.
    """
    url = server(payload=b'{"rows": [' + b'{"n": 1},' * 5000 + b'{"n": 1}]}')
    with pytest.raises(SafeFetchError) as exc:
        fetch_json(url, timeout=5, max_bytes=512)
    assert exc.value.reason == "response_too_large"


def test_fetch_json_rejects_a_non_json_body(loopback_allowed, server):
    """A caller-supplied URL returning HTML is expected, not exceptional.

    It must surface as SafeFetchError like every other refusal, so callers have
    one exception type rather than also catching JSONDecodeError.
    """
    url = server(payload=b"not json")
    with pytest.raises(SafeFetchError) as exc:
        fetch_json(url, timeout=5, max_bytes=64)
    assert exc.value.reason == "invalid_json_response"


# --------------------------------------------------------------------------
# The operator allowlist: narrow by construction
# --------------------------------------------------------------------------


def test_the_allowlist_is_empty_by_default_so_private_stays_refused(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.20.0.5"))
    with pytest.raises(SafeFetchError) as exc:
        validate_url("https://idp.internal.example.com/")
    assert exc.value.reason == "blocked_private_address"


def test_an_allowlisted_cidr_permits_an_on_prem_issuer(monkeypatch):
    """The legitimate case the allowlist exists for.

    Without this, an operator whose IdP lives on 10.x has to patch the guard out,
    and then nothing is protected.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.20.0.5"))
    monkeypatch.setattr(
        safe_fetch, "_configured_allowlist", lambda: safe_fetch._allowlisted_networks("10.20.0.0/16")
    )
    target = validate_url("https://idp.internal.example.com/.well-known/openid-configuration")
    assert target.ips == ("10.20.0.5",)


@pytest.mark.parametrize(
    "addr,cidr,reason",
    [
        (IMDS, "169.254.0.0/16", "blocked_link_local_address"),
        (ECS_METADATA, "169.254.0.0/16", "blocked_link_local_address"),
        ("127.0.0.1", "127.0.0.0/8", "blocked_loopback_address"),
        ("224.0.0.1", "224.0.0.0/4", "blocked_multicast_address"),
        ("0.0.0.0", "0.0.0.0/0", "blocked_unspecified_address"),
    ],
)
def test_the_allowlist_cannot_permit_the_addresses_it_must_never_permit(
    monkeypatch, addr, cidr, reason
):
    """An operator writing 169.254.0.0/16 does not get IMDS.

    This is the whole reason the allowlist is a narrow override and not a
    trust-this-address switch. Note 0.0.0.0/0 is included: the broadest possible
    entry still does not unlock these.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(addr))
    monkeypatch.setattr(
        safe_fetch, "_configured_allowlist", lambda: safe_fetch._allowlisted_networks(cidr)
    )
    with pytest.raises(SafeFetchError) as exc:
        validate_url("http://whatever.example.com/")
    assert exc.value.reason == reason


def test_a_nat64_wrapped_metadata_address_cannot_be_smuggled_by_allowlisting_the_prefix(
    monkeypatch,
):
    """Allowlisting 64:ff9b::/96 must not admit IMDS wearing an IPv6 costume.

    The allowlist is matched against the UNWRAPPED address, so this is judged as
    169.254.169.254 - which no CIDR can unlock.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("64:ff9b::a9fe:a9fe"))
    monkeypatch.setattr(
        safe_fetch, "_configured_allowlist", lambda: safe_fetch._allowlisted_networks("64:ff9b::/96")
    )
    with pytest.raises(SafeFetchError) as exc:
        validate_url("http://nat64.example.com/")
    assert exc.value.reason == "blocked_link_local_address"


def test_an_unparseable_allowlist_entry_is_skipped_not_fatal(monkeypatch):
    """A typo in an optional setting must not break token verification.

    Skipping fails toward the secure answer - the CIDR is simply not allowlisted -
    whereas raising would take down every outbound fetch in the process.
    """
    networks = safe_fetch._allowlisted_networks("not-a-cidr, 10.20.0.0/16 ,also-bad")
    assert len(networks) == 1

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.99.0.1"))
    monkeypatch.setattr(safe_fetch, "_configured_allowlist", lambda: networks)
    with pytest.raises(SafeFetchError) as exc:
        validate_url("https://elsewhere.example.com/")
    assert exc.value.reason == "blocked_private_address"


def test_the_allowlist_does_not_apply_to_public_address_rules(monkeypatch):
    """Every address must still be checked; the allowlist is per-address, not a
    global off switch for the loop."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.20.0.5", IMDS))
    monkeypatch.setattr(
        safe_fetch, "_configured_allowlist", lambda: safe_fetch._allowlisted_networks("10.20.0.0/16")
    )
    with pytest.raises(SafeFetchError) as exc:
        validate_url("https://mixed.internal.example.com/")
    assert exc.value.reason == "blocked_link_local_address"


# --------------------------------------------------------------------------
# Multi-address failover: pinning must not cost availability
# --------------------------------------------------------------------------


def test_every_validated_address_is_kept_not_just_the_first(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("8.8.8.8", "8.8.4.4"))
    target = validate_url("https://dns.example.com/")
    assert target.ips == ("8.8.8.8", "8.8.4.4")
    assert target.ip == "8.8.8.8"


def test_connection_fails_over_to_the_next_validated_address(monkeypatch):
    """One unhealthy address must not look like an outage.

    cognito-idp.<region>.amazonaws.com resolves to 12 addresses and this module is
    on the token-verification path, so "pin the first and give up" would turn a
    single bad AWS endpoint into a total auth failure. urlopen tried them all.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("8.8.8.8", "8.8.4.4"))

    attempted: list[tuple[str, int]] = []
    real_create = socket.create_connection

    def _create_connection(address, timeout=None, *a, **kw):
        attempted.append(address)
        if address[0] == "8.8.8.8":
            raise OSError("first address is down")
        raise OSError("second address also refused, but it WAS tried")

    monkeypatch.setattr(socket, "create_connection", _create_connection)

    with pytest.raises(SafeFetchError):
        fetch("http://dns.example.com/", timeout=1)

    assert attempted == [("8.8.8.8", 80), ("8.8.4.4", 80)], (
        f"failover did not try every validated address: {attempted}"
    )


def test_failover_cannot_reach_an_address_that_failed_validation(monkeypatch):
    """Failover iterates only over addresses that already passed _classify.

    If validation rejected the set, no connection is attempted at all - so the
    failover loop can never be a way in.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("8.8.8.8", IMDS))

    attempted: list[tuple[str, int]] = []
    monkeypatch.setattr(
        socket, "create_connection", lambda address, **kw: attempted.append(address)
    )

    with pytest.raises(SafeFetchError) as exc:
        fetch("http://mixed.example.com/", timeout=1)
    assert exc.value.reason == "blocked_link_local_address"
    assert attempted == []


# --------------------------------------------------------------------------
# Form bodies and query parameters (the requests.* call sites this replaces)
# --------------------------------------------------------------------------


def test_data_is_form_encoded_with_a_content_type(loopback_allowed, server):
    url = server(payload=b"ok")
    resp = fetch(url, method="POST", timeout=5, data={"grant_type": "client_credentials"})
    assert resp.status == 200
    assert url.received[0]["content-type"] == "application/x-www-form-urlencoded"
    assert url.handler.bodies == [b"grant_type=client_credentials"]


def test_body_and_data_together_are_refused():
    """Silently preferring one would send a request the caller did not write."""
    with pytest.raises(SafeFetchError) as exc:
        fetch("http://example.com/", timeout=5, body=b"x", data={"a": "b"})
    assert exc.value.reason == "invalid_request"


def test_params_are_merged_with_an_existing_query(monkeypatch):
    """Replacing the query would drop parameters already in the URL.

    That failure surfaces as a wrong-but-successful API result, not an error,
    so it is worth pinning.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("8.8.8.8"))
    target = validate_url(_with_params("https://example.com/q?a=1", {"b": "2"}))
    assert target.path == "/q?a=1&b=2"


# --------------------------------------------------------------------------
# fetch_internal: private targets allowed, redirects never followed
# --------------------------------------------------------------------------


def test_fetch_internal_reaches_a_private_address_that_fetch_refuses(server):
    """No loopback_allowed fixture here - that is the point.

    The gateway endpoint comes from settings and resolves to a private ALB
    address. `fetch` must refuse it and `fetch_internal` must not, or this
    distinction is decoration.
    """
    url = server(payload=b'{"ok": true}')

    with pytest.raises(SafeFetchError) as exc:
        fetch(url, timeout=5)
    assert exc.value.reason == "blocked_loopback_address"

    resp = safe_fetch.fetch_internal(url, timeout=5)
    assert resp.status == 200 and resp.json() == {"ok": True}


def test_fetch_internal_refuses_to_follow_a_redirect(server):
    """The whole reason these sites were unsafe: they carry the master key.

    `urlopen` would follow this and replay Authorization to the target. Refusing
    the redirect entirely is the rule for a URL of ours, which has no legitimate
    reason to redirect.
    """
    final = server(payload=b"landed")
    hop = server(redirect_to=final)

    with pytest.raises(SafeFetchError) as exc:
        safe_fetch.fetch_internal(hop, timeout=5, headers={"Authorization": "Bearer master-key"})
    assert exc.value.reason == "too_many_redirects"
    assert not final.received, "the redirect was followed and the key was replayed"


def test_fetch_internal_still_refuses_a_non_http_scheme():
    """Relaxing the address check must not relax the scheme check."""
    with pytest.raises(SafeFetchError) as exc:
        safe_fetch.fetch_internal("file:///etc/passwd", timeout=5)
    assert exc.value.reason == "blocked_scheme"


# --------------------------------------------------------------------------
# Timeout is not optional
# --------------------------------------------------------------------------


@pytest.mark.parametrize("bad", [0, -1, None])
def test_a_timeout_is_mandatory(bad):
    """`urlopen(url)` with no timeout blocks until the OS gives up.

    On the auth path that is a worker thread held by whoever controls the host
    being fetched.
    """
    with pytest.raises(SafeFetchError) as exc:
        fetch("http://example.com/", timeout=bad)
    assert exc.value.reason == "invalid_timeout"


# --------------------------------------------------------------------------
# A refusal cannot forge a log line
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        "host=evil\r\nWARNING: admin login from 10.0.0.1",
        "host=evil\nWARNING: forged",
        "host=evil\rWARNING: forged",
        "host=evil\x7fWARNING: forged",
        "host=evil\x00null",
    ],
)
def test_control_characters_in_detail_cannot_forge_a_log_line(raw):
    """Scrubbed at construction, not at each logging call.

    Two independent reviews of the converted call sites found the same residual:
    the site had switched its URL argument to %r, then interpolated `exc.detail`
    with %s in the same call, so CR/LF still split the record. Fixing it where the
    value is built means a call site cannot reintroduce it.
    """
    exc = SafeFetchError("blocked_private_address", raw)
    assert "\r" not in exc.detail
    assert "\n" not in exc.detail
    assert "\x7f" not in exc.detail
    assert "\x00" not in exc.detail
    # Escaped, not stripped: the attempt stays visible to whoever reads the log.
    assert "host=evil" in exc.detail
    assert "\\x" in exc.detail


def test_a_forged_reason_is_scrubbed_too():
    """`reason` is the attribute that reaches HTTP response bodies.

    Every reason this module raises is a literal, so this is defence against a
    future caller constructing one from input rather than a live vector.
    """
    exc = SafeFetchError("blocked\r\nInjected", "")
    assert exc.reason == "blocked\\x0d\\x0aInjected"
    assert str(exc) == exc.reason


def test_scrubbing_leaves_an_ordinary_detail_untouched():
    """A guard that rewrites normal values would make every log harder to read."""
    exc = SafeFetchError("blocked_private_address", "host=idp.example.com resolved=10.0.0.5")
    assert exc.detail == "host=idp.example.com resolved=10.0.0.5"


# --------------------------------------------------------------------------
# One owner for "can the allowlist help here?"
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "reason",
    ["blocked_private_address", "blocked_reserved_address", "blocked_non_global_address"],
)
def test_the_allowlistable_refusals_are_the_ones_an_operator_can_fix(reason):
    assert is_allowlistable_refusal(reason) is True


@pytest.mark.parametrize("reason", sorted(_ALLOWLIST_CANNOT_OVERRIDE))
def test_no_refusal_that_protects_metadata_is_reported_as_allowlistable(reason):
    """Advising an operator to allowlist their way to 169.254.169.254 would be
    advice to disable the guard, so the answer here has to be no."""
    assert is_allowlistable_refusal(reason) is False


@pytest.mark.parametrize(
    "reason",
    ["blocked_scheme", "unresolvable_host", "response_too_large", "", "nonsense"],
)
def test_an_unrecognised_reason_is_not_reported_as_allowlistable(reason):
    """Fails closed. Telling an operator a CIDR entry will fix a refusal that a
    CIDR entry cannot fix sends them to change a setting and conclude the platform
    is broken when nothing changes."""
    assert is_allowlistable_refusal(reason) is False


def test_every_classify_reason_is_declared():
    """The drift guard for `_ADDRESS_REFUSALS`.

    `is_allowlistable_refusal` derives its answer by subtracting the never-override
    set from this one. If a new address class is added to `_classify` and not here,
    nothing raises - the refusal silently becomes non-allowlistable and operators
    stop being told about a setting that would have helped. So enumerate real
    addresses of every class and assert the classifier cannot return a reason this
    module has not declared.
    """
    probes = [
        "0.0.0.0",
        "127.0.0.1",
        "169.254.169.254",
        "224.0.0.1",
        "10.0.0.1",
        "192.0.2.1",
        "100.64.0.1",
        "::1",
        "fe80::1",
        "fc00::1",
        "64:ff9b::a9fe:a9fe",
    ]
    seen = {r for r in (_classify(p) for p in probes) if r}
    undeclared = seen - _ADDRESS_REFUSALS
    assert not undeclared, f"_classify returns {undeclared}, absent from _ADDRESS_REFUSALS"
    # And the split is a partition, not two overlapping hand-written lists.
    assert _ALLOWLIST_CANNOT_OVERRIDE <= _ADDRESS_REFUSALS
