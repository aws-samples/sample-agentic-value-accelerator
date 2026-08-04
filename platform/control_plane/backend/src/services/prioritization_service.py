"""Prioritization service — DynamoDB-backed CRUD for use cases + scoring."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

import boto3
from boto3.dynamodb.conditions import Attr

from models.prioritization import (
    UseCase,
    UseCaseCreate,
    UseCaseUpdate,
    UseCaseStatus,
    compute,
)

logger = logging.getLogger(__name__)


def _to_ddb(value):
    """Recursively convert Pydantic-friendly types to DynamoDB-safe types."""
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
    """Recursively convert DynamoDB Decimal/Item back to JSON-safe types."""
    if isinstance(value, Decimal):
        # Use float — Pydantic handles ints transparently from float when needed.
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


class PrioritizationService:
    PK_PREFIX = "USECASE#"
    SK_LATEST = "LATEST"

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    # --- DDB shape -----------------------------------------------------------

    def _to_item(self, uc: UseCase) -> dict:
        body = uc.model_dump(mode="json")
        return _to_ddb({
            "pk": f"{self.PK_PREFIX}{uc.use_case_id}",
            "sk": self.SK_LATEST,
            "use_case_id": uc.use_case_id,
            "status": uc.status.value,
            "name": uc.name,
            "ai_type": uc.ai_type.value,
            "created_at": body["created_at"],
            "updated_at": body["updated_at"],
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> UseCase:
        body = _from_ddb(json.loads(item["data"]))
        return UseCase.model_validate(body)

    # --- CRUD ---------------------------------------------------------------

    def create(self, req: UseCaseCreate, created_by: Optional[str] = None) -> UseCase:
        uc = UseCase(
            **req.model_dump(exclude_none=False),
            created_by=created_by,
        )
        uc.computed = compute(uc)
        self.table.put_item(Item=self._to_item(uc))
        return uc

    def get(self, use_case_id: str) -> Optional[UseCase]:
        resp = self.table.get_item(Key={
            "pk": f"{self.PK_PREFIX}{use_case_id}",
            "sk": self.SK_LATEST,
        })
        item = resp.get("Item")
        if not item:
            return None
        return self._from_item(item)

    def list(self, status: Optional[UseCaseStatus] = None) -> List[UseCase]:
        scan_kwargs = {"FilterExpression": Attr("pk").begins_with(self.PK_PREFIX)}
        if status:
            scan_kwargs["FilterExpression"] = scan_kwargs["FilterExpression"] & Attr("status").eq(status.value)
        resp = self.table.scan(**scan_kwargs)
        items = resp.get("Items", [])
        ucs = [self._from_item(i) for i in items]
        ucs.sort(key=lambda u: (u.computed.composite if u.computed else 0), reverse=True)
        return ucs

    def update(self, use_case_id: str, req: UseCaseUpdate) -> Optional[UseCase]:
        uc = self.get(use_case_id)
        if not uc:
            return None
        update_data = req.model_dump(exclude_none=True)
        for field, value in update_data.items():
            setattr(uc, field, value)
        uc.updated_at = datetime.utcnow()
        uc.computed = compute(uc)
        self.table.put_item(Item=self._to_item(uc))
        return uc

    def delete(self, use_case_id: str) -> Optional[UseCase]:
        uc = self.get(use_case_id)
        if not uc:
            return None
        self.table.delete_item(Key={
            "pk": f"{self.PK_PREFIX}{use_case_id}",
            "sk": self.SK_LATEST,
        })
        return uc
