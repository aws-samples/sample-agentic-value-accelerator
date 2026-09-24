"""Tests for core.aws_paging.paginate_bounded_manual.

Kept in its own file so it does not collide with tests/test_aws_paging.py, which covers the
paginator path.

This path exists for a small residue of AWS operations that return a `NextToken` but have
no entry in botocore's paginator model, so `can_paginate()` is False and `paginate_bounded`
refuses them. `glue:ListDataQualityRulesets` is the live example (verified on botocore
1.43.10) and is stubbed here for exactly that reason - the point of the module is a claim
about a real service's shape, and a hand-written fake would not test that claim.

Same priority as the sibling file: the assertion that matters most is the NEGATIVE one.
`test_bound_equal_to_real_total_emits_no_caveat` pins that a count which is exact does not
acquire a "floor" caveat, because a reader cannot distinguish a reflexive caveat from a real
one and will learn to ignore both.
"""

import boto3
import pytest
from botocore.exceptions import ParamValidationError
from botocore.stub import Stubber

from core.aws_paging import PAGE_FAILED_MARKER, paginate_bounded, paginate_bounded_manual


def _ruleset(i: int) -> dict:
    return {"Name": f"rs{i}", "RecommendationRunId": f"run{i}"}


@pytest.fixture
def glue():
    return boto3.client(
        "glue",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _stub(client, pages, error=None):
    s = Stubber(client)
    for page in pages:
        s.add_response("list_data_quality_rulesets", page)
    if error:
        s.add_client_error("list_data_quality_rulesets", service_error_code=error)
    s.activate()
    return s


def _walk(client, **kw):
    return paginate_bounded_manual(
        client, "list_data_quality_rulesets", "Rulesets", MaxResults=1000, **kw
    )


# --- the premise this path exists for --------------------------------------------


def test_the_operation_really_is_not_paginable(glue):
    """If botocore ever adds a paginator for this op, the manual walk should be retired.

    Asserted rather than assumed: `paginate_bounded` raises on a non-paginable op, so this
    is the fact that decides which function the caller must use.
    """
    assert glue.can_paginate("list_data_quality_rulesets") is False
    with pytest.raises(ValueError, match="not paginable"):
        paginate_bounded(glue, "list_data_quality_rulesets", "Rulesets")


# --- completeness ----------------------------------------------------------------


def test_threads_the_token_to_the_end_and_reports_an_exact_total(glue):
    """The bug in one assertion: the second page has to be read.

    The predecessor called `list_data_quality_rulesets(MaxResults=50)` once and treated the
    result as the whole catalog.
    """
    with _stub(glue, [
        {"Rulesets": [_ruleset(1), _ruleset(2)], "NextToken": "t1"},
        {"Rulesets": [_ruleset(3)]},
    ]):
        result = _walk(glue)

    assert len(result.items) == 3
    assert result.complete
    assert result.note is None


def test_the_token_is_sent_back_under_its_real_parameter_name(glue):
    s = Stubber(glue)
    s.add_response(
        "list_data_quality_rulesets",
        {"Rulesets": [_ruleset(1)], "NextToken": "t1"},
        {"MaxResults": 1000},
    )
    s.add_response(
        "list_data_quality_rulesets",
        {"Rulesets": [_ruleset(2)]},
        {"MaxResults": 1000, "NextToken": "t1"},
    )
    with s:
        result = _walk(glue)

    assert len(result.items) == 2       # Stubber asserts both parameter sets matched
    assert result.complete


def test_empty_list_is_a_complete_measured_zero(glue):
    """A reachable Glue returning nothing IS live data. It must not look truncated, and a
    caller must be able to cache it."""
    with _stub(glue, [{"Rulesets": []}]):
        result = _walk(glue)

    assert result.items == []
    assert result.complete
    assert result.note is None
    assert result.failed is False


# --- truncation, disclosed -------------------------------------------------------


def test_bound_below_the_real_total_is_reported_as_a_floor(glue):
    with _stub(glue, [
        {"Rulesets": [_ruleset(1), _ruleset(2)], "NextToken": "t1"},
        {"Rulesets": [_ruleset(3), _ruleset(4)], "NextToken": "t2"},
    ]):
        result = _walk(glue, max_items=2)

    assert len(result.items) == 2
    assert result.truncated is True
    assert not result.complete
    assert "floor" in result.note


def test_bound_equal_to_real_total_emits_no_caveat(glue):
    """The regression that matters most: claiming truncation that did not happen.

    The bound lands exactly on the total, which from inside the loop is indistinguishable
    from truncation. The only honest discriminator is that the last response carried no
    token.
    """
    with _stub(glue, [
        {"Rulesets": [_ruleset(1), _ruleset(2)], "NextToken": "t1"},
        {"Rulesets": [_ruleset(3)]},
    ]):
        result = _walk(glue, max_items=3)

    assert len(result.items) == 3
    assert result.truncated is False
    assert result.complete
    assert result.note is None


def test_a_page_that_overshoots_the_bound_is_still_a_floor(glue):
    """No token remained, but the slice discards rulesets that really exist."""
    with _stub(glue, [{"Rulesets": [_ruleset(i) for i in range(5)]}]):
        result = _walk(glue, max_items=3)

    assert len(result.items) == 3
    assert result.truncated is True
    assert "floor" in result.note


def test_expired_budget_stops_the_walk_and_says_so(glue):
    """budget_s=0 expires immediately, so the walk stops after the first page.

    Reporting that as `timed_out` rather than complete is the point: 2 rulesets read is not
    the same claim as 2 rulesets existing.
    """
    with _stub(glue, [{"Rulesets": [_ruleset(1), _ruleset(2)], "NextToken": "t1"}]):
        result = _walk(glue, budget_s=0)

    assert len(result.items) == 2
    assert result.timed_out is True
    assert not result.complete
    assert "floor" in result.note


def test_a_walk_that_finishes_as_the_budget_expires_is_still_complete(glue):
    """The completion test runs BEFORE the deadline test, so a list that ends on the last
    tick is a total. Ordering them the other way would hedge every fast, complete walk on a
    loaded host."""
    with _stub(glue, [{"Rulesets": [_ruleset(1)]}]):
        result = _walk(glue, budget_s=0)

    assert result.complete
    assert result.note is None


# --- failure is not emptiness ----------------------------------------------------


def test_failure_is_marked_rather_than_returning_a_measured_zero(glue):
    """A zero caused by AccessDenied says nothing about the account, so it must be
    distinguishable from a real zero by something other than truthiness."""
    with _stub(glue, [], error="AccessDeniedException"):
        result = _walk(glue)

    assert result.failed is True
    assert result.items == []
    assert not result.complete
    assert PAGE_FAILED_MARKER in result.note


def test_partial_results_survive_a_mid_walk_failure(glue):
    with _stub(glue, [{"Rulesets": [_ruleset(1)], "NextToken": "t1"}],
               error="ThrottlingException"):
        result = _walk(glue)

    assert len(result.items) == 1
    assert result.failed is True
    assert not result.complete


def test_param_validation_error_propagates(glue):
    """It subclasses BotoCoreError, so a broad handler would report a bug in OUR request as
    an AWS-side outage and degrade honestly to the wrong conclusion."""
    with pytest.raises(ParamValidationError):
        paginate_bounded_manual(
            glue, "list_data_quality_rulesets", "Rulesets", NotARealParameter="x"
        )
