"""Reference Catalog API — generic resource routes for the nine entity types.

Base path ``/api/v1/catalog``. ``{entity_type}`` is one of the nine plural slugs
(industries, industry-segments, business-domains, value-levers, kpis, solutions,
use-cases, data-assets, technology-components). Unknown types -> 404, missing id
-> 404, validation failure -> 422. All persistence flows through ``CatalogService``
on the local SQLAlchemy + SQLite store.
"""

from __future__ import annotations

import logging
import typing
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.config import settings
from core.database import get_db
from models.transformation_value_model import CatalogGraph, ENTITY_REGISTRY, SeedImportReport
from services import catalog_meta
from services.seed_importer import SeedImporter, run_seed_import
from services.transformation_value_model_service import (
    _DELETE_ORDER,
    CatalogService,
    NotFound,
    UnknownEntityType,
    ValidationError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/catalog", tags=["catalog"])

_svc = CatalogService()


# --- request/response bodies -----------------------------------------------


class SelectiveSeedImportRequest(BaseModel):
    """Body for POST /seed/import. Empty body = import the whole shipped seed."""
    source_refs: Optional[List[str]] = Field(
        default=None,
        description="Local refs (source_ref) of seed rows to import. Omit for all.",
    )
    include_dependencies: bool = Field(
        default=True,
        description="Also pull in each selected row's required FK-parent chain.",
    )
    dry_run: bool = False


class LifecycleRequest(BaseModel):
    """Body for POST /lifecycle."""
    mode: str = Field(
        ...,
        description=("One of: reset-to-examples (clear all, re-import shipped seed), "
                     "start-from-scratch (empty the catalog), clear-examples (drop "
                     "shipped rows, keep user data), clear-user (drop user data, keep "
                     "examples)."),
    )


class CatalogImportRequest(BaseModel):
    """Body for POST /import — an agent/user authored catalog document."""
    entities: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    relationships: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    as_examples: bool = Field(
        default=False,
        description="Persist rows as shipped-example provenance (source_ref kept). "
                    "Default false = user data.",
    )
    dry_run: bool = Field(
        default=False,
        description="Resolve and count without persisting; returns the would-be report.",
    )


def _dev_actor(request: Request) -> str:
    """Resolve the acting identity under the local dev-auth bypass (Req 12.3)."""
    return (
        request.headers.get("x-user-email")
        or request.headers.get("x-user-id")
        or "dev-user"
    )


def _require_spec(entity_type: str):
    spec = ENTITY_REGISTRY.get(entity_type)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"Unknown entity type: {entity_type}")
    return spec


# Safe create order (parents before children) — the reverse of the delete order.
# Exposed so an agent populating the catalog with sequential POSTs knows a valid
# sequence; a document import via POST /import resolves any order automatically.
_CREATE_ORDER = list(reversed(_DELETE_ORDER))


def _py_type_name(annotation: Any) -> str:
    """Map a (possibly Optional[...]) Pydantic annotation to a simple type label
    an agent can act on: string | number | integer | boolean | array | object."""
    args = [a for a in typing.get_args(annotation) if a is not type(None)]
    base = args[0] if args else annotation
    origin = typing.get_origin(base) or base
    if origin in (list, List):
        return "array"
    if origin in (dict, Dict):
        return "object"
    mapping = {str: "string", float: "number", int: "integer", bool: "boolean"}
    return mapping.get(base, "string")


def _seed_suggested_values() -> Dict[str, Dict[str, List[str]]]:
    """Distinct values per filterable field, harvested from the shipped seed, so
    agents/UI get a realistic vocabulary for the catalog's free-text fields
    (complexity, risk_tier, lever_type, ...). Best-effort; empty if seed absent."""
    out: Dict[str, Dict[str, List[str]]] = {}
    try:
        doc = SeedImporter(settings.TRANSFORMATION_SEED_PATH).load() or {}
    except Exception:  # pragma: no cover - defensive
        return out
    entities = doc.get("entities", {})
    # singular seed key -> plural slug
    from services.seed_importer import _ENTITY_KEY_TO_SLUG
    for ekey, rows in entities.items():
        slug = _ENTITY_KEY_TO_SLUG.get(ekey)
        if not slug or slug not in ENTITY_REGISTRY:
            continue
        spec = ENTITY_REGISTRY[slug]
        per_field: Dict[str, set] = {f: set() for f in spec.filter_fields}
        for row in rows:
            for f in spec.filter_fields:
                v = row.get(f)
                if v not in (None, ""):
                    per_field[f].add(str(v))
        # Only surface non-FK vocab fields (skip *_id foreign keys).
        out[slug] = {
            f: sorted(vals) for f, vals in per_field.items()
            if vals and not f.endswith("_id")
        }
    return out


# --- registry metadata (frontend + agents render forms/filters from this) ---

@router.get("/registry")
async def get_registry():
    """Self-describing catalog schema.

    For each entity type: label, id prefix, searchable/filterable fields, the full
    field list with type + required flag, relationship descriptors, and seed-derived
    suggested values for free-text fields. Top-level ``dependency_order`` gives a
    safe parents-first create sequence. This is the single endpoint an agent reads
    to learn how to populate the catalog."""
    suggested = _seed_suggested_values()
    types: Dict[str, Any] = {}
    for slug, spec in ENTITY_REGISTRY.items():
        model_fields = spec.base.model_fields
        fields = []
        required_fields = []
        for fname, finfo in model_fields.items():
            required = finfo.is_required()
            fields.append({
                "name": fname,
                "type": _py_type_name(finfo.annotation),
                "required": required,
            })
            if required:
                required_fields.append(fname)
        types[slug] = {
            "label": spec.label,
            "id_prefix": spec.id_prefix,
            "search_fields": spec.search_fields,
            "filter_fields": spec.filter_fields,
            "required_fields": required_fields,
            "fields": fields,
            "relationships": [
                {"key": r.key, "target_type": r.target_type, "kind": r.kind}
                for r in spec.relationships
            ],
            "suggested_values": suggested.get(slug, {}),
        }
    return {
        "dependency_order": _CREATE_ORDER,
        "types": types,
    }


@router.get("/seed/status")
async def seed_status(db: Session = Depends(get_db)):
    """Catalog population status: current lifecycle mode, whether the shipped seed
    has been applied, and per-type counts split by provenance (examples vs user)."""
    by_type: Dict[str, Any] = {}
    totals = {"total": 0, "examples": 0, "user": 0}
    for slug, spec in ENTITY_REGISTRY.items():
        total = db.query(spec.orm).count()
        examples = db.query(spec.orm).filter(spec.orm.source_ref.isnot(None)).count()
        user = total - examples
        by_type[slug] = {"total": total, "examples": examples, "user": user}
        totals["total"] += total
        totals["examples"] += examples
        totals["user"] += user
    return {
        "mode": catalog_meta.get_mode(db),
        "seed_applied": catalog_meta.is_seed_applied(db),
        "totals": totals,
        "by_type": by_type,
    }


@router.get("/seed/library")
async def seed_library(db: Session = Depends(get_db)):
    """Browse the shipped example catalog (from seed.json, not the DB). Per type,
    each example row with its local ref, name, a few display attrs, and an
    ``imported`` flag. Feeds the 'add examples' picker for selective reuse."""
    return SeedImporter(settings.TRANSFORMATION_SEED_PATH).read_library(db)


@router.post("/seed/import", response_model=SeedImportReport)
async def trigger_seed_import(
    body: Optional[SelectiveSeedImportRequest] = None,
    db: Session = Depends(get_db),
):
    """Import shipped example data. Empty body imports the whole seed (idempotent);
    supplying ``source_refs`` imports just that subset, pulling in each row's
    required FK-parent chain when ``include_dependencies`` is set."""
    body = body or SelectiveSeedImportRequest()
    importer = SeedImporter(settings.TRANSFORMATION_SEED_PATH)
    doc = importer.load()
    if doc is None:
        raise HTTPException(status_code=404, detail="No shipped seed is available")
    report = importer.import_document(
        db, doc, actor="system", persist_source_ref=True, idempotent=True,
        selected_refs=body.source_refs, include_dependencies=body.include_dependencies,
        dry_run=body.dry_run,
    )
    if not body.dry_run:
        catalog_meta.mark_seed_applied(db)
        catalog_meta.set_mode(
            db,
            catalog_meta.MODE_CUSTOM if body.source_refs else catalog_meta.MODE_EXAMPLES,
        )
    report.mode = catalog_meta.get_mode(db)
    return report


@router.post("/import", response_model=SeedImportReport)
async def import_catalog_document(
    body: CatalogImportRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Import an arbitrary catalog document (entities + relationships keyed by local
    refs). The engine resolves refs in dependency order, so a caller — including an
    AI agent — hands over one document without threading generated ids. Defaults to
    user provenance; ``as_examples`` marks rows as shipped examples. ``dry_run``
    validates and returns the would-be report without persisting."""
    doc = {"entities": body.entities, "relationships": body.relationships}
    importer = SeedImporter(settings.TRANSFORMATION_SEED_PATH)
    try:
        report = importer.import_document(
            db, doc,
            actor=("system" if body.as_examples else _dev_actor(request)),
            persist_source_ref=body.as_examples,
            idempotent=body.as_examples,
            dry_run=body.dry_run,
        )
    except Exception as e:  # defensive: malformed document
        raise HTTPException(status_code=422, detail=str(e))
    if not body.dry_run and (report.total_entities or report.total_relationships):
        catalog_meta.mark_seed_applied(db)
        if not body.as_examples:
            catalog_meta.set_mode(db, catalog_meta.MODE_CUSTOM)
    report.mode = catalog_meta.get_mode(db)
    return report


@router.get("/export")
async def export_catalog(
    scope: str = Query(default="all", pattern="^(all|user|examples)$"),
    db: Session = Depends(get_db),
):
    """Export the catalog as a document that round-trips through POST /import (and
    matches seed.json). ``scope`` selects all rows, only user data, or only shipped
    examples. Lets a team tailor the catalog then redistribute it as a starting
    point."""
    return SeedImporter(settings.TRANSFORMATION_SEED_PATH).export_document(db, scope)


@router.post("/lifecycle")
async def catalog_lifecycle(
    body: LifecycleRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Catalog-wide lifecycle transitions:
      - reset-to-examples: clear everything, re-import the shipped seed
      - start-from-scratch: empty the catalog (and latch off startup re-seed)
      - clear-examples: drop shipped rows, keep user data
      - clear-user: drop user data, keep shipped examples
    The persisted latch/mode make the outcome survive restarts."""
    actor = _dev_actor(request)
    mode = body.mode
    result: Dict[str, Any] = {"cleared": {}, "imported": None}

    if mode == "reset-to-examples":
        result["cleared"] = _svc.clear(db, "all", actor)
        importer = SeedImporter(settings.TRANSFORMATION_SEED_PATH)
        doc = importer.load()
        if doc is not None:
            report = importer.import_document(
                db, doc, actor="system", persist_source_ref=True, idempotent=True,
            )
            result["imported"] = report.model_dump()
        catalog_meta.mark_seed_applied(db)
        catalog_meta.set_mode(db, catalog_meta.MODE_EXAMPLES)
    elif mode == "start-from-scratch":
        result["cleared"] = _svc.clear(db, "all", actor)
        # Latch on so the startup importer won't repopulate on the next boot.
        catalog_meta.mark_seed_applied(db)
        catalog_meta.set_mode(db, catalog_meta.MODE_SCRATCH)
    elif mode == "clear-examples":
        result["cleared"] = _svc.clear(db, "examples", actor)
        catalog_meta.mark_seed_applied(db)
        catalog_meta.set_mode(db, catalog_meta.MODE_CUSTOM)
    elif mode == "clear-user":
        result["cleared"] = _svc.clear(db, "user", actor)
    else:
        raise HTTPException(
            status_code=422,
            detail=("mode must be one of: reset-to-examples, start-from-scratch, "
                    "clear-examples, clear-user"),
        )

    result["mode"] = catalog_meta.get_mode(db)
    result["seed_applied"] = catalog_meta.is_seed_applied(db)
    return result


# --- relationship graph (must precede /{entity_type} routes) ----------------

@router.get("/graph", response_model=CatalogGraph)
async def get_graph(
    db: Session = Depends(get_db),
    scope_type: str = Query(..., pattern="^(segment|domain)$",
                            description="Scope kind: 'segment' or 'domain'"),
    scope_id: str = Query(..., description="Id of the scoping segment or domain"),
    include: Optional[str] = Query(
        default=None,
        description="Comma list of optional types to add: kpis, data-assets, technology-components",
    ),
    expand: Optional[str] = Query(
        default=None,
        description="Comma list of node ids whose 1-hop neighbors should be pulled in",
    ),
):
    """Return a scoped node/edge projection for the relationship map.

    Scoping is mandatory so the payload stays bounded; the whole catalog is never
    returned in one call.
    """
    include_list = [s.strip() for s in include.split(",")] if include else []
    expand_list = [s.strip() for s in expand.split(",")] if expand else []
    try:
        return _svc.build_graph(
            db, scope_type=scope_type, scope_id=scope_id,
            include=include_list, expand=expand_list,
        )
    except NotFound:
        raise HTTPException(status_code=404, detail=f"Scope {scope_type} '{scope_id}' not found")
    except (ValidationError, UnknownEntityType) as e:
        raise HTTPException(status_code=422, detail=str(e))


# --- cross-entity version search (must precede /{entity_type} routes) -------

@router.get("/versions/search")
async def search_versions(
    db: Session = Depends(get_db),
    type: Optional[str] = Query(default=None),
    actor: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
    field: Optional[str] = Query(default=None),
):
    records = _svc.search_versions(
        db, entity_type=type, actor=actor,
        date_from=date_from, date_to=date_to, changed_field=field,
    )
    return [r.model_dump() for r in records]


# --- generic resource CRUD -------------------------------------------------

@router.get("/{entity_type}")
async def list_entities(
    entity_type: str,
    db: Session = Depends(get_db),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    related_key: Optional[str] = Query(default=None),
    related_id: Optional[str] = Query(default=None),
    request: Request = None,
):
    spec = _require_spec(entity_type)
    # Attribute filters come from any query param matching a filterable column.
    filters: Dict[str, Any] = {}
    if request is not None:
        for k, v in request.query_params.items():
            if k in spec.filter_fields:
                filters[k] = v
    related = {related_key: related_id} if related_key and related_id else None
    try:
        return _svc.list(db, entity_type, q=q, filters=filters or None,
                         related=related, limit=limit, offset=offset)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/{entity_type}/{entity_id}")
async def get_entity(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    with_relationships: bool = Query(default=False),
):
    _require_spec(entity_type)
    try:
        return _svc.get(db, entity_type, entity_id, with_relationships=with_relationships)
    except NotFound:
        raise HTTPException(status_code=404, detail=f"{entity_type} '{entity_id}' not found")


@router.post("/{entity_type}", status_code=201)
async def create_entity(
    entity_type: str,
    payload: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
):
    spec = _require_spec(entity_type)
    # Validate the payload shape via the entity's Create model.
    try:
        model = spec.create(**payload)
    except Exception as e:  # pydantic ValidationError -> 422
        raise HTTPException(status_code=422, detail=str(e))
    try:
        return _svc.create(db, entity_type, model.model_dump(exclude_none=True),
                           _dev_actor(request))
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.put("/{entity_type}/{entity_id}")
async def update_entity(
    entity_type: str,
    entity_id: str,
    payload: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
):
    spec = _require_spec(entity_type)
    try:
        model = spec.update(**payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    try:
        return _svc.update(db, entity_type, entity_id,
                           model.model_dump(exclude_none=True), _dev_actor(request))
    except NotFound:
        raise HTTPException(status_code=404, detail=f"{entity_type} '{entity_id}' not found")
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/{entity_type}/{entity_id}")
async def delete_entity(
    entity_type: str,
    entity_id: str,
    request: Request,
    db: Session = Depends(get_db),
    cascade: bool = Query(
        default=False,
        description="Also delete child entities that reference this one (fk_in).",
    ),
):
    """Delete a single entity. Blocks with 409 if child entities still reference it,
    unless ``cascade=true`` deletes the dependent subtree first."""
    _require_spec(entity_type)
    try:
        return _svc.delete(db, entity_type, entity_id, _dev_actor(request), cascade=cascade)
    except NotFound:
        raise HTTPException(status_code=404, detail=f"{entity_type} '{entity_id}' not found")
    except ValidationError as e:
        raise HTTPException(status_code=409, detail=str(e))


# --- per-entity version history --------------------------------------------

@router.get("/{entity_type}/{entity_id}/versions")
async def list_versions(entity_type: str, entity_id: str, db: Session = Depends(get_db)):
    _require_spec(entity_type)
    return [r.model_dump() for r in _svc.list_versions(db, entity_type, entity_id)]


@router.get("/{entity_type}/{entity_id}/versions/diff")
async def diff_versions(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    from_: int = Query(..., alias="from", ge=1),
    to: int = Query(..., ge=1),
):
    _require_spec(entity_type)
    try:
        return _svc.diff_versions(db, entity_type, entity_id, from_, to).model_dump()
    except NotFound:
        raise HTTPException(status_code=404, detail="Version not found")


@router.get("/{entity_type}/{entity_id}/versions/{version_no}")
async def get_version(entity_type: str, entity_id: str, version_no: int,
                      db: Session = Depends(get_db)):
    _require_spec(entity_type)
    rec = _svc.get_version(db, entity_type, entity_id, version_no)
    if rec is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return rec.model_dump()
