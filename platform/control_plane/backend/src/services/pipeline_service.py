"""Pipeline service for Step Functions orchestration and CodeBuild interaction"""

import boto3
import json
import logging
import time
from typing import Dict, List, Any, Optional

from core.aws_paging import paginate_bounded
from models.deployment import Deployment
from models.template import Template
from services.pipeline_inputs import PipelineInput

logger = logging.getLogger(__name__)

# stepfunctions:GetExecutionHistory maxResults maximum, verified against the botocore
# 1.43.10 service model (min 0, max 1000). The old call asked for 100.
_HISTORY_PAGE = 1000

# Bound on one history walk. A deployment pipeline that has emitted this many events is
# pathological, and reaching the bound is disclosed rather than silently truncating.
_MAX_HISTORY_EVENTS = 5000
_HISTORY_BUDGET_S = 15.0


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
        """Get current execution status and history.

        NOTE ON SCOPE: this method has no callers anywhere in the repo (only its own
        definition matched a search), so nothing it returns is user-visible today. It is
        fixed rather than left because the shape of the bug is a trap for the next caller.

        The history read was `maxResults=100` with no paging, against an API maximum of
        1000. It does not feed a count, so it is not the same defect as the Govern sites -
        but it does feed `events`, a list rendered as "the execution history", and the
        truncation is at the WORST end. `reverseOrder=False` returns oldest first, so the
        events dropped are the most recent ones: exactly the ones that say how the
        execution failed. The list simply stopped, with nothing marking it as partial.

        `status` and `output` come from describe_execution and were never affected.
        """
        describe = self.sfn_client.describe_execution(
            executionArn=execution_arn
        )

        history = paginate_bounded(
            self.sfn_client, "get_execution_history", "events",
            page_size=_HISTORY_PAGE,
            max_items=_MAX_HISTORY_EVENTS,
            budget_s=_HISTORY_BUDGET_S,
            executionArn=execution_arn,
            reverseOrder=False,
        )

        events = []
        for event in history.items:
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
            # False means `events` is a PREFIX of the history, not the history. Since
            # reverseOrder is False, the missing events are the most recent ones, so a
            # consumer must not infer an outcome from the last event it sees.
            "events_complete": history.complete,
            # None when the walk reached the end. A caveat that always fires teaches a
            # reader to ignore the one that matters.
            "events_note": history.note,
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

    def get_runtime_logs(self, log_group: str, limit: int = 500) -> str:
        """Tail the most recent N events from an AgentCore runtime log group.

        Returns events newest-last, formatted as 'ISO_TS  message'. Returns a
        placeholder string if the log group does not exist (runtime hasn't
        emitted logs yet).
        """
        try:
            response = self.logs_client.filter_log_events(
                logGroupName=log_group,
                limit=limit,
            )
        except self.logs_client.exceptions.ResourceNotFoundException:
            return f"No logs yet in {log_group} — runtime may not have started."

        events = sorted(response.get("events", []), key=lambda e: e.get("timestamp", 0))
        if not events:
            return f"No log events in {log_group} yet."

        from datetime import datetime, timezone
        lines = []
        for e in events:
            ts_ms = e.get("timestamp", 0)
            ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat(timespec="seconds")
            lines.append(f"{ts}  {e.get('message', '').rstrip()}")
        return "\n".join(lines)

    # --- Private helpers ---

    def _extract_job(self, template: Template, job_name: str) -> Optional[dict]:
        """Extract a job entry from template metadata by name.

        Returns a dict with name, incoming_event, outgoing_event or None.
        """
        for job in template.metadata.jobs:
            if job.get("name") == job_name:
                return {
                    "name": job.get("name"),
                    "incoming_event": job.get("incoming_event"),
                    "outgoing_event": job.get("outgoing_event"),
                }
        return None

    def _build_execution_input(self, deployment: Deployment, job: dict, action: str = "deploy") -> dict:
        """Build the Step Functions execution input from deployment and job.

        Uses PipelineInput to guarantee every SFN-mapped parameter key is
        present — callers cannot accidentally omit a key that the state
        machine's EnvironmentVariablesOverride references.
        """
        # deployment.parameters may lack USE_CASE_ID (generic template path);
        # fall back to template_id/framework_id/iac_type the same way the
        # legacy setdefault logic did, so behavior is preserved.
        params = PipelineInput.from_dict(
            deployment.parameters,
            use_case_id=(deployment.parameters or {}).get("USE_CASE_ID") or deployment.template_id,
            framework=(deployment.parameters or {}).get("FRAMEWORK") or deployment.framework_id or "default",
            deployment_pattern=(deployment.parameters or {}).get("DEPLOYMENT_PATTERN") or deployment.iac_type or "default",
        ).to_sfn_parameters()

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
