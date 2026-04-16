"""
Property-Based Tests for EventBridge Status Change Event Payload

# Feature: cicd-deployment-pipeline, Property 8: Status change events contain all required fields

Uses Hypothesis to verify that EventService.publish_status_change produces
EventBridge event payloads containing all required fields: deployment_id,
template_id, status, and a non-empty timestamp, with source set to
"fsi.control-plane" and detail-type set to "DeploymentStatusChange".

**Validates: Requirements 4.2**
"""

import json
import os
import sys
import importlib.util
from unittest.mock import MagicMock

from hypothesis import given, strategies as st, settings

# ---------------------------------------------------------------------------
# Inject a mock boto3 module into sys.modules so that event_service.py can
# be loaded even when boto3 is not installed in the test environment.
# ---------------------------------------------------------------------------
_mock_boto3 = MagicMock()
_had_boto3 = "boto3" in sys.modules
_original_boto3 = sys.modules.get("boto3")
sys.modules["boto3"] = _mock_boto3

# ---------------------------------------------------------------------------
# Import the EventService module directly (via importlib) to avoid the
# Settings() chain that requires env vars not available in test context.
# ---------------------------------------------------------------------------
_event_service_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "services", "event_service.py"
)
_es_spec = importlib.util.spec_from_file_location(
    "event_service", os.path.abspath(_event_service_path)
)
_event_service_mod = importlib.util.module_from_spec(_es_spec)
_es_spec.loader.exec_module(_event_service_mod)

# Restore original boto3 state
if _had_boto3:
    sys.modules["boto3"] = _original_boto3
else:
    del sys.modules["boto3"]

EventService = _event_service_mod.EventService

# ---------------------------------------------------------------------------
# Import DeploymentStatus for the status strategy
# ---------------------------------------------------------------------------
_deployment_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "models", "deployment.py"
)
_dep_spec = importlib.util.spec_from_file_location(
    "deployment", os.path.abspath(_deployment_path)
)
_deployment_mod = importlib.util.module_from_spec(_dep_spec)
_dep_spec.loader.exec_module(_deployment_mod)

DeploymentStatus = _deployment_mod.DeploymentStatus


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Non-empty identifier-like strings for deployment_id and template_id
identifier_strategy = st.text(
    min_size=1,
    max_size=80,
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
)

# Pick any deployment status value
status_strategy = st.sampled_from([s.value for s in DeploymentStatus])

# ISO-8601-like non-empty timestamp strings
timestamp_strategy = st.text(
    min_size=1,
    max_size=40,
    alphabet=st.characters(whitelist_categories=("N",), whitelist_characters="-T:Z.+"),
)


class TestStatusChangeEventPayload:
    """Property 8: Status change events contain all required fields.

    For any deployment status transition, the EventBridge event payload should
    contain deployment_id, template_id, status (matching the new status), and
    a non-empty timestamp field, with source set to "fsi.control-plane" and
    detail-type set to "DeploymentStatusChange".
    """

    # Feature: cicd-deployment-pipeline, Property 8: Status change events contain all required fields

    @settings(max_examples=100)
    @given(
        deployment_id=identifier_strategy,
        template_id=identifier_strategy,
        new_status=status_strategy,
        timestamp=timestamp_strategy,
    )
    def test_event_payload_contains_all_required_fields(
        self,
        deployment_id: str,
        template_id: str,
        new_status: str,
        timestamp: str,
    ):
        """The put_events call must include all required fields with correct values."""
        # Feature: cicd-deployment-pipeline, Property 8: Status change events contain all required fields

        mock_eb_client = MagicMock()
        service = EventService.__new__(EventService)
        service.eb_client = mock_eb_client
        service.event_bus_name = "fsi-deployment-events"

        service.publish_status_change(deployment_id, template_id, new_status, timestamp)

        # put_events must have been called exactly once
        mock_eb_client.put_events.assert_called_once()

        call_kwargs = mock_eb_client.put_events.call_args
        entries = call_kwargs.kwargs.get("Entries") or call_kwargs[1].get("Entries")
        assert entries is not None and len(entries) == 1

        entry = entries[0]

        # Verify top-level event envelope fields
        assert entry["Source"] == "fsi.control-plane"
        assert entry["DetailType"] == "DeploymentStatusChange"

        # Parse the Detail JSON and verify required payload fields
        detail = json.loads(entry["Detail"])

        assert detail["deployment_id"] == deployment_id
        assert detail["template_id"] == template_id
        assert detail["status"] == new_status
        assert detail["timestamp"] == timestamp
        assert len(detail["timestamp"]) > 0

    @settings(max_examples=100)
    @given(
        deployment_id=identifier_strategy,
        template_id=identifier_strategy,
        new_status=status_strategy,
        timestamp=timestamp_strategy,
    )
    def test_event_source_is_fsi_control_plane(
        self,
        deployment_id: str,
        template_id: str,
        new_status: str,
        timestamp: str,
    ):
        """The event source must always be 'fsi.control-plane'."""
        # Feature: cicd-deployment-pipeline, Property 8: Status change events contain all required fields

        mock_eb_client = MagicMock()
        service = EventService.__new__(EventService)
        service.eb_client = mock_eb_client
        service.event_bus_name = "fsi-deployment-events"

        service.publish_status_change(deployment_id, template_id, new_status, timestamp)

        entry = mock_eb_client.put_events.call_args.kwargs["Entries"][0]
        assert entry["Source"] == "fsi.control-plane"

    @settings(max_examples=100)
    @given(
        deployment_id=identifier_strategy,
        template_id=identifier_strategy,
        new_status=status_strategy,
        timestamp=timestamp_strategy,
    )
    def test_event_detail_type_is_deployment_status_change(
        self,
        deployment_id: str,
        template_id: str,
        new_status: str,
        timestamp: str,
    ):
        """The detail-type must always be 'DeploymentStatusChange'."""
        # Feature: cicd-deployment-pipeline, Property 8: Status change events contain all required fields

        mock_eb_client = MagicMock()
        service = EventService.__new__(EventService)
        service.eb_client = mock_eb_client
        service.event_bus_name = "fsi-deployment-events"

        service.publish_status_change(deployment_id, template_id, new_status, timestamp)

        entry = mock_eb_client.put_events.call_args.kwargs["Entries"][0]
        assert entry["DetailType"] == "DeploymentStatusChange"


# ---------------------------------------------------------------------------
# Property 9: Outgoing job events contain correct event type and outputs
# Feature: cicd-deployment-pipeline, Property 9: Outgoing job events contain correct event type and outputs
# **Validates: Requirements 4.4, 10.3**
# ---------------------------------------------------------------------------

# Strategies for Property 9
event_type_strategy = st.text(
    min_size=1,
    max_size=120,
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_."),
)

detail_value_strategy = st.text(
    min_size=0,
    max_size=200,
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z"), whitelist_characters="-_.:/ "),
)

detail_dict_strategy = st.dictionaries(
    keys=st.text(
        min_size=1,
        max_size=60,
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="_-"),
    ),
    values=detail_value_strategy,
    min_size=0,
    max_size=15,
)


class TestOutgoingJobEventPayload:
    """Property 9: Outgoing job events contain correct event type and outputs.

    For any template with a jobs array and for any set of deployment outputs,
    the outgoing event should use the template job's outgoing_event as the
    detail-type and include all output key-value pairs in the event detail.

    **Validates: Requirements 4.4, 10.3**
    """

    # Feature: cicd-deployment-pipeline, Property 9: Outgoing job events contain correct event type and outputs

    @settings(max_examples=100)
    @given(
        event_type=event_type_strategy,
        detail=detail_dict_strategy,
    )
    def test_detail_type_matches_event_type(self, event_type: str, detail: dict):
        """The DetailType in put_events must match the provided event_type."""
        # Feature: cicd-deployment-pipeline, Property 9: Outgoing job events contain correct event type and outputs

        mock_eb_client = MagicMock()
        service = EventService.__new__(EventService)
        service.eb_client = mock_eb_client
        service.event_bus_name = "fsi-deployment-events"

        service.publish_job_event(event_type, detail)

        mock_eb_client.put_events.assert_called_once()
        call_kwargs = mock_eb_client.put_events.call_args
        entries = call_kwargs.kwargs.get("Entries") or call_kwargs[1].get("Entries")
        assert entries is not None and len(entries) == 1

        entry = entries[0]
        assert entry["DetailType"] == event_type

    @settings(max_examples=100)
    @given(
        event_type=event_type_strategy,
        detail=detail_dict_strategy,
    )
    def test_detail_contains_all_output_key_value_pairs(self, event_type: str, detail: dict):
        """The Detail JSON must contain every key-value pair from the provided detail dict."""
        # Feature: cicd-deployment-pipeline, Property 9: Outgoing job events contain correct event type and outputs

        mock_eb_client = MagicMock()
        service = EventService.__new__(EventService)
        service.eb_client = mock_eb_client
        service.event_bus_name = "fsi-deployment-events"

        service.publish_job_event(event_type, detail)

        call_kwargs = mock_eb_client.put_events.call_args
        entries = call_kwargs.kwargs.get("Entries") or call_kwargs[1].get("Entries")
        entry = entries[0]

        parsed_detail = json.loads(entry["Detail"])
        for key, value in detail.items():
            assert key in parsed_detail, f"Missing key '{key}' in event detail"
            assert parsed_detail[key] == value, (
                f"Value mismatch for key '{key}': expected {value!r}, got {parsed_detail[key]!r}"
            )

    @settings(max_examples=100)
    @given(
        event_type=event_type_strategy,
        detail=detail_dict_strategy,
    )
    def test_source_is_fsi_control_plane(self, event_type: str, detail: dict):
        """The Source must always be 'fsi.control-plane'."""
        # Feature: cicd-deployment-pipeline, Property 9: Outgoing job events contain correct event type and outputs

        mock_eb_client = MagicMock()
        service = EventService.__new__(EventService)
        service.eb_client = mock_eb_client
        service.event_bus_name = "fsi-deployment-events"

        service.publish_job_event(event_type, detail)

        call_kwargs = mock_eb_client.put_events.call_args
        entries = call_kwargs.kwargs.get("Entries") or call_kwargs[1].get("Entries")
        entry = entries[0]

        assert entry["Source"] == "fsi.control-plane"
