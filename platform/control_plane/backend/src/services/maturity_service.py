"""Maturity Assessment service — DynamoDB-backed CRUD with unique-name enforcement.

Storage scheme (single-table, shared with prioritization table for now):
    pk = "ASSESSMENT#<id>"   sk = "LATEST"     -> the assessment record
    pk = "ASSESSNAME#<name_lc>"  sk = "REF"   -> reverse lookup for unique-name
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from models.maturity import (
    Assessment,
    AssessmentCreate,
    AssessmentStatus,
    AssessmentUpdate,
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


def _name_key(name: str) -> str:
    return f"ASSESSNAME#{name.strip().lower()}"


class NameTakenError(Exception):
    """Raised when an assessment with the same name already exists."""


class MaturityService:
    PK_PREFIX = "ASSESSMENT#"
    SK_LATEST = "LATEST"
    NAME_SK = "REF"

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    # --- DDB shape ---------------------------------------------------------

    def _to_item(self, a: Assessment) -> dict:
        body = a.model_dump(mode="json")
        return _to_ddb({
            "pk": f"{self.PK_PREFIX}{a.assessment_id}",
            "sk": self.SK_LATEST,
            "assessment_id": a.assessment_id,
            "name": a.name,
            "name_lc": a.name.strip().lower(),
            "status": a.status.value,
            "created_at": body["created_at"],
            "updated_at": body["updated_at"],
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> Assessment:
        body = _from_ddb(json.loads(item["data"]))
        return Assessment.model_validate(body)

    # --- Unique-name index -------------------------------------------------

    def _claim_name(self, name: str, assessment_id: str) -> None:
        try:
            self.table.put_item(
                Item={"pk": _name_key(name), "sk": self.NAME_SK, "assessment_id": assessment_id},
                ConditionExpression="attribute_not_exists(pk)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise NameTakenError(f"Assessment name '{name}' is already in use")
            raise

    def _release_name(self, name: str) -> None:
        try:
            self.table.delete_item(Key={"pk": _name_key(name), "sk": self.NAME_SK})
        except ClientError as e:
            logger.warning(f"Failed to release name '{name}': {e}")

    # --- CRUD --------------------------------------------------------------

    def create(self, req: AssessmentCreate, created_by: Optional[str] = None) -> Assessment:
        a = Assessment(**req.model_dump(exclude_none=False), created_by=created_by)
        self._claim_name(a.name, a.assessment_id)
        try:
            a.computed = compute(a)
            self.table.put_item(Item=self._to_item(a))
        except Exception:
            # Roll back the name reservation so the user can retry.
            self._release_name(a.name)
            raise
        return a

    def get(self, assessment_id: str) -> Optional[Assessment]:
        resp = self.table.get_item(Key={
            "pk": f"{self.PK_PREFIX}{assessment_id}",
            "sk": self.SK_LATEST,
        })
        item = resp.get("Item")
        if not item:
            return None
        return self._from_item(item)

    def list(self, status: Optional[AssessmentStatus] = None) -> List[Assessment]:
        scan_kwargs = {"FilterExpression": Attr("pk").begins_with(self.PK_PREFIX)}
        if status:
            scan_kwargs["FilterExpression"] = scan_kwargs["FilterExpression"] & Attr("status").eq(status.value)
        resp = self.table.scan(**scan_kwargs)
        items = resp.get("Items", [])
        out = [self._from_item(i) for i in items]
        out.sort(key=lambda x: x.updated_at, reverse=True)
        return out

    def update(self, assessment_id: str, req: AssessmentUpdate) -> Optional[Assessment]:
        existing = self.get(assessment_id)
        if not existing:
            return None
        new_name = req.name
        if new_name and new_name.strip().lower() != existing.name.strip().lower():
            self._claim_name(new_name, assessment_id)
            self._release_name(existing.name)

        update_data = req.model_dump(exclude_none=True)
        for field, value in update_data.items():
            setattr(existing, field, value)
        existing.updated_at = datetime.utcnow()
        existing.computed = compute(existing)
        self.table.put_item(Item=self._to_item(existing))
        return existing

    def delete(self, assessment_id: str) -> Optional[Assessment]:
        existing = self.get(assessment_id)
        if not existing:
            return None
        self.table.delete_item(Key={
            "pk": f"{self.PK_PREFIX}{assessment_id}",
            "sk": self.SK_LATEST,
        })
        self._release_name(existing.name)
        return existing
