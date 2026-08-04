"""Plan-execute agent — custom StateGraph with plan/execute/summarize nodes."""

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
    temperature=config.TEMPERATURE,
    max_tokens=config.MAX_TOKENS,
)


class PlanExecuteState(TypedDict):
    goal: str
    plan: list[str]
    current_step: int
    results: list[str]
    final_answer: str


def plan_node(state: PlanExecuteState) -> dict:
    """Create a step-by-step plan for the goal."""
    response = llm.invoke([
        SystemMessage(content=(
            "Create a concise plan to accomplish the goal. "
            "Respond with a JSON array of step strings. Example: [\"step 1\", \"step 2\"]. "
            "Keep it to 3-5 steps max. Output ONLY the JSON array."
        )),
        HumanMessage(content=f"Goal: {state['goal']}"),
    ])
    try:
        plan = json.loads(response.content)
    except json.JSONDecodeError:
        plan = [state["goal"]]
    return {"plan": plan, "current_step": 0, "results": []}


def execute_node(state: PlanExecuteState) -> dict:
    """Execute the current step."""
    step = state["plan"][state["current_step"]]
    response = llm.invoke([
        SystemMessage(content="Execute this step concisely. Provide the result directly."),
        HumanMessage(content=f"Goal: {state['goal']}\nCurrent step: {step}"),
    ])
    results = state["results"] + [response.content]
    return {"results": results, "current_step": state["current_step"] + 1}


def summarize_node(state: PlanExecuteState) -> dict:
    """Summarize all step results into a final answer."""
    steps_summary = "\n".join(
        f"Step {i+1}: {s}\nResult: {r}" for i, (s, r) in enumerate(zip(state["plan"], state["results"]))
    )
    response = llm.invoke([
        SystemMessage(content="Synthesize the step results into a final comprehensive answer."),
        HumanMessage(content=f"Goal: {state['goal']}\n\n{steps_summary}"),
    ])
    return {"final_answer": response.content}


def should_continue(state: PlanExecuteState) -> str:
    if state["current_step"] < len(state["plan"]):
        return "execute"
    return "summarize"


builder = StateGraph(PlanExecuteState)
builder.add_node("plan", plan_node)
builder.add_node("execute", execute_node)
builder.add_node("summarize", summarize_node)

builder.set_entry_point("plan")
builder.add_conditional_edges("plan", should_continue, {"execute": "execute", "summarize": "summarize"})
builder.add_conditional_edges("execute", should_continue, {"execute": "execute", "summarize": "summarize"})
builder.add_edge("summarize", END)

graph = builder.compile()


@app.entrypoint
async def handler(payload: dict, context=None):
    goal = payload.get("goal", "")
    if not goal:
        return {"error": "goal is required"}

    logger.info("AgentCore invocation received: %s", goal[:100])
    try:
        result = await graph.ainvoke({
            "goal": goal,
            "plan": [],
            "current_step": 0,
            "results": [],
            "final_answer": "",
        })
        return {
            "result": result["final_answer"],
            "steps": [{"action": s, "result": r} for s, r in zip(result["plan"], result["results"])],
        }
    except Exception as e:
        logger.exception("Agent error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
