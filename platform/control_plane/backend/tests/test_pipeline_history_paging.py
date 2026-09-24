"""Tests for the Step Functions execution history read in PipelineService.

Kept separate from tests/test_pipeline_service.py, which loads the module through an
importlib shim with boto3 mocked out. That shim cannot exercise a paginator, and it is
also on the pre-existing-breakage list, so a new assertion added there would not run.

This one is not a count defect. `get_execution_history(maxResults=100)` fed a LIST rendered
as "the execution history", and the truncation was at the worst possible end:
`reverseOrder=False` returns oldest first, so the events dropped are the most recent ones -
exactly the ones that say how the execution failed. The list simply stopped, with nothing
saying it was a prefix.

As everywhere else in this sweep, the assertion that matters most is the negative one:
`test_a_history_that_fits_reports_no_caveat` pins that a complete read leaves `events_note`
as None, because a caveat on every response is a caveat a reader stops reading.
"""

from datetime import datetime

import boto3
from botocore.stub import Stubber

from services.pipeline_service import PipelineService

_ARN = "arn:aws:states:us-east-1:000000000000:execution:sm:exec-1"


def _sfn():
    return boto3.client(
        "stepfunctions",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _event(i: int) -> dict:
    return {
        "timestamp": datetime(2026, 1, 1),
        "type": "TaskStateEntered",
        "id": i,
    }


def _describe() -> dict:
    return {
        "executionArn": _ARN,
        "stateMachineArn": "arn:aws:states:us-east-1:000000000000:stateMachine:sm",
        "status": "SUCCEEDED",
        "startDate": datetime(2026, 1, 1),
        "input": "{}",
    }


def _service(client):
    """PipelineService without __init__, which would build two real boto3 clients."""
    svc = PipelineService.__new__(PipelineService)
    svc.sfn_client = client
    svc.state_machine_arn = "arn:aws:states:us-east-1:000000000000:stateMachine:sm"
    svc.region = "us-east-1"
    return svc


def _stub(client, history_pages):
    s = Stubber(client)
    s.add_response("describe_execution", _describe())
    for page in history_pages:
        s.add_response("get_execution_history", page)
    s.activate()
    return s


def test_a_history_that_fits_reports_no_caveat():
    """The negative case. A complete walk must not hedge, or the hedge means nothing."""
    client = _sfn()
    with _stub(client, [{"events": [_event(1), _event(2)]}]):
        result = _service(client).get_execution_status(_ARN)

    assert len(result["events"]) == 2
    assert result["events_complete"] is True
    assert result["events_note"] is None


def test_the_second_page_of_history_is_actually_read():
    """The bug in one assertion. Event 3 is on page two and used to be discarded."""
    client = _sfn()
    with _stub(client, [
        {"events": [_event(1), _event(2)], "nextToken": "t1"},
        {"events": [_event(3)]},
    ]):
        result = _service(client).get_execution_status(_ARN)

    assert [e["id"] for e in result["events"]] == [1, 2, 3]
    assert result["events_complete"] is True
    assert result["events_note"] is None


def test_a_truncated_history_says_it_is_a_prefix():
    """A consumer must not read an outcome off the last event it can see."""
    client = _sfn()
    with _stub(client, [
        {"events": [_event(1), _event(2)], "nextToken": "t1"},
        {"events": [_event(3), _event(4)], "nextToken": "t2"},
    ]):
        svc = _service(client)
        import services.pipeline_service as ps
        original = ps._MAX_HISTORY_EVENTS
        ps._MAX_HISTORY_EVENTS = 2
        try:
            result = svc.get_execution_status(_ARN)
        finally:
            ps._MAX_HISTORY_EVENTS = original

    assert len(result["events"]) == 2
    assert result["events_complete"] is False
    assert "floor" in result["events_note"]


def test_status_and_output_come_from_describe_and_are_unaffected():
    """describe_execution, not the history walk, is the source of the terminal status. This
    pins that a bounded history does not degrade the parts that were always exact."""
    client = _sfn()
    with _stub(client, [{"events": []}]):
        result = _service(client).get_execution_status(_ARN)

    assert result["status"] == "SUCCEEDED"
    assert result["events"] == []
    assert result["events_complete"] is True


def test_a_failed_history_read_is_disclosed_rather_than_returning_an_empty_history():
    client = _sfn()
    s = Stubber(client)
    s.add_response("describe_execution", _describe())
    s.add_client_error("get_execution_history", service_error_code="ThrottlingException")
    with s:
        result = _service(client).get_execution_status(_ARN)

    assert result["events"] == []
    assert result["events_complete"] is False
    assert "failed" in result["events_note"].lower()
    assert result["status"] == "SUCCEEDED"


def test_oldest_first_is_what_makes_truncation_dangerous_here():
    """Pins reverseOrder=False, since it is the reason a truncated history loses the END.

    Stubber asserts the expected parameter set, so this also pins maxResults at the API
    maximum of 1000 rather than the round 100 it used to be.
    """
    client = _sfn()
    s = Stubber(client)
    s.add_response("describe_execution", _describe())
    s.add_response(
        "get_execution_history",
        {"events": [_event(1)]},
        {"executionArn": _ARN, "reverseOrder": False, "maxResults": 1000},
    )
    with s:
        result = _service(client).get_execution_status(_ARN)

    assert result["events_complete"] is True


def test_get_execution_history_is_paginable():
    assert _sfn().can_paginate("get_execution_history") is True


def test_the_api_maximum_is_what_the_service_model_says():
    shape = _sfn().meta.service_model.operation_model("GetExecutionHistory").input_shape
    assert shape.members["maxResults"].metadata["max"] == 1000
