"""Event-driven agent — simple graph: classify_event, process, END. Stateless."""

import json
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
)


class EventState(TypedDict):
    event_payload: dict
    event_type: str
    classification: str
    processing_result: str


def classify_event_node(state: EventState) -> dict:
    """Classify the incoming event."""
    event_type = state["event_payload"].get("detail-type", "unknown")
    source = state["event_payload"].get("source", "unknown")
    response = llm.invoke([
        SystemMessage(content="Classify this event into a category (e.g., data_change, scheduled, notification, error). Respond with only the category."),
        HumanMessage(content=f"Event type: {event_type}\nSource: {source}"),
    ])
    return {"event_type": event_type, "classification": response.content.strip()}


def process_node(state: EventState) -> dict:
    """Process the event based on its classification."""
    detail = json.dumps(state["event_payload"].get("detail", {}), default=str)[:2000]
    response = llm.invoke([
        SystemMessage(content=f"Process this {state['classification']} event. Summarize what happened and any actions taken."),
        HumanMessage(content=f"Event: {state['event_type']}\nDetail: {detail}"),
    ])
    return {"processing_result": response.content}


builder = StateGraph(EventState)
builder.add_node("classify_event", classify_event_node)
builder.add_node("process", process_node)

builder.set_entry_point("classify_event")
builder.add_edge("classify_event", "process")
builder.add_edge("process", END)

graph = builder.compile()


@app.entrypoint
async def handler(payload: dict, context=None):
    event_type = payload.get("detail-type", "unknown")
    logger.info("AgentCore event received: %s", event_type)

    try:
        result = await graph.ainvoke({
            "event_payload": payload,
            "event_type": "",
            "classification": "",
            "processing_result": "",
        })
        return {
            "event_type": result["event_type"],
            "classification": result["classification"],
            "processing_result": result["processing_result"],
        }
    except Exception as e:
        logger.exception("Event processing error")
        return {"event_type": event_type, "error": str(e)}


if __name__ == "__main__":
    app.run()
