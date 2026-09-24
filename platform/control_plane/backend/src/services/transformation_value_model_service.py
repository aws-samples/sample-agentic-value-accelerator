"""CatalogService — generic CRUD, search/filter, relationships, and versioning
for the nine Transformation Value Model reference entity types.

One service serves all types via the ``ENTITY_REGISTRY``: it maps an entity-type
plural slug to its ORM class, Pydantic models, searchable text fields, filterable
attributes, and relationship descriptors. Every write appends an immutable row to
``catalog_version_history`` (Req 5, 6). All methods take a SQLAlchemy ``Session``.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models import catalog_orm as orm
from models.transformation_value_model import (
    ENTITY_REGISTRY,
    CatalogGraph,
    EntitySpec,
    GraphEdge,
    GraphNode,
    GraphScope,
    Rel,
    VersionDiff,
    VersionRecord,
)


class CatalogError(Exception):
    """Base catalog error."""


class UnknownEntityType(CatalogError):
    def __init__(self, slug: str):
        super().__init__(f"Unknown entity type: {slug}")
        self.slug = slug


class NotFound(CatalogError):
    def __init__(self, slug: str, entity_id: str):
        super().__init__(f"{slug} '{entity_id}' not found")


class ValidationError(CatalogError):
    """Raised for missing required fields or unresolved relationship references."""


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


# Columns that live on every entity table but are managed by the service, not by
# the caller's create/update payload.
_MANAGED = {"id", "source_ref", "version_no", "created_at", "updated_at",
            "created_by", "updated_by"}


# ---------------------------------------------------------------------------
# Relationship-graph metadata
# ---------------------------------------------------------------------------
# Canonical, directed edge families spanning the catalog. FK families derive the
# edge from a child column; junction families from a join table. This is the
# single source of truth the graph builder scans in both directions.

_GRAPH_EDGE_FAMILIES: List[Dict[str, Any]] = [
    # FK (child -> parent) edges
    {"kind": "fk", "rel": "segment_industry", "source": "industry-segments",
     "target": "industries", "col": "industry_id"},
    {"kind": "fk", "rel": "domain_segment", "source": "business-domains",
     "target": "industry-segments", "col": "industry_segment_id"},
    {"kind": "fk", "rel": "lever_domain", "source": "value-levers",
     "target": "business-domains", "col": "domain_id"},
    # Junction (M:N) edges
    {"kind": "junction", "rel": "solution_domain", "orm": orm.SolutionDomain,
     "source": "solutions", "target": "business-domains",
     "source_col": "solution_id", "target_col": "domain_id"},
    {"kind": "junction", "rel": "solution_value_lever", "orm": orm.SolutionValueLever,
     "source": "solutions", "target": "value-levers",
     "source_col": "solution_id", "target_col": "value_lever_id"},
    {"kind": "junction", "rel": "solution_use_case", "orm": orm.SolutionUseCase,
     "source": "solutions", "target": "use-cases",
     "source_col": "solution_id", "target_col": "use_case_id"},
    {"kind": "junction", "rel": "value_lever_kpi", "orm": orm.ValueLeverKPI,
     "source": "value-levers", "target": "kpis",
     "source_col": "value_lever_id", "target_col": "kpi_id"},
    {"kind": "junction", "rel": "use_case_data_asset", "orm": orm.UseCaseDataRequirement,
     "source": "use-cases", "target": "data-assets",
     "source_col": "use_case_id", "target_col": "data_asset_id"},
    {"kind": "junction", "rel": "use_case_technology_component",
     "orm": orm.UseCaseTechnologyRequirement, "source": "use-cases",
     "target": "technology-components",
     "source_col": "use_case_id", "target_col": "technology_component_id"},
]

# Optional entity types (off by default) — added only via `include` or `expand`.
_GRAPH_OPTIONAL_TYPES = {"kpis", "data-assets", "technology-components"}

# Curated per-type display attributes surfaced on graph node cards. Kept small so
# payloads stay light; the detail panel fetches the full entity on demand.
_GRAPH_NODE_ATTRS: Dict[str, List[str]] = {
    "industries": ["code"],
    "industry-segments": ["code", "industry_id"],
    "business-domains": ["domain_category", "overall_priority_score",
                         "value_potential_score", "feasibility_score"],
    "value-levers": ["lever_type", "financial_value_base", "currency"],
    "kpis": ["unit_of_measure", "direction_of_improvement", "target_value"],
    "solutions": ["solution_type", "benefit_base", "investment_base", "overall_risk_rating"],
    "use-cases": ["use_case_type", "complexity", "criticality", "risk_tier"],
    "data-assets": ["data_asset_type", "readiness_status", "sensitivity_classification"],
    "technology-components": ["technology_type", "architecture_layer", "readiness_status"],
}

# Safety cap so a pathological scope can't return an unbounded graph.
_GRAPH_MAX_NODES = 2000

# Order in which to delete entity types during a bulk clear: children before
# parents so FK chains (industries <- segments <- domains <- value-levers) never
# leave dangling references mid-operation. Junction-only types (no FK parent) can
# appear anywhere; they're placed early. Any residual dangling refs are repaired
# by ``_repair_integrity`` afterwards.
_DELETE_ORDER = [
    "use-cases", "solutions", "value-levers", "kpis",
    "data-assets", "technology-components",
    "business-domains", "industry-segments", "industries",
]


class CatalogService:
    def __init__(self, registry: Dict[str, EntitySpec] = ENTITY_REGISTRY):
        self.registry = registry

    # -- helpers ------------------------------------------------------------

    def _spec(self, slug: str) -> EntitySpec:
        spec = self.registry.get(slug)
        if spec is None:
            raise UnknownEntityType(slug)
        return spec

    @staticmethod
    def _orm_columns(ormcls: type) -> List[str]:
        return [c.name for c in ormcls.__table__.columns]

    def _entity_attr_columns(self, spec: EntitySpec) -> List[str]:
        """Non-managed scalar columns settable from a payload."""
        return [c for c in self._orm_columns(spec.orm) if c not in _MANAGED]

    @staticmethod
    def _dump_tags(value) -> Optional[str]:
        if value is None:
            return None
        return json.dumps(value)

    @staticmethod
    def _load_tags(value):
        if value is None:
            return None
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return None

    def _to_dict(self, spec: EntitySpec, row) -> Dict[str, Any]:
        """ORM row -> plain dict (tags parsed back to a list)."""
        out: Dict[str, Any] = {}
        for col in self._orm_columns(spec.orm):
            val = getattr(row, col)
            if col == "tags":
                val = self._load_tags(val)
            out[col] = val
        return out

    # -- validation ---------------------------------------------------------

    def _validate_payload(self, spec: EntitySpec, payload: Dict[str, Any], *, partial: bool):
        # Required field: name (non-empty) on create.
        if not partial:
            name = payload.get("name")
            if name is None or str(name).strip() == "":
                raise ValidationError("Field 'name' is required")

    def _validate_relationships(self, db: Session, spec: EntitySpec,
                                relationships: Optional[Dict[str, List[str]]]):
        """Ensure every referenced related entity exists (Req 5.5)."""
        if not relationships:
            return
        for key, ids in relationships.items():
            rel = spec.rel_by_key.get(key)
            if rel is None:
                raise ValidationError(f"Unknown relationship '{key}' for {spec.slug}")
            target = self._spec(rel.target_type)
            for rid in ids or []:
                exists = db.query(target.orm.id).filter(target.orm.id == rid).first()
                if not exists:
                    raise ValidationError(
                        f"Unresolved reference in '{key}': {target.slug} '{rid}' does not exist"
                    )

    # -- versioning ---------------------------------------------------------

    def _write_history(self, db: Session, spec: EntitySpec, entity_id: str,
                       version_no: int, operation: str, actor: str,
                       snapshot: Dict[str, Any], changed_fields: Dict[str, Any]):
        db.add(orm.CatalogVersionHistory(
            id=f"vh-{uuid.uuid4().hex}",
            entity_type=spec.slug,
            entity_id=entity_id,
            version_no=version_no,
            operation=operation,
            actor=actor,
            changed_at=_now(),
            snapshot=json.dumps(snapshot, default=str),
            changed_fields=json.dumps(changed_fields, default=str),
        ))

    @staticmethod
    def _diff(old: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
        """Field-level diff: {field: {from, to}} for changed fields only."""
        changed: Dict[str, Any] = {}
        keys = set(old) | set(new)
        for k in keys:
            if k in ("version_no", "updated_at", "updated_by"):
                continue
            ov, nv = old.get(k), new.get(k)
            if ov != nv:
                changed[k] = {"from": ov, "to": nv}
        return changed

    # -- relationship persistence ------------------------------------------

    def _set_relationships(self, db: Session, spec: EntitySpec, entity_id: str,
                           relationships: Optional[Dict[str, List[str]]], *, replace: bool):
        """Insert junction/FK relationships for a create or update.

        For FK-out relationships (this entity owns the FK), set the column.
        For junction relationships, insert edge rows (idempotent). When
        ``replace`` is true (update), junction edges for the given keys are
        cleared first so the payload is authoritative.
        """
        if relationships is None:
            return
        for key, ids in relationships.items():
            rel = spec.rel_by_key.get(key)
            if rel is None or rel.kind == "fk_in":
                # fk_in relationships are owned by the *other* entity; ignore here.
                continue
            if rel.kind == "fk_out":
                # Single-valued: take first id (or None to clear).
                setattr_id = ids[0] if ids else None
                row = db.query(spec.orm).filter(spec.orm.id == entity_id).first()
                if row is not None:
                    setattr(row, rel.local_col, setattr_id)
            elif rel.kind == "junction":
                if replace:
                    db.query(rel.junction).filter(
                        getattr(rel.junction, rel.junction_local) == entity_id
                    ).delete(synchronize_session=False)
                for rid in ids or []:
                    exists = db.query(rel.junction).filter(
                        getattr(rel.junction, rel.junction_local) == entity_id,
                        getattr(rel.junction, rel.junction_remote) == rid,
                    ).first()
                    if not exists:
                        edge = rel.junction()
                        setattr(edge, rel.junction_local, entity_id)
                        setattr(edge, rel.junction_remote, rid)
                        db.add(edge)

    # -- create / update ----------------------------------------------------

    def create(self, db: Session, slug: str, payload: Dict[str, Any], actor: str,
               *, source_ref: Optional[str] = None) -> Dict[str, Any]:
        spec = self._spec(slug)
        relationships = payload.pop("relationships", None)
        self._validate_payload(spec, payload, partial=False)
        self._validate_relationships(db, spec, relationships)

        entity_id = f"{spec.id_prefix}-{uuid.uuid4().hex[:10]}"
        now = _now()
        attrs = self._entity_attr_columns(spec)
        row = spec.orm(id=entity_id, source_ref=source_ref, version_no=1,
                       created_at=now, updated_at=now, created_by=actor, updated_by=actor)
        for col in attrs:
            if col in payload:
                val = payload[col]
                if col == "tags":
                    val = self._dump_tags(val)
                setattr(row, col, val)
        db.add(row)
        db.flush()  # ensure row exists before relationship writes

        self._set_relationships(db, spec, entity_id, relationships, replace=False)
        db.flush()

        snapshot = self._to_dict(spec, row)
        self._write_history(db, spec, entity_id, 1, "create", actor, snapshot, {})
        db.commit()
        return self.get(db, slug, entity_id)

    def update(self, db: Session, slug: str, entity_id: str, payload: Dict[str, Any],
               actor: str) -> Dict[str, Any]:
        spec = self._spec(slug)
        row = db.query(spec.orm).filter(spec.orm.id == entity_id).first()
        if row is None:
            raise NotFound(slug, entity_id)

        relationships = payload.pop("relationships", None)
        self._validate_payload(spec, payload, partial=True)
        self._validate_relationships(db, spec, relationships)

        before = self._to_dict(spec, row)

        attrs = self._entity_attr_columns(spec)
        for col in attrs:
            if col in payload and payload[col] is not None:
                val = payload[col]
                if col == "tags":
                    val = self._dump_tags(val)
                setattr(row, col, val)

        if relationships is not None:
            self._set_relationships(db, spec, entity_id, relationships, replace=True)
            db.flush()

        after = self._to_dict(spec, row)
        changed = self._diff(before, after)

        new_version = int(row.version_no or 1) + 1
        row.version_no = new_version
        row.updated_at = _now()
        row.updated_by = actor
        db.flush()

        snapshot = self._to_dict(spec, row)
        self._write_history(db, spec, entity_id, new_version, "update", actor, snapshot, changed)
        db.commit()
        return self.get(db, slug, entity_id)

    # -- delete / clear -----------------------------------------------------

    def _fk_in_children(self, db: Session, spec: EntitySpec,
                        entity_id: str) -> Dict[str, List[str]]:
        """Ids of entities that reference this one via an fk_in relationship.

        These would be orphaned by a plain delete, so a single delete blocks on
        them unless ``cascade`` is set."""
        out: Dict[str, List[str]] = {}
        for rel in spec.relationships:
            if rel.kind != "fk_in":
                continue
            target = self._spec(rel.target_type)
            ids = [r[0] for r in db.query(target.orm.id).filter(
                getattr(target.orm, rel.remote_col) == entity_id
            ).all()]
            if ids:
                out[rel.target_type] = ids
        return out

    def _delete_junction_edges(self, db: Session, spec: EntitySpec, entity_id: str) -> None:
        """Remove every junction edge in which this entity participates.

        Each entity's spec lists all junctions it belongs to with ``junction_local``
        set to its own column, so deleting where ``junction_local == entity_id``
        clears this entity's membership from that entity's own perspective."""
        for rel in spec.relationships:
            if rel.kind != "junction":
                continue
            db.query(rel.junction).filter(
                getattr(rel.junction, rel.junction_local) == entity_id
            ).delete(synchronize_session=False)

    def _delete_row(self, db: Session, spec: EntitySpec, row, actor: str) -> None:
        """Delete a single ORM row: clear its junction edges, record a 'delete'
        history entry, then remove the row. Caller commits."""
        entity_id = row.id
        self._delete_junction_edges(db, spec, entity_id)
        snapshot = self._to_dict(spec, row)
        version_no = int(row.version_no or 1) + 1
        db.delete(row)
        db.flush()
        self._write_history(db, spec, entity_id, version_no, "delete", actor, snapshot, {})

    def delete(self, db: Session, slug: str, entity_id: str, actor: str,
               *, cascade: bool = False) -> Dict[str, Any]:
        """Delete one entity. Blocks if fk_in children would be orphaned unless
        ``cascade`` is set, in which case children are deleted depth-first first.
        Returns ``{deleted: [...ids], counts: {slug: n}}``."""
        spec = self._spec(slug)
        row = db.query(spec.orm).filter(spec.orm.id == entity_id).first()
        if row is None:
            raise NotFound(slug, entity_id)

        children = self._fk_in_children(db, spec, entity_id)
        deleted: List[str] = []
        counts: Dict[str, int] = {}

        if children and not cascade:
            parts = ", ".join(f"{len(ids)} {tslug}" for tslug, ids in children.items())
            raise ValidationError(
                f"Cannot delete {slug} '{entity_id}': {parts} still reference it. "
                f"Delete those first or retry with cascade=true."
            )
        if children and cascade:
            for child_slug, ids in children.items():
                for cid in ids:
                    sub = self.delete(db, child_slug, cid, actor, cascade=True)
                    deleted.extend(sub["deleted"])
                    for k, v in sub["counts"].items():
                        counts[k] = counts.get(k, 0) + v

        self._delete_row(db, spec, row, actor)
        deleted.append(entity_id)
        counts[slug] = counts.get(slug, 0) + 1
        db.commit()
        return {"deleted": deleted, "counts": counts}

    def clear(self, db: Session, scope: str, actor: str) -> Dict[str, int]:
        """Bulk-remove catalog entities by provenance scope.

        scope:
          - ``examples``: rows imported from the shipped seed (source_ref not null)
          - ``user``: rows created by users (source_ref null)
          - ``all``: everything

        Entities are removed children-first (``_DELETE_ORDER``); junction edges are
        cleared per row, and ``_repair_integrity`` afterwards nulls any FK left
        dangling on surviving rows (relevant when only ``examples`` are cleared but
        user rows still point at them). Returns per-type deletion counts."""
        if scope not in ("examples", "user", "all"):
            raise ValidationError("scope must be one of: examples, user, all")

        counts: Dict[str, int] = {}
        for slug in _DELETE_ORDER:
            spec = self._spec(slug)
            query = db.query(spec.orm)
            if scope == "examples":
                query = query.filter(spec.orm.source_ref.isnot(None))
            elif scope == "user":
                query = query.filter(spec.orm.source_ref.is_(None))
            n = 0
            for row in query.all():
                self._delete_row(db, spec, row, actor)
                n += 1
            counts[slug] = n

        self._repair_integrity(db)
        db.commit()
        return counts

    def _repair_integrity(self, db: Session) -> None:
        """Null child FK columns pointing at now-missing parents and drop junction
        edges with a missing endpoint. Idempotent; safe to call after any delete."""
        for fam in _GRAPH_EDGE_FAMILIES:
            if fam["kind"] == "fk":
                child = ENTITY_REGISTRY[fam["source"]].orm
                target = ENTITY_REGISTRY[fam["target"]].orm
                col_name = fam["col"]
                valid = {r[0] for r in db.query(target.id).all()}
                for row in db.query(child).filter(getattr(child, col_name).isnot(None)).all():
                    if getattr(row, col_name) not in valid:
                        setattr(row, col_name, None)
            else:  # junction
                j = fam["orm"]
                src_valid = {r[0] for r in db.query(ENTITY_REGISTRY[fam["source"]].orm.id).all()}
                tgt_valid = {r[0] for r in db.query(ENTITY_REGISTRY[fam["target"]].orm.id).all()}
                sc, tc = fam["source_col"], fam["target_col"]
                for edge in db.query(j).all():
                    if getattr(edge, sc) not in src_valid or getattr(edge, tc) not in tgt_valid:
                        db.delete(edge)
        db.flush()

    # -- read ---------------------------------------------------------------

    def get(self, db: Session, slug: str, entity_id: str, *,
            with_relationships: bool = False) -> Dict[str, Any]:
        spec = self._spec(slug)
        row = db.query(spec.orm).filter(spec.orm.id == entity_id).first()
        if row is None:
            raise NotFound(slug, entity_id)
        result = self._to_dict(spec, row)
        if with_relationships:
            result["relationships"] = self._resolve_relationships(db, spec, entity_id)
        return result

    def _resolve_relationships(self, db: Session, spec: EntitySpec,
                               entity_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """Return, per relationship key, the list of directly related entities
        (id + name + type) so the frontend can render context and traceability."""
        out: Dict[str, List[Dict[str, Any]]] = {}
        for rel in spec.relationships:
            target = self._spec(rel.target_type)
            related_ids: List[str] = []
            if rel.kind == "fk_out":
                row = db.query(spec.orm).filter(spec.orm.id == entity_id).first()
                val = getattr(row, rel.local_col, None) if row else None
                if val:
                    related_ids = [val]
            elif rel.kind == "fk_in":
                rows = db.query(target.orm.id).filter(
                    getattr(target.orm, rel.remote_col) == entity_id
                ).all()
                related_ids = [r[0] for r in rows]
            elif rel.kind == "junction":
                rows = db.query(getattr(rel.junction, rel.junction_remote)).filter(
                    getattr(rel.junction, rel.junction_local) == entity_id
                ).all()
                related_ids = [r[0] for r in rows]

            items = []
            if related_ids:
                trows = db.query(target.orm.id, target.orm.name).filter(
                    target.orm.id.in_(related_ids)
                ).all()
                items = [{"id": r[0], "name": r[1], "type": target.slug} for r in trows]
            out[rel.key] = items
        return out

    # -- list / search / filter --------------------------------------------

    def list(self, db: Session, slug: str, *, q: Optional[str] = None,
             filters: Optional[Dict[str, Any]] = None,
             related: Optional[Dict[str, str]] = None,
             limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        spec = self._spec(slug)
        query = db.query(spec.orm)

        # Text search across the registered search fields (case-insensitive).
        if q:
            like = f"%{q.lower()}%"
            clauses = [func.lower(getattr(spec.orm, f)).like(like)
                       for f in spec.search_fields if hasattr(spec.orm, f)]
            if clauses:
                query = query.filter(or_(*clauses))

        # Attribute equality filters (only registered filterable columns).
        if filters:
            for col, val in filters.items():
                if col in spec.filter_fields and hasattr(spec.orm, col):
                    query = query.filter(getattr(spec.orm, col) == val)

        # Relationship filters: keep only entities related to a specific target.
        if related:
            for key, target_id in related.items():
                rel = spec.rel_by_key.get(key)
                if rel is None:
                    raise ValidationError(f"Unknown relationship filter '{key}' for {spec.slug}")
                query = self._apply_relationship_filter(db, spec, query, rel, target_id)

        query = query.order_by(spec.orm.name).offset(offset).limit(limit)
        return [self._to_dict(spec, r) for r in query.all()]

    def _apply_relationship_filter(self, db: Session, spec: EntitySpec, query,
                                   rel: Rel, target_id: str):
        if rel.kind == "fk_out":
            return query.filter(getattr(spec.orm, rel.local_col) == target_id)
        if rel.kind == "fk_in":
            # entities whose child (target) points back — filter to those having
            # a child with id == target_id is unusual; instead filter this entity
            # by the child's remote FK equal to this id is not applicable here.
            sub = db.query(getattr(self._spec(rel.target_type).orm, rel.remote_col)).filter(
                self._spec(rel.target_type).orm.id == target_id
            )
            return query.filter(spec.orm.id.in_(sub))
        if rel.kind == "junction":
            sub = db.query(getattr(rel.junction, rel.junction_local)).filter(
                getattr(rel.junction, rel.junction_remote) == target_id
            )
            return query.filter(spec.orm.id.in_(sub))
        return query

    # -- relationship graph -------------------------------------------------

    def build_graph(self, db: Session, *, scope_type: str, scope_id: str,
                    include: Optional[List[str]] = None,
                    expand: Optional[List[str]] = None) -> CatalogGraph:
        """Assemble a scoped node/edge projection of the catalog.

        Scope is required and bounds the payload: ``domain`` yields one domain and
        its spine (value levers -> solutions -> use cases); ``segment`` yields all
        domains in the segment and their spine. Optional types (kpis, data-assets,
        technology-components) are added only when named in ``include``. ``expand``
        pulls the direct (1-hop) neighbors of the given node ids across every
        relationship, regardless of type — this powers click-to-expand. An edge is
        emitted only when both of its endpoints are present, so the graph is always
        internally consistent (no dangling edges).
        """
        if scope_type not in ("segment", "domain"):
            raise ValidationError("scope_type must be 'segment' or 'domain'")

        include_set = {s for s in (include or []) if s in _GRAPH_OPTIONAL_TYPES}
        expand_ids = {s for s in (expand or []) if s}

        # Node id accumulator, keyed by entity slug.
        ids: Dict[str, set] = {slug: set() for slug in ENTITY_REGISTRY}

        # --- scope roots + spine ------------------------------------------
        if scope_type == "domain":
            dom = db.query(orm.BusinessDomain).filter(orm.BusinessDomain.id == scope_id).first()
            if dom is None:
                raise NotFound("business-domains", scope_id)
            scope_name = dom.name
            ids["business-domains"].add(dom.id)
            if dom.industry_segment_id:
                ids["industry-segments"].add(dom.industry_segment_id)
            if dom.industry_id:
                ids["industries"].add(dom.industry_id)
            domain_ids = {dom.id}
        else:  # segment
            seg = db.query(orm.IndustrySegment).filter(orm.IndustrySegment.id == scope_id).first()
            if seg is None:
                raise NotFound("industry-segments", scope_id)
            scope_name = seg.name
            ids["industry-segments"].add(seg.id)
            if seg.industry_id:
                ids["industries"].add(seg.industry_id)
            domain_ids = {
                r[0] for r in db.query(orm.BusinessDomain.id)
                .filter(orm.BusinessDomain.industry_segment_id == seg.id).all()
            }
            ids["business-domains"].update(domain_ids)

        # value levers of the in-scope domains
        lever_ids = {
            r[0] for r in db.query(orm.ValueLever.id)
            .filter(orm.ValueLever.domain_id.in_(domain_ids)).all()
        } if domain_ids else set()
        ids["value-levers"].update(lever_ids)

        # solutions linked to those levers or directly to the domains
        sol_ids: set = set()
        if lever_ids:
            sol_ids.update(
                r[0] for r in db.query(orm.SolutionValueLever.solution_id)
                .filter(orm.SolutionValueLever.value_lever_id.in_(lever_ids)).all()
            )
        if domain_ids:
            sol_ids.update(
                r[0] for r in db.query(orm.SolutionDomain.solution_id)
                .filter(orm.SolutionDomain.domain_id.in_(domain_ids)).all()
            )
        ids["solutions"].update(sol_ids)

        # use cases delivered by those solutions
        uc_ids = {
            r[0] for r in db.query(orm.SolutionUseCase.use_case_id)
            .filter(orm.SolutionUseCase.solution_id.in_(sol_ids)).all()
        } if sol_ids else set()
        ids["use-cases"].update(uc_ids)

        # --- optional types (only when requested) -------------------------
        if "kpis" in include_set and lever_ids:
            ids["kpis"].update(
                r[0] for r in db.query(orm.ValueLeverKPI.kpi_id)
                .filter(orm.ValueLeverKPI.value_lever_id.in_(lever_ids)).all()
            )
        if "data-assets" in include_set and uc_ids:
            ids["data-assets"].update(
                r[0] for r in db.query(orm.UseCaseDataRequirement.data_asset_id)
                .filter(orm.UseCaseDataRequirement.use_case_id.in_(uc_ids)).all()
            )
        if "technology-components" in include_set and uc_ids:
            ids["technology-components"].update(
                r[0] for r in db.query(orm.UseCaseTechnologyRequirement.technology_component_id)
                .filter(orm.UseCaseTechnologyRequirement.use_case_id.in_(uc_ids)).all()
            )

        # --- expand: 1-hop neighbors of the given nodes, any type ---------
        if expand_ids:
            for fam in _GRAPH_EDGE_FAMILIES:
                src_slug, tgt_slug = fam["source"], fam["target"]
                if fam["kind"] == "fk":
                    child = ENTITY_REGISTRY[src_slug].orm
                    col = getattr(child, fam["col"])
                    for cid, tval in db.query(child.id, col).filter(
                        or_(child.id.in_(expand_ids), col.in_(expand_ids))
                    ).all():
                        ids[src_slug].add(cid)
                        if tval:
                            ids[tgt_slug].add(tval)
                else:
                    j = fam["orm"]
                    sc = getattr(j, fam["source_col"])
                    tc = getattr(j, fam["target_col"])
                    for sval, tval in db.query(sc, tc).filter(
                        or_(sc.in_(expand_ids), tc.in_(expand_ids))
                    ).all():
                        ids[src_slug].add(sval)
                        ids[tgt_slug].add(tval)

        # --- materialize nodes --------------------------------------------
        nodes: List[GraphNode] = []
        for slug, idset in ids.items():
            if not idset:
                continue
            ormcls = ENTITY_REGISTRY[slug].orm
            attr_cols = _GRAPH_NODE_ATTRS.get(slug, [])
            for row in db.query(ormcls).filter(ormcls.id.in_(idset)).all():
                nodes.append(GraphNode(
                    id=row.id,
                    entity_type=slug,
                    name=row.name,
                    status=getattr(row, "status", None),
                    version_no=int(getattr(row, "version_no", 1) or 1),
                    attrs={c: getattr(row, c, None) for c in attr_cols},
                ))

        # --- emit edges (only when both endpoints are present) ------------
        present = {slug: idset for slug, idset in ids.items()}
        edges: List[GraphEdge] = []
        seen: set = set()
        for fam in _GRAPH_EDGE_FAMILIES:
            src_ids = present[fam["source"]]
            tgt_ids = present[fam["target"]]
            if not src_ids or not tgt_ids:
                continue
            if fam["kind"] == "fk":
                child = ENTITY_REGISTRY[fam["source"]].orm
                col = getattr(child, fam["col"])
                rows = db.query(child.id, col).filter(
                    child.id.in_(src_ids), col.in_(tgt_ids)
                ).all()
            else:
                j = fam["orm"]
                sc = getattr(j, fam["source_col"])
                tc = getattr(j, fam["target_col"])
                rows = db.query(sc, tc).filter(sc.in_(src_ids), tc.in_(tgt_ids)).all()
            for sval, tval in rows:
                if not sval or not tval:
                    continue
                eid = f"{fam['rel']}:{sval}->{tval}"
                if eid in seen:
                    continue
                seen.add(eid)
                edges.append(GraphEdge(
                    id=eid, source=sval, target=tval,
                    rel_kind=fam["kind"], rel_key=fam["rel"],
                ))

        node_count = len(nodes)
        return CatalogGraph(
            scope=GraphScope(type=scope_type, id=scope_id, name=scope_name),
            nodes=nodes,
            edges=edges,
            included=sorted(include_set),
            node_count=node_count,
            edge_count=len(edges),
            truncated=node_count > _GRAPH_MAX_NODES,
        )

    # -- version history ----------------------------------------------------

    def _history_to_record(self, h) -> VersionRecord:
        return VersionRecord(
            entity_type=h.entity_type,
            entity_id=h.entity_id,
            version_no=h.version_no,
            operation=h.operation,
            actor=h.actor,
            changed_at=h.changed_at,
            snapshot=json.loads(h.snapshot),
            changed_fields=json.loads(h.changed_fields),
        )

    def list_versions(self, db: Session, slug: str, entity_id: str) -> List[VersionRecord]:
        spec = self._spec(slug)
        rows = db.query(orm.CatalogVersionHistory).filter(
            orm.CatalogVersionHistory.entity_type == spec.slug,
            orm.CatalogVersionHistory.entity_id == entity_id,
        ).order_by(orm.CatalogVersionHistory.version_no).all()
        return [self._history_to_record(h) for h in rows]

    def get_version(self, db: Session, slug: str, entity_id: str,
                    version_no: int) -> Optional[VersionRecord]:
        spec = self._spec(slug)
        h = db.query(orm.CatalogVersionHistory).filter(
            orm.CatalogVersionHistory.entity_type == spec.slug,
            orm.CatalogVersionHistory.entity_id == entity_id,
            orm.CatalogVersionHistory.version_no == version_no,
        ).first()
        return self._history_to_record(h) if h else None

    def diff_versions(self, db: Session, slug: str, entity_id: str,
                      v_from: int, v_to: int) -> VersionDiff:
        a = self.get_version(db, slug, entity_id, v_from)
        b = self.get_version(db, slug, entity_id, v_to)
        if a is None or b is None:
            raise NotFound(slug, f"{entity_id}@{v_from if a is None else v_to}")
        changed = self._diff(a.snapshot, b.snapshot)
        return VersionDiff(
            entity_type=slug, entity_id=entity_id,
            from_version=v_from, to_version=v_to, changed_fields=changed,
        )

    def search_versions(self, db: Session, *, entity_type: Optional[str] = None,
                        actor: Optional[str] = None, date_from: Optional[str] = None,
                        date_to: Optional[str] = None,
                        changed_field: Optional[str] = None) -> List[VersionRecord]:
        query = db.query(orm.CatalogVersionHistory)
        if entity_type:
            query = query.filter(orm.CatalogVersionHistory.entity_type == entity_type)
        if actor:
            query = query.filter(orm.CatalogVersionHistory.actor == actor)
        if date_from:
            query = query.filter(orm.CatalogVersionHistory.changed_at >= date_from)
        if date_to:
            query = query.filter(orm.CatalogVersionHistory.changed_at <= date_to)
        query = query.order_by(orm.CatalogVersionHistory.changed_at)
        records = [self._history_to_record(h) for h in query.all()]
        if changed_field:
            # AND the changed-field key predicate in Python (JSON text column).
            records = [r for r in records if changed_field in (r.changed_fields or {})]
        return records
