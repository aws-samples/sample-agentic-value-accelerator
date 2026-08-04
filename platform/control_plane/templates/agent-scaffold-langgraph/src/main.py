"""LangGraph Agent Scaffold — Bedrock AgentCore Entry Point.

A production-ready ReAct agent with tools and conversation memory.
Deploys to Bedrock AgentCore via BedrockAgentCoreApp.

Local: python -m src.main (starts on http://localhost:8080)
Docker: docker build -t my-agent . && docker run -p 8080:8080 my-agent
Test: curl -X POST http://localhost:8080/invocations -d '{"prompt": "hello"}'
"""

import logging
import math
import ast
import operator
from datetime import datetime, timezone

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import InMemorySaver
from langchain_aws import ChatBedrockConverse
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage

from .config import config

logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# --- Tools ---

_SAFE_OPERATORS = {
    ast.Add: operator.add, ast.Sub: operator.sub,
    ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.USub: operator.neg,
}
_SAFE_FUNCTIONS = {"sqrt": math.sqrt, "abs": abs, "round": round}
_SAFE_CONSTANTS = {"pi": math.pi, "e": math.e}


def _safe_eval(node):
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name) and node.id in _SAFE_CONSTANTS:
        return _SAFE_CONSTANTS[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_OPERATORS:
        return _SAFE_OPERATORS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_OPERATORS:
        return _SAFE_OPERATORS[type(node.op)](_safe_eval(node.operand))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _SAFE_FUNCTIONS:
        return _SAFE_FUNCTIONS[node.func.id](*[_safe_eval(a) for a in node.args])
    raise ValueError(f"Unsupported: {ast.dump(node)}")


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression safely.

    Args:
        expression: Math expression (e.g., 'sqrt(144) + 2 * 3')
    """
    try:
        result = _safe_eval(ast.parse(expression, mode="eval"))
        return str(result)
    except (ValueError, SyntaxError, ZeroDivisionError) as e:
        return f"Error: {e}"


@tool
def get_current_datetime() -> str:
    """Get the current date and time in UTC."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


# --- Graph ---

llm = ChatBedrockConverse(
    model_id=config.MODEL_ID,
    region_name=config.AWS_REGION,
    temperature=0.3,
    max_tokens=4096,
)

graph = create_react_agent(
    llm,
    tools=[calculator, get_current_datetime],
    checkpointer=InMemorySaver(),
)

# --- AgentCore App ---

app = BedrockAgentCoreApp()


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle agent invocations.

    Payload: {"prompt": "...", "session_id": "optional"}
    """
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", "default")
    if not prompt:
        return {"error": "'prompt' field is required"}

    logger.info("Invocation received: %s...", prompt[:50])
    try:
        config_dict = {"configurable": {"thread_id": session_id}}
        result = await graph.ainvoke(
            {"messages": [HumanMessage(content=prompt)]},
            config=config_dict,
        )
        return {"response": result["messages"][-1].content}
    except Exception as e:
        logger.exception("Agent error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
