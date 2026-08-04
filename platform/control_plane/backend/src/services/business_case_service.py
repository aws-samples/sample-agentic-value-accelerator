"""Business Case service — DynamoDB-backed CRUD with unique-name enforcement."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from models.business_case import (
    BusinessCase,
    BusinessCaseCreate,
    BusinessCaseStatus,
    BusinessCaseUpdate,
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
    return f"BCNAME#{name.strip().lower()}"


class NameTakenError(Exception):
    pass


class BusinessCaseService:
    PK_PREFIX = "BC#"
    SK_LATEST = "LATEST"
    NAME_SK = "REF"

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    def _to_item(self, bc: BusinessCase) -> dict:
        body = bc.model_dump(mode="json")
        return _to_ddb({
            "pk": f"{self.PK_PREFIX}{bc.business_case_id}",
            "sk": self.SK_LATEST,
            "business_case_id": bc.business_case_id,
            "name": bc.name,
            "name_lc": bc.name.strip().lower(),
            "status": bc.status.value,
            "created_at": body["created_at"],
            "updated_at": body["updated_at"],
            "data": json.dumps(body),
        })

    def _from_item(self, item: dict) -> BusinessCase:
        return BusinessCase.model_validate(_from_ddb(json.loads(item["data"])))

    def _claim_name(self, name: str, business_case_id: str) -> None:
        try:
            self.table.put_item(
                Item={"pk": _name_key(name), "sk": self.NAME_SK, "business_case_id": business_case_id},
                ConditionExpression="attribute_not_exists(pk)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise NameTakenError(f"Business case name '{name}' is already in use")
            raise

    def _release_name(self, name: str) -> None:
        try:
            self.table.delete_item(Key={"pk": _name_key(name), "sk": self.NAME_SK})
        except ClientError as e:
            logger.warning(f"Failed to release name '{name}': {e}")

    # --- CRUD --------------------------------------------------------------

    def create(self, req: BusinessCaseCreate, created_by: Optional[str] = None) -> BusinessCase:
        bc = BusinessCase(**req.model_dump(exclude_none=False), created_by=created_by)
        self._claim_name(bc.name, bc.business_case_id)
        try:
            bc.computed = compute(bc)
            self.table.put_item(Item=self._to_item(bc))
        except Exception:
            self._release_name(bc.name)
            raise
        return bc

    def get(self, business_case_id: str) -> Optional[BusinessCase]:
        resp = self.table.get_item(Key={
            "pk": f"{self.PK_PREFIX}{business_case_id}",
            "sk": self.SK_LATEST,
        })
        item = resp.get("Item")
        return self._from_item(item) if item else None

    def list(self, status: Optional[BusinessCaseStatus] = None) -> List[BusinessCase]:
        scan_kwargs = {"FilterExpression": Attr("pk").begins_with(self.PK_PREFIX)}
        if status:
            scan_kwargs["FilterExpression"] = scan_kwargs["FilterExpression"] & Attr("status").eq(status.value)
        resp = self.table.scan(**scan_kwargs)
        items = resp.get("Items", [])
        out = [self._from_item(i) for i in items]
        out.sort(key=lambda x: x.updated_at, reverse=True)
        return out

    def update(self, business_case_id: str, req: BusinessCaseUpdate) -> Optional[BusinessCase]:
        existing = self.get(business_case_id)
        if not existing:
            return None
        new_name = req.name
        if new_name and new_name.strip().lower() != existing.name.strip().lower():
            self._claim_name(new_name, business_case_id)
            self._release_name(existing.name)
        update_data = req.model_dump(exclude_none=True)
        for field, value in update_data.items():
            setattr(existing, field, value)
        existing.updated_at = datetime.utcnow()
        existing.computed = compute(existing)
        self.table.put_item(Item=self._to_item(existing))
        return existing

    def delete(self, business_case_id: str) -> Optional[BusinessCase]:
        existing = self.get(business_case_id)
        if not existing:
            return None
        self.table.delete_item(Key={
            "pk": f"{self.PK_PREFIX}{business_case_id}",
            "sk": self.SK_LATEST,
        })
        self._release_name(existing.name)
        return existing
