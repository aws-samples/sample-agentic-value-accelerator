"""Tests for the A2A AgentCard fetch (`api.routes.a2a._fetch_agent_card`).

`endpoint` arrives in the body of POST /a2a/fetch-card, POST /a2a and
PATCH /a2a/{id} - all reachable at Role.VIEWER. The old implementation handed it
straight to `urllib.request.urlopen` and then put the target URL and the raw
exception into the 502 body, which is what made it usable as an internal port
scanner: the caller learns "connection refused" vs. "timed out" vs. "200 OK" for
any address the backend can reach.

So four things are asserted here, and they are separate failures:
  1. an internal target is refused,
  2. the refusal says nothing the caller did not already know,
  3. every failure is a 502 the callers can handle, never an escaped exception -
     an unhandled one is a 500 with a traceback, and it walks past the degrade
     paths in register_agent/update_agent, and
  4. a refusal the guard will never lift is not quietly registered anyway.

A guard that blocks the fetch but still echoes `http://10.0.0.7:8080: [Errno 111]
Connection refused` has fixed nothing.
"""

from __future__ import annotations

import inspect
import json
import logging
import re
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api.routes import a2a
from core import safe_fetch

IMDS = "169.254.169.254"
ECS_METADATA = "169.254.170.2"

VALID_CARD = {
    "name": "Weather Agent",
    "description": "Answers weather questions",
    "url": "https://weather.example.com/a2a",
    "skills": [{"id": "forecast", "name": "Forecast"}],
}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _fake_getaddrinfo(*addresses: str):
    """Return a getaddrinfo stand-in resolving any host to `addresses`.

    The interesting attack needs no hostile IP in the URL at all: a perfectly
    ordinary-looking name whose DNS answer is 169.254.169.254.
    """

    def _resolve(host, port, *args, **kwargs):
        out = []
        for a in addresses:
            family = socket.AF_INET6 if ":" in a else socket.AF_INET
            sockaddr = (a, port, 0, 0) if family == socket.AF_INET6 else (a, port)
            out.append((family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", sockaddr))
        return out

    return _resolve


@pytest.fixture
def loopback_allowed(monkeypatch):
    """Permit loopback ONLY, so a test can host a card server at all.

    Every other rule stays live - link-local in particular, which is what the
    redirect test asserts is still enforced on the second hop. Relaxing more
    would test a different guard than the one that ships.
    """
    real = safe_fetch._classify

    def _relaxed(raw: str):
        reason = real(raw)
        return None if reason in ("blocked_loopback_address", "blocked_unspecified_address") else reason

    monkeypatch.setattr(safe_fetch, "_classify", _relaxed)


class _QuietServer(HTTPServer):
    def handle_error(self, request, client_address):
        # The size-cap test closes the connection mid-body on purpose; the
        # resulting broken pipe is the expected outcome, not a test failure.
        pass


def _make_handler(status: int, payload: bytes, redirect_to: str | None, requested: list[str]):
    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler's required name
            requested.append(self.path)
            if redirect_to:
                self.send_response(302)
                self.send_header("Location", redirect_to)
                self.end_headers()
                return
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    return _Handler


@pytest.fixture
def card_server():
    """Start a local server and return (base_url, requested_paths)."""
    started: list[HTTPServer] = []

    def _factory(payload: bytes = b"", status: int = 200, redirect_to: str | None = None):
        if not payload:
            payload = json.dumps(VALID_CARD).encode("utf-8")
        requested: list[str] = []
        httpd = _QuietServer(("127.0.0.1", 0), _make_handler(status, payload, redirect_to, requested))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        started.append(httpd)
        return f"http://127.0.0.1:{httpd.server_port}", requested

    yield _factory
    for httpd in started:
        httpd.shutdown()
        httpd.server_close()


def _client_for(*paths: str) -> TestClient:
    """A TestClient for the named a2a routes with RBAC overridden.

    Overriding the dependency rather than relying on the dev-auth bypass keeps
    these assertions true whatever ENVIRONMENT says.
    """
    app = FastAPI()
    app.include_router(a2a.router)
    for route in a2a.router.routes:
        if getattr(route, "path", "") in paths:
            for dep in route.dependant.dependencies:
                app.dependency_overrides[dep.call] = lambda: None
    return TestClient(app)


@pytest.fixture
def registry(monkeypatch):
    """Stub the AVA registry and the policy engine; return the publish calls.

    The register route is worth driving end to end because the interesting
    behaviour is what it *persists* after a refused fetch, which asserting on
    `_fetch_agent_card` alone cannot see.
    """
    published: list[dict] = []

    def _publish(**kwargs):
        published.append(kwargs)
        return {
            "recordId": "rec-1",
            "displayName": kwargs["display_name"],
            "status": "APPROVED",
            "descriptors": {"a2aAgentCard": {"dataParsed": dict(kwargs["agent_card"])}},
        }

    monkeypatch.setattr(a2a.reg, "_registry_id", lambda: "reg-1")
    monkeypatch.setattr(a2a.reg, "publish_a2a_server", _publish)
    monkeypatch.setattr(
        a2a.policy,
        "evaluate",
        lambda **kw: a2a.policy.PolicyVerdict(mode=a2a.policy.MODE_AUTO_APPROVE),
    )
    return published


# --------------------------------------------------------------------------
# Internal targets are refused
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "endpoint,reason",
    [
        (f"http://{IMDS}", "blocked_link_local_address"),
        (f"http://{IMDS}/latest/meta-data/iam/security-credentials/", "blocked_link_local_address"),
        # The ECS task metadata endpoint serves task role credentials.
        (f"http://{ECS_METADATA}/v2/credentials", "blocked_link_local_address"),
        ("http://127.0.0.1:8000", "blocked_loopback_address"),
        ("http://10.0.0.7:8080", "blocked_private_address"),
        ("http://192.168.1.1", "blocked_private_address"),
        # CGNAT: `is_private` alone reports False for this range.
        ("http://100.64.0.1", "blocked_non_global_address"),
        # IMDS wrapped in the NAT64 well-known prefix, reachable from an
        # IPv6-only subnet.
        ("http://[64:ff9b::a9fe:a9fe]", "blocked_link_local_address"),
        ("file:///etc/passwd", "blocked_scheme"),
        # Scheme-relative: urljoin keeps it schemeless, so it must not be fetched.
        (f"//{IMDS}", "blocked_scheme"),
        ("http://user:pw@example.com/", "blocked_url_credentials"),
    ],
)
def test_internal_and_unfetchable_endpoints_are_refused(endpoint, reason):
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card(endpoint)
    assert exc.value.status_code == 502
    assert exc.value.detail == f"Failed to fetch AgentCard: {reason}"


def test_a_public_hostname_that_resolves_to_imds_is_refused(monkeypatch):
    """The URL looks fine; DNS does the work. Nothing in the string is a clue."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card("http://card.example.test")
    assert exc.value.detail == "Failed to fetch AgentCard: blocked_link_local_address"


def test_a_card_path_pointing_at_imds_is_refused_after_the_rewrite(monkeypatch):
    """An endpoint ending in agent.json skips the well-known rewrite.

    Both branches must be validated, so the check has to sit on the URL that is
    actually fetched rather than on the caller's string.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card("http://card.example.test/latest/agent.json")
    assert exc.value.detail == "Failed to fetch AgentCard: blocked_link_local_address"


# --------------------------------------------------------------------------
# The refusal must not become the scan
# --------------------------------------------------------------------------


def test_the_refusal_detail_does_not_echo_the_target_or_the_resolved_address(monkeypatch, caplog):
    """The 502 body is the feedback channel that made this exploitable.

    `detail` reaches the caller verbatim, so it carries the stable category and
    nothing else. The host and the address it resolved to still have to be in the
    log, or the refusal is undiagnosable.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))
    with caplog.at_level(logging.WARNING, logger="api.routes.a2a"):
        with pytest.raises(HTTPException) as exc:
            a2a._fetch_agent_card("http://metadata.example.test/secret-port")

    detail = str(exc.value.detail)
    assert IMDS not in detail
    assert "metadata.example.test" not in detail
    assert "secret-port" not in detail
    assert "blocked_link_local_address" in detail

    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert IMDS in logged, "the resolved address must survive in the log"
    assert "metadata.example.test" in logged


def test_a_refused_fetch_leaks_nothing_through_the_route_body(monkeypatch):
    """End to end: what the HTTP client actually receives.

    Asserting on the exception alone would miss a caller that re-wraps it with
    the URL, so this drives the real route.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))

    with _client_for("/a2a/fetch-card") as client:
        resp = client.post("/a2a/fetch-card", json={"endpoint": "http://metadata.example.test/"})

    assert resp.status_code == 502
    body = resp.text
    assert IMDS not in body
    assert "metadata.example.test" not in body
    assert resp.json()["detail"] == "Failed to fetch AgentCard: blocked_link_local_address"


@pytest.mark.parametrize(
    "resolved,reason,hinted",
    [
        # An in-VPC peer: the allowlist would reach it, so the preview says so.
        ("10.20.30.40", "blocked_private_address", True),
        ("100.64.0.1", "blocked_non_global_address", True),
        # No entry in SAFE_FETCH_ALLOWED_PRIVATE_CIDRS can ever permit link-local
        # (safe_fetch._ALLOWLIST_CANNOT_OVERRIDE), so offering it here would send an
        # operator to edit config and conclude the platform is broken.
        (IMDS, "blocked_link_local_address", False),
        ("127.0.0.1", "blocked_loopback_address", False),
    ],
)
def test_the_fetch_card_preview_is_as_actionable_as_the_mutations(
    monkeypatch, resolved, reason, hinted
):
    """The Fetch card button is the first thing an operator touches, and it explained
    least.

    POST /a2a and PATCH /a2a/{id} name SAFE_FETCH_ALLOWED_PRIVATE_CIDRS when it would
    help; this endpoint answered a bare `blocked_private_address`, which is where an
    on-prem A2A peer dead-ends. The frontend renders `detail` verbatim
    (components/a2a/api.ts throws `Error(status: detail)` and A2aCreate.tsx shows it),
    so the sentence has to be in the body.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(resolved))

    with _client_for("/a2a/fetch-card") as client:
        resp = client.post("/a2a/fetch-card", json={"endpoint": "http://peer.corp.example/"})

    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert reason in detail
    assert ("SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in detail) is hinted, detail
    # Actionable, still not a port scanner.
    assert resolved not in resp.text
    assert "peer.corp.example" not in resp.text


@pytest.mark.parametrize(
    "error",
    [
        ConnectionRefusedError(111, "Connection refused"),
        socket.timeout("timed out"),
        OSError(113, "No route to host"),
        ConnectionResetError(104, "Connection reset by peer"),
    ],
    ids=["refused", "timed_out", "unreachable", "reset"],
)
def test_a_connection_failure_does_not_report_which_failure_it_was(monkeypatch, error):
    """The oracle was the distinction, not any single message.

    Refused vs. timed out is closed vs. filtered, which is the whole of a port
    scan, so all of these have to reach the caller as one category. safe_fetch
    reports them apart (fetch_failed / fetch_timeout / tls_error) because a log
    reader needs that; the route collapses them because a caller does not, and
    only the caller is hostile.

    Those three are the whole collapse set, and this test covers the transport
    failures that produce them. Every OTHER reason keeps its own category - not just
    the "something answered HTTP" ones (http_status_error, invalid_json_response,
    response_too_large) but unresolvable_host, too_many_redirects, invalid_url and the
    blocked_* refusals too. Which is which is enumerated and pinned against
    safe_fetch's own vocabulary in the table below, so this docstring cannot drift
    into naming a subset again.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))

    def _fail(address, timeout=None, *a, **kw):
        raise error

    monkeypatch.setattr(socket, "create_connection", _fail)
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card("http://scan.example.test:22")

    detail = str(exc.value.detail)
    assert detail == "Failed to fetch AgentCard: fetch_failed"
    assert "Connection refused" not in detail
    assert "No route to host" not in detail
    assert "22" not in detail


# Every reason safe_fetch can raise, split by what the route does with it.
#
# The docstring above used to name two members of the second list and call the rest
# "the residual", which read as a complete enumeration and was not one. So the split
# is a table, `test_the_collapse_table_covers_every_reason_safe_fetch_can_raise`
# proves it covers safe_fetch's actual vocabulary, and the two tests below prove the
# route agrees with it.
_COLLAPSED_REASONS = ["fetch_failed", "fetch_timeout", "tls_error"]

_DISTINCT_REASONS = [
    # Something answered. Withholding these leaves an operator unable to tell a
    # typo'd path from a login page, and the caller already knows the port is open.
    "http_status_error",
    "invalid_json_response",
    "response_too_large",
    # Never got that far, and none of it is a distinction the caller cannot make
    # for themselves (a DNS lookup, a redirect chain, a URL they typed).
    "unresolvable_host",
    "too_many_redirects",
    "invalid_url",
    # The refusals. `_refused_by_policy` reads these, so collapsing one into
    # fetch_failed would silently turn a 400 into a tolerated 201 with an empty card.
    "blocked_scheme",
    "blocked_url_credentials",
    "blocked_unspecified_address",
    "blocked_loopback_address",
    "blocked_link_local_address",
    "blocked_multicast_address",
    "blocked_reserved_address",
    "blocked_private_address",
    "blocked_non_global_address",
    # `_classify`'s answer when a resolver hands back something that is not an
    # address at all.
    "unresolvable_address",
    # Argument errors. Not reachable through this route as written - it hardcodes
    # `timeout=10` and passes no body - so they are here for completeness of the
    # partition, not as a claim that a caller can provoke them.
    "invalid_timeout",
    "invalid_request",
]


def _safe_fetch_reason_vocabulary() -> set[str]:
    """Every reason string `core.safe_fetch` can put in a SafeFetchError.

    Read out of the module source rather than hand-listed here, so a reason added
    there fails a test here instead of quietly falling off the table. Three sources,
    because the raises are not all literals: the literal arguments to
    `SafeFetchError(...)`, the strings `_classify` returns (validate_url raises
    `SafeFetchError(reason, ...)` with that value), and `_ADDRESS_REFUSALS`, which is
    the module's own declared set of the latter.
    """
    source = inspect.getsource(safe_fetch)
    raised = set(re.findall(r'SafeFetchError\(\s*"([a-z_0-9]+)"', source))
    classified = set(re.findall(r'return "([a-z_0-9]+)"', source))
    return raised | classified | set(safe_fetch._ADDRESS_REFUSALS)


def test_the_collapse_table_covers_every_reason_safe_fetch_can_raise():
    """The drift guard. A new reason in safe_fetch has to be assigned a side.

    Without this, adding one is silently a pass-through: it would reach the caller
    verbatim with nobody having decided whether it is safe to.
    """
    vocabulary = _safe_fetch_reason_vocabulary()
    # The scan itself has to work, or this test cannot fail: an anchored subset the
    # regexes must find, one from each of the three sources.
    assert {"fetch_failed", "http_status_error", "unresolvable_address"} <= vocabulary, vocabulary
    assert len(vocabulary) >= 20, sorted(vocabulary)

    tabled = set(_COLLAPSED_REASONS) | set(_DISTINCT_REASONS)
    assert not vocabulary - tabled, (
        f"safe_fetch can raise {sorted(vocabulary - tabled)}, which this table does not "
        "place - decide whether each is opaque to the caller or keeps its category"
    )
    assert not tabled - vocabulary, (
        f"{sorted(tabled - vocabulary)} is tabled but safe_fetch no longer raises it"
    )
    assert not set(_COLLAPSED_REASONS) & set(_DISTINCT_REASONS)


def _raise_reason(reason: str):
    """A fetch_json stand-in raising `reason` with a realistic, specific detail.

    Injected rather than provoked: several of these need a hostile peer
    (too_many_redirects) or an argument this route hardcodes (invalid_timeout). The
    transport reasons are also provoked for real, above.
    """

    def _fetch_json(url, **kwargs):
        raise safe_fetch.SafeFetchError(reason, "host=scan.example.test resolved=10.1.2.3")

    return _fetch_json


@pytest.mark.parametrize("reason", _COLLAPSED_REASONS)
def test_a_transport_reason_reaches_the_caller_as_fetch_failed(monkeypatch, reason):
    monkeypatch.setattr(safe_fetch, "fetch_json", _raise_reason(reason))
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card("http://scan.example.test:22")
    assert exc.value.detail == "Failed to fetch AgentCard: fetch_failed"


@pytest.mark.parametrize("reason", _DISTINCT_REASONS)
def test_every_other_reason_keeps_its_own_category(monkeypatch, reason):
    """And still carries no detail: `detail` is for the log, `reason` for the body."""
    monkeypatch.setattr(safe_fetch, "fetch_json", _raise_reason(reason))
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card("http://scan.example.test:22")
    assert exc.value.detail == f"Failed to fetch AgentCard: {reason}"
    assert "10.1.2.3" not in exc.value.detail
    assert "scan.example.test" not in exc.value.detail


def test_a_newline_in_the_endpoint_cannot_forge_a_log_line(monkeypatch, caplog):
    """An endpoint already naming agent.json is logged exactly as it arrived.

    The well-known rewrite is what would otherwise have run it through urlsplit,
    which strips CR/LF; for this shape nothing does. So the log call is what has to
    escape it, or a VIEWER writes their own lines into the stream this GRC product
    treats as evidence.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))
    forged = (
        f"http://{IMDS}/x\n"
        "2026-09-16 10:00:00 INFO api.routes.a2a: AgentCard fetch OK for agent.json"
    )
    with caplog.at_level(logging.WARNING, logger="api.routes.a2a"):
        with pytest.raises(HTTPException):
            a2a._fetch_agent_card(forged)

    messages = [r.getMessage() for r in caplog.records]
    assert messages, "the refusal still has to be logged"
    assert all("\n" not in m for m in messages), messages
    # Escaped, not dropped: the operator still sees what was submitted.
    assert any("\\n2026-09-16" in m for m in messages), messages


# --------------------------------------------------------------------------
# Every failure is a 502, never an escaped exception
# --------------------------------------------------------------------------


def test_an_over_long_idna_label_is_a_502_not_an_escaped_exception():
    """`validate_url` runs outside the block safe_fetch normalises errors in.

    socket.getaddrinfo encodes the host as IDNA before it resolves anything, and a
    label over 63 bytes raises UnicodeError - not an OSError, so nothing turns it
    into a SafeFetchError. Catching only SafeFetchError lets it escape as a 500
    with a traceback, and skips the degrade paths in register_agent/update_agent.
    """
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card("http://" + "a" * 64 + ".example.com")
    assert exc.value.status_code == 502
    assert exc.value.detail == "Failed to fetch AgentCard: fetch_failed"


def test_a_malformed_endpoint_is_a_502_not_an_escaped_value_error():
    """The well-known rewrite parses the endpoint too, and it ran outside the guard.

    Measured on this image (CPython 3.14): `urljoin('http://[::1/',
    '.well-known/agent.json')` raises ValueError('Invalid IPv6 URL') from urlsplit -
    before safe_fetch sees anything, and from a line that used to sit above the try
    block. So `{"endpoint": "http://[::1"}` was an unhandled 500 with a traceback,
    while the same string ending in agent.json skipped the rewrite and came back as a
    tidy `invalid_url`. Two answers for one input, and the 500 also walks past the
    degrade paths in register_agent/update_agent.
    """
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card("http://[::1")
    assert exc.value.status_code == 502
    assert exc.value.detail == "Failed to fetch AgentCard: invalid_url"
    # Same reason as the branch that does reach safe_fetch, for the same string.
    with pytest.raises(HTTPException) as direct:
        a2a._fetch_agent_card("http://[::1/agent.json")
    assert direct.value.detail == exc.value.detail


def test_a_malformed_endpoint_is_a_502_through_the_route_too():
    """End to end: no 500, and urllib's parse message does not reach the caller."""
    with _client_for("/a2a/fetch-card") as client:
        resp = client.post("/a2a/fetch-card", json={"endpoint": "http://[::1"})
    assert resp.status_code == 502
    assert resp.json()["detail"] == "Failed to fetch AgentCard: invalid_url"
    assert "IPv6" not in resp.text


def test_a_deeply_nested_card_is_a_502_not_an_escaped_exception(loopback_allowed, card_server):
    """A body under the cap can still blow the JSON parser's stack.

    120 KB of nested arrays passes the size check, so `SafeResponse.json()` hands
    it to json.loads, which raises RecursionError - not one of the decode errors
    that method converts.
    """
    nested = b"[" * 60_000 + b"]" * 60_000
    assert len(nested) < a2a._AGENT_CARD_MAX_BYTES, "the point is that the cap does not catch this"
    base, _ = card_server(payload=nested)
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card(base)
    assert exc.value.status_code == 502
    assert exc.value.detail == "Failed to fetch AgentCard: fetch_failed"


def test_an_unexpected_error_is_a_502_through_the_route_too():
    """End to end: the client sees a 502, not a 500 carrying exception text."""
    with _client_for("/a2a/fetch-card") as client:
        resp = client.post(
            "/a2a/fetch-card", json={"endpoint": "http://" + "a" * 64 + ".example.com"}
        )
    assert resp.status_code == 502
    assert resp.json()["detail"] == "Failed to fetch AgentCard: fetch_failed"
    assert "label too long" not in resp.text


# --------------------------------------------------------------------------
# The legitimate case still works
# --------------------------------------------------------------------------


def test_a_valid_card_still_parses(loopback_allowed, card_server):
    base, requested = card_server()
    url, card = a2a._fetch_agent_card(base)
    assert url == f"{base}/.well-known/agent.json"
    assert card == VALID_CARD
    assert requested == ["/.well-known/agent.json"]


def test_a_trailing_slash_does_not_double_up(loopback_allowed, card_server):
    base, requested = card_server()
    url, card = a2a._fetch_agent_card(base + "/")
    assert url == f"{base}/.well-known/agent.json"
    assert card == VALID_CARD


def test_an_endpoint_naming_the_card_directly_is_not_rewritten(loopback_allowed, card_server):
    base, requested = card_server()
    url, card = a2a._fetch_agent_card(f"{base}/custom/agent.json")
    assert url == f"{base}/custom/agent.json"
    assert card == VALID_CARD
    assert requested == ["/custom/agent.json"]


# --------------------------------------------------------------------------
# Upstream failures still surface as 502, with bounded reads
# --------------------------------------------------------------------------


def test_a_redirect_to_imds_is_refused_on_the_second_hop(loopback_allowed, card_server):
    """A first-hop-only check is defeated by a 302.

    The card host is permitted; it answers `Location: http://169.254.169.254/`,
    which is what a hostile agent-card server would do.
    """
    base, _ = card_server(redirect_to=f"http://{IMDS}/latest/meta-data/")
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card(base)
    assert exc.value.detail == "Failed to fetch AgentCard: blocked_link_local_address"


def test_an_upstream_error_status_is_a_502(loopback_allowed, card_server):
    base, _ = card_server(status=404, payload=b'{"error": "nope"}')
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card(base)
    assert exc.value.status_code == 502
    assert exc.value.detail == "Failed to fetch AgentCard: http_status_error"


def test_a_non_json_card_is_a_502(loopback_allowed, card_server):
    base, _ = card_server(payload=b"<html>login page</html>")
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card(base)
    assert exc.value.detail == "Failed to fetch AgentCard: invalid_json_response"


def test_a_card_that_is_not_a_json_object_is_a_502(loopback_allowed, card_server):
    """`_to_ui` reads the stored card as a dict, so a list must not be stored."""
    base, _ = card_server(payload=b"[1, 2, 3]")
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card(base)
    assert exc.value.detail == "Failed to fetch AgentCard: invalid_card_shape"


def test_an_oversized_card_is_capped_rather_than_buffered(loopback_allowed, card_server):
    """An unbounded caller-supplied response is a memory-exhaustion primitive.

    The read stops at the cap, and `fetch_json` refuses the truncated body outright
    rather than parsing it. The category has to say so: reporting a 300 KB card as
    `invalid_json_response` sends the operator to debug the peer's JSON when the
    problem is the size limit here.
    """
    oversized = b'{"name": "' + b"a" * (a2a._AGENT_CARD_MAX_BYTES + 4096) + b'"}'
    base, _ = card_server(payload=oversized)
    with pytest.raises(HTTPException) as exc:
        a2a._fetch_agent_card(base)
    assert exc.value.status_code == 502
    assert exc.value.detail == "Failed to fetch AgentCard: response_too_large"


def test_a_card_just_under_the_cap_is_still_accepted(loopback_allowed, card_server):
    """The cap must not be so tight that a large but legitimate card is refused."""
    filler = "b" * (a2a._AGENT_CARD_MAX_BYTES // 2)
    payload = json.dumps({**VALID_CARD, "description": filler}).encode("utf-8")
    base, _ = card_server(payload=payload)
    _url, card = a2a._fetch_agent_card(base)
    assert card["description"] == filler


# --------------------------------------------------------------------------
# A registration whose card can never be fetched fails loudly
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "endpoint,reason,hinted",
    [
        ("http://10.0.3.14:8080", "blocked_private_address", True),
        ("http://192.168.1.20", "blocked_private_address", True),
        ("http://100.64.0.1", "blocked_non_global_address", True),
        # The allowlist cannot override loopback, and a scheme or an unparseable URL
        # is not an address for it to override at all
        # (safe_fetch.is_allowlistable_refusal owns that answer). Naming the setting
        # for these three is advice that cannot work, so the refusal must not.
        ("http://127.0.0.1:8080", "blocked_loopback_address", False),
        ("ftp://peer.example.test", "blocked_scheme", False),
        ("http://[::1", "invalid_url", False),
    ],
)
def test_registering_an_endpoint_the_guard_refuses_is_a_400_not_a_quiet_201(
    registry, endpoint, reason, hinted
):
    """The degrade path is for a peer that is down, not for one we will never call.

    Swallowing this refusal answered 201 for an agent with an empty capability set,
    an empty description and a stored endpoint nothing had validated - with only a
    backend WARNING to explain it. The refusal has to reach the operator, and where a
    CIDR entry would make the peer reachable it has to say so, or the only way to find
    out is to read the source.
    """
    with _client_for("/a2a") as client:
        resp = client.post("/a2a", json={"name": "Internal peer", "endpoint": endpoint})

    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert reason in detail
    assert ("SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in detail) is hinted, detail
    # Still no echo: the operator learns the category and the setting, not the
    # address the name resolved to.
    assert endpoint not in resp.text
    assert "10.0.3.14" not in resp.text
    assert registry == [], "nothing may be persisted for an endpoint that was never fetched"


def test_registering_an_unreachable_public_peer_still_succeeds(monkeypatch, registry):
    """The tolerant path survives, narrowed to what it was for: a peer that is down.

    A public endpoint that refuses the connection may well be mid-deploy, so the
    record is created with an empty card and refetched on the next endpoint update.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))

    def _refuse(address, timeout=None, *a, **kw):
        raise ConnectionRefusedError(111, "Connection refused")

    monkeypatch.setattr(socket, "create_connection", _refuse)
    with _client_for("/a2a") as client:
        resp = client.post("/a2a", json={"name": "Booting peer", "endpoint": "http://peer.example.test"})

    assert resp.status_code == 201
    assert len(registry) == 1
    assert registry[0]["agent_card"] == {}
    assert registry[0]["agent_card_url"] == "http://peer.example.test"


def test_updating_to_an_endpoint_the_guard_refuses_is_a_400(monkeypatch, registry):
    """PATCH had the same swallow, and its version also kept the old card.

    That left the record describing neither endpoint: the stored URL from the
    request, the capabilities from the one before it.
    """
    monkeypatch.setattr(
        a2a.reg,
        "get_record",
        lambda rid: {
            "recordId": rid,
            "status": "APPROVED",
            "descriptors": {"a2aAgentCard": {"dataParsed": dict(VALID_CARD)}},
        },
    )
    written: list[dict] = []

    class _Control:
        def update_registry_record(self, **kwargs):
            written.append(kwargs)
            return {}

    # The route imports these from the module at call time, so patching the module
    # attribute is what reaches it.
    monkeypatch.setattr(a2a.reg, "control_client", lambda: _Control())
    with _client_for("/a2a/{agent_id}") as client:
        resp = client.patch("/a2a/rec-1", json={"endpoint": "http://192.168.1.20"})

    assert resp.status_code == 400
    assert written == [], "the record must not be rewritten around an unfetchable endpoint"
    assert "blocked_private_address" in resp.json()["detail"]
    assert "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in resp.json()["detail"]
    assert "192.168.1.20" not in resp.text
