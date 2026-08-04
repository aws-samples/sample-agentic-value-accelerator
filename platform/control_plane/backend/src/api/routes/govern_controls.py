"""API routes for unified control evaluation."""

from typing import Optional

from fastapi import APIRouter, Depends

from core.rbac import Role, require_role
from models.govern_controls import (
    EvaluateControlsRequest,
    EvaluateControlsResponse,
)
from services.govern_controls_service import GovernControlsService

router = APIRouter(prefix="/govern/controls", tags=["govern-controls"])

# Lazy singleton
_service: Optional[GovernControlsService] = None


def _get_service() -> GovernControlsService:
    global _service
    if _service is None:
        _service = GovernControlsService(region="us-east-1")
    return _service


@router.post("/evaluate", response_model=EvaluateControlsResponse)
async def evaluate_controls(request: EvaluateControlsRequest, _=Depends(require_role(Role.OPERATOR))):
    """Evaluate multiple controls using their specified auto-detection sources.

    This endpoint accepts a batch of controls, each specifying an autoDetectSource,
    and returns evaluation results with evidence and confidence scores.

    Supported autoDetectSource values:
    - cloudtrail: Check for active trails and recent AI-service events
    - cloudwatch: Check for alarms and AI-related metrics
    - bedrock-guardrails: Check guardrails configured and intervention rate
    - bedrock-agents: Check agent inventory and status
    - config / config-rules: Check AWS Config rule compliance
    - sagemaker: Check SageMaker model inventory and endpoints
    - iam: Check IAM policies and roles
    - glue: Check Glue Data Catalog databases and data quality

    Returns:
        EvaluateControlsResponse with:
        - live: Whether all sources returned live data
        - evaluations: List of ControlEvaluation per control
        - sources: Status and latency of each data source used
    """
    service = _get_service()
    return await service.evaluate_controls(request.controls)
