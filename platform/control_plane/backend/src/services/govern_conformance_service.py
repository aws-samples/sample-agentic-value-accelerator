"""Govern Conformance service — DynamoDB-backed CRUD for ISO/IEC 42001 records.

Storage scheme:
    pk = "CONFORMANCE#<id>"  sk = "LATEST"  -> the conformance record

Mirrors OperatingModelService: same DDB serialization helpers, recomputes the
rollup (compute) on create/update. CRUD (not append-only) — control statuses and
evidence get edited as the AIMS matures.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Attr

from core.ttl_cache import get_or_load, invalidate
from models.govern_conformance import (
    ConformanceRecord,
    ConformanceRecordCreate,
    ConformanceRecordUpdate,
    compute,
)

logger = logging.getLogger(__name__)


def _to_ddb(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _from_ddb(value):
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


class GovernConformanceService:
    PK_PREFIX = "CONFORMANCE#"
    SK_LATEST = "LATEST"

    # TTLs for cached data (in seconds)
    _TTL_LIST = 300  # Conformance records change infrequently (compliance posture)
    _TTL_GET = 300  # Individual record lookups

    # Ephemeral in-memory store used when the conformance table isn't provisioned
    # (e.g. running locally without the DynamoDB backend). ISO 42001 records are
    # stateful CRUD, so a table-free environment can't persist across restarts —
    # but the full clause catalog and status editing still work.
    _mem: Dict[str, ConformanceRecord] = {}

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    # --- DDB shape ---------------------------------------------------------

    def _to_item(self, r: ConformanceRecord) -> dict:
        body = r.model_dump(mode="json")
        return _to_ddb({
            "pk": f"{self.PK_PREFIX}{r.conformance_id}",
            "sk": self.SK_LATEST,
            "conformance_id": r.conformance_id,
            "name": r.name,
            "standard": r.standard,
            "created_at": body["created_at"],
            "updated_at": body["updated_at"],
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> ConformanceRecord:
        body = _from_ddb(json.loads(item["data"]))
        return ConformanceRecord.model_validate(body)

    def _persist(self, r: ConformanceRecord) -> None:
        """Write to DynamoDB; fall back to the ephemeral in-memory store when the
        table isn't provisioned (local / no DynamoDB backend) so the surface stays fully functional."""
        try:
            self.table.put_item(Item=self._to_item(r))
        except Exception:
            type(self)._mem[r.conformance_id] = r
        self._invalidate_caches(r.conformance_id)

    def _invalidate_caches(self, conformance_id: str) -> None:
        """Invalidate conformance-related caches after a write operation."""
        invalidate(f"conformance:list:{self.table_name}")
        invalidate(f"conformance:get:{self.table_name}:{conformance_id}")

    # --- CRUD --------------------------------------------------------------

    def create(self, req: ConformanceRecordCreate, created_by: Optional[str] = None) -> ConformanceRecord:
        # exclude_none so an unset `categories` (Optional on the create model)
        # doesn't flow as None into the record's non-optional List field.
        r = ConformanceRecord(**req.model_dump(exclude_none=True), created_by=created_by)
        r.computed = compute(r)
        self._persist(r)
        return r

    def get(self, conformance_id: str) -> Optional[ConformanceRecord]:
        cache_key = f"conformance:get:{self.table_name}:{conformance_id}"
        # A ConformanceRecord carries no provenance field, so the returned value alone
        # cannot say whether it came from DynamoDB or from the in-memory fallback below.
        # This holder is set by _get_impl on the failure path only, and the predicate
        # reads it immediately after the loader returns — so a read that degraded is
        # never stored. Truthiness would be wrong here: a measured "no such record"
        # (None from a table that answered) is real data and must stay cacheable.
        degraded = {"v": False}
        result, _ = get_or_load(
            cache_key, self._TTL_GET, lambda: self._get_impl(conformance_id, degraded),
            should_cache=lambda _r: not degraded["v"],
        )
        return result

    def _get_impl(
        self, conformance_id: str, degraded: Optional[dict] = None
    ) -> Optional[ConformanceRecord]:
        try:
            resp = self.table.get_item(Key={
                "pk": f"{self.PK_PREFIX}{conformance_id}",
                "sk": self.SK_LATEST,
            })
            item = resp.get("Item")
            if item:
                return self._from_item(item)
        except Exception:
            # The table did not answer (absent, throttled, denied), so whatever we
            # return below is the ephemeral store and not a measured miss. Tell the
            # caller so it declines to cache: without this, one transient failure
            # pinned this id to the in-memory answer (usually None) for the full TTL
            # and no request could refresh it once DynamoDB recovered.
            if degraded is not None:
                degraded["v"] = True
        return type(self)._mem.get(conformance_id)

    def list(self) -> List[ConformanceRecord]:
        cache_key = f"conformance:list:{self.table_name}"
        # See get(): the list has no provenance field either, and an empty list from a
        # reachable table is a real answer that should still be cached — so the
        # predicate tests how the read went, never what it returned.
        degraded = {"v": False}
        result, _ = get_or_load(
            cache_key, self._TTL_LIST, lambda: self._list_impl(degraded),
            should_cache=lambda _r: not degraded["v"],
        )
        return result

    def _list_impl(self, degraded: Optional[dict] = None) -> List[ConformanceRecord]:
        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.PK_PREFIX))
            out = [self._from_item(i) for i in resp.get("Items", [])]
        except Exception:
            if degraded is not None:
                degraded["v"] = True
            out = list(type(self)._mem.values())
        out.sort(key=lambda x: x.updated_at, reverse=True)
        return out

    def update(self, conformance_id: str, req: ConformanceRecordUpdate) -> Optional[ConformanceRecord]:
        existing = self.get(conformance_id)
        if not existing:
            return None
        update_data = req.model_dump(exclude_none=True)
        for field, value in update_data.items():
            setattr(existing, field, value)
        existing.updated_at = datetime.utcnow()
        existing.computed = compute(existing)
        self._persist(existing)
        return existing

    def delete(self, conformance_id: str) -> Optional[ConformanceRecord]:
        existing = self._get_impl(conformance_id)  # bypass cache for delete check
        if not existing:
            return None
        try:
            self.table.delete_item(Key={
                "pk": f"{self.PK_PREFIX}{conformance_id}",
                "sk": self.SK_LATEST,
            })
        except Exception:
            pass
        type(self)._mem.pop(conformance_id, None)
        self._invalidate_caches(conformance_id)
        return existing
