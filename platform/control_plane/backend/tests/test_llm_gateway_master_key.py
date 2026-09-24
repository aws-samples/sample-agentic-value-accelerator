"""Unit tests for LLM Gateway master-key resolution.

Covers the fix where the backend could not authenticate to a dynamically
deployed gateway (empty master key -> 401 -> 502). _resolve_master_key must:
  1. Prefer the instance's own master_key_secret_arn (from DDB outputs).
  2. Fall back to the LLM_GATEWAY_MASTER_KEY_SECRET_ARN env var.
  3. Fall back to plaintext env vars for local dev.
  4. Handle both JSON secrets ({"master_key": ...}) and plaintext secrets.

The route module imports `core.config` and FastAPI at import time; we stub
`core.config` (mirroring the importlib pattern used by the other tests) and
load the module directly so the Settings() chain isn't required.

The two route-level tests at the bottom patch `safe_fetch.fetch_internal`. They
used to patch `urllib.request.urlopen`, which the gateway calls no longer go
through: `_gateway_fetch` routes them via `core.safe_fetch` so a 302 cannot replay
the master key. `fetch_internal` is the same kind of seam urlopen was - the
transport, one level below the code under test - so `_gateway_fetch`'s own status
and truncation checks stay on the path. What these two tests are actually about
(the `name` -> `key_alias` mapping and the master-key fallback) is unchanged.
"""
import importlib.util
import os
import sys
import types

import pytest

# Imported before core is stubbed, and registered on the stub below: _gateway_fetch
# does a deferred `from core import safe_fetch`, which a bare ModuleType("core")
# answers with ImportError from inside the except block trying to report it.
from core import safe_fetch


def _load_module(monkeypatch):
    # Stub core.config.settings so importing the route module doesn't require
    # the full backend environment.
    fake_core = types.ModuleType("core")
    fake_config = types.ModuleType("core.config")
    fake_config.settings = types.SimpleNamespace(AWS_REGION="us-east-1")
    fake_core.config = fake_config
    fake_core.safe_fetch = safe_fetch
    monkeypatch.setitem(sys.modules, "core", fake_core)
    monkeypatch.setitem(sys.modules, "core.config", fake_config)
    monkeypatch.setitem(sys.modules, "core.safe_fetch", safe_fetch)

    # Stub core.rbac so the RBAC imports resolve without the full backend
    fake_rbac = types.ModuleType("core.rbac")

    class _FakeRole:
        VIEWER = 0
        OPERATOR = 1
        ADMIN = 2

    fake_rbac.Role = _FakeRole
    fake_rbac.require_role = lambda role: lambda: None
    monkeypatch.setitem(sys.modules, "core.rbac", fake_rbac)

    # core.region_config, for the DEPLOYMENTS table region. The route used to build its
    # DynamoDB resource from AWS_REGION, which silently disagreed with litellm.py's read of
    # the SAME table via DEPLOYMENTS_TABLE_REGION - so one reader saw the gateway instances
    # and the other got an empty list rather than an error. The stub records its argument so
    # the test can assert the table region is asked for by key, not hardcoded.
    fake_region_config = types.ModuleType("core.region_config")
    fake_region_config.asked_for = []

    def _table_region(key):
        fake_region_config.asked_for.append(key)
        return "us-east-1"

    fake_region_config.table_region = _table_region
    fake_core.region_config = fake_region_config
    monkeypatch.setitem(sys.modules, "core.region_config", fake_region_config)

    path = os.path.join(os.path.dirname(__file__), os.pardir, "src", "api", "routes", "llm_gateway.py")
    spec = importlib.util.spec_from_file_location("llm_gateway_under_test", os.path.abspath(path))
    mod = importlib.util.module_from_spec(spec)
    # Register in sys.modules so pydantic can resolve the module globals
    # (List, Optional, ...) when rebuilding the model's forward refs.
    monkeypatch.setitem(sys.modules, spec.name, mod)
    spec.loader.exec_module(mod)
    mod.GatewayInstance.model_rebuild()
    return mod


class _FakeSM:
    def __init__(self, secret_string):
        self._s = secret_string

    def get_secret_value(self, SecretId=None):  # noqa: N803 (boto3 kwarg name)
        assert SecretId  # ensure an ARN was passed
        return {"SecretString": self._s}


def _patch_boto3(monkeypatch, mod, secret_string):
    import boto3

    monkeypatch.setattr(boto3, "client", lambda *a, **k: _FakeSM(secret_string))


def test_prefers_instance_secret_arn_json(monkeypatch):
    mod = _load_module(monkeypatch)
    # Even if an env ARN is set, the instance's ARN wins.
    monkeypatch.setenv("LLM_GATEWAY_MASTER_KEY_SECRET_ARN", "arn:env:should-not-be-used")
    _patch_boto3(monkeypatch, mod, '{"master_key": "sk-from-instance", "salt": "x"}')

    inst = mod.GatewayInstance(
        id="g", name="g", endpoint="http://gw", admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev",
        master_key_secret_arn="arn:aws:secretsmanager:us-east-1:1:secret:llm-gateway-x",
    )
    assert mod._resolve_master_key(inst) == "sk-from-instance"


def test_falls_back_to_env_secret_arn(monkeypatch):
    mod = _load_module(monkeypatch)
    monkeypatch.setenv("LLM_GATEWAY_MASTER_KEY_SECRET_ARN", "arn:env:used")
    _patch_boto3(monkeypatch, mod, '{"master_key": "sk-from-env-arn"}')

    inst = mod.GatewayInstance(
        id="g", name="g", endpoint="http://gw", admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev",  # no master_key_secret_arn
    )
    assert mod._resolve_master_key(inst) == "sk-from-env-arn"


def test_plaintext_secret_is_returned_as_is(monkeypatch):
    mod = _load_module(monkeypatch)
    _patch_boto3(monkeypatch, mod, "sk-plaintext-key")

    inst = mod.GatewayInstance(
        id="g", name="g", endpoint="http://gw", admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev",
        master_key_secret_arn="arn:aws:secretsmanager:us-east-1:1:secret:plain",
    )
    assert mod._resolve_master_key(inst) == "sk-plaintext-key"


def test_plaintext_env_fallback_when_no_arn(monkeypatch):
    mod = _load_module(monkeypatch)
    monkeypatch.delenv("LLM_GATEWAY_MASTER_KEY_SECRET_ARN", raising=False)
    monkeypatch.delenv("LLM_GATEWAY_MASTER_KEY", raising=False)
    monkeypatch.setenv("LITELLM_MASTER_KEY", "sk-local-dev")

    inst = mod.GatewayInstance(
        id="g", name="g", endpoint="http://gw", admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev",
    )
    assert mod._resolve_master_key(inst) == "sk-local-dev"


def test_filter_display_models_keeps_all_when_only_raw_ids(monkeypatch):
    """Configs that use inference-profile IDs as model names must not be
    filtered to empty (regression: UI showed no models)."""
    mod = _load_module(monkeypatch)
    models = [
        {"id": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
        {"id": "us.amazon.nova-pro-v1:0"},
        {"id": "us.amazon.nova-2-lite-v1:0"},
        {"id": "us.anthropic.claude-sonnet-5"},
    ]
    out = mod._filter_display_models(models)
    assert [m["id"] for m in out] == [m["id"] for m in models]


def test_filter_display_models_dedupes_when_aliases_present(monkeypatch):
    """When display aliases exist alongside raw IDs, keep only the aliases."""
    mod = _load_module(monkeypatch)
    models = [
        {"id": "Claude Haiku 4.5"},
        {"id": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
        {"id": "Amazon Nova Pro"},
        {"id": "us.amazon.nova-pro-v1:0"},
    ]
    out = [m["id"] for m in mod._filter_display_models(models)]
    assert out == ["Claude Haiku 4.5", "Amazon Nova Pro"]


def _fake_fetch_internal(monkeypatch, captured, payload):
    """Patch the transport seam and record what the route sent.

    Returns a real `SafeResponse`, not a duck, so `_gateway_fetch`'s status and
    truncation checks and `.json()` all behave as they do in production.
    """
    import json

    def fake(url, *, timeout=None, method="GET", headers=None, body=None, **kwargs):
        assert timeout, "a timeout is mandatory on every gateway call"
        captured["url"] = url
        captured["method"] = method
        captured["headers"] = headers or {}
        captured["body"] = json.loads(body) if body else None
        return safe_fetch.SafeResponse(
            status=200,
            body=json.dumps(payload).encode(),
            final_url=url,
            headers={"content-type": "application/json"},
        )

    monkeypatch.setattr(safe_fetch, "fetch_internal", fake)


def test_create_virtual_key_maps_name_to_key_alias(monkeypatch):
    """The create payload must send LiteLLM's `key_alias`, not `name`,
    otherwise created keys show a blank alias in the UI."""
    import asyncio

    mod = _load_module(monkeypatch)

    inst = mod.GatewayInstance(
        id="g", name="g", endpoint="http://gw", admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev",
        master_key_secret_arn="arn:aws:secretsmanager:us-east-1:1:secret:llm-gateway-x",
    )

    async def fake_get_instance(gateway_id):
        return inst

    monkeypatch.setattr(mod, "_get_instance_by_id", fake_get_instance)
    monkeypatch.setattr(mod, "_resolve_master_key", lambda i: "sk-master")

    captured = {}
    _fake_fetch_internal(monkeypatch, captured, {"key": "sk-new", "key_alias": "my-key"})

    req = mod.VirtualKeyCreate(name="my-key", budget_duration="30d")
    asyncio.run(mod.create_virtual_key("g", req))

    assert captured["url"].endswith("/key/generate")
    assert captured["method"] == "POST"
    assert captured["body"].get("key_alias") == "my-key"
    assert "name" not in captured["body"]


def test_playground_falls_back_to_master_key_when_no_virtual_key(monkeypatch):
    """Empty virtual key in the Playground must use the resolved gateway master
    key (the UI hint says "uses master key if empty")."""
    import asyncio

    mod = _load_module(monkeypatch)

    inst = mod.GatewayInstance(
        id="g", name="g", endpoint="http://gw", admin_ui_url="", status="DEPLOYED",
        region="us-east-1", environment="dev",
        master_key_secret_arn="arn:aws:secretsmanager:us-east-1:1:secret:llm-gateway-x",
    )

    async def fake_get_instance(gateway_id):
        return inst

    monkeypatch.setattr(mod, "_get_instance_by_id", fake_get_instance)
    monkeypatch.setattr(mod, "_resolve_master_key", lambda i: "sk-master-resolved")

    captured = {}
    _fake_fetch_internal(monkeypatch, captured, {"choices": [{"message": {"content": "hi"}}]})

    req = mod.PlaygroundRequest(model="m", messages=[{"role": "user", "content": "hi"}], virtual_key=None)
    out = asyncio.run(mod.playground("g", req))

    assert captured["headers"].get("Authorization") == "Bearer sk-master-resolved"
    assert out == {"choices": [{"message": {"content": "hi"}}]}


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
