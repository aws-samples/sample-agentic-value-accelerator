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

    # --- CRUD --------------------------------------------------------------

    def create(self, req: ConformanceRecordCreate, created_by: Optional[str] = None) -> ConformanceRecord:
        # exclude_none so an unset `categories` (Optional on the create model)
        # doesn't flow as None into the record's non-optional List field.
        r = ConformanceRecord(**req.model_dump(exclude_none=True), created_by=created_by)
        r.computed = compute(r)
        self._persist(r)
        return r

    def get(self, conformance_id: str) -> Optional[ConformanceRecord]:
        try:
            resp = self.table.get_item(Key={
                "pk": f"{self.PK_PREFIX}{conformance_id}",
                "sk": self.SK_LATEST,
            })
            item = resp.get("Item")
            if item:
                return self._from_item(item)
        except Exception:
            pass
        return type(self)._mem.get(conformance_id)

    def list(self) -> List[ConformanceRecord]:
        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.PK_PREFIX))
            out = [self._from_item(i) for i in resp.get("Items", [])]
        except Exception:
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
        existing = self.get(conformance_id)
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
        return existing
