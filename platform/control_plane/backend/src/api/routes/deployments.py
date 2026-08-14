"""Deployment CRUD API routes"""

from fastapi import APIRouter, HTTPException, Query, UploadFile, File as FastAPIFile, Header
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import json
import time
import base64
import os
import subprocess
import glob as globmod
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config

from datetime import datetime
from models.deployment import DeploymentCreate, DeploymentResponse, DeploymentStatus, StatusHistoryEntry
from services.deployment_service import DeploymentService
from services.s3_delivery_service import S3DeliveryService
from services.template_catalog import TemplateCatalog
from services.pipeline_service import PipelineService
from services.langfuse_provisioning import LangfuseProvisioningService
from core.config import settings
from fastapi import Depends as RBACDepends
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/deployments", tags=["deployments"])

_catalog = None
_deploy_svc = None
_s3_svc = None
_pipeline_svc = None

# In-memory store for async test results (safe for single-task ECS)
_test_results: dict[str, dict] = {}
_test_results_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=4)
_TEST_RESULT_TTL_SECONDS = 600  # 10 minutes


def get_catalog():
    global _catalog
    if _catalog is None:
        extra = [settings.REFERENCE_IMPLEMENTATIONS_DIR] if settings.REFERENCE_IMPLEMENTATIONS_DIR else []
        _catalog = TemplateCatalog(templates_dir=settings.TEMPLATES_DIR, extra_dirs=extra)
    return _catalog


def get_deploy_svc():
    global _deploy_svc
    if _deploy_svc is None:
        _deploy_svc = DeploymentService(
            table_name=settings.DEPLOYMENTS_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _deploy_svc


def get_s3_svc():
    global _s3_svc
    if _s3_svc is None:
        _s3_svc = S3DeliveryService(region=settings.AWS_REGION)
    return _s3_svc


def get_pipeline_svc():
    global _pipeline_svc
    if _pipeline_svc is None:
        _pipeline_svc = PipelineService(
            state_machine_arn=settings.STATE_MACHINE_ARN,
            region=settings.AWS_REGION,
        )
    return _pipeline_svc


@router.post("", status_code=201, response_model=DeploymentResponse)
async def create_deployment(
    req: DeploymentCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.OPERATOR)),
):
    catalog = get_catalog()
    template = catalog.get_template(req.template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {req.template_id}")

    # Validate required parameters
    for param in template.metadata.parameters or []:
        if param.get("required") and param.get("name") not in req.parameters:
            raise HTTPException(status_code=400, detail=f"Required parameter missing: {param.get('name')}")

    # Consult the Approval Policy engine BEFORE any state change so a
    # `deny` verdict blocks the deploy cleanly and an `auto_approve`
    # verdict creates an audit-only queue row. Failing this call is
    # non-fatal — a broken policy engine shouldn't take down deploys
    # (the resource_kind='application' + action='deploy' matches the
    # `AVA Default: Application deploy auto-approves` seed).
    try:
        from services import approval_policy_engine as _policy
        _deploy_verdict = _policy.evaluate(
            kind="application",
            resource_id=req.template_id,
            action="deploy",
        )
        if _deploy_verdict.mode == _policy.MODE_DENY:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Approval Policy denies deploying '{req.template_id}': "
                    f"{_deploy_verdict.reason or 'no reason given'}"
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        # Log and continue — deploy proceeds without a queue row rather
        # than fail on a policy-engine outage.
        logger.warning(f"Policy evaluate for deploy failed (continuing): {e}")
        _deploy_verdict = None

    # Auto-inject control plane VPC for foundation stack
    if template.metadata.type == "foundation" and settings.CONTROL_PLANE_VPC_ID:
        req.parameters.setdefault("existing_vpc_id", settings.CONTROL_PLANE_VPC_ID)

    # Auto-rewrite project_name for foundation-stack with a SHORT account suffix.
    #
    # The langfuse module bakes its inputs into a chain of resources:
    #   var.name = "${var.project_name}-langfuse"        (root TF)
    #   replication_group_id = "${var.name}-langfuse-cache"   (inside module)  → 40-char cap
    #   aws_lb_target_group.name = "${var.name}-langfuse"     (inside module)  → 32-char cap
    #
    # So `${project_name}-langfuse-langfuse-cache` and `${project_name}-langfuse-langfuse`
    # are the binding constraints. The default project_name="foundation" produces
    # "foundation-langfuse-langfuse-cache" (34) and "foundation-langfuse-langfuse" (28),
    # which fit. But re-deploys on the same account collide on those globally-named
    # resources, so we need uniqueness.
    #
    # Strategy: replace the user-supplied project_name with `fdn-{last-6-of-account}`
    # (10 chars total). That gives:
    #   ${project_name}-langfuse-langfuse-cache = "fdn-739298-langfuse-langfuse-cache" = 34 ✓ (≤40)
    #   ${project_name}-langfuse-langfuse       = "fdn-739298-langfuse-langfuse"       = 28 ✓ (≤32)
    # Idempotent: skips if project_name is already "fdn-{6digits}".
    if template.metadata.type == "foundation":
        try:
            account_id = boto3.client("sts").get_caller_identity()["Account"]
            account_suffix = account_id[-6:]
            short_project = f"fdn-{account_suffix}"
            current_project = req.parameters.get("project_name", "foundation")
            if current_project != short_project:
                req.parameters["project_name"] = short_project
            # deployment_name is just the human-facing label (used in DDB), not
            # baked into resources. Keep it readable + unique per account.
            if not req.deployment_name.endswith(account_suffix):
                req.deployment_name = f"{req.deployment_name}-{account_suffix}"
            logger.info(
                f"Foundation-stack deploy: deployment_name={req.deployment_name} "
                f"project_name={req.parameters['project_name']}"
            )
        except Exception as e:
            # If STS call fails, fall through with the original name. Better to
            # let the deploy fail with a clear collision error than to mask it.
            logger.warning(f"Could not derive account suffix for foundation stack: {e}")

    # Resolve foundation dependencies
    if template.metadata.dependencies:
        svc_check = get_deploy_svc()
        try:
            dep_outputs = svc_check.resolve_dependencies(template.metadata.dependencies)
            req.parameters.update(dep_outputs)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Provision per-use-case Langfuse project if foundation stack provides it
        langfuse_host = dep_outputs.get("langfuse_host")
        langfuse_secret = dep_outputs.get("langfuse_secret_name")
        if langfuse_host and langfuse_secret:
            use_case_name = req.template_id.replace("foundry-", "") if req.template_id.startswith("foundry-") else req.deployment_name
            try:
                provisioner = LangfuseProvisioningService(
                    langfuse_host=langfuse_host,
                    langfuse_secret_name=langfuse_secret,
                    region=req.aws_region or settings.AWS_REGION,
                )
                project_info = provisioner.provision_project(use_case_name)
                req.parameters["ENABLE_TRACING"] = "true"
                req.parameters["LANGFUSE_HOST"] = langfuse_host
                req.parameters["LANGFUSE_SECRET_NAME"] = project_info["secret_name"]
                logger.info(f"Provisioned Langfuse project for {use_case_name}: {project_info['project_name']}")
            except Exception as e:
                logger.warning(f"Langfuse project provisioning failed: {e}. Using shared project.")
                req.parameters["ENABLE_TRACING"] = "true"
                req.parameters["LANGFUSE_HOST"] = langfuse_host
                req.parameters["LANGFUSE_SECRET_NAME"] = langfuse_secret

    svc = get_deploy_svc()
    deployment = svc.create_deployment(req)

    # Set cross-account fields from request
    if req.target_account_id:
        deployment.target_account_id = req.target_account_id
    if req.target_role_arn:
        deployment.target_role_arn = req.target_role_arn

    # Package template to S3
    try:
        s3_svc = get_s3_svc()
        pattern = template.get_deployment_pattern(req.iac_type)
        s3_key = s3_svc.deliver_template(
            template_path=template.path,
            template_id=req.template_id,
            deployment_id=deployment.deployment_id,
            iac_path=pattern.get("path") if pattern else "iac/terraform",
            parameters=req.parameters,
            s3_bucket=deployment.s3_bucket,
        )
        deployment = svc.update_status(deployment.deployment_id, DeploymentStatus.PACKAGED, "Template packaged")
        deployment = svc.update_status(deployment.deployment_id, DeploymentStatus.DELIVERED, "Delivered to S3", s3_key=s3_key)
    except Exception as e:
        logger.error(f"Delivery failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Delivery failed: {e}")

    # Start the deployment pipeline (Step Functions)
    try:
        pipeline_svc = get_pipeline_svc()
        execution_arn = pipeline_svc.start_pipeline(deployment, template)
        deployment.execution_arn = execution_arn
        svc.table.put_item(Item=svc._to_item(deployment))
    except Exception as e:
        logger.error(f"Pipeline start failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Pipeline start failed: {e}")

    # Create an Approval Queue row for the deploy (audit trail).
    # * If policy said auto_approve → row starts APPROVED (no human
    #   blocking). The Queue's Approved tab gains an entry.
    # * If policy said require_approval → row starts pending (v2:
    #   deploy would block until an operator flips it; today we still
    #   let CodeBuild run because gating the pipeline mid-flight
    #   requires the Step Functions to consult the queue, which is a
    #   larger refactor). Flag: v2 gap.
    if _deploy_verdict is not None:
        try:
            from services import agent_registry_client as _reg
            _initial = "approved" if _deploy_verdict.mode == "auto_approve" else "pending"
            _reg.enqueue_approval(
                # We don't have a registry record for the deploy — pass a
                # synthetic dict so the queue row still carries useful
                # display info. The registry_record_id stays empty; the
                # queue's registry-status-flip hook will noop on it.
                record={
                    "recordId":    "",
                    "recordArn":   "",
                    "displayName": req.deployment_name,
                    "name":        req.template_id,
                },
                kind="application",
                requested_by=x_user_email or "unknown",
                justification=(
                    f"Deploy '{req.template_id}' → deployment_id={deployment.deployment_id}"
                ),
                verdict=_deploy_verdict,
                initial_status=_initial,
                action="deploy",
            )
        except Exception as e:
            logger.warning(f"Approval queue row for deploy {deployment.deployment_id} failed: {e}")

    return DeploymentResponse(**deployment.dict())



@router.get("", response_model=List[DeploymentResponse])
async def list_deployments(
    _=RBACDepends(require_role(Role.VIEWER)),
    status: Optional[str] = Query(None),
    template_id: Optional[str] = Query(None),
):
    svc = get_deploy_svc()
    deployments = svc.list_deployments(status=status, template_id=template_id)
    return [DeploymentResponse(**d.dict()) for d in deployments]


@router.get("/templates/{template_id}/dependencies")
async def get_template_dependencies(template_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    catalog = get_catalog()
    template = catalog.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not template.metadata.dependencies:
        return []

    svc = get_deploy_svc()
    result = []
    for dep_id in template.metadata.dependencies:
        dep_template = catalog.get_template(dep_id)
        deployments = svc.list_deployments(template_id=dep_id)
        active = [d for d in deployments if d.status in (
            "delivered", "deployed",
            DeploymentStatus.DELIVERED.value, DeploymentStatus.DEPLOYED.value,
        )]
        outputs = {}
        if active:
            latest = sorted(active, key=lambda d: d.created_at, reverse=True)[0]
            outputs = latest.outputs or {}
        result.append({
            "template_id": dep_id,
            "name": dep_template.metadata.name if dep_template else dep_id,
            "has_active_deployment": len(active) > 0,
            "outputs": outputs,
        })
    return result



@router.get("/{deployment_id}/status")
async def get_deployment_status(deployment_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    """Return current deployment status, history, outputs, and error info.

    Reads directly from DynamoDB for <500ms response time.
    """
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    return {
        "deployment_id": deployment.deployment_id,
        "status": deployment.status if isinstance(deployment.status, str) else deployment.status.value,
        "status_history": [entry.dict() for entry in deployment.status_history],
        "outputs": deployment.outputs,
        "failed_stage": deployment.failed_stage,
        "error_message": deployment.error_message,
        "build_id": deployment.build_id,
    }


@router.get("/{deployment_id}/logs")
async def get_deployment_logs(deployment_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    """Retrieve CodeBuild execution logs for a deployment.

    Returns 404 if no build_id is associated with the deployment.
    """
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    if not deployment.build_id:
        raise HTTPException(status_code=404, detail="No build logs available for this deployment")

    try:
        pipeline_svc = get_pipeline_svc()
        logs = pipeline_svc.get_build_logs(deployment.build_id)
        return {"deployment_id": deployment_id, "build_id": deployment.build_id, "logs": logs}
    except Exception as e:
        logger.error(f"Failed to retrieve logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve logs: {e}")


@router.get("/{deployment_id}/runtime-logs")
async def get_runtime_logs(deployment_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    """Tail AgentCore runtime APPLICATION_LOGS for a deployment.

    Requires the deployment to have been provisioned with
    enable_agentcore_observability=true (which sets agentcore_log_group_name in
    its outputs). Returns 404 if observability isn't enabled on the deployment.
    """
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    outputs = deployment.outputs or {}
    log_group = outputs.get("agentcore_log_group_name", "").strip()
    if not log_group:
        raise HTTPException(
            status_code=404,
            detail="AgentCore observability is not enabled for this deployment.",
        )

    try:
        pipeline_svc = get_pipeline_svc()
        logs = pipeline_svc.get_runtime_logs(log_group)
        return {
            "deployment_id": deployment_id,
            "log_group": log_group,
            "fleet_dashboard_url": outputs.get("fleet_dashboard_url", ""),
            "observability_console_url": outputs.get("agentcore_observability_console_url", ""),
            "logs": logs,
        }
    except Exception as e:
        logger.error(f"Failed to retrieve runtime logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve runtime logs: {e}")


@router.post("/{deployment_id}/destroy", status_code=200)
async def destroy_deployment(deployment_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Initiate the offboarding/destroy pipeline for a DEPLOYED deployment.

    Returns 409 Conflict if the deployment is not in DEPLOYED status.
    """
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    current_status = DeploymentStatus(deployment.status)
    if current_status not in (DeploymentStatus.DEPLOYED, DeploymentStatus.FAILED):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot destroy deployment in '{current_status.value}' status. Only DEPLOYED or FAILED deployments can be destroyed.",
        )

    # Foundry use cases use a synthetic template_id (foundry-<use_case>) that
    # doesn't resolve via the standard template catalog. Their deploys also
    # build the SFN input by hand (see applications.py). Match that here so
    # the UI Destroy button works for all 34 Foundry use cases — without this
    # branch, destroy silently fails at catalog.get_template() below.
    is_foundry = deployment.template_id and deployment.template_id.startswith("foundry-")

    if is_foundry:
        try:
            import json
            pipeline_svc = get_pipeline_svc()
            use_case_name = deployment.template_id.replace("foundry-", "")
            from services.pipeline_inputs import FoundryPipelineInput
            sf_input = {
                "deployment_id": deployment.deployment_id,
                "template_id": deployment.template_id,
                "deployment_name": deployment.deployment_name,
                "iac_type": deployment.iac_type or "terraform",
                "framework_id": deployment.framework_id,
                "aws_region": deployment.aws_region,
                "s3_bucket": deployment.s3_bucket,
                "s3_key": deployment.s3_key,
                "parameters": FoundryPipelineInput.from_dict(deployment.parameters or {}).to_sfn_parameters(),
                "target_account_id": None,
                "target_role_arn": None,
                "action": "destroy",
                "job": {
                    "name": "offboarding",
                    "incoming_event": f"{use_case_name}_offboarding_request",
                    "outgoing_event": f"{use_case_name}_offboarding_success",
                },
            }
            import time
            execution_name = f"destroy-{deployment.deployment_id}-{int(time.time())}"
            response = pipeline_svc.sfn_client.start_execution(
                stateMachineArn=pipeline_svc.state_machine_arn,
                name=execution_name,
                input=json.dumps(sf_input),
            )
            deployment = svc.update_status(deployment.deployment_id, DeploymentStatus.DESTROYING, "Destroy pipeline started")
            deployment.execution_arn = response["executionArn"]
            svc.table.put_item(Item=svc._to_item(deployment))
        except Exception as e:
            logger.error(f"Foundry destroy pipeline start failed: {e}")
            svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
            raise HTTPException(status_code=500, detail=f"Destroy pipeline failed: {e}")
    else:
        # Standard template — look up via catalog, repackage, then run the
        # offboarding job via PipelineService.
        catalog = get_catalog()
        template = catalog.get_template(deployment.template_id)
        if not template:
            raise HTTPException(status_code=404, detail=f"Template not found: {deployment.template_id}")

        # Re-package template so destroy.sh is included in the zip
        try:
            s3_svc = get_s3_svc()
            pattern = template.get_deployment_pattern(deployment.iac_type)
            s3_key = s3_svc.deliver_template(
                template_path=template.path,
                template_id=deployment.template_id,
                deployment_id=deployment.deployment_id,
                iac_path=pattern.get("path") if pattern else "iac/terraform",
                parameters=deployment.parameters,
                s3_bucket=deployment.s3_bucket,
            )
            deployment.s3_key = s3_key
        except Exception as e:
            logger.error(f"Destroy repackaging failed: {e}")

        try:
            pipeline_svc = get_pipeline_svc()
            execution_arn = pipeline_svc.start_destroy_pipeline(deployment, template)
            deployment = svc.update_status(deployment.deployment_id, DeploymentStatus.DESTROYING, "Destroy pipeline started")
            deployment.execution_arn = execution_arn
            svc.table.put_item(Item=svc._to_item(deployment))
        except Exception as e:
            logger.error(f"Destroy pipeline start failed: {e}")
            svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
            raise HTTPException(status_code=500, detail=f"Destroy pipeline failed: {e}")

    # Best-effort: revoke the LLM Gateway virtual key + delete its Secrets
    # Manager secret. Only applies to Foundry deployments where Round 2 of
    # the gateway integration provisioned a per-deployment key. Failures
    # here never block destroy — the IaC teardown is what matters.
    if deployment.template_id and deployment.template_id.startswith("foundry-"):
        try:
            from services.llm_gateway_provisioning import LLMGatewayProvisioningService

            use_case_name = deployment.template_id.replace("foundry-", "")
            framework = (deployment.parameters or {}).get("FRAMEWORK") or deployment.framework_id or "strands"
            # Mirror the synthetic id used at deploy time so we hit the
            # same Secrets Manager name.
            synthetic_deployment_id = f"{use_case_name}-{framework}-{deployment.deployment_name}"
            gw_provisioner = LLMGatewayProvisioningService(
                region=deployment.aws_region or settings.AWS_REGION,
                deployments_table_name=settings.DEPLOYMENTS_TABLE_NAME,
            )
            gw_provisioner.revoke_virtual_key(
                use_case_name=use_case_name,
                framework=framework,
                deployment_id=synthetic_deployment_id,
            )
        except Exception as exc:
            logger.warning(f"LLM Gateway revoke failed (non-fatal): {exc}")

    return DeploymentResponse(**deployment.dict())


@router.post("/{deployment_id}/redeploy", status_code=200)
async def redeploy_deployment(deployment_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Re-trigger the deployment pipeline for a DEPLOYED or FAILED deployment."""
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    current_status = DeploymentStatus(deployment.status)
    if current_status not in (DeploymentStatus.DEPLOYED, DeploymentStatus.FAILED):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot redeploy from '{current_status.value}' status. Only DEPLOYED or FAILED deployments can be redeployed.",
        )

    catalog = get_catalog()
    template = catalog.get_template(deployment.template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {deployment.template_id}")

    # Re-package template to S3
    try:
        s3_svc = get_s3_svc()
        pattern = template.get_deployment_pattern(deployment.iac_type)
        s3_key = s3_svc.deliver_template(
            template_path=template.path,
            template_id=deployment.template_id,
            deployment_id=deployment.deployment_id,
            iac_path=pattern.get("path") if pattern else "iac/terraform",
            parameters=deployment.parameters,
            s3_bucket=deployment.s3_bucket,
        )
        deployment.s3_key = s3_key
    except Exception as e:
        logger.error(f"Redeploy packaging failed: {e}")
        raise HTTPException(status_code=500, detail=f"Repackaging failed: {e}")

    # Reset status to PENDING then advance through pipeline
    deployment.status = DeploymentStatus.PENDING
    deployment.error_message = None
    deployment.failed_stage = None
    deployment.outputs = {}
    deployment.status_history.append(
        StatusHistoryEntry(
            status=DeploymentStatus.PENDING.value,
            timestamp=datetime.utcnow().isoformat(),
            message="Redeployment initiated",
        )
    )
    svc.table.put_item(Item=svc._to_item(deployment))

    try:
        pipeline_svc = get_pipeline_svc()
        execution_arn = pipeline_svc.start_pipeline(deployment, template)
        deployment.execution_arn = execution_arn
        svc.table.put_item(Item=svc._to_item(deployment))
    except Exception as e:
        logger.error(f"Redeploy pipeline start failed: {e}")
        raise HTTPException(status_code=500, detail=f"Redeploy pipeline failed: {e}")

    return DeploymentResponse(**deployment.dict())


class TestDeploymentRequest(BaseModel):
    payload: Dict[str, Any]


def _cleanup_stale_results() -> None:
    """Remove test results older than TTL to prevent memory leaks."""
    now = time.time()
    with _test_results_lock:
        stale_keys = [
            k for k, v in _test_results.items()
            if now - v.get("started_at_epoch", now) > _TEST_RESULT_TTL_SECONDS
        ]
        for k in stale_keys:
            del _test_results[k]


def _run_agentcore_test(test_id: str, runtime_arn: str, region: str, payload: dict, deployment_id: str) -> None:
    """Background worker that invokes AgentCore and stores the result."""
    start_time = time.time()
    try:
        # Configure extended timeout for long-running orchestrator operations (e.g., legacy_migration with "full" scope)
        agentcore_config = Config(
            read_timeout=600,  # 10 minutes - allows multi-agent parallel orchestrators to complete
            connect_timeout=10
        )
        agentcore_client = boto3.client("bedrock-agentcore", region_name=region, config=agentcore_config)
        payload_bytes = json.dumps(payload).encode("utf-8")

        response = agentcore_client.invoke_agent_runtime(
            agentRuntimeArn=runtime_arn,
            payload=payload_bytes,
        )

        result_text = ""
        for key in ("response", "body", "output"):
            if key in response:
                val = response[key]
                if hasattr(val, "read"):
                    result_text = val.read().decode("utf-8")
                    break
                elif isinstance(val, bytes):
                    result_text = val.decode("utf-8")
                    break
                elif isinstance(val, str):
                    result_text = val
                    break
                else:
                    result_text = json.dumps(val, default=str)
                    break

        if not result_text:
            resp_copy = {k: v for k, v in response.items() if k != "ResponseMetadata"}
            result_text = json.dumps(resp_copy, default=str)

        duration_ms = int((time.time() - start_time) * 1000)

        with _test_results_lock:
            _test_results[test_id].update({
                "status": "completed",
                "success": True,
                "response": result_text or "No response content",
                "duration_ms": duration_ms,
            })

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        logger.error(f"AgentCore invocation failed for {deployment_id}: {error_msg}")

        with _test_results_lock:
            _test_results[test_id].update({
                "status": "completed",
                "success": False,
                "error": error_msg,
                "duration_ms": duration_ms,
            })


@router.post("/{deployment_id}/test", status_code=202)
async def test_deployment(deployment_id: str, req: TestDeploymentRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    """Start an async AgentCore runtime invocation and return a test_id for polling."""
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    current_status = deployment.status if isinstance(deployment.status, str) else deployment.status.value
    if current_status != "deployed":
        raise HTTPException(status_code=409, detail=f"Deployment is in '{current_status}' status. Only deployed runtimes can be tested.")

    outputs = deployment.outputs or {}
    runtime_arn = outputs.get("agentcore_runtime_arn") or outputs.get("runtime_arn")
    if not runtime_arn:
        raise HTTPException(status_code=400, detail="No runtime ARN found in deployment outputs. The deployment may not use AgentCore.")

    region = deployment.aws_region or settings.AWS_REGION

    _cleanup_stale_results()

    test_id = str(uuid.uuid4())
    with _test_results_lock:
        _test_results[test_id] = {
            "test_id": test_id,
            "status": "running",
            "started_at_epoch": time.time(),
        }

    _executor.submit(_run_agentcore_test, test_id, runtime_arn, region, req.payload, deployment_id)

    return {"test_id": test_id, "status": "running"}


@router.get("/{deployment_id}/test/{test_id}", status_code=200)
async def get_test_result(deployment_id: str, test_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    """Poll for the result of an async test invocation."""
    _cleanup_stale_results()

    with _test_results_lock:
        result = _test_results.get(test_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Test result not found. It may have expired.")

    return result


@router.post("/{deployment_id}/upload-test-data", status_code=200)
async def upload_test_data(deployment_id: str, file: UploadFile = FastAPIFile(...), _=RBACDepends(require_role(Role.OPERATOR))):
    """Upload a test data file to the deployment's S3 data bucket."""
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    outputs = deployment.outputs or {}
    bucket = outputs.get("s3_data_bucket") or outputs.get("s3_bucket") or deployment.s3_bucket
    if not bucket:
        raise HTTPException(status_code=400, detail="No S3 bucket found for this deployment.")

    s3_key = f"test-data/{deployment_id}/{file.filename}"

    try:
        s3_client = boto3.client("s3", region_name=deployment.aws_region or settings.AWS_REGION)
        contents = await file.read()
        s3_client.put_object(Bucket=bucket, Key=s3_key, Body=contents)
        logger.info(f"Uploaded test data to s3://{bucket}/{s3_key}")
        return {"s3_key": s3_key}
    except Exception as e:
        logger.error(f"Test data upload failed for {deployment_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


class RunScriptRequest(BaseModel):
    script_type: str = "agentcore"


def _run_test_script_bg(test_id: str, script_path: str, env: dict, cwd: str, deployment_id: str) -> None:
    """Background worker that runs a test script, streaming output incrementally."""
    start_time = time.time()
    accumulated_output = []
    try:
        proc = subprocess.Popen(
            ["bash", script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            cwd=cwd,
            bufsize=1,
        )
        for line in iter(proc.stdout.readline, ''):
            accumulated_output.append(line)
            with _test_results_lock:
                _test_results[test_id]["output"] = ''.join(accumulated_output)
        proc.stdout.close()
        proc.wait(timeout=300)
        duration_ms = int((time.time() - start_time) * 1000)
        with _test_results_lock:
            _test_results[test_id].update({
                "status": "completed",
                "success": proc.returncode == 0,
                "output": ''.join(accumulated_output),
                "exit_code": proc.returncode,
                "duration_ms": duration_ms,
            })
    except subprocess.TimeoutExpired:
        proc.kill()
        duration_ms = int((time.time() - start_time) * 1000)
        with _test_results_lock:
            _test_results[test_id].update({
                "status": "completed",
                "success": False,
                "output": ''.join(accumulated_output) + "\nScript execution timed out after 300 seconds.",
                "exit_code": -1,
                "duration_ms": duration_ms,
            })
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Script execution failed for {deployment_id}: {e}")
        with _test_results_lock:
            _test_results[test_id].update({
                "status": "completed",
                "success": False,
                "output": ''.join(accumulated_output) + f"\n{str(e)}",
                "exit_code": -1,
                "duration_ms": duration_ms,
            })


@router.post("/{deployment_id}/run-script", status_code=202)
async def run_test_script(deployment_id: str, req: RunScriptRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    """Start async test script execution and return a test_id for polling."""
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    use_case_name = deployment.template_id.replace("foundry-", "")
    framework = deployment.framework_id or "langchain_langgraph"
    region = deployment.aws_region or settings.AWS_REGION
    outputs = deployment.outputs or {}
    runtime_arn = outputs.get("agentcore_runtime_arn") or outputs.get("runtime_arn", "")

    from pathlib import Path
    fsi_root = Path(settings.FOUNDRY_USE_CASES_PATH).parent

    script_name = f"test_{req.script_type}.sh"
    script_path = fsi_root / "scripts" / "use_cases" / use_case_name / "test" / script_name

    if not script_path.exists():
        raise HTTPException(status_code=404, detail=f"Test script not found: {script_path}")

    env = os.environ.copy()
    env["USE_CASE_ID"] = use_case_name
    env["FRAMEWORK"] = framework
    env["AWS_REGION"] = region
    env["RUNTIME_ARN"] = runtime_arn
    env["PROJECT_ROOT"] = str(fsi_root.parent)

    _cleanup_stale_results()
    test_id = str(uuid.uuid4())
    with _test_results_lock:
        _test_results[test_id] = {
            "test_id": test_id,
            "status": "running",
            "started_at_epoch": time.time(),
        }

    _executor.submit(_run_test_script_bg, test_id, str(script_path), env, str(fsi_root), deployment_id)

    return {"test_id": test_id, "status": "running"}


@router.get("/{deployment_id}/sample-data", status_code=200)
async def get_sample_data(deployment_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    """Return sample test data for the deployment's use case."""
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    use_case_name = deployment.template_id.replace("foundry-", "")

    from pathlib import Path
    fsi_root = Path(settings.FOUNDRY_USE_CASES_PATH).parent
    samples_dir = fsi_root / "data" / "samples" / use_case_name

    if not samples_dir.exists():
        raise HTTPException(status_code=404, detail=f"No sample data found for use case: {use_case_name}")

    json_files = sorted(globmod.glob(str(samples_dir / "**" / "*.json"), recursive=True))
    if not json_files:
        raise HTTPException(status_code=404, detail=f"No sample JSON files found for use case: {use_case_name}")

    try:
        with open(json_files[0], "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        logger.error(f"Failed to read sample data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read sample data: {e}")


@router.post("/{deployment_id}/provision-gateway", status_code=200)
async def provision_gateway(deployment_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Provision a dedicated gateway for a deployed use case and attach to its runtime."""
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    # Allow both "deployed" and "deploying" — CodeBuild post_build calls this while
    # status is still DEPLOYING (Step Function sets DEPLOYED after build completes)
    if deployment.status not in ("deployed", "deploying"):
        return {"status": "skipped", "reason": f"Not deployed (status={deployment.status})"}

    svc._provision_gateway(deployment)

    # Re-read to get updated outputs
    deployment = svc.get_deployment(deployment_id)
    outputs = deployment.outputs or {}
    return {
        "status": "ok",
        "gateway_id": outputs.get("gateway_id"),
        "gateway_url": outputs.get("gateway_url"),
        "gateway_name": outputs.get("gateway_name"),
    }


@router.get("/{deployment_id}", response_model=DeploymentResponse)
async def get_deployment(deployment_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return DeploymentResponse(**deployment.dict())


@router.get("/{deployment_id}/source-zip")
async def get_deployment_source_zip(
    deployment_id: str,
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Return a presigned URL to download the generated source zip.

    Only available for app-factory deployments that completed successfully.
    """
    svc = get_deploy_svc()
    deployment = svc.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    if not (deployment.template_id or "").startswith("app-factory-"):
        raise HTTPException(
            status_code=404,
            detail="Source download is only available for App Factory deployments",
        )

    outputs = deployment.outputs or {}
    bucket = outputs.get("source_zip_bucket") or deployment.s3_bucket
    key = outputs.get("source_zip_key")
    if not key:
        raise HTTPException(
            status_code=404,
            detail="Generated source zip not found for this deployment",
        )

    try:
        s3 = boto3.client("s3", region_name=settings.AWS_REGION)
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=900,
        )
    except Exception as e:
        logger.error(f"Failed to presign source zip for {deployment_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate download URL")

    return {"download_url": url, "s3_bucket": bucket, "s3_key": key}
