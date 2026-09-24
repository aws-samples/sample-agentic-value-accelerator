"""Tests for the guardrail listing that drives reconcile_orphans.

Everywhere else in this sweep, a truncated list produces a wrong NUMBER. Here it produces a
wrong WRITE. `reconcile_orphans` computes `tracked - aws_ids` and, with dry_run=False, marks
each difference DELETED in DynamoDB. The read was `list_guardrails(maxResults=100)` with no
paging against an API maximum of 1000, so on an account with more than one page every
guardrail past the truncation point looks absent from AWS and its live row gets closed.

The guard that existed only fired on an EMPTY result (`if not aws_ids`), which is the one
failure mode a truncated read never has: a truncated read comes back full.

Stubber is used against the real bedrock service model rather than a hand-written fake,
because the claim under test is about a real operation's paging shape. The test that matters
most is the NEGATIVE one: `test_a_complete_listing_that_lands_on_the_bound_still_reconciles`
pins that an exact read does not acquire a floor caveat and does not abort, since a guard
that fires when nothing is wrong gets switched off.
"""

from datetime import datetime

import boto3
from botocore.stub import Stubber

from models.guardrail import GuardrailStatus, GuardrailTemplate
from services.guardrail_service import GuardrailService


class _RecordingTable:
    """Stands in for the DynamoDB table so a wrongly-closed row is observable."""

    def __init__(self):
        self.writes = []

    def put_item(self, Item):  # noqa: N803 - boto3's own parameter name
        self.writes.append(Item)


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


def _bedrock():
    return boto3.client(
        "bedrock",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _service(templates, client=None):
    """A GuardrailService with no DynamoDB and no auto-sync.

    __new__ skips __init__ deliberately: __init__ builds a DynamoDB resource, a CloudWatch
    client and may auto-sync, none of which this behaviour depends on. Only the three
    attributes reconcile_orphans actually touches are supplied.
    """
    svc = GuardrailService.__new__(GuardrailService)
    svc.bedrock_client = client or _bedrock()
    svc.table = _RecordingTable()
    svc.list_templates = lambda auto_sync=True: templates
    return svc


def _template(gid: str) -> GuardrailTemplate:
    t = GuardrailTemplate(
        name=f"row-{gid}",
        description=f"template row for {gid}",
        guardrail_id=gid,
    )
    t.status = GuardrailStatus.ACTIVE
    return t


def _stub(client, pages, error=None):
    s = Stubber(client)
    for page in pages:
        s.add_response("list_guardrails", page)
    if error:
        s.add_client_error("list_guardrails", service_error_code=error)
    s.activate()
    return s


# --- the write this protects -------------------------------------------------------


def test_a_truncated_listing_aborts_instead_of_closing_live_rows():
    """The bug, as a write. gr3 exists in AWS but sits past the bound.

    Under the old code aws_ids would be {gr1, gr2}, gr3's row would be diffed as an orphan,
    and with dry_run=False its row would be marked DELETED while the guardrail is live.
    """
    svc = _service([_template("gr1"), _template("gr2"), _template("gr3")])
    with _stub(svc.bedrock_client, [
        {"guardrails": [_summary(1), _summary(2)], "nextToken": "t1"},
        {"guardrails": [_summary(3)], "nextToken": "t2"},
    ]):
        result = svc.reconcile_orphans(dry_run=False)

    assert result["aborted"] is True
    assert result["orphans"] == []
    assert result["updated"] == []
    assert svc.table.writes == []          # nothing was closed
    assert "did not complete" in result["reason"]


def test_a_failed_listing_aborts_and_says_the_read_failed():
    svc = _service([_template("gr1")])
    with _stub(svc.bedrock_client, [], error="AccessDeniedException"):
        result = svc.reconcile_orphans(dry_run=False)

    assert result["aborted"] is True
    assert svc.table.writes == []
    assert "AccessDenied" in result["reason"]


def test_an_empty_listing_still_aborts():
    """Pre-existing guard, kept: an empty result is indistinguishable from a wrong region."""
    svc = _service([_template("gr1")])
    with _stub(svc.bedrock_client, [{"guardrails": []}]):
        result = svc.reconcile_orphans(dry_run=False)

    assert result["aborted"] is True
    assert svc.table.writes == []
    assert "returned nothing" in result["reason"]


# --- and the negative case, which is the one that keeps the guard usable -----------


def test_a_complete_listing_that_lands_on_the_bound_still_reconciles():
    """Three guardrails, a bound of exactly three. Complete, so no abort and no caveat.

    From inside the walk this is indistinguishable from truncation; the only honest
    discriminator is that the final response carried no token. Getting this wrong would
    abort every reconcile on an account whose guardrail count happened to equal the bound,
    and an aborting-for-no-reason guard is a guard that gets removed.
    """
    svc = _service([_template("gr1"), _template("gr2"), _template("gr3"), _template("gone")])
    with _stub(svc.bedrock_client, [
        {"guardrails": [_summary(1), _summary(2)], "nextToken": "t1"},
        {"guardrails": [_summary(3)]},
    ]):
        result = svc.reconcile_orphans(dry_run=False)

    assert result["aborted"] is False
    assert result["aws_guardrails"] == 3
    assert [o["guardrail_id"] for o in result["orphans"]] == ["gone"]
    assert len(svc.table.writes) == 1
    assert svc.table.writes[0]["status"] == GuardrailStatus.DELETED.value


def test_pages_beyond_the_first_are_actually_read():
    """The fix in one assertion: gr3 is on page two and must count as present in AWS."""
    svc = _service([_template("gr3")])
    with _stub(svc.bedrock_client, [
        {"guardrails": [_summary(1), _summary(2)], "nextToken": "t1"},
        {"guardrails": [_summary(3)]},
    ]):
        result = svc.reconcile_orphans(dry_run=True)

    assert result["aborted"] is False
    assert result["orphans"] == []
    assert svc.table.writes == []


def test_dry_run_reports_orphans_without_writing():
    svc = _service([_template("gr1"), _template("gone")])
    with _stub(svc.bedrock_client, [{"guardrails": [_summary(1)]}]):
        result = svc.reconcile_orphans(dry_run=True)

    assert result["aborted"] is False
    assert [o["guardrail_id"] for o in result["orphans"]] == ["gone"]
    assert result["updated"] == []
    assert svc.table.writes == []


def test_deleted_rows_are_not_rediscovered_as_orphans():
    """Pre-existing behaviour, pinned because reconcile is now called more often: a closed
    row still carries its guardrail_id, so counting it would re-report the same orphan
    forever."""
    closed = _template("gone")
    closed.status = GuardrailStatus.DELETED
    svc = _service([_template("gr1"), closed])
    with _stub(svc.bedrock_client, [{"guardrails": [_summary(1)]}]):
        result = svc.reconcile_orphans(dry_run=True)

    assert result["orphans"] == []


# --- the page size that started it -------------------------------------------------


def test_the_page_size_asked_for_is_the_api_maximum():
    """Stubber asserts the expected parameters, so this pins maxResults=1000.

    The original 100 was legal and silently one-page. 1000 is the real maximum on the
    botocore service model; asserting it here is what stops the value drifting back to a
    round number nobody revisits.
    """
    client = _bedrock()
    s = Stubber(client)
    s.add_response(
        "list_guardrails",
        {"guardrails": [_summary(1)]},
        {"maxResults": 1000},
    )
    svc = _service([_template("gr1")], client=client)
    with s:
        result = svc.reconcile_orphans(dry_run=True)

    assert result["aborted"] is False   # Stubber asserted the parameter set matched


def test_list_guardrails_is_paginable_so_the_paginator_path_is_the_right_one():
    """If this ever flips, paginate_bounded raises rather than silently reading one page,
    and the manual walk would be needed instead."""
    assert _bedrock().can_paginate("list_guardrails") is True


def test_the_api_maximum_is_what_the_service_model_says():
    """Pins the 1000 to the service model rather than to a comment, so a future edit that
    lowers it to a round number has to argue with a failing test."""
    shape = _bedrock().meta.service_model.operation_model("ListGuardrails").input_shape
    assert shape.members["maxResults"].metadata["max"] == 1000
