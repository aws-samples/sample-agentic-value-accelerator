"""App Factory API routes — capture questionnaire submissions, generate code, and deploy"""

import uuid
import logging
import json
import os
import io
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import boto3
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core.config import settings
from models.deployment import DeploymentCreate, DeploymentResponse, DeploymentStatus
from services.deployment_service import DeploymentService
from services.pipeline_service import PipelineService
from services.pipeline_inputs import AppFactoryPipelineInput

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app-factory", tags=["app-factory"])

_table = None
_deploy_svc = None
_pipeline_svc = None


def get_table():
    global _table
    if _table is None:
        dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        _table = dynamodb.Table(settings.APP_FACTORY_TABLE_NAME)
    return _table


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


# Map of questionnaire domain values → single-letter catalog prefix. The
# foundry registry (data/registry/offerings.json) uses the same shape —
# "B01" for banking, "I01" for insurance, etc. App-factory submissions get a
# prefix derived from the user's selected domain so catalog IDs across both
# sources remain visually consistent.
_DOMAIN_PREFIX_MAP = {
    "Retail Banking":     "AB",
    "Lending":            "AL",
    "Wealth Management":  "AW",
    "Capital Markets":    "AC",
    "Insurance":          "AI",
    "Compliance & Risk":  "AR",
    "Operations":         "AO",
    "Customer Service":   "AS",
    "Fraud & Security":   "AF",
    "Other":              "AX",
}


def _assign_catalog_id(table, domain: str) -> str:
    """Return the next available <PREFIX><NN> catalog ID for this domain.

    Scans existing SUBMISSION#* items for any catalog_id that shares the
    prefix derived from `domain`, finds the highest NN, increments. Falls
    back to "{prefix}01" if no existing submissions match.
    """
    import re as _re
    prefix = _DOMAIN_PREFIX_MAP.get(domain, "AX")
    pattern = _re.compile(r"^" + _re.escape(prefix) + r"(\d+)$")

    highest = 0
    # Paginated scan across all submissions. Volume is low (dozens, not
    # thousands), so a full scan is fine. If this grows, add a GSI keyed on
    # (prefix, NN) and query instead.
    scan_kwargs = {
        "FilterExpression": "begins_with(pk, :pfx) AND sk = :sk AND attribute_exists(catalog_id)",
        "ExpressionAttributeValues": {":pfx": "SUBMISSION#", ":sk": "META"},
        "ProjectionExpression": "catalog_id",
    }
    while True:
        resp = table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            m = pattern.match(item.get("catalog_id", ""))
            if m:
                highest = max(highest, int(m.group(1)))
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    return f"{prefix}{highest + 1:02d}"


class AppFactorySubmission(BaseModel):
    # use_case_name is the normalized technical ID (lowercase, hyphen-only,
    # <=32 chars) computed by the frontend's toUseCaseId(). This is what
    # flows into every downstream AWS resource name.
    use_case_name: str
    # display_name is the original free-form text the user typed. Stored
    # for UI-side readability. Optional for backwards compatibility with
    # API callers that don't set it (they'll see use_case_name in the UI).
    display_name: Optional[str] = ""
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

    # Normalize use_case_name at the boundary so every downstream consumer
    # (deploy.sh tfvars, builder.py, data-builder, Dockerfile COPY) sees the
    # same canonical form. Prevents leading/trailing whitespace from becoming
    # underscores in one code path and not another.
    payload = body.dict()
    if payload.get("use_case_name"):
        payload["use_case_name"] = payload["use_case_name"].strip()

    # Assign a catalog ID (e.g. I04) derived from the domain prefix. Mirrors
    # the foundry registry's id scheme so both sources look consistent in the
    # UI. Unique across all submissions because it increments from the highest
    # existing number for that prefix.
    table = get_table()
    try:
        catalog_id = _assign_catalog_id(table, payload.get("domain", ""))
    except Exception as e:
        logger.warning(f"Catalog ID assignment failed, using submission_id prefix: {e}")
        catalog_id = f"AX{submission_id[:6].upper()}"

    item = {
        "pk": f"SUBMISSION#{submission_id}",
        "sk": "META",
        "submission_id": submission_id,
        "catalog_id": catalog_id,
        "created_at": created_at,
        "status": "pending",
        **payload,
    }

    try:
        table.put_item(Item=item)
    except Exception as e:
        logger.error(f"Failed to save submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to save submission")

    logger.info(f"Saved app factory submission {submission_id} as catalog {catalog_id}")
    return {
        "submission_id": submission_id,
        "catalog_id": catalog_id,
        "created_at": created_at,
    }


@router.post("/submissions/{submission_id}/deploy", status_code=201)
async def deploy_submission(submission_id: str):
    """Trigger code generation + deployment for an App Factory submission.

    Creates a deployment record (same as other deployments), packages the
    App Factory builder + reference code into a zip, and starts the Step
    Functions pipeline with a special app-factory buildspec.
    """
    # Fetch the submission
    response = get_table().get_item(
        Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"}
    )
    item = response.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail=f"Submission {submission_id} not found")

    use_case_name = item["use_case_name"].strip().replace("-", "_").replace(" ", "_").lower().strip("_")

    # Create a deployment record (same table as all other deployments)
    deploy_req = DeploymentCreate(
        deployment_name=f"app-factory-{use_case_name}",
        template_id=f"app-factory-{use_case_name}",
        iac_type="terraform",
        framework_id="strands",
        aws_region=settings.AWS_REGION,
        parameters={
            "USE_CASE_ID": use_case_name,
            "FRAMEWORK": "strands",
            "DEPLOYMENT_PATTERN": "agentcore",
            "ENABLE_TRACING": "false",
            "LANGFUSE_HOST": "",
            "LANGFUSE_SECRET_NAME": "",
            "SUBMISSION_ID": submission_id,
            "APP_FACTORY_TABLE_NAME": settings.APP_FACTORY_TABLE_NAME,
        },
    )

    svc = get_deploy_svc()
    deployment = svc.create_deployment(deploy_req)

    # Package the App Factory builder + FSI Foundry source into a zip
    try:
        s3_client = boto3.client("s3", region_name=settings.AWS_REGION)

        # Resolve paths
        fsi_root = Path(settings.FOUNDRY_IAC_PATH).parent.parent
        # In Docker: /app/applications/app_factory (via symlink)
        # In local dev: repo_root/applications/app_factory
        docker_app_factory = Path("/app/applications/app_factory")
        if docker_app_factory.is_dir():
            app_factory_dir = docker_app_factory
        else:
            repo_root = fsi_root.parent.parent
            app_factory_dir = repo_root / "applications" / "app_factory"
        iac_dir = os.path.join(settings.FOUNDRY_IAC_PATH, "agentcore")
        shared_dir = os.path.join(settings.FOUNDRY_IAC_PATH, "shared")

        def _add_dir_to_zip(zf, src_dir, arc_prefix):
            for root, dirs, filenames in os.walk(src_dir):
                dirs[:] = [d for d in dirs if not d.startswith(".")
                           and d not in ("terraform.tfstate.d", "node_modules",
                                         "__pycache__", ".terraform")]
                for fname in filenames:
                    if fname.startswith(".") or fname.endswith((".tfstate", ".tfstate.backup", ".tsbuildinfo")):
                        continue
                    full = os.path.join(root, fname)
                    arcname = os.path.join(arc_prefix, os.path.relpath(full, src_dir))
                    zf.write(full, arcname)

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            # App Factory builder and UI template
            if app_factory_dir.is_dir():
                _add_dir_to_zip(zf, str(app_factory_dir), "app_factory")

            # deploy.sh at zip root (CodeBuild buildspec runs this if present)
            deploy_sh = app_factory_dir / "deploy.sh"
            if deploy_sh.exists():
                zf.write(str(deploy_sh), "deploy.sh")

            # IaC (for deploying the generated use case)
            if os.path.isdir(iac_dir):
                _add_dir_to_zip(zf, iac_dir, "iac")
            if os.path.isdir(shared_dir):
                _add_dir_to_zip(zf, shared_dir, "shared")

            # Docker build context
            if os.path.isdir(settings.FOUNDRY_DOCKER_PATH):
                _add_dir_to_zip(zf, settings.FOUNDRY_DOCKER_PATH, "docker")

            # Foundations source (reference for builder + Docker image)
            if os.path.isdir(settings.FOUNDRY_SRC_PATH):
                _add_dir_to_zip(zf, settings.FOUNDRY_SRC_PATH, "app_src")

            # Reference use case source (for builder to study)
            ref_uc = os.path.join(settings.FOUNDRY_USE_CASES_PATH, "customer_service", "src")
            if os.path.isdir(ref_uc):
                _add_dir_to_zip(zf, ref_uc, "use_cases/customer_service/src")

            # Reference sample data and registry
            fsi_data = fsi_root / "data"
            if fsi_data.is_dir():
                _add_dir_to_zip(zf, str(fsi_data), "data")

        s3_key = f"deployments/{deployment.deployment_id}/{use_case_name}.zip"
        s3_client.put_object(Bucket=deployment.s3_bucket, Key=s3_key, Body=buf.getvalue())
        deployment.s3_key = s3_key
        logger.info(f"Packaged app-factory bundle to s3://{deployment.s3_bucket}/{s3_key}")
    except Exception as e:
        logger.error(f"App Factory packaging failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Packaging failed: {e}")

    # Start the Step Functions pipeline
    try:
        pipeline_svc = get_pipeline_svc()
        sf_input = {
            "deployment_id": deployment.deployment_id,
            "template_id": f"app-factory-{use_case_name}",
            "deployment_name": f"app-factory-{use_case_name}",
            "iac_type": "terraform",
            "framework_id": "strands",
            "aws_region": settings.AWS_REGION,
            "s3_bucket": deployment.s3_bucket,
            "s3_key": deployment.s3_key,
            "parameters": AppFactoryPipelineInput.from_dict(deploy_req.parameters).to_sfn_parameters(),
            "target_account_id": None,
            "target_role_arn": None,
            "action": "deploy",
            "job": {
                "name": "onboarding",
                "incoming_event": f"{use_case_name}_onboarding_request",
                "outgoing_event": f"{use_case_name}_onboarding_success",
            },
        }
        execution_name = f"appfactory-{deployment.deployment_id}"
        response = pipeline_svc.sfn_client.start_execution(
            stateMachineArn=pipeline_svc.state_machine_arn,
            name=execution_name,
            input=json.dumps(sf_input),
        )
        deployment.execution_arn = response["executionArn"]
        svc.table.put_item(Item=svc._to_item(deployment))
    except Exception as e:
        logger.error(f"App Factory pipeline start failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Pipeline start failed: {e}")

    # Update the submission with deployment info
    try:
        get_table().update_item(
            Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"},
            UpdateExpression="SET #status = :status, deployment_id = :did",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": "deploying",
                ":did": deployment.deployment_id,
            },
        )
    except Exception:
        logger.warning(f"Failed to update submission {submission_id} with deployment_id")

    return DeploymentResponse(**deployment.dict())


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


@router.get("/submissions/{submission_id}")
async def get_submission(submission_id: str):
    try:
        response = get_table().get_item(
            Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"}
        )
        item = response.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Submission not found")
        item.pop("pk", None)
        item.pop("sk", None)
        return item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve submission")
