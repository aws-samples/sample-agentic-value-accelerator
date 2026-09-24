"""Tests for core.cloudtrail_paging.

These exist because the bug this module fixes was invisible three separate times. Three
Govern services independently asked CloudTrail `LookupEvents` for `MaxResults=500`, took
the first page, and reported it as a whole 30-day window. Nothing caught it:

  - CloudTrail CLAMPS MaxResults to 50 and returns a NextToken. It does not raise.
  - botocore does not reject the over-max value either: its `range_check()` validates a
    parameter's `min` and never its `max`, so the request serialised cleanly.

So the assertions below are not about arithmetic. They pin the distinction between an
answer that is complete and an answer that is a floor, because that distinction is the
only thing standing between a truncated read and a false "no AI tools in use" reported
under a Live badge.

The trickiest case is #5/#6/#7: reaching the caller's requested limit does NOT by itself
mean history was hidden. Emitting a "counts are a floor" caveat when the target simply
landed at or above the real total would be its own dishonesty, and an unfalsifiable one -
a reader cannot tell a real caveat from a reflexive one.
"""

from datetime import datetime, timezone

import pytest
from botocore.exceptions import ClientError, ParamValidationError

from core.cloudtrail_paging import (
    CT_PAGE_SIZE,
    LOOKUP_FAILED_MARKER,
    lookup_events_paged,
)


def _events(n: int) -> list:
    return [{"EventName": "X"} for _ in range(n)]


class FakeCloudTrail:
    """Replays a canned page sequence per attribute value and records every call.

    NextToken is the index of the next page in the sequence, as a string, so a test can
    describe multi-page history without modelling opaque tokens.
    """

    def __init__(self, pages_by_value: dict):
        self.pages_by_value = pages_by_value
        self.calls: list = []

    def lookup_events(self, **kwargs):
        value = kwargs["LookupAttributes"][0]["AttributeValue"]
        self.calls.append(
            {
                "value": value,
                "token": kwargs.get("NextToken"),
                "max_results": kwargs["MaxResults"],
                "key": kwargs["LookupAttributes"][0]["AttributeKey"],
                "start": kwargs.get("StartTime"),
                "end": kwargs.get("EndTime"),
            }
        )
        sequence = self.pages_by_value[value]
        index = 0 if kwargs.get("NextToken") is None else int(kwargs["NextToken"])
        return sequence[index]


@pytest.fixture
def start():
    return datetime.now(timezone.utc)


# --- completeness ----------------------------------------------------------------


def test_single_short_page_is_complete_and_carries_no_note(start):
    """A note of None is load-bearing: it means these counts are totals, not floors."""
    client = FakeCloudTrail({"A": [{"Events": _events(10)}]})
    result = lookup_events_paged(
        client, attribute_key="EventName", attribute_values=["A"], start_time=start
    )
    assert len(result.events) == 10
    assert result.complete
    assert result.note is None


def test_follows_next_token_to_the_end_of_the_window(start):
    """The whole bug in one assertion: the second page has to be read."""
    client = FakeCloudTrail(
        {"A": [{"Events": _events(50), "NextToken": "1"}, {"Events": _events(7)}]}
    )
    result = lookup_events_paged(
        client, attribute_key="EventName", attribute_values=["A"], start_time=start
    )
    assert len(result.events) == 57
    assert result.complete
    assert result.note is None


def test_requests_the_api_ceiling_not_the_callers_optimism(start):
    """An over-max page size is clamped locally and visibly, not silently by the service."""
    client = FakeCloudTrail({"A": [{"Events": _events(1)}]})
    lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        page_size=500,
    )
    assert client.calls[0]["max_results"] == CT_PAGE_SIZE


# --- bounded reads, disclosed ----------------------------------------------------


def test_page_cap_is_reported_as_a_floor(start):
    client = FakeCloudTrail({"A": [{"Events": _events(50), "NextToken": "0"}]})
    result = lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        max_pages=3,
    )
    assert result.capped == ("A",)
    assert not result.complete
    assert "floor" in result.note
    assert len(result.events) == 150       # exactly max_pages pages, then stop


def test_time_budget_stops_the_walk_and_is_disclosed(start):
    """budget_s=0 means the deadline has already passed, so no page is read at all.

    Marking that `capped` rather than `complete` is the point: zero events read is not
    the same claim as zero events existing.
    """
    client = FakeCloudTrail({"A": [{"Events": _events(50), "NextToken": "0"}]})
    result = lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        budget_s=0,
    )
    assert result.capped == ("A",)
    assert result.events == []
    assert not result.complete
    assert client.calls == []


# --- the target-limit distinction ------------------------------------------------


def test_target_reached_with_more_behind_a_token_is_a_floor(start):
    client = FakeCloudTrail(
        {"A": [{"Events": _events(50), "NextToken": "1"}, {"Events": _events(50)}]}
    )
    result = lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        target_per_value=25,
    )
    assert result.at_target == ("A",)
    assert len(result.events) == 25
    assert "floor" in result.note


def test_target_above_the_real_total_emits_no_false_caveat(start):
    """The regression this guards: claiming truncation that did not happen."""
    client = FakeCloudTrail({"A": [{"Events": _events(10)}]})
    result = lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        target_per_value=25,
    )
    assert result.at_target == ()
    assert result.complete
    assert result.note is None
    assert len(result.events) == 10


def test_target_hit_exactly_with_no_more_history_is_exact(start):
    client = FakeCloudTrail({"A": [{"Events": _events(25)}]})
    result = lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        target_per_value=25,
    )
    assert result.complete
    assert result.note is None


def test_overshooting_page_that_gets_sliced_is_a_floor(start):
    """No NextToken, but the slice still discards events that ARE in the window."""
    client = FakeCloudTrail({"A": [{"Events": _events(40)}]})
    result = lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        target_per_value=25,
    )
    assert result.at_target == ("A",)
    assert len(result.events) == 25


# --- failure is not emptiness ----------------------------------------------------


def test_failed_lookup_is_marked_not_swallowed(start):
    """The predecessor logged this at debug and `continue`d, so a lookup that failed on
    every request was invisible and its emptiness read as "no AI activity"."""

    class Boom:
        def lookup_events(self, **kwargs):
            raise ClientError(
                {"Error": {"Code": "AccessDeniedException", "Message": "denied"}},
                "LookupEvents",
            )

    result = lookup_events_paged(
        Boom(), attribute_key="EventName", attribute_values=["A", "B"], start_time=start
    )
    assert set(result.failed) == {"A", "B"}
    assert LOOKUP_FAILED_MARKER in result.note
    assert result.events == []
    assert not result.complete


def test_one_failure_does_not_discard_the_other_values(start):
    """A partial answer is still worth returning - it just has to say it is partial."""

    class HalfBroken:
        def lookup_events(self, **kwargs):
            value = kwargs["LookupAttributes"][0]["AttributeValue"]
            if value == "B":
                raise ClientError(
                    {"Error": {"Code": "ThrottlingException", "Message": "slow down"}},
                    "LookupEvents",
                )
            return {"Events": _events(4)}

    result = lookup_events_paged(
        HalfBroken(),
        attribute_key="EventName",
        attribute_values=["A", "B"],
        start_time=start,
    )
    assert result.failed == ("B",)
    assert len(result.events) == 4
    assert result.by_value["B"] == []
    assert LOOKUP_FAILED_MARKER in result.note


def test_param_validation_error_propagates_instead_of_masquerading(start):
    """ParamValidationError subclasses BotoCoreError, so a broad handler would report a
    malformed request THIS code built as an AWS-side outage - degrading honestly to a
    conclusion that is wrong for a reason nobody can see."""

    class Malformed:
        def lookup_events(self, **kwargs):
            raise ParamValidationError(report="MaxResults is not an integer")

    with pytest.raises(ParamValidationError):
        lookup_events_paged(
            Malformed(),
            attribute_key="EventName",
            attribute_values=["A"],
            start_time=start,
        )


# --- grouping --------------------------------------------------------------------


def test_by_value_grouping_supports_per_source_counts(start):
    """govern_trail_service reports a by_source breakdown, so the flattening has to be
    the caller's choice rather than the helper's."""
    client = FakeCloudTrail(
        {"A": [{"Events": _events(3)}], "B": [{"Events": _events(4)}]}
    )
    result = lookup_events_paged(
        client,
        attribute_key="EventSource",
        attribute_values=["A", "B"],
        start_time=start,
    )
    assert len(result.by_value["A"]) == 3
    assert len(result.by_value["B"]) == 4
    assert len(result.events) == 7
    assert {c["key"] for c in client.calls} == {"EventSource"}


def test_window_is_forwarded_and_end_time_is_omitted_when_absent(start):
    """EndTime must not be sent as None: botocore would reject it, and the resulting
    ParamValidationError would surface as a CloudTrail outage rather than as our bug."""
    end = datetime.now(timezone.utc)

    client = FakeCloudTrail({"A": [{"Events": _events(1)}]})
    lookup_events_paged(
        client,
        attribute_key="EventName",
        attribute_values=["A"],
        start_time=start,
        end_time=end,
    )
    assert client.calls[0]["start"] is start
    assert client.calls[0]["end"] is end

    bare = FakeCloudTrail({"A": [{"Events": _events(1)}]})
    lookup_events_paged(
        bare, attribute_key="EventName", attribute_values=["A"], start_time=start
    )
    assert bare.calls[0]["end"] is None    # i.e. the key was never sent
