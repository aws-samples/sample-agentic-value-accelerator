"""
Property-Based Tests for Deployment Status Transitions

# Feature: cicd-deployment-pipeline, Property 1: Valid status transitions are enforced

Uses Hypothesis to verify that the deployment model's transition_to method
enforces the VALID_TRANSITIONS map correctly for all status pairs.

**Validates: Requirements 5.2**
"""

import os
import importlib.util
import pytest
from hypothesis import given, strategies as st, settings, assume
from datetime import datetime

# Import deployment module directly via importlib to avoid models/__init__.py
# triggering the Settings() chain which requires env vars not available in tests.
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
VALID_TRANSITIONS = _deployment_mod.VALID_TRANSITIONS


# Strategy: pick any DeploymentStatus value
any_status = st.sampled_from(list(DeploymentStatus))


def _make_deployment(status: DeploymentStatus) -> Deployment:
    """Create a minimal Deployment fixture in the given status."""
    now = datetime.utcnow().isoformat()
    return Deployment(
        deployment_id="test-deploy-id",
        deployment_name="test",
        template_id="tpl-1",
        iac_type="terraform",
        aws_account="123456789012",
        aws_region="us-east-1",
        s3_bucket="test-bucket",
        status=status,
        created_at=now,
        updated_at=now,
    )


class TestValidStatusTransitions:
    """Property 1: Valid status transitions are enforced.

    For any deployment in any status and for any target status,
    calling transition_to should succeed if and only if the target
    status is in the VALID_TRANSITIONS map for the current status.
    Invalid transitions should raise a ValueError.
    """

    @settings(max_examples=200)
    @given(current=any_status, target=any_status)
    def test_transition_succeeds_iff_valid(
        self, current: DeploymentStatus, target: DeploymentStatus
    ):
        # Feature: cicd-deployment-pipeline, Property 1: Valid status transitions are enforced
        deployment = _make_deployment(current)
        valid_targets = VALID_TRANSITIONS.get(current, set())

        if target in valid_targets:
            # Valid transition — should succeed without error
            deployment.transition_to(target)
            assert deployment.status == target
        else:
            # Invalid transition — must raise ValueError
            with pytest.raises(ValueError):
                deployment.transition_to(target)
            # Status must remain unchanged after a rejected transition
            assert deployment.status == current
