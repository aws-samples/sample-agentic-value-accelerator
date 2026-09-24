"""Catalog meta store — small key/value helpers for catalog-wide lifecycle state.

Backed by the ``catalog_meta`` table (see ``models/catalog_orm.py``). Kept as a
standalone module (no dependency on the service or importer) so both the startup
path (``main.py``) and the catalog service can read/write it without import
cycles.

Keys
----
- ``seed_applied`` (bool-ish "true"/"false"): whether the shipped reference seed
  has been imported at least once. The startup import is gated on this so that a
  user who empties the catalog or prunes individual seed rows does not get them
  re-created on the next boot.
- ``catalog_mode``: informational label for the current lifecycle state, one of
  ``examples`` (shipped seed loaded), ``scratch`` (deliberately emptied), or
  ``custom`` (user-tailored: selective import and/or edits).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models import catalog_orm as orm

SEED_APPLIED_KEY = "seed_applied"
CATALOG_MODE_KEY = "catalog_mode"

MODE_EXAMPLES = "examples"
MODE_SCRATCH = "scratch"
MODE_CUSTOM = "custom"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def get_meta(db: Session, key: str, default: Optional[str] = None) -> Optional[str]:
    row = db.query(orm.CatalogMeta).filter(orm.CatalogMeta.key == key).first()
    return row.value if row is not None else default


def set_meta(db: Session, key: str, value: Optional[str], *, commit: bool = True) -> None:
    row = db.query(orm.CatalogMeta).filter(orm.CatalogMeta.key == key).first()
    if row is None:
        row = orm.CatalogMeta(key=key, value=value, updated_at=_now())
        db.add(row)
    else:
        row.value = value
        row.updated_at = _now()
    if commit:
        db.commit()


# -- seed latch -------------------------------------------------------------


def is_seed_applied(db: Session) -> bool:
    return (get_meta(db, SEED_APPLIED_KEY) or "false").lower() == "true"


def mark_seed_applied(db: Session, applied: bool = True, *, commit: bool = True) -> None:
    set_meta(db, SEED_APPLIED_KEY, "true" if applied else "false", commit=commit)


# -- mode -------------------------------------------------------------------


def get_mode(db: Session, default: str = MODE_EXAMPLES) -> str:
    return get_meta(db, CATALOG_MODE_KEY, default) or default


def set_mode(db: Session, mode: str, *, commit: bool = True) -> None:
    set_meta(db, CATALOG_MODE_KEY, mode, commit=commit)
