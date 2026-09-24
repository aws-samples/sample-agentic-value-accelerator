"""Tests for the Transformation Value Model reference catalog.

Covers the design's correctness properties: seed idempotency/exclusivity/round-
trip, versioning (create=v1 empty diff, update bumps + diff fidelity, history
ordering/search), search/filter (text/attribute/relationship/combined),
create validation, and Score_Preseed determinism + range.

Run with: PYTHONPATH=src python -m pytest tests/test_transformation_value_model.py
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings as hyp_settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.database import Base
import models.catalog_orm  # noqa: F401  (register tables)
from services.transformation_value_model_service import (
    CatalogService, ValidationError, NotFound, UnknownEntityType,
)
from services.seed_importer import run_seed_import
from services.score_preseed import score_preseed


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def seeded_db(db):
    run_seed_import(db, settings.TRANSFORMATION_SEED_PATH)
    return db


@pytest.fixture()
def svc():
    return CatalogService()


# ---------------------------------------------------------------------------
# Seed: idempotency, exclusivity, round-trip (Req 1.4, 1.5, 1.6, 10.4)
# ---------------------------------------------------------------------------


def test_seed_imports_all_nine_types(seeded_db, svc):
    for slug in ("industries", "industry-segments", "business-domains", "value-levers",
                 "kpis", "solutions", "use-cases", "data-assets", "technology-components"):
        items = svc.list(seeded_db, slug, limit=1000)
        assert len(items) > 0, f"{slug} should have seeded rows"


def test_seed_idempotent_reimport(db):
    r1 = run_seed_import(db, settings.TRANSFORMATION_SEED_PATH)
    r2 = run_seed_import(db, settings.TRANSFORMATION_SEED_PATH)
    assert r1.total_entities > 0
    assert r2.total_entities == 0  # nothing new on second run
    assert r2.total_relationships == 0


def test_seed_exclusivity_no_account_records(seeded_db, svc):
    # Property 7: no account/roadmap entities exist — the catalog only holds the
    # nine reusable reference types. (Container tables were never imported.)
    from models.transformation_value_model import ENTITY_REGISTRY
    allowed = set(ENTITY_REGISTRY)
    assert allowed == {
        "industries", "industry-segments", "business-domains", "value-levers",
        "kpis", "solutions", "use-cases", "data-assets", "technology-components",
    }


def test_seed_roundtrip_counts_match_seed(seeded_db, svc):
    import json
    with open(settings.TRANSFORMATION_SEED_PATH) as f:
        seed = json.load(f)
    key_to_slug = {
        "industry": "industries", "industry_segment": "industry-segments",
        "business_domain": "business-domains", "value_lever": "value-levers",
        "kpi": "kpis", "solution": "solutions", "use_case": "use-cases",
        "data_asset": "data-assets", "technology_component": "technology-components",
    }
    for ekey, rows in seed["entities"].items():
        slug = key_to_slug[ekey]
        got = svc.list(seeded_db, slug, limit=2000)
        assert len(got) == len(rows), f"{slug}: imported {len(got)} != seed {len(rows)}"


# ---------------------------------------------------------------------------
# Versioning (Req 5.6, 6.1, 6.2, 6.4) — Properties 1-4
# ---------------------------------------------------------------------------


def test_create_writes_version_1_empty_diff(db, svc):
    ent = svc.create(db, "kpis", {"name": "Test KPI"}, "tester")
    assert ent["version_no"] == 1
    versions = svc.list_versions(db, "kpis", ent["id"])
    assert len(versions) == 1
    assert versions[0].version_no == 1
    assert versions[0].operation == "create"
    assert versions[0].changed_fields == {}


def test_update_bumps_version_and_records_diff(db, svc):
    ent = svc.create(db, "kpis", {"name": "K", "unit_of_measure": "%"}, "tester")
    svc.update(db, "kpis", ent["id"], {"unit_of_measure": "count"}, "editor")
    versions = svc.list_versions(db, "kpis", ent["id"])
    assert [v.version_no for v in versions] == [1, 2]
    assert versions[1].operation == "update"
    assert versions[1].changed_fields["unit_of_measure"] == {"from": "%", "to": "count"}


def test_version_monotonicity(db, svc):
    ent = svc.create(db, "kpis", {"name": "K"}, "t")
    for i in range(5):
        svc.update(db, "kpis", ent["id"], {"description": f"v{i}"}, "t")
    versions = svc.list_versions(db, "kpis", ent["id"])
    assert [v.version_no for v in versions] == [1, 2, 3, 4, 5, 6]
    current = svc.get(db, "kpis", ent["id"])
    assert current["version_no"] == len(versions)  # Property 1


def test_diff_versions_fidelity(db, svc):
    ent = svc.create(db, "kpis", {"name": "K", "baseline_value": 1}, "t")
    svc.update(db, "kpis", ent["id"], {"baseline_value": 2, "target_value": 9}, "t")
    diff = svc.diff_versions(db, "kpis", ent["id"], 1, 2)
    assert set(diff.changed_fields) == {"baseline_value", "target_value"}
    assert diff.changed_fields["baseline_value"] == {"from": 1.0, "to": 2.0}


def test_history_search_by_actor_and_field(db, svc):
    a = svc.create(db, "kpis", {"name": "A"}, "alice")
    svc.update(db, "kpis", a["id"], {"unit_of_measure": "%"}, "bob")
    by_bob = svc.search_versions(db, actor="bob")
    assert len(by_bob) == 1 and by_bob[0].actor == "bob"
    by_field = svc.search_versions(db, changed_field="unit_of_measure")
    assert len(by_field) == 1


# ---------------------------------------------------------------------------
# Search / filter (Req 2.2, 2.3, 2.4, 2.6) — Property 9
# ---------------------------------------------------------------------------


def test_text_search_case_insensitive(db, svc):
    svc.create(db, "solutions", {"name": "Fraud Detection Platform"}, "t")
    svc.create(db, "solutions", {"name": "Payments Hub"}, "t")
    assert len(svc.list(db, "solutions", q="FRAUD")) == 1
    assert len(svc.list(db, "solutions", q="fraud")) == 1


def test_attribute_filter(db, svc):
    svc.create(db, "solutions", {"name": "A", "solution_type": "platform"}, "t")
    svc.create(db, "solutions", {"name": "B", "solution_type": "point"}, "t")
    got = svc.list(db, "solutions", filters={"solution_type": "platform"})
    assert len(got) == 1 and got[0]["name"] == "A"


def test_relationship_and_combined_filter(db, svc):
    ind = svc.create(db, "industries", {"name": "FS"}, "t")
    s1 = svc.create(db, "industry-segments", {"name": "Banking", "relationships": {"industry": [ind["id"]]}}, "t")
    svc.create(db, "industry-segments", {"name": "Insurance"}, "t")
    # relationship filter: segments in the industry
    got = svc.list(db, "industry-segments", related={"industry": ind["id"]})
    assert {g["id"] for g in got} == {s1["id"]}
    # combined: relationship + text (Property 9 — intersection)
    got2 = svc.list(db, "industry-segments", q="bank", related={"industry": ind["id"]})
    assert len(got2) == 1


# ---------------------------------------------------------------------------
# Create validation (Req 5.3, 5.5)
# ---------------------------------------------------------------------------


def test_create_missing_name_rejected(db, svc):
    with pytest.raises(ValidationError):
        svc.create(db, "kpis", {"description": "no name"}, "t")


def test_create_unresolved_relationship_rejected(db, svc):
    with pytest.raises(ValidationError):
        svc.create(db, "use-cases", {"name": "X", "relationships": {"data_assets": ["nope"]}}, "t")


def test_unknown_entity_type(db, svc):
    with pytest.raises(UnknownEntityType):
        svc.list(db, "nonsense")


def test_get_missing_raises_notfound(db, svc):
    with pytest.raises(NotFound):
        svc.get(db, "kpis", "kpi-missing")


# ---------------------------------------------------------------------------
# Score_Preseed determinism + range (Req 7.2, 7.3) — Property 5
# ---------------------------------------------------------------------------


def _all_scores(scores):
    return [v for dim in scores.model_dump().values() for v in dim.values()]


def test_preseed_empty_is_all_neutral():
    s = score_preseed({}, {})
    assert set(_all_scores(s)) == {3}


def test_preseed_range_and_determinism_rich():
    uc = {"complexity": "High", "privacy_risk": "high", "risk_tier": "critical",
          "bias_risk": "low", "model_risk": "low",
          "human_in_loop_required": True, "override_allowed": True}
    ctx = {
        "solutions": [{"benefit_base": 8_000_000, "investment_base": 2_000_000,
                       "run_cost_annual": 300_000, "expected_payback_months": 9,
                       "shared_enabler_flag": True}],
        "value_levers": [{"financial_value_base": 6_000_000}],
        "data_assets": [{"quality_score": 90, "completeness_score": 85,
                         "current_readiness": "partial", "pii_flag": True}],
        "technology_components": [{}] * 6,
        "business_domain": {"value_potential_score": 82, "data_readiness_score": 70,
                            "technology_readiness_score": 55, "executive_sponsorship_score": 90,
                            "strategic_objective": "Grow", "overall_priority_score": 78},
    }
    s1 = score_preseed(uc, ctx)
    s2 = score_preseed(uc, ctx)
    assert s1.model_dump() == s2.model_dump()  # deterministic
    assert all(1 <= v <= 5 for v in _all_scores(s1))  # range


# Property 5 as a property-based test: arbitrary evidence stays in range and
# repeated calls are identical.
_uc_strategy = st.fixed_dictionaries({
    "complexity": st.sampled_from(["Low", "Medium", "High", None]),
    "privacy_risk": st.sampled_from(["low", "medium", "high", None]),
    "risk_tier": st.sampled_from(["low", "medium", "high", "critical", None]),
    "bias_risk": st.sampled_from(["low", "high", None]),
    "model_risk": st.sampled_from(["low", "high", None]),
    "human_in_loop_required": st.sampled_from([True, False, None]),
    "override_allowed": st.sampled_from([True, False, None]),
})
_ctx_strategy = st.fixed_dictionaries({
    "solutions": st.lists(st.fixed_dictionaries({
        "benefit_base": st.one_of(st.none(), st.floats(0, 5e7)),
        "investment_base": st.one_of(st.none(), st.floats(0, 5e7)),
        "run_cost_annual": st.one_of(st.none(), st.floats(0, 5e6)),
        "expected_payback_months": st.one_of(st.none(), st.floats(0, 60)),
        "shared_enabler_flag": st.booleans(),
    }), max_size=3),
    "value_levers": st.lists(st.fixed_dictionaries({
        "financial_value_base": st.one_of(st.none(), st.floats(0, 5e7)),
    }), max_size=3),
    "data_assets": st.lists(st.fixed_dictionaries({
        "quality_score": st.one_of(st.none(), st.floats(0, 100)),
        "completeness_score": st.one_of(st.none(), st.floats(0, 100)),
        "current_readiness": st.sampled_from(["partial", "target", "interim", None]),
        "pii_flag": st.booleans(),
    }), max_size=4),
    "technology_components": st.lists(st.just({}), max_size=12),
    "business_domain": st.one_of(st.none(), st.fixed_dictionaries({
        "value_potential_score": st.floats(0, 100),
        "data_readiness_score": st.floats(0, 100),
        "technology_readiness_score": st.floats(0, 100),
        "executive_sponsorship_score": st.floats(0, 100),
        "overall_priority_score": st.floats(0, 100),
        "strategic_objective": st.sampled_from(["", "Grow revenue"]),
    })),
})


@hyp_settings(max_examples=150)
@given(uc=_uc_strategy, ctx=_ctx_strategy)
def test_preseed_property_determinism_and_range(uc, ctx):
    s1 = score_preseed(uc, ctx)
    s2 = score_preseed(uc, ctx)
    assert s1.model_dump() == s2.model_dump()
    vals = _all_scores(s1)
    assert all(isinstance(v, int) and 1 <= v <= 5 for v in vals)


# ---------------------------------------------------------------------------
# Relationship graph (scoped node/edge projection)
# ---------------------------------------------------------------------------


def _domain_with_kpi(db):
    """A seeded (domain_id, value_lever_id, kpi_id) chain, for graph tests."""
    from models import catalog_orm as orm
    link = db.query(orm.ValueLeverKPI.value_lever_id, orm.ValueLeverKPI.kpi_id).first()
    assert link is not None, "seed should contain value_lever_kpi links"
    lever = db.query(orm.ValueLever).filter(orm.ValueLever.id == link[0]).first()
    return lever.domain_id, lever.id, link[1]


_ALL_SLUGS = {
    "industries", "industry-segments", "business-domains", "value-levers",
    "kpis", "solutions", "use-cases", "data-assets", "technology-components",
}
_OPTIONAL_SLUGS = {"kpis", "data-assets", "technology-components"}


def test_graph_domain_scope_spine_only(seeded_db, svc):
    domain_id, _lever_id, _kpi_id = _domain_with_kpi(seeded_db)
    g = svc.build_graph(seeded_db, scope_type="domain", scope_id=domain_id)

    assert g.scope.type == "domain" and g.scope.id == domain_id
    node_ids = {n.id for n in g.nodes}
    types = {n.entity_type for n in g.nodes}
    # The domain itself and at least one value lever are present.
    assert domain_id in node_ids
    assert "business-domains" in types and "value-levers" in types
    # Optional types are excluded by default.
    assert types.isdisjoint(_OPTIONAL_SLUGS)
    assert g.included == []
    # Every entity_type is a known slug.
    assert types.issubset(_ALL_SLUGS)


def test_graph_edges_have_both_endpoints_present(seeded_db, svc):
    domain_id, _lever_id, _kpi_id = _domain_with_kpi(seeded_db)
    g = svc.build_graph(
        seeded_db, scope_type="domain", scope_id=domain_id,
        include=["kpis", "data-assets", "technology-components"],
    )
    node_ids = {n.id for n in g.nodes}
    # No dangling edges: both endpoints of every edge are materialized nodes.
    for e in g.edges:
        assert e.source in node_ids, f"edge {e.id} source missing"
        assert e.target in node_ids, f"edge {e.id} target missing"
    assert g.edge_count == len(g.edges)
    assert g.node_count == len(g.nodes)


def test_graph_include_adds_optional_kpis(seeded_db, svc):
    domain_id, lever_id, kpi_id = _domain_with_kpi(seeded_db)

    without = svc.build_graph(seeded_db, scope_type="domain", scope_id=domain_id)
    assert kpi_id not in {n.id for n in without.nodes}

    with_kpis = svc.build_graph(
        seeded_db, scope_type="domain", scope_id=domain_id, include=["kpis"],
    )
    assert "kpis" in with_kpis.included
    assert kpi_id in {n.id for n in with_kpis.nodes}
    # The lever->kpi edge is present.
    assert any(
        e.rel_key == "value_lever_kpi" and e.source == lever_id and e.target == kpi_id
        for e in with_kpis.edges
    )


def test_graph_expand_pulls_neighbors_regardless_of_include(seeded_db, svc):
    domain_id, lever_id, kpi_id = _domain_with_kpi(seeded_db)
    # Without include, the KPI is absent; expanding the lever pulls it in even
    # though 'kpis' was not included.
    g = svc.build_graph(
        seeded_db, scope_type="domain", scope_id=domain_id, expand=[lever_id],
    )
    assert kpi_id in {n.id for n in g.nodes}


def test_graph_segment_scope_spans_domains(seeded_db, svc):
    from models import catalog_orm as orm
    # Choose a segment that actually has domains.
    dom = db_first_domain_with_segment(seeded_db)
    seg_id = dom.industry_segment_id
    g = svc.build_graph(seeded_db, scope_type="segment", scope_id=seg_id)
    assert g.scope.type == "segment" and g.scope.id == seg_id
    domain_nodes = [n for n in g.nodes if n.entity_type == "business-domains"]
    # All domains in the segment are present.
    seg_domain_ids = {
        r[0] for r in seeded_db.query(orm.BusinessDomain.id)
        .filter(orm.BusinessDomain.industry_segment_id == seg_id).all()
    }
    assert {n.id for n in domain_nodes} == seg_domain_ids
    assert len(domain_nodes) >= 1


def db_first_domain_with_segment(db):
    from models import catalog_orm as orm
    dom = db.query(orm.BusinessDomain).filter(
        orm.BusinessDomain.industry_segment_id.isnot(None)
    ).first()
    assert dom is not None, "seed should contain a domain with a segment"
    return dom


def test_graph_invalid_scope_type_rejected(seeded_db, svc):
    with pytest.raises(ValidationError):
        svc.build_graph(seeded_db, scope_type="galaxy", scope_id="whatever")


def test_graph_missing_scope_raises_notfound(seeded_db, svc):
    with pytest.raises(NotFound):
        svc.build_graph(seeded_db, scope_type="domain", scope_id="dom-does-not-exist")
