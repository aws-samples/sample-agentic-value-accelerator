"""
Property-Based Tests for IaC Outputs Round-Trip

# Feature: cicd-deployment-pipeline, Property 6: IaC outputs round-trip through capture and storage

Uses Hypothesis to verify that IaC outputs (string-to-string dictionaries)
survive round-trips through the Deployment model and JSON serialization,
simulating the artifact write/read and deployment record storage paths.

**Validates: Requirements 1.7, 5.3**
"""

import json
import os
import importlib.util
import pytest
from hypothesis import given, strategies as st, settings
from datetime import datetime

# Import deployment module directly to avoid models/__init__.py triggering
# the Settings() chain which requires env vars not available in test context.
_deployment_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "models", "deployment.py"
)
_spec = importlib.util.spec_from_file_location(
    "deployment", os.path.abspath(_deployment_path)
)
_deployment_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_deployment_mod)

Deployment = _deployment_mod.Deployment
DeploymentStatus = _deployment_mod.DeploymentStatus


# Strategy: generate dictionaries of string keys to string values.
# Keys are non-empty printable text (IaC output names are identifiers).
# Values are arbitrary text strings (endpoints, ARNs, resource IDs, etc.).
outputs_strategy = st.dictionaries(
    keys=st.text(
        min_size=1,
        max_size=50,
        alphabet=st.characters(whitelist_categories=("L", "N", "P")),
    ),
    values=st.text(min_size=0, max_size=200),
    min_size=0,
    max_size=20,
)


def _make_deployment(outputs: dict | None = None) -> Deployment:
    """Create a minimal Deployment fixture, optionally with outputs."""
    now = datetime.utcnow().isoformat()
    return Deployment(
        deployment_id="test-deploy-id",
        deployment_name="test",
        template_id="tpl-1",
        iac_type="terraform",
        aws_account="123456789012",
        aws_region="us-east-1",
        s3_bucket="test-bucket",
        status=DeploymentStatus.DEPLOYED,
        outputs=outputs or {},
        created_at=now,
        updated_at=now,
    )


class TestOutputsRoundTrip:
    """Property 6: IaC outputs round-trip through capture and storage.

    For any valid Dict[str, str] of outputs:
    1. Setting them on a Deployment model and reading back produces an identical dict
    2. JSON serializing and deserializing produces an identical dict (artifact write/read)
    3. After storing outputs on a deployment, all keys are retrievable
    """

    # Feature: cicd-deployment-pipeline, Property 6: IaC outputs round-trip through capture and storage

    @settings(max_examples=100)
    @given(outputs=outputs_strategy)
    def test_model_set_and_read_identity(self, outputs: dict):
        """Setting outputs on a Deployment and reading them back yields the same dict."""
        # Feature: cicd-deployment-pipeline, Property 6: IaC outputs round-trip through capture and storage
        deployment = _make_deployment()
        deployment.outputs = outputs

        assert deployment.outputs == outputs

    @settings(max_examples=100)
    @given(outputs=outputs_strategy)
    def test_json_serialize_deserialize_identity(self, outputs: dict):
        """JSON round-trip (simulating artifact write then read) preserves the dict."""
        # Feature: cicd-deployment-pipeline, Property 6: IaC outputs round-trip through capture and storage
        serialized = json.dumps(outputs)
        deserialized = json.loads(serialized)

        assert deserialized == outputs

    @settings(max_examples=100)
    @given(outputs=outputs_strategy)
    def test_all_keys_retrievable_after_store(self, outputs: dict):
        """After storing outputs on a deployment, every key is present and retrievable."""
        # Feature: cicd-deployment-pipeline, Property 6: IaC outputs round-trip through capture and storage
        deployment = _make_deployment(outputs)

        for key in outputs:
            assert key in deployment.outputs
            assert deployment.outputs[key] == outputs[key]

        assert set(deployment.outputs.keys()) == set(outputs.keys())

    @settings(max_examples=100)
    @given(outputs=outputs_strategy)
    def test_model_dict_roundtrip_preserves_outputs(self, outputs: dict):
        """Serializing a Deployment to dict and reconstructing preserves outputs."""
        # Feature: cicd-deployment-pipeline, Property 6: IaC outputs round-trip through capture and storage
        deployment = _make_deployment(outputs)
        data = deployment.dict()
        restored = Deployment(**data)

        assert restored.outputs == outputs
