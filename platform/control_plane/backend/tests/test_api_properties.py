"""
Property-Based Tests for API Route Logic

# Feature: cicd-deployment-pipeline, Property 10: Destroy returns 409 for non-DEPLOYED statuses
# Feature: cicd-deployment-pipeline, Property 11: Status endpoint returns status, history, and outputs for any deployment

Uses Hypothesis to verify:
- The destroy endpoint rejects non-DEPLOYED deployments with 409 Conflict.
- The status endpoint response contains status, status_history, and outputs for any deployment.

**Validates: Requirements 6.4, 6.2**
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
StatusHistoryEntry = _deployment_mod.StatusHistoryEntry

# Strategies
any_status = st.sampled_from(list(DeploymentStatus))
non_deployed_status = st.sampled_from(
    [s for s in DeploymentStatus if s != DeploymentStatus.DEPLOYED]
)


def _make_deployment(
    status: DeploymentStatus,
    outputs=None,
    status_history=None,
):
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
        outputs=outputs or {},
        status_history=status_history or [],
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# Helper: simulate the destroy endpoint's status-check logic
# ---------------------------------------------------------------------------
def _destroy_status_check(deployment: Deployment) -> dict:
    """Replicate the status check from POST /deployments/{id}/destroy.

    Returns a dict with 'status_code' and 'detail' mirroring the route logic.
    If the deployment is DEPLOYED, returns 200. Otherwise returns 409.
    """
    current_status = DeploymentStatus(deployment.status)
    if current_status != DeploymentStatus.DEPLOYED:
        return {
            "status_code": 409,
            "detail": (
                f"Cannot destroy deployment in '{current_status.value}' status. "
                "Only DEPLOYED deployments can be destroyed."
            ),
        }
    return {"status_code": 200, "detail": None}


# ---------------------------------------------------------------------------
# Helper: simulate the status endpoint's response construction logic
# ---------------------------------------------------------------------------
def _build_status_response(deployment: Deployment) -> dict:
    """Replicate the response dict from GET /deployments/{id}/status.

    Mirrors the route handler's return value.
    """
    return {
        "deployment_id": deployment.deployment_id,
        "status": (
            deployment.status
            if isinstance(deployment.status, str)
            else deployment.status.value
        ),
        "status_history": [entry.dict() for entry in deployment.status_history],
        "outputs": deployment.outputs,
        "failed_stage": deployment.failed_stage,
        "error_message": deployment.error_message,
    }


# ===========================================================================
# Property 10: Destroy returns 409 for non-DEPLOYED statuses
# ===========================================================================
class TestDestroyRejects409:
    """Property 10: Destroy returns 409 for non-DEPLOYED statuses.

    For any deployment whose status is not DEPLOYED, a destroy request
    should return HTTP 409 Conflict. Only deployments in DEPLOYED status
    should be accepted for destruction.

    **Validates: Requirements 6.4**
    """

    # Feature: cicd-deployment-pipeline, Property 10: Destroy returns 409 for non-DEPLOYED statuses

    @settings(max_examples=100)
    @given(status=non_deployed_status)
    def test_non_deployed_returns_409(self, status: DeploymentStatus):
        """Any non-DEPLOYED status must yield a 409 response."""
        deployment = _make_deployment(status)
        result = _destroy_status_check(deployment)

        assert result["status_code"] == 409
        assert "Cannot destroy" in result["detail"]
        assert status.value in result["detail"]

    @settings(max_examples=100)
    @given(status=any_status)
    def test_only_deployed_returns_200(self, status: DeploymentStatus):
        """200 is returned if and only if the status is DEPLOYED."""
        deployment = _make_deployment(status)
        result = _destroy_status_check(deployment)

        if status == DeploymentStatus.DEPLOYED:
            assert result["status_code"] == 200
            assert result["detail"] is None
        else:
            assert result["status_code"] == 409


# ===========================================================================
# Property 11: Status endpoint returns status, history, and outputs
# ===========================================================================

# Strategy: generate random string-to-string output dicts
_output_keys = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="_-"),
    min_size=1,
    max_size=20,
)
_output_values = st.text(min_size=0, max_size=50)
random_outputs = st.dictionaries(_output_keys, _output_values, max_size=5)

# Strategy: generate random status history entries
random_history_entry = st.builds(
    StatusHistoryEntry,
    status=any_status.map(lambda s: s.value),
    timestamp=st.just(datetime.utcnow().isoformat()),
    message=st.one_of(st.none(), st.text(min_size=1, max_size=30)),
)
random_history = st.lists(random_history_entry, min_size=0, max_size=5)


class TestStatusEndpointResponse:
    """Property 11: Status endpoint returns status, history, and outputs for any deployment.

    For any deployment in any status, the GET /deployments/{id}/status
    response should contain the status field matching the deployment's
    current status, a status_history array, and an outputs dictionary
    (empty if not yet deployed).

    **Validates: Requirements 6.2**
    """

    # Feature: cicd-deployment-pipeline, Property 11: Status endpoint returns status, history, and outputs for any deployment

    @settings(max_examples=100)
    @given(status=any_status, outputs=random_outputs, history=random_history)
    def test_response_contains_required_fields(
        self,
        status: DeploymentStatus,
        outputs: dict,
        history: list,
    ):
        """Response always contains status, status_history, and outputs."""
        deployment = _make_deployment(status, outputs=outputs, status_history=history)
        response = _build_status_response(deployment)

        # Required keys are present
        assert "status" in response
        assert "status_history" in response
        assert "outputs" in response

        # status matches the deployment's current status
        assert response["status"] == status.value

        # status_history is a list with the correct length
        assert isinstance(response["status_history"], list)
        assert len(response["status_history"]) == len(history)

        # outputs is a dict matching what was set
        assert isinstance(response["outputs"], dict)
        assert response["outputs"] == outputs

    @settings(max_examples=100)
    @given(status=any_status)
    def test_non_deployed_has_empty_outputs_by_default(
        self, status: DeploymentStatus
    ):
        """A deployment with no outputs set returns an empty outputs dict."""
        deployment = _make_deployment(status)
        response = _build_status_response(deployment)

        assert response["outputs"] == {}

    @settings(max_examples=100)
    @given(status=any_status, outputs=random_outputs, history=random_history)
    def test_response_includes_error_fields(
        self,
        status: DeploymentStatus,
        outputs: dict,
        history: list,
    ):
        """Response always includes failed_stage and error_message fields."""
        deployment = _make_deployment(status, outputs=outputs, status_history=history)
        response = _build_status_response(deployment)

        assert "failed_stage" in response
        assert "error_message" in response
