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


class FrontierAgentFederateRequest(BaseModel):
    """Mints a console-federation URL for a frontier agent's operator app.

    The backend assumes FRONTIER_AGENTS_FEDERATION_ROLE_ARN, exchanges the
    temp credentials for a one-time signin token via
    https://signin.aws.amazon.com/federation, and returns a URL that
    auto-signs the user into AWS console at the operator app deeplink.
    Skips the manual AWS-console sign-in step otherwise required to load
    the agent's WebApp domain.
    """
    agent_id: str = Field(..., min_length=1)
    operator_app_url: str = Field(..., min_length=10, description="The operator app URL emitted by the deploy (used as the federation Destination).")


class FrontierAgentFederateResponse(BaseModel):
    signin_url: str          # Open this first; drops the federation cookie.
    operator_app_url: str    # Open this second; works in the same browser session.
    expires_in_seconds: int


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

    # Auto-inject Security Agent Application detection. AWS::SecurityAgent::Application
    # is a singleton per AWS account, so we have to know whether one already exists
    # before zipping the IaC. Query Cloud Control once; if an Application exists,
    # we set create_application=false + existing_application_domain so the IaC reuses
    # it. If none, we set create_application=true so the IaC bootstraps it.
    parameters = dict(req.parameters)
    if req.agent_id == "aws-security":
        try:
            cc_client = boto3.client("cloudcontrol", region_name=req.aws_region)
            resp = cc_client.list_resources(TypeName="AWS::SecurityAgent::Application")
            descriptions = resp.get("ResourceDescriptions", [])
            if descriptions:
                # Reuse — fetch the existing Application's domain.
                existing_id = descriptions[0]["Identifier"]
                detail = cc_client.get_resource(
                    TypeName="AWS::SecurityAgent::Application",
                    Identifier=existing_id,
                )
                props = json.loads(detail["ResourceDescription"]["Properties"])
                parameters["create_application"] = "false"
                parameters["existing_application_domain"] = props.get("Domain", "")
                logger.info(
                    f"Reusing existing Security Agent Application {existing_id} "
                    f"(domain={parameters['existing_application_domain']})"
                )
            else:
                # Bootstrap — first deploy in this account.
                parameters["create_application"] = "true"
                parameters["existing_application_domain"] = ""
                logger.info("No existing Security Agent Application; bootstrapping a new one")
        except Exception as e:
            logger.warning(
                f"Could not auto-detect Security Agent Application; deferring to user-supplied "
                f"parameters: {e}"
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
        parameters=parameters,
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
            "parameters": parameters,
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


# ─── Operator app federation ────────────────────────────────────────────────

@router.post("/federate", response_model=FrontierAgentFederateResponse)
async def federate_operator_app(
    req: FrontierAgentFederateRequest,
    _=RBACDepends(require_role(Role.ADMIN)),
):
    """Returns a pre-signed AWS console URL that auto-signs the user into the
    operator app for the given frontier agent.

    Flow:
      1. Assume FRONTIER_AGENTS_FEDERATION_ROLE_ARN (12-hour session).
      2. Exchange the temp credentials for a one-time SigninToken via
         https://signin.aws.amazon.com/federation?Action=getSigninToken
      3. Construct the federation URL with Action=login + the SigninToken
         + Destination = the operator app URL.

    The browser opens the URL, the AWS console drops its auth cookie on
    *.app.aws via a redirect, then routes to the operator app destination.
    """
    import urllib.parse
    import urllib.request

    federation_role_arn = os.getenv("FRONTIER_AGENTS_FEDERATION_ROLE_ARN", "")
    if not federation_role_arn:
        raise HTTPException(
            status_code=503,
            detail=(
                "Operator app federation is not configured. "
                "FRONTIER_AGENTS_FEDERATION_ROLE_ARN env var is empty — apply "
                "the latest Terraform to provision the federation role."
            ),
        )

    # Step 1: assume the federation role.
    try:
        sts_client = boto3.client("sts")
        # AWS hard caps role-chaining (role-A -> role-B) at 3600s regardless
        # of the target role's MaxSessionDuration. ECS task role -> federation
        # role is a chain, so we can never exceed 1 hour here.
        ar = sts_client.assume_role(
            RoleArn=federation_role_arn,
            RoleSessionName="ava-operator-app-federation",
            DurationSeconds=3600,
        )
    except Exception as e:
        logger.error(f"AssumeRole on {federation_role_arn} failed: {e}")
        raise HTTPException(status_code=500, detail=f"Could not assume federation role: {e}")

    creds = ar["Credentials"]
    session_payload = {
        "sessionId":    creds["AccessKeyId"],
        "sessionKey":   creds["SecretAccessKey"],
        "sessionToken": creds["SessionToken"],
    }

    # Step 2: trade temp creds for a SigninToken.
    try:
        # AWS docs: do NOT pass SessionDuration when credentials came from
        # role chaining (which is our case: ECS task role -> federation role).
        # Including it causes the federation endpoint to return HTTP 400.
        # The console session inherits the credentials' 1h lifetime instead.
        token_url = (
            "https://signin.aws.amazon.com/federation?"
            + "Action=getSigninToken&"
            + "Session=" + urllib.parse.quote_plus(json.dumps(session_payload))
        )
        with urllib.request.urlopen(token_url, timeout=10) as resp:
            signin_token = json.loads(resp.read())["SigninToken"]
    except Exception as e:
        logger.error(f"getSigninToken failed: {e}")
        raise HTTPException(status_code=500, detail=f"Could not obtain SigninToken: {e}")

    # Step 3: build the federation URL with the operator app as the destination.
    # AWS's federation endpoint only accepts AWS Management Console URLs as
    # Destination; non-console domains return HTTP 400. To still authenticate
    # the user without the manual sign-in step, we federate to the most
    # relevant AWS console URL for the agent so the federation cookie drops
    # AND the user lands somewhere useful even if the cross-domain handshake
    # to the bare app URL fails.
    #
    # Per-agent destinations:
    #   - aws-devops: console home (federation cookie alone is enough; the
    #     *.aidevops.global.app.aws domain accepts it)
    #   - aws-security: the agent-space deeplink in the Security Agent
    #     console. The bare *.securityagent.global.app.aws domain rejects
    #     a plain federation cookie; users must enter via the console which
    #     then issues a service-scoped token.
    region = os.getenv("AWS_REGION", "us-east-1")
    if req.agent_id == "aws-security":
        # The operator URL has the form
        #   https://<application_domain>/<agent_space_id>
        # extract the agent_space_id (everything after the last slash) and
        # build the Security Agent console deeplink.
        agent_space_id = req.operator_app_url.rstrip("/").rsplit("/", 1)[-1]
        console_destination = (
            f"https://{region}.console.aws.amazon.com/securityagent/home"
            f"?region={region}#/agent-spaces/{agent_space_id}"
        )
    else:
        console_destination = f"https://{region}.console.aws.amazon.com/console/home"
    signin_url = (
        "https://signin.aws.amazon.com/federation?"
        + "Action=login&"
        + "Issuer=" + urllib.parse.quote_plus("ava-control-plane")
        + "&Destination=" + urllib.parse.quote_plus(console_destination)
        + "&SigninToken=" + urllib.parse.quote_plus(signin_token)
    )

    # For Security Agent, the federation tab IS the agent-space view via
    # the console deeplink — opening the bare *.securityagent.global.app.aws
    # URL in a second tab fails because that domain rejects the plain
    # federation cookie (it requires a service-scoped token issued by the
    # console). Return empty operator_app_url so the frontend doesn't open
    # a second tab. For DevOps the bare app URL works fine alongside the
    # federation cookie, so return it.
    second_tab_url = "" if req.agent_id == "aws-security" else req.operator_app_url

    return FrontierAgentFederateResponse(
        signin_url=signin_url,
        operator_app_url=second_tab_url,
        expires_in_seconds=3600,
    )
