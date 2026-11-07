"""The LiteLLM gateway image must be pinned to one exact release everywhere it is set.

Floating tags (main-latest, main-stable) made the deployed version unknowable, so nobody
could show a gateway was past a fix such as CVE-2026-114612. The version is declared in
four places that must agree - the template's Terraform default, the template.json default
the UI deploy path reads, the backend request default, and the Control Plane's own
gateway module - and the template rejects anything that is not vX.Y.Z, so a drifted
backend default would fail every deploy from the UI rather than fall back silently.
"""

import ast
import json
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
# Host checkout: platform/control_plane/templates. Backend image: /app/templates.
TEMPLATES = next(
    (p for p in (BACKEND.parent / "templates", BACKEND / "templates") if p.is_dir()), None
)
# Not copied into the backend image; checked only on a host checkout.
INFRA_VARIABLES = BACKEND.parent / "infrastructure" / "modules" / "litellm" / "variables.tf"

EXACT_RELEASE = re.compile(r"^v\d+\.\d+\.\d+$")


def _backend_default() -> str:
    source = (BACKEND / "src" / "api" / "routes" / "llm_gateway.py").read_text()
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "DEFAULT_LITELLM_VERSION" for t in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError("DEFAULT_LITELLM_VERSION not found in api/routes/llm_gateway.py")


def _terraform_default(path: Path, variable: str) -> str:
    block = re.search(
        rf'variable\s+"{variable}"\s*{{(.*?)\n}}', path.read_text(), re.DOTALL
    )
    assert block, f"variable {variable} not found in {path}"
    default = re.search(r'^\s*default\s*=\s*"([^"]*)"', block.group(1), re.MULTILINE)
    assert default, f"variable {variable} in {path} has no string default"
    return default.group(1)


def test_backend_default_is_exact_release():
    assert EXACT_RELEASE.match(_backend_default())


@pytest.mark.skipif(TEMPLATES is None, reason="templates/ not present")
def test_template_defaults_match_backend():
    expected = _backend_default()
    gateway = TEMPLATES / "llm-gateway"

    tf_default = _terraform_default(gateway / "iac" / "terraform" / "variables.tf", "litellm_version")
    params = json.loads((gateway / "template.json").read_text())["parameters"]
    json_default = next(p["default"] for p in params if p["name"] == "litellm_version")

    assert tf_default == expected
    assert json_default == expected


@pytest.mark.skipif(not INFRA_VARIABLES.is_file(), reason="infrastructure/ not in this image")
def test_control_plane_gateway_matches_backend():
    assert _terraform_default(INFRA_VARIABLES, "litellm_image_tag") == _backend_default()
