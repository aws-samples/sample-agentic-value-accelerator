"""Supervisor-specialists — manual supervisor graph with conditional routing."""

import logging
from typing import Annotated, TypedDict

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

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


@tool
def web_search(query: str) -> str:
    """Search the web for information."""
    return f"[Search results for: {query}] — Top results indicate relevant findings."


@tool
def write_document(content: str, title: str) -> str:
    """Write a document with the given content."""
    return f"Document '{title}' written successfully ({len(content)} chars)."


@tool
def analyze_data(data: str, analysis_type: str) -> str:
    """Analyze data with the specified analysis type."""
    return f"Analysis ({analysis_type}) complete. Key findings from data: patterns identified."


class SupervisorState(TypedDict):
    messages: Annotated[list, add_messages]
    next_specialist: str
    result: str


def router_node(state: SupervisorState) -> dict:
    """Classify intent and route to the appropriate specialist."""
    response = llm.invoke([
        SystemMessage(content=(
            "Classify the user request into exactly one category: 'researcher', 'writer', or 'analyst'. "
            "Respond with ONLY the category name, nothing else."
        )),
        state["messages"][-1],
    ])
    specialist = response.content.strip().lower()
    if specialist not in ("researcher", "writer", "analyst"):
        specialist = "researcher"
    return {"next_specialist": specialist}


def researcher_node(state: SupervisorState) -> dict:
    response = llm.bind_tools([web_search]).invoke([
        SystemMessage(content="You are a research specialist. Use web_search to find information."),
        *state["messages"],
    ])
    return {"result": response.content, "messages": [response]}


def writer_node(state: SupervisorState) -> dict:
    response = llm.bind_tools([write_document]).invoke([
        SystemMessage(content="You are a writing specialist. Create well-structured content."),
        *state["messages"],
    ])
    return {"result": response.content, "messages": [response]}


def analyst_node(state: SupervisorState) -> dict:
    response = llm.bind_tools([analyze_data]).invoke([
        SystemMessage(content="You are a data analyst. Analyze data and provide insights."),
        *state["messages"],
    ])
    return {"result": response.content, "messages": [response]}


def route_to_specialist(state: SupervisorState) -> str:
    return state["next_specialist"]


builder = StateGraph(SupervisorState)
builder.add_node("router", router_node)
builder.add_node("researcher", researcher_node)
builder.add_node("writer", writer_node)
builder.add_node("analyst", analyst_node)

builder.set_entry_point("router")
builder.add_conditional_edges("router", route_to_specialist, {
    "researcher": "researcher",
    "writer": "writer",
    "analyst": "analyst",
})
builder.add_edge("researcher", END)
builder.add_edge("writer", END)
builder.add_edge("analyst", END)

graph = builder.compile(checkpointer=InMemorySaver())


@app.entrypoint
async def handler(payload: dict, context=None):
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    session_id = payload.get("session_id", "default")
    config_dict = {"configurable": {"thread_id": session_id}}

    logger.info("AgentCore invocation received")
    try:
        result = await graph.ainvoke(
            {"messages": [HumanMessage(content=prompt)], "next_specialist": "", "result": ""},
            config=config_dict,
        )
        return {"response": result["result"], "specialist": result["next_specialist"]}
    except Exception as e:
        logger.exception("Agent error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
