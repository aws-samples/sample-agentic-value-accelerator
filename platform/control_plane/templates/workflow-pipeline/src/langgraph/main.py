"""Workflow pipeline — linear graph: classify, extract, validate, summarize."""

import logging
from typing import TypedDict

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

llm = ChatBedrockConverse(
    model_id=config.MODEL_ID,
    region_name=config.AWS_REGION,
    temperature=config.TEMPERATURE,
    max_tokens=config.MAX_TOKENS,
)


class PipelineState(TypedDict):
    document_text: str
    document_type: str
    extracted_fields: str
    validation_result: str
    summary: str


def classify_node(state: PipelineState) -> dict:
    response = llm.invoke([
        SystemMessage(content="Classify this document type (e.g., invoice, contract, report, letter). Respond with only the type."),
        HumanMessage(content=state["document_text"][:2000]),
    ])
    return {"document_type": response.content.strip()}


def extract_node(state: PipelineState) -> dict:
    response = llm.invoke([
        SystemMessage(content=f"Extract key fields from this {state['document_type']}. List them as key: value pairs."),
        HumanMessage(content=state["document_text"]),
    ])
    return {"extracted_fields": response.content}


def validate_node(state: PipelineState) -> dict:
    response = llm.invoke([
        SystemMessage(content="Validate the extracted fields for completeness and consistency. Note any issues."),
        HumanMessage(content=f"Document type: {state['document_type']}\nFields:\n{state['extracted_fields']}"),
    ])
    return {"validation_result": response.content}


def summarize_node(state: PipelineState) -> dict:
    response = llm.invoke([
        SystemMessage(content="Provide a brief summary of this document based on the analysis."),
        HumanMessage(content=f"Type: {state['document_type']}\nFields: {state['extracted_fields']}\nValidation: {state['validation_result']}"),
    ])
    return {"summary": response.content}


builder = StateGraph(PipelineState)
builder.add_node("classify", classify_node)
builder.add_node("extract", extract_node)
builder.add_node("validate", validate_node)
builder.add_node("summarize", summarize_node)

builder.set_entry_point("classify")
builder.add_edge("classify", "extract")
builder.add_edge("extract", "validate")
builder.add_edge("validate", "summarize")
builder.add_edge("summarize", END)

graph = builder.compile()


@app.entrypoint
async def handler(payload: dict, context=None):
    document = payload.get("document", "")
    if not document:
        return {"error": "document is required"}

    logger.info("AgentCore invocation received")
    try:
        result = await graph.ainvoke({
            "document_text": document,
            "document_type": "",
            "extracted_fields": "",
            "validation_result": "",
            "summary": "",
        })
        return {
            "summary": result["summary"],
            "document_type": result["document_type"],
            "extracted_fields": result["extracted_fields"],
            "validation_result": result["validation_result"],
        }
    except Exception as e:
        logger.exception("Pipeline error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
