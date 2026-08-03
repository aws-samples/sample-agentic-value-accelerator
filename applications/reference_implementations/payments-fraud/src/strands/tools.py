"""Data-access tools for the payments-fraud specialist agents.

These are thin Strands @tool wrappers over the app's data stores (DynamoDB tables
and an S3 sample-data bucket, named via config / Terraform). They degrade
gracefully: when a table/bucket env var is unset (e.g. local dev before infra is
deployed), the tool returns a clear JSON message rather than raising, so agents
stay invokable.

All tools return JSON strings — the Strands convention for tool output.
"""

import json
import logging

import boto3
from botocore.exceptions import ClientError

from . import config

logger = logging.getLogger(__name__)

try:
    from strands import tool
except ImportError:  # allow importing this module without strands installed (e.g. contract tests)
    def tool(fn):  # type: ignore
        return fn


def _ddb_table(name: str):
    return boto3.resource("dynamodb", region_name=config.AWS_REGION).Table(name)


def _not_configured(what: str) -> str:
    return json.dumps({
        "error": "not_configured",
        "detail": f"{what} is not configured (no infra deployed yet). "
                  "Returning empty result so the agent can proceed.",
        "data": None,
    })


@tool
def get_account_profile(account_id: str) -> str:
    """Retrieve an account/customer profile (risk profile, KYC, account type).

    Args:
        account_id: The account identifier, e.g. 'A705'.

    Returns:
        JSON string with the account profile, or an error envelope.
    """
    if not config.CASES_TABLE and not config.DATA_BUCKET:
        return _not_configured("account profile store")
    try:
        if config.DATA_BUCKET:
            s3 = boto3.client("s3", region_name=config.AWS_REGION)
            key = f"{config.DATA_PREFIX}/{account_id}/profile.json"
            body = s3.get_object(Bucket=config.DATA_BUCKET, Key=key)["Body"].read()
            return body.decode("utf-8")
        return _not_configured("account profile store")
    except ClientError as e:
        logger.warning("get_account_profile failed for %s: %s", account_id, e)
        return json.dumps({"error": str(e), "account_id": account_id})


@tool
def get_transactions(account_id: str, limit: int = 100) -> str:
    """Retrieve recent transactions for an account, newest first.

    Args:
        account_id: The originating account identifier.
        limit: Maximum number of transactions to return (default 100).

    Returns:
        JSON string with a list of transaction records, or an error envelope.
    """
    if not config.TXN_TABLE:
        return _not_configured("transactions table")
    try:
        resp = _ddb_table(config.TXN_TABLE).query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("account_id").eq(account_id),
            ScanIndexForward=False,
            Limit=limit,
        )
        return json.dumps({"account_id": account_id, "transactions": resp.get("Items", [])}, default=str)
    except ClientError as e:
        logger.warning("get_transactions failed for %s: %s", account_id, e)
        return json.dumps({"error": str(e), "account_id": account_id})


@tool
def get_counterparty_links(account_id: str) -> str:
    """Find accounts linked to this account by shared counterparties or transfers.

    Useful for mule-network and fan-in/fan-out investigation: surfaces which other
    accounts send to or receive from the same destinations.

    Args:
        account_id: The account to expand links from.

    Returns:
        JSON string with linked account ids and the shared counterparties, or an
        error envelope.
    """
    if not config.TXN_TABLE:
        return _not_configured("transactions table")
    # Network expansion is a derived query; until the GSI is provisioned by infra,
    # return an explicit empty result so the investigation agent can note the gap.
    return json.dumps({
        "account_id": account_id,
        "linked_accounts": [],
        "note": "counterparty-link GSI not yet provisioned",
    })


@tool
def get_case(case_id: str) -> str:
    """Retrieve an existing investigation case, including prior findings and evidence.

    Args:
        case_id: The case identifier.

    Returns:
        JSON string with the case record, or an error envelope.
    """
    if not config.CASES_TABLE:
        return _not_configured("cases table")
    try:
        resp = _ddb_table(config.CASES_TABLE).get_item(Key={"case_id": case_id})
        return json.dumps(resp.get("Item") or {"error": "not_found", "case_id": case_id}, default=str)
    except ClientError as e:
        logger.warning("get_case failed for %s: %s", case_id, e)
        return json.dumps({"error": str(e), "case_id": case_id})


__all__ = ["get_account_profile", "get_transactions", "get_counterparty_links", "get_case"]
