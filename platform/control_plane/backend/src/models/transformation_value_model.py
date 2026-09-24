"""Pydantic API models + entity registry for the Transformation Value Model.

Each of the nine reference entity types gets a typed ``*Base`` (the faithful
attribute set), from which ``*Create``, ``*Update`` (all-optional), and ``*Read``
(adds id/version/timestamps + optional relationships block) are derived to keep
boilerplate down. The ``ENTITY_REGISTRY`` maps each plural slug to its ORM class,
Pydantic models, searchable text fields, filterable attributes, and relationship
descriptors — this is what lets one generic ``CatalogService`` serve all types.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional, Type

from pydantic import BaseModel, ConfigDict, Field, create_model

from models import catalog_orm as orm


# `model_risk` (a use-case attribute) collides with Pydantic's protected
# `model_` namespace; opt out of the protection for all catalog models.
_CATALOG_CONFIG = ConfigDict(protected_namespaces=())


# ---------------------------------------------------------------------------
# Shared / cross-entity models
# ---------------------------------------------------------------------------


class VersionRecord(BaseModel):
    """A stored snapshot of an entity at a given version."""
    entity_type: str
    entity_id: str
    version_no: int
    operation: str  # 'create' | 'update'
    actor: str
    changed_at: str
    snapshot: Dict[str, Any]
    changed_fields: Dict[str, Any]  # {field: {from, to}} ; {} for create


class VersionDiff(BaseModel):
    """Field-level differences between two versions of the same entity."""
    entity_type: str
    entity_id: str
    from_version: int
    to_version: int
    changed_fields: Dict[str, Any]  # {field: {from, to}}


class SeedImportReport(BaseModel):
    """Per-type entity counts and relationship count from a seed/document import.

    ``entities``/``relationships`` count what was inserted. ``skipped`` counts
    entity rows already present (idempotent seed re-run). ``unresolved_relationships``
    counts edges whose endpoints could not be resolved to an entity. When
    ``dry_run`` is true nothing was persisted — the counts describe what *would*
    happen."""
    entities: Dict[str, int] = Field(default_factory=dict)
    relationships: Dict[str, int] = Field(default_factory=dict)
    skipped: Dict[str, int] = Field(default_factory=dict)
    total_entities: int = 0
    total_relationships: int = 0
    unresolved_relationships: int = 0
    dry_run: bool = False
    mode: Optional[str] = None


# ---------------------------------------------------------------------------
# Relationship graph (scoped node/edge projection for visualization)
# ---------------------------------------------------------------------------
# The graph endpoint returns a render-agnostic node/edge set for one scope
# (a segment or a domain) so the frontend can lay it out (dagre today, elk /
# server-side later) without the contract changing. Nodes carry no coordinates.


class GraphNode(BaseModel):
    model_config = _CATALOG_CONFIG

    id: str
    entity_type: str  # one of the nine plural slugs
    name: str
    status: Optional[str] = None
    version_no: int = 1
    # Small, type-specific display attribute set (see GRAPH_NODE_ATTRS).
    attrs: Dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str  # source node id
    target: str  # target node id
    rel_kind: str  # 'fk' | 'junction'
    rel_key: str   # canonical relationship name (e.g. 'solution_use_case')


class GraphScope(BaseModel):
    type: str  # 'segment' | 'domain'
    id: str
    name: str


class CatalogGraph(BaseModel):
    scope: GraphScope
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    included: List[str] = Field(default_factory=list)  # optional types actually applied
    node_count: int = 0
    edge_count: int = 0
    truncated: bool = False  # true if the node cap was exceeded


# ---------------------------------------------------------------------------
# Per-entity Base models (faithful attribute sets; `name` is the sole required)
# ---------------------------------------------------------------------------


class CommonBase(BaseModel):
    model_config = _CATALOG_CONFIG

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None


class IndustryBase(CommonBase):
    code: Optional[str] = None


class IndustrySegmentBase(CommonBase):
    code: Optional[str] = None
    industry_id: Optional[str] = None


class BusinessDomainBase(CommonBase):
    industry_id: Optional[str] = None
    industry_segment_id: Optional[str] = None
    domain_category: Optional[str] = None
    strategic_objective: Optional[str] = None
    value_potential_score: Optional[float] = None
    feasibility_score: Optional[float] = None
    overall_priority_score: Optional[float] = None
    data_readiness_score: Optional[float] = None
    technology_readiness_score: Optional[float] = None
    executive_sponsorship_score: Optional[float] = None


class ValueLeverBase(CommonBase):
    domain_id: Optional[str] = None
    lever_type: Optional[str] = None
    improvement_hypothesis: Optional[str] = None
    financial_value_low: Optional[float] = None
    financial_value_base: Optional[float] = None
    financial_value_high: Optional[float] = None
    currency: Optional[str] = None
    confidence_level: Optional[int] = None


class KPIBase(CommonBase):
    unit_of_measure: Optional[str] = None
    direction_of_improvement: Optional[str] = None
    baseline_value: Optional[float] = None
    target_value: Optional[float] = None
    leading_or_lagging: Optional[str] = None


class SolutionBase(CommonBase):
    solution_type: Optional[str] = None
    benefit_low: Optional[float] = None
    benefit_base: Optional[float] = None
    benefit_high: Optional[float] = None
    investment_low: Optional[float] = None
    investment_base: Optional[float] = None
    investment_high: Optional[float] = None
    run_cost_annual: Optional[float] = None
    expected_payback_months: Optional[float] = None
    cost_currency: Optional[str] = None
    value_confidence: Optional[int] = None
    overall_risk_rating: Optional[str] = None
    reusable_flag: Optional[bool] = None
    shared_enabler_flag: Optional[bool] = None


class CatalogUseCaseBase(CommonBase):
    use_case_type: Optional[str] = None
    persona: Optional[str] = None
    trigger_event: Optional[str] = None
    input_summary: Optional[str] = None
    processing_logic: Optional[str] = None
    output_summary: Optional[str] = None
    expected_kpi_contribution: Optional[str] = None
    complexity: Optional[str] = None
    criticality: Optional[str] = None
    risk_tier: Optional[str] = None
    privacy_risk: Optional[str] = None
    model_risk: Optional[str] = None
    bias_risk: Optional[str] = None
    regulatory_requirement: Optional[str] = None
    human_in_loop_required: Optional[bool] = None
    override_allowed: Optional[bool] = None
    lifecycle_stage: Optional[str] = None


class DataAssetBase(CommonBase):
    data_asset_type: Optional[str] = None
    readiness_status: Optional[str] = None
    quality_score: Optional[float] = None
    completeness_score: Optional[float] = None
    sensitivity_classification: Optional[str] = None
    pii_flag: Optional[bool] = None


class TechnologyComponentBase(CommonBase):
    technology_type: Optional[str] = None
    architecture_layer: Optional[str] = None
    readiness_status: Optional[str] = None
    maturity_score: Optional[float] = None
    shared_platform_flag: Optional[bool] = None


# ---------------------------------------------------------------------------
# Derive Create / Update / Read variants programmatically
# ---------------------------------------------------------------------------
# Create = Base + optional `relationships` (map of rel-key -> list of target ids).
# Update = every Base field made optional (partial update).
# Read   = Base + id/source_ref/version_no/timestamps/actors + optional
#          `relationships` block (populated on get-with-relationships).


_META_FIELDS = {
    "id": (str, ...),
    "source_ref": (Optional[str], None),
    "version_no": (int, 1),
    "created_at": (Optional[str], None),
    "updated_at": (Optional[str], None),
    "created_by": (Optional[str], None),
    "updated_by": (Optional[str], None),
    "relationships": (Optional[Dict[str, List[Dict[str, Any]]]], None),
}


def _make_create(base: Type[BaseModel], name: str) -> Type[BaseModel]:
    return create_model(
        name,
        __base__=base,
        relationships=(Optional[Dict[str, List[str]]], None),
    )


def _make_update(base: Type[BaseModel], name: str) -> Type[BaseModel]:
    fields: Dict[str, Any] = {}
    for fname, finfo in base.model_fields.items():
        fields[fname] = (Optional[finfo.annotation], None)
    fields["relationships"] = (Optional[Dict[str, List[str]]], None)
    return create_model(name, __config__=_CATALOG_CONFIG, **fields)


def _make_read(base: Type[BaseModel], name: str) -> Type[BaseModel]:
    return create_model(name, __base__=base, **_META_FIELDS)


# ---------------------------------------------------------------------------
# Relationship descriptors
# ---------------------------------------------------------------------------


@dataclass
class Rel:
    """Describes how an entity connects to a related entity type.

    kind:
      - 'fk_out'   : this entity has column `local_col` referencing target.id
      - 'fk_in'    : target entity has column `remote_col` referencing this.id
      - 'junction' : M:N via `junction` ORM, `junction_local` -> this.id,
                     `junction_remote` -> target.id
    """
    key: str
    target_type: str
    kind: str
    local_col: Optional[str] = None
    remote_col: Optional[str] = None
    junction: Optional[type] = None
    junction_local: Optional[str] = None
    junction_remote: Optional[str] = None


# ---------------------------------------------------------------------------
# Entity registry
# ---------------------------------------------------------------------------


@dataclass
class EntitySpec:
    slug: str  # plural slug used in the API path
    label: str
    orm: type
    base: Type[BaseModel]
    create: Type[BaseModel]
    update: Type[BaseModel]
    read: Type[BaseModel]
    id_prefix: str
    search_fields: List[str]
    filter_fields: List[str]
    relationships: List[Rel] = dc_field(default_factory=list)

    @property
    def rel_by_key(self) -> Dict[str, Rel]:
        return {r.key: r for r in self.relationships}


def _spec(slug, label, ormcls, base, id_prefix, search_fields, filter_fields, relationships):
    cname = base.__name__.replace("Base", "")
    return EntitySpec(
        slug=slug,
        label=label,
        orm=ormcls,
        base=base,
        create=_make_create(base, f"{cname}Create"),
        update=_make_update(base, f"{cname}Update"),
        read=_make_read(base, f"{cname}Read"),
        id_prefix=id_prefix,
        search_fields=search_fields,
        filter_fields=filter_fields,
        relationships=relationships,
    )


ENTITY_REGISTRY: Dict[str, EntitySpec] = {
    "industries": _spec(
        "industries", "Industry", orm.Industry, IndustryBase, "ind",
        ["name", "description"], ["code", "status"],
        [Rel("segments", "industry-segments", "fk_in", remote_col="industry_id")],
    ),
    "industry-segments": _spec(
        "industry-segments", "Industry Segment", orm.IndustrySegment, IndustrySegmentBase, "seg",
        ["name", "description"], ["code", "status", "industry_id"],
        [
            Rel("industry", "industries", "fk_out", local_col="industry_id"),
            Rel("domains", "business-domains", "fk_in", remote_col="industry_segment_id"),
        ],
    ),
    "business-domains": _spec(
        "business-domains", "Business Domain", orm.BusinessDomain, BusinessDomainBase, "dom",
        ["name", "description", "strategic_objective"],
        ["domain_category", "status", "industry_id", "industry_segment_id"],
        [
            Rel("industry_segment", "industry-segments", "fk_out", local_col="industry_segment_id"),
            Rel("value_levers", "value-levers", "fk_in", remote_col="domain_id"),
            Rel("solutions", "solutions", "junction", junction=orm.SolutionDomain,
                junction_local="domain_id", junction_remote="solution_id"),
        ],
    ),
    "value-levers": _spec(
        "value-levers", "Value Lever", orm.ValueLever, ValueLeverBase, "lev",
        ["name", "description", "improvement_hypothesis"],
        ["lever_type", "status", "domain_id"],
        [
            Rel("domain", "business-domains", "fk_out", local_col="domain_id"),
            Rel("kpis", "kpis", "junction", junction=orm.ValueLeverKPI,
                junction_local="value_lever_id", junction_remote="kpi_id"),
            Rel("solutions", "solutions", "junction", junction=orm.SolutionValueLever,
                junction_local="value_lever_id", junction_remote="solution_id"),
        ],
    ),
    "kpis": _spec(
        "kpis", "KPI", orm.KPI, KPIBase, "kpi",
        ["name", "description"],
        ["unit_of_measure", "direction_of_improvement", "leading_or_lagging", "status"],
        [
            Rel("value_levers", "value-levers", "junction", junction=orm.ValueLeverKPI,
                junction_local="kpi_id", junction_remote="value_lever_id"),
        ],
    ),
    "solutions": _spec(
        "solutions", "Solution", orm.Solution, SolutionBase, "sol",
        ["name", "description"], ["solution_type", "overall_risk_rating", "status"],
        [
            Rel("domains", "business-domains", "junction", junction=orm.SolutionDomain,
                junction_local="solution_id", junction_remote="domain_id"),
            Rel("value_levers", "value-levers", "junction", junction=orm.SolutionValueLever,
                junction_local="solution_id", junction_remote="value_lever_id"),
            Rel("use_cases", "use-cases", "junction", junction=orm.SolutionUseCase,
                junction_local="solution_id", junction_remote="use_case_id"),
        ],
    ),
    "use-cases": _spec(
        "use-cases", "Use Case", orm.CatalogUseCase, CatalogUseCaseBase, "uc",
        ["name", "description", "output_summary"],
        ["use_case_type", "complexity", "criticality", "risk_tier", "lifecycle_stage", "status"],
        [
            Rel("solutions", "solutions", "junction", junction=orm.SolutionUseCase,
                junction_local="use_case_id", junction_remote="solution_id"),
            Rel("data_assets", "data-assets", "junction", junction=orm.UseCaseDataRequirement,
                junction_local="use_case_id", junction_remote="data_asset_id"),
            Rel("technology_components", "technology-components", "junction",
                junction=orm.UseCaseTechnologyRequirement,
                junction_local="use_case_id", junction_remote="technology_component_id"),
        ],
    ),
    "data-assets": _spec(
        "data-assets", "Data Asset", orm.DataAsset, DataAssetBase, "dat",
        ["name", "description"],
        ["data_asset_type", "readiness_status", "sensitivity_classification", "status"],
        [
            Rel("use_cases", "use-cases", "junction", junction=orm.UseCaseDataRequirement,
                junction_local="data_asset_id", junction_remote="use_case_id"),
        ],
    ),
    "technology-components": _spec(
        "technology-components", "Technology Component", orm.TechnologyComponent,
        TechnologyComponentBase, "tec",
        ["name", "description"],
        ["technology_type", "architecture_layer", "readiness_status", "status"],
        [
            Rel("use_cases", "use-cases", "junction", junction=orm.UseCaseTechnologyRequirement,
                junction_local="technology_component_id", junction_remote="use_case_id"),
        ],
    ),
}


# Map an ORM relationship "target_type" plural slug to its junction column for
# the source entity type — used by the seed importer to key relationships.
JUNCTION_TABLES = {
    "value_lever_kpi": orm.ValueLeverKPI,
    "solution_domain": orm.SolutionDomain,
    "solution_value_lever": orm.SolutionValueLever,
    "solution_use_case": orm.SolutionUseCase,
    "use_case_data_requirement": orm.UseCaseDataRequirement,
    "use_case_technology_requirement": orm.UseCaseTechnologyRequirement,
}


def get_spec(slug: str) -> Optional[EntitySpec]:
    return ENTITY_REGISTRY.get(slug)
