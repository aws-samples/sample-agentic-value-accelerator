"""Tests for the caller-supplied values the multicloud connectors fetch and query.

Three surfaces, all reachable from an admin-gated request body:

- `instance_url` (ServiceNow) and `login_url` (Salesforce) were stored with no scheme or
  host validation and then concatenated with a fixed path and POSTed, so a configure call
  turned the backend into a fetcher for anything it could reach.
- `instance_url` in the Salesforce *token response* was taken raw and used as the base for
  requests carrying `Authorization: Bearer <token>`, so whoever controlled `login_url` also
  chose where the next request went and received the token.
- `billing_export_table` is interpolated into the BigQuery billing query's FROM clause. The
  date bounds are real ScalarQueryParameters, which is what makes the table name easy to
  miss: it cannot be a parameter, so validation is the only fix available.

The assertions are about this module's contract, not safe_fetch's internals (those live in
test_safe_fetch.py): a refusal happens before any socket is opened, the refusal names no
host or resolved address, and a legitimate value still passes.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
import sys
import threading
import types

import pytest
from fastapi import HTTPException

import api.routes.multicloud as routes
from core import safe_fetch
from core.safe_fetch import SafeFetchError, SafeResponse
from services import multicloud_connector_service as mc
from services.multicloud_connector_service import (
    InvalidBillingTableError,
    InvalidConnectorIdentifierError,
    SalesforceConnector,
    validate_billing_export_table,
    validate_connector_base_url,
    validate_gcp_project_id,
    validate_url_path_segment,
)

IMDS = "169.254.169.254"
PUBLIC = "93.184.216.34"


def _dns_down(*args, **kwargs):
    """A resolver that is unavailable, not a name that does not exist.

    Same exception either way - getaddrinfo cannot tell the caller which it was, which is
    the whole reason a resolution failure is not a verdict on the URL.
    """
    raise socket.gaierror(-2, "Name or service not known")


def _fake_getaddrinfo(*addresses: str):
    """Resolve any NAME to `addresses`, so a public-looking name can point inward.

    An IP literal is returned unchanged. Real getaddrinfo does that, and a fake that
    rewrote literals would quietly make `http://169.254.169.254/` look public - the fake
    would be answering the question under test.
    """

    def _resolve(host, port, *args, **kwargs):
        try:
            ipaddress.ip_address(host)
        except ValueError:
            resolved = addresses
        else:
            resolved = (host,)

        out = []
        for a in resolved:
            family = socket.AF_INET6 if ":" in a else socket.AF_INET
            sockaddr = (a, port, 0, 0) if family == socket.AF_INET6 else (a, port)
            out.append((family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", sockaddr))
        return out

    return _resolve


@pytest.fixture
def no_sockets(monkeypatch):
    """Fail loudly if anything tries to connect, and report what it tried to reach."""
    attempts: list[tuple] = []

    def _create_connection(address, *a, **kw):
        attempts.append(address)
        raise OSError("connection refused by test")

    monkeypatch.setattr(socket, "create_connection", _create_connection)
    return attempts


# --------------------------------------------------------------------------
# A. validate_connector_base_url - the write-boundary check
# --------------------------------------------------------------------------


def test_imds_url_is_refused_before_any_socket(monkeypatch, no_sockets):
    with pytest.raises(SafeFetchError) as exc:
        validate_connector_base_url(f"http://{IMDS}/")

    assert exc.value.reason == "blocked_link_local_address"
    assert no_sockets == [], "the refusal must happen before any socket is opened"


def test_a_public_name_resolving_to_imds_is_refused(monkeypatch, no_sockets):
    """The attack that a first-hop hostname allowlist would miss: DNS points inward."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))

    with pytest.raises(SafeFetchError) as exc:
        validate_connector_base_url("https://dev12345.service-now.example")

    assert exc.value.reason == "blocked_link_local_address"
    assert no_sockets == []


@pytest.mark.parametrize(
    "url,reason",
    [
        # A bare trailing '?' is the one that matters: urlparse reports query='' for it,
        # so a check on the parsed fields would pass exactly this value while
        # f"{base}/oauth_token.do" still becomes a query string.
        ("https://attacker.example.com/x?", "blocked_url_query_or_fragment"),
        ("https://attacker.example.com/x?a=b", "blocked_url_query_or_fragment"),
        ("https://attacker.example.com/x#", "blocked_url_query_or_fragment"),
        ("https://attacker.example.com/x;p", "blocked_url_query_or_fragment"),
        ("file:///etc/passwd", "blocked_scheme"),
        ("gopher://example.com/", "blocked_scheme"),
        ("https://user:pw@example.com", "blocked_url_credentials"),
        ("", "invalid_url"),
    ],
)
def test_non_base_urls_are_refused_by_reason(url, reason, no_sockets):
    with pytest.raises(SafeFetchError) as exc:
        validate_connector_base_url(url)
    assert exc.value.reason == reason
    assert no_sockets == []


def test_none_is_refused_rather_than_crashing(no_sockets):
    """A missing field must be a refusal, not an AttributeError 500."""
    with pytest.raises(SafeFetchError) as exc:
        validate_connector_base_url(None)
    assert exc.value.reason == "invalid_url"


def test_a_resolution_failure_is_not_a_verdict_when_the_caller_says_so(monkeypatch, no_sockets):
    """require_resolvable=False is for the write boundary: DNS being down stores anyway."""
    monkeypatch.setattr(socket, "getaddrinfo", _dns_down)

    with pytest.raises(SafeFetchError) as exc:
        validate_connector_base_url("https://dev12345.service-now.com")
    assert exc.value.reason == "unresolvable_host"

    assert validate_connector_base_url(
        "https://dev12345.service-now.com/", require_resolvable=False
    ) == "https://dev12345.service-now.com"
    assert no_sockets == []


@pytest.mark.parametrize(
    "url,reason",
    [
        ("file:///etc/passwd", "blocked_scheme"),
        ("https://attacker.example.com/x?", "blocked_url_query_or_fragment"),
        ("https://user:pw@example.com", "blocked_url_credentials"),
        (None, "invalid_url"),
    ],
)
def test_tolerating_a_dead_resolver_tolerates_nothing_else(monkeypatch, url, reason, no_sockets):
    """The leniency is scoped to resolution. Structure is still refused with DNS down."""
    monkeypatch.setattr(socket, "getaddrinfo", _dns_down)

    with pytest.raises(SafeFetchError) as exc:
        validate_connector_base_url(url, require_resolvable=False)
    assert exc.value.reason == reason
    assert no_sockets == []


def test_an_address_verdict_survives_require_resolvable_false(monkeypatch, no_sockets):
    """A name that resolves INWARD is refused at the write boundary too. Only a resolver
    that answers nothing at all is tolerated."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(IMDS))

    with pytest.raises(SafeFetchError) as exc:
        validate_connector_base_url("https://dev12345.service-now.example", require_resolvable=False)
    assert exc.value.reason == "blocked_link_local_address"
    assert no_sockets == []


def test_a_legitimate_instance_url_is_accepted_and_normalised(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))

    assert validate_connector_base_url("https://dev12345.service-now.com") == \
        "https://dev12345.service-now.com"
    # Trailing slash removed, because every call site concatenates a rooted path.
    assert validate_connector_base_url("https://dev12345.service-now.com/") == \
        "https://dev12345.service-now.com"
    assert validate_connector_base_url("https://login.salesforce.com") == \
        "https://login.salesforce.com"


# --------------------------------------------------------------------------
# B. The configure routes - what an admin gets back
# --------------------------------------------------------------------------


def _configure_servicenow(url: str):
    """Call the route handler directly.

    asyncio.run avoids pulling a TestClient (and Cognito/DDB wiring) into these tests. The
    handler awaits one asyncio.to_thread hop - the write and the DNS lookup inside it are
    blocking - which asyncio.run drives exactly as uvicorn would.
    """
    request = routes.ConfigureServiceNowRequest(
        instance_url=url, client_id="cid", client_secret="sec", monthly_license_cost=0
    )
    return asyncio.run(routes.configure_servicenow(request))


def _configure_salesforce(url: str):
    request = routes.ConfigureSalesforceRequest(
        client_id="cid", client_secret="sec", login_url=url, monthly_license_cost=0
    )
    return asyncio.run(routes.configure_salesforce(request))


@pytest.fixture
def no_secret_writes(monkeypatch):
    """Record every Secrets Manager write instead of performing one.

    The point of validating at the write boundary is that a refused URL is never stored,
    so the test has to be able to say the store was not called.
    """
    written: list[tuple] = []

    def _save(name, value, region):
        written.append((name, value, region))
        return True

    monkeypatch.setattr(mc, "_save_secret", _save)
    return written


def test_configuring_servicenow_with_imds_is_a_400_and_stores_nothing(no_secret_writes, no_sockets):
    with pytest.raises(HTTPException) as exc:
        _configure_servicenow(f"http://{IMDS}/")

    assert exc.value.status_code == 400
    assert exc.value.detail == "instance_url rejected: blocked_link_local_address"
    assert no_secret_writes == [], "a refused URL must never reach Secrets Manager"
    assert no_sockets == []


def test_the_400_does_not_echo_the_target_or_the_resolved_address(
    monkeypatch, no_secret_writes, no_sockets
):
    """Echoing the host and its address turns the refusal into the port scan it prevented.

    The message now also names SAFE_FETCH_ALLOWED_PRIVATE_CIDRS, because an operator whose
    connector really is internal needs to know the switch exists. It names the setting, not
    the address, so the no-echo property is unchanged.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.0.13.7"))

    with pytest.raises(HTTPException) as exc:
        _configure_servicenow("https://internal-admin.example.com:8500")

    detail = exc.value.detail
    assert detail.startswith("instance_url rejected: blocked_private_address")
    assert "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in detail
    assert "10.0.13.7" not in detail
    assert "internal-admin.example.com" not in detail
    assert "8500" not in detail


def test_the_allowlist_hint_is_absent_for_a_refusal_it_cannot_override(no_secret_writes, no_sockets):
    """Never suggest the allowlist for IMDS: no CIDR an operator writes will permit it."""
    with pytest.raises(HTTPException) as exc:
        _configure_servicenow(f"http://{IMDS}/")

    assert "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" not in exc.value.detail


def test_a_dead_resolver_does_not_refuse_valid_credentials(
    monkeypatch, no_secret_writes, no_sockets
):
    """A transient DNS failure must not become a permanent 400 that stores nothing.

    The backend can be without egress DNS at the moment of the POST (a demo box, a resolver
    outage, an instance whose DNS has not propagated). The URL is structurally fine, so it
    is stored and re-validated - resolution included - on every use.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _dns_down)

    result = _configure_servicenow("https://dev12345.service-now.com/")

    assert result.success is True
    assert len(no_secret_writes) == 1
    assert no_secret_writes[0][1]["instance_url"] == "https://dev12345.service-now.com"


def test_a_dead_resolver_still_refuses_a_structurally_forbidden_url(
    monkeypatch, no_secret_writes, no_sockets
):
    monkeypatch.setattr(socket, "getaddrinfo", _dns_down)

    with pytest.raises(HTTPException) as exc:
        _configure_salesforce("file:///etc/passwd")

    assert exc.value.detail == "login_url rejected: blocked_scheme"
    assert no_secret_writes == []


def test_the_unresolvable_url_is_still_refused_at_use_time(monkeypatch, no_sockets):
    """What makes the lenient write safe: the use path is the real gate, every time."""
    monkeypatch.setattr(socket, "getaddrinfo", _dns_down)
    sent: list[str] = []
    monkeypatch.setattr(
        safe_fetch, "fetch", lambda url, **kw: sent.append(url) or SafeResponse(200, b"{}", url)
    )

    connector = _servicenow_with("https://dev12345.service-now.com")

    assert connector._get_access_token() is None
    assert sent == []
    # Retryable, and named as the network condition it is - not as a rejected URL.
    assert connector.auth_state() == "unavailable"
    assert connector.auth_detail() == "unresolvable_host"


def test_configure_never_resolves_on_the_event_loop(monkeypatch, no_secret_writes, no_sockets):
    """socket.getaddrinfo takes no timeout, so it must not run on the loop thread.

    A hostname whose authoritative nameserver black-holes UDP blocks for the resolver's own
    10-40s, and on the event-loop thread that is every other request on this worker.
    """
    resolve = _fake_getaddrinfo(PUBLIC)
    resolver_threads: list[int] = []

    def _recording_getaddrinfo(*args, **kwargs):
        resolver_threads.append(threading.get_ident())
        return resolve(*args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", _recording_getaddrinfo)

    request = routes.ConfigureServiceNowRequest(
        instance_url="https://dev12345.service-now.com",
        client_id="cid",
        client_secret="sec",
        monthly_license_cost=0,
    )
    loop_thread: list[int] = []

    async def _drive():
        loop_thread.append(threading.get_ident())
        return await routes.configure_servicenow(request)

    result = asyncio.run(_drive())

    assert result.success is True
    assert resolver_threads, "the write boundary must still resolve the URL"
    assert loop_thread[0] not in resolver_threads


def test_the_refusal_detail_is_logged_even_though_it_is_not_returned(
    monkeypatch, no_secret_writes, no_sockets, caplog
):
    """The address has to go somewhere: a refusal nobody can diagnose gets reverted."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.0.13.7"))

    with caplog.at_level(logging.WARNING, logger=routes.__name__):
        with pytest.raises(HTTPException):
            _configure_servicenow("https://internal-admin.example.com")

    assert "10.0.13.7" in caplog.text
    assert "internal-admin.example.com" in caplog.text


def test_configuring_servicenow_with_a_trailing_question_mark_is_refused(
    no_secret_writes, no_sockets
):
    """`https://host/x?` + `/oauth_token.do` is a query string, not a path."""
    with pytest.raises(HTTPException) as exc:
        _configure_servicenow("https://attacker.example.com/x?")

    assert exc.value.status_code == 400
    assert exc.value.detail == "instance_url rejected: blocked_url_query_or_fragment"
    assert no_secret_writes == []


def test_configuring_salesforce_with_a_bad_login_url_names_that_field(
    no_secret_writes, no_sockets
):
    with pytest.raises(HTTPException) as exc:
        _configure_salesforce("http://127.0.0.1:8080")

    assert exc.value.status_code == 400
    assert exc.value.detail == "login_url rejected: blocked_loopback_address"
    assert no_secret_writes == []


def test_a_legitimate_servicenow_configure_still_stores_the_url(
    monkeypatch, no_secret_writes, no_sockets
):
    """The regression guard: this fix must not break the working integration."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))

    result = _configure_servicenow("https://dev12345.service-now.com")

    assert result.success is True
    assert len(no_secret_writes) == 1
    name, value, _region = no_secret_writes[0]
    assert name == mc.SERVICENOW_SECRET_NAME
    assert value["instance_url"] == "https://dev12345.service-now.com"


# --------------------------------------------------------------------------
# C. Use-time validation: stored config predates the write-boundary check
# --------------------------------------------------------------------------


def _servicenow_with(url: str) -> mc.ServiceNowConnector:
    connector = mc.ServiceNowConnector(region="us-east-1")
    connector._credentials = {
        "instance_url": url,
        "client_id": "cid",
        "client_secret": "sec",
    }
    return connector


def test_a_stored_imds_instance_url_is_refused_at_use_time(monkeypatch, no_sockets):
    """A secret written before this change still has to be refused when it is used."""
    sent: list[str] = []
    monkeypatch.setattr(
        safe_fetch, "fetch", lambda url, **kw: sent.append(url) or SafeResponse(200, b"{}", url)
    )

    connector = _servicenow_with(f"http://{IMDS}")
    assert connector._get_access_token() is None
    assert sent == [], "no request may be built from a refused instance_url"
    # "incomplete", not "rejected": nothing was sent, so no provider rejected anything.
    # Non-retryable either way - only a new secret version can change this answer.
    assert connector.auth_state() == "incomplete"
    assert connector.auth_detail() == "connector URL refused - blocked_link_local_address"


def test_the_status_line_for_a_refused_url_blames_nobody_and_names_no_address(monkeypatch, no_sockets):
    """What an operator actually reads. Two things it must not say.

    Not "rejected by the provider" - no request was sent, so no provider had an opinion.
    And not the resolved address, which is the whole point of the refusal.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.0.13.7"))
    service = mc.MultiCloudConnectorService(region="us-east-1")
    service._servicenow._credentials = {
        "instance_url": "https://internal-admin.example.com",
        "client_id": "cid",
        "client_secret": "sec",
    }

    status = service._connector_status(
        service._servicenow,
        provider="servicenow",
        label="ServiceNow",
        source="servicenow-ai-agent-studio",
        connected_detail="Connected.",
        config_hint="Add ServiceNow instance credentials.",
    )

    assert status.connected is False
    assert status.configured is True
    assert "rejected by the provider" not in status.detail
    assert "10.0.13.7" not in status.detail
    assert "10.0.13.7" not in (status.auth_detail or "")
    assert status.detail == (
        "Credentials incomplete (connector URL refused - blocked_private_address). "
        "Re-save them in Settings > Connectors."
    )


def test_the_servicenow_token_request_goes_to_the_configured_instance(monkeypatch):
    """The legitimate path: same URL, same form body, same 10s timeout as before."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))
    calls: list[dict] = []

    def _fetch(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return SafeResponse(200, b'{"access_token": "tok", "expires_in": 1800}', url)

    monkeypatch.setattr(safe_fetch, "fetch", _fetch)

    connector = _servicenow_with("https://dev12345.service-now.com/")
    assert connector._get_access_token() == "tok"

    assert calls[0]["url"] == "https://dev12345.service-now.com/oauth_token.do"
    assert calls[0]["method"] == "POST"
    assert calls[0]["timeout"] == 10
    assert calls[0]["data"]["grant_type"] == "client_credentials"
    assert calls[0]["headers"]["User-Agent"] == "ava-control-plane"
    assert connector.auth_state() == "ok"


# --------------------------------------------------------------------------
# D. The second-order instance_url from the Salesforce token response
# --------------------------------------------------------------------------


def _salesforce_with(login_url: str) -> SalesforceConnector:
    connector = SalesforceConnector(region="us-east-1")
    connector._credentials = {
        "login_url": login_url,
        "client_id": "cid",
        "client_secret": "sec",
    }
    return connector


def _token_response(instance_url):
    """A Salesforce client-credentials token response naming `instance_url`."""
    body = {"access_token": "tok"}
    if instance_url is not None:
        body["instance_url"] = instance_url
    import json as _json

    return _json.dumps(body).encode()


@pytest.mark.parametrize(
    "hostile_instance_url,reason",
    [
        (f"http://{IMDS}", "blocked_link_local_address"),
        ("http://127.0.0.1:9000", "blocked_loopback_address"),
        ("https://attacker.example.com/x?", "blocked_url_query_or_fragment"),
        (None, "invalid_url"),
    ],
)
def test_a_hostile_instance_url_in_the_token_response_fails_auth(
    monkeypatch, hostile_instance_url, reason
):
    """Whoever controls login_url must not also get the bearer token delivered.

    The token is not cached and no fallback host is used: auth simply failed.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))
    monkeypatch.setattr(
        safe_fetch,
        "fetch",
        lambda url, **kw: SafeResponse(200, _token_response(hostile_instance_url), url),
    )

    connector = _salesforce_with("https://login.salesforce.com")
    assert connector._get_access_token() is None
    assert connector._token is None, "the token must not be cached behind a refused host"
    assert connector._instance_url is None
    # "rejected" here: the exchange happened, and this is a verdict on its response.
    assert connector.auth_state() == "rejected"
    assert connector.auth_detail() == f"instance_url refused - {reason}"


def test_get_agents_sends_nothing_when_the_instance_url_was_refused(monkeypatch):
    """The end-to-end consequence: no request, no bearer token, live=False."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))
    sent: list[str] = []

    def _fetch(url, **kwargs):
        sent.append(url)
        return SafeResponse(200, _token_response(f"http://{IMDS}"), url)

    monkeypatch.setattr(safe_fetch, "fetch", _fetch)

    connector = _salesforce_with("https://login.salesforce.com")
    inventory = connector.get_agents()

    assert inventory.live is False
    assert sent == ["https://login.salesforce.com/services/oauth2/token"], \
        "only the token request may go out"
    assert IMDS not in (inventory.note or "")


def test_a_legitimate_instance_url_is_kept_and_used(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))
    calls: list[dict] = []

    def _fetch(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if url.endswith("/services/oauth2/token"):
            return SafeResponse(200, _token_response("https://acme.my.salesforce.com/"), url)
        return SafeResponse(200, b'{"records": [{"Id": "1", "MasterLabel": "Bot", "Status": "Active"}]}', url)

    monkeypatch.setattr(safe_fetch, "fetch", _fetch)

    connector = _salesforce_with("https://login.salesforce.com")
    inventory = connector.get_agents()

    assert inventory.live is True
    assert inventory.total == 1
    assert calls[0]["url"] == "https://login.salesforce.com/services/oauth2/token"
    assert calls[1]["url"] == "https://acme.my.salesforce.com/services/data/v59.0/query"
    assert calls[1]["timeout"] == 15
    assert calls[1]["headers"]["Authorization"] == "Bearer tok"


def test_a_truncated_inventory_body_is_refused_rather_than_counted(monkeypatch):
    """safe_fetch caps the body at 5 MB. A short read is not the upstream's answer.

    Parsing it either fails as "invalid_json_response", which the cool-off treats as
    retryable and would re-probe forever, or succeeds on a shorter document and reports
    fewer agents than exist under a live badge.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))

    def _fetch(url, **kwargs):
        if url.endswith("/services/oauth2/token"):
            return SafeResponse(200, _token_response("https://acme.my.salesforce.com"), url)
        return SafeResponse(200, b'{"records": []}', url, truncated=True)

    monkeypatch.setattr(safe_fetch, "fetch", _fetch)

    inventory = _salesforce_with("https://login.salesforce.com").get_agents()

    assert inventory.live is False
    assert inventory.total == 0
    assert inventory.note == "API error: response_too_large"


def test_a_truncated_token_body_is_not_treated_as_a_retryable_blip(monkeypatch):
    """And it is not called a refused URL either: the exchange happened."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))
    monkeypatch.setattr(
        safe_fetch,
        "fetch",
        lambda url, **kw: SafeResponse(200, _token_response("https://acme.my.salesforce.com"), url, truncated=True),
    )

    connector = _salesforce_with("https://login.salesforce.com")

    assert connector._get_access_token() is None
    assert connector.auth_state() == "rejected"
    assert connector.auth_detail() == "response_too_large"


def test_every_connector_call_still_sends_a_user_agent(monkeypatch):
    """requests sent one; http.client sends none, and SaaS edge rules 403 a UA-less GET."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))
    calls: list[dict] = []

    def _fetch(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if url.endswith("/services/oauth2/token"):
            return SafeResponse(200, _token_response("https://acme.my.salesforce.com"), url)
        return SafeResponse(200, b'{"records": []}', url)

    monkeypatch.setattr(safe_fetch, "fetch", _fetch)

    _salesforce_with("https://login.salesforce.com").get_agents()

    assert len(calls) == 2, "token exchange then inventory"
    for call in calls:
        assert call["headers"]["User-Agent"] == "ava-control-plane"
        assert call["headers"]["Accept"] == "application/json"
    # The bearer token is still on the request that needs it.
    assert calls[1]["headers"]["Authorization"] == "Bearer tok"


def test_a_refused_fetch_note_carries_the_reason_and_not_the_host(monkeypatch):
    """A refusal reported to the UI names the category only; detail goes to the log."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))

    def _fetch(url, **kwargs):
        if url.endswith("/services/oauth2/token"):
            return SafeResponse(200, _token_response("https://acme.my.salesforce.com"), url)
        raise SafeFetchError("blocked_private_address", "host=acme.my.salesforce.com resolved=10.0.0.9")

    monkeypatch.setattr(safe_fetch, "fetch", _fetch)

    inventory = _salesforce_with("https://login.salesforce.com").get_agents()

    assert inventory.live is False
    assert inventory.note == "API error: blocked_private_address"
    assert "10.0.0.9" not in inventory.note
    assert "acme.my.salesforce.com" not in inventory.note


# --------------------------------------------------------------------------
# E. BigQuery table name - the only value in that query that cannot be a parameter
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "table",
    [
        "proj.dataset.table",
        "dataset.table",
        "my-proj-123.billing_export.gcp_billing_export_v1_0123456789ABCD",
    ],
)
def test_legitimate_table_names_are_accepted(table):
    assert validate_billing_export_table(table) == table


@pytest.mark.parametrize(
    "payload",
    [
        "proj.dataset.table` WHERE 1=1 UNION ALL SELECT * FROM `other.secret.table",
        "proj.dataset.table; DROP TABLE users",
        "proj.dataset.table` -- ",
        "proj.dataset.table`, `other.d.t",
        "proj.dataset.table /* comment */",
        "(SELECT 1)",
        "proj.dataset.table WHERE 1=1",
        "proj..table",
        "proj.dataset.table.extra.part",
        "",
        "   ",
        None,
    ],
)
def test_injection_payloads_are_rejected(payload):
    with pytest.raises(InvalidBillingTableError):
        validate_billing_export_table(payload)


def test_the_rejection_message_does_not_echo_the_payload():
    """The message reaches the UI, so it states the grammar rather than the input."""
    payload = "proj.d.t` UNION ALL SELECT secret FROM `x.y.z"
    with pytest.raises(InvalidBillingTableError) as exc:
        validate_billing_export_table(payload)
    assert "UNION" not in str(exc.value)
    assert "`" not in str(exc.value)


def test_configuring_gcp_with_an_injection_payload_is_a_400_and_stores_nothing(no_secret_writes):
    request = routes.ConfigureGCPRequest(
        project_id="proj",
        service_account_json="{}",
        billing_export_table="proj.dataset.table` ; DROP TABLE x --",
        location="us-central1",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.configure_gcp(request))

    assert exc.value.status_code == 400
    assert exc.value.detail.startswith("billing_export_table rejected:")
    assert "DROP TABLE" not in exc.value.detail
    assert no_secret_writes == []


def test_configuring_gcp_with_a_valid_table_still_stores_it(no_secret_writes):
    request = routes.ConfigureGCPRequest(
        project_id="proj",
        service_account_json="{}",
        billing_export_table="proj.billing_export.gcp_billing_export_v1",
        location="us-central1",
    )

    result = asyncio.run(routes.configure_gcp(request))

    assert result.success is True
    assert no_secret_writes[0][1]["billing_export_table"] == \
        "proj.billing_export.gcp_billing_export_v1"


def test_a_stored_injection_payload_refuses_the_cost_query(monkeypatch):
    """Use-time guard, and it must refuse rather than fall back to the default table.

    A fallback would report a different table's numbers under the same live badge.
    """
    connector = mc.GCPConnector(region="us-east-1")
    connector._credentials = {
        "project_id": "proj",
        "service_account_json": "{}",
        "billing_export_table": "proj.d.t` UNION ALL SELECT * FROM `other.d.t",
    }
    # The BigQuery client must never be constructed, let alone queried.
    monkeypatch.setattr(connector, "_get_gcp_credentials", lambda: object())

    summary = connector.get_cost_summary(30)

    assert summary.live is False
    assert summary.total == 0
    assert "UNION" not in (summary.note or "")
    assert "billing export table" in summary.note


@pytest.fixture
def fake_bigquery(monkeypatch):
    """A stand-in google.cloud.bigquery that records the SQL instead of running it.

    The package is not installed in this environment, and the assertion is about the string
    that reaches the FROM clause - which is visible here and nowhere else.
    """
    queries: list[str] = []

    class _Job:
        def result(self):
            return []

    class _Client:
        def __init__(self, credentials=None, project=None):
            pass

        def query(self, query, job_config=None):
            queries.append(query)
            return _Job()

    bigquery = types.ModuleType("google.cloud.bigquery")
    bigquery.Client = _Client
    bigquery.QueryJobConfig = lambda **kwargs: None
    bigquery.ScalarQueryParameter = lambda *args, **kwargs: None

    cloud = types.ModuleType("google.cloud")
    cloud.bigquery = bigquery
    google = types.ModuleType("google")
    google.cloud = cloud

    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.cloud", cloud)
    monkeypatch.setitem(sys.modules, "google.cloud.bigquery", bigquery)
    return queries


def _gcp_with(**creds) -> mc.GCPConnector:
    connector = mc.GCPConnector(region="us-east-1")
    connector._credentials = {"project_id": "proj", "service_account_json": "{}", **creds}
    return connector


def test_the_query_interpolates_exactly_what_the_guard_returned(monkeypatch, fake_bigquery):
    """Validate one string and interpolate another is how this class of check gets bypassed.

    A legacy secret holding a whitespace-padded table passed the guard while the FROM clause
    got the padded value, which BigQuery rejects as a malformed quoted identifier - so the
    specific, actionable note this check exists to produce never fired.
    """
    connector = _gcp_with(billing_export_table="\n  proj.dataset.table  \n")
    monkeypatch.setattr(connector, "_get_gcp_credentials", lambda: object())

    summary = connector.get_cost_summary(30)

    assert summary.live is True
    assert len(fake_bigquery) == 1
    assert "FROM `proj.dataset.table`" in fake_bigquery[0]
    assert "\n  proj" not in fake_bigquery[0]


def test_a_domain_scoped_project_id_is_a_valid_table_identifier():
    """Legacy Google-Apps project ids carry a 'domain:' prefix and dots on both sides.

    Rejecting them was a dead end rather than a refusal: the DERIVED default table inherits
    the colon, so the note asked the operator to re-save a value that could not be spelled.
    """
    assert validate_billing_export_table("example.com:proj.billing_export.table") == \
        "example.com:proj.billing_export.table"
    # Still one identifier, not two, and still no injection characters.
    with pytest.raises(InvalidBillingTableError):
        validate_billing_export_table("example.com:proj.dataset.table` -- ")


def test_the_note_for_a_derived_table_does_not_say_re_save_a_field_that_is_empty(monkeypatch):
    """With nothing stored, the rejected string came from project_id, not from a form field."""
    connector = _gcp_with(project_id="proj with a space")
    monkeypatch.setattr(connector, "_get_gcp_credentials", lambda: object())

    summary = connector.get_cost_summary(30)

    assert summary.live is False
    assert "derived" in summary.note
    assert "Re-save it" not in summary.note
    assert "proj with a space" not in summary.note


# --------------------------------------------------------------------------
# F. tenant / subscription / environment ids - one URL path segment, not an endpoint
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value",
    [
        "72f988bf-86f1-41af-91ab-2d7cd011db47",
        "contoso.onmicrosoft.com",
        "Default-72f988bf-86f1-41af-91ab-2d7cd011db47",
        "common",
    ],
)
def test_real_azure_and_power_platform_ids_are_accepted(value):
    assert validate_url_path_segment(value, "tenant_id") == value


@pytest.mark.parametrize(
    "value",
    [
        # Absorbs the fixed `?api-version=...` suffix the API requires.
        "x?a=b#",
        "x#",
        # Chooses the ARM path, carrying this platform's management.azure.com bearer token.
        "abc/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/v",
        "..",
        "x y",
        "sub\r\nid",
        "",
        "   ",
        None,
    ],
)
def test_ids_that_would_not_stay_one_path_segment_are_rejected(value):
    with pytest.raises(InvalidConnectorIdentifierError):
        validate_url_path_segment(value, "subscription_id")


def test_the_identifier_rejection_names_the_field_and_not_the_value():
    with pytest.raises(InvalidConnectorIdentifierError) as exc:
        validate_url_path_segment("abc/resourceGroups/rg?api-version=2022-07-01", "subscription_id")
    assert "subscription_id" in str(exc.value)
    assert "resourceGroups" not in str(exc.value)


def test_configuring_azure_with_a_path_bearing_subscription_id_is_a_400(no_secret_writes):
    request = routes.ConfigureAzureRequest(
        tenant_id="72f988bf-86f1-41af-91ab-2d7cd011db47",
        client_id="cid",
        client_secret="sec",
        subscription_id="abc/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/v?api-version=2022-07-01",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.configure_azure(request))

    assert exc.value.status_code == 400
    assert exc.value.detail.startswith("subscription_id must be")
    assert no_secret_writes == []


def test_configuring_copilot_studio_with_a_suffix_absorbing_environment_id_is_a_400(no_secret_writes):
    """'x?a=b#' turns `/environments/x?a=b#?api-version=...` into a request with no api-version."""
    request = routes.ConfigureCopilotStudioRequest(
        tenant_id="72f988bf-86f1-41af-91ab-2d7cd011db47",
        client_id="cid",
        client_secret="sec",
        environment_id="x?a=b#",
        monthly_capacity_cost=0,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.configure_copilot_studio(request))

    assert exc.value.status_code == 400
    assert exc.value.detail.startswith("environment_id must be")
    assert no_secret_writes == []


def test_a_legitimate_azure_configure_still_stores_both_ids(no_secret_writes):
    request = routes.ConfigureAzureRequest(
        tenant_id="contoso.onmicrosoft.com",
        client_id="cid",
        client_secret="sec",
        subscription_id="72f988bf-86f1-41af-91ab-2d7cd011db47",
    )

    result = asyncio.run(routes.configure_azure(request))

    assert result.success is True
    name, value, _region = no_secret_writes[0]
    assert name == mc.AZURE_SECRET_NAME
    assert value["tenant_id"] == "contoso.onmicrosoft.com"
    assert value["subscription_id"] == "72f988bf-86f1-41af-91ab-2d7cd011db47"


# --------------------------------------------------------------------------
# G. project_id - the last caller-supplied URL component that was stored unchecked
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "project_id",
    [
        # Chooses a different Resource Manager path instead of naming a project, on a
        # request carrying this platform's Google bearer token.
        "proj/../../v1/organizations",
        "proj?alt=media",
        # GCP spells custom methods with a colon (`/v1/projects/{p}:someMethod`), so an
        # unrestricted colon is a method call, not an id.
        "proj:getIamPolicy",
        "proj with a space",
        "..",
    ],
)
def test_configuring_gcp_with_a_project_id_that_leaves_its_path_segment_is_a_400(
    no_secret_writes, project_id
):
    request = routes.ConfigureGCPRequest(
        project_id=project_id, service_account_json="{}", location="us-central1"
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.configure_gcp(request))

    assert exc.value.status_code == 400
    assert exc.value.detail.startswith("project_id must be")
    assert project_id not in exc.value.detail
    assert no_secret_writes == []


def test_the_colon_a_legacy_project_id_carries_is_not_a_general_colon():
    """A colon is allowed only after a dotted prefix, and only one, with both sides non-empty.

    That is a shape rule, not a semantic one: it does not separate a domain prefix from a
    method call, and nothing here can tell the two apart. Running the validator directly,
    `example.com:getIamPolicy` and `a.b:setIamPolicy` are both ACCEPTED - only an undotted
    prefix like `proj:getIamPolicy` is refused. So what the dot buys is narrowing WHICH
    resource name may precede the colon, not what may follow it. It still covers the case
    that motivated the rule, because the custom-method URL a bare project id would build is
    `/v1/projects/proj:getIamPolicy` - undotted, hence refused - while a legacy
    domain-scoped id is let through whatever trails its colon.
    """
    assert validate_gcp_project_id("example.com:proj") == "example.com:proj"

    for value in ("proj:getIamPolicy", "proj:", ":proj", "a:b:c", "example.com:proj:more"):
        with pytest.raises(InvalidConnectorIdentifierError):
            validate_gcp_project_id(value)


def test_a_legacy_domain_scoped_project_id_is_still_stored(no_secret_writes):
    """The two grammars have to agree, or a legacy project is locked out rather than refused.

    `_BIGQUERY_TABLE_RE` accepts a 'domain:' prefix and the DERIVED default table inherits
    the colon from project_id, so rejecting the id at the write boundary would refuse a
    project this module's own query path documents supporting.
    """
    request = routes.ConfigureGCPRequest(
        project_id="example.com:legacy-proj", service_account_json="{}", location="us-central1"
    )

    result = asyncio.run(routes.configure_gcp(request))

    assert result.success is True
    assert no_secret_writes[0][1]["project_id"] == "example.com:legacy-proj"
    # Same value, still a valid table identifier - which is the agreement being asserted.
    assert validate_billing_export_table("example.com:legacy-proj.billing_export.t") == \
        "example.com:legacy-proj.billing_export.t"


# --------------------------------------------------------------------------
# H. Use-time validation of stored identifiers
#
# The write boundary cannot speak for a row it did not write: everything stored before
# these checks existed was never validated, and an operator editing ava/connectors/azure
# straight in the Secrets Manager console is a normal ops action that applies no validation
# at all. So each interpolation asks again, and the refusal has to name stored config rather
# than blame the provider.
# --------------------------------------------------------------------------


@pytest.fixture
def no_http(monkeypatch):
    """Fail loudly if a `requests`-based connector reaches the network, and record it.

    `no_sockets` does not cover these call sites: urllib3 opens its own socket and connects
    it rather than going through socket.create_connection. Recording the attempt is the
    assertion - a use-time refusal must send nothing at all.
    """
    import requests

    attempts: list[tuple] = []

    def _blocked(method):
        def _call(url, *args, **kwargs):
            attempts.append((method, url))
            raise AssertionError(f"a {method} was sent when none should have been")

        return _call

    monkeypatch.setattr(requests, "get", _blocked("GET"))
    monkeypatch.setattr(requests, "post", _blocked("POST"))
    return attempts


@pytest.fixture
def stored_secret(monkeypatch):
    """Install a secret as if Secrets Manager already held it.

    Assigning `_credentials` directly is not enough for test_connection: it calls
    invalidate_credentials() first - deliberately, so an operator testing a just-repaired
    secret measures the new one - so what it reads has to come back from the read path.
    """

    def _install(**fields):
        monkeypatch.setattr(mc, "_get_secret", lambda name, region=None: dict(fields))

    return _install


def _azure_with(**creds) -> mc.AzureConnector:
    connector = mc.AzureConnector(region="us-east-1")
    connector._credentials = {
        "tenant_id": "contoso.onmicrosoft.com",
        "client_id": "cid",
        "client_secret": "sec",
        "subscription_id": "72f988bf-86f1-41af-91ab-2d7cd011db47",
        **creds,
    }
    return connector


def test_a_stored_tenant_id_that_is_not_one_segment_sends_no_token_request(no_http):
    """`login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token` with a '/' in the value is
    a different path, and the POST body carries the client secret."""
    connector = _azure_with(tenant_id="72f988bf/../../common")

    assert connector._get_access_token() is None
    assert no_http == []
    # "incomplete", not "rejected": nothing was sent, so nobody rejected it - and only a new
    # secret version can change the answer, so it is not retried on the transient cadence.
    assert connector.auth_state() == "incomplete"
    assert connector.auth_detail() == "stored tenant_id is not a single URL path segment"


def test_the_azure_cost_summary_blames_stored_config_and_not_the_azure_api(monkeypatch, no_http):
    """"Azure API error" for a value this platform refused to send points at the wrong system."""
    connector = _azure_with(subscription_id="sub/providers/Microsoft.KeyVault/vaults/v")
    # The token is not what is under test; the subscription_id guard sits after it.
    monkeypatch.setattr(connector, "_get_access_token", lambda: "tok")

    summary = connector.get_cost_summary(30)

    assert summary.live is False
    assert summary.total == 0
    assert no_http == []
    assert summary.note.startswith("Stored Azure connector configuration rejected:")
    assert "subscription_id" in summary.note
    assert "Azure API error" not in summary.note
    assert "Microsoft.KeyVault" not in summary.note


def test_the_azure_agent_inventory_refuses_a_stored_subscription_id(monkeypatch, no_http):
    """Second interpolation of the same value, and its own except clause."""
    connector = _azure_with(subscription_id="sub?api-version=2015-01-01")
    monkeypatch.setattr(connector, "_get_access_token", lambda: "tok")

    inventory = connector.get_agents()

    assert inventory.live is False
    assert inventory.total == 0
    assert no_http == []
    assert inventory.note.startswith("Stored Azure connector configuration rejected:")
    assert "Azure API error" not in inventory.note


def test_azure_test_connection_reports_stored_config_not_a_connection_failure(
    stored_secret, no_http
):
    """An operator sent to "check network connectivity" for a refused stored id is stuck."""
    stored_secret(
        tenant_id="contoso.onmicrosoft.com",
        client_id="cid",
        client_secret="sec",
        subscription_id="sub?api-version=2015-01-01",
    )

    result = mc.AzureConnector(region="us-east-1").test_connection()

    assert result.success is False
    assert no_http == []
    assert result.details["error"] == "invalid_stored_identifier"
    assert "subscription_id" in result.message
    assert "Re-save it" in result.message
    assert "Connection failed" not in result.message


def test_gcp_test_connection_refuses_a_stored_project_id_before_asking_google(
    monkeypatch, stored_secret, no_http
):
    stored_secret(project_id="proj:getIamPolicy", service_account_json="{}")
    connector = mc.GCPConnector(region="us-east-1")
    # A key that loads: this is about the project_id, not the service account JSON.
    monkeypatch.setattr(connector, "_get_gcp_credentials", lambda: object())

    result = connector.test_connection()

    assert result.success is False
    assert no_http == []
    assert result.details["error"] == "invalid_stored_identifier"
    assert "project_id" in result.message
    assert "getIamPolicy" not in result.message


def test_the_copilot_agent_inventory_refuses_a_stored_environment_id(monkeypatch, no_http):
    connector = mc.CopilotStudioConnector(region="us-east-1")
    connector._credentials = {
        "tenant_id": "contoso.onmicrosoft.com",
        "client_id": "cid",
        "client_secret": "sec",
        "environment_id": "env?api-version=1#",
    }
    monkeypatch.setattr(connector, "_get_access_token", lambda: "tok")

    inventory = connector.get_agents()

    assert inventory.live is False
    assert inventory.total == 0
    assert no_http == []
    assert inventory.note.startswith("Stored Copilot Studio configuration rejected:")
    assert "environment_id" in inventory.note


def test_copilot_test_connection_refuses_a_stored_environment_id(stored_secret, no_http):
    """environment_id is optional here, so the guard has to run on the present-and-bad case."""
    stored_secret(
        tenant_id="contoso.onmicrosoft.com",
        client_id="cid",
        client_secret="sec",
        environment_id="env/../../tenants",
    )

    result = mc.CopilotStudioConnector(region="us-east-1").test_connection()

    assert result.success is False
    assert no_http == [], "the refusal must precede even the token request"
    assert result.details["error"] == "invalid_stored_identifier"
    assert "environment_id" in result.message


def test_a_refused_stored_identifier_is_logged_so_it_can_be_repaired(no_http, caplog):
    """The response names the field and the grammar; only the log names the value.

    An operator cannot fix a stored value nobody will tell them about, and the value is not
    safe to return. It goes exactly one way, with %r, so an embedded CR/LF is escaped
    instead of forging a second log record.
    """
    connector = _azure_with(tenant_id="bad\r\ntenant")

    with caplog.at_level(logging.WARNING, logger=mc.__name__):
        assert connector._get_access_token() is None

    assert "tenant_id" in caplog.text
    assert "bad\\r\\ntenant" in caplog.text, "repr escapes the CR/LF rather than emitting it"
    assert "bad\r\ntenant" not in caplog.text
    assert no_http == []


# --------------------------------------------------------------------------
# I. What the configure response says it actually did
# --------------------------------------------------------------------------


def _azure_request() -> routes.ConfigureAzureRequest:
    return routes.ConfigureAzureRequest(
        tenant_id="contoso.onmicrosoft.com",
        client_id="cid",
        client_secret="sec",
        subscription_id="72f988bf-86f1-41af-91ab-2d7cd011db47",
    )


def _gcp_request() -> routes.ConfigureGCPRequest:
    return routes.ConfigureGCPRequest(
        project_id="proj",
        service_account_json="{}",
        billing_export_table="proj.billing_export.gcp_billing_export_v1",
        location="us-central1",
    )


def _copilot_request() -> routes.ConfigureCopilotStudioRequest:
    return routes.ConfigureCopilotStudioRequest(
        tenant_id="contoso.onmicrosoft.com",
        client_id="cid",
        client_secret="sec",
        environment_id="Default-72f988bf-86f1-41af-91ab-2d7cd011db47",
        monthly_capacity_cost=0,
    )


def test_a_stored_but_unverified_url_is_not_reported_as_a_verified_one(
    monkeypatch, no_secret_writes, no_sockets
):
    """The write is deliberately lenient about DNS, so the response cannot be unconditional.

    Storing a URL whose addresses were never checked and answering "configured
    successfully" presents an unmeasured value as a measured one - the same defect as a
    derived number under a live badge. The only record of it used to be a server-side log
    the operator never sees.
    """
    monkeypatch.setattr(socket, "getaddrinfo", _dns_down)

    result = _configure_servicenow("https://dev12345.service-now.com/")

    assert result.success is True, "the credentials are still stored"
    assert len(no_secret_writes) == 1
    assert result.url_verified is False
    assert "configured successfully" not in result.message
    assert "could not be verified" in result.message
    assert "instance_url" in result.message
    # Still a response body: it names the field, never the target or its addresses.
    assert "dev12345" not in result.message


def test_a_resolved_url_is_reported_as_verified(monkeypatch, no_secret_writes, no_sockets):
    """The other half - url_verified has to be a measurement, not a constant."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(PUBLIC))

    result = _configure_servicenow("https://dev12345.service-now.com")

    assert result.url_verified is True
    assert result.message == "ServiceNow connector configured successfully."


def test_salesforce_names_its_own_field_when_the_url_could_not_be_verified(
    monkeypatch, no_secret_writes, no_sockets
):
    monkeypatch.setattr(socket, "getaddrinfo", _dns_down)

    result = _configure_salesforce("https://login.salesforce.com")

    assert result.url_verified is False
    assert "login_url" in result.message
    assert "instance_url" not in result.message


def test_a_provider_with_no_caller_supplied_url_claims_nothing_about_one(no_secret_writes):
    """None means "nothing to check here", and must collapse into neither False nor True.

    Every host the Azure connector reaches is a fixed literal in the service module, so this
    write measured no URL. False would send an operator hunting a resolution problem that
    does not exist; True would claim a check that never ran.
    """
    result = asyncio.run(routes.configure_azure(_azure_request()))

    assert result.url_verified is None
    assert result.message == "Azure connector configured successfully."


@pytest.mark.parametrize(
    "handler,make_request",
    [
        ("configure_azure", _azure_request),
        ("configure_gcp", _gcp_request),
        ("configure_copilot_studio", _copilot_request),
    ],
)
def test_configure_never_writes_the_secret_on_the_event_loop(monkeypatch, handler, make_request):
    """_save_secret is create_secret, then update_secret if it exists - two blocking calls.

    On the loop thread that is every other request on this worker waiting out the round
    trip. ServiceNow and Salesforce were moved off the loop when their URL check landed
    (getaddrinfo takes no timeout); these three kept the blocking write inline.
    """
    write_threads: list[int] = []

    def _save(name, value, region):
        write_threads.append(threading.get_ident())
        return True

    monkeypatch.setattr(mc, "_save_secret", _save)
    request = make_request()
    loop_thread: list[int] = []

    async def _drive():
        loop_thread.append(threading.get_ident())
        return await getattr(routes, handler)(request)

    result = asyncio.run(_drive())

    assert result.success is True
    assert write_threads, "the secret must still be written"
    assert loop_thread[0] not in write_threads


def test_the_allowlist_hint_agrees_with_safe_fetch_for_every_address_refusal():
    """The hint's rule is safe_fetch's fact, asked rather than copied.

    Two modules had already grown their own copy of "which refusals a CIDR could permit",
    and a copy does not fail when safe_fetch adds a reason - the advice just goes quietly
    missing, or starts being offered for something no CIDR can override. The input domain
    here is safe_fetch's own set of address refusals and the expected answer is
    is_allowlistable_refusal, so a local copy in the route module that disagrees about any
    one of them fails this.
    """
    for reason in sorted(safe_fetch._ADDRESS_REFUSALS):
        exc = SafeFetchError(reason, "host=internal-admin.example.com resolved=10.0.13.7")

        detail = routes._reject_url("instance_url", exc).detail

        assert detail.startswith(f"instance_url rejected: {reason}")
        assert ("SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in detail) is \
            safe_fetch.is_allowlistable_refusal(reason), reason
        assert "10.0.13.7" not in detail
        assert "internal-admin.example.com" not in detail
