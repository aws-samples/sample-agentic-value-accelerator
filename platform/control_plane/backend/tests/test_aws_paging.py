"""Tests for core.aws_paging.

These use botocore's own `Stubber` against a real service model rather than a hand-written
fake. That matters here: the whole module rests on a claim about how botocore's paginator
reports truncation, so testing it against a fake paginator would prove nothing about the
paginator we actually ship against.

The claim, measured on botocore 1.43.10: `PageIterator.resume_token` is populated ONLY when
the iterator stopped itself on `MaxItems`. If you break out of the loop by hand it is None
whether or not more data remains - so a hand-bounded walk cannot tell truncation from
completion. `test_manual_break_cannot_detect_truncation` pins that behaviour, because if a
future botocore changes it, the reasoning in aws_paging's docstring stops being true.

The most important assertion is `test_bound_equal_to_real_total_emits_no_caveat`: a count
that is exact must not acquire a "floor" caveat. A reader cannot distinguish a reflexive
caveat from a real one, so emitting one where it does not apply is its own dishonesty.
"""

import boto3
import pytest
from botocore.exceptions import ParamValidationError
from botocore.stub import Stubber

from core.aws_paging import PAGE_FAILED_MARKER, paginate_bounded


def _model(i: int) -> dict:
    return {
        "ModelName": f"m{i}",
        "ModelArn": f"arn:aws:sagemaker:us-east-1:123456789012:model/m{i}",
        "CreationTime": 0,
    }


@pytest.fixture
def sm():
    return boto3.client(
        "sagemaker",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _stub(client, pages, error=None):
    s = Stubber(client)
    for page in pages:
        s.add_response("list_models", page)
    if error:
        s.add_client_error("list_models", service_error_code=error)
    s.activate()
    return s


# --- completeness ----------------------------------------------------------------


def test_walks_every_page_and_reports_an_exact_total(sm):
    """The bug in one assertion: page two has to be read."""
    with _stub(sm, [
        {"Models": [_model(1), _model(2)], "NextToken": "t1"},
        {"Models": [_model(3)]},
    ]):
        result = paginate_bounded(sm, "list_models", "Models", page_size=2)

    assert len(result.items) == 3
    assert result.complete
    assert result.note is None


def test_bound_equal_to_real_total_emits_no_caveat(sm):
    """The regression that matters most: claiming truncation that did not happen."""
    with _stub(sm, [
        {"Models": [_model(1), _model(2)], "NextToken": "t1"},
        {"Models": [_model(3)]},
    ]):
        result = paginate_bounded(sm, "list_models", "Models", max_items=3, page_size=2)

    assert len(result.items) == 3
    assert result.truncated is False
    assert result.complete
    assert result.note is None


def test_empty_list_is_a_complete_measured_zero(sm):
    """A reachable service returning nothing IS live data, and must not look truncated."""
    with _stub(sm, [{"Models": []}]):
        result = paginate_bounded(sm, "list_models", "Models")

    assert result.items == []
    assert result.complete
    assert result.note is None


# --- truncation, disclosed -------------------------------------------------------


def test_bound_below_real_total_is_reported_as_a_floor(sm):
    with _stub(sm, [
        {"Models": [_model(1), _model(2)], "NextToken": "t1"},
        {"Models": [_model(3), _model(4)], "NextToken": "t2"},
        {"Models": [_model(5)]},
    ]):
        result = paginate_bounded(sm, "list_models", "Models", max_items=2, page_size=2)

    assert len(result.items) == 2
    assert result.truncated is True
    assert not result.complete
    assert "floor" in result.note


def test_manual_break_cannot_detect_truncation(sm):
    """Not a test of our code - a test of the botocore behaviour our code depends on.

    If this ever fails, `paginate_bounded` may be able to stop using MaxItems, and the
    reasoning recorded in its module docstring needs revisiting.
    """
    with _stub(sm, [
        {"Models": [_model(1), _model(2)], "NextToken": "t1"},
        {"Models": [_model(3)], "NextToken": "t2"},
    ]):
        iterator = sm.get_paginator("list_models").paginate(
            PaginationConfig={"PageSize": 2}
        )
        for _ in iterator:
            break
        assert iterator.resume_token is None      # more data existed; token says nothing


# --- failure is not emptiness ----------------------------------------------------


def test_failure_is_marked_and_not_a_measured_zero(sm):
    with _stub(sm, [], error="AccessDeniedException"):
        result = paginate_bounded(sm, "list_models", "Models")

    assert result.failed is True
    assert result.items == []
    assert not result.complete
    assert PAGE_FAILED_MARKER in result.note


def test_partial_results_survive_a_mid_walk_failure(sm):
    """A partial answer is worth returning; it just has to say it is partial."""
    with _stub(sm, [{"Models": [_model(1), _model(2)], "NextToken": "t1"}],
               error="ThrottlingException"):
        result = paginate_bounded(sm, "list_models", "Models", page_size=2)

    assert len(result.items) == 2
    assert result.failed is True
    assert PAGE_FAILED_MARKER in result.note


def test_param_validation_error_propagates(sm):
    """It subclasses BotoCoreError, so a broad handler would report a bug in OUR request
    as an AWS-side outage."""
    with pytest.raises(ParamValidationError):
        # ListModels has no such parameter, so botocore rejects it before the wire.
        paginate_bounded(sm, "list_models", "Models", NotARealParameter="x")


def test_non_paginable_operation_refuses_rather_than_reading_one_page(sm):
    with pytest.raises(ValueError, match="not paginable"):
        paginate_bounded(sm, "describe_model", "Models")


# --- pass-through ----------------------------------------------------------------


def test_operation_kwargs_are_forwarded(sm):
    """Callers page scoped lists (targets of one gateway), so kwargs must reach the API."""
    s = Stubber(sm)
    s.add_response(
        "list_models",
        {"Models": [_model(1)]},
        {"NameContains": "fraud", "MaxResults": 5},
    )
    with s:
        result = paginate_bounded(
            sm, "list_models", "Models", page_size=5, NameContains="fraud"
        )

    assert len(result.items) == 1          # Stubber asserts the params matched
    assert result.complete
