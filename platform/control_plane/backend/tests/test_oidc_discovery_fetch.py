"""Tests for POST /identity-providers/test-discovery.

This route is the worst-shaped SSRF surface in the backend: it fetches a URL
straight out of the request body at Role.VIEWER and returns the parsed document,
so it is a full-text read primitive rather than a yes/no oracle. It also used to
put the target URL and the raw exception into the 502 body, which reported back
exactly what a refusal is supposed to withhold.

The assertions here are about the route's contract, not safe_fetch's internals
(those live in test_safe_fetch.py): a private target is refused, the refusal
names no host or address, the rewritten well-known URL is the one validated and
fetched, and a legitimate document still comes back parsed.

Three more properties are load-bearing and each has a test below, because each
was a regression the first conversion shipped:
  - no input reaches the operator as a 500. The exceptions safe_fetch does not
    wrap (a UnicodeError out of getaddrinfo's IDNA step, a ValueError out of the
    redirect urljoin) are both caller-reachable.
  - the URL is never interpolated raw into a log line. It is request-body input
    and can carry CR/LF.
  - a refusal an operator can clear says how (SAFE_FETCH_ALLOWED_PRIVATE_CIDRS),
    and one they cannot does not pretend otherwise.
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi import HTTPException

import api.routes.identity_providers as idp
from core import safe_fetch

IMDS = "169.254.169.254"

# A trimmed but realistic Entra-shaped document, so the success test asserts on
# the fields the wizard actually reads.
DISCOVERY_DOC = {
    "issuer": "https://login.example.com/tenant/v2.0",
    "authorization_endpoint": "https://login.example.com/tenant/oauth2/v2.0/authorize",
    "token_endpoint": "https://login.example.com/tenant/oauth2/v2.0/token",
    "jwks_uri": "https://login.example.com/tenant/discovery/v2.0/keys",
    "claims_supported": ["sub", "email", "roles"],
}


def _test_discovery(url: str):
    """Call the route handler directly.

    The handler is `async def`; nothing in it awaits, so asyncio.run is enough
    and avoids pulling a TestClient (and Cognito/DDB wiring) into these tests.
    """
    return asyncio.run(idp.test_discovery(idp.DiscoveryTestRequest(discovery_url=url)))


def _fake_getaddrinfo(*addresses: str):
    """Resolve any host to `addresses`, so a public-looking name can point inward."""

    def _resolve(host, port, *args, **kwargs):
        out = []
        for a in addresses:
            family = socket.AF_INET6 if ":" in a else socket.AF_INET
            sockaddr = (a, port, 0, 0) if family == socket.AF_INET6 else (a, port)
            out.append((family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", sockaddr))
        return out

    return _resolve


# --------------------------------------------------------------------------
# Refusals
# --------------------------------------------------------------------------


def test_a_discovery_url_resolving_to_link_local_is_refused(monkeypatch):
    """The attack in one call: the URL looks like an IdP, DNS points at IMDS.

    Under the old `urlopen` this returned 200 with the credential response in
    `discovery`.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))

    connected: list[tuple] = []

    def _create_connection(address, *a, **kw):
        connected.append(address)
        raise OSError("connection refused by test")

    monkeypatch.setattr(socket, "create_connection", _create_connection)

    with pytest.raises(HTTPException) as exc:
        _test_discovery("https://login.microsoftonline.example/tenant/v2.0")

    assert exc.value.status_code == 502
    assert "blocked_link_local_address" in exc.value.detail
    assert connected == [], "the refusal must happen before any socket is opened"
    # No allowlist hint here. SAFE_FETCH_ALLOWED_PRIVATE_CIDRS cannot override
    # link-local (safe_fetch._ALLOWLIST_CANNOT_OVERRIDE), so telling an operator to
    # use it would be advice that silently cannot work.
    assert "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" not in exc.value.detail


def test_the_error_detail_does_not_echo_the_target(monkeypatch):
    """The regression this route carried: `detail=f"...from {url}: {e}"`.

    Echoing the target and the resolved address hands the caller the port-scan
    result the block was supposed to deny.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))

    with pytest.raises(HTTPException) as exc:
        _test_discovery("https://internal-admin.example.com:8500/v2.0")

    detail = exc.value.detail
    assert IMDS not in detail
    assert "internal-admin.example.com" not in detail
    assert "8500" not in detail
    assert detail == "Discovery fetch failed: blocked_link_local_address"


def test_a_private_issuer_refusal_names_the_operator_escape_hatch(monkeypatch):
    """An on-prem issuer on 10.x is the normal shape of a generic_oidc provider.

    Refusing a caller-supplied URL that resolves inward is correct, but 'Discovery
    fetch failed: blocked_private_address' is a dead end. The refusal has to name
    the setting that clears it, without naming the address it resolved to.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.20.30.40"))

    with pytest.raises(HTTPException) as exc:
        _test_discovery("https://sso.corp.internal/realms/ava")

    detail = exc.value.detail
    assert exc.value.status_code == 502
    assert "blocked_private_address" in detail
    assert "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in detail
    # Actionable, still not a port scanner.
    assert "10.20.30.40" not in detail
    assert "sso.corp.internal" not in detail


@pytest.mark.parametrize(
    "url,reason",
    [
        ("file:///etc/passwd", "blocked_scheme"),
        ("gopher://example.com/", "blocked_scheme"),
        ("https://user:pw@example.com/.well-known/openid-configuration", "blocked_url_credentials"),
    ],
)
def test_non_fetchable_urls_are_refused_as_client_errors(url, reason):
    """400, not 502: nothing upstream was contacted, the submitted URL is the fault.

    Reporting these as a bad gateway sends the operator to debug an IdP that never
    saw a packet.
    """
    with pytest.raises(HTTPException) as exc:
        _test_discovery(url)
    assert exc.value.status_code == 400
    assert exc.value.detail == f"Discovery fetch failed: {reason}"


def test_a_malformed_url_is_a_400_not_a_500():
    """urlsplit raises before safe_fetch is reached, so the route handles it.

    Verified reachable: urlsplit('http://[::1') raises ValueError('Invalid IPv6
    URL'), which is otherwise an unhandled 500.
    """
    with pytest.raises(HTTPException) as exc:
        _test_discovery("http://[::1")
    assert exc.value.status_code == 400
    assert exc.value.detail == "invalid_url"


def test_an_idna_failure_is_a_refusal_not_a_500(monkeypatch):
    """A double-dot typo reaches this route as a UnicodeError, not a SafeFetchError.

    Measured on this image (CPython 3.14): `socket.getaddrinfo('a..example.com',
    443)` raises UnicodeEncodeError('idna', 'a..example.com', 2, 3, 'label empty')
    - a ValueError subclass - from the IDNA encode step, before any DNS traffic. A
    label over 63 characters does the same. safe_fetch.validate_url wraps that call
    in `except socket.gaierror` only, so an `except SafeFetchError` arm on its own
    lets it out as a 500 with a traceback. Stubbed rather than resolved for real so
    the test needs no network and does not depend on the platform resolver.
    """

    def _idna_failure(host, port, *a, **kw):
        raise UnicodeEncodeError("idna", host, 2, 3, "label empty")

    monkeypatch.setattr(socket, "getaddrinfo", _idna_failure)

    with pytest.raises(HTTPException) as exc:
        _test_discovery("https://a..example.com/v2.0")

    assert exc.value.status_code == 502
    assert exc.value.detail == "Discovery fetch failed: fetch_failed"
    assert "a..example.com" not in exc.value.detail


def test_the_refused_url_is_never_interpolated_raw_into_the_log(monkeypatch, caplog):
    """A VIEWER can put CR/LF in discovery_url and forge whole log records.

    The URL already ends in /openid-configuration, so the rewrite - and the CR/LF
    stripping urlsplit does on the way through - never runs, and the raw string is
    what the failure path logs. These records go to CloudWatch and feed operator
    review, so the log line has to escape it.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))
    forged = "https://example.com/x\r\nFAKE-LOG-LINE: injected/openid-configuration"

    with caplog.at_level(logging.WARNING, logger=idp.logger.name):
        with pytest.raises(HTTPException):
            _test_discovery(forged)

    messages = [r.getMessage() for r in caplog.records]
    assert messages, "the refusal must still be logged"
    for msg in messages:
        assert "\r" not in msg and "\n" not in msg, f"forgeable log record: {msg!r}"
    # And the URL is still there in escaped form, so this cannot pass by the route
    # having simply stopped logging it.
    assert any("\\r\\nFAKE-LOG-LINE" in msg for msg in messages)


# --------------------------------------------------------------------------
# Live-server behaviour
# --------------------------------------------------------------------------


class _Handler(BaseHTTPRequestHandler):
    payload: bytes = b"{}"
    redirect_to: str | None = None
    status: int = 200
    paths: list[str] = []
    user_agents: list[str] = []

    def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler's required name
        type(self).paths.append(self.path)
        type(self).user_agents.append(self.headers.get("User-Agent", ""))
        if self.redirect_to:
            self.send_response(302)
            self.send_header("Location", self.redirect_to)
            self.end_headers()
            return
        self.send_response(self.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(self.payload)))
        self.end_headers()
        self.wfile.write(self.payload)

    def log_message(self, *args):
        pass


@pytest.fixture
def loopback_allowed(monkeypatch):
    """Permit loopback ONLY, so these tests can host a server at all.

    Every other rule stays live - link-local in particular, which is what the
    redirect test asserts is still enforced on hop 2.
    """
    real = safe_fetch._classify

    def _relaxed(raw: str):
        reason = real(raw)
        return None if reason == "blocked_loopback_address" else reason

    monkeypatch.setattr(safe_fetch, "_classify", _relaxed)


@pytest.fixture
def server():
    started: list[HTTPServer] = []

    def _factory(payload: bytes = b"{}", redirect_to: str | None = None, status: int = 200):
        # Fresh `paths` per subclass so two servers in one test do not share it.
        handler = type(
            "H",
            (_Handler,),
            {
                "payload": payload,
                "redirect_to": redirect_to,
                "status": status,
                "paths": [],
                "user_agents": [],
            },
        )
        httpd = HTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        started.append(httpd)
        return f"http://127.0.0.1:{httpd.server_port}", handler

    yield _factory
    for httpd in started:
        httpd.shutdown()
        httpd.server_close()


def test_a_valid_document_returns_ok_with_its_parsed_contents(loopback_allowed, server):
    base, handler = server(payload=json.dumps(DISCOVERY_DOC).encode())

    result = _test_discovery(base + "/tenant/v2.0")

    assert result["ok"] is True
    assert result["discovery"] == DISCOVERY_DOC
    assert result["discovery"]["issuer"] == DISCOVERY_DOC["issuer"]
    # resolved_url is the post-rewrite URL, and it is what was requested.
    assert result["resolved_url"] == base + "/tenant/v2.0/.well-known/openid-configuration"
    assert handler.paths == ["/tenant/v2.0/.well-known/openid-configuration"]


def test_a_valid_document_is_fetched_with_a_user_agent(loopback_allowed, server):
    """urlopen sent one for free; the pinned-IP client sends nothing unless asked.

    WAF-fronted discovery endpoints reject an empty User-Agent with a 403, which
    would land here as an unexplained http_status_error.
    """
    base, handler = server(payload=json.dumps(DISCOVERY_DOC).encode())

    _test_discovery(base + "/tenant/v2.0")

    assert handler.user_agents and all(ua for ua in handler.user_agents)


@pytest.mark.parametrize(
    "path_and_query",
    [
        "/tenant/v2.0/.well-known/openid-configuration",
        # A documented Microsoft form. `endswith('/openid-configuration')` on the raw
        # URL misses it, so the old rewrite appended the suffix a second time AND
        # dropped the query, landing as a 404 the operator could not explain.
        "/tenant/v2.0/.well-known/openid-configuration?appid=abc123",
        # A trailing slash is not a reason to rewrite either.
        "/tenant/v2.0/.well-known/openid-configuration/",
    ],
)
def test_an_already_well_known_url_is_not_rewritten_twice(loopback_allowed, server, path_and_query):
    base, handler = server(payload=json.dumps(DISCOVERY_DOC).encode())
    full = base + path_and_query

    result = _test_discovery(full)

    assert result["resolved_url"] == full
    assert handler.paths == [path_and_query]
    assert ".well-known/.well-known" not in handler.paths[0]


def test_a_redirect_to_imds_is_refused(loopback_allowed, server):
    """A first-hop-only check is defeated by a 302, and `urlopen` followed it."""
    base, _handler = server(redirect_to=f"http://{IMDS}/latest/meta-data/iam/security-credentials/")

    with pytest.raises(HTTPException) as exc:
        _test_discovery(base)

    assert exc.value.detail == "Discovery fetch failed: blocked_link_local_address"
    assert IMDS not in exc.value.detail


def test_a_redirect_to_a_malformed_location_is_a_refusal_not_a_500(loopback_allowed, server):
    """A remote server can hand safe_fetch a Location its urljoin cannot parse.

    `Location: http://[::1` raises a bare ValueError inside safe_fetch's redirect
    branch, which its per-hop except tuple does not cover, so an
    `except SafeFetchError` arm on its own lets it out of the route as a 500. This
    one is remotely triggerable: the caller only has to name a host that answers
    with that header.
    """
    base, _handler = server(redirect_to="http://[::1")

    with pytest.raises(HTTPException) as exc:
        _test_discovery(base)

    assert exc.value.status_code == 502
    assert exc.value.detail == "Discovery fetch failed: fetch_failed"


def test_the_size_cap_is_actually_applied(loopback_allowed, server, monkeypatch):
    """Proves max_bytes reaches safe_fetch rather than being decoration.

    The cap is lowered instead of serving 256KB. A body cut at the cap is refused
    outright by fetch_json (`response_too_large`) rather than parsed, because a
    shorter document that happens to parse would be rendered to the operator as the
    IdP's own answer. An ignored cap returns ok=True.
    """
    monkeypatch.setattr(idp, "_DISCOVERY_MAX_BYTES", 16)
    base, _handler = server(payload=json.dumps(DISCOVERY_DOC).encode())

    with pytest.raises(HTTPException) as exc:
        _test_discovery(base)

    assert exc.value.status_code == 502
    assert exc.value.detail == "Discovery fetch failed: response_too_large"


def test_a_non_2xx_status_is_reported_with_its_number(loopback_allowed, server):
    """Without the number, a typo'd tenant (404) reads the same as an outage (503).

    The status comes from a host that already passed the address check and that the
    caller can reach directly, so surfacing it withholds nothing.
    """
    base, _handler = server(payload=b"{}", status=404)

    with pytest.raises(HTTPException) as exc:
        _test_discovery(base)

    assert exc.value.status_code == 502
    assert exc.value.detail == "Discovery fetch failed: http_status_error (HTTP 404)"
    assert "127.0.0.1" not in exc.value.detail


def test_a_non_json_body_is_a_502_naming_only_the_reason(loopback_allowed, server):
    base, _handler = server(payload=b"<html>not an IdP</html>")

    with pytest.raises(HTTPException) as exc:
        _test_discovery(base)

    assert exc.value.status_code == 502
    assert exc.value.detail == "Discovery fetch failed: invalid_json_response"
    assert "127.0.0.1" not in exc.value.detail
