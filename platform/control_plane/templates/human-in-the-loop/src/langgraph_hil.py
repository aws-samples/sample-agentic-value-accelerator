"""Human-in-the-Loop with LangGraph.

Uses interrupt() to pause graph execution and wait for human input.
Resume with Command(resume=value).

Reference: https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/
"""
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage


class State(TypedDict):
    request: str
    proposed_action: str
    approved: Optional[bool]
    result: str


model = ChatBedrockConverse(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0")


def plan_action(state: State) -> dict:
    response = model.invoke([HumanMessage(content=f"Plan an action for: {state['request']}. Describe what you would do.")])
    return {"proposed_action": response.content}


def request_approval(state: State) -> dict:
    # This pauses execution until human resumes
    decision = interrupt({
        "proposed_action": state["proposed_action"],
        "message": "Do you approve this action? Respond with {\"approved\": true/false}",
    })
    return {"approved": decision.get("approved", False)}


def execute_action(state: State) -> dict:
    if not state["approved"]:
        return {"result": "Action rejected by human."}
    return {"result": f"Executed: {state['proposed_action']}"}


builder = StateGraph(State)
builder.add_node("plan", plan_action)
builder.add_node("approve", request_approval)
builder.add_node("execute", execute_action)
builder.add_edge(START, "plan")
builder.add_edge("plan", "approve")
builder.add_edge("approve", "execute")
builder.add_edge("execute", END)

graph = builder.compile(checkpointer=InMemorySaver())

if __name__ == "__main__":
    config = {"configurable": {"thread_id": "demo-1"}}

    # First invoke — pauses at interrupt
    result = graph.invoke({"request": "Send a report to the team"}, config=config)
    print(f"Proposed: {result.get('proposed_action')}")
    print("Waiting for approval...")

    # Resume with approval
    final = graph.invoke(Command(resume={"approved": True}), config=config)
    print(f"Result: {final['result']}")
