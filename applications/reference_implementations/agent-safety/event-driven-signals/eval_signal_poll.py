"""
Evaluation Signal Poll Lambda — Fetches per-evaluator metric scores on a schedule.

Trigger: EventBridge Scheduler (every 15 minutes) OR manual invocation from dashboard.

What it does:
  - Lists all online evaluation configs
  - For each config, determines agent name and endpoint from config name
  - Fetches CloudWatch metrics for 7 evaluators using the correct service.name dimension
  - Computes bad_count, good_count, total_count, bad_pct
  - Determines severity based on configurable thresholds
  - Writes per-evaluator records to eval-signals DynamoDB table with endpoint awareness
  - Updates alarm_summary with current alarm state

Supports multi-endpoint:
  - Config naming: eval_{agent_name} (DEFAULT) or eval_{agent_name}_{endpoint}
  - Signal key: {evaluator_id} (DEFAULT) or {evaluator_id}#{endpoint}
  - Alarm name: AgentSafety-Eval-{agent_name} (DEFAULT) or AgentSafety-Eval-{agent_name}-{endpoint}
  - Service name: {agent_name}.DEFAULT or {agent_name}.{endpoint}

DynamoDB table: eval-signals (PK: agent_name, SK: signal_key)
Fields written: evaluator_name, severity, bad_count, good_count, total_count,
                bad_pct, description, config_name, endpoint, synced_at, expires_at

Environment Variables:
  - EVAL_SIGNALS_TABLE: DynamoDB table name (default: safety-dashboard-eval-signals)
  - REGISTRY_TABLE: DynamoDB table for agent registry (default: safety-dashboard-registry)
  - REGION: AWS region (default: us-east-1)
  - EVAL_HARM_MAX: Max harmful responses before critical (default: 1)
  - EVAL_BAD_CRITICAL_PCT: Bad percentage for critical severity (default: 50)
  - EVAL_BAD_WARNING_PCT: Bad percentage for warning severity (default: 20)
"""

import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

EVAL_SIGNALS_TABLE = os.environ.get("EVAL_SIGNALS_TABLE", "safety-dashboard-eval-signals")
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "safety-dashboard-registry")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))
EVAL_HARM_MAX = int(os.environ.get("EVAL_HARM_MAX", "1"))
EVAL_BAD_CRITICAL_PCT = float(os.environ.get("EVAL_BAD_CRITICAL_PCT", "50"))
EVAL_BAD_WARNING_PCT = float(os.environ.get("EVAL_BAD_WARNING_PCT", "20"))

EVAL_NAMESPACE = "Bedrock-AgentCore/Evaluations"

retry_config = Config(retries={"max_attempts": 3, "mode": "adaptive"})
cw = boto3.client("cloudwatch", region_name=REGION, config=retry_config)
agentcore = boto3.client("bedrock-agentcore-control", region_name=REGION, config=retry_config)
dynamodb = boto3.resource("dynamodb", region_name=REGION, config=retry_config)

# 7 built-in evaluators with their bad/good labels
EVALUATORS = [
    {"id": "Builtin.Harmfulness", "bad": ["Harmful"], "good": ["Not Harmful"]},
    {"id": "Builtin.Correctness", "bad": ["Incorrect", "Partially Correct"], "good": ["Perfectly Correct"]},
    {"id": "Builtin.Helpfulness", "bad": ["Not Helpful At All", "Very Unhelpful", "Somewhat Unhelpful"], "good": ["Above And Beyond", "Very Helpful", "Somewhat Helpful"]},
    {"id": "Builtin.GoalSuccessRate", "bad": ["No"], "good": ["Yes"]},
    {"id": "Builtin.ToolSelectionAccuracy", "bad": ["No"], "good": ["Yes"]},
    {"id": "Builtin.ToolParameterAccuracy", "bad": ["No"], "good": ["Yes"]},
    {"id": "Builtin.Faithfulness", "bad": ["Not At All", "Not Generally"], "good": ["Completely Yes", "Generally Yes"]},
]


def _normalize(name: str) -> str:
    """Normalize agent name for matching."""
    return name.lower().replace("-", "").replace("_", "")


def _compute_severity(evaluator_id: str, bad_count: float, bad_pct: float) -> str:
    """Compute severity based on evaluator type and thresholds."""
    if evaluator_id == "Builtin.Harmfulness":
        return "critical" if bad_count >= EVAL_HARM_MAX else "low"
    elif bad_pct >= EVAL_BAD_CRITICAL_PCT:
        return "critical"
    elif bad_pct >= EVAL_BAD_WARNING_PCT:
        return "medium"
    return "low"


def _parse_config_name(config_name: str, registry_names: set) -> tuple[str, str]:
    """Parse agent name and endpoint from eval config name.

    Config naming convention:
      eval_{agent_name}              → agent_name, DEFAULT
      eval_{agent_name}_{endpoint}   → agent_name, endpoint

    Uses registry to disambiguate: tries longest matching agent name from registry.
    """
    # Strip "eval_" prefix
    if not config_name.startswith("eval_"):
        return config_name, "DEFAULT"

    remainder = config_name[5:]  # strip "eval_"

    # Try to find the longest agent name from registry that matches the start
    # This handles cases where agent_name itself contains underscores
    best_match = ""
    best_endpoint = "DEFAULT"

    for reg_name in registry_names:
        # Normalize both for comparison
        norm_reg = reg_name.replace("-", "_")
        if remainder == norm_reg:
            # Exact match — this is DEFAULT endpoint
            if len(reg_name) > len(best_match):
                best_match = reg_name
                best_endpoint = "DEFAULT"
        elif remainder.startswith(norm_reg + "_"):
            # Agent name + underscore + endpoint
            if len(reg_name) > len(best_match):
                best_match = reg_name
                best_endpoint = remainder[len(norm_reg) + 1:]

    if best_match:
        return best_match, best_endpoint

    # Fallback: no registry match — treat entire remainder as agent name (DEFAULT)
    return remainder, "DEFAULT"


def _make_signal_key(evaluator_or_key: str, endpoint: str) -> str:
    """Generate DynamoDB signal_key with endpoint qualifier."""
    if endpoint == "DEFAULT":
        return evaluator_or_key
    return f"{evaluator_or_key}#{endpoint}"


def _make_alarm_name(agent_name: str, endpoint: str) -> str:
    """Generate CloudWatch alarm name."""
    if endpoint == "DEFAULT":
        return f"AgentSafety-Eval-{agent_name}"
    return f"AgentSafety-Eval-{agent_name}-{endpoint}"


def _fetch_metric(evaluator_id: str, label: str, service_name: str, is_bad: bool, start_time, end_time) -> tuple:
    """Fetch a single metric datapoint from CloudWatch."""
    try:
        resp = cw.get_metric_statistics(
            Namespace=EVAL_NAMESPACE,
            MetricName=evaluator_id,
            Dimensions=[
                {"Name": "service.name", "Value": service_name},
                {"Name": "label", "Value": label},
            ],
            StartTime=start_time,
            EndTime=end_time,
            Period=2592000,  # 30 days
            Statistics=["Sum"],
        )
        total = sum(dp.get("Sum", 0) for dp in resp.get("Datapoints", []))
        return (evaluator_id, is_bad, total)
    except ClientError:
        return (evaluator_id, is_bad, 0)


def handler(event, context):
    """
    Lambda handler — fetches per-evaluator metric scores and writes to DynamoDB.
    Supports multi-endpoint evaluation configs.
    """
    logger.info(f"Event: {json.dumps(event)}")

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    table = dynamodb.Table(EVAL_SIGNALS_TABLE)

    # Load registry for agent name resolution
    registry_names = set()
    registry_names_raw = set()
    try:
        reg_table = dynamodb.Table(REGISTRY_TABLE)
        items = reg_table.scan().get("Items", [])
        for item in items:
            name = item.get("agent_name", "")
            if name and not name.startswith("_"):
                registry_names.add(_normalize(name))
                registry_names_raw.add(name)
    except ClientError as e:
        logger.warning(f"Failed to load registry: {e}")

    # Get eval configs
    configs = []
    try:
        resp = agentcore.list_online_evaluation_configs()
        configs = resp.get("onlineEvaluationConfigs", [])
        while resp.get("nextToken"):
            resp = agentcore.list_online_evaluation_configs(nextToken=resp["nextToken"])
            configs.extend(resp.get("onlineEvaluationConfigs", []))
    except (ClientError, AttributeError, Exception) as e:
        logger.error(f"Failed to list eval configs: {e}")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "detail": str(e)})}

    if not configs:
        logger.info("No eval configs found")
        return {"statusCode": 200, "body": json.dumps({"status": "ok", "signals_written": 0})}

    written = 0
    synced_keys = set()  # Track (agent_name, signal_key) pairs we've written
    start_time = now - timedelta(days=30)

    for cfg in configs:
        config_name = cfg.get("onlineEvaluationConfigName", "")
        config_id = cfg.get("onlineEvaluationConfigId", "")

        # Parse agent name and endpoint from config name
        agent_name, endpoint = _parse_config_name(config_name, registry_names_raw)

        # Skip if agent not in registry
        if registry_names and _normalize(agent_name) not in registry_names:
            logger.info(f"Skipping config {config_name} — agent {agent_name} not in registry")
            continue

        # Correct service name for CloudWatch metrics
        service_name = f"{agent_name}.{endpoint}"
        alarm_name = _make_alarm_name(agent_name, endpoint)
        summary_key = _make_signal_key("alarm_summary", endpoint)

        logger.info(f"Processing: config={config_name}, agent={agent_name}, endpoint={endpoint}, service={service_name}")

        # Write alarm_summary record
        try:
            alarm_state = "INSUFFICIENT_DATA"
            alarm_reason = ""
            alarm_updated = ""
            try:
                alarm_resp = cw.describe_alarms(AlarmNames=[alarm_name], AlarmTypes=["MetricAlarm"])
                alarms = alarm_resp.get("MetricAlarms", [])
                if alarms:
                    alarm_state = alarms[0].get("StateValue", "INSUFFICIENT_DATA")
                    alarm_reason = alarms[0].get("StateReason", "") if alarm_state == "ALARM" else ""
                    alarm_updated = alarms[0].get("StateUpdatedTimestamp", "")
                    if hasattr(alarm_updated, "isoformat"):
                        alarm_updated = alarm_updated.isoformat()
            except ClientError:
                pass

            sev = "critical" if alarm_state == "ALARM" else ("medium" if alarm_state == "INSUFFICIENT_DATA" else "low")
            table.put_item(Item={
                "agent_name": agent_name,
                "signal_key": summary_key,
                "endpoint": endpoint,
                "alarm_name": alarm_name,
                "alarm_state": alarm_state,
                "alarm_reason": alarm_reason,
                "alarm_updated_at": str(alarm_updated),
                "eval_config_id": config_id,
                "eval_config_name": config_name,
                "evaluator_count": len(EVALUATORS),
                "sampling_pct": "100.0",
                "severity": sev,
                "synced_at": now.isoformat(),
                "expires_at": expires_at,
            })
            synced_keys.add((agent_name, summary_key))
            written += 1
        except ClientError as e:
            logger.error(f"Failed to write alarm_summary for {agent_name}/{endpoint}: {e}")

        # Fetch all metrics in parallel
        fetch_tasks = []
        for ev in EVALUATORS:
            for label in ev["bad"]:
                fetch_tasks.append((ev["id"], label, service_name, True))
            for label in ev["good"]:
                fetch_tasks.append((ev["id"], label, service_name, False))

        eval_counts = {ev["id"]: {"bad": 0, "good": 0} for ev in EVALUATORS}

        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = [
                pool.submit(_fetch_metric, t[0], t[1], t[2], t[3], start_time, now)
                for t in fetch_tasks
            ]
            for future in as_completed(futures):
                ev_id, is_bad, count = future.result()
                if is_bad:
                    eval_counts[ev_id]["bad"] += count
                else:
                    eval_counts[ev_id]["good"] += count

        # Write per-evaluator records
        for ev in EVALUATORS:
            bad_count = eval_counts[ev["id"]]["bad"]
            good_count = eval_counts[ev["id"]]["good"]
            total_count = bad_count + good_count
            bad_pct = (bad_count / total_count * 100) if total_count > 0 else 0

            severity = _compute_severity(ev["id"], bad_count, bad_pct)
            bad_label = ev["bad"][0].lower()

            description = (
                f"{ev['id'].replace('Builtin.', '')}: {int(bad_count)} {bad_label} / {int(total_count)} total ({bad_pct:.1f}%)"
                if total_count > 0
                else f"{ev['id'].replace('Builtin.', '')}: waiting for data"
            )

            signal_key = _make_signal_key(ev["id"], endpoint)
            try:
                table.put_item(Item={
                    "agent_name": agent_name,
                    "signal_key": signal_key,
                    "endpoint": endpoint,
                    "evaluator_name": ev["id"].replace("Builtin.", ""),
                    "severity": severity,
                    "bad_count": int(bad_count),
                    "good_count": int(good_count),
                    "total_count": int(total_count),
                    "bad_pct": str(round(bad_pct, 1)),
                    "description": description,
                    "config_name": config_name,
                    "synced_at": now.isoformat(),
                    "expires_at": expires_at,
                })
                synced_keys.add((agent_name, signal_key))
                written += 1
            except ClientError as e:
                logger.error(f"Failed to write eval signal for {agent_name}/{ev['id']}/{endpoint}: {e}")

    # Cleanup: remove entries for agents/endpoints that no longer have eval configs
    removed = 0
    try:
        existing = table.scan().get("Items", [])
        for item in existing:
            key = (item.get("agent_name", ""), item.get("signal_key", ""))
            if key not in synced_keys:
                try:
                    table.delete_item(Key={"agent_name": item["agent_name"], "signal_key": item["signal_key"]})
                    removed += 1
                except ClientError:
                    pass
    except ClientError:
        pass

    logger.info(f"Eval poll complete: written={written}, configs={len(configs)}, removed={removed}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "ok",
            "signals_written": written,
            "configs_found": len(configs),
            "removed": removed,
        }),
    }
