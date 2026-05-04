"""Frontier Agents (AaaS) deployment API routes.

Drives the `/aaas/aws-agents/*` product area. Today the catalog has a single
entry (AWS DevOps Agent). The deploy flow is same-account and mirrors FSI
Foundry: package the IaC directory to S3, then kick off the shared Step
Functions pipeline with action=deploy and iac_type=<terraform|cdk|cloudformation>.
"""

from __future__ import annotations

import io
import json
import logging
import os
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from fastapi import APIRouter, HTTPException, Depends as RBACDepends
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role
from models.deployment import DeploymentCreate, DeploymentResponse, DeploymentStatus
from services.deployment_service import DeploymentService
from services.pipeline_service import PipelineService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/frontier-agents", tags=["frontier-agents"])

_deploy_svc: Optional[DeploymentService] = None
_pipeline_svc: Optional[PipelineService] = None
_registry_cache: Optional[Dict[str, Any]] = None


def _get_deploy_svc() -> DeploymentService:
    global _deploy_svc
    if _deploy_svc is None:
        _deploy_svc = DeploymentService(
            table_name=settings.DEPLOYMENTS_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _deploy_svc


def _get_pipeline_svc() -> PipelineService:
    global _pipeline_svc
    if _pipeline_svc is None:
        # Frontier Agents run on their own dedicated Step Functions pipeline
        # (Terraform-only, no Docker/Langfuse/Foundry coupling). Fall back to
        # the shared state machine if the dedicated one isn't provisioned yet.
        arn = settings.FRONTIER_AGENTS_STATE_MACHINE_ARN or settings.STATE_MACHINE_ARN
        _pipeline_svc = PipelineService(
            state_machine_arn=arn,
            region=settings.AWS_REGION,
        )
    return _pipeline_svc


def _load_registry() -> Dict[str, Any]:
    global _registry_cache
    if _registry_cache is None:
        path = settings.FRONTIER_AGENTS_REGISTRY_PATH
        if not os.path.exists(path):
            raise HTTPException(
                status_code=500,
                detail=f"Frontier Agents registry not found at {path}",
            )
        with open(path, "r") as f:
            _registry_cache = json.load(f)
    return _registry_cache


def _find_agent(agent_id: str) -> Dict[str, Any]:
    registry = _load_registry()
    for agent in registry.get("agents", []):
        if agent.get("id") == agent_id:
            return agent
    raise HTTPException(status_code=404, detail=f"Frontier agent not found: {agent_id}")


# --- Response shapes ---------------------------------------------------------


class FrontierAgentParameter(BaseModel):
    name: str
    label: str
    type: str = "string"
    required: bool = False
    default: str = ""
    description: str = ""


class FrontierAgentCatalogEntry(BaseModel):
    id: str
    name: str
    description: str
    status: str
    supported_iac_types: List[str]
    coming_soon_iac_types: List[str] = Field(default_factory=list)
    parameters: List[FrontierAgentParameter] = Field(default_factory=list)
    advanced_parameters: List[FrontierAgentParameter] = Field(default_factory=list)


# --- Request shapes ----------------------------------------------------------


class FrontierAgentDeployRequest(BaseModel):
    deployment_name: str = Field(..., min_length=1, max_length=100)
    agent_id: str = Field(..., min_length=1)
    iac_type: str = Field(default="terraform")
    aws_region: str = Field(default="us-east-1")
    parameters: Dict[str, Any] = Field(default_factory=dict)


# --- Routes ------------------------------------------------------------------


@router.get("/catalog", response_model=List[FrontierAgentCatalogEntry])
async def list_frontier_agents(_=RBACDepends(require_role(Role.VIEWER))):
    """Return the list of managed Frontier Agents available for deployment."""
    registry = _load_registry()
    return [FrontierAgentCatalogEntry(**a) for a in registry.get("agents", [])]


@router.get("/catalog/{agent_id}", response_model=FrontierAgentCatalogEntry)
async def get_frontier_agent(agent_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    """Return a single Frontier Agent's catalog entry."""
    return FrontierAgentCatalogEntry(**_find_agent(agent_id))


@router.post("/deploy", status_code=201, response_model=DeploymentResponse)
async def deploy_frontier_agent(
    req: FrontierAgentDeployRequest,
    _=RBACDepends(require_role(Role.OPERATOR)),
):
    """Deploy a Frontier Agent into the control-plane AWS account.

    Packages the agent's IaC directory (aaas/frontier_agents/{id}/iac/{iac_type}/)
    to S3, creates a deployment record, and kicks off the shared Step Functions
    pipeline with action=deploy.
    """
    agent = _find_agent(req.agent_id)

    supported = agent.get("supported_iac_types", [])
    if req.iac_type not in supported:
        raise HTTPException(
            status_code=400,
            detail=f"IaC type '{req.iac_type}' not supported for {req.agent_id}. Supported: {supported}",
        )

    # Resolve the agent's IaC directory on disk.
    rel_iac_dir = agent.get("iac_path")
    if not rel_iac_dir:
        raise HTTPException(
            status_code=500,
            detail=f"Registry entry for {req.agent_id} is missing iac_path",
        )
    # iac_path is relative to aaas/ (e.g. "frontier_agents/devops/iac").
    aaas_root = Path(settings.FRONTIER_AGENTS_PATH).parent
    iac_dir = aaas_root / rel_iac_dir / req.iac_type
    if not iac_dir.is_dir():
        raise HTTPException(
            status_code=500,
            detail=f"IaC directory not found on disk: {iac_dir}",
        )

    # Create the deployment record up front so we can attach an execution ARN to it.
    template_id = f"frontier-agents-{req.agent_id}"
    deploy_svc = _get_deploy_svc()
    deploy_req = DeploymentCreate(
        deployment_name=req.deployment_name,
        template_id=template_id,
        iac_type=req.iac_type,
        framework_id="none",
        aws_region=req.aws_region,
        parameters=dict(req.parameters),
    )
    deployment = deploy_svc.create_deployment(deploy_req)

    # Zip the IaC folder and upload to the deployment bucket.
    try:
        s3_client = boto3.client("s3", region_name=settings.AWS_REGION)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(iac_dir):
                dirs[:] = [
                    d
                    for d in dirs
                    if not d.startswith(".") and d not in ("terraform.tfstate.d", "node_modules", "__pycache__", ".artifacts")
                ]
                for fname in files:
                    if fname.startswith(".") or fname.endswith((".tfstate", ".tfstate.backup")):
                        continue
                    full = os.path.join(root, fname)
                    arc = os.path.relpath(full, iac_dir)
                    zf.write(full, arc)

        s3_key = f"deployments/{deployment.deployment_id}/{req.agent_id}-{req.iac_type}.zip"
        s3_client.put_object(
            Bucket=deployment.s3_bucket,
            Key=s3_key,
            Body=buf.getvalue(),
        )
        deployment.s3_key = s3_key
        logger.info(
            f"Packaged {iac_dir} to s3://{deployment.s3_bucket}/{s3_key}"
        )
    except Exception as e:
        logger.error(f"Frontier Agent packaging failed: {e}")
        deploy_svc.update_status(
            deployment.deployment_id,
            DeploymentStatus.FAILED,
            error_message=str(e),
        )
        raise HTTPException(status_code=500, detail=f"Packaging failed: {e}")

    # Start the dedicated Frontier Agents pipeline. Input shape is intentionally
    # slim — the state machine in modules/frontier_agents_pipeline/ only reads
    # these keys, so adding anything else here is dead weight.
    try:
        pipeline_svc = _get_pipeline_svc()
        sf_input = {
            "deployment_id": deployment.deployment_id,
            "deployment_name": req.deployment_name,
            "agent_id": req.agent_id,
            "iac_type": req.iac_type,
            "aws_region": req.aws_region,
            "s3_bucket": deployment.s3_bucket,
            "s3_key": deployment.s3_key,
            "parameters": req.parameters,
            "action": "deploy",
        }
        execution_name = f"deploy-{deployment.deployment_id}"
        response = pipeline_svc.sfn_client.start_execution(
            stateMachineArn=pipeline_svc.state_machine_arn,
            name=execution_name,
            input=json.dumps(sf_input),
        )
        deployment.execution_arn = response["executionArn"]
        deploy_svc.table.put_item(Item=deploy_svc._to_item(deployment))
    except Exception as e:
        logger.error(f"Pipeline start failed: {e}")
        deploy_svc.update_status(
            deployment.deployment_id,
            DeploymentStatus.FAILED,
            error_message=str(e),
        )
        raise HTTPException(status_code=500, detail=f"Pipeline start failed: {e}")

    return DeploymentResponse(**deployment.dict())
