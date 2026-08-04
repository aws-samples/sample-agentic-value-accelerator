"""Multi-Agent: Supervisor Pattern (LangGraph).

A router node classifies requests and routes to specialist nodes.

Reference: https://github.com/langchain-ai/langgraph/tree/main/examples/multi_agent
"""
from typing import Literal
from langgraph.graph import StateGraph, START, END, MessagesState
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage

model = ChatBedrockConverse(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0")


def router(state: MessagesState) -> dict:
    response = model.invoke([
        SystemMessage(content="Classify this request. Respond with ONLY one word: researcher or writer"),
        *state["messages"],
    ])
    return {"messages": [response]}


def researcher(state: MessagesState) -> dict:
    response = model.invoke([
        SystemMessage(content="You are a research specialist."),
        *state["messages"],
    ])
    return {"messages": [response]}


def writer(state: MessagesState) -> dict:
    response = model.invoke([
        SystemMessage(content="You are a writing specialist."),
        *state["messages"],
    ])
    return {"messages": [response]}


def route_decision(state: MessagesState) -> Literal["researcher", "writer"]:
    last = state["messages"][-1].content.strip().lower()
    return "researcher" if "research" in last else "writer"


builder = StateGraph(MessagesState)
builder.add_node("router", router)
builder.add_node("researcher", researcher)
builder.add_node("writer", writer)
builder.add_edge(START, "router")
builder.add_conditional_edges("router", route_decision, ["researcher", "writer"])
builder.add_edge("researcher", END)
builder.add_edge("writer", END)

graph = builder.compile()

if __name__ == "__main__":
    result = graph.invoke({"messages": [HumanMessage(content="Research AI trends")]})
    print(result["messages"][-1].content)
