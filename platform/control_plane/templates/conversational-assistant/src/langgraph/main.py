"""Conversational assistant — LangGraph prebuilt ReAct agent with memory."""

import ast
import logging
from datetime import datetime, timezone

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from langchain_aws import ChatBedrockConverse
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()


@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression safely (supports +, -, *, /, **)."""
    try:
        tree = ast.parse(expression, mode="eval")
        for node in ast.walk(tree):
            if not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant,
                                     ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow,
                                     ast.USub, ast.UAdd)):
                return f"Unsupported expression: {expression}"
        result = eval(compile(tree, "<expr>", "eval"))  # noqa: S307 — AST-validated
        return str(result)
    except Exception as e:
        return f"Error: {e}"


@tool
def get_current_datetime() -> str:
    """Get current date and time in UTC."""
    return datetime.now(timezone.utc).isoformat()


llm = ChatBedrockConverse(
    model_id=config.MODEL_ID,
    region_name=config.AWS_REGION,
    temperature=config.TEMPERATURE,
    max_tokens=config.MAX_TOKENS,
)

graph = create_react_agent(llm, tools=[calculator, get_current_datetime], checkpointer=InMemorySaver())


@app.entrypoint
async def handler(payload: dict, context=None):
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    session_id = payload.get("session_id", "default")
    config_dict = {"configurable": {"thread_id": session_id}}

    logger.info("AgentCore invocation received")
    try:
        result = await graph.ainvoke({"messages": [("user", prompt)]}, config=config_dict)
        return {"response": result["messages"][-1].content}
    except Exception as e:
        logger.exception("Agent error")
        return {"error": str(e)}


if __name__ == "__main__":
    app.run()
