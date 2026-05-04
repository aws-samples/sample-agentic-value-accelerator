"""
Auto Evaluation Lambda — Automatically creates/deletes AgentCore Online Evaluations
and CloudWatch alarms when agents are created/deleted.

Triggered by EventBridge on CreateAgentRuntime / DeleteAgentRuntime.

On CreateAgentRuntime:
  1. Creates Online Evaluation Config (7 built-in evaluators, 100% sampling)
  2. Creates composite CloudWatch alarm (fires on any bad eval score)
  3. Writes alarm_summary + per-evaluator records to evaluation-signals DynamoDB

On DeleteAgentRuntime:
  1. Deletes Online Evaluation Config
  2. Deletes CloudWatch alarm
  3. Removes all records from evaluation-signals DynamoDB

Environment Variables:
  - EVAL_SIGNALS_TABLE: DynamoDB table (default: evaluation-signals)
  - EVAL_EXECUTION_ROLE_ARN: IAM role ARN for evaluation execution
  - SNS_TOPIC_ARN: SNS topic for alarm notifications
  - SAMPLING_PCT: Sampling percentage (default: 100.0)
  - REGION: AWS region
"""

import json
import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))
EVAL_SIGNALS_TABLE = os.environ.get("EVAL_SIGNALS_TABLE", "evaluation-signals")
EVAL_EXECUTION_ROLE_ARN = os.environ.get("EVAL_EXECUTION_ROLE_ARN", "")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")
SAMPLING_PCT = float(os.environ.get("SAMPLING_PCT", "100.0"))

retry = Config(retries={"max_attempts": 3, "mode": "adaptive"})
agentcore = boto3.client("bedrock-agentcore-control", region_name=REGION, config=retry)
cloudwatch = boto3.client("cloudwatch", region_name=REGION, config=retry)
dynamodb = boto3.resource("dynamodb", region_name=REGION)

BUILTIN_EVALUATORS = [
    "Builtin.Harmfulness",
    "Builtin.Correctness",
    "Builtin.Helpfulness",
    "Builtin.GoalSuccessRate",
    "Builtin.ToolSelectionAccuracy",
    "Builtin.ToolParameterAccuracy",
    "Builtin.Faithfulness",
]

EVAL_METRICS_NS = "Bedrock-AgentCore/Evaluations"

def _create_eval_config(agent_name: str, agent_runtime_id: str) -> dict | None:
    """Create an Online Evaluation Config for the agent."""
    config_name = f"eval_{agent_name}"[:48]
    log_group = f"/aws/bedrock-agentcore/runtimes/{agent_runtime_id}-DEFAULT"
    service_name = f"{agent_name}.DEFAULT"

    try:
        resp = agentcore.create_online_evaluation_config(
            onlineEvaluationConfigName=config_name,
            description=f"Auto-created evaluation for agent {agent_name}",
            rule={
                "samplingConfig": {"samplingPercentage": SAMPLING_PCT},
                "sessionConfig": {"sessionTimeoutMinutes": 15},
            },
            dataSourceConfig={
                "cloudWatchLogs": {
                    "logGroupNames": [log_group],
                    "serviceNames": [service_name],
                }
            },
            evaluators=[{"evaluatorId": eid} for eid in BUILTIN_EVALUATORS],
            evaluationExecutionRoleArn=EVAL_EXECUTION_ROLE_ARN,
            enableOnCreate=True,
        )
        logger.info(f"Eval config created: {resp.get('onlineEvaluationConfigId')} for {agent_name}")
        return resp
    except ClientError as e:
        if "ConflictException" in str(e):
            logger.info(f"Eval config already exists for {agent_name}")
            return None
        logger.error(f"Failed to create eval config: {e}")
        return None


def _delete_eval_config(agent_name: str):
    """Delete the Online Evaluation Config for the agent."""
    config_name = f"eval_{agent_name}"[:48]
    try:
        configs = []
        for page in agentcore.get_paginator("list_online_evaluation_configs").paginate():
            configs.extend(page.get("onlineEvaluationConfigs", []))
        for cfg in configs:
            if cfg.get("onlineEvaluationConfigName", "") == config_name:
                agentcore.delete_online_evaluation_config(
                    onlineEvaluationConfigId=cfg["onlineEvaluationConfigId"]
                )
                logger.info(f"Eval config deleted: {config_name}")
                return
        logger.info(f"Eval config not found for deletion: {config_name}")
    except ClientError as e:
        logger.warning(f"Failed to delete eval config: {e}")


def _create_eval_alarm(agent_name: str):
    """Create a composite CloudWatch alarm monitoring all evaluator metrics."""
    service_name = f"{agent_name}.DEFAULT"
    alarm_name = f"AgentSafety-Eval-{agent_name}"

    metric_queries = [
        {"Id": "harmfulness", "MetricStat": {"Metric": {"Namespace": EVAL_METRICS_NS, "MetricName": "Builtin.Harmfulness", "Dimensions": [{"Name": "service.name", "Value": service_name}, {"Name": "label", "Value": "Harmful"}]}, "Period": 900, "Stat": "Sum"}, "ReturnData": False},
        {"Id": "incorrectness", "MetricStat": {"Metric": {"Namespace": EVAL_METRICS_NS, "MetricName": "Builtin.Correctness", "Dimensions": [{"Name": "service.name", "Value": service_name}, {"Name": "label", "Value": "Incorrect"}]}, "Period": 900, "Stat": "Sum"}, "ReturnData": False},
        {"Id": "goal_failures", "MetricStat": {"Metric": {"Namespace": EVAL_METRICS_NS, "MetricName": "Builtin.GoalSuccessRate", "Dimensions": [{"Name": "service.name", "Value": service_name}, {"Name": "label", "Value": "No"}]}, "Period": 900, "Stat": "Sum"}, "ReturnData": False},
        {"Id": "tool_selection", "MetricStat": {"Metric": {"Namespace": EVAL_METRICS_NS, "MetricName": "Builtin.ToolSelectionAccuracy", "Dimensions": [{"Name": "service.name", "Value": service_name}, {"Name": "label", "Value": "No"}]}, "Period": 900, "Stat": "Sum"}, "ReturnData": False},
        {"Id": "tool_params", "MetricStat": {"Metric": {"Namespace": EVAL_METRICS_NS, "MetricName": "Builtin.ToolParameterAccuracy", "Dimensions": [{"Name": "service.name", "Value": service_name}, {"Name": "label", "Value": "No"}]}, "Period": 900, "Stat": "Sum"}, "ReturnData": False},
        {"Id": "total_bad", "Expression": "FILL(harmfulness,0)+FILL(incorrectness,0)+FILL(goal_failures,0)+FILL(tool_selection,0)+FILL(tool_params,0)", "Label": "Total Bad Scores", "ReturnData": True},
    ]

    try:
        alarm_kwargs = {
            "AlarmName": alarm_name,
            "AlarmDescription": f"Agent quality alarm for {agent_name}. Fires when any evaluator detects harmful content, incorrect answers, goal failures, or tool misuse.",
            "Metrics": metric_queries,
            "EvaluationPeriods": 1,
            "Threshold": 1,
            "ComparisonOperator": "GreaterThanOrEqualToThreshold",
            "TreatMissingData": "notBreaching",
        }
        if SNS_TOPIC_ARN:
            alarm_kwargs["AlarmActions"] = [SNS_TOPIC_ARN]
            alarm_kwargs["OKActions"] = [SNS_TOPIC_ARN]
        cloudwatch.put_metric_alarm(**alarm_kwargs)
        logger.info(f"Alarm created: {alarm_name}")
    except ClientError as e:
        logger.error(f"Failed to create alarm: {e}")


def _delete_eval_alarm(agent_name: str):
    """Delete the CloudWatch alarm for the agent."""
    alarm_name = f"AgentSafety-Eval-{agent_name}"
    try:
        cloudwatch.delete_alarms(AlarmNames=[alarm_name])
        logger.info(f"Alarm deleted: {alarm_name}")
    except ClientError as e:
        logger.warning(f"Failed to delete alarm: {e}")


def _write_eval_signals(agent_name: str, eval_config_id: str, eval_config_name: str):
    """Write initial evaluation signals to DynamoDB."""
    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    table = dynamodb.Table(EVAL_SIGNALS_TABLE)
    alarm_name = f"AgentSafety-Eval-{agent_name}"

    # Write alarm summary record
    try:
        table.put_item(Item={
            "agent_name": agent_name,
            "signal_key": "alarm_summary",
            "alarm_name": alarm_name,
            "alarm_state": "INSUFFICIENT_DATA",
            "alarm_reason": "Waiting for evaluation data",
            "alarm_updated_at": now.isoformat(),
            "eval_config_id": eval_config_id,
            "eval_config_name": eval_config_name,
            "evaluator_count": len(BUILTIN_EVALUATORS),
            "sampling_pct": str(SAMPLING_PCT),
            "severity": "medium",
            "synced_at": now.isoformat(),
            "expires_at": expires_at,
        })
    except ClientError as e:
        logger.warning(f"Failed to write alarm summary: {e}")

    # Write per-evaluator placeholder records
    for eid in BUILTIN_EVALUATORS:
        try:
            table.put_item(Item={
                "agent_name": agent_name,
                "signal_key": eid,
                "evaluator_name": eid.replace("Builtin.", ""),
                "bad_count": 0,
                "good_count": 0,
                "total_count": 0,
                "bad_pct": "0.0",
                "severity": "low",
                "description": f"{eid.replace('Builtin.', '')}: waiting for data",
                "config_name": eval_config_name,
                "synced_at": now.isoformat(),
                "expires_at": expires_at,
            })
        except ClientError:
            pass


def _delete_eval_signals(agent_name: str):
    """Remove all evaluation signal records for the agent."""
    table = dynamodb.Table(EVAL_SIGNALS_TABLE)
    try:
        items = table.scan().get("Items", [])
        for item in items:
            if item.get("agent_name") == agent_name:
                table.delete_item(Key={
                    "agent_name": item["agent_name"],
                    "signal_key": item["signal_key"],
                })
        logger.info(f"Eval signals deleted for {agent_name}")
    except ClientError as e:
        logger.warning(f"Failed to delete eval signals: {e}")


def handler(event, context):
    """Lambda handler — triggered by EventBridge on AgentCore runtime events."""
    logger.info(f"Event: {json.dumps(event)}")

    detail = event.get("detail", {})
    event_name = detail.get("eventName", "")
    rp = detail.get("requestParameters", {})
    re = detail.get("responseElements", {})

    agent_name = rp.get("agentRuntimeName", "")
    agent_arn = re.get("agentRuntimeArn", "")
    agent_runtime_id = rp.get("agentRuntimeId", "") or re.get("agentRuntimeId", "")

    if not agent_name and agent_runtime_id:
        parts = agent_runtime_id.rsplit("-", 1)
        agent_name = parts[0] if len(parts) == 2 else agent_runtime_id

    if not agent_name:
        return {"statusCode": 200, "body": "no agent name"}

    if event_name == "CreateAgentRuntime":
        logger.info(f"Creating evaluation for agent: {agent_name}")

        if not EVAL_EXECUTION_ROLE_ARN:
            logger.error("EVAL_EXECUTION_ROLE_ARN not set")
            return {"statusCode": 500, "body": "missing EVAL_EXECUTION_ROLE_ARN"}

        # 1. Create eval config
        result = _create_eval_config(agent_name, agent_runtime_id)
        eval_config_id = result.get("onlineEvaluationConfigId", "") if result else ""
        eval_config_name = f"eval_{agent_name}"[:48]

        # 2. Create CloudWatch alarm
        _create_eval_alarm(agent_name)

        # 3. Write to DynamoDB
        _write_eval_signals(agent_name, eval_config_id, eval_config_name)

        logger.info(f"Evaluation setup complete for {agent_name}: config={eval_config_id}")
        return {"statusCode": 200, "body": json.dumps({
            "status": "created", "agent_name": agent_name,
            "eval_config_id": eval_config_id})}

    elif event_name == "DeleteAgentRuntime":
        logger.info(f"Deleting evaluation for agent: {agent_name}")

        # 1. Delete eval config
        _delete_eval_config(agent_name)

        # 2. Delete alarm
        _delete_eval_alarm(agent_name)

        # 3. Remove from DynamoDB
        _delete_eval_signals(agent_name)

        return {"statusCode": 200, "body": json.dumps({
            "status": "deleted", "agent_name": agent_name})}

    return {"statusCode": 200, "body": f"unhandled: {event_name}"}
