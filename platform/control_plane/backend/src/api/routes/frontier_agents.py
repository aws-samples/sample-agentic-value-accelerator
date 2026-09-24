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
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from fastapi import APIRouter, HTTPException, Depends as RBACDepends
from pydantic import BaseModel, Field

from core import safe_fetch
from core.config import settings
from core.rbac import Role, require_role
from core.safe_fetch import SafeFetchError, is_allowlistable_refusal
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
            # The path goes to the log, not into the response. A 500 that prints
            # where the image keeps its files is free reconnaissance for a caller
            # and tells the operator nothing the log does not already say.
            logger.error("Frontier Agents registry not found at %s", path)
            raise HTTPException(
                status_code=500,
                detail=(
                    "Frontier Agents registry is missing from this deployment. "
                    "Check FRONTIER_AGENTS_REGISTRY_PATH and the backend logs."
                ),
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


def _fail_deployment(deploy_svc: DeploymentService, deployment_id: str, summary: str) -> str:
    """Mark a deployment failed with a category and a correlation id, never the exception.

    Must be called from inside an `except` block: the traceback is what carries the
    detail an operator needs, and it goes to the log under `error_ref`.

    `error_message` is not a private field. `GET /deployments/{id}/status` returns it
    verbatim (deployments.py, the `"error_message"` key of that route's body, reachable
    by a VIEWER), so storing `str(e)` there is the same disclosure as returning it, one
    GET later. And `str(e)` is the disclosing part: botocore 1.43.10's
    ClientError.MSG_TEMPLATE is "An error occurred ({error_code}) when calling the
    {operation_name} operation{retry_info}: {error_message}" with `error_message`
    copied verbatim out of the service response - read at
    site-packages/botocore/exceptions.py, class ClientError - which for an
    AccessDenied on PutObject or StartExecution is AWS's own "User: <caller arn> is not
    authorized to perform: ... on resource: <target arn>", i.e. the account id, the
    task role and the bucket or state machine.

    The returned string is what both the record and the 500 body get, so the two agree
    and one place decides what a client may read.
    """
    error_ref = uuid.uuid4().hex[:12]
    logger.exception("%s [error_ref=%s]", summary, error_ref)
    message = (
        f"{summary} (error_ref={error_ref}). The full traceback is in the backend logs "
        "under that error_ref."
    )
    deploy_svc.update_status(
        deployment_id,
        DeploymentStatus.FAILED,
        error_message=message,
    )
    return message


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
        # Same reason as the registry path above: the resolved directory is a
        # deployment detail. agent_id and iac_type are safe to name back - both
        # were just validated against the registry - and they are the part that
        # tells the caller which combination is unavailable.
        logger.error("IaC directory not found on disk: %s", iac_dir)
        raise HTTPException(
            status_code=500,
            detail=(
                f"No {req.iac_type} IaC is packaged in this deployment for "
                f"{req.agent_id}. See the backend logs for the path that was tried."
            ),
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
                # %r, not an f-string: both values come straight out of the Cloud
                # Control response, and a CR/LF in either would let the record be
                # split into a second, forged log line. repr() escapes them.
                logger.info(
                    "Reusing existing Security Agent Application %r (domain=%r)",
                    existing_id,
                    parameters["existing_application_domain"],
                )
            else:
                # Bootstrap — first deploy in this account.
                parameters["create_application"] = "true"
                parameters["existing_application_domain"] = ""
                logger.info("No existing Security Agent Application; bootstrapping a new one")
        except Exception as e:
            logger.warning(
                "Could not auto-detect Security Agent Application; deferring to "
                "user-supplied parameters: %r",
                e,
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
        logger.info("Packaged %s to s3://%s/%s", iac_dir, deployment.s3_bucket, s3_key)
    except Exception:
        # The botocore text names the bucket and, on AccessDenied, the account id and
        # the calling role. It goes to the log with its traceback and reaches neither
        # the response body nor the deployment record - see _fail_deployment for why
        # the record is not a safe place to park it either.
        raise HTTPException(
            status_code=500,
            detail=_fail_deployment(
                deploy_svc, deployment.deployment_id, "Packaging the agent's IaC failed"
            ),
        )

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
    except Exception:
        # A StepFunctions error quotes the state machine ARN, which carries the
        # account id. Same treatment as the packaging arm above.
        raise HTTPException(
            status_code=500,
            detail=_fail_deployment(
                deploy_svc, deployment.deployment_id, "Starting the deployment pipeline failed"
            ),
        )

    return DeploymentResponse(**deployment.dict())


# ─── Operator app federation ────────────────────────────────────────────────

def _refusal_detail(prefix: str, reason: str) -> str:
    """A refusal an operator can act on that names no target and no address.

    safe_fetch's `reason` is a closed set of literals and safe to return; its
    `detail` names the host and the address it resolved to and is for logs only.
    But "blocked_private_address" on its own reads as a bug rather than as a
    setting, so the one reason class an operator can actually fix says which lever
    fixes it.
    """
    # safe_fetch owns which refusals its own setting can permit - see
    # is_allowlistable_refusal. This was a local frozenset naming the three; so was the
    # copy in core/security.py. Both were right, and neither would have noticed
    # safe_fetch adding a fourth.
    if is_allowlistable_refusal(reason):
        return (
            f"{prefix}: {reason}. If that host is meant to resolve to an internal "
            "address, add its CIDR to SAFE_FETCH_ALLOWED_PRIVATE_CIDRS."
        )
    return f"{prefix}: {reason}"


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
        # The same echo the getSigninToken arm below already dropped. botocore's
        # AccessDenied text is "User: arn:aws:sts::<account>:assumed-role/<task-role>/...
        # is not authorized to perform: sts:AssumeRole on resource: <federation role>",
        # so returning it hands an ADMIN caller (and anything that logs a 500 body,
        # including the browser network tab) the account id and both role names.
        logger.error("AssumeRole on %s failed: %r", federation_role_arn, e)
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not assume the federation role. Check that the task role may call "
                "sts:AssumeRole on FRONTIER_AGENTS_FEDERATION_ROLE_ARN; see the backend logs."
            ),
        )

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
        # max_redirects=0 because the Session query parameter IS the temporary
        # credential: any 302 here is a request to replay it somewhere else, and
        # dropping Authorization would not help when the secret is in the URL.
        # safe_fetch also refuses a signin.aws.amazon.com that has been made to
        # resolve to a link-local or private address.
        token_payload = safe_fetch.fetch_json(token_url, timeout=10, max_redirects=0)
        signin_token = token_payload["SigninToken"]
    except SafeFetchError as e:
        # exc.detail names the resolved address and token_url carries live session
        # credentials, so only the stable reason may cross into the response. %r on
        # the detail: it can carry an upstream-supplied string, and a CR/LF in one
        # forges a second log line.
        logger.error("getSigninToken refused: %s (%r)", e.reason, e.detail)
        raise HTTPException(
            status_code=500,
            detail=_refusal_detail("Could not obtain SigninToken", e.reason),
        )
    except Exception as e:
        logger.error("getSigninToken failed: %r", e)
        raise HTTPException(status_code=500, detail="Could not obtain SigninToken")

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
