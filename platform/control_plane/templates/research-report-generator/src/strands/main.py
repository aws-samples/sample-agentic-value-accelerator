"""Research report generator agent server (Strands SDK).

RAG agent with Bedrock Knowledge Base retrieval and citation support.
"""

import logging

import boto3
from botocore.exceptions import ClientError
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel
from strands.agent.conversation_manager import SlidingWindowConversationManager

from . import config

logger = logging.getLogger(__name__)
logging.basicConfig(level=config.LOG_LEVEL)

app = BedrockAgentCoreApp()

_kb_client = None


def get_kb_client():
    global _kb_client
    if _kb_client is None:
        _kb_client = boto3.client("bedrock-agent-runtime", region_name=config.AWS_REGION)
    return _kb_client


@tool
def knowledge_base_search(query: str, num_results: int = 5) -> str:
    """Search the knowledge base for relevant documents.

    Args:
        query: The search query
        num_results: Number of results to return (1-10)
    """
    if not config.KNOWLEDGE_BASE_ID:
        return "Error: KNOWLEDGE_BASE_ID not configured."
    try:
        response = get_kb_client().retrieve(
            knowledgeBaseId=config.KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": query},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": min(num_results, 10)}},
        )
    except ClientError as e:
        logger.error("KB search failed: %s", e)
        return f"Error: {e.response['Error']['Message']}"

    results = []
    for i, r in enumerate(response.get("retrievalResults", []), 1):
        text = r.get("content", {}).get("text", "")
        source = r.get("location", {}).get("s3Location", {}).get("uri", "unknown")
        results.append(f"[{i}] Source: {source}\n{text}")
    return "\n\n---\n\n".join(results) if results else "No relevant documents found."


SYSTEM_PROMPT = """You are a research assistant with access to a knowledge base.
Always search the knowledge base before answering.
Cite sources using [Source: ...] format.
If no documents are found, say so clearly."""

agent = Agent(
    model=BedrockModel(model_id=config.MODEL_ID, region_name=config.AWS_REGION, temperature=0.3, max_tokens=4096),
    system_prompt=SYSTEM_PROMPT,
    tools=[knowledge_base_search],
    conversation_manager=SlidingWindowConversationManager(window_size=config.MEMORY_WINDOW_SIZE),
)


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations."""
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    if payload.get("report_format"):
        prompt = f"Generate a structured research report on: {prompt}"

    logger.info("AgentCore invocation received")
    result = agent(prompt)
    return {"response": result.message}


if __name__ == "__main__":
    app.run()
