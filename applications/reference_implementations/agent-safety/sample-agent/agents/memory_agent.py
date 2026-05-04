"""Memory-enabled AgentCore agent with AgentCore Memory integration.

This agent uses AgentCore Memory for conversation persistence.
Sessions are auto-tracked via the Memory ListSessions API — no DynamoDB heartbeat needed.
"""

import logging
import os
import sys
import traceback

# Configure logging FIRST — before any other imports that might fail
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Log startup info for debugging
logger.info("=" * 60)
logger.info("Memory agent starting up...")
logger.info(f"Python version: {sys.version}")
logger.info(f"AGENT_NAME: {os.environ.get('AGENT_NAME', 'not set')}")
logger.info(f"MODEL_ID: {os.environ.get('MODEL_ID', 'not set')}")
logger.info(f"AGENTCORE_MEMORY_ID: {os.environ.get('AGENTCORE_MEMORY_ID', 'not set')}")
logger.info(f"AWS_REGION: {os.environ.get('AWS_REGION', 'not set')}")
logger.info("=" * 60)

try:
    from bedrock_agentcore.runtime import BedrockAgentCoreApp
    from bedrock_agentcore import RequestContext
    logger.info("bedrock_agentcore imported OK")
except Exception as e:
    logger.error(f"Failed to import bedrock_agentcore: {e}")
    traceback.print_exc()
    raise

try:
    from strands import Agent
    from strands.models import BedrockModel
    logger.info("strands imported OK")
except Exception as e:
    logger.error(f"Failed to import strands: {e}")
    traceback.print_exc()
    raise

# Memory imports — these are the most likely to fail
_memory_available = False
try:
    from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
    from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
    _memory_available = True
    logger.info("bedrock_agentcore.memory imports OK")
except Exception as e:
    logger.warning(f"Memory integration not available: {e}")
    logger.warning("Agent will run WITHOUT memory. Install bedrock-agentcore with memory support.")
    traceback.print_exc()

AGENT_NAME = os.environ.get("AGENT_NAME", "my_agent")
MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID", "")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
SYSTEM_PROMPT = os.environ.get("SYSTEM_PROMPT",
    "You are a helpful assistant for financial services with memory. "
    "You can remember previous conversations and provide personalized advice. "
    "Always be concise and accurate."
)

model = BedrockModel(model_id=MODEL_ID)
app = BedrockAgentCoreApp()

logger.info(f"Agent initialized: name={AGENT_NAME}, memory_available={_memory_available}, memory_id={MEMORY_ID}")


@app.entrypoint
def invoke(payload: dict, context: RequestContext):
    session_id = context.session_id or "unknown"
    prompt = payload.get("prompt", "Hello!")
    logger.info(f"Invocation: session={session_id}, prompt={prompt[:80]}, memory={MEMORY_ID}")

    session_manager = None
    if _memory_available and MEMORY_ID and session_id != "unknown":
        try:
            memory_config = AgentCoreMemoryConfig(
                memory_id=MEMORY_ID, session_id=session_id, actor_id=AGENT_NAME
            )
            session_manager = AgentCoreMemorySessionManager(
                agentcore_memory_config=memory_config,
                region_name=os.environ.get("AWS_REGION", "us-east-1"),
            )
            logger.info(f"Memory session manager created for session {session_id}")
        except Exception as e:
            logger.warning(f"Failed to create memory session manager: {e}")
            traceback.print_exc()

    agent = Agent(model=model, system_prompt=SYSTEM_PROMPT, session_manager=session_manager)
    result = agent(prompt)
    response_text = result.message.get("content", [{}])[0].get("text", str(result))
    return {"result": response_text, "session_id": session_id}


if __name__ == "__main__":
    app.run()
