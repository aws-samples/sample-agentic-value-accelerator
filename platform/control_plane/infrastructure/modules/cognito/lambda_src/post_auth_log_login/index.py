"""Cognito PostAuthentication trigger: append a login event to DynamoDB.

Runs after every successful sign-in (any client — SPA, CLI, direct API).
Writes one row per login so an auditor can answer "who signed in and when".

Two access patterns are supported by the target table:
  * Per-user history — Query pk = USER#<sub>
  * Per-day report   — Query GSI by_date (event_date = YYYY-MM-DD)

Failures are logged but never re-raised — a write hiccup here must not
block a legitimate user from signing in.
"""
import json
import logging
import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

log = logging.getLogger()
log.setLevel(logging.INFO)

TABLE_NAME = os.environ["LOGIN_EVENTS_TABLE"]
_ddb = boto3.resource("dynamodb").Table(TABLE_NAME)


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def handler(event, _context):
    try:
        now = _iso_now()
        event_date = now[:10]  # YYYY-MM-DD
        event_id = str(uuid.uuid4())

        user_attrs = (event.get("request") or {}).get("userAttributes") or {}
        ctx = (event.get("request") or {}).get("userContextData") or {}
        caller = event.get("callerContext") or {}

        item = {
            "pk": f"USER#{user_attrs.get('sub') or event.get('userName') or 'unknown'}",
            "sk": f"{now}#{event_id}",
            "event_id": event_id,
            "event_type": "LOGIN_SUCCESS",
            "event_time": now,
            "event_date": event_date,
            "user_pool_id": event.get("userPoolId"),
            "user_name": event.get("userName"),
            "user_sub": user_attrs.get("sub"),
            "user_email": user_attrs.get("email"),
            "email_verified": user_attrs.get("email_verified"),
            "region": event.get("region"),
            "client_id": caller.get("clientId"),
            "source_ip": ctx.get("ipAddress"),
            "encoded_data": ctx.get("encodedData"),  # Advanced Security fingerprint blob
            "trigger_source": event.get("triggerSource"),
        }
        # Drop None values so DDB doesn't store empty attributes.
        item = {k: v for k, v in item.items() if v is not None}

        _ddb.put_item(Item=item)
        log.info("Logged login for %s at %s", item["user_email"], now)
    except ClientError as e:
        # Never fail the sign-in over an audit-write hiccup — log and move on.
        log.error("Failed to write login event: %s", e.response["Error"]["Code"])
    except Exception:  # noqa: BLE001
        log.exception("Unexpected error writing login event")

    return event
