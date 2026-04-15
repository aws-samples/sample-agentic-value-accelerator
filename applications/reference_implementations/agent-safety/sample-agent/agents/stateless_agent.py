"""Stateless AgentCore agent with DynamoDB session reporting.

This agent tracks sessions via DynamoDB heartbeats.
No memory component needed — sessions are reported to the session-token-usage table.
"""

import logging
import os
import sys
import traceback

# Configure logging FIRST — before any other imports or instrumentation
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Note: ADOT instrumentation is handled by the opentelemetry-instrument entrypoint wrapper
# configured in the CF template. No need to call configure_opentelemetry() here.

logger.info("=" * 60)
logger.info("Stateless agent starting up...")
logger.info(f"Python version: {sys.version}")
logger.info(f"AGENT_NAME: {os.environ.get('AGENT_NAME', 'not set')}")
logger.info(f"MODEL_ID: {os.environ.get('MODEL_ID', 'not set')}")
logger.info(f"SESSION_TABLE: {os.environ.get('SESSION_TABLE', 'not set')}")
logger.info(f"AWS_REGION: {os.environ.get('AWS_REGION', 'not set')}")
logger.info("=" * 60)

try:
    from bedrock_agentcore.runtime import BedrockAgentCoreApp
    from bedrock_agentcore import RequestContext
    from strands import Agent
    from strands.models import BedrockModel
    from session_reporter import HeartbeatThread, report_heartbeat, report_session_start
    from cloudwatch_metrics import MetricsPublisher
    logger.info("All imports OK")
except Exception as e:
    logger.error(f"Import failed: {e}")
    traceback.print_exc()
    raise

AGENT_NAME = os.environ.get("AGENT_NAME", "my_agent")
AGENT_RUNTIME_ARN = os.environ.get("AGENT_RUNTIME_ARN", "")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
SYSTEM_PROMPT = os.environ.get("SYSTEM_PROMPT",
    "You are a helpful assistant for financial services. "
    "You can answer questions about loans, accounts, and general banking. "
    "Always be concise and accurate."
)

model = BedrockModel(model_id=MODEL_ID)
agent = Agent(model=model, system_prompt=SYSTEM_PROMPT)

app = BedrockAgentCoreApp()
cw_metrics = MetricsPublisher(agent_name=AGENT_NAME)
_heartbeats: dict[str, HeartbeatThread] = {}

logger.info(f"Agent initialized: name={AGENT_NAME}")


@app.entrypoint
def invoke(payload: dict, context: RequestContext):
    session_id = context.session_id or "unknown"
    prompt = payload.get("prompt", "Hello!")
    logger.info(f"Invocation: session={session_id}, prompt={prompt[:80]}")

    if session_id not in _heartbeats and session_id != "unknown":
        report_session_start(session_id=session_id, agent_name=AGENT_NAME, agent_runtime_arn=AGENT_RUNTIME_ARN)
        hb = HeartbeatThread(session_id)
        hb.start()
        _heartbeats[session_id] = hb

    result = agent(prompt)
    response_text = result.message.get("content", [{}])[0].get("text", str(result))

    if session_id in _heartbeats:
        usage = result.metrics.accumulated_usage
        _heartbeats[session_id].update_metrics(usage.get("inputTokens", 0), usage.get("outputTokens", 0))
        report_heartbeat(session_id, _heartbeats[session_id]._metrics)
        cw_metrics.record_token_usage(
            input_tokens=usage.get("inputTokens", 0),
            output_tokens=usage.get("outputTokens", 0),
        )
        cw_metrics.flush()

    return {"result": response_text, "session_id": session_id}


if __name__ == "__main__":
    app.run()
