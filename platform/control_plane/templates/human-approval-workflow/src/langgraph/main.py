"""Human approval workflow — interrupt/resume pattern for human-in-the-loop."""

import logging
from typing import TypedDict

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import Command, interrupt

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

llm = ChatBedrockConverse(
    model_id=config.MODEL_ID,
    region_name=config.AWS_REGION,
)


class ApprovalState(TypedDict):
    request: str
    proposed_action: str
    approved: bool
    result: str


def draft_node(state: ApprovalState) -> dict:
    """Draft a proposed action based on the user request."""
    response = llm.invoke([
        SystemMessage(content="Draft a proposed action for this request. Be specific about what will be done."),
        HumanMessage(content=state["request"]),
    ])
    return {"proposed_action": response.content}


def approval_node(state: ApprovalState) -> dict:
    """Pause execution and wait for human approval."""
    decision = interrupt({
        "proposed_action": state["proposed_action"],
        "message": "Please approve or reject this action.",
    })
    return {"approved": decision.get("approved", False)}


def execute_node(state: ApprovalState) -> dict:
    """Execute the approved action or report rejection."""
    if not state["approved"]:
        return {"result": "Action rejected by approver."}
    response = llm.invoke([
        SystemMessage(content="The action was approved. Confirm execution and summarize what was done."),
        HumanMessage(content=f"Execute: {state['proposed_action']}"),
    ])
    return {"result": response.content}


builder = StateGraph(ApprovalState)
builder.add_node("draft", draft_node)
builder.add_node("approval", approval_node)
builder.add_node("execute", execute_node)

builder.set_entry_point("draft")
builder.add_edge("draft", "approval")
builder.add_edge("approval", "execute")
builder.add_edge("execute", END)

graph = builder.compile(checkpointer=InMemorySaver())


@app.entrypoint
async def handler(payload: dict, context=None):
    """Two-phase handler: initial request pauses at approval, resume continues."""
    session_id = payload.get("session_id", "default")
    config_dict = {"configurable": {"thread_id": session_id}}

    # Resume flow: client sends approval decision
    if "approve" in payload:
        logger.info("Resuming with approval decision")
        try:
            result = await graph.ainvoke(
                Command(resume={"approved": payload["approve"]}),
                config=config_dict,
            )
            return {"result": result["result"], "approved": result["approved"]}
        except Exception as e:
            logger.exception("Resume error")
            return {"error": str(e)}

    # Initial flow: draft and pause at approval
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    logger.info("AgentCore invocation received")
    try:
        result = await graph.ainvoke(
            {"request": prompt, "proposed_action": "", "approved": False, "result": ""},
            config=config_dict,
        )
        return {
            "proposed_action": result.get("proposed_action", ""),
            "approval_status": "pending",
        }
    except Exception as e:
        logger.exception("Agent error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
