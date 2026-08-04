"""Plan-execute agent server (Strands SDK).

Decomposes goals into steps via a planner agent, executes each step with an executor agent,
and summarizes results. Max 10 steps guard.
"""

import ast
import json
import logging
import math
import operator
import re
from datetime import datetime, timezone

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

MAX_STEPS = 10


def create_model():
    return BedrockModel(
        model_id=config.MODEL_ID,
        region_name=config.AWS_REGION,
        temperature=config.TEMPERATURE,
        max_tokens=config.MAX_TOKENS,
    )


# --- Tools for executor ---

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub,
    ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.USub: operator.neg,
}
_FNS = {"sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "log": math.log, "abs": abs}
_CONSTS = {"pi": math.pi, "e": math.e}


def _safe_eval(node):
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name) and node.id in _CONSTS:
        return _CONSTS[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.operand))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FNS:
        return _FNS[node.func.id](*[_safe_eval(a) for a in node.args])
    raise ValueError(f"Unsupported: {ast.dump(node)}")


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression safely.

    Args:
        expression: A math expression, e.g. "2 + 2" or "sqrt(144)"
    """
    try:
        return str(_safe_eval(ast.parse(expression, mode="eval")))
    except Exception as e:
        return f"Error: {e}"


@tool
def get_current_datetime() -> str:
    """Get the current UTC date and time."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S %Z")


# --- Agents ---

planner = Agent(
    model=create_model(),
    system_prompt="""You are a planning agent. Given a goal, output a JSON array of steps.
Format: [{"step": 1, "action": "description"}, ...]
Rules: 2-5 steps, each independently executable. Output ONLY the JSON array.""",
)

executor = Agent(
    model=create_model(),
    system_prompt="You are an execution agent. Execute the given task using your tools. Be precise and return the result.",
    tools=[calculator, get_current_datetime],
)


def parse_plan(text: str) -> list[dict]:
    """Extract JSON plan from agent response."""
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass
    return [{"step": 1, "action": text}]


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations."""
    goal = payload.get("goal", "")
    if not goal:
        return {"error": "goal is required"}

    logger.info("Planning for goal: %s", goal[:100])

    # Plan
    plan_result = planner(f"Create a plan to: {goal}")
    steps = parse_plan(plan_result.message)[:MAX_STEPS]

    # Execute each step
    step_results = []
    for step in steps:
        action = step.get("action", str(step))
        result = executor(f"Execute: {action}")
        step_results.append({"action": action, "result": result.message})

    # Summarize
    summary_prompt = (
        f"Summarize results for goal '{goal}':\n"
        + "\n".join(f"- {s['action']}: {s['result']}" for s in step_results)
    )
    final = executor(summary_prompt)
    return {"result": final.message, "steps": step_results}


if __name__ == "__main__":
    app.run()
