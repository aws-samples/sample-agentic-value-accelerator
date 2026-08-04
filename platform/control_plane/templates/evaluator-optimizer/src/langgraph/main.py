"""Evaluator-optimizer — loop graph: generate, evaluate, conditional (loop or END)."""

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


class EvalState(TypedDict):
    goal: str
    criteria: str
    current_draft: str
    score: int
    feedback: str
    iteration: int
    max_iterations: int
    threshold: int


def generate_node(state: EvalState) -> dict:
    """Generate or improve content based on feedback."""
    if state["current_draft"] and state["feedback"]:
        prompt = f"Improve this draft based on feedback.\n\nDraft:\n{state['current_draft']}\n\nFeedback:\n{state['feedback']}"
    else:
        prompt = f"Create content for: {state['goal']}"
        if state["criteria"]:
            prompt += f"\n\nCriteria: {state['criteria']}"

    response = llm.invoke([
        SystemMessage(content="You are a content creator. Produce high-quality output."),
        HumanMessage(content=prompt),
    ])
    return {"current_draft": response.content, "iteration": state["iteration"] + 1}


def evaluate_node(state: EvalState) -> dict:
    """Evaluate the draft and provide a score (1-5) and feedback."""
    response = llm.invoke([
        SystemMessage(content=(
            "Evaluate this content on a scale of 1-5. Respond in JSON: "
            '{"score": N, "feedback": "..."}'
        )),
        HumanMessage(content=f"Goal: {state['goal']}\n\nContent:\n{state['current_draft']}"),
    ])
    try:
        evaluation = json.loads(response.content)
        return {"score": int(evaluation["score"]), "feedback": evaluation.get("feedback", "")}
    except (json.JSONDecodeError, KeyError):
        return {"score": 3, "feedback": "Could not parse evaluation."}


def should_loop(state: EvalState) -> str:
    if state["score"] >= state["threshold"] or state["iteration"] >= state["max_iterations"]:
        return "done"
    return "generate"


builder = StateGraph(EvalState)
builder.add_node("generate", generate_node)
builder.add_node("evaluate", evaluate_node)

builder.set_entry_point("generate")
builder.add_edge("generate", "evaluate")
builder.add_conditional_edges("evaluate", should_loop, {"generate": "generate", "done": END})

graph = builder.compile()


@app.entrypoint
async def handler(payload: dict, context=None):
    goal = payload.get("goal", "")
    if not goal:
        return {"error": "goal is required"}

    logger.info("AgentCore invocation received")
    try:
        result = await graph.ainvoke({
            "goal": goal,
            "criteria": payload.get("criteria", ""),
            "current_draft": "",
            "score": 0,
            "feedback": "",
            "iteration": 0,
            "max_iterations": payload.get("max_iterations", config.MAX_ITERATIONS),
            "threshold": payload.get("threshold", config.QUALITY_THRESHOLD),
        })
        return {
            "content": result["current_draft"],
            "score": result["score"],
            "iterations": result["iteration"],
        }
    except Exception as e:
        logger.exception("Agent error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
