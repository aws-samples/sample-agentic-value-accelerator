"""Session Reporter — DynamoDB heartbeat for stateless agent sessions.

Used by stateless agents to report session activity to DynamoDB.
The dashboard reads this table to show active/idle/terminated sessions.
"""

import logging
import os
import threading
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
REGION = os.environ.get("AWS_REGION", "us-east-1")
SESSION_TABLE = os.environ.get("SESSION_TABLE", "session-token-usage")
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", "180"))
TTL_HOURS = 24
_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb", region_name=REGION).Table(SESSION_TABLE)
    return _table


def report_session_start(session_id: str, agent_name: str, agent_runtime_arn: str = "") -> None:
    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + (TTL_HOURS * 3600)
    try:
        _get_table().put_item(Item={
            "session_id": session_id, "agent_name": agent_name,
            "agent_runtime_arn": agent_runtime_arn, "status": "active",
            "started_at": now.isoformat(), "last_heartbeat": now.isoformat(),
            "input_tokens": 0, "output_tokens": 0, "invocation_count": 0,
            "expires_at": expires_at,
        })
    except ClientError as e:
        logger.warning(f"Failed to report session start: {e}")


def report_heartbeat(session_id: str, metrics: dict | None = None) -> None:
    now = datetime.now(timezone.utc)
    m = metrics or {}
    try:
        update_expr = "SET last_heartbeat = :hb, expires_at = :exp, #st = :status"
        vals = {":hb": now.isoformat(), ":exp": int(now.timestamp()) + (TTL_HOURS * 3600), ":status": "active"}
        names = {"#st": "status"}
        if "input_tokens" in m:
            update_expr += ", input_tokens = :it"
            vals[":it"] = m["input_tokens"]
        if "output_tokens" in m:
            update_expr += ", output_tokens = :ot"
            vals[":ot"] = m["output_tokens"]
        if "invocation_count" in m:
            update_expr += ", invocation_count = :ic"
            vals[":ic"] = m["invocation_count"]
        _get_table().update_item(
            Key={"session_id": session_id}, UpdateExpression=update_expr,
            ExpressionAttributeValues=vals, ExpressionAttributeNames=names,
        )
    except ClientError as e:
        logger.warning(f"Failed to send heartbeat: {e}")


def report_session_end(session_id: str) -> None:
    now = datetime.now(timezone.utc)
    try:
        _get_table().update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET #st = :status, last_heartbeat = :hb, expires_at = :exp",
            ExpressionAttributeValues={
                ":status": "completed", ":hb": now.isoformat(),
                ":exp": int(now.timestamp()) + (TTL_HOURS * 3600),
            },
            ExpressionAttributeNames={"#st": "status"},
        )
    except ClientError as e:
        logger.warning(f"Failed to report session end: {e}")


class HeartbeatThread:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self._stop_event = threading.Event()
        self._thread = None
        self._metrics = {"input_tokens": 0, "output_tokens": 0, "invocation_count": 0}

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        while not self._stop_event.wait(HEARTBEAT_INTERVAL):
            report_heartbeat(self.session_id, self._metrics)

    def update_metrics(self, input_tokens: int = 0, output_tokens: int = 0):
        self._metrics["input_tokens"] += input_tokens
        self._metrics["output_tokens"] += output_tokens
        self._metrics["invocation_count"] += 1

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        report_session_end(self.session_id)
