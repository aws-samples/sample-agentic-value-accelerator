"""A measured zero from the Operations store is measured data.

Seven read paths in govern_operations_service.py decided provenance with

    live = len(items) > 0

which folds four states into two, and names the wrong one for two of them:

  * the table answered with zero rows        -> live=False, source="memory", note=None
  * the table is missing / denied / throttled -> live=False, source="memory", note=None

Byte-identical, with nothing to tell them apart. The states most likely to be misreported
were the healthy ones: zero SLA breaches, zero pending changes and zero alert rules are all
the DESIRABLE state of a working system, and all three were badged as a broken store.

It also quietly defeated the response cache. `get_or_load(..., should_cache=lambda r:
r.live)` refuses to cache a live=False payload, so a measured zero re-issued its DynamoDB
Query on every single request for as long as the store stayed empty.

The second half of this file covers `_query_read`, which replaced a single-shot Query that
passed `Limit=limit` and dropped `LastEvaluatedKey`. DynamoDB's `Limit` caps what one
request reads, not the result set, so every caller rendering `total=len(items)` was
publishing a page size as a total.

`test_a_partition_of_exactly_the_ceiling_is_not_a_floor` is the negative case and the reason
each page asks for one item MORE than the ceiling: DynamoDB returns a `LastEvaluatedKey`
whenever it stopped on `Limit`, even when the next page would be empty, so the naive check
would stamp a complete count as a floor. A caveat that does not apply is its own dishonesty.
"""

import json
from typing import Any, Dict, List, Optional

import pytest
from botocore.exceptions import ClientError

from core.ttl_cache import clear_all
from models.govern_operations import ChangeStatus
from services.govern_operations_service import (
    GovernOperationsService,
    _MAX_QUERY_PAGES,
)


@pytest.fixture(autouse=True)
def _no_cross_test_cache():
    """The TTL cache is module-level and keyed on table_name, so two tests using the same
    fake table name would otherwise read each other's results - and the query-count
    assertions below would pass or fail depending on test order."""
    clear_all()
    yield
    clear_all()


class FakeTable:
    """A Table whose Query honours `Limit` and `ExclusiveStartKey` the way DynamoDB does.

    Specifically: it sets `LastEvaluatedKey` whenever it stopped because of `Limit`, even
    when nothing follows. That behaviour is the whole reason for the probe row, so faking
    it away would make these tests agree with a bug.
    """

    def __init__(self, rows: List[dict], page_cap: Optional[int] = None):
        self.rows = rows
        self.page_cap = page_cap  # emulate the 1 MB cut: never return more than this
        self.limits_asked: List[int] = []
        self.calls = 0

    def query(self, **kwargs) -> Dict[str, Any]:
        self.calls += 1
        limit = kwargs["Limit"]
        self.limits_asked.append(limit)
        start = kwargs.get("ExclusiveStartKey", {}).get("i", 0)
        take = limit if self.page_cap is None else min(limit, self.page_cap)
        page = self.rows[start : start + take]
        resp: Dict[str, Any] = {"Items": page}
        if page and len(page) == take:
            # The page filled up, so the scan stopped on Limit (or the 1 MB cut) rather than
            # on the end of the partition, and DynamoDB hands back a key - including in the
            # boundary case where the next page turns out to be empty. That boundary is
            # exactly what the probe row exists to resolve, so it must not be faked away.
            resp["LastEvaluatedKey"] = {"i": start + len(page)}
        return resp


class ExplodingTable:
    def query(self, **kwargs):
        raise ClientError(
            {"Error": {"Code": "ResourceNotFoundException", "Message": "no such table"}},
            "Query",
        )


def _svc(monkeypatch, table, table_name="ops-table") -> GovernOperationsService:
    svc = GovernOperationsService(table_name=table_name, region="us-east-2")
    monkeypatch.setattr(svc, "_get_table", lambda: table)
    return svc


def _change_row(idx: int, status: str = "approved") -> dict:
    return {
        "pk": "CHANGE",
        "sk": f"2026-09-0{(idx % 9) + 1}T00:00:00#chg-{idx}",
        "id": f"chg-{idx}",
        "data": json.dumps(
            {
                "id": f"chg-{idx}",
                "title": f"change {idx}",
                "change_type": "deployment",
                "status": status,
                "requested_by": "tester",
                "requested_at": "2026-09-13T00:00:00",
            }
        ),
    }


# --- the four arms -------------------------------------------------------------------


def test_an_empty_but_readable_table_is_live(monkeypatch):
    """The bug. A table that answered with zero rows measured something."""
    svc = _svc(monkeypatch, FakeTable(rows=[]))

    resp = svc.get_alert_rules()

    assert resp.total == 0
    assert resp.live is True
    assert resp.source == "dynamodb"
    assert "measured zero" in resp.note


def test_an_unreadable_table_is_not_live(monkeypatch):
    """The negative case. The fix must not badge a failed read as a measurement."""
    svc = _svc(monkeypatch, ExplodingTable())

    resp = svc.get_alert_rules()

    assert resp.live is False
    assert resp.source == "memory"
    assert "unreachable" in resp.note
    assert "ops-table" in resp.note and "us-east-2" in resp.note


def test_an_unconfigured_table_says_so_rather_than_unreachable(monkeypatch):
    """Third arm. "Not provisioned" and "you never set the env var" are different facts."""
    svc = _svc(monkeypatch, FakeTable(rows=[]), table_name="")

    resp = svc.get_alert_rules()

    assert resp.live is False
    assert resp.source == "not-configured"
    assert "GOVERN_OPERATIONS_TABLE_NAME" in resp.note


def test_rows_returned_carry_no_caveat(monkeypatch):
    """Fourth arm. A complete read of a non-empty partition has nothing to disclose."""
    svc = _svc(monkeypatch, FakeTable(rows=[_change_row(0), _change_row(1)]))

    resp = svc.list_changes(days=365)

    assert resp.total == 2
    assert resp.live is True
    assert resp.source == "dynamodb"
    assert resp.note is None


def test_a_measured_zero_is_cacheable(monkeypatch):
    """Why `live` mattered beyond the badge: should_cache=lambda r: r.live.

    A live=False measured zero re-queried DynamoDB on every request. Two calls, one query.
    """
    table = FakeTable(rows=[])
    svc = _svc(monkeypatch, table)

    first = svc.list_changes(days=30)
    second = svc.list_changes(days=30)

    assert first.live is True and second.live is True
    assert table.calls == 1, "a measured zero must be cacheable"


def test_an_empty_approval_queue_from_stored_rows_is_a_real_zero(monkeypatch):
    """Nothing pending is the desirable state, so it is the one most worth reporting."""
    svc = _svc(monkeypatch, FakeTable(rows=[_change_row(i) for i in range(3)]))

    resp = svc.get_pending_changes()

    assert resp.total == 0
    assert resp.live is True
    assert "real zero" in resp.note
    assert "3 change record(s) are stored" in resp.note


def test_pending_rows_are_still_returned(monkeypatch):
    """Guard against the note above being emitted when the queue is not in fact empty."""
    rows = [_change_row(0), _change_row(1, status=ChangeStatus.PENDING.value)]
    svc = _svc(monkeypatch, FakeTable(rows=rows))

    resp = svc.get_pending_changes()

    assert resp.total == 1
    assert resp.live is True
    assert resp.note is None


# --- memory must never be served as live -----------------------------------------------


def test_unpersisted_rows_are_unioned_in_and_disclosed(monkeypatch):
    """The mirror-image trap the fix opens up.

    Once an empty-but-readable table is live, the obvious `rows if read.items else
    mem.copy()` would serve unpersisted in-memory rows under a Live badge. `_store_rows`
    unions them into the live list instead - dropping them would make a just-created record
    vanish - and names them in the note.
    """
    from models.govern_operations import ChangeRecord

    svc = _svc(monkeypatch, FakeTable(rows=[]))
    svc._mem_changes.append(
        ChangeRecord(
            title="never written", change_type="deployment", requested_by="tester"
        )
    )

    resp = svc.list_changes(days=365)

    assert resp.total == 1, "an unpersisted record must not silently disappear"
    assert resp.live is True, "the DynamoDB read itself was a measurement"
    assert "never written to 'ops-table'" in resp.note
    assert "lost on restart" in resp.note


def test_a_failed_read_still_falls_back_to_memory(monkeypatch):
    """And when the read failed, memory is all there is - reported as not live."""
    from models.govern_operations import ChangeRecord

    svc = _svc(monkeypatch, ExplodingTable())
    svc._mem_changes.append(ChangeRecord(title="held", change_type="deployment", requested_by="tester"))

    resp = svc.list_changes(days=365)

    assert resp.total == 1
    assert resp.live is False
    assert resp.source == "memory"


# --- paging --------------------------------------------------------------------------


def test_the_read_pages_past_the_first_response(monkeypatch):
    """A partition served in 1 MB slices is read whole, not to the first page."""
    table = FakeTable(rows=[_change_row(i) for i in range(12)], page_cap=5)
    svc = _svc(monkeypatch, table)

    resp = svc.list_changes(days=365)

    assert resp.total == 12
    assert table.calls > 1, "one call means LastEvaluatedKey was ignored again"
    assert resp.note is None, "a complete read has nothing to caveat"


def test_a_partition_of_exactly_the_ceiling_is_not_a_floor(monkeypatch):
    """The negative case, and the reason for the probe row.

    DynamoDB returns a LastEvaluatedKey whenever it stopped on `Limit`, so a partition
    holding exactly the ceiling would be reported as truncated by a naive check - a caveat
    that does not apply and cannot be falsified from the response.
    """
    table = FakeTable(rows=[_change_row(i) for i in range(50)])
    svc = _svc(monkeypatch, table)

    read = svc._query_read(svc.PK_CHANGE, max_items=50)

    assert len(read.items) == 50
    assert read.truncated is False
    assert read.complete is True


def test_a_partition_past_the_ceiling_is_reported_as_a_floor(monkeypatch):
    table = FakeTable(rows=[_change_row(i) for i in range(51)])
    svc = _svc(monkeypatch, table)

    read = svc._query_read(svc.PK_CHANGE, max_items=50)

    assert len(read.items) == 50, "the probe row is trimmed off, not published"
    assert read.truncated is True
    assert read.complete is False


def test_the_floor_reaches_the_response_note(monkeypatch):
    """A ceiling is a deliberate bound; publishing it as an exact total is the defect."""
    svc = _svc(monkeypatch, FakeTable(rows=[_change_row(i) for i in range(600)]))

    resp = svc.list_changes(days=365, limit=10)

    assert resp.live is True
    assert "floor rather than a total" in resp.note
    assert "500" in resp.note


def test_the_first_page_asks_for_one_more_than_the_ceiling(monkeypatch):
    """Pinned because the +1 is what makes `truncated` exact, and reads as an off-by-one."""
    table = FakeTable(rows=[])
    svc = _svc(monkeypatch, table)

    svc._query_read(svc.PK_CHANGE, max_items=200)

    assert table.limits_asked == [201]


def test_later_pages_never_overshoot_the_ceiling(monkeypatch):
    """Rows past the ceiling would be read capacity paid for and then discarded."""
    table = FakeTable(rows=[_change_row(i) for i in range(30)], page_cap=4)
    svc = _svc(monkeypatch, table)

    svc._query_read(svc.PK_CHANGE, max_items=10)

    # 4 + 4 + 3 rows; the asks shrink toward the ceiling rather than repeating it.
    assert table.limits_asked[0] == 11
    assert all(a <= 11 for a in table.limits_asked)
    assert table.limits_asked[-1] < table.limits_asked[0]


def test_an_empty_page_with_a_key_cannot_spin_forever(monkeypatch):
    """Forward-progress guard. Hitting it is reported as truncated, never as complete."""

    class NeverEnding:
        def __init__(self):
            self.calls = 0

        def query(self, **kwargs):
            self.calls += 1
            return {"Items": [], "LastEvaluatedKey": {"i": self.calls}}

    table = NeverEnding()
    svc = _svc(monkeypatch, table)

    read = svc._query_read(svc.PK_CHANGE, max_items=100)

    assert table.calls == _MAX_QUERY_PAGES
    assert read.items == []
    assert read.truncated is True
    assert read.complete is False


def test_a_failed_read_is_not_a_complete_empty_one(monkeypatch):
    svc = _svc(monkeypatch, ExplodingTable())

    read = svc._query_read(svc.PK_CHANGE, max_items=100)

    assert read.items == []
    assert read.failed is True
    assert read.complete is False


# --- SLA targets, which had the same defect one level down ----------------------------


def test_no_sla_targets_defined_is_a_measurement(monkeypatch):
    """_load_sla_targets inferred live from `if items:` too, and a comment in _fetch_slas
    named it as a known-open defect. It reports the store honestly now."""
    svc = _svc(monkeypatch, FakeTable(rows=[]))

    targets, live, source, note = svc._load_sla_targets()

    assert targets == []
    assert live is True
    assert source == "dynamodb"
    assert "measured zero" in note


def test_sla_list_carries_the_store_note(monkeypatch):
    svc = _svc(monkeypatch, FakeTable(rows=[]))

    resp = svc.list_slas()

    assert resp.live is True
    assert "measured zero" in resp.note
    assert "nothing to evaluate" in resp.note


# --- on-call, where the truthiness was on the wrong list entirely ---------------------


def test_a_stored_rota_with_nobody_on_call_now_is_live(monkeypatch):
    """`live = len(shifts) > 0` read the post-fallback list, so it could badge memory as
    live; and a real gap in coverage - the one thing a reader must act on - as no data."""
    svc = _svc(monkeypatch, FakeTable(rows=[]))

    resp = svc.get_current_oncall()

    assert resp.primary is None
    assert resp.live is True
    assert resp.source == "dynamodb"
    assert "measured zero" in resp.note
    assert "PAGERDUTY_API_KEY" in resp.note


def test_a_pagerduty_outage_is_not_published_as_a_clean_read(monkeypatch):
    """With a key configured the note used to resolve to None, so falling back to the
    locally stored rota after a PagerDuty failure looked like a normal DynamoDB read."""
    svc = GovernOperationsService(
        table_name="ops-table", region="us-east-2", pagerduty_api_key="pd-key"
    )
    monkeypatch.setattr(svc, "_get_table", lambda: FakeTable(rows=[]))

    def boom():
        raise RuntimeError("pagerduty 503")

    monkeypatch.setattr(svc, "_fetch_pagerduty_oncall", boom)

    resp = svc.get_current_oncall()

    assert "PagerDuty is configured but did not answer" in resp.note
    assert "locally stored rota" in resp.note


def test_an_unmeasured_error_budget_is_null_not_a_full_one(monkeypatch):
    """`float = 100.0` reported a FULL error budget remaining for the case where nothing was
    measured - the most reassuring value available for the least informative state. A note
    said so, but a note beside a number does not stop the number being read."""
    svc = _svc(monkeypatch, FakeTable(rows=[]))

    resp = svc.get_sla_compliance_report(days=30)

    assert resp.slas == []
    assert resp.avg_error_budget_remaining_pct is None
    assert "null rather than a stand-in value" in resp.note


def test_the_two_sla_views_agree_about_provenance(monkeypatch):
    """`source if budgets else "none"` made /sla and /sla/error-budgets disagree.

    Same read, same table, same moment: the list said source="dynamodb" and the budget view
    said "none" - which is also self-contradictory beside live=True, a measurement sourced
    from nowhere.
    """
    svc = _svc(monkeypatch, FakeTable(rows=[]))

    listed = svc.list_slas()
    budgets = svc.get_sla_error_budgets()

    assert (budgets.live, budgets.source) == (listed.live, listed.source)
    assert budgets.source == "dynamodb"


# --- lookups by id, where a read ceiling is not a shorter list but a wrong answer ------


def _breach_row(idx: int) -> dict:
    return {
        "pk": "SLA_BREACH",
        "sk": f"2026-09-01T00:00:0{idx % 10}#br-{idx}",
        "id": f"br-{idx}",
        "data": json.dumps(
            {
                "id": f"br-{idx}",
                "sla_id": "sla-1",
                "sla_name": "sla one",
                "metric_type": "availability",
                "breach_start": "2026-09-01T00:00:00",
                "target_value": 99.9,
                "actual_value": 98.0,
            }
        ),
    }


def test_a_breach_past_the_old_ceiling_is_still_found(monkeypatch):
    """_find_breach walked 200 rows. Past that the miss was worse than a 404: it fell
    through to memory, so _persist_breach was handed sort_key=None and acknowledging the
    breach APPENDED a phantom in-memory copy while the real row stayed unacknowledged."""
    rows = [_breach_row(i) for i in range(400)]
    svc = _svc(monkeypatch, FakeTable(rows=rows, page_cap=100))

    breach, sort_key = svc._find_breach("br-350")

    assert breach is not None, "a stored breach past 200 rows must still be locatable"
    assert sort_key, "without the sort key the write would duplicate instead of update"
    assert svc._mem_breaches == [], "nothing should have been shunted into memory"


def test_a_silence_past_the_old_ceiling_can_still_be_ended(monkeypatch):
    """expire_silence finds its target by walking _load_silences, so the same ceiling made
    a silence un-endable - and the 404 looked exactly like one that had already expired."""
    from datetime import datetime, timedelta

    ends = (datetime.utcnow() + timedelta(hours=4)).isoformat()
    rows = [
        {
            "pk": "ALERT_SILENCE",
            "sk": f"2026-09-01T00:00:00#sil-{i}",
            "id": f"sil-{i}",
            "data": json.dumps(
                {
                    "id": f"sil-{i}",
                    "alarm_name_pattern": f"alarm-{i}",
                    "reason": "maintenance",
                    "created_by": "tester",
                    "ends_at": ends,
                }
            ),
        }
        for i in range(400)
    ]
    svc = _svc(monkeypatch, FakeTable(rows=rows, page_cap=100))

    silences, keys, live, note = svc._load_silences()

    assert len(silences) == 400
    assert live is True
    assert note is None, "a complete read has nothing to caveat"
    found = next((k for s, k in zip(silences, keys) if s.id == "sil-350"), None)
    assert found, "a silence past 200 rows must be addressable for expiry"


def test_a_truncated_silence_read_says_the_list_is_incomplete(monkeypatch):
    """The negative half: raising the ceiling does not remove the need to disclose it."""
    from datetime import datetime, timedelta

    ends = (datetime.utcnow() + timedelta(hours=4)).isoformat()
    rows = [
        {
            "pk": "ALERT_SILENCE",
            "sk": f"2026-09-01T00:00:00#sil-{i}",
            "id": f"sil-{i}",
            "data": json.dumps(
                {
                    "id": f"sil-{i}",
                    "alarm_name_pattern": f"alarm-{i}",
                    "reason": "maintenance",
                    "created_by": "tester",
                    "ends_at": ends,
                }
            ),
        }
        for i in range(30)
    ]
    table = FakeTable(rows=rows)
    svc = _svc(monkeypatch, table)
    monkeypatch.setattr(
        "services.govern_operations_service._MAX_LOOKUP_SCAN", 10, raising=True
    )

    _, _, live, note = svc._load_silences()

    assert live is True
    assert "incomplete" in note
    assert "may still be active" in note


def test_expired_silences_are_distinguished_from_none_at_all(monkeypatch):
    """total=0 has two causes and they mean opposite things operationally."""
    from datetime import datetime, timedelta

    past = (datetime.utcnow() - timedelta(hours=2)).isoformat()
    rows = [
        {
            "pk": "ALERT_SILENCE",
            "sk": "2026-09-01T00:00:00#sil-old",
            "id": "sil-old",
            "data": json.dumps(
                {
                    "id": "sil-old",
                    "alarm_name_pattern": "alarm-old",
                    "reason": "maintenance",
                    "created_by": "tester",
                    "ends_at": past,
                }
            ),
        }
    ]
    svc = _svc(monkeypatch, FakeTable(rows=rows))

    resp = svc.list_silences()

    assert resp.total == 0
    assert resp.live is True
    assert "all have expired" in resp.note


def test_a_malformed_silence_row_is_disclosed_not_just_logged(monkeypatch):
    """Dropping the row is right; dropping it silently is not. `total` under-reported under
    a Live badge, and the alarm the bad row silences rendered as un-silenced."""
    from datetime import datetime, timedelta

    ends = (datetime.utcnow() + timedelta(hours=4)).isoformat()
    good = {
        "pk": "ALERT_SILENCE",
        "sk": "2026-09-01T00:00:00#sil-ok",
        "id": "sil-ok",
        "data": json.dumps(
            {
                "id": "sil-ok",
                "alarm_name_pattern": "alarm-ok",
                "reason": "maintenance",
                "created_by": "tester",
                "ends_at": ends,
            }
        ),
    }
    bad = {
        "pk": "ALERT_SILENCE",
        "sk": "2026-09-01T00:00:00#sil-bad",
        "id": "sil-bad",
        "data": json.dumps({"id": "sil-bad"}),  # missing every required field
    }
    svc = _svc(monkeypatch, FakeTable(rows=[good, bad]))

    resp = svc.list_silences()

    assert resp.total == 1, "the bad row is skipped rather than raising"
    assert "could not be parsed" in resp.note
    assert "may in fact be silenced" in resp.note


def test_a_truncated_ack_read_no_longer_claims_completeness(monkeypatch):
    """_load_alert_acks documents that `note` is not None whenever the map may be
    incomplete. A 500-row cap broke that invariant silently, and the consequence is the one
    its own docstring names: a second operator re-acking an already-acknowledged alarm."""
    rows = [
        {"pk": "ALERT_ACK", "sk": f"us-east-2#alarm-{i}", "id": f"alarm-{i}"}
        for i in range(30)
    ]
    table = FakeTable(rows=rows)
    svc = _svc(monkeypatch, table)
    monkeypatch.setattr(
        "services.govern_operations_service._MAX_LOOKUP_SCAN", 10, raising=True
    )

    acks, note = svc._load_alert_acks()

    assert len(acks) == 10
    assert note is not None, "an incomplete ack map must never report as complete"
    assert "may already have been acknowledged" in note


def test_a_complete_ack_read_carries_no_caveat(monkeypatch):
    """Negative case: the caveat must not fire when the map really is complete."""
    rows = [
        {"pk": "ALERT_ACK", "sk": f"us-east-2#alarm-{i}", "id": f"alarm-{i}"}
        for i in range(5)
    ]
    svc = _svc(monkeypatch, FakeTable(rows=rows))

    acks, note = svc._load_alert_acks()

    assert len(acks) == 5
    assert note is None


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
