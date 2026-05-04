#!/usr/bin/env python3
"""Publish a generated App Factory agent to AWS Agent Registry (preview).

Called from deploy.sh Phase 2c.5 after the AgentCore runtime is live.
Fetches the runtime's agent card, enriches metadata from the submission
record, and creates (or updates) a registry record.

Non-fatal on failure: registry publish is a discovery-layer feature, not
part of the deploy critical path. Warnings go to stdout; the caller ignores
exit code.
"""

import argparse
import json
import logging
import sys
import time
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("publish_to_registry")


def fetch_submission(table_name: str, submission_id: str, region: str) -> Optional[dict]:
    """Read the original questionnaire record from the backend's DynamoDB
    submissions table. Used to populate the agent card's name / description
    / tags from the business user's own words. Returns None on any error
    so registry publishing stays non-fatal."""
    if not table_name or not submission_id:
        return None
    try:
        ddb = boto3.resource("dynamodb", region_name=region)
        resp = ddb.Table(table_name).get_item(
            Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"}
        )
        return resp.get("Item")
    except ClientError as e:
        log.warning("Could not read submission %s: %s", submission_id, e)
        return None


def build_agent_card(
    runtime_arn: str,
    use_case_id: str,
    submission: Optional[dict],
    runtime_endpoint: Optional[str] = None,
) -> dict:
    """Build an A2A-compatible agent card for the deployed AgentCore runtime.

    AgentCore Runtime's `get_agent_card` API only works for A2A-native agents.
    Our Strands agents expose the AgentCore custom HTTP invoke protocol, so we
    construct an A2A card describing the agent ourselves using the submission
    metadata + runtime ARN.

    Reference: https://google.github.io/A2A/specification/#agent-card
    """
    sub = submission or {}
    use_case_name = (sub.get("use_case_name") or use_case_id.replace("_", " ").title()).strip()
    description = (
        (sub.get("problem") or "").strip()[:1024]
        or f"App Factory generated agent for {use_case_id}"
    )
    domain = (sub.get("domain") or "unknown").strip()

    # URL points at the invoke endpoint if we have one; otherwise the ARN
    # itself (consumers can resolve it to the runtime via describe_agent_runtime).
    card_url = runtime_endpoint or runtime_arn

    # Derive a primary skill from the use case — the runtime exposes one
    # main orchestrator method (e.g., run_assessment / process / review).
    skill = {
        "id": f"{use_case_id}.run",
        "name": f"{use_case_name}",
        "description": description,
        "tags": [domain.lower().replace(" ", "-"), "fsi", "strands", "app-factory"],
    }

    return {
        "name": use_case_name,
        "description": description,
        "url": card_url,
        "version": "1.0.0",
        "protocolVersion": "0.3.0",
        "provider": {
            "organization": "AVA App Factory",
            "url": "https://aws.amazon.com/bedrock/agentcore/",
        },
        "capabilities": {},
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [skill],
    }


def build_a2a_descriptor(agent_card: dict) -> dict:
    """Shape the card for create_registry_record (descriptorType=A2A).

    Schema: descriptors = {"a2a": {"agentCard": {schemaVersion, inlineContent}}}
    """
    return {
        "a2a": {
            "agentCard": {
                "schemaVersion": "0.3",
                "inlineContent": json.dumps(agent_card),
            }
        }
    }


def _submit_for_approval_with_retry(client, registry_arn: str, record_arn: str) -> bool:
    """CreateRegistryRecord is async; the record sits in CREATING for a few
    seconds before it can be submitted. Retry with backoff until ConflictException
    clears or we give up.
    """
    for attempt in range(8):
        try:
            client.submit_registry_record_for_approval(
                registryId=registry_arn, recordId=record_arn,
            )
            log.info("Submitted record %s for approval (attempt %d)", record_arn, attempt + 1)
            return True
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "ConflictException":
                time.sleep(3)
                continue
            log.warning("submit_for_approval non-retriable: %s", e)
            return False
    log.warning("submit_for_approval exhausted retries for %s", record_arn)
    return False


def find_existing_record(client, registry_arn: str, record_name: str) -> Optional[dict]:
    """Scan the registry for a record with the given name.

    boto3's paginator is not yet defined for list_registry_records (as of
    v1.42.x), so we page manually with nextToken.
    """
    try:
        next_token: Optional[str] = None
        while True:
            kwargs = {"registryId": registry_arn}
            if next_token:
                kwargs["nextToken"] = next_token
            resp = client.list_registry_records(**kwargs)
            for rec in resp.get("registryRecords") or resp.get("records") or []:
                if rec.get("name") == record_name:
                    return rec
            next_token = resp.get("nextToken")
            if not next_token:
                break
    except ClientError as e:
        log.warning("list_registry_records failed: %s", e)
    return None


def publish(args) -> dict:
    """Create-or-update the agent-registry record for this deployment.

    Looks up an existing `app-factory-<use_case_id>` record via
    list_registry_records (paginated manually — the boto3 paginator is
    not defined for the preview API). If found, calls update_registry_record;
    otherwise calls create_registry_record with descriptorType='A2A'.
    Either way, follows with _submit_for_approval_with_retry. Returns a
    summary dict for the deploy.sh to log."""
    region = args.region
    registry_arn = args.registry_arn
    runtime_arn = args.runtime_arn
    use_case_id = args.use_case_id
    record_name = f"app-factory-{use_case_id}"

    submission = fetch_submission(args.app_factory_table, args.submission_id, region)
    card = build_agent_card(
        runtime_arn=runtime_arn,
        use_case_id=use_case_id,
        submission=submission,
        runtime_endpoint=args.runtime_endpoint or None,
    )
    descriptors = build_a2a_descriptor(card)
    description = (
        (submission or {}).get("problem", "").strip()[:512]
        or f"App Factory generated agent for {use_case_id}"
    )

    control = boto3.client("bedrock-agentcore-control", region_name=region)

    existing = find_existing_record(control, registry_arn, record_name)
    if existing:
        record_arn = existing["recordArn"]
        new_version = f"v{int(__import__('time').time())}"
        log.info("Updating existing record %s -> %s", record_arn, new_version)
        control.update_registry_record(
            recordId=record_arn,
            description=description,
            descriptors=descriptors,
            recordVersion=new_version,
        )
        _submit_for_approval_with_retry(control, registry_arn, record_arn)
        return {"registry_record_arn": record_arn, "registry_record_version": new_version}

    log.info("Creating new record %s in registry %s", record_name, registry_arn)
    create_resp = control.create_registry_record(
        registryId=registry_arn,
        name=record_name,
        description=description,
        descriptorType="A2A",
        descriptors=descriptors,
        recordVersion="v1",
    )
    record_arn = create_resp["recordArn"]
    _submit_for_approval_with_retry(control, registry_arn, record_arn)
    return {"registry_record_arn": record_arn, "registry_record_version": "v1"}


def main():
    """CLI entrypoint. Parses required flags (registry-arn, runtime-arn,
    use-case-id, region, output-json) + optional submission / table /
    endpoint, calls publish(), and writes the resulting record ARN to
    the output-json path for deploy.sh to read."""
    p = argparse.ArgumentParser()
    p.add_argument("--registry-arn", required=True)
    p.add_argument("--runtime-arn", required=True)
    p.add_argument("--use-case-id", required=True)
    p.add_argument("--submission-id", default="")
    p.add_argument("--app-factory-table", default="")
    p.add_argument("--runtime-endpoint", default="", help="Optional HTTPS endpoint to list as the A2A card URL (defaults to runtime ARN).")
    p.add_argument("--region", required=True)
    p.add_argument("--output-json", required=True)
    args = p.parse_args()

    try:
        result = publish(args)
        with open(args.output_json, "w") as f:
            json.dump({k: {"value": v} for k, v in result.items()}, f)
        log.info("Published: %s", result)
        return 0
    except Exception as e:
        log.warning("Publish failed: %s", e)
        with open(args.output_json, "w") as f:
            json.dump({}, f)
        return 1


if __name__ == "__main__":
    sys.exit(main())
