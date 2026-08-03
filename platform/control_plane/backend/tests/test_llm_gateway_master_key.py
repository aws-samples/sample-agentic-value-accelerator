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
"""
import importlib.util
import os
import sys
import types

import pytest


def _load_module(monkeypatch):
    # Stub core.config.settings so importing the route module doesn't require
    # the full backend environment.
    fake_core = types.ModuleType("core")
    fake_config = types.ModuleType("core.config")
    fake_config.settings = types.SimpleNamespace(AWS_REGION="us-east-1")
    fake_core.config = fake_config
    monkeypatch.setitem(sys.modules, "core", fake_core)
    monkeypatch.setitem(sys.modules, "core.config", fake_config)

    # Stub core.rbac so the RBAC imports resolve without the full backend
    fake_rbac = types.ModuleType("core.rbac")

    class _FakeRole:
        VIEWER = 0
        OPERATOR = 1
        ADMIN = 2

    fake_rbac.Role = _FakeRole
    fake_rbac.require_role = lambda role: lambda: None
    monkeypatch.setitem(sys.modules, "core.rbac", fake_rbac)

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


def test_create_virtual_key_maps_name_to_key_alias(monkeypatch):
    """The create payload must send LiteLLM's `key_alias`, not `name`,
    otherwise created keys show a blank alias in the UI."""
    import asyncio
    import contextlib
    import io
    import json

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

    @contextlib.contextmanager
    def fake_urlopen(req, timeout=None):
        captured["body"] = json.loads(req.data.decode())
        captured["url"] = req.full_url
        yield io.BytesIO(json.dumps({"key": "sk-new", "key_alias": "my-key"}).encode())

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    req = mod.VirtualKeyCreate(name="my-key", budget_duration="30d")
    asyncio.run(mod.create_virtual_key("g", req))

    assert captured["url"].endswith("/key/generate")
    assert captured["body"].get("key_alias") == "my-key"
    assert "name" not in captured["body"]


def test_playground_falls_back_to_master_key_when_no_virtual_key(monkeypatch):
    """Empty virtual key in the Playground must use the resolved gateway master
    key (the UI hint says "uses master key if empty")."""
    import asyncio
    import contextlib
    import io
    import json

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

    @contextlib.contextmanager
    def fake_urlopen(req, timeout=None):
        captured["auth"] = req.headers.get("Authorization")
        yield io.BytesIO(json.dumps({"choices": [{"message": {"content": "hi"}}]}).encode())

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    req = mod.PlaygroundRequest(model="m", messages=[{"role": "user", "content": "hi"}], virtual_key=None)
    asyncio.run(mod.playground("g", req))

    assert captured["auth"] == "Bearer sk-master-resolved"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
