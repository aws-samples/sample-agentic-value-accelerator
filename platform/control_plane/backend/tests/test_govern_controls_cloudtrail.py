"""The CloudTrail control evaluation must not report a ceiling as a measurement.

`_evaluate_cloudtrail` used to read ONE 50-event page per event source and sum them, so
`total_events` could never exceed 100 however busy the account was, and that hard ceiling
was published as "N events in last 24h" at confidence 0.95 under a Live badge. It also
swallowed every CloudTrail failure with a bare `except ...: pass`, so a lookup that failed
on every single request produced the sentence "0 events in last 24h" - a number nobody
measured, presented as a measurement.

These tests pin the three outcomes apart, because they are three different claims:

  * complete walk  -> an exact count, and `note` stays None
  * bounded walk   -> a floor, and the evidence has to say "at least"
  * failed lookup  -> NO number at all, because zero-observed is not zero-existing

`GovernControlsService._clients` is a plain dict of lazily created boto3 clients, so a fake
can be injected into it directly. No patching required.
"""

import pytest

from botocore.exceptions import ClientError, ParamValidationError

from models.govern_controls import EvaluationStatus
from services.govern_controls_service import GovernControlsService

CT_SOURCES = ("bedrock.amazonaws.com", "sagemaker.amazonaws.com")


class FakeCloudTrail:
    """Minimal CloudTrail double: one active trail, plus a scripted lookup_events."""

    def __init__(self, lookup):
        self._lookup = lookup
        self.lookup_calls = 0

    def describe_trails(self):
        return {"trailList": [{"Name": "ava-demo-trail"}]}

    def get_trail_status(self, Name):
        return {"IsLogging": True}

    def lookup_events(self, **kwargs):
        self.lookup_calls += 1
        return self._lookup(kwargs)


def _service(lookup):
    svc = GovernControlsService(region="us-east-1")
    fake = FakeCloudTrail(lookup)
    svc._clients["cloudtrail"] = fake
    return svc, fake


def test_complete_walk_reports_an_exact_count_with_no_caveat():
    """A count that really is a total must not carry a floor caveat.

    Emitting one anyway would be its own dishonesty, and an unfalsifiable one: a reader
    cannot tell a reflexive caveat from a real one.
    """
    svc, fake = _service(lambda kw: {"Events": [{"EventName": "ListFoundationModels"}] * 7})

    result = svc._evaluate_cloudtrail("CT-1")

    assert result.status == EvaluationStatus.PASS
    assert result.details["events_24h"] == 14          # 7 per source, both walked to the end
    assert result.details["events_24h_is_floor"] is False
    assert result.details["note"] is None
    assert "at least" not in result.evidence
    assert "14 AI service API calls" in result.evidence


def test_bounded_walk_is_disclosed_as_a_floor():
    """Every page carries a NextToken, so the walk stops on the page cap, not the data."""
    svc, fake = _service(
        lambda kw: {"Events": [{"EventName": "InvokeAgent"}] * 50, "NextToken": "more"}
    )

    result = svc._evaluate_cloudtrail("CT-1")

    assert result.status == EvaluationStatus.PASS
    assert result.details["events_24h_is_floor"] is True
    assert "at least" in result.evidence
    assert "floor" in result.details["note"]
    # The old code summed a single page per source and would have said exactly 100.
    assert result.details["events_24h"] > 100


def test_failed_lookup_yields_no_number_rather_than_zero():
    """The regression that matters most: a failure must not read as a quiet account."""

    def boom(kw):
        raise ClientError(
            {"Error": {"Code": "AccessDeniedException", "Message": "denied"}},
            "LookupEvents",
        )

    svc, fake = _service(boom)

    result = svc._evaluate_cloudtrail("CT-1")

    # The trail IS active, so the control still passes - that part was never in doubt.
    assert result.status == EvaluationStatus.PASS
    assert result.details["events_24h"] is None
    assert "unavailable" in result.evidence
    assert "0 AI service API calls" not in result.evidence
    assert "CloudTrail lookup failed" in result.details["note"]


def test_malformed_request_is_not_reported_as_a_cloudtrail_outage():
    """ParamValidationError subclasses BotoCoreError, so the broad handler at the bottom of
    _evaluate_cloudtrail would have turned a bug in OUR request into "CloudTrail
    unavailable" - degrading honestly to a conclusion that is wrong for an invisible
    reason."""

    def malformed(kw):
        raise ParamValidationError(report="MaxResults is not an integer")

    svc, fake = _service(malformed)

    with pytest.raises(ParamValidationError):
        svc._evaluate_cloudtrail("CT-1")


def test_trail_status_failure_is_logged_not_silently_dropped(caplog):
    """A trail whose status cannot be read drops out of active_trails, which can flip this
    control to FAIL. Failing closed is defensible; doing it silently is not."""

    class StatusBroken(FakeCloudTrail):
        def get_trail_status(self, Name):
            raise ClientError(
                {"Error": {"Code": "ThrottlingException", "Message": "slow down"}},
                "GetTrailStatus",
            )

    svc = GovernControlsService(region="us-east-1")
    svc._clients["cloudtrail"] = StatusBroken(lambda kw: {"Events": []})

    with caplog.at_level("WARNING"):
        result = svc._evaluate_cloudtrail("CT-1")

    assert result.status == EvaluationStatus.FAIL       # no trail provably logging
    # getMessage() applies the lazy %-args; r.message alone is unformatted.
    assert any("get_trail_status failed" in r.getMessage() for r in caplog.records)


def test_both_event_sources_are_queried():
    """The control speaks for Bedrock AND SageMaker; querying one and reporting both would
    understate the estate."""
    seen = []

    def record(kw):
        seen.append(kw["LookupAttributes"][0]["AttributeValue"])
        return {"Events": []}

    svc, fake = _service(record)
    svc._evaluate_cloudtrail("CT-1")

    assert set(seen) == set(CT_SOURCES)
