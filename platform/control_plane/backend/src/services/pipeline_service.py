"""Pipeline service for Step Functions orchestration and CodeBuild interaction"""

import boto3
import json
import logging
import time
from typing import Dict, List, Any, Optional

from models.deployment import Deployment
from models.template import Template

logger = logging.getLogger(__name__)


class PipelineService:
    """Manages Step Functions pipeline executions for deployment lifecycle"""

    def __init__(self, state_machine_arn: str, region: str = "us-east-1"):
        self.sfn_client = boto3.client("stepfunctions", region_name=region)
        self.logs_client = boto3.client("logs", region_name=region)
        self.state_machine_arn = state_machine_arn
        self.region = region

    def start_pipeline(self, deployment: Deployment, template: Template) -> str:
        """Start a Step Functions execution for a deployment.

        Extracts the onboarding job from the template metadata and builds
        the Step Functions input with deployment params and job info.

        Returns the execution ARN.
        """
        onboarding_job = self._extract_job(template, "onboarding")
        if not onboarding_job:
            raise ValueError(
                f"Template '{template.metadata.id}' has no onboarding job defined"
            )

        sf_input = self._build_execution_input(deployment, onboarding_job)
        ts = int(time.time())
        execution_name = f"deploy-{deployment.deployment_id}-{ts}"

        response = self.sfn_client.start_execution(
            stateMachineArn=self.state_machine_arn,
            name=execution_name,
            input=json.dumps(sf_input),
        )

        execution_arn = response["executionArn"]
        logger.info(
            f"Started pipeline execution {execution_arn} for "
            f"deployment {deployment.deployment_id}"
        )
        return execution_arn

    def get_execution_status(self, execution_arn: str) -> dict:
        """Get current execution status and history."""
        describe = self.sfn_client.describe_execution(
            executionArn=execution_arn
        )

        history_response = self.sfn_client.get_execution_history(
            executionArn=execution_arn,
            maxResults=100,
            reverseOrder=False,
        )

        events = []
        for event in history_response.get("events", []):
            events.append({
                "timestamp": event["timestamp"].isoformat()
                if hasattr(event["timestamp"], "isoformat")
                else str(event["timestamp"]),
                "type": event["type"],
                "id": event["id"],
            })

        return {
            "status": describe["status"],
            "startDate": describe["startDate"].isoformat()
            if hasattr(describe["startDate"], "isoformat")
            else str(describe["startDate"]),
            "stopDate": describe.get("stopDate", "").isoformat()
            if describe.get("stopDate") and hasattr(describe["stopDate"], "isoformat")
            else str(describe.get("stopDate", "")),
            "input": json.loads(describe.get("input", "{}")),
            "output": json.loads(describe.get("output", "{}"))
            if describe.get("output")
            else None,
            "events": events,
        }

    def start_destroy_pipeline(self, deployment: Deployment, template: Template) -> str:
        """Start the offboarding/destroy pipeline execution.

        Extracts the offboarding job from the template metadata and builds
        the Step Functions input for the destroy operation.

        Returns the execution ARN.
        """
        offboarding_job = self._extract_job(template, "offboarding")
        if not offboarding_job:
            raise ValueError(
                f"Template '{template.metadata.id}' has no offboarding job defined"
            )

        sf_input = self._build_execution_input(deployment, offboarding_job, action="destroy")
        ts = int(time.time())
        execution_name = f"destroy-{deployment.deployment_id}-{ts}"

        response = self.sfn_client.start_execution(
            stateMachineArn=self.state_machine_arn,
            name=execution_name,
            input=json.dumps(sf_input),
        )

        execution_arn = response["executionArn"]
        logger.info(
            f"Started destroy pipeline execution {execution_arn} for "
            f"deployment {deployment.deployment_id}"
        )
        return execution_arn

    def get_build_logs(self, build_id: str) -> str:
        """Retrieve CodeBuild execution logs from CloudWatch.

        CodeBuild logs are stored in CloudWatch under the log group
        /aws/codebuild/<project-name>. The build_id contains the
        project name and build number.
        """
        # CodeBuild build IDs follow the format: <project-name>:<build-uuid>
        parts = build_id.split(":")
        if len(parts) != 2:
            raise ValueError(f"Invalid build_id format: {build_id}")

        project_name = parts[0]
        log_group = f"/aws/codebuild/{project_name}"
        log_stream = parts[1]

        try:
            response = self.logs_client.get_log_events(
                logGroupName=log_group,
                logStreamName=log_stream,
                startFromHead=True,
            )

            log_lines = []
            for event in response.get("events", []):
                log_lines.append(event["message"])

            return "".join(log_lines)
        except self.logs_client.exceptions.ResourceNotFoundException:
            logger.warning(f"Log stream not found for build {build_id}")
            return f"No logs available for build {build_id}"

    # --- Private helpers ---

    def _extract_job(self, template: Template, job_name: str) -> Optional[dict]:
        """Extract a job entry from template metadata by name.

        Returns a dict with name, incoming_event, outgoing_event or None.
        """
        for job in template.metadata.jobs:
            if job.name == job_name:
                return {
                    "name": job.name,
                    "incoming_event": job.incoming_event,
                    "outgoing_event": job.outgoing_event,
                }
        return None

    def _build_execution_input(self, deployment: Deployment, job: dict, action: str = "deploy") -> dict:
        """Build the Step Functions execution input from deployment and job."""
        # Ensure required Step Functions parameters exist with defaults
        params = dict(deployment.parameters)
        params.setdefault("USE_CASE_ID", deployment.template_id)
        params.setdefault("FRAMEWORK", deployment.framework_id or "default")
        params.setdefault("DEPLOYMENT_PATTERN", deployment.iac_type or "default")

        return {
            "deployment_id": deployment.deployment_id,
            "template_id": deployment.template_id,
            "deployment_name": deployment.deployment_name,
            "iac_type": deployment.iac_type,
            "framework_id": deployment.framework_id,
            "aws_region": deployment.aws_region,
            "s3_bucket": deployment.s3_bucket,
            "s3_key": deployment.s3_key,
            "parameters": params,
            "target_account_id": deployment.target_account_id,
            "target_role_arn": deployment.target_role_arn,
            "job": job,
            "action": action,
        }

    @staticmethod
    def _build_codebuild_env_vars(deployment: Deployment) -> List[Dict[str, str]]:
        """Construct the environment variable list for CodeBuild.

        Includes required keys (AWS_ACCOUNT, AWS_REGION, DEPLOYMENT_ID,
        TEMPLATE_ID, IAC_TYPE) plus one entry for each user parameter.
        """
        env_vars = [
            {"name": "AWS_ACCOUNT", "value": deployment.aws_account, "type": "PLAINTEXT"},
            {"name": "AWS_REGION", "value": deployment.aws_region, "type": "PLAINTEXT"},
            {"name": "DEPLOYMENT_ID", "value": deployment.deployment_id, "type": "PLAINTEXT"},
            {"name": "TEMPLATE_ID", "value": deployment.template_id, "type": "PLAINTEXT"},
            {"name": "IAC_TYPE", "value": deployment.iac_type, "type": "PLAINTEXT"},
        ]

        for key, value in deployment.parameters.items():
            env_vars.append({
                "name": key,
                "value": str(value),
                "type": "PLAINTEXT",
            })

        return env_vars

    @staticmethod
    def _build_terraform_backend_config(
        deployment_id: str,
        bucket_name: str,
        lock_table_name: str,
        region: str,
    ) -> str:
        """Generate the terraform init backend config string.

        Produces -backend-config flags for S3 backend with a
        deployment-specific state key path.
        """
        key = f"deployments/{deployment_id}/terraform.tfstate"
        return (
            f'-backend-config="bucket={bucket_name}" '
            f'-backend-config="key={key}" '
            f'-backend-config="region={region}" '
            f'-backend-config="dynamodb_table={lock_table_name}"'
        )
