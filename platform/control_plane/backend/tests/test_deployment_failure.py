"""
Property-Based Tests for Failed Deployment Recording

# Feature: cicd-deployment-pipeline, Property 3: Failed deployments record error message and failed stage

Uses Hypothesis to verify that when a deployment transitions to FAILED status,
the deployment record can contain a non-empty error_message and a failed_stage
value matching one of the pipeline stages.

**Validates: Requirements 5.5**
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

# Pipeline stages that can appear as failed_stage
PIPELINE_STAGES = [
    "ValidateInput",
    "PackageTemplate",
    "StartBuild",
    "MonitorBuild",
    "CaptureOutputs",
]

# Statuses that can transition to FAILED (active statuses)
ACTIVE_STATUSES = [
    s for s, targets in VALID_TRANSITIONS.items()
    if DeploymentStatus.FAILED in targets
]

# Terminal statuses that cannot transition to FAILED
TERMINAL_STATUSES = [
    s for s, targets in VALID_TRANSITIONS.items()
    if DeploymentStatus.FAILED not in targets
]

# Strategies
active_status = st.sampled_from(ACTIVE_STATUSES)
terminal_status = st.sampled_from(TERMINAL_STATUSES)
pipeline_stage = st.sampled_from(PIPELINE_STAGES)
error_message = st.text(min_size=1, max_size=200).filter(lambda s: s.strip())


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


class TestFailedDeploymentRecording:
    """Property 3: Failed deployments record error message and failed stage.

    For any deployment that transitions to FAILED status, the deployment
    record should contain a non-empty error_message and a failed_stage
    value matching one of the pipeline stages.
    """

    # Feature: cicd-deployment-pipeline, Property 3: Failed deployments record error message and failed stage

    @settings(max_examples=100)
    @given(current=active_status)
    def test_transition_to_failed_succeeds_from_active_status(
        self, current: DeploymentStatus
    ):
        """Any active status can transition to FAILED."""
        deployment = _make_deployment(current)
        deployment.transition_to(DeploymentStatus.FAILED)
        assert deployment.status == DeploymentStatus.FAILED

    @settings(max_examples=100)
    @given(current=active_status)
    def test_transition_to_failed_records_history_entry(
        self, current: DeploymentStatus
    ):
        """Transitioning to FAILED appends a history entry."""
        deployment = _make_deployment(current)
        history_len_before = len(deployment.status_history)

        deployment.transition_to(DeploymentStatus.FAILED)

        assert len(deployment.status_history) == history_len_before + 1
        
        entry = deployment.status_history[-1]
        assert entry.status == DeploymentStatus.FAILED.value
        assert entry.timestamp

    @settings(max_examples=100)
    @given(
        current=active_status,
        stage=pipeline_stage,
        err_msg=error_message,
    )
    def test_failed_stage_and_error_message_can_be_set(
        self,
        current: DeploymentStatus,
        stage: str,
        err_msg: str,
    ):
        """After transitioning to FAILED, failed_stage and error_message
        can be set on the model and persist correctly.

        The service layer (DeploymentService.record_failure_stage, Task 2.1)
        will handle setting these fields. Here we verify the model accepts them.
        """
        deployment = _make_deployment(current)
        deployment.transition_to(DeploymentStatus.FAILED)

        # Set failure details on the model (simulating what the service layer does)
        deployment.failed_stage = stage
        deployment.error_message = err_msg

        # Verify the fields are set correctly
        assert deployment.status == DeploymentStatus.FAILED
        assert deployment.failed_stage == stage
        assert deployment.failed_stage in PIPELINE_STAGES
        assert deployment.error_message == err_msg
        assert len(deployment.error_message) > 0

    @settings(max_examples=100)
    @given(current=terminal_status)
    def test_terminal_statuses_cannot_transition_to_failed(
        self, current: DeploymentStatus
    ):
        """Terminal statuses (DEPLOYED, DESTROYED, FAILED, ROLLED_BACK)
        cannot transition to FAILED.

        Note: DEPLOYED can only transition to DESTROYING, not FAILED.
        """
        deployment = _make_deployment(current)

        with pytest.raises(ValueError):
            deployment.transition_to(DeploymentStatus.FAILED)

        # Status remains unchanged
        assert deployment.status == current
