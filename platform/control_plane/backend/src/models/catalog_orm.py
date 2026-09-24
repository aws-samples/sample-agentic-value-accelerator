"""SQLAlchemy ORM models for the Transformation Value Model reference catalog.

Nine reusable reference entity types plus their many-to-many junctions and a
single append-only version-history table. This is the first real consumer of the
`Base.metadata` wired in ``core/database.py``; importing this module registers all
catalog tables so ``init_db()`` creates them at startup.

The column sets stay faithful to the source ``transformation_domain_model`` v2.0.0
schema but are pared to what the requirements need — every scoring, financial, and
readiness attribute that feeds ``score_preseed`` (Req 7) and the business-case
pre-seed (Req 11) is retained.
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from core.database import Base


# ---------------------------------------------------------------------------
# Common columns
# ---------------------------------------------------------------------------
# Every entity table carries the same identity, provenance, and versioning
# columns. `source_ref` holds the original SQLite id for seeded rows (unique per
# type, enabling idempotent upsert) and is null for user-created rows.


def _common_columns():
    return (
        Column("id", String, primary_key=True),
        Column("source_ref", String, nullable=True),
        Column("name", String, nullable=False),
        Column("description", Text, nullable=True),
        Column("status", String, nullable=True),
        Column("tags", Text, nullable=True),  # JSON array as text
        Column("version_no", Integer, nullable=False, default=1),
        Column("created_at", String, nullable=True),
        Column("updated_at", String, nullable=True),
        Column("created_by", String, nullable=True),
        Column("updated_by", String, nullable=True),
    )


class Industry(Base):
    __tablename__ = "catalog_industry"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_industry_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    code = Column(String, nullable=True)


class IndustrySegment(Base):
    __tablename__ = "catalog_industry_segment"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_industry_segment_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    code = Column(String, nullable=True)
    industry_id = Column(String, nullable=True)


class BusinessDomain(Base):
    __tablename__ = "catalog_business_domain"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_business_domain_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    industry_id = Column(String, nullable=True)
    industry_segment_id = Column(String, nullable=True)
    domain_category = Column(String, nullable=True)
    strategic_objective = Column(Text, nullable=True)
    value_potential_score = Column(Float, nullable=True)
    feasibility_score = Column(Float, nullable=True)
    overall_priority_score = Column(Float, nullable=True)
    data_readiness_score = Column(Float, nullable=True)
    technology_readiness_score = Column(Float, nullable=True)
    executive_sponsorship_score = Column(Float, nullable=True)


class ValueLever(Base):
    __tablename__ = "catalog_value_lever"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_value_lever_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    domain_id = Column(String, nullable=True)
    lever_type = Column(String, nullable=True)
    improvement_hypothesis = Column(Text, nullable=True)
    financial_value_low = Column(Float, nullable=True)
    financial_value_base = Column(Float, nullable=True)
    financial_value_high = Column(Float, nullable=True)
    currency = Column(String, nullable=True)
    confidence_level = Column(Integer, nullable=True)


class KPI(Base):
    __tablename__ = "catalog_kpi"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_kpi_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    unit_of_measure = Column(String, nullable=True)
    direction_of_improvement = Column(String, nullable=True)
    baseline_value = Column(Float, nullable=True)
    target_value = Column(Float, nullable=True)
    leading_or_lagging = Column(String, nullable=True)


class Solution(Base):
    __tablename__ = "catalog_solution"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_solution_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    solution_type = Column(String, nullable=True)
    benefit_low = Column(Float, nullable=True)
    benefit_base = Column(Float, nullable=True)
    benefit_high = Column(Float, nullable=True)
    investment_low = Column(Float, nullable=True)
    investment_base = Column(Float, nullable=True)
    investment_high = Column(Float, nullable=True)
    run_cost_annual = Column(Float, nullable=True)
    expected_payback_months = Column(Float, nullable=True)
    cost_currency = Column(String, nullable=True)
    value_confidence = Column(Integer, nullable=True)
    overall_risk_rating = Column(String, nullable=True)
    reusable_flag = Column(Boolean, nullable=True)
    shared_enabler_flag = Column(Boolean, nullable=True)


class CatalogUseCase(Base):
    __tablename__ = "catalog_use_case"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_use_case_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    use_case_type = Column(String, nullable=True)
    persona = Column(String, nullable=True)
    trigger_event = Column(Text, nullable=True)
    input_summary = Column(Text, nullable=True)
    processing_logic = Column(Text, nullable=True)
    output_summary = Column(Text, nullable=True)
    expected_kpi_contribution = Column(Text, nullable=True)
    complexity = Column(String, nullable=True)
    criticality = Column(String, nullable=True)
    risk_tier = Column(String, nullable=True)
    privacy_risk = Column(String, nullable=True)
    model_risk = Column(String, nullable=True)
    bias_risk = Column(String, nullable=True)
    regulatory_requirement = Column(String, nullable=True)
    human_in_loop_required = Column(Boolean, nullable=True)
    override_allowed = Column(Boolean, nullable=True)
    lifecycle_stage = Column(String, nullable=True)


class DataAsset(Base):
    __tablename__ = "catalog_data_asset"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_data_asset_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    data_asset_type = Column(String, nullable=True)
    readiness_status = Column(String, nullable=True)
    quality_score = Column(Float, nullable=True)
    completeness_score = Column(Float, nullable=True)
    sensitivity_classification = Column(String, nullable=True)
    pii_flag = Column(Boolean, nullable=True)


class TechnologyComponent(Base):
    __tablename__ = "catalog_technology_component"
    __table_args__ = (UniqueConstraint("source_ref", name="uq_catalog_technology_component_source_ref"),)

    id, source_ref, name, description, status, tags, version_no, created_at, updated_at, created_by, updated_by = _common_columns()

    technology_type = Column(String, nullable=True)
    architecture_layer = Column(String, nullable=True)
    readiness_status = Column(String, nullable=True)
    maturity_score = Column(Float, nullable=True)
    shared_platform_flag = Column(Boolean, nullable=True)


# ---------------------------------------------------------------------------
# Relationship (junction) tables
# ---------------------------------------------------------------------------
# 1:N relationships (industry->segment, segment->domain, domain->value_lever)
# are captured as FK columns on the child entity above. The M:N relationships
# below get dedicated junction tables carrying their edge attributes.


class ValueLeverKPI(Base):
    __tablename__ = "catalog_value_lever_kpi"
    __table_args__ = (
        UniqueConstraint("value_lever_id", "kpi_id", name="uq_catalog_value_lever_kpi"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    value_lever_id = Column(String, nullable=False)
    kpi_id = Column(String, nullable=False)
    is_primary = Column(Boolean, nullable=True)
    contribution_weight_pct = Column(Float, nullable=True)


class SolutionDomain(Base):
    __tablename__ = "catalog_solution_domain"
    __table_args__ = (
        UniqueConstraint("solution_id", "domain_id", name="uq_catalog_solution_domain"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    solution_id = Column(String, nullable=False)
    domain_id = Column(String, nullable=False)
    is_primary = Column(Boolean, nullable=True)


class SolutionValueLever(Base):
    __tablename__ = "catalog_solution_value_lever"
    __table_args__ = (
        UniqueConstraint("solution_id", "value_lever_id", name="uq_catalog_solution_value_lever"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    solution_id = Column(String, nullable=False)
    value_lever_id = Column(String, nullable=False)
    expected_contribution_pct = Column(Float, nullable=True)


class SolutionUseCase(Base):
    __tablename__ = "catalog_solution_use_case"
    __table_args__ = (
        UniqueConstraint("solution_id", "use_case_id", name="uq_catalog_solution_use_case"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    solution_id = Column(String, nullable=False)
    use_case_id = Column(String, nullable=False)
    relationship_type = Column(String, nullable=True)
    required_for_mvp = Column(Boolean, nullable=True)


class UseCaseDataRequirement(Base):
    __tablename__ = "catalog_use_case_data_requirement"
    __table_args__ = (
        UniqueConstraint("use_case_id", "data_asset_id", name="uq_catalog_use_case_data_requirement"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    use_case_id = Column(String, nullable=False)
    data_asset_id = Column(String, nullable=False)
    criticality = Column(String, nullable=True)
    current_readiness = Column(String, nullable=True)  # categorical in source (e.g. "partial", "target")


class UseCaseTechnologyRequirement(Base):
    __tablename__ = "catalog_use_case_technology_requirement"
    __table_args__ = (
        UniqueConstraint(
            "use_case_id", "technology_component_id", name="uq_catalog_use_case_technology_requirement"
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    use_case_id = Column(String, nullable=False)
    technology_component_id = Column(String, nullable=False)
    criticality = Column(String, nullable=True)


# ---------------------------------------------------------------------------
# Version history (append-only)
# ---------------------------------------------------------------------------


class CatalogVersionHistory(Base):
    __tablename__ = "catalog_version_history"
    __table_args__ = (
        Index("ix_catalog_history_entity", "entity_type", "entity_id", "version_no"),
        Index("ix_catalog_history_actor", "actor"),
        Index("ix_catalog_history_changed_at", "changed_at"),
    )

    id = Column(String, primary_key=True)
    entity_type = Column(String, nullable=False)  # one of the nine plural slugs
    entity_id = Column(String, nullable=False)
    version_no = Column(Integer, nullable=False)  # 1-based, monotonic per entity
    operation = Column(String, nullable=False)  # 'create' | 'update'
    actor = Column(String, nullable=False)
    changed_at = Column(String, nullable=False)  # ISO timestamp
    snapshot = Column(Text, nullable=False)  # full entity state (JSON text)
    changed_fields = Column(Text, nullable=False)  # {field: {from, to}} ; {} for create


# ---------------------------------------------------------------------------
# Catalog meta (key/value latch)
# ---------------------------------------------------------------------------
# Small single-row-per-key store for catalog-wide lifecycle state that must
# survive process restarts. Two keys are used today:
#   - "seed_applied": "true" once the shipped seed has been imported at least
#     once. The startup import is gated on this so that emptying the catalog
#     ("start from scratch") or pruning individual seed rows is NOT silently
#     undone on the next boot.
#   - "catalog_mode": informational — "examples" | "scratch" | "custom".


class CatalogMeta(Base):
    __tablename__ = "catalog_meta"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(String, nullable=True)
