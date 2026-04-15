"""Trading Assistant - LangGraph Implementation."""
from .orchestrator import TradingAssistantOrchestrator, run_trading_assistant
from .models import TradingRequest, TradingResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="trading_assistant", config=RegisteredAgent(
    entry_point=run_trading_assistant, request_model=TradingRequest, response_model=TradingResponse))
__all__ = ["TradingAssistantOrchestrator", "run_trading_assistant", "TradingRequest", "TradingResponse"]
