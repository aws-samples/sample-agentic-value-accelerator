"""
Property-Based Tests for Timestamped History Entries

# Feature: cicd-deployment-pipeline, Property 2: Every status transition records a timestamped history entry

Uses Hypothesis to verify that every valid status transition appends a
StatusHistoryEntry with the correct status value, a non-empty ISO-8601
timestamp, and that the deployment's updated_at field is refreshed.

**Validates: Requirements 5.4, 1.8**
"""

import re
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

# ISO-8601 datetime pattern (e.g. 2026-01-15T10:30:00.123456)
ISO8601_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$"
)

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


def _valid_transition_pairs() -> st.SearchStrategy:
    """Strategy that produces (current_status, target_status) pairs
    where the transition is valid according to VALID_TRANSITIONS."""
    return any_status.flatmap(
        lambda current: st.sampled_from(
            sorted(VALID_TRANSITIONS.get(current, set()), key=lambda s: s.value)
        ).map(lambda target: (current, target))
        if VALID_TRANSITIONS.get(current, set())
        else st.nothing()
    )


class TestTimestampedHistoryEntries:
    """Property 2: Every status transition records a timestamped history entry.

    For any deployment and for any valid status transition, after the
    transition completes, the status_history array should contain a new
    entry with the new status value and a non-empty ISO-8601 timestamp,
    and the deployment's updated_at field should be updated.
    """

    # Feature: cicd-deployment-pipeline, Property 2: Every status transition records a timestamped history entry

    @settings(max_examples=200)
    @given(data=_valid_transition_pairs())
    def test_single_transition_appends_history_entry(
        self, data: tuple
    ):
        """A single valid transition adds exactly one history entry."""
        current, target = data
        deployment = _make_deployment(current)
        history_len_before = len(deployment.status_history)

        deployment.transition_to(target)

        # Exactly one new entry was appended
        assert len(deployment.status_history) == history_len_before + 1

        entry = deployment.status_history[-1]
        # Entry records the new status value
        assert entry.status == target.value
        # Entry has a non-empty ISO-8601 timestamp
        assert entry.timestamp
        assert ISO8601_PATTERN.match(entry.timestamp), (
            f"Timestamp '{entry.timestamp}' is not valid ISO-8601"
        )

    @settings(max_examples=200)
    @given(data=_valid_transition_pairs())
    def test_transition_updates_updated_at(self, data: tuple):
        """After a valid transition, updated_at is refreshed to a valid ISO-8601 timestamp."""
        current, target = data
        deployment = _make_deployment(current)

        deployment.transition_to(target)

        # updated_at should be a valid ISO-8601 timestamp
        assert ISO8601_PATTERN.match(deployment.updated_at), (
            f"updated_at '{deployment.updated_at}' is not valid ISO-8601"
        )
        # The history entry timestamp should match updated_at
        assert deployment.status_history[-1].timestamp == deployment.updated_at

    @settings(max_examples=100)
    @given(current=any_status)
    def test_transition_sequence_builds_full_history(self, current: DeploymentStatus):
        """Walking a chain of valid transitions accumulates one history entry per step."""
        deployment = _make_deployment(current)
        visited = {current}
        steps = 0

        # Walk the transition graph greedily (pick first unvisited valid target)
        while True:
            targets = VALID_TRANSITIONS.get(DeploymentStatus(deployment.status), set())
            unvisited = [t for t in targets if t not in visited]
            if not unvisited:
                break
            next_status = sorted(unvisited, key=lambda s: s.value)[0]
            deployment.transition_to(next_status)
            visited.add(next_status)
            steps += 1

        # History length equals the number of transitions performed
        assert len(deployment.status_history) == steps

        # Every entry has a valid status and non-empty ISO-8601 timestamp
        for entry in deployment.status_history:
            assert entry.status
            assert entry.timestamp
            assert ISO8601_PATTERN.match(entry.timestamp), (
                f"Timestamp '{entry.timestamp}' is not valid ISO-8601"
            )
