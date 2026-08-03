"""Regression tests for the Govern services' table-free fallback behavior.

The Govern differentiators must remain usable when their DynamoDB tables are not
provisioned (e.g. running the app locally without the backend). Each service
degrades gracefully: pure-logic surfaces (enforcement gate, A2A autonomy ceiling)
evaluate with no table, and stateful surfaces (graduation, SR 26-2, conformance,
audit) fall back to an ephemeral in-memory store so the surface stays functional.

These tests pin that contract: a table that raises ResourceNotFoundException on
every operation must NOT cause the service methods to raise — reads return
empty/None or the in-memory buffer, and writes succeed into memory.
"""

import os
import sys

import pytest

# Govern services import cleanly with src on the path (no Settings env chain).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "src")))

from botocore.exceptions import ClientError  # noqa: E402

from services.govern_audit_service import GovernAuditService  # noqa: E402
from services.govern_graduation_service import GovernGraduationService  # noqa: E402
from services.govern_a2a_trust_service import GovernA2ATrustService  # noqa: E402
from services.govern_enforcement_service import GovernEnforcementService  # noqa: E402
from services.govern_sr26_service import GovernSr26Service  # noqa: E402
from services.govern_conformance_service import GovernConformanceService  # noqa: E402

from models.govern_audit import AuditCategory, AuditEventCreate  # noqa: E402
from models.govern_graduation import GraduationRecordCreate  # noqa: E402
from models.govern_a2a_trust import DelegationRequest  # noqa: E402
from models.govern_enforcement import EnforcementRequest  # noqa: E402
from models.govern_sr26 import SR26MappingCreate  # noqa: E402
from models.govern_conformance import ConformanceRecordCreate  # noqa: E402


_NOT_FOUND = ClientError(
    {"Error": {"Code": "ResourceNotFoundException", "Message": "Requested resource not found"}},
    "PutItem",
)


class _MissingTable:
    """A boto3 Table stand-in whose every operation raises as if the table is absent."""

    def put_item(self, **kwargs):
        raise _NOT_FOUND

    def get_item(self, **kwargs):
        raise _NOT_FOUND

    def query(self, **kwargs):
        raise _NOT_FOUND

    def scan(self, **kwargs):
        raise _NOT_FOUND

    def delete_item(self, **kwargs):
        raise _NOT_FOUND


def _reset_class_state():
    """Clear the class-level in-memory buffers so tests don't leak into each other."""
    GovernAuditService._mem = []
    GovernAuditService._table_ok = None
    GovernGraduationService._mem = {}
    GovernSr26Service._mem = {}
    GovernConformanceService._mem = {}


@pytest.fixture
def audit():
    _reset_class_state()
    svc = GovernAuditService.__new__(GovernAuditService)
    svc.table_name = "missing"
    svc.region = "us-east-1"
    svc.table = _MissingTable()
    return svc


def _grad(audit):
    svc = GovernGraduationService.__new__(GovernGraduationService)
    svc.table_name = "missing"
    svc.region = "us-east-1"
    svc.audit = audit
    svc.table = _MissingTable()
    return svc


def _a2a(audit):
    svc = GovernA2ATrustService.__new__(GovernA2ATrustService)
    svc.table_name = "missing"
    svc.region = "us-east-1"
    svc.audit = audit
    svc.table = _MissingTable()
    return svc


def _enf(audit):
    svc = GovernEnforcementService.__new__(GovernEnforcementService)
    svc.table_name = "missing"
    svc.region = "us-east-1"
    svc.audit = audit
    svc.table = _MissingTable()
    return svc


def _sr26(audit):
    svc = GovernSr26Service.__new__(GovernSr26Service)
    svc.table_name = "missing"
    svc.region = "us-east-1"
    svc.audit = audit
    svc.table = _MissingTable()
    return svc


def _conf():
    svc = GovernConformanceService.__new__(GovernConformanceService)
    svc.table_name = "missing"
    svc.region = "us-east-1"
    svc.table = _MissingTable()
    return svc


# --- Audit hub ---------------------------------------------------------------

def test_audit_append_buffers_in_memory_when_table_absent(audit):
    ev = audit.append(AuditEventCreate(
        category=AuditCategory.APPROVAL, actor="reviewer", summary="s", action="approve", agent="agt-1",
    ))
    assert ev.id
    # list/get/query all serve from the buffer, never raise
    assert len(audit.list()) == 1
    assert audit.get(ev.id) is not None
    assert len(audit.query_events(agent="agt-1")) == 1
    assert audit.count_events(category=AuditCategory.APPROVAL, agent="agt-1") == 1


def test_audit_list_empty_when_absent_and_nothing_buffered(audit):
    assert audit.list() == []
    assert audit.query_events(agent="nobody") == []


def test_audit_query_events_filters_then_limits_in_memory(audit):
    # 30 events for agt-A, 5 for agt-B; a per-agent query must see ALL of that
    # agent's events, not just its slice of the newest global page.
    for _ in range(30):
        audit.append(AuditEventCreate(category=AuditCategory.APPROVAL, actor="r", summary="s", action="approve", agent="agt-A"))
    for _ in range(5):
        audit.append(AuditEventCreate(category=AuditCategory.APPROVAL, actor="r", summary="s", action="approve", agent="agt-B"))
    assert len(audit.query_events(agent="agt-A")) == 30
    assert len(audit.query_events(agent="agt-B")) == 5


# --- Enforcement (pure-logic gate) ------------------------------------------

def test_enforcement_gate_evaluates_table_free(audit):
    svc = _enf(audit)
    req = EnforcementRequest(agent_id="x", scope_level=2, action_type="write", tool="wire", risk_tier="high")
    decision = svc.evaluate(req, dry_run=True)  # dry-run: no persistence
    assert decision.disposition.value in {"allow", "pause", "deny"}
    assert decision.matched_by == "ladder-gate"
    # list_decisions must not raise even though the table is absent
    assert svc.list_decisions() == []


def test_enforcement_persisted_evaluate_does_not_raise_table_free(audit):
    svc = _enf(audit)
    req = EnforcementRequest(agent_id="x", scope_level=3, action_type="read", tool="t", risk_tier="low")
    # Non-dry-run persists + audits; both must degrade gracefully, not raise.
    decision = svc.evaluate(req, dry_run=False)
    assert decision.disposition.value == "allow"


# --- A2A autonomy ceiling (pure-logic differentiator) -----------------------

def test_a2a_ceiling_evaluates_table_free_with_baseline_policy(audit):
    svc = _a2a(audit)
    # Unregistered agents floor to L1, so a request for L3 must be denied by the
    # autonomy ceiling — the differentiator working with no table.
    decision = svc.evaluate(DelegationRequest(
        source_agent_id="a", target_agent_id="b", action="read", requested_autonomy=3,
    ))
    assert decision.effect.value == "deny"
    assert decision.denied_by.value == "autonomy_ceiling"
    assert decision.effective_autonomy_ceiling == 1
    assert svc.list_policies() == []
    assert svc.list_identities() == []


# --- Graduation (stateful + compute-on-read) --------------------------------

def test_graduation_upsert_and_compute_table_free(audit):
    svc = _grad(audit)
    svc.upsert(GraduationRecordCreate(agent_id="agt-1", name="A1", business_unit="BU", current_level=2))
    # Seed a handful of real approval events so compute-on-read has signal.
    for _ in range(10):
        audit.append(AuditEventCreate(category=AuditCategory.APPROVAL, actor="r", summary="s", action="approve", agent="agt-1"))
    grads = svc.list_graduations()
    assert len(grads) == 1
    assert grads[0].signals.decisions_in_scope == 10
    assert grads[0].signals.agreement_rate == 100
    # summarize must not raise
    assert svc.summarize().total == 1


# --- SR 26-2 (stateful CRUD, in-memory fallback) ----------------------------

def test_sr26_create_builds_catalog_table_free(audit):
    svc = _sr26(audit)
    m = svc.create(SR26MappingCreate(name="FSI Agent MRM", agent_id="agt-1"))
    assert m.sr26_id
    assert len(m.pillars) > 0                 # default catalog was built
    assert m.computed is not None
    assert len(svc.list()) == 1
    # evaluate resolves bindings against the (empty) audit log without raising
    evaluated = svc.evaluate(m.sr26_id, autonomy_level=3)
    assert evaluated is not None
    assert evaluated.computed.total_controls > 0


# --- Conformance (stateful CRUD, in-memory fallback) ------------------------

def test_conformance_create_table_free_does_not_raise():
    _reset_class_state()
    svc = _conf()
    r = svc.create(ConformanceRecordCreate(name="FSI AIMS"))
    assert r.conformance_id
    assert r.computed is not None
    assert len(svc.list()) == 1


def test_sr26_create_regression_no_none_pillars(audit):
    """Regression: create() must not pass pillars=None into the required List
    field (exclude_none), which previously raised a ValidationError 500."""
    svc = _sr26(audit)
    m = svc.create(SR26MappingCreate(name="No pillars provided"))
    assert isinstance(m.pillars, list) and len(m.pillars) > 0
