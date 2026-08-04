"""Conversational assistant agent server (Strands SDK).

Multi-turn agent with calculator and datetime tools, deployed on BedrockAgentCoreApp.
Streams response tokens via async generator.
"""

import logging

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from strands.agent.conversation_manager import SlidingWindowConversationManager

from . import config
from .tools import calculator, get_current_datetime

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

SYSTEM_PROMPT = """You are a helpful conversational assistant. You can:
- Answer questions and have natural conversations
- Perform mathematical calculations using the calculator tool
- Tell the current date and time

Be concise and helpful. Use tools when appropriate rather than guessing.
If you don't know something, say so honestly."""


def create_agent() -> Agent:
    """Create a configured Strands agent with tools and memory."""
    model = BedrockModel(
        model_id=config.MODEL_ID,
        region_name=config.AWS_REGION,
        temperature=config.TEMPERATURE,
        max_tokens=config.MAX_TOKENS,
    )
    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[calculator, get_current_datetime],
        conversation_manager=SlidingWindowConversationManager(window_size=config.MEMORY_WINDOW_SIZE),
    )


agent = create_agent()


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle agent invocations. Streams response tokens."""
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    logger.info("AgentCore invocation received")
    async for event in agent.stream_async(prompt):
        if "data" in event:
            yield {"type": "content", "data": event["data"]}


if __name__ == "__main__":
    app.run()
