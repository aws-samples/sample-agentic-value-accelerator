"""Tests for the incident-response denominator, where "unknown" and "zero" must not merge.

The Incident Response dimension scores `responded / (incidents + SLA breaches)`. SLA
breaches are only folded in when that read is demonstrably live, which raises a question
the type system cannot answer: what does an EMPTY breach list mean?

Two very different states used to arrive identically. get_sla_breaches set
`live = len(items) > 0`, so a reachable-but-empty breach table and an unreachable one both
returned live=False / source="memory". From the scorer's side those were
indistinguishable, so it had to treat every empty read as unknown and drop breaches from
the denominator - because counting an unknown as zero lets a broken table silently IMPROVE
the ratio. get_sla_breaches has since been given the same four arms as the incident read
(rows / not-configured / query-failed / measured-zero), so a measured zero now arrives as
live=True with an empty list.

These tests pin both halves of that distinction, because only a comment asserts it today:

  - a measured zero must be INCLUDED (contributing 0 to numerator and denominator, which
    is what "we asked, there are none" is honestly worth), and
  - an unknown must be EXCLUDED and say so in the note.

The direction of the bug is why it matters. Excluding an unknown is conservative and
visible; including it as zero inflates the score, and an inflated governance score is the
answer a reader wants, so nobody goes looking. Same defect class as the rest of this
branch: silence that reads as good news.
"""

import pytest

from models.govern_posture_score import PostureDimension, UnscoredReason
from services.govern_posture_score_service import GovernPostureScoreService


class _Sev:
    def __init__(self, value):
        self.value = value


class _Incident:
    def __init__(self, iid, status, severity="high", title="something broke"):
        self.id = iid
        self.status = status
        self.severity = _Sev(severity)
        self.title = title


class _Breach:
    def __init__(self, bid, acknowledged=False, breach_end=None, sla_name="api-availability"):
        self.id = bid
        self.acknowledged = acknowledged
        self.breach_end = breach_end
        self.sla_name = sla_name


class _IncidentsResp:
    def __init__(self, incidents, live=True, source="dynamodb", note=None, total=None):
        self.incidents = incidents
        self.live = live
        self.source = source
        self.note = note
        self.total = total if total is not None else len(incidents)


class _BreachesResp:
    def __init__(self, breaches, live=True, source="dynamodb", note=None):
        self.breaches = breaches
        self.live = live
        self.source = source
        self.note = note


class _FakeOps:
    def __init__(self, incidents_resp, breaches_resp=None, breaches_raises=None):
        self._incidents_resp = incidents_resp
        self._breaches_resp = breaches_resp
        self._breaches_raises = breaches_raises

    def list_incidents(self, days=30, limit=200):
        return self._incidents_resp

    def get_sla_breaches(self, days=30):
        if self._breaches_raises:
            raise self._breaches_raises
        return self._breaches_resp


@pytest.fixture
def open_status():
    """The real IncidentStatus.OPEN.

    Imported from the module the scorer itself imports rather than faked: "responded" is
    defined as `status != IncidentStatus.OPEN`, so a fake enum would let the test pass
    while the production comparison compared against something else entirely.
    """
    from models.govern_operations import IncidentStatus

    return IncidentStatus


def _svc(ops):
    svc = GovernPostureScoreService(region="us-east-1")
    svc._operations_svc = ops
    return svc


def test_measured_zero_breaches_are_included_not_excluded(open_status):
    """A live, empty breach read must not be reported as excluded.

    One open incident out of one item is 0%. If the empty-but-live breach read were still
    being treated as unknown, the note would carry the exclusion sentence - and once
    breaches DO exist, the same misreading drops real unresponded breaches out of the
    denominator and raises the score.
    """
    ops = _FakeOps(
        _IncidentsResp([_Incident("INC-1", open_status.OPEN)]),
        _BreachesResp([], live=True, source="dynamodb", note="No SLA breaches recorded."),
    )
    result = _svc(ops)._calc_incident_response()

    assert result.dimension == PostureDimension.INCIDENT_RESPONSE
    assert result.score == 0.0
    assert result.items_assessed == 1
    assert result.items_compliant == 0
    assert result.live is True
    assert "excluded from the denominator" not in (result.note or "")


def test_unknown_breaches_are_excluded_and_the_note_says_so(open_status):
    """live=False means the contents are unknown, so they cannot be counted as zero.

    The score here is computed from incidents alone, and the note has to admit that -
    otherwise a 100% is indistinguishable from a 100% measured over everything.
    """
    ops = _FakeOps(
        _IncidentsResp([_Incident("INC-1", open_status.RESOLVED)]),
        _BreachesResp([], live=False, source="not-configured", note="Breach table not configured"),
    )
    result = _svc(ops)._calc_incident_response()

    assert result.score == 100.0
    assert result.items_assessed == 1
    assert "excluded from the denominator" in result.note
    assert "not configured" in result.note.lower()


def test_a_failed_breach_read_does_not_sink_the_whole_dimension(open_status):
    """One dead store must not take the other one down with it.

    A bare `except` around both reads would return the CALCULATION_FAILED fallback, losing
    a perfectly good incident measurement to an unrelated breach-table fault.
    """
    ops = _FakeOps(
        _IncidentsResp([_Incident("INC-1", open_status.RESOLVED)]),
        breaches_raises=RuntimeError("breach table exploded"),
    )
    result = _svc(ops)._calc_incident_response()

    assert result.score == 100.0
    assert result.unscored_reason is None
    assert "RuntimeError" in result.note


def test_unresponded_breaches_lower_the_score_when_the_read_is_live(open_status):
    """The load-bearing consequence of including live breaches.

    Two items, one responded: 50%. Under the old always-exclude behaviour the unresponded
    breach vanished from both sides and this reported 100% - a perfect incident-response
    score while an unacknowledged SLA breach sat in the store.
    """
    ops = _FakeOps(
        _IncidentsResp([_Incident("INC-1", open_status.RESOLVED)]),
        _BreachesResp([_Breach("BR-1", acknowledged=False, breach_end=None)], live=True),
    )
    result = _svc(ops)._calc_incident_response()

    assert result.items_assessed == 2
    assert result.items_compliant == 1
    assert result.score == 50.0
    assert any(f.item == "BR-1" and f.status == "unresponded" for f in result.findings)


def test_an_acknowledged_breach_counts_as_responded(open_status):
    ops = _FakeOps(
        _IncidentsResp([_Incident("INC-1", open_status.RESOLVED)]),
        _BreachesResp([_Breach("BR-1", acknowledged=True)], live=True),
    )
    result = _svc(ops)._calc_incident_response()
    assert result.score == 100.0
    assert result.items_compliant == 2


def test_a_resolved_breach_counts_as_responded_even_unacknowledged(open_status):
    """breach_end is what resolve_sla_breach sets, so it is what "resolved" means here.

    Requiring `acknowledged` alone would mark a breach that was actually fixed as
    unresponded, which understates the score - the safe direction, but still wrong.
    """
    ops = _FakeOps(
        _IncidentsResp([_Incident("INC-1", open_status.RESOLVED)]),
        _BreachesResp(
            [_Breach("BR-1", acknowledged=False, breach_end="2026-09-14T00:00:00+00:00")],
            live=True,
        ),
    )
    result = _svc(ops)._calc_incident_response()
    assert result.score == 100.0
    assert result.items_compliant == 2


def test_an_empty_window_is_unscored_rather_than_perfect(open_status):
    """Zero items is None, not 100.

    An empty window is also exactly what a tracker nobody files into looks like, and a
    perfect score for an absence of evidence is the single most flattering possible lie
    this dimension could tell.
    """
    ops = _FakeOps(
        _IncidentsResp([], live=True, source="dynamodb", note="No incidents recorded."),
        _BreachesResp([], live=True),
    )
    result = _svc(ops)._calc_incident_response()

    assert result.score is None
    assert result.unscored_reason == UnscoredReason.NOTHING_ASSESSED
    # live tracks the measurement, not the emptiness: we DID ask, and the answer was none.
    assert result.live is True
    assert result.items_assessed == 0


def test_a_dead_operations_store_is_unscored_not_a_fabricated_75(open_status):
    """The fallback must refuse rather than invent.

    This branch used to return score=75 with items_assessed=10 / items_compliant=7 under
    source="mock-fallback" - ten incidents that did not exist, reported as assessed, inside
    a model that claimed half its weight had been measured.
    """
    class _Exploding:
        def list_incidents(self, days=30, limit=200):
            raise RuntimeError("operations table unreachable")

    result = _svc(_Exploding())._calc_incident_response()

    assert result.score is None
    assert result.unscored_reason == UnscoredReason.CALCULATION_FAILED
    assert result.live is False
    assert result.items_assessed == 0
    assert result.items_compliant == 0
