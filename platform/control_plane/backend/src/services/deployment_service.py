"""Deployment service for managing deployments in DynamoDB"""

import boto3
import logging
import json
from typing import Dict, List, Optional
from datetime import datetime

from models.deployment import (
    Deployment, DeploymentCreate, DeploymentStatus, StatusHistoryEntry, VALID_TRANSITIONS
)

logger = logging.getLogger(__name__)


def _generate_bucket_name(template_id: str) -> str:
    """Generate a unique S3 bucket name: fsi-<template>-<timestamp>. Max 63 chars."""
    from datetime import datetime
    ts = datetime.utcnow().strftime("%m%d%H%M%S")
    safe_id = template_id.replace("_", "-").replace(":", "-").lower()
    prefix = f"fsi-{safe_id[:30]}-{ts}"
    return prefix[:63].rstrip("-")


def _get_current_account() -> str:
    sts = boto3.client("sts")
    return sts.get_caller_identity()["Account"]


class DeploymentService:
    def __init__(self, table_name: str = "fsi-control-plane-deployments", region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self.dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self.dynamodb.Table(table_name)

    def _to_item(self, deployment: Deployment) -> dict:
        return {
            "pk": f"DEPLOY#{deployment.deployment_id}",
            "sk": "META",
            **deployment.dict(),
            "status_history": [e.dict() for e in deployment.status_history],
        }

    def _from_item(self, item: dict) -> Deployment:
        item.pop("pk", None)
        item.pop("sk", None)
        return Deployment(**item)

    def create_deployment(self, req: DeploymentCreate, created_by: str = "system") -> Deployment:
        bucket_name = _generate_bucket_name(req.template_id)
        account_id = _get_current_account()

        # Create the bucket in the same account
        s3 = boto3.client("s3", region_name=self.region)
        create_args = {"Bucket": bucket_name}
        if self.region != "us-east-1":
            create_args["CreateBucketConfiguration"] = {"LocationConstraint": self.region}
        s3.create_bucket(**create_args)

        deployment = Deployment(
            deployment_name=req.deployment_name,
            template_id=req.template_id,
            iac_type=req.iac_type,
            framework_id=req.framework_id,
            aws_account=account_id,
            aws_region=req.aws_region,
            s3_bucket=bucket_name,
            parameters=req.parameters,
            created_by=created_by,
        )
        now = datetime.utcnow().isoformat()
        deployment.status_history.append(
            StatusHistoryEntry(status=DeploymentStatus.PENDING.value, timestamp=now, message="Deployment created")
        )
        self.table.put_item(Item=self._to_item(deployment))
        logger.info(f"Created deployment {deployment.deployment_id}")
        return deployment

    def get_deployment(self, deployment_id: str) -> Optional[Deployment]:
        resp = self.table.get_item(Key={"pk": f"DEPLOY#{deployment_id}", "sk": "META"})
        item = resp.get("Item")
        return self._from_item(item) if item else None

    def list_deployments(self, status: Optional[str] = None, template_id: Optional[str] = None) -> List[Deployment]:
        # Scan with optional filters (fine for control plane scale)
        filter_parts, attr_values = [], {}
        if status:
            filter_parts.append("status = :status")
            attr_values[":status"] = status
        if template_id:
            filter_parts.append("template_id = :tid")
            attr_values[":tid"] = template_id

        kwargs = {}
        if filter_parts:
            kwargs["FilterExpression"] = " AND ".join(filter_parts)
            kwargs["ExpressionAttributeValues"] = attr_values

        resp = self.table.scan(**kwargs)
        return [self._from_item(item) for item in resp.get("Items", []) if item.get("sk") == "META"]

    def update_status(self, deployment_id: str, new_status: DeploymentStatus,
                      message: Optional[str] = None, s3_key: Optional[str] = None,
                      error_message: Optional[str] = None,
                      outputs: Optional[Dict[str, str]] = None) -> Deployment:
        deployment = self.get_deployment(deployment_id)
        if not deployment:
            raise ValueError(f"Deployment not found: {deployment_id}")
        deployment.transition_to(new_status, message)
        if s3_key:
            deployment.s3_key = s3_key
        if error_message:
            deployment.error_message = error_message
        if outputs is not None and new_status == DeploymentStatus.DEPLOYED:
            deployment.outputs = outputs
        self.table.put_item(Item=self._to_item(deployment))
        logger.info(f"Updated deployment {deployment_id} to {new_status}")

        # Auto-provision a gateway when deployment succeeds
        if new_status == DeploymentStatus.DEPLOYED:
            self._provision_gateway(deployment)

        return deployment

    def _provision_gateway(self, deployment: Deployment):
        """Auto-create a dedicated gateway for the use case and point the runtime at it.

        Architecture:
        - The gateway is an MCP protocol endpoint with Cedar policy enforcement.
        - MCP tool servers (Lambda, etc.) are added as gateway targets.
        - The agent runtime connects TO the gateway (via GATEWAY_URL env var) to access tools.
        - Policies attached to the gateway control what the agent can do.

        This method:
        1. Creates a per-use-case gateway (or reuses existing)
        2. Waits for READY
        3. Updates the runtime's GATEWAY_URL env var to use this dedicated gateway
        """
        import time

        try:
            # Skip if deployment already has a gateway configured
            if deployment.outputs and deployment.outputs.get("gateway_id"):
                logger.info(f"Deployment {deployment.deployment_id} already has gateway")
                return

            # Derive use case name from template_id (e.g. "foundry-customer_service" -> "customer-service")
            use_case_name = deployment.template_id.replace("foundry-", "").replace("_", "-")
            gateway_name = f"{use_case_name}-gateway"

            agentcore = boto3.client("bedrock-agentcore-control", region_name=self.region)

            # Reuse the platform gateway's IAM role for per-use-case gateways.
            # (Previously hardcoded to a specific account's role ARN, which broke
            # in every other account and made per-use-case gateways un-attachable.)
            # Deriving it from the configured platform gateway keeps all gateways
            # on one role — the same role the ECS task is granted iam:PassRole for.
            from core.config import settings as _settings
            gateway_role_arn = None
            platform_gw_arn = _settings.GATEWAY_ARN or ""
            # Primary: read the platform gateway's actual role and reuse it.
            try:
                if platform_gw_arn:
                    platform_gw_id = platform_gw_arn.split("/")[-1]
                    plat = agentcore.get_gateway(gatewayIdentifier=platform_gw_id)
                    gateway_role_arn = plat.get("roleArn")
            except Exception as e:
                logger.warning(f"Could not read platform gateway role, will derive it: {e}")
            # Fallback: derive the PLATFORM gateway role name from the deploy's
            # name_prefix (gateway id looks like "<name_prefix>-gw-<suffix>"), so
            # per-use-case gateways still land on the real, PassRole-granted role.
            if not gateway_role_arn and platform_gw_arn:
                acct = platform_gw_arn.split(":")[4]
                gw_id = platform_gw_arn.split("/")[-1]           # <name_prefix>-gw-<suffix>
                name_prefix = gw_id.rsplit("-gw-", 1)[0]         # <name_prefix>
                gateway_role_arn = f"arn:aws:iam::{acct}:role/{name_prefix}-agentcore-gateway-role"
                logger.warning(f"Derived platform gateway role: {gateway_role_arn}")
            if not gateway_role_arn:
                # GATEWAY_ARN not configured — cannot safely create a gateway.
                # Fail loudly rather than create one with a bad role (which would
                # silently produce an un-attachable gateway).
                raise RuntimeError(
                    "Cannot provision use-case gateway: GATEWAY_ARN is not configured, "
                    "so the platform gateway role cannot be determined."
                )

            # Check if gateway already exists for this use case
            gateway_id = None
            gateway_url = ""
            existing = agentcore.list_gateways()
            for gw in existing.get("items", []):
                if gw.get("name") == gateway_name and gw.get("status") not in ("DELETING", "DELETE_FAILED"):
                    gateway_id = gw["gatewayId"]
                    gateway_url = gw.get("gatewayUrl", "")
                    logger.info(f"Gateway already exists for {use_case_name}: {gateway_id}")
                    break

            # Create gateway if it doesn't exist
            if not gateway_id:
                resp = agentcore.create_gateway(
                    name=gateway_name,
                    description=f"Dedicated gateway for {use_case_name} use case — Cedar policy enforcement",
                    roleArn=gateway_role_arn,
                    protocolType="MCP",
                    authorizerType="NONE",
                )
                gateway_id = resp["gatewayId"]
                gateway_url = resp.get("gatewayUrl", "")
                logger.info(f"Created gateway {gateway_id} for deployment {deployment.deployment_id}")

            # Wait for gateway to be READY
            start = time.time()
            timeout = 60
            while time.time() - start < timeout:
                gw_detail = agentcore.get_gateway(gatewayIdentifier=gateway_id)
                status = gw_detail.get("status", "")
                if status == "READY":
                    # Get the gateway URL from detail if not already set
                    if not gateway_url:
                        gateway_url = gw_detail.get("gatewayUrl", "")
                    break
                if status in ("FAILED", "DELETE_FAILED"):
                    logger.error(f"Gateway {gateway_id} failed: {gw_detail.get('statusReasons', [])}")
                    break
                time.sleep(3)

            # Get gateway URL (format: https://{id}.gateway.bedrock-agentcore.{region}.amazonaws.com/mcp)
            if not gateway_url:
                gateway_url = f"https://{gateway_id}.gateway.bedrock-agentcore.{self.region}.amazonaws.com/mcp"

            # Update the runtime's GATEWAY_URL env var to point to this dedicated gateway
            runtime_id = None
            if deployment.outputs:
                runtime_id = deployment.outputs.get("agentcore_runtime_id")
            if runtime_id:
                try:
                    # Get current runtime config (need all required fields for update)
                    runtime_detail = agentcore.get_agent_runtime(agentRuntimeId=runtime_id)
                    env_vars = runtime_detail.get("environmentVariables", {})
                    old_gateway = env_vars.get("GATEWAY_URL", "")

                    if old_gateway != gateway_url:
                        env_vars["GATEWAY_URL"] = gateway_url
                        agentcore.update_agent_runtime(
                            agentRuntimeId=runtime_id,
                            roleArn=runtime_detail["roleArn"],
                            networkConfiguration=runtime_detail["networkConfiguration"],
                            agentRuntimeArtifact=runtime_detail["agentRuntimeArtifact"],
                            environmentVariables=env_vars,
                        )
                        logger.info(f"Updated runtime {runtime_id} GATEWAY_URL: {old_gateway} -> {gateway_url}")
                    else:
                        logger.info(f"Runtime {runtime_id} already points to {gateway_url}")
                except Exception as re:
                    logger.error(f"Failed to update runtime GATEWAY_URL: {re}")

            # Store gateway info in deployment outputs
            deployment.outputs = deployment.outputs or {}
            deployment.outputs["gateway_id"] = gateway_id
            deployment.outputs["gateway_url"] = gateway_url
            deployment.outputs["gateway_name"] = gateway_name
            self.table.put_item(Item=self._to_item(deployment))

        except Exception as e:
            logger.error(f"Failed to provision gateway for deployment {deployment.deployment_id}: {e}")

    def store_outputs(self, deployment_id: str, outputs: Dict[str, str]) -> Deployment:
        """Store IaC outputs (endpoints, ARNs, resource IDs) in the deployment record."""
        deployment = self.get_deployment(deployment_id)
        if not deployment:
            raise ValueError(f"Deployment not found: {deployment_id}")
        deployment.outputs = outputs
        deployment.updated_at = datetime.utcnow().isoformat()
        self.table.put_item(Item=self._to_item(deployment))
        logger.info(f"Stored {len(outputs)} outputs for deployment {deployment_id}")
        return deployment

    def record_failure_stage(self, deployment_id: str, stage: str,
                             error_message: str) -> Deployment:
        """Record which pipeline stage failed and the error details.

        Transitions the deployment to FAILED status, sets the failed_stage
        and error_message fields, and persists to DynamoDB.
        """
        deployment = self.get_deployment(deployment_id)
        if not deployment:
            raise ValueError(f"Deployment not found: {deployment_id}")
        deployment.transition_to(DeploymentStatus.FAILED, message=f"Failed at {stage}: {error_message}")
        deployment.failed_stage = stage
        deployment.error_message = error_message
        self.table.put_item(Item=self._to_item(deployment))
        logger.info(f"Recorded failure at stage {stage} for deployment {deployment_id}")
        return deployment

    def resolve_dependencies(self, dependencies: list) -> Dict[str, str]:
        """Resolve foundation outputs for dependency template IDs.
        Returns merged outputs dict. Raises if any dependency not delivered."""
        merged = {}
        for dep_template_id in dependencies:
            # Find a delivered/deployed deployment for this template
            deps = self.list_deployments(template_id=dep_template_id)
            active = [d for d in deps if d.status in (
                DeploymentStatus.DELIVERED.value, DeploymentStatus.DELIVERED,
                DeploymentStatus.DEPLOYED.value, DeploymentStatus.DEPLOYED,
            )]
            if not active:
                raise ValueError(f"Required foundation '{dep_template_id}' has no active deployment")
            # Use the most recent one
            latest = sorted(active, key=lambda d: d.created_at, reverse=True)[0]
            # Merge IaC outputs (e.g. langfuse_host, langfuse_secret_name, vpc_id)
            if latest.outputs:
                merged.update(latest.outputs)
        return merged
