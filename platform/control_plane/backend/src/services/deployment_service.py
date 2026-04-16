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
        return deployment

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
