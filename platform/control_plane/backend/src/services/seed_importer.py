"""Reference-catalog document importer.

The heart of catalog population. A *catalog document* is a JSON object shaped
exactly like the shipped ``seed.json``:

    {
      "entities": {
        "industry":        [ { "name": ..., "source_ref": "<local ref>", ... } ],
        "industry_segment":[ { "name": ..., "source_ref": "...", "industry_id": "<ref>" } ],
        ... one key per entity type (singular slug) ...
      },
      "relationships": {
        "solution_use_case": [ { "solution_id": "<ref>", "use_case_id": "<ref>", ... } ],
        ... one key per junction ...
      }
    }

Every entity row carries a ``source_ref`` (also accepted as ``ref``): a *local*
identifier unique within the document. FK columns (e.g. ``industry_id``) and
relationship rows reference other rows by that local id. The importer resolves
those local ids to the real generated entity ids in dependency order, so a caller
(human seed, or an AI agent authoring a document) never has to know or thread the
generated ids — it hands over one document and the engine wires it up.

Two provenance modes:
  - ``persist_source_ref=True`` (the shipped seed): the local ref is stored in the
    ``source_ref`` column, marking the row as a shipped *example* and enabling
    idempotent re-import (rows already present by source_ref are skipped).
  - ``persist_source_ref=False`` (user / agent documents): the local ref is used
    only to resolve references within the document; the stored ``source_ref`` is
    null so the rows count as user data.

References that don't match a local row are resolved against existing catalog ids,
so a document may also link new rows to entities already in the catalog.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from models import catalog_orm as orm
from models.transformation_value_model import (
    ENTITY_REGISTRY,
    JUNCTION_TABLES,
    SeedImportReport,
)

logger = logging.getLogger(__name__)

# seed entity key (singular) -> registry slug (plural)
_ENTITY_KEY_TO_SLUG = {
    "industry": "industries",
    "industry_segment": "industry-segments",
    "business_domain": "business-domains",
    "value_lever": "value-levers",
    "kpi": "kpis",
    "solution": "solutions",
    "use_case": "use-cases",
    "data_asset": "data-assets",
    "technology_component": "technology-components",
}
_SLUG_TO_ENTITY_KEY = {v: k for k, v in _ENTITY_KEY_TO_SLUG.items()}

# 1:N relationships are captured as FK columns on the child entity, whose row
# carries the *local ref* of the parent (e.g. business_domain.industry_id). After
# importing all entities we remap those FK columns from local refs to real ids.
# Child slug -> list of (fk_column, target_slug) to remap.
_CHILD_FK_COLUMNS = {
    "industry-segments": [("industry_id", "industries")],
    "business-domains": [("industry_id", "industries"),
                         ("industry_segment_id", "industry-segments")],
    "value-levers": [("domain_id", "business-domains")],
}

# Junction seed-key -> (local column, local target slug, remote column, remote target slug)
_JUNCTION_MAP = {
    "value_lever_kpi": ("value_lever_id", "value-levers", "kpi_id", "kpis"),
    "solution_domain": ("solution_id", "solutions", "domain_id", "business-domains"),
    "solution_value_lever": ("solution_id", "solutions", "value_lever_id", "value-levers"),
    "solution_use_case": ("solution_id", "solutions", "use_case_id", "use-cases"),
    "use_case_data_requirement": ("use_case_id", "use-cases", "data_asset_id", "data-assets"),
    "use_case_technology_requirement": ("use_case_id", "use-cases",
                                        "technology_component_id", "technology-components"),
}

# Curated display attributes surfaced by the seed library so the picker can show
# meaningful context without loading full rows.
_LIBRARY_ATTRS: Dict[str, List[str]] = {
    "industries": ["code"],
    "industry-segments": ["code", "industry_id"],
    "business-domains": ["domain_category", "industry_segment_id"],
    "value-levers": ["lever_type", "domain_id"],
    "kpis": ["unit_of_measure"],
    "solutions": ["solution_type"],
    "use-cases": ["use_case_type", "complexity"],
    "data-assets": ["data_asset_type"],
    "technology-components": ["technology_type"],
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _row_ref(row: dict) -> Optional[str]:
    """The document-local reference for a row (``source_ref`` or ``ref`` alias)."""
    return row.get("source_ref") or row.get("ref")


class SeedImporter:
    def __init__(self, seed_path: str = ""):
        self.seed_path = Path(seed_path) if seed_path else None

    # -- file access --------------------------------------------------------

    def load(self) -> Optional[dict]:
        if self.seed_path is None or not self.seed_path.exists():
            logger.warning("Transformation seed not found at %s — skipping import",
                           self.seed_path)
            return None
        with self.seed_path.open() as f:
            return json.load(f)

    # -- dependency closure -------------------------------------------------

    def _closure(self, doc: dict, selected: Set[str]) -> Set[str]:
        """Expand a set of selected local refs to include the FK-parent chain each
        one requires (segment->industry, domain->segment+industry, lever->domain),
        so a selective import never produces an orphan. Junction peers and children
        are NOT auto-included — those are optional."""
        # Index every row by its local ref, and remember each ref's parent refs.
        parents: Dict[str, List[str]] = {}
        entities = doc.get("entities", {})
        for ekey, rows in entities.items():
            slug = _ENTITY_KEY_TO_SLUG.get(ekey)
            if not slug:
                continue
            fk_cols = _CHILD_FK_COLUMNS.get(slug, [])
            for row in rows:
                ref = _row_ref(row)
                if ref is None:
                    continue
                parents[ref] = [row.get(fk) for fk, _ in fk_cols if row.get(fk)]

        included = set(selected)
        stack = list(selected)
        while stack:
            ref = stack.pop()
            for pref in parents.get(ref, []):
                if pref and pref not in included:
                    included.add(pref)
                    stack.append(pref)
        return included

    # -- reference resolution ----------------------------------------------

    def _resolve(self, db: Session, id_maps: Dict[str, Dict[str, str]],
                 slug: str, ref: Optional[str]) -> Optional[str]:
        """Resolve a local ref to a real entity id: first via the in-document map,
        then falling back to an existing catalog id (lets documents reference
        entities already present)."""
        if not ref:
            return None
        mapped = id_maps.get(slug, {}).get(ref)
        if mapped:
            return mapped
        orm_cls = ENTITY_REGISTRY[slug].orm
        exists = db.query(orm_cls.id).filter(orm_cls.id == ref).first()
        return ref if exists else None

    # -- core import --------------------------------------------------------

    def import_document(
        self,
        db: Session,
        doc: dict,
        *,
        actor: str = "system",
        persist_source_ref: bool = True,
        selected_refs: Optional[Iterable[str]] = None,
        include_dependencies: bool = True,
        idempotent: bool = True,
        dry_run: bool = False,
    ) -> SeedImportReport:
        """Import a catalog document. See module docstring for the shape.

        persist_source_ref: store the local ref as ``source_ref`` (shipped-example
          provenance + idempotent skip). False for user/agent docs (stored null).
        selected_refs: if given, only import these local refs; with
          ``include_dependencies`` their required FK-parents are pulled in too.
        idempotent: when persisting source_ref, skip rows already present.
        dry_run: resolve and count everything, then roll back (nothing persisted).
        """
        report = SeedImportReport(dry_run=dry_run)
        if not doc:
            return report

        entities = doc.get("entities", {})
        relationships = doc.get("relationships", {})

        selected: Optional[Set[str]] = None
        if selected_refs is not None:
            selected = set(selected_refs)
            if include_dependencies:
                selected = self._closure(doc, selected)

        id_maps: Dict[str, Dict[str, str]] = {slug: {} for slug in ENTITY_REGISTRY}

        # Pass 1: upsert entities.
        for ekey, rows in entities.items():
            slug = _ENTITY_KEY_TO_SLUG.get(ekey)
            if not slug:
                continue
            spec = ENTITY_REGISTRY[slug]
            attr_cols = {c.name for c in spec.orm.__table__.columns}
            inserted = 0
            skipped = 0
            for row in rows:
                ref = _row_ref(row)
                if selected is not None and ref not in selected:
                    continue
                if persist_source_ref and idempotent and ref is not None:
                    existing = db.query(spec.orm).filter(spec.orm.source_ref == ref).first()
                    if existing is not None:
                        id_maps[slug][ref] = existing.id
                        skipped += 1
                        continue
                entity_id = f"{spec.id_prefix}-{uuid.uuid4().hex[:10]}"
                now = _now()
                obj = spec.orm(
                    id=entity_id,
                    source_ref=(ref if persist_source_ref else None),
                    version_no=1, created_at=now, updated_at=now,
                    created_by=actor, updated_by=actor,
                )
                for col, val in row.items():
                    if col in ("source_ref", "ref"):
                        continue
                    if col not in attr_cols:
                        continue
                    if col == "tags":
                        val = json.dumps(val) if val is not None else None
                    setattr(obj, col, val)
                db.add(obj)
                db.flush()
                if ref is not None:
                    id_maps[slug][ref] = entity_id
                self._write_create_history(db, slug, entity_id, obj, spec, actor)
                inserted += 1
            report.entities[slug] = inserted
            if skipped:
                report.skipped[slug] = skipped
        db.flush()

        # Pass 2: remap child FK columns from local refs to real ids.
        for slug, fk_cols in _CHILD_FK_COLUMNS.items():
            spec = ENTITY_REGISTRY[slug]
            for obj in db.query(spec.orm).all():
                for fk_col, target_slug in fk_cols:
                    src_val = getattr(obj, fk_col, None)
                    if not src_val:
                        continue
                    # Only remap values that are in-document local refs; real ids
                    # already present in the map resolve to themselves and are left.
                    mapped = id_maps[target_slug].get(src_val)
                    if mapped and mapped != src_val:
                        setattr(obj, fk_col, mapped)
        db.flush()

        # Pass 3: insert junction relationships (idempotent), resolving ids.
        for rkey, rows in relationships.items():
            mapping = _JUNCTION_MAP.get(rkey)
            junction = JUNCTION_TABLES.get(rkey)
            if mapping is None or junction is None:
                continue
            local_col, local_slug, remote_col, remote_slug = mapping
            edge_cols = {c.name for c in junction.__table__.columns}
            inserted = 0
            for row in rows:
                local_id = self._resolve(db, id_maps, local_slug, row.get(local_col))
                remote_id = self._resolve(db, id_maps, remote_slug, row.get(remote_col))
                if not local_id or not remote_id:
                    report.unresolved_relationships += 1
                    continue
                exists = db.query(junction).filter(
                    getattr(junction, local_col) == local_id,
                    getattr(junction, remote_col) == remote_id,
                ).first()
                if exists is not None:
                    continue
                edge = junction()
                setattr(edge, local_col, local_id)
                setattr(edge, remote_col, remote_id)
                for col, val in row.items():
                    if col in (local_col, remote_col):
                        continue
                    if col in edge_cols:
                        setattr(edge, col, val)
                db.add(edge)
                inserted += 1
            report.relationships[rkey] = inserted

        report.total_entities = sum(report.entities.values())
        report.total_relationships = sum(report.relationships.values())

        if dry_run:
            db.rollback()
        else:
            db.commit()
        logger.info(
            "Catalog document import%s: %s entities, %s relationships, %s unresolved",
            " (dry-run)" if dry_run else "",
            report.total_entities, report.total_relationships,
            report.unresolved_relationships,
        )
        return report

    def import_seed(self, db: Session) -> SeedImportReport:
        """Import the shipped seed file with example provenance (idempotent)."""
        doc = self.load()
        if doc is None:
            return SeedImportReport()
        return self.import_document(
            db, doc, actor="system", persist_source_ref=True, idempotent=True,
        )

    # -- library ------------------------------------------------------------

    def read_library(self, db: Session) -> Dict[str, List[dict]]:
        """Return the shipped seed as a browsable library: per type, each example
        row with its local ref, name, a few display attrs, and whether it has
        already been imported (a DB row with that source_ref exists)."""
        doc = self.load() or {}
        entities = doc.get("entities", {})
        out: Dict[str, List[dict]] = {}
        for ekey, rows in entities.items():
            slug = _ENTITY_KEY_TO_SLUG.get(ekey)
            if not slug:
                continue
            spec = ENTITY_REGISTRY[slug]
            imported_refs = {
                r[0] for r in db.query(spec.orm.source_ref)
                .filter(spec.orm.source_ref.isnot(None)).all()
            }
            attrs = _LIBRARY_ATTRS.get(slug, [])
            items = []
            for row in rows:
                ref = _row_ref(row)
                items.append({
                    "source_ref": ref,
                    "name": row.get("name"),
                    "description": row.get("description"),
                    "imported": ref in imported_refs,
                    "attrs": {a: row.get(a) for a in attrs},
                })
            out[slug] = items
        return out

    # -- export -------------------------------------------------------------

    def export_document(self, db: Session, scope: str = "all") -> dict:
        """Serialize the catalog to a document that round-trips through
        ``import_document`` (and matches ``seed.json``).

        Each row's local ref is its ``source_ref`` when present else its real id.
        FK columns and junction endpoints are rewritten to those refs so the export
        is self-contained. ``scope`` selects all rows, only user data (source_ref
        null), or only shipped examples (source_ref not null)."""
        if scope not in ("all", "user", "examples"):
            raise ValueError("scope must be one of: all, user, examples")

        # Pass 1: collect rows per type and build id -> ref maps.
        rows_by_slug: Dict[str, list] = {}
        id_to_ref: Dict[str, Dict[str, str]] = {slug: {} for slug in ENTITY_REGISTRY}
        for slug, spec in ENTITY_REGISTRY.items():
            q = db.query(spec.orm)
            if scope == "user":
                q = q.filter(spec.orm.source_ref.is_(None))
            elif scope == "examples":
                q = q.filter(spec.orm.source_ref.isnot(None))
            rows = q.all()
            rows_by_slug[slug] = rows
            for row in rows:
                id_to_ref[slug][row.id] = row.source_ref or row.id

        managed_skip = {"id", "version_no", "created_at", "updated_at",
                        "created_by", "updated_by"}
        fk_targets = {slug: dict(cols) for slug, cols in _CHILD_FK_COLUMNS.items()}

        # Pass 2: emit entity rows, rewriting FK columns to parent refs.
        entities_out: Dict[str, list] = {}
        for slug, rows in rows_by_slug.items():
            spec = ENTITY_REGISTRY[slug]
            ekey = _SLUG_TO_ENTITY_KEY[slug]
            cols = [c.name for c in spec.orm.__table__.columns]
            recs = []
            for row in rows:
                rec: Dict[str, object] = {"source_ref": id_to_ref[slug][row.id]}
                for col in cols:
                    if col in managed_skip or col == "source_ref":
                        continue
                    val = getattr(row, col)
                    if val is None:
                        continue
                    if col == "tags":
                        try:
                            val = json.loads(val)
                        except (TypeError, ValueError):
                            pass
                    tgt_slug = fk_targets.get(slug, {}).get(col)
                    if tgt_slug is not None:
                        val = id_to_ref[tgt_slug].get(val, val)
                    rec[col] = val
                recs.append(rec)
            entities_out[ekey] = recs

        # Pass 3: emit junction relationships, keeping only in-scope endpoints.
        rels_out: Dict[str, list] = {}
        for rkey, mapping in _JUNCTION_MAP.items():
            junction = JUNCTION_TABLES.get(rkey)
            if junction is None:
                continue
            local_col, local_slug, remote_col, remote_slug = mapping
            edge_cols = [c.name for c in junction.__table__.columns if c.name != "id"]
            out = []
            for edge in db.query(junction).all():
                lref = id_to_ref[local_slug].get(getattr(edge, local_col))
                rref = id_to_ref[remote_slug].get(getattr(edge, remote_col))
                if lref is None or rref is None:
                    continue
                rec = {}
                for col in edge_cols:
                    val = getattr(edge, col)
                    if col == local_col:
                        val = lref
                    elif col == remote_col:
                        val = rref
                    if val is not None:
                        rec[col] = val
                out.append(rec)
            if out:
                rels_out[rkey] = out

        return {"entities": entities_out, "relationships": rels_out}

    def _write_create_history(self, db: Session, slug: str, entity_id: str, obj,
                              spec, actor: str = "system"):
        snapshot = {}
        for c in spec.orm.__table__.columns:
            val = getattr(obj, c.name)
            if c.name == "tags" and val is not None:
                try:
                    val = json.loads(val)
                except (TypeError, ValueError):
                    val = None
            snapshot[c.name] = val
        db.add(orm.CatalogVersionHistory(
            id=f"vh-{uuid.uuid4().hex}",
            entity_type=slug,
            entity_id=entity_id,
            version_no=1,
            operation="create",
            actor=actor,
            changed_at=_now(),
            snapshot=json.dumps(snapshot, default=str),
            changed_fields=json.dumps({}),
        ))


def run_seed_import(db: Session, seed_path: str) -> SeedImportReport:
    return SeedImporter(seed_path).import_seed(db)
