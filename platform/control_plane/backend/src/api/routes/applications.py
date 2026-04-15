"""FSI Foundry application deployment API routes"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import logging
import os
import io
import zipfile
from pathlib import Path
import boto3

from models.deployment import DeploymentCreate, DeploymentResponse, DeploymentStatus
from services.deployment_service import DeploymentService
from services.pipeline_service import PipelineService
from services.foundry_catalog import FoundryCatalog
from services.s3_delivery_service import S3DeliveryService
from core.config import settings
from fastapi import Depends as RBACDepends
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/applications", tags=["applications"])

_foundry_catalog = None
_deploy_svc = None
_pipeline_svc = None
_s3_svc = None


def _repo_root() -> str:
    """Resolve the repo root from the templates dir (backend/../..)"""
    return str(os.path.abspath(os.path.join(settings.TEMPLATES_DIR, "..", "..", "..")))


def get_foundry_catalog():
    global _foundry_catalog
    if _foundry_catalog is None:
        _foundry_catalog = FoundryCatalog(settings.FOUNDRY_OFFERINGS_PATH)
    return _foundry_catalog


def get_deploy_svc():
    global _deploy_svc
    if _deploy_svc is None:
        _deploy_svc = DeploymentService(table_name=settings.DEPLOYMENTS_TABLE_NAME, region=settings.AWS_REGION)
    return _deploy_svc


def get_pipeline_svc():
    global _pipeline_svc
    if _pipeline_svc is None:
        _pipeline_svc = PipelineService(state_machine_arn=settings.STATE_MACHINE_ARN, region=settings.AWS_REGION)
    return _pipeline_svc


def get_s3_svc():
    global _s3_svc
    if _s3_svc is None:
        _s3_svc = S3DeliveryService(region=settings.AWS_REGION)
    return _s3_svc


class FoundryDeployRequest(BaseModel):
    deployment_name: str = Field(..., min_length=1, max_length=100)
    use_case_name: str
    framework: str = "langchain_langgraph"
    deployment_pattern: str = "agentcore"
    aws_region: str = "us-east-1"
    parameters: Dict[str, Any] = Field(default_factory=dict)


class FoundryUseCaseResponse(BaseModel):
    id: str
    use_case_name: str
    name: str
    description: str
    supported_frameworks: List[str]
    supported_patterns: List[str]
    agents: List[dict]


@router.get("/foundry/use-cases", response_model=List[FoundryUseCaseResponse])
async def list_foundry_use_cases(_=RBACDepends(require_role(Role.VIEWER))):
    catalog = get_foundry_catalog()
    return [
        FoundryUseCaseResponse(
            id=uc.id, use_case_name=uc.use_case_name, name=uc.name,
            description=uc.description, supported_frameworks=uc.supported_frameworks,
            supported_patterns=uc.supported_patterns, agents=uc.agents,
        )
        for uc in catalog.list_use_cases()
    ]


@router.post("/foundry/deploy", status_code=201, response_model=DeploymentResponse)
async def deploy_foundry_use_case(req: FoundryDeployRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    catalog = get_foundry_catalog()
    use_case = catalog.get_use_case(req.use_case_name)
    if not use_case:
        raise HTTPException(status_code=404, detail=f"Use case not found: {req.use_case_name}")

    if req.framework not in use_case.supported_frameworks:
        raise HTTPException(status_code=400, detail=f"Framework '{req.framework}' not supported. Valid: {use_case.supported_frameworks}")

    if req.deployment_pattern not in use_case.supported_patterns:
        raise HTTPException(status_code=400, detail=f"Pattern '{req.deployment_pattern}' not supported. Valid: {use_case.supported_patterns}")

    # Create deployment using the existing deployment service
    deploy_req = DeploymentCreate(
        deployment_name=req.deployment_name,
        template_id=f"foundry-{req.use_case_name}",
        iac_type="terraform",
        framework_id=req.framework,
        aws_region=req.aws_region,
        parameters={
            **req.parameters,
            "USE_CASE_ID": req.use_case_name,
            "FRAMEWORK": req.framework,
            "DEPLOYMENT_PATTERN": req.deployment_pattern,
        },
    )

    svc = get_deploy_svc()
    deployment = svc.create_deployment(deploy_req)

    # Package the use case IaC + app source to S3
    try:
        import zipfile, io
        s3_client = boto3.client("s3", region_name=settings.AWS_REGION)

        # IaC from the actual foundations directory (e.g., foundations/iac/agentcore/)
        iac_dir = os.path.join(settings.FOUNDRY_IAC_PATH, req.deployment_pattern)
        shared_dir = os.path.join(settings.FOUNDRY_IAC_PATH, "shared")

        if not os.path.isdir(iac_dir):
            raise FileNotFoundError(f"IaC directory not found: {iac_dir}")

        def _add_dir_to_zip(zf, src_dir, arc_prefix):
            for root, dirs, filenames in os.walk(src_dir):
                dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("terraform.tfstate.d", "node_modules", "__pycache__")]
                for fname in filenames:
                    if fname.startswith(".") or fname.endswith(".tfstate") or fname.endswith(".tfstate.backup"):
                        continue
                    full = os.path.join(root, fname)
                    arcname = os.path.join(arc_prefix, os.path.relpath(full, src_dir))
                    zf.write(full, arcname)

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            # IaC (pattern-specific: infra/, runtime/, etc.)
            _add_dir_to_zip(zf, iac_dir, "")
            # Shared Terraform module
            if os.path.isdir(shared_dir):
                _add_dir_to_zip(zf, shared_dir, "shared")
            # Docker build context
            if os.path.isdir(settings.FOUNDRY_DOCKER_PATH):
                _add_dir_to_zip(zf, settings.FOUNDRY_DOCKER_PATH, "docker")
            # Foundations source (for Docker image)
            if os.path.isdir(settings.FOUNDRY_SRC_PATH):
                _add_dir_to_zip(zf, settings.FOUNDRY_SRC_PATH, "app_src")
            # Use case source (for Docker image)
            uc_src = os.path.join(settings.FOUNDRY_USE_CASES_PATH, req.use_case_name, "src")
            if os.path.isdir(uc_src):
                _add_dir_to_zip(zf, uc_src, f"use_cases/{req.use_case_name}/src")
            # Sample data (for Terraform s3_object uploads)
            fsi_root = Path(settings.FOUNDRY_IAC_PATH).parent.parent
            data_dir = fsi_root / "data" / "samples"
            if data_dir.is_dir():
                _add_dir_to_zip(zf, str(data_dir), "data/samples")

            # UI source (per-use-case, only if ui/{use_case_name}/ exists)
            ui_src = os.path.join(settings.FOUNDRY_UI_PATH, req.use_case_name)
            if os.path.isdir(ui_src):
                _add_dir_to_zip(zf, ui_src, f"ui/{req.use_case_name}")
                # Also include UI terraform module
                ui_iac = os.path.join(settings.FOUNDRY_IAC_PATH, req.deployment_pattern, "ui")
                if os.path.isdir(ui_iac):
                    _add_dir_to_zip(zf, ui_iac, "ui_iac")

        s3_key = f"deployments/{deployment.deployment_id}/{req.use_case_name}.zip"
        s3_client.put_object(Bucket=deployment.s3_bucket, Key=s3_key, Body=buf.getvalue())
        deployment.s3_key = s3_key
        logger.info(f"Packaged {iac_dir} to s3://{deployment.s3_bucket}/{s3_key}")
    except Exception as e:
        logger.error(f"Foundry packaging failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Packaging failed: {e}")

    # Start the pipeline
    try:
        pipeline_svc = get_pipeline_svc()
        # Build SF input directly (foundry use cases don't have template.json jobs)
        import json
        sf_input = {
            "deployment_id": deployment.deployment_id,
            "template_id": f"foundry-{req.use_case_name}",
            "deployment_name": req.deployment_name,
            "iac_type": "terraform",
            "framework_id": req.framework,
            "aws_region": req.aws_region,
            "s3_bucket": deployment.s3_bucket,
            "s3_key": deployment.s3_key,
            "parameters": deploy_req.parameters,
            "target_account_id": None,
            "target_role_arn": None,
            "action": "deploy",
            "job": {
                "name": "onboarding",
                "incoming_event": f"{req.use_case_name}_onboarding_request",
                "outgoing_event": f"{req.use_case_name}_onboarding_success",
            },
            "action": "deploy",
        }
        execution_name = f"deploy-{deployment.deployment_id}"
        response = pipeline_svc.sfn_client.start_execution(
            stateMachineArn=pipeline_svc.state_machine_arn,
            name=execution_name,
            input=json.dumps(sf_input),
        )
        deployment.execution_arn = response["executionArn"]
        svc.table.put_item(Item=svc._to_item(deployment))
    except Exception as e:
        logger.error(f"Pipeline start failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Pipeline start failed: {e}")

    return DeploymentResponse(**deployment.dict())
