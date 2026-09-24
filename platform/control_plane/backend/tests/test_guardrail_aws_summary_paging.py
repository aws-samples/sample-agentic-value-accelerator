"""Tests for GET /guardrails/aws-summary, where a truncated listing invents drift.

This route is the user-visible twin of reconcile_orphans. It ran
`list_guardrails(maxResults=50)` with no paging against an API maximum of 1000, and then
computed a set difference in both directions from the result.

The undercount of `aws_total` is the mild part. The real damage is
`orphaned = tracked_ids - aws_ids`: the 51st guardrail onward is simply missing from
`aws_ids`, so a LIVE guardrail's template row is reported as pointing at nothing, `in_sync`
flips to false, and `drift_note` explains at length that enforcement is over-reported. Every
one of those statements is manufactured by the page size.

The route function is called directly rather than through TestClient: the only thing under
test is the arithmetic on the listing, and FastAPI's dependency injection would drag in RBAC
and a real DynamoDB-backed service for no added coverage.

The load-bearing negative test is `test_a_complete_listing_reports_drift_normally`: a
complete read must still produce a definite in_sync verdict and a null listing_note.
"""

import asyncio
from datetime import datetime

import boto3
import pytest
from botocore.stub import Stubber

import api.routes.guardrails as route
from models.guardrail import GuardrailStatus, GuardrailTemplate
from services.guardrail_service import GuardrailService


def _bedrock():
    return boto3.client(
        "bedrock",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _summary(i: int) -> dict:
    return {
        "id": f"gr{i}",
        "arn": f"arn:aws:bedrock:us-east-1:000000000000:guardrail/gr{i}",
        "status": "READY",
        "name": f"guardrail-{i}",
        "version": "DRAFT",
        "createdAt": datetime(2026, 1, 1),
        "updatedAt": datetime(2026, 1, 1),
    }


def _template(gid: str, status=GuardrailStatus.ACTIVE) -> GuardrailTemplate:
    t = GuardrailTemplate(
        name=f"row-{gid}",
        description=f"template row for {gid}",
        guardrail_id=gid,
    )
    t.status = status
    return t


@pytest.fixture
def svc(monkeypatch):
    """A GuardrailService with no DynamoDB, installed as the route module's singleton."""
    s = GuardrailService.__new__(GuardrailService)
    s.bedrock_client = _bedrock()
    s.list_templates = lambda auto_sync=True: []
    monkeypatch.setattr(route, "_svc", s)
    return s


def _call():
    return asyncio.run(route.get_aws_guardrails_summary(_=None))


def _stub(client, pages, error=None):
    s = Stubber(client)
    for page in pages:
        s.add_response("list_guardrails", page)
    if error:
        s.add_client_error("list_guardrails", service_error_code=error)
    s.activate()
    return s


# --- the fabrication ---------------------------------------------------------------


def test_a_truncated_listing_does_not_invent_orphans(svc):
    """gr1..gr3 all exist in AWS and all have rows. Nothing is orphaned.

    With a bound of 2, gr3 falls past it. The old code would report orphaned_templates=1 and
    in_sync=false for a perfectly synchronised account.
    """
    svc.list_templates = lambda auto_sync=True: [
        _template("gr1"), _template("gr2"), _template("gr3")
    ]
    with _stub(svc.bedrock_client, [
        {"guardrails": [_summary(1), _summary(2)], "nextToken": "t1"},
        {"guardrails": [_summary(3)], "nextToken": "t2"},
    ]):
        with pytest.MonkeyPatch.context() as mp:
            # raising=True on purpose: if the bound stops being a named module constant
            # this test must fail loudly rather than silently stop bounding anything.
            mp.setattr(route, "_GUARDRAIL_MAX_ITEMS", 2)
            body = _call()

    assert body["orphaned_templates"] is None      # withheld, not asserted as 0
    assert body["orphaned_ids"] == []
    assert body["in_sync"] is None                 # not knowable, so not claimed
    assert body["aws_total_is_floor"] is True
    assert "floor" in body["listing_note"]
    assert "withheld" in body["drift_note"]


def test_pages_beyond_the_first_are_read(svc):
    """The fix in one assertion: gr3 is on page two and must count as existing in AWS."""
    svc.list_templates = lambda auto_sync=True: [
        _template("gr1"), _template("gr2"), _template("gr3")
    ]
    with _stub(svc.bedrock_client, [
        {"guardrails": [_summary(1), _summary(2)], "nextToken": "t1"},
        {"guardrails": [_summary(3)]},
    ]):
        body = _call()

    assert body["aws_total"] == 3
    assert body["aws_total_is_floor"] is False
    assert body["orphaned_templates"] == 0
    assert body["in_sync"] is True
    assert body["listing_note"] is None
    assert body["drift_note"] is None


# --- and the negative cases, which keep the disclosure meaningful -------------------


def test_a_complete_listing_reports_drift_normally(svc):
    """Real drift in both directions still has to be reported, with no hedging."""
    svc.list_templates = lambda auto_sync=True: [_template("gr1"), _template("gone")]
    with _stub(svc.bedrock_client, [{"guardrails": [_summary(1), _summary(2)]}]):
        body = _call()

    assert body["aws_total"] == 2
    assert body["untracked_in_aws"] == 1
    assert body["untracked_ids"] == ["gr2"]
    assert body["orphaned_templates"] == 1
    assert body["orphaned_ids"] == ["gone"]
    assert body["in_sync"] is False
    assert body["listing_note"] is None
    assert "no template row" in body["drift_note"]
    assert "withheld" not in body["drift_note"]


def test_a_clean_account_emits_no_drift_note(svc):
    svc.list_templates = lambda auto_sync=True: [_template("gr1")]
    with _stub(svc.bedrock_client, [{"guardrails": [_summary(1)]}]):
        body = _call()

    assert body["in_sync"] is True
    assert body["drift_note"] is None
    assert body["listing_note"] is None


def test_deleted_rows_stay_out_of_the_comparison(svc):
    """Pre-existing behaviour, pinned: a closed row keeps its guardrail_id, so counting it
    would re-report the same orphan forever and make reconciliation look ineffective."""
    svc.list_templates = lambda auto_sync=True: [
        _template("gr1"), _template("gone", GuardrailStatus.DELETED)
    ]
    with _stub(svc.bedrock_client, [{"guardrails": [_summary(1)]}]):
        body = _call()

    assert body["closed_rows"] == 1
    assert body["orphaned_templates"] == 0
    assert body["in_sync"] is True


# --- failure is not a measurement ---------------------------------------------------


def test_a_failed_listing_returns_null_rather_than_a_measured_zero(svc):
    """`aws_total: 0` from an AccessDenied is indistinguishable from an account with no
    guardrails, and would read as one. null plus a note is the honest form."""
    svc.list_templates = lambda auto_sync=True: [_template("gr1")]
    with _stub(svc.bedrock_client, [], error="AccessDeniedException"):
        body = _call()

    assert body["aws_total"] is None
    assert body["in_sync"] is None
    assert body["orphaned_templates"] is None
    assert "AccessDenied" in body["listing_note"]
