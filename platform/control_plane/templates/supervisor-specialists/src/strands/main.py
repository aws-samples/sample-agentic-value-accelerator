"""Supervisor-specialists agent server (Strands SDK).

Routes requests to researcher, writer, or analyst specialists using the official
Strands multi-agent pattern (Agent instances passed directly in tools=[]).
"""

import logging

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()


def create_model():
    return BedrockModel(
        model_id=config.MODEL_ID,
        region_name=config.AWS_REGION,
        temperature=config.TEMPERATURE,
        max_tokens=config.MAX_TOKENS,
    )


# Specialist agents
researcher = Agent(
    model=create_model(),
    system_prompt="You are a research specialist. Find information, analyze data, and provide well-sourced answers.",
)

writer = Agent(
    model=create_model(),
    system_prompt="You are a writing specialist. Create clear, well-structured content based on provided information.",
)

analyst = Agent(
    model=create_model(),
    system_prompt="You are a data analyst. Perform calculations, analyze numbers, and provide quantitative insights.",
)

# Supervisor passes agents directly as tools (official Strands pattern)
supervisor = Agent(
    model=create_model(),
    system_prompt="""You are a supervisor agent. Route user requests to the appropriate specialist:
- researcher: for finding information, answering factual questions
- writer: for creating content, drafting documents, summarizing
- analyst: for calculations, data analysis, quantitative questions

Always delegate to the most appropriate specialist.""",
    tools=[researcher, writer, analyst],
)


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations."""
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "prompt is required"}

    logger.info("AgentCore invocation received")
    result = supervisor(prompt)
    return {"response": result.message}


if __name__ == "__main__":
    app.run()
