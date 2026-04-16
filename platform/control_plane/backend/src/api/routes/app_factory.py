"""App Factory API routes — capture questionnaire submissions and store in DynamoDB"""

import uuid
import logging
from datetime import datetime, timezone

import boto3
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app-factory", tags=["app-factory"])

_table = None


def get_table():
    global _table
    if _table is None:
        dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        _table = dynamodb.Table(settings.APP_FACTORY_TABLE_NAME)
    return _table


class AppFactorySubmission(BaseModel):
    use_case_name: str
    problem: str
    domain: str
    current_process: str
    users: str
    successful_interaction: str
    workflow: str
    frequency: str
    human_in_loop: Optional[str] = ""
    data_inputs: str
    data_outputs: str
    compliance: Optional[str] = ""
    existing_systems: Optional[str] = ""


@router.post("/submissions", status_code=201)
async def create_submission(body: AppFactorySubmission):
    submission_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    item = {
        "pk": f"SUBMISSION#{submission_id}",
        "sk": "META",
        "submission_id": submission_id,
        "created_at": created_at,
        **body.dict(),
    }

    try:
        get_table().put_item(Item=item)
    except Exception as e:
        logger.error(f"Failed to save submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to save submission")

    logger.info(f"Saved app factory submission {submission_id}")
    return {"submission_id": submission_id, "created_at": created_at}


@router.get("/submissions")
async def list_submissions():
    try:
        response = get_table().scan(
            FilterExpression="sk = :sk",
            ExpressionAttributeValues={":sk": "META"},
        )
        items = response.get("Items", [])
        for item in items:
            item.pop("pk", None)
            item.pop("sk", None)
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items
    except Exception as e:
        logger.error(f"Failed to list submissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve submissions")
