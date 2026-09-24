"""The LLM gateway call sites must not replay the master key across a redirect.

Every gateway call in `api/routes/llm_gateway.py` and
`services/llm_gateway_provisioning.py` attaches
`Authorization: Bearer <gateway master key>`. They used `urllib.request.urlopen`,
whose `HTTPRedirectHandler` builds the next request's headers as

    {k: v for k, v in req.headers.items() if k.lower() not in CONTENT_HEADERS}

which strips content-length and content-type and nothing else. So a 302 from the
gateway - or from anything else answering on that private ALB address - handed the
master key to whatever host the Location header named.
`test_urllib_would_replay_the_master_key` measures that on this interpreter rather
than trusting the reading; the rest of the file asserts the fix.

The fix is `safe_fetch.fetch_internal`, not `safe_fetch.fetch`: the gateway
endpoint is platform config that resolves to a private address, so `fetch` would
refuse it and break the integration (asserted in
`test_fetch_would_refuse_the_private_gateway_address`). `fetch_internal` skips
only the address check and refuses to follow any redirect at all.

Servers here bind 127.0.0.1:0, so they are loopback - the same class of address a
private ALB falls into as far as the address check is concerned.
"""
from __future__ import annotations

import asyncio
import contextlib
import http.server
import json
import os
import sys
import threading
import types
import urllib.request

import pytest
from fastapi import HTTPException

from api.routes import llm_gateway as routes
from core import safe_fetch
from core.safe_fetch import SafeFetchError
from services.llm_gateway_provisioning import LLMGatewayProvisioningService

# Deliberately not shaped like any real provider's key, so the secret scanner has
# nothing to flag and a reader cannot mistake it for a live credential.
MASTER_TOKEN = "test-master-token-not-a-secret"


@contextlib.contextmanager
def _serving(responder):
    """Run a loopback HTTP server that records every request it receives.

    `responder(handler) -> (status, headers, body_bytes)`. Yields an object with
    `.url` and `.received` (one dict per request, headers lower-cased).
    """
    received: list[dict] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _handle(self):
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else b""
            received.append({
                "method": self.command,
                "path": self.path,
                "headers": {k.lower(): v for k, v in self.headers.items()},
                "body": body,
            })
            status, headers, payload = responder(self)
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if payload:
                self.wfile.write(payload)

        do_GET = _handle
        do_POST = _handle

        def log_message(self, *args):  # keep pytest output readable
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    handle = types.SimpleNamespace(
        url=f"http://127.0.0.1:{httpd.server_port}",
        received=received,
    )

    try:
        yield handle
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)


def _json_ok(payload):
    body = json.dumps(payload).encode()
    return lambda handler: (200, {"Content-Type": "application/json"}, body)


def _redirect_to(location):
    return lambda handler: (302, {"Location": location}, b"")


# ---------------------------------------------------------------------------
# The defect, measured
# ---------------------------------------------------------------------------

def test_urllib_would_replay_the_master_key():
    """urlopen forwards Authorization across a cross-origin redirect.

    If this ever fails because CPython started stripping credentials in
    HTTPRedirectHandler, that is good news: update this test, do not weaken the
    ones below. The guard has to hold on the interpreters we actually ship on.
    """
    with _serving(_json_ok({"ok": True})) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/stolen")) as gateway:
            req = urllib.request.Request(
                f"{gateway.url}/key/list",
                headers={"Authorization": f"Bearer {MASTER_TOKEN}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                assert resp.status == 200

    assert len(attacker.received) == 1, "the redirect was not followed; premise is wrong"
    assert attacker.received[0]["headers"].get("authorization") == f"Bearer {MASTER_TOKEN}"


# ---------------------------------------------------------------------------
# The guard
# ---------------------------------------------------------------------------

def test_fetch_internal_refuses_the_redirect_and_sends_nothing_onward():
    with _serving(_json_ok({"ok": True})) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/stolen")) as gateway:
            with pytest.raises(SafeFetchError) as excinfo:
                safe_fetch.fetch_internal(
                    f"{gateway.url}/key/list",
                    headers={"Authorization": f"Bearer {MASTER_TOKEN}"},
                    timeout=5,
                )

    assert excinfo.value.reason == "too_many_redirects"
    assert attacker.received == [], "the redirect target was contacted at all"


def test_fetch_internal_still_reaches_a_private_address_on_200():
    """The working path: a loopback/private gateway answering 200 must succeed."""
    with _serving(_json_ok({"data": [{"id": "Claude Haiku 4.5"}]})) as gateway:
        resp = safe_fetch.fetch_internal(
            f"{gateway.url}/v1/models",
            headers={"Authorization": f"Bearer {MASTER_TOKEN}"},
            timeout=8,
        )

    assert resp.status == 200
    assert resp.json() == {"data": [{"id": "Claude Haiku 4.5"}]}
    assert gateway.received[0]["headers"]["authorization"] == f"Bearer {MASTER_TOKEN}"


def test_fetch_would_refuse_the_private_gateway_address():
    """Why these sites use fetch_internal and not fetch.

    Routing them through `fetch` would be the wrong guard: it refuses the private
    address the gateway legitimately lives on, so the integration would break.
    """
    with _serving(_json_ok({"ok": True})) as gateway:
        with pytest.raises(SafeFetchError) as excinfo:
            safe_fetch.fetch(f"{gateway.url}/health", timeout=5)

    assert excinfo.value.reason == "blocked_loopback_address"
    assert gateway.received == []


# ---------------------------------------------------------------------------
# Converted call sites: routes/llm_gateway.py
# ---------------------------------------------------------------------------

def _instance(endpoint: str) -> "routes.GatewayInstance":
    return routes.GatewayInstance(
        id="g", name="g", endpoint=endpoint, admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev",
    )


def _patch_instance(monkeypatch, endpoint: str) -> None:
    async def fake_get_instance(gateway_id):
        return _instance(endpoint)

    monkeypatch.setattr(routes, "_get_instance_by_id", fake_get_instance)
    monkeypatch.setattr(routes, "_resolve_master_key", lambda inst: MASTER_TOKEN)


def test_playground_refuses_the_redirect_and_leaks_no_target(monkeypatch):
    with _serving(_json_ok({"choices": []})) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/v1/chat/completions")) as gateway:
            _patch_instance(monkeypatch, gateway.url)
            req = routes.PlaygroundRequest(
                model="m", messages=[{"role": "user", "content": "hi"}]
            )
            with pytest.raises(HTTPException) as excinfo:
                asyncio.run(routes.playground("g", req))

    assert attacker.received == []
    # Reason only. The host and the resolved address stay in the logs: echoing them
    # would turn the refusal into the port scan it just prevented.
    assert excinfo.value.detail == "Gateway request failed: too_many_redirects"
    assert "127.0.0.1" not in str(excinfo.value.detail)


def test_playground_relays_a_normal_completion(monkeypatch):
    answer = {"choices": [{"message": {"role": "assistant", "content": "hi"}}]}
    with _serving(_json_ok(answer)) as gateway:
        _patch_instance(monkeypatch, gateway.url)
        req = routes.PlaygroundRequest(
            model="m", messages=[{"role": "user", "content": "hi"}], max_tokens=42
        )
        out = asyncio.run(routes.playground("g", req))

    assert out == answer
    sent = gateway.received[0]
    assert sent["method"] == "POST"
    assert sent["path"] == "/v1/chat/completions"
    assert sent["headers"]["authorization"] == f"Bearer {MASTER_TOKEN}"
    assert json.loads(sent["body"])["max_tokens"] == 42


def test_playground_still_relays_the_gateway_error_body(monkeypatch):
    """A non-2xx no longer raises inside the fetch, so the status check must.

    LiteLLM explains a bad model id in this body and the UI shows that text, so
    the relay is behaviour worth keeping - it is the gateway's own content, not
    the target address. What is relayed is `error.message`, not the whole
    document: this is the one client-visible interpolation of upstream content
    left, so it is the parsed sentence rather than however many bytes arrived.
    """
    body = json.dumps({"error": {"message": "model not found"}}).encode()

    with _serving(lambda h: (400, {"Content-Type": "application/json"}, body)) as gateway:
        _patch_instance(monkeypatch, gateway.url)
        req = routes.PlaygroundRequest(
            model="nope", messages=[{"role": "user", "content": "hi"}]
        )
        with pytest.raises(HTTPException) as excinfo:
            asyncio.run(routes.playground("g", req))

    assert excinfo.value.status_code == 502
    assert excinfo.value.detail == "Gateway request failed: model not found"


def test_playground_bounds_a_non_json_error_body(monkeypatch):
    """An ALB or CloudFront 502 page is HTML and can be large; relay a snippet.

    `resp.text` went into the detail whole, capped only by safe_fetch's 5 MiB.
    """
    body = b"<html>" + b"A" * (routes._ERROR_SNIPPET_CHARS * 3) + b"</html>"

    with _serving(lambda h: (502, {"Content-Type": "text/html"}, body)) as gateway:
        _patch_instance(monkeypatch, gateway.url)
        req = routes.PlaygroundRequest(
            model="m", messages=[{"role": "user", "content": "hi"}]
        )
        with pytest.raises(HTTPException) as excinfo:
            asyncio.run(routes.playground("g", req))

    relayed = excinfo.value.detail.removeprefix("Gateway request failed: ")
    assert len(relayed) == routes._ERROR_SNIPPET_CHARS
    assert relayed.startswith("<html>")


def test_create_virtual_key_refuses_the_redirect(monkeypatch):
    with _serving(_json_ok({"key": "stolen"})) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/key/generate")) as gateway:
            _patch_instance(monkeypatch, gateway.url)
            req = routes.VirtualKeyCreate(name="my-key")
            with pytest.raises(HTTPException) as excinfo:
                asyncio.run(routes.create_virtual_key("g", req))

    assert attacker.received == []
    assert excinfo.value.detail == "LiteLLM /key/generate failed: too_many_redirects"


def test_create_virtual_key_still_mints_on_200(monkeypatch):
    with _serving(_json_ok({"key": "vk-minted", "key_alias": "my-key"})) as gateway:
        _patch_instance(monkeypatch, gateway.url)
        req = routes.VirtualKeyCreate(name="my-key", budget_duration="30d")
        out = asyncio.run(routes.create_virtual_key("g", req))

    assert out == {"key": "vk-minted", "key_alias": "my-key"}
    sent = gateway.received[0]
    assert sent["path"] == "/key/generate"
    assert sent["headers"]["authorization"] == f"Bearer {MASTER_TOKEN}"
    # The name -> key_alias mapping LiteLLM needs must survive the conversion.
    body = json.loads(sent["body"])
    assert body["key_alias"] == "my-key"
    assert "name" not in body


def test_list_virtual_keys_returns_empty_when_the_gateway_redirects(monkeypatch):
    """This route swallows failures by design; the credential must still not move."""
    with _serving(_json_ok(["some-key-hash"])) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/key/list")) as gateway:
            _patch_instance(monkeypatch, gateway.url)
            assert asyncio.run(routes.list_virtual_keys("g")) == []

    assert attacker.received == []


def test_list_models_reads_a_normal_200(monkeypatch):
    payload = {"data": [{"id": "Claude Haiku 4.5"}, {"id": "us.amazon.nova-pro-v1:0"}]}
    with _serving(_json_ok(payload)) as gateway:
        _patch_instance(monkeypatch, gateway.url)
        out = asyncio.run(routes.list_models("g"))

    # Display alias kept, raw inference-profile id dropped by _filter_display_models.
    assert [m["id"] for m in out] == ["Claude Haiku 4.5"]
    assert out[0]["owned_by"] == "anthropic"
    assert gateway.received[0]["headers"]["authorization"] == f"Bearer {MASTER_TOKEN}"


def test_get_config_does_not_echo_the_boto3_error(monkeypatch):
    """The SSM read is Role.VIEWER, and botocore stringifies with the ARN.

    Same discipline as _fetch_reason, one `except` ladder over: a ParameterNotFound
    or AccessDeniedException names the parameter path and the account id, and this
    detail goes to the client. The traceback belongs in the log.
    """
    import boto3

    parameter = "/ava/llm-gateway/prod/config"
    # AWS's documented example account id, so the secret scanner has nothing to flag.
    account = "123456789012"

    def boom(*args, **kwargs):
        raise RuntimeError(
            f"AccessDeniedException: not authorized to perform ssm:GetParameter on "
            f"resource: arn:aws:ssm:us-east-1:{account}:parameter{parameter}"
        )

    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.setattr(boto3, "client", boom)

    inst = routes.GatewayInstance(
        id="g", name="g", endpoint="", admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev", config_parameter_name=parameter,
    )

    async def fake_get_instance(gateway_id):
        return inst

    monkeypatch.setattr(routes, "_get_instance_by_id", fake_get_instance)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(routes.get_config("g"))

    assert excinfo.value.status_code == 500
    assert excinfo.value.detail == "Config read from SSM failed"
    assert account not in excinfo.value.detail
    assert parameter not in excinfo.value.detail


def test_health_probe_reports_ok_on_200(monkeypatch):
    with _serving(_json_ok({"status": "healthy"})) as gateway:
        monkeypatch.setenv("LLM_GATEWAY_ENDPOINT", gateway.url)
        out = asyncio.run(routes.health())

    assert out["deployed"] is True
    assert out["status"] == "ok"
    assert gateway.received[0]["path"] == "/health/liveliness"


def test_health_probe_reports_degraded_when_the_gateway_redirects(monkeypatch):
    """A redirect is a refusal, so both probe paths fail and the probe says so."""
    with _serving(_json_ok({"status": "healthy"})) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/health")) as gateway:
            monkeypatch.setenv("LLM_GATEWAY_ENDPOINT", gateway.url)
            out = asyncio.run(routes.health())

    assert out["status"] == "degraded"
    assert attacker.received == []


# ---------------------------------------------------------------------------
# Converted call sites: services/llm_gateway_provisioning.py
# ---------------------------------------------------------------------------

class _FakeSecretsManager:
    """Enough of the Secrets Manager client for the provisioning paths."""

    class exceptions:
        class ResourceNotFoundException(Exception):
            pass

        class ResourceAlreadyExistsException(Exception):
            pass

    def __init__(self):
        self.created = {}

    def get_secret_value(self, SecretId=None):  # noqa: N803 (boto3 kwarg name)
        if SecretId == "arn:master":
            return {"SecretString": json.dumps({"master_key": MASTER_TOKEN})}
        raise self.exceptions.ResourceNotFoundException()

    def create_secret(self, Name=None, SecretString=None, Tags=None):  # noqa: N803
        self.created[Name] = SecretString
        return {"ARN": f"arn:secret:{Name}"}


def _provisioning_service(endpoint: str) -> LLMGatewayProvisioningService:
    """Build the service without boto3: __init__ creates live AWS clients."""
    svc = LLMGatewayProvisioningService.__new__(LLMGatewayProvisioningService)
    svc.region = "us-east-1"
    svc.deployments_table_name = "deployments"
    svc._sm = _FakeSecretsManager()
    svc._ddb = None  # unused: _cached_gateway short-circuits find_active_gateway
    svc._cached_gateway = {
        "deployment_id": "d1",
        "endpoint": endpoint,
        "master_key_secret_arn": "arn:master",
        "region": "us-east-1",
    }
    return svc


def test_provision_virtual_key_refuses_the_redirect():
    with _serving(_json_ok({"key": "stolen"})) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/key/generate")) as gateway:
            svc = _provisioning_service(gateway.url)
            assert svc.provision_virtual_key("uc", "strands", "dep12345") is None

    assert attacker.received == []


def test_provision_virtual_key_still_mints_on_200():
    with _serving(_json_ok({"key": "vk-minted"})) as gateway:
        svc = _provisioning_service(gateway.url)
        out = svc.provision_virtual_key("uc", "strands", "dep12345")

    assert out is not None
    assert out["gateway_endpoint"] == gateway.url
    assert out["virtual_key_secret_arn"].startswith("arn:secret:llm-gateway-foundry-")
    stored = json.loads(svc._sm.created[out["virtual_key_secret_name"]])
    assert stored["key"] == "vk-minted"
    sent = gateway.received[0]
    assert sent["method"] == "POST"
    assert sent["path"] == "/key/generate"
    assert sent["headers"]["authorization"] == f"Bearer {MASTER_TOKEN}"


def test_provision_virtual_key_rejects_a_non_2xx_body():
    """fetch_internal returns a 4xx instead of raising, so the status check must.

    Without it, an error body parses cleanly and the caller decides from
    `.get("key")` alone - the comfortable answer, one field away from storing
    nothing as if it were a key.
    """
    with _serving(lambda h: (403, {}, b'{"detail": "forbidden"}')) as gateway:
        svc = _provisioning_service(gateway.url)
        assert svc.provision_virtual_key("uc", "strands", "dep12345") is None
        assert svc._sm.created == {}


def test_revoke_virtual_key_refuses_the_redirect(monkeypatch):
    """Offboarding is best-effort, so it must not raise - and must not leak the key.

    The fake dispatches on SecretId. Answering every lookup with the virtual-key
    document made `master_key` empty, the `if master_key:` guard False, and the
    whole /key/delete block unreachable: `attacker.received == []` passed because
    no request was issued at all. So this asserts the request WAS made, which is
    what makes the refusal meaningful.
    """
    with _serving(_json_ok({"deleted": 1})) as attacker:
        with _serving(_redirect_to(f"{attacker.url}/key/delete")) as gateway:
            svc = _provisioning_service(gateway.url)
            monkeypatch.setattr(
                svc._sm,
                "get_secret_value",
                lambda SecretId=None: (
                    {"SecretString": json.dumps({"master_key": MASTER_TOKEN})}
                    if SecretId == "arn:master"
                    else {"SecretString": json.dumps({"key": "vk-old"})}
                ),
            )
            svc._sm.delete_secret = lambda SecretId=None, ForceDeleteWithoutRecovery=None: None
            svc.revoke_virtual_key("uc", "strands", "dep12345")

    assert attacker.received == []
    sent = gateway.received[0]
    assert sent["method"] == "POST"
    assert sent["path"] == "/key/delete"
    assert sent["headers"]["authorization"] == f"Bearer {MASTER_TOKEN}"
    assert json.loads(sent["body"]) == {"keys": ["vk-old"]}


def test_revoke_virtual_key_deletes_on_200(monkeypatch):
    """The working path, so the redirect test above cannot pass by being a no-op."""
    deleted: list = []

    with _serving(_json_ok({"deleted": 1})) as gateway:
        svc = _provisioning_service(gateway.url)
        monkeypatch.setattr(
            svc._sm,
            "get_secret_value",
            lambda SecretId=None: (
                {"SecretString": json.dumps({"master_key": MASTER_TOKEN})}
                if SecretId == "arn:master"
                else {"SecretString": json.dumps({"key": "vk-old"})}
            ),
        )
        svc._sm.delete_secret = lambda SecretId=None, ForceDeleteWithoutRecovery=None: deleted.append(SecretId)
        svc.revoke_virtual_key("uc", "strands", "dep12345")

    assert gateway.received[0]["path"] == "/key/delete"
    assert json.loads(gateway.received[0]["body"]) == {"keys": ["vk-old"]}
    assert deleted == ["llm-gateway-foundry-uc-strands-dep12345"]


# ---------------------------------------------------------------------------
# Body cap: a large-but-valid admin response must not become zeros
# ---------------------------------------------------------------------------

def test_get_spend_reads_a_body_over_safe_fetch_default_instead_of_reporting_zero(monkeypatch):
    """A 30-day spend report can legitimately exceed safe_fetch's 5 MiB default.

    `urlopen(...).read()` was unbounded. Leaving _gateway_json on the 5 MiB default
    cut the body mid-JSON, the parse failure was swallowed by get_spend's per-path
    `except`, and the route answered `total_usd: 0.0` - which the UI cannot tell
    from real zero spend. get_audit and list_virtual_keys read through the same
    _gateway_json default, so this pins the cap for those too; get_config calls
    _gateway_fetch directly and is pinned separately below.
    """
    report = {
        "total_spend": 42.5,
        "spend_per_key": [],
        "spend_per_model": [{"model": "Claude Haiku 4.5", "spend": 42.5}],
        # Filler, not decoration: the whole premise is a body past the 5 MiB default.
        "notes": "x" * (safe_fetch.DEFAULT_MAX_BYTES + 500_000),
    }
    body = json.dumps(report).encode()
    assert len(body) > safe_fetch.DEFAULT_MAX_BYTES, "premise is wrong; body is under the cap"

    with _serving(lambda h: (200, {"Content-Type": "application/json"}, body)) as gateway:
        _patch_instance(monkeypatch, gateway.url)
        out = asyncio.run(routes.get_spend("g", days=30))

    assert out["total_usd"] == 42.5
    assert out["by_model"] == [{"model": "Claude Haiku 4.5", "spend": 42.5}]
    # One fetch: a dict report with spend_per_model populated short-circuits the
    # model-level paths, so this is not quietly re-reading 6 MiB three times.
    assert len(gateway.received) == 1


def test_get_config_reads_an_admin_body_over_the_safe_fetch_default(monkeypatch):
    """The one admin read that does not go through _gateway_json must share its cap.

    get_config's /config/yaml fallback calls _gateway_fetch directly - it logs the
    body size on success, so it wants the response and not just the parsed body -
    and therefore did not inherit _ADMIN_API_MAX_BYTES from _gateway_json's
    default. It read at safe_fetch's 5 MiB instead, which _gateway_fetch's
    truncation refusal turns into `response_too_large` for every one of the four
    config attempts and a 502 out of the route, for a document the gateway served
    in full. Regressing the `max_bytes=` argument fails here, not in review.

    The 200 body is a JSON object whose "config" value is YAML text - one of the
    two shapes get_config handles, `isinstance(config_data, dict)` being what
    chooses between yaml.dump and `str`. The string branch is used here because
    yaml.dump over a scalar this size is seconds of work for nothing: dumping the
    4.9 MiB config string below measured ~6s on this host (PyYAML 6.0.3), and what
    is pinned is how many bytes the fetch accepts, which does not depend on the
    document's schema.
    """
    config_yaml = "model_list:\n" + "".join(
        f"- model_name: model-{i}\n  litellm_params:\n    model: bedrock/anthropic.claude-{i}\n"
        for i in range(60_000)
    )
    body = json.dumps({"config": config_yaml}).encode()
    assert len(body) > safe_fetch.DEFAULT_MAX_BYTES, "premise is wrong; body is under the cap"
    assert len(body) < routes._ADMIN_API_MAX_BYTES, "premise is wrong; body is over the admin cap"

    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.delenv("LITELLM_CONFIG_S3_BUCKET", raising=False)

    with _serving(lambda h: (200, {"Content-Type": "application/json"}, body)) as gateway:
        _patch_instance(monkeypatch, gateway.url)
        out = asyncio.run(routes.get_config("g"))

    assert out["config_yaml"] == config_yaml
    # The first attempt succeeded, so the route did not walk the rest of the
    # config_attempts ladder and re-read the body three more times.
    assert len(gateway.received) == 1
    assert gateway.received[0]["path"] == "/config/yaml"


def test_a_truncated_admin_body_is_an_error_not_a_short_answer():
    """Over the cap has to raise, not parse into whatever survived the cut.

    Without the refusal in _gateway_fetch, a cut body reaches `resp.json()`, which
    raises invalid_json_response - and the callers that swallow parse failures then
    report zeros. Either way the number is wrong; the difference is whether the
    failure is visible. `max_bytes` is passed small here so the test stays fast.
    """
    with _serving(_json_ok({"data": [{"spend": 1.5}] * 40})) as gateway:
        with pytest.raises(SafeFetchError) as excinfo:
            routes._gateway_json(f"{gateway.url}/spend/logs", timeout=10, max_bytes=64)

        assert excinfo.value.reason == "response_too_large"
        # The split the whole conversion rests on: the URL is in `detail`, which only
        # the log reads, and `reason` - the part a route may echo - names no target.
        assert gateway.url in excinfo.value.detail
        assert "127.0.0.1" not in routes._fetch_reason(excinfo.value)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
