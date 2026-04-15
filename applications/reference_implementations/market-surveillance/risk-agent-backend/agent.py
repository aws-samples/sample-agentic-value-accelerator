#!/usr/bin/env python3
"""
Risk Analyst Agent - AgentCore Runtime Entry Point

Streams agent responses for risk analysis database queries.
"""

print("[STARTUP] Loading Risk Analyst agent.py module...")

import os
import logging
import traceback
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands.types.exceptions import MaxTokensReachedException

print("[STARTUP] Importing Risk Analyst agent...")
from agents.risk_analyst import create_risk_analyst_agent

print("[STARTUP] Imports complete")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = BedrockAgentCoreApp()


@app.entrypoint
async def agent_stream(payload, context=None):
    """
    AgentCore Runtime streaming entrypoint for Risk Analyst agent.

    Args:
        payload: Input containing prompt, session_id, user_id
        context: AgentCore request context

    Yields:
        Streaming events (content_delta, thinking, result)
    """
    from queue import Queue
    from agents.callback_handler import set_event_queue

    try:
        user_message = payload.get("prompt")
        session_id = payload.get("session_id", "default_session")
        user_id = payload.get("user_id", "anonymous")

        if not user_message:
            yield {"status": "error", "error": "Missing required field: prompt"}
            return

        logger.info(f"Risk Analyst streaming invocation - user: {user_id}, session: {session_id}")
        logger.info(f"Query: {user_message}")

        # Create event queue for thinking events
        event_queue = Queue()
        set_event_queue(event_queue)

        # Create agent
        risk_agent = create_risk_analyst_agent(user_id=user_id, session_id=session_id)

        # Stream response
        async for event in risk_agent.stream_async(user_message):
            # Yield queued events (thinking + images) first
            while not event_queue.empty():
                try:
                    queued_event = event_queue.get_nowait()
                    if queued_event.get("type") == "image":
                        yield {"type": "image", "base64": queued_event["base64"], "alt": queued_event.get("alt", "Chart")}
                    else:
                        yield {"type": "thinking", "data": queued_event}
                except Exception:
                    break

            # Text delta
            if "data" in event and event["data"]:
                yield {"type": "content_delta", "data": event["data"]}

            # Final result
            if "result" in event:
                result = event["result"]
                yield {
                    "type": "result",
                    "message": result.message if hasattr(result, 'message') else str(result),
                    "stop_reason": result.stop_reason if hasattr(result, 'stop_reason') else "end_turn"
                }

        # Drain remaining queued events
        while not event_queue.empty():
            try:
                queued_event = event_queue.get_nowait()
                if queued_event.get("type") == "image":
                    yield {"type": "image", "base64": queued_event["base64"], "alt": queued_event.get("alt", "Chart")}
                else:
                    yield {"type": "thinking", "data": queued_event}
            except Exception:
                break

        set_event_queue(None)

    except MaxTokensReachedException as e:
        logger.error(f"Max token limit: {e}")
        set_event_queue(None)
        yield {
            "type": "result",
            "status": "partial",
            "message": "Response exceeded token limit. Try narrowing your query.",
            "stop_reason": "max_tokens"
        }
    except Exception as e:
        logger.error(f"Error in agent_stream: {e}")
        traceback.print_exc()
        yield {"status": "error", "error": str(e)}


if __name__ == "__main__":
    print("=" * 60)
    print("Starting Risk Analyst Agent...")
    print(f"CONFIG_BUCKET: {os.getenv('CONFIG_BUCKET')}")
    print(f"AWS_REGION: {os.getenv('AWS_REGION')}")
    print("=" * 60)
    try:
        app.run()
    except Exception as e:
        print(f"ERROR: Failed to start: {e}")
        traceback.print_exc()
