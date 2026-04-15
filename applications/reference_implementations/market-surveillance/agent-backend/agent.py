#!/usr/bin/env python3
"""
Market Surveillance Agent - AgentCore Runtime Entry Point

This is the main entry point for the Market Surveillance multi-agent system deployed on AgentCore Runtime.
AgentCore will call the agent_stream() function decorated with @app.entrypoint.
"""

print("[STARTUP] Loading agent.py module...")

import os
import logging
import traceback
from datetime import datetime
import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands.types.exceptions import MaxTokensReachedException

print("[STARTUP] Importing coordinator...")
from agents.coordinator import create_coordinator_agent

print("[STARTUP] Imports complete")

# Configure logging to stdout for AgentCore Runtime
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]  # Explicitly use stdout
)
logger = logging.getLogger(__name__)

# For local testing, try to load .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv not installed, skip (fine for AgentCore deployment)
    pass

# Create the AgentCore app instance
app = BedrockAgentCoreApp()

# DynamoDB client for updating investigation status on failure
_summaries_table_name = os.getenv("ALERT_SUMMARIES_TABLE", "")
_dynamodb = boto3.resource('dynamodb', region_name=os.getenv("AWS_REGION", "us-east-1")) if _summaries_table_name else None
_summaries_table = _dynamodb.Table(_summaries_table_name) if _dynamodb and _summaries_table_name else None


def _mark_investigation_failed(alert_id: str, investigation_id: str, error_message: str):
    """Update the investigation status to 'failed' in DynamoDB."""
    if not _summaries_table or not alert_id or not investigation_id:
        logger.warning(f"[FailureHandler] Cannot update DynamoDB - table={bool(_summaries_table)}, "
                       f"alert_id={alert_id}, investigation_id={investigation_id}")
        return
    try:
        _summaries_table.update_item(
            Key={
                'PK': alert_id,
                'SK': investigation_id
            },
            UpdateExpression='SET #status = :status, errorMessage = :error, failedAt = :ts',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'failed',
                ':error': error_message[:1000],  # Truncate to avoid DynamoDB item size issues
                ':ts': datetime.utcnow().isoformat() + 'Z'
            }
        )
        logger.info(f"[FailureHandler] Marked investigation {investigation_id} as failed for alert {alert_id}")
    except Exception as update_err:
        logger.error(f"[FailureHandler] Failed to update DynamoDB: {update_err}")


@app.entrypoint
async def agent_stream(payload, context=None):
    """
    AgentCore Runtime streaming entrypoint.

    Supports two paths:
    1. Direct chat: Streams agent responses token-by-token for real-time UX.
    2. Async investigation: Offloads long-running investigation to a background thread
       using AgentCore's async task pattern (add_async_task/complete_async_task) so the
       /ping health check remains responsive and the session stays alive (up to 8 hours).

    Args:
        payload: The input payload containing:
            - prompt: User's message
            - session_id: Session identifier (optional)
            - alert_id: Alert identifier for context (optional)
            - investigation_id: Investigation identifier for async path (optional)
            - user_id: User identifier (async investigations use "system-async-*" prefix)
        context: AgentCore request context (contains headers, user_id, etc.)

    Yields:
        dict: Streaming events including tokens, thinking, and final result
    """
    # Extract required fields
    user_message = payload.get("prompt")
    session_id = payload.get("session_id", "default_session")
    alert_id = payload.get("alert_id")
    investigation_id = payload.get("investigation_id")
    user_id = payload.get("user_id", "anonymous")

    # Validate required fields
    if not user_message:
        yield {
            "status": "error",
            "error": "Missing required field: prompt"
        }
        return

    # Detect async investigation path (system-triggered, long-running)
    is_async_investigation = user_id.startswith("system-async-")

    if is_async_investigation:
        # --- ASYNC INVESTIGATION PATH ---
        # Must NOT block the entrypoint — offload to a background thread so that
        # AgentCore's /ping health check can respond with HealthyBusy and keep the
        # session alive for the full duration (up to 8 hours).
        import threading

        task_id = app.add_async_task("investigation", {
            "alert_id": alert_id,
            "investigation_id": investigation_id,
            "user_id": user_id,
            "session_id": session_id,
        })

        logger.info(f"Starting ASYNC investigation task={task_id}, alert={alert_id}, "
                     f"investigation={investigation_id}, user={user_id}, session={session_id}")

        def _run_async_investigation():
            """Run the investigation in a background thread with retry on transient timeouts."""
            import time
            from urllib3.exceptions import ReadTimeoutError

            max_retries = 3

            try:
                for attempt in range(1, max_retries + 1):
                    try:
                        coordinator_agent = create_coordinator_agent(
                            user_id=user_id,
                            session_id=session_id
                        )

                        enhanced_message = user_message
                        if alert_id:
                            enhanced_message = f"[Alert Context: Alert ID = {alert_id}]\n\n{user_message}"

                        # Use synchronous (non-streaming) call — no consumer for the stream
                        # in a background thread. Results are persisted via gateway tools.
                        result = coordinator_agent(enhanced_message)

                        logger.info(f"Async investigation completed: task={task_id}, alert={alert_id}")
                        return  # Success — exit retry loop

                    except MaxTokensReachedException as e:
                        logger.error(f"Async investigation hit max token limit: task={task_id}, error={e}")
                        _mark_investigation_failed(alert_id, investigation_id, f"MaxTokensReachedException: {e}")
                        return  # Non-retryable

                    except Exception as e:
                        is_timeout = isinstance(e, ReadTimeoutError) or "Read timed out" in str(e)

                        if is_timeout and attempt < max_retries:
                            backoff = 30 * attempt  # 30s, 60s
                            logger.warning(
                                f"Async investigation timeout (attempt {attempt}/{max_retries}): "
                                f"task={task_id}, retrying in {backoff}s..."
                            )
                            time.sleep(backoff)
                            continue

                        # Non-timeout error or final attempt — give up
                        logger.error(f"Async investigation failed: task={task_id}, attempt={attempt}, error={e}")
                        traceback.print_exc()
                        _mark_investigation_failed(
                            alert_id, investigation_id, f"{type(e).__name__}: {e}"
                        )
                        return

            finally:
                # Always complete the async task so AgentCore returns to Healthy status
                app.complete_async_task(task_id)
                logger.info(f"Async task completed: task={task_id}")

        threading.Thread(target=_run_async_investigation, daemon=True).start()

        yield {
            "type": "result",
            "status": "accepted",
            "message": f"Investigation started in background (task: {task_id})",
            "task_id": task_id,
            "alert_id": alert_id,
            "investigation_id": investigation_id,
        }
        return

    # --- DIRECT CHAT PATH (streaming) ---
    from queue import Queue
    from agents.callback_handlers import set_event_queue

    try:
        logger.info(f"Starting STREAMING invocation for user: {user_id}, session: {session_id}, alert: {alert_id}")
        logger.info(f"Query: {user_message}")

        # Create event queue for thinking events
        event_queue = Queue()
        set_event_queue(event_queue)

        # Create coordinator agent with trace attributes
        coordinator_agent = create_coordinator_agent(
            user_id=user_id,
            session_id=session_id
        )

        # Enhance message with alert context if alert_id is provided
        enhanced_message = user_message
        if alert_id:
            enhanced_message = f"[Alert Context: Alert ID = {alert_id}]\n\n{user_message}"
            logger.info(f"Enhanced message with alert context: Alert ID = {alert_id}")

        # Stream agent response
        async for event in coordinator_agent.stream_async(enhanced_message):
            # First, yield any queued thinking events
            while not event_queue.empty():
                try:
                    thinking_event = event_queue.get_nowait()
                    yield {
                        "type": "thinking",
                        "data": thinking_event
                    }
                except Exception as e:
                    logger.warning(f"Error getting thinking event from queue: {e}")
                    break

            # Transform Strands events to frontend format

            # Text delta events (model output)
            if "data" in event and event["data"]:
                yield {
                    "type": "content_delta",
                    "data": event["data"]
                }

            # Result event (final)
            if "result" in event:
                result = event["result"]
                yield {
                    "type": "result",
                    "message": result.message if hasattr(result, 'message') else str(result),
                    "stop_reason": result.stop_reason if hasattr(result, 'stop_reason') else "end_turn"
                }

        # Yield any remaining thinking events after stream completes
        while not event_queue.empty():
            try:
                thinking_event = event_queue.get_nowait()
                yield {
                    "type": "thinking",
                    "data": thinking_event
                }
            except Exception:
                break

        # Clean up event queue
        set_event_queue(None)

    except MaxTokensReachedException as e:
        logger.error(f"Agent hit max token limit: {e}")
        set_event_queue(None)
        _mark_investigation_failed(alert_id, investigation_id, f"MaxTokensReachedException: {e}")
        yield {
            "type": "result",
            "status": "partial",
            "message": "The investigation generated more content than the model can produce in a single response. "
                       "Please try narrowing your query or breaking it into smaller steps.",
            "stop_reason": "max_tokens"
        }
    except Exception as e:
        logger.error(f"Error in agent_stream: {e}")
        traceback.print_exc()
        _mark_investigation_failed(alert_id, investigation_id, f"{type(e).__name__}: {e}")
        yield {
            "status": "error",
            "error": str(e)
        }


# For local testing with BedrockAgentCoreApp
if __name__ == "__main__":
    print("=" * 60)
    print("Starting Market Surveillance Agent...")
    print(f"CONFIG_BUCKET: {os.getenv('CONFIG_BUCKET')}")
    print(f"AWS_REGION: {os.getenv('AWS_REGION')}")
    print("=" * 60)
    
    try:
        print("Calling app.run()...")
        app.run()
    except Exception as e:
        print(f"ERROR: Failed to start app: {e}")
        traceback.print_exc()
