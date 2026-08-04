import json
import logging
import boto3
from strands import Agent, tool
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands.models.bedrock import BedrockModel

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = BedrockAgentCoreApp()
model = BedrockModel(model_id="amazon.nova-pro-v1:0")
s3 = boto3.client("s3")


@tool
def read_s3_file(bucket: str, key: str) -> str:
    """Read a regulatory report file from S3 and return its contents."""
    resp = s3.get_object(Bucket=bucket, Key=key)
    return resp["Body"].read().decode("utf-8", errors="replace")[:50000]


agent = Agent(
    model=model,
    tools=[read_s3_file],
    system_prompt="""You are a Senior Regulatory Compliance Reviewer for a financial institution.
When given a file location, read it using the read_s3_file tool, then review it for:
1. Completeness — are all required sections and fields present?
2. Language compliance — is regulatory terminology used correctly? Any vague or informal language?
3. Quality — is the report clear, internally consistent, and ready for submission?

Provide a structured JSON response with:
{
  "report_type": "detected type (sar/ctr/sec_10k/other)",
  "completeness_score": 0-100,
  "missing_sections": [],
  "missing_fields": [],
  "language_score": 0-100,
  "language_issues": [],
  "language_suggestions": [],
  "quality_score": 0-100,
  "quality_level": "pass|needs_revision|fail",
  "strengths": [],
  "revisions": [],
  "summary": "executive summary"
}""",
)


@app.entrypoint
def invoke(payload):
    prompt = payload.get("prompt", json.dumps(payload))
    result = agent(prompt)
    logger.info(json.dumps({"agent_response": result.message, "prompt": prompt}))
    return {"message": result.message}


if __name__ == "__main__":
    app.run()
