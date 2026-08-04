"""
Auto Evaluation Lambda — Automatically creates/deletes AgentCore Online Evaluations
and CloudWatch alarms when agents or endpoints are created/deleted.

Triggered by EventBridge on:
  - CreateAgentRuntime / DeleteAgentRuntime (manages DEFAULT endpoint eval)
  - CreateAgentRuntimeEndpoint / DeleteAgentRuntimeEndpoint (manages per-endpoint eval)

On CreateAgentRuntime:
  1. Creates Online Evaluation Config for DEFAULT endpoint
  2. Creates CloudWatch alarm for DEFAULT endpoint
  3. Writes alarm_summary + per-evaluator records to evaluation-signals DynamoDB

On CreateAgentRuntimeEndpoint:
  1. Resolves agent name from runtime ID
  2. Creates Online Evaluation Config for the specific endpoint
  3. Creates CloudWatch alarm for the specific endpoint
  4. Writes alarm_summary + per-evaluator records with endpoint-qualified signal_keys

On DeleteAgentRuntime:
  1. Deletes ALL eval configs for the agent (DEFAULT + all endpoints)
  2. Deletes ALL CloudWatch alarms for the agent
  3. Removes ALL records from evaluation-signals DynamoDB

On DeleteAgentRuntimeEndpoint:
  1. Deletes eval config for the specific endpoint
  2. Deletes CloudWatch alarm for the specific endpoint
  3. Removes endpoint-specific records from evaluation-signals DynamoDB

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


def _resolve_agent_name(agent_runtime_id: str) -> str:
    """Resolve agent name from runtime ID via AgentCore API."""
    try:
        resp = agentcore.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        return resp.get("agentRuntimeName", "")
    except ClientError as e:
        logger.warning(f"Cannot resolve agent name for {agent_runtime_id}: {e}")
        # Fallback: extract name from runtime ID pattern (name-randomChars)
        parts = agent_runtime_id.rsplit("-", 1)
        return parts[0] if len(parts) == 2 else agent_runtime_id


def _make_eval_config_name(agent_name: str, endpoint: str) -> str:
    """Generate eval config name. Max 48 chars.
    Must match pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}
    """
    safe_name = agent_name.replace("-", "_")
    safe_ep = endpoint.replace("-", "_")
    if endpoint == "DEFAULT":
        return f"eval_{safe_name}"[:48]
    return f"eval_{safe_name}_{safe_ep}"[:48]


def _make_alarm_name(agent_name: str, endpoint: str) -> str:
    """Generate CloudWatch alarm name."""
    if endpoint == "DEFAULT":
        return f"AgentSafety-Eval-{agent_name}"
    return f"AgentSafety-Eval-{agent_name}-{endpoint}"


def _make_signal_key(evaluator_or_key: str, endpoint: str) -> str:
    """Generate DynamoDB signal_key with endpoint qualifier.

    For DEFAULT endpoint: keeps original format for backward compatibility.
    For other endpoints: appends #endpoint suffix.
    """
    if endpoint == "DEFAULT":
        return evaluator_or_key
    return f"{evaluator_or_key}#{endpoint}"


def _create_eval_config(agent_name: str, agent_runtime_id: str, endpoint: str) -> dict | None:
    """Create an Online Evaluation Config for a specific endpoint."""
    config_name = _make_eval_config_name(agent_name, endpoint)
    log_group = f"/aws/bedrock-agentcore/runtimes/{agent_runtime_id}-{endpoint}"
    service_name = f"{agent_name}.{endpoint}"

    try:
        resp = agentcore.create_online_evaluation_config(
            onlineEvaluationConfigName=config_name,
            description=f"Auto-created evaluation for agent {agent_name} endpoint {endpoint}",
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
        logger.info(f"Eval config created: {resp.get('onlineEvaluationConfigId')} for {agent_name}/{endpoint}")
        return resp
    except ClientError as e:
        if "ConflictException" in str(e):
            logger.info(f"Eval config already exists for {agent_name}/{endpoint}")
            return None
        logger.error(f"Failed to create eval config for {agent_name}/{endpoint}: {e}")
        return None


def _delete_eval_config_by_name(config_name: str):
    """Delete an Online Evaluation Config by its name."""
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
        logger.warning(f"Failed to delete eval config {config_name}: {e}")


def _delete_all_eval_configs_for_agent(agent_name: str):
    """Delete ALL eval configs for an agent (DEFAULT + all endpoints)."""
    prefix = f"eval_{agent_name}"
    try:
        configs = []
        for page in agentcore.get_paginator("list_online_evaluation_configs").paginate():
            configs.extend(page.get("onlineEvaluationConfigs", []))
        for cfg in configs:
            cfg_name = cfg.get("onlineEvaluationConfigName", "")
            # Match: eval_{agent_name} (DEFAULT) or eval_{agent_name}_{endpoint}
            if cfg_name == prefix[:48] or cfg_name.startswith(f"{prefix}_"):
                try:
                    agentcore.delete_online_evaluation_config(
                        onlineEvaluationConfigId=cfg["onlineEvaluationConfigId"]
                    )
                    logger.info(f"Eval config deleted: {cfg_name}")
                except ClientError as e:
                    logger.warning(f"Failed to delete eval config {cfg_name}: {e}")
    except ClientError as e:
        logger.warning(f"Failed to list eval configs for deletion: {e}")


def _create_eval_alarm(agent_name: str, endpoint: str):
    """Create a CloudWatch alarm monitoring evaluator metrics for a specific endpoint."""
    service_name = f"{agent_name}.{endpoint}"
    alarm_name = _make_alarm_name(agent_name, endpoint)

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
            "AlarmDescription": f"Agent quality alarm for {agent_name} endpoint {endpoint}. Fires when any evaluator detects harmful content, incorrect answers, goal failures, or tool misuse.",
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
        logger.error(f"Failed to create alarm {alarm_name}: {e}")


def _delete_eval_alarm(agent_name: str, endpoint: str):
    """Delete the CloudWatch alarm for a specific endpoint."""
    alarm_name = _make_alarm_name(agent_name, endpoint)
    try:
        cloudwatch.delete_alarms(AlarmNames=[alarm_name])
        logger.info(f"Alarm deleted: {alarm_name}")
    except ClientError as e:
        logger.warning(f"Failed to delete alarm {alarm_name}: {e}")


def _delete_all_eval_alarms_for_agent(agent_name: str):
    """Delete ALL eval alarms for an agent (DEFAULT + all endpoints)."""
    prefix = f"AgentSafety-Eval-{agent_name}"
    try:
        alarms_to_delete = []
        for page in cloudwatch.get_paginator("describe_alarms").paginate(
            AlarmNamePrefix=prefix, AlarmTypes=["MetricAlarm"]
        ):
            for alarm in page.get("MetricAlarms", []):
                alarms_to_delete.append(alarm["AlarmName"])
        if alarms_to_delete:
            # delete_alarms accepts max 100 at a time
            for i in range(0, len(alarms_to_delete), 100):
                cloudwatch.delete_alarms(AlarmNames=alarms_to_delete[i:i + 100])
            logger.info(f"Deleted {len(alarms_to_delete)} alarms for {agent_name}")
    except ClientError as e:
        logger.warning(f"Failed to delete alarms for {agent_name}: {e}")


def _write_eval_signals(agent_name: str, endpoint: str, eval_config_id: str, eval_config_name: str):
    """Write initial evaluation signals to DynamoDB for a specific endpoint."""
    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    table = dynamodb.Table(EVAL_SIGNALS_TABLE)
    alarm_name = _make_alarm_name(agent_name, endpoint)

    # Write alarm summary record
    try:
        table.put_item(Item={
            "agent_name": agent_name,
            "signal_key": _make_signal_key("alarm_summary", endpoint),
            "endpoint": endpoint,
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
        logger.warning(f"Failed to write alarm summary for {agent_name}/{endpoint}: {e}")

    # Write per-evaluator placeholder records
    for eid in BUILTIN_EVALUATORS:
        try:
            table.put_item(Item={
                "agent_name": agent_name,
                "signal_key": _make_signal_key(eid, endpoint),
                "endpoint": endpoint,
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


def _delete_eval_signals_for_endpoint(agent_name: str, endpoint: str):
    """Remove evaluation signal records for a specific endpoint."""
    table = dynamodb.Table(EVAL_SIGNALS_TABLE)
    suffix = f"#{endpoint}" if endpoint != "DEFAULT" else ""
    try:
        items = table.scan().get("Items", [])
        for item in items:
            if item.get("agent_name") != agent_name:
                continue
            sk = item.get("signal_key", "")
            # Match: for DEFAULT, keys without # suffix. For others, keys with #endpoint suffix.
            if endpoint == "DEFAULT":
                if "#" not in sk:
                    table.delete_item(Key={"agent_name": agent_name, "signal_key": sk})
            else:
                if sk.endswith(suffix):
                    table.delete_item(Key={"agent_name": agent_name, "signal_key": sk})
        logger.info(f"Eval signals deleted for {agent_name}/{endpoint}")
    except ClientError as e:
        logger.warning(f"Failed to delete eval signals for {agent_name}/{endpoint}: {e}")


def _delete_all_eval_signals_for_agent(agent_name: str):
    """Remove ALL evaluation signal records for an agent."""
    table = dynamodb.Table(EVAL_SIGNALS_TABLE)
    try:
        items = table.scan().get("Items", [])
        for item in items:
            if item.get("agent_name") == agent_name:
                table.delete_item(Key={
                    "agent_name": item["agent_name"],
                    "signal_key": item["signal_key"],
                })
        logger.info(f"All eval signals deleted for {agent_name}")
    except ClientError as e:
        logger.warning(f"Failed to delete eval signals for {agent_name}: {e}")


def handler(event, context):
    """Lambda handler — triggered by EventBridge on AgentCore runtime/endpoint events."""
    logger.info(f"Event: {json.dumps(event)}")

    detail = event.get("detail", {})
    event_name = detail.get("eventName", "")
    rp = detail.get("requestParameters", {})
    re = detail.get("responseElements", {})

    # --- CreateAgentRuntime / DeleteAgentRuntime ---
    if event_name in ("CreateAgentRuntime", "DeleteAgentRuntime"):
        agent_name = rp.get("agentRuntimeName", "")
        agent_runtime_id = rp.get("agentRuntimeId", "") or re.get("agentRuntimeId", "")

        if not agent_name and agent_runtime_id:
            parts = agent_runtime_id.rsplit("-", 1)
            agent_name = parts[0] if len(parts) == 2 else agent_runtime_id

        if not agent_name:
            return {"statusCode": 200, "body": "no agent name"}

        if event_name == "CreateAgentRuntime":
            logger.info(f"Creating evaluation for agent: {agent_name} (DEFAULT endpoint)")

            if not EVAL_EXECUTION_ROLE_ARN:
                logger.error("EVAL_EXECUTION_ROLE_ARN not set")
                return {"statusCode": 500, "body": "missing EVAL_EXECUTION_ROLE_ARN"}

            endpoint = "DEFAULT"
            result = _create_eval_config(agent_name, agent_runtime_id, endpoint)
            eval_config_id = result.get("onlineEvaluationConfigId", "") if result else ""
            eval_config_name = _make_eval_config_name(agent_name, endpoint)

            _create_eval_alarm(agent_name, endpoint)
            _write_eval_signals(agent_name, endpoint, eval_config_id, eval_config_name)

            logger.info(f"Evaluation setup complete for {agent_name}/{endpoint}")
            return {"statusCode": 200, "body": json.dumps({
                "status": "created", "agent_name": agent_name,
                "endpoint": endpoint, "eval_config_id": eval_config_id})}

        elif event_name == "DeleteAgentRuntime":
            logger.info(f"Deleting ALL evaluations for agent: {agent_name}")

            _delete_all_eval_configs_for_agent(agent_name)
            _delete_all_eval_alarms_for_agent(agent_name)
            _delete_all_eval_signals_for_agent(agent_name)

            return {"statusCode": 200, "body": json.dumps({
                "status": "deleted", "agent_name": agent_name})}

    # --- CreateAgentRuntimeEndpoint / DeleteAgentRuntimeEndpoint ---
    elif event_name in ("CreateAgentRuntimeEndpoint", "DeleteAgentRuntimeEndpoint"):
        agent_runtime_id = rp.get("agentRuntimeId", "") or re.get("agentRuntimeId", "")
        endpoint_name = rp.get("name", "") or re.get("endpointName", "")

        # CloudTrail may mask name/endpointName with ***. Extract from ARN as fallback.
        if not endpoint_name or endpoint_name == "***":
            ep_arn = re.get("agentRuntimeEndpointArn", "")
            if "/runtime-endpoint/" in ep_arn:
                endpoint_name = ep_arn.rsplit("/runtime-endpoint/", 1)[-1]

        if not agent_runtime_id:
            return {"statusCode": 200, "body": "no agentRuntimeId in endpoint event"}

        if not endpoint_name or endpoint_name == "***":
            return {"statusCode": 200, "body": "no endpoint name (masked by CloudTrail)"}

        # Skip DEFAULT — already handled by CreateAgentRuntime
        if endpoint_name == "DEFAULT":
            logger.info(f"Skipping DEFAULT endpoint event (handled by CreateAgentRuntime)")
            return {"statusCode": 200, "body": "DEFAULT endpoint handled by runtime event"}

        # Resolve agent name from runtime ID
        agent_name = _resolve_agent_name(agent_runtime_id)
        if not agent_name:
            return {"statusCode": 200, "body": f"cannot resolve agent name for {agent_runtime_id}"}

        if event_name == "CreateAgentRuntimeEndpoint":
            logger.info(f"Creating evaluation for agent: {agent_name} endpoint: {endpoint_name}")

            if not EVAL_EXECUTION_ROLE_ARN:
                logger.error("EVAL_EXECUTION_ROLE_ARN not set")
                return {"statusCode": 500, "body": "missing EVAL_EXECUTION_ROLE_ARN"}

            result = _create_eval_config(agent_name, agent_runtime_id, endpoint_name)
            eval_config_id = result.get("onlineEvaluationConfigId", "") if result else ""
            eval_config_name = _make_eval_config_name(agent_name, endpoint_name)

            _create_eval_alarm(agent_name, endpoint_name)
            _write_eval_signals(agent_name, endpoint_name, eval_config_id, eval_config_name)

            logger.info(f"Evaluation setup complete for {agent_name}/{endpoint_name}")
            return {"statusCode": 200, "body": json.dumps({
                "status": "created", "agent_name": agent_name,
                "endpoint": endpoint_name, "eval_config_id": eval_config_id})}

        elif event_name == "DeleteAgentRuntimeEndpoint":
            logger.info(f"Deleting evaluation for agent: {agent_name} endpoint: {endpoint_name}")

            config_name = _make_eval_config_name(agent_name, endpoint_name)
            _delete_eval_config_by_name(config_name)
            _delete_eval_alarm(agent_name, endpoint_name)
            _delete_eval_signals_for_endpoint(agent_name, endpoint_name)

            return {"statusCode": 200, "body": json.dumps({
                "status": "deleted", "agent_name": agent_name,
                "endpoint": endpoint_name})}

    return {"statusCode": 200, "body": f"unhandled: {event_name}"}
