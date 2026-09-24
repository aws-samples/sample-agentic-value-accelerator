"""GovernValidationService swallowed four store failures in silence, one of them a fake success.

The panel store had `except Exception: pass` (or a bare fallback with no log) at every one of its
four DynamoDB call sites, so nothing anywhere - response, log, or return value - distinguished a
durable write from a lost one, a missing panel from an unreadable table, or a completed delete from
a failed one. A validation panel is an audit artifact; those are exactly the claims that must not be
made falsely.

The scan case is this branch's central defect in its sharpest form: `Limit` on a *filtered* Scan
caps rows EXAMINED, not rows returned.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from models.govern_validation_panel import (  # noqa: E402
    ValidationPanelCreate,
    ValidationTargetType,
)
from services import govern_validation_service as vmod  # noqa: E402
from services.govern_validation_service import GovernValidationService  # noqa: E402


class Boom(Exception):
    """Stands in for any botocore failure - throttle, missing table, access denied."""


class FakeTable:
    """A DynamoDB table double that records calls and can fail on demand.

    `scan_pages` is a list of (items, last_evaluated_key) tuples, so a test can describe a table
    whose matching rows are NOT in the first page - the state the old single-page scan reported as
    an empty list.
    """

    def __init__(self, *, scan_pages=None, fail_on=()):
        self.scan_pages = scan_pages or [([], None)]
        self.fail_on = set(fail_on)
        self.scan_calls = []
        self.deleted = []
        self.put_items = []
        self.items = {}

    def _maybe_fail(self, op):
        if op in self.fail_on:
            raise Boom(f"{op} failed")

    def put_item(self, Item):
        self._maybe_fail("put_item")
        self.put_items.append(Item)
        self.items[(Item["pk"], Item["sk"])] = Item

    def get_item(self, Key):
        self._maybe_fail("get_item")
        item = self.items.get((Key["pk"], Key["sk"]))
        return {"Item": item} if item else {}

    def delete_item(self, Key):
        self._maybe_fail("delete_item")
        self.deleted.append(Key)
        self.items.pop((Key["pk"], Key["sk"]), None)

    def scan(self, **kwargs):
        self._maybe_fail("scan")
        self.scan_calls.append(kwargs)
        idx = len(self.scan_calls) - 1
        if idx >= len(self.scan_pages):
            return {"Items": []}
        items, lek = self.scan_pages[idx]
        out = {"Items": items}
        if lek is not None:
            out["LastEvaluatedKey"] = lek
        return out


class FakeResource:
    """Stands in for boto3.resource("dynamodb"); .Table() never touches the network."""

    def Table(self, name):  # noqa: N802 - boto3's own capitalisation
        return FakeTable()


def _svc(monkeypatch, table):
    """Build the service without touching boto3, and with a clean class-level memory store."""
    monkeypatch.setattr(vmod.boto3, "resource", lambda *a, **k: FakeResource())
    svc = GovernValidationService(table_name="fsi-test-panels", region="us-east-2")
    svc.table = table
    # _mem is CLASS-level, so it leaks between tests unless reset. Cleared rather than
    # monkeypatched so the service's own `type(self)._mem` writes are observable.
    GovernValidationService._mem.clear()
    return svc


def _create(svc, target_id="agent-1"):
    return svc.create_panel(
        ValidationPanelCreate(
            target_type=ValidationTargetType.HARNESS_ACTION,
            target_id=target_id,
            target_description="a target",
        ),
        created_by="tester",
    )


def _panel_row(svc, panel, **overrides):
    """A stored DynamoDB row for a panel, as _to_item would write it."""
    row = svc._to_item(panel)
    row.update(overrides)
    return row


# ---------------------------------------------------------------------------
# 1. A write that never reached DynamoDB was reported as a created panel
# ---------------------------------------------------------------------------


def test_a_lost_write_is_logged_not_silent(monkeypatch, caplog):
    """`create_panel` answered 201 with a panel_id for a panel held only in memory."""
    svc = _svc(monkeypatch, FakeTable(fail_on={"put_item"}))

    with caplog.at_level("WARNING"):
        panel = _create(svc)

    # Still returned - local dev without DynamoDB has to work.
    assert panel.panel_id
    assert GovernValidationService._mem[panel.panel_id] is panel
    # But no longer silently.
    assert "NOT being persisted" in caplog.text
    assert "will be lost when this process restarts" in caplog.text


def test_persist_reports_whether_the_row_landed(monkeypatch):
    """_persist returned None either way, so no caller could branch on durability."""
    ok = _svc(monkeypatch, FakeTable())
    panel = _create(ok)
    assert ok._persist(panel) is True

    bad = _svc(monkeypatch, FakeTable(fail_on={"put_item"}))
    assert bad._persist(panel) is False


# ---------------------------------------------------------------------------
# 2. `Limit` on a filtered Scan caps rows EXAMINED, not rows returned
# ---------------------------------------------------------------------------


def test_panels_beyond_the_first_scan_page_are_still_returned(monkeypatch):
    """The defect: a filtered Scan's Limit bounds examined rows, so page one can match nothing.

    Here page one matches nothing at all and every panel is on page two. The old
    `scan(FilterExpression=..., Limit=limit)` read one page and returned [] - and "no panels
    awaiting validation" is the reassuring reading, which is what made it dangerous.
    """
    probe = _svc(monkeypatch, FakeTable())
    p1, p2 = _create(probe, "a"), _create(probe, "b")

    table = FakeTable(scan_pages=[
        ([], {"pk": "cursor"}),                                   # page 1: no matching rows
        ([_panel_row(probe, p1), _panel_row(probe, p2)], None),   # page 2: both panels
    ])
    svc = _svc(monkeypatch, table)

    out = svc.list_panels(limit=100)

    assert {p.target_id for p in out} == {"a", "b"}
    assert len(table.scan_calls) == 2, "did not follow LastEvaluatedKey"
    # The second call must resume, not restart.
    assert table.scan_calls[1]["ExclusiveStartKey"] == {"pk": "cursor"}


def test_ddb_limit_is_no_longer_passed_at_all(monkeypatch):
    """Passing `limit` through to Scan is the bug; the cap belongs on the result.

    Asserted directly because this is the kind of thing a later edit "tidies" back in.
    """
    probe = _svc(monkeypatch, FakeTable())
    p = _create(probe, "a")
    table = FakeTable(scan_pages=[([_panel_row(probe, p)], None)])
    svc = _svc(monkeypatch, table)

    svc.list_panels(limit=5)

    assert "Limit" not in table.scan_calls[0]


def test_the_result_is_still_capped_at_limit(monkeypatch):
    """Removing DynamoDB's Limit must not remove the caller's bound - a negative case."""
    probe = _svc(monkeypatch, FakeTable())
    panels = [_create(probe, f"t{i}") for i in range(5)]
    table = FakeTable(scan_pages=[([_panel_row(probe, p) for p in panels], None)])
    svc = _svc(monkeypatch, table)

    assert len(svc.list_panels(limit=2)) == 2


def test_the_newest_panels_win_the_limit_not_the_first_scanned(monkeypatch):
    """Sorting after a truncated read sorted an arbitrary subset.

    Page two holds the most recently updated panel. If paging were skipped, `[:limit]` would
    return the newest of page one and call it the newest overall.
    """
    probe = _svc(monkeypatch, FakeTable())
    old = _create(probe, "old")
    new = _create(probe, "new")
    old.updated_at = old.updated_at.replace(year=2020)
    new.updated_at = new.updated_at.replace(year=2030)

    table = FakeTable(scan_pages=[
        ([_panel_row(probe, old)], {"pk": "cursor"}),
        ([_panel_row(probe, new)], None),
    ])
    svc = _svc(monkeypatch, table)

    out = svc.list_panels(limit=1)

    assert [p.target_id for p in out] == ["new"]


def test_a_page_bounded_scan_says_so(monkeypatch, caplog):
    """Hitting the page bound must not look like a complete list."""
    monkeypatch.setattr(vmod, "_MAX_SCAN_PAGES", 2, raising=True)
    probe = _svc(monkeypatch, FakeTable())
    p = _create(probe, "a")
    # Every page returns a cursor, so the bound is what stops it.
    table = FakeTable(scan_pages=[([_panel_row(probe, p)], {"pk": f"c{i}"}) for i in range(5)])
    svc = _svc(monkeypatch, table)

    with caplog.at_level("WARNING"):
        svc.list_panels(limit=100)

    assert len(table.scan_calls) == 2
    assert "more panels exist and are omitted" in caplog.text


def test_a_failed_scan_still_falls_back_to_memory(monkeypatch, caplog):
    """A negative case: the fallback is intended behaviour and must survive the fix."""
    svc = _svc(monkeypatch, FakeTable(fail_on={"scan"}))
    panel = _create(svc)  # put_item succeeds, so persist it to memory manually
    GovernValidationService._mem[panel.panel_id] = panel

    with caplog.at_level("WARNING"):
        out = svc.list_panels(limit=10)

    assert [p.panel_id for p in out] == [panel.panel_id]
    assert "listing the in-memory store instead" in caplog.text


# ---------------------------------------------------------------------------
# 3. An unreadable table reported "no such panel"
# ---------------------------------------------------------------------------


def test_an_unreadable_get_is_logged_not_swallowed(monkeypatch, caplog):
    """`except Exception: pass` made a 404 indistinguishable from an unreachable table."""
    svc = _svc(monkeypatch, FakeTable(fail_on={"get_item"}))

    with caplog.at_level("WARNING"):
        assert svc.get_panel("panel-that-may-exist") is None

    assert "does NOT mean the panel does not exist" in caplog.text


# ---------------------------------------------------------------------------
# 4. The fake success: a failed delete reported 200 and logged "Deleted"
# ---------------------------------------------------------------------------


def test_a_failed_delete_no_longer_reports_success(monkeypatch):
    """The worst of the four. A surviving row was reported as deleted, and the next read
    returned it straight back."""
    probe = _svc(monkeypatch, FakeTable())
    panel = _create(probe, "a")

    table = FakeTable(fail_on={"delete_item"})
    table.items[(f"{GovernValidationService.PK_PREFIX}{panel.panel_id}",
                 GovernValidationService.SK_LATEST)] = _panel_row(probe, panel)
    svc = _svc(monkeypatch, table)

    with pytest.raises(RuntimeError, match="Could not delete validation panel"):
        svc.delete_panel(panel.panel_id)

    # And the row is still readable, which is the point: the old code cleared memory and
    # returned success, leaving the caller believing an audit artifact was gone.
    assert svc.get_panel(panel.panel_id) is not None


def test_a_memory_only_panel_can_still_be_deleted(monkeypatch):
    """A negative case, and the reason the raise is conditional: a panel that never reached
    DynamoDB has no row to fail to delete, so raising there would be its own false alarm."""
    svc = _svc(monkeypatch, FakeTable(fail_on={"put_item", "delete_item"}))
    panel = _create(svc)
    assert panel.panel_id in GovernValidationService._mem

    out = svc.delete_panel(panel.panel_id)

    assert out is not None
    assert panel.panel_id not in GovernValidationService._mem


def test_a_successful_delete_is_unchanged(monkeypatch):
    """The plain path must not have become an error path."""
    probe = _svc(monkeypatch, FakeTable())
    panel = _create(probe, "a")

    table = FakeTable()
    key = (f"{GovernValidationService.PK_PREFIX}{panel.panel_id}",
           GovernValidationService.SK_LATEST)
    table.items[key] = _panel_row(probe, panel)
    svc = _svc(monkeypatch, table)

    assert svc.delete_panel(panel.panel_id) is not None
    assert table.deleted, "delete_item was never called"
    assert svc.get_panel(panel.panel_id) is None
