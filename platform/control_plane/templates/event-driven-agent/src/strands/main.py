"""Event-driven agent server (Strands SDK).

Stateless agent that processes events based on type (S3, scheduled, webhook).
Returns processing result directly.
"""

import json
import logging

import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

s3_client = boto3.client("s3", region_name=config.AWS_REGION)


@tool
def read_s3_object(bucket: str, key: str) -> str:
    """Read a text object from S3 and return its content.

    Args:
        bucket: S3 bucket name.
        key: Object key path.
    """
    response = s3_client.get_object(Bucket=bucket, Key=key)
    return response["Body"].read().decode("utf-8")


@tool
def store_result(bucket: str, key: str, content: str) -> str:
    """Store processing result as a JSON object in S3.

    Args:
        bucket: Target S3 bucket name.
        key: Object key path for the result.
        content: Content to store.
    """
    s3_client.put_object(Bucket=bucket, Key=key, Body=content, ContentType="application/json")
    return f"Stored result to s3://{bucket}/{key}"


agent = Agent(
    model=BedrockModel(model_id=config.MODEL_ID, region_name=config.AWS_REGION),
    system_prompt="""You are an event-driven processing agent. You receive events and process them.

For S3 upload events: read the uploaded object, summarize its content, and store the summary.
For scheduled events: generate the requested report or analysis.
For webhook events: process the payload and produce a structured result.

Always produce a concise JSON result with keys: summary, action_taken, output_location (if stored).""",
    tools=[read_s3_object, store_result],
)


def classify_event(event: dict) -> str:
    """Determine event type from payload."""
    source = event.get("source", "")
    detail_type = event.get("detail-type", "")
    if source == "aws.s3" and "Object Created" in detail_type:
        return "s3_upload"
    if source == "aws.events" or detail_type == "Scheduled Event":
        return "scheduled"
    return "webhook"


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations. Payload is the event itself."""
    event_type = classify_event(payload)
    logger.info("Processing event: %s", event_type)

    prompt = f"Process this {event_type} event:\n{json.dumps(payload, indent=2)}"
    if event_type == "s3_upload" and config.RESULT_BUCKET:
        key = payload.get("detail", {}).get("object", {}).get("key", "unknown")
        prompt += f"\n\nStore the result in bucket '{config.RESULT_BUCKET}' with key 'results/{key}.json'."

    result = agent(prompt)
    return {"event_type": event_type, "result": result.message}


if __name__ == "__main__":
    app.run()
