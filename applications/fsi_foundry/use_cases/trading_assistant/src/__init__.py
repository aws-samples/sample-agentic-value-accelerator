"""Trading Assistant Use Case. Dual-framework support: LangGraph (default) and Strands."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_trading_assistant
    from strands.models import TradingRequest, TradingResponse
else:
    from langchain_langgraph.orchestrator import run_trading_assistant
    from langchain_langgraph.models import TradingRequest, TradingResponse
register_agent("trading_assistant", RegisteredAgent(
    entry_point=run_trading_assistant, request_model=TradingRequest, response_model=TradingResponse))
__all__ = ["run_trading_assistant", "TradingRequest", "TradingResponse"]
