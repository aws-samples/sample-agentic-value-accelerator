"""Research report generator — ReAct agent with Knowledge Base retrieval tool."""

import logging

import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain_aws import ChatBedrockConverse
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from . import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

bedrock_agent_runtime = boto3.client("bedrock-agent-runtime", region_name=config.AWS_REGION)


@tool
def retrieve_from_knowledge_base(query: str) -> str:
    """Retrieve relevant documents from the Bedrock Knowledge Base."""
    if not config.KNOWLEDGE_BASE_ID:
        return "Knowledge Base not configured. Provide KNOWLEDGE_BASE_ID env var."
    try:
        response = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=config.KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": query},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 5}},
        )
        results = []
        for item in response.get("retrievalResults", []):
            text = item.get("content", {}).get("text", "")
            uri = item.get("location", {}).get("s3Location", {}).get("uri", "")
            results.append(f"[Source: {uri}]\n{text}")
        return "\n\n---\n\n".join(results) if results else "No relevant documents found."
    except Exception as e:
        return f"Retrieval error: {e}"


llm = ChatBedrockConverse(
    model_id=config.MODEL_ID,
    region_name=config.AWS_REGION,
)

graph = create_react_agent(
    llm,
    tools=[retrieve_from_knowledge_base],
    prompt="You are a research assistant. Use the knowledge base tool to find information, then synthesize a comprehensive response with citations.",
)


@app.entrypoint
async def handler(payload: dict, context=None):
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    report_format = payload.get("report_format", False)
    query = f"Write a detailed research report on: {prompt}" if report_format else prompt

    logger.info("AgentCore invocation received")
    try:
        result = await graph.ainvoke({"messages": [("user", query)]})
        return {"response": result["messages"][-1].content}
    except Exception as e:
        logger.exception("Agent error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
