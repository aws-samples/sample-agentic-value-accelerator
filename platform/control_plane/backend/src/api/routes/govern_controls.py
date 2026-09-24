"""API routes for unified control evaluation."""

from typing import Optional

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_controls import (
    AwsConfigRulesResponse,
    EvaluateControlsRequest,
    EvaluateControlsResponse,
)
from services.govern_controls_service import GovernControlsService

router = APIRouter(prefix="/govern/controls", tags=["govern-controls"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_controls", region_scope.SINGLE_REGION, prefix="/govern/controls")

# Lazy singleton
_service: Optional[GovernControlsService] = None


def _get_service() -> GovernControlsService:
    global _service
    if _service is None:
        # settings.GOVERN_AWS_REGION (tier 2), not a literal and not AWS_REGION. Every
        # source this service evaluates describes the CUSTOMER's estate, so all of them
        # are governed-fleet reads: cloudtrail, cloudwatch, bedrock (guardrails),
        # bedrock-agent, config, sagemaker and glue clients are all built from this one
        # region in GovernControlsService._get_client(). See core/region_config.py.
        #
        # The literal was invisible here because it happened to equal GOVERN_AWS_REGION in
        # the demo account, and a wrong region does not raise: the list call succeeds and
        # returns the other region's inventory. Measured read-only in the demo account -
        # us-east-1 holds 7 guardrails / 7 Bedrock agents / 10 Config rules / 1 SageMaker
        # endpoint, us-east-2 holds 0 / 1 / 3 / 0. Against a fleet governed outside
        # us-east-1 this silently evaluated controls as "no guardrails configured" and
        # reported it as live.
        _service = GovernControlsService(region=settings.GOVERN_AWS_REGION)
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


@router.get("/config-rules", response_model=AwsConfigRulesResponse)
async def get_config_rules(_=Depends(require_role(Role.VIEWER))):
    """AWS Config rules and their per-rule compliance status.

    Surfaces the AWS Config rule set that already backs internal control
    evaluation: rule name, description, source owner, ComplianceType, and (when
    available) the capped count of non-compliant resources per rule.

    Returns:
        AwsConfigRulesResponse with:
        - rules: per-rule compliance detail
        - total / compliant / noncompliant / not_applicable / insufficient_data counts
        - live: whether the data came from a live AWS Config call
        - source / note: honest data-source envelope
    """
    service = _get_service()
    return service.get_config_rules()
