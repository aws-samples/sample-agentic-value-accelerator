"""Trading Assistant Orchestrator (Strands Implementation)."""

import json
import re
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import MarketAnalyst, TradeIdeaGenerator, ExecutionPlanner
from .agents.market_analyst import analyze_market
from .agents.trade_idea_generator import generate_trade_ideas
from .agents.execution_planner import plan_execution
from .models import (
    TradingRequest, TradingResponse, AnalysisType,
    MarketAnalysisDetail, MarketCondition, ExecutionUrgency,
)


class TradingAssistantOrchestrator(StrandsOrchestrator):
    name = "trading_assistant_orchestrator"
    system_prompt = """You are a Senior Trading Strategist for a capital markets desk.

Your role is to:
1. Coordinate specialist agents (Market Analyst, Trade Idea Generator, Execution Planner)
2. Synthesize their findings into actionable trading intelligence
3. Ensure recommendations are risk-aware and execution-ready

When creating the final summary, consider:
- Current market regime and conditions
- Risk-reward profiles of proposed trades
- Execution feasibility and expected costs
- Portfolio-level impact and concentration risk
- Clear action items with specific parameters

Be precise and actionable. Your summary will be used by traders."""

    def __init__(self):
        super().__init__(agents={
            "market_analyst": MarketAnalyst(),
            "trade_idea_generator": TradeIdeaGenerator(),
            "execution_planner": ExecutionPlanner(),
        })

    async def arun_assessment(self, entity_id: str, analysis_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        market_result = sentiment_result = execution_result = None

        if analysis_type == "full":
            market_result, sentiment_result, execution_result = await asyncio.gather(
                analyze_market(entity_id, context),
                generate_trade_ideas(entity_id, context),
                plan_execution(entity_id, context),
            )
        elif analysis_type == "market_analysis":
            market_result = await analyze_market(entity_id, context)
        elif analysis_type == "trade_idea":
            market_result, sentiment_result = await asyncio.gather(
                analyze_market(entity_id, context), generate_trade_ideas(entity_id, context))
        elif analysis_type == "execution_plan":
            market_result, execution_result = await asyncio.gather(
                analyze_market(entity_id, context), plan_execution(entity_id, context))

        synthesis_prompt = self._build_synthesis_prompt(market_result, sentiment_result, execution_result)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, synthesis_prompt))

        return {"entity_id": entity_id, "market_analysis": market_result,
                "trade_ideas": sentiment_result, "execution_plan": execution_result,
                "final_summary": summary}

    def _build_synthesis_prompt(self, market_result, trade_result, execution_result) -> str:
        sections = []
        if market_result:
            sections.append(f"## Market Analysis\n{json.dumps(market_result, indent=2)}")
        if trade_result:
            sections.append(f"## Trade Ideas\n{json.dumps(trade_result, indent=2)}")
        if execution_result:
            sections.append(f"## Execution Plan\n{json.dumps(execution_result, indent=2)}")
        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide a final trading recommendation:

{chr(10).join(sections)}

Provide a concise executive summary including:
1. Market condition assessment
2. Top trade recommendations with entry/target/stop
3. Execution strategy and timing
4. Key risks and mitigation"""


def parse_market_analysis(analysis: str) -> MarketAnalysisDetail:
    """Parse structured market analysis from LLM output."""
    al = analysis.lower()

    # Extract market condition from LLM output
    condition = MarketCondition.NEUTRAL
    if "bullish" in al: condition = MarketCondition.BULLISH
    elif "bearish" in al: condition = MarketCondition.BEARISH
    elif "volatile" in al: condition = MarketCondition.VOLATILE

    # Extract urgency from LLM output
    urgency = ExecutionUrgency.MEDIUM
    if "immediate" in al or "urgent" in al: urgency = ExecutionUrgency.IMMEDIATE
    elif "high urgency" in al or "time-sensitive" in al: urgency = ExecutionUrgency.HIGH
    elif "low urgency" in al or "no rush" in al: urgency = ExecutionUrgency.LOW

    # Extract confidence from LLM output (look for percentages or scores)
    confidence = 0.5
    conf_match = re.search(r"confidence[:\s]*(?:level[:\s]*)?(?:high|strong)", al)
    if conf_match: confidence = 0.8
    conf_match = re.search(r"confidence[:\s]*(?:level[:\s]*)?(?:low|weak)", al)
    if conf_match: confidence = 0.3
    pct_match = re.search(r"confidence[:\s]*(?:level[:\s]*)?(?:of\s+)?([\d.]+)%", al)
    if pct_match: confidence = min(float(pct_match.group(1)) / 100, 1.0)

    # Extract key price levels from LLM output
    key_levels = []
    for line in analysis.split("\n"):
        ll = line.lower().strip()
        if any(kw in ll for kw in ["support", "resistance", "level", "price"]):
            cleaned = line.strip().lstrip("-*• ")
            if cleaned and len(cleaned) > 10 and len(cleaned) < 200:
                key_levels.append(_clean_markdown(cleaned))
    key_levels = key_levels[:10]  # cap at 10

    # Extract trade ideas from trade_idea_generator output
    trade_ideas = _extract_bullet_items(analysis, ["trade idea", "recommendation", "setup", "entry"])

    # Extract execution notes from execution_planner output
    execution_notes = _extract_bullet_items(analysis, ["execution", "timing", "venue", "slicing", "twap", "vwap"])

    return MarketAnalysisDetail(
        condition=condition, urgency=urgency, confidence_score=round(confidence, 2),
        key_levels=key_levels or ["See raw analysis for detailed levels"],
        trade_ideas=trade_ideas or ["See raw analysis for trade ideas"],
        execution_notes=execution_notes or ["See raw analysis for execution details"])


def _extract_bullet_items(text: str, keywords: list[str]) -> list[str]:
    """Extract relevant bullet points from LLM output based on keywords."""
    items = []
    lines = text.split("\n")
    in_section = False
    for line in lines:
        ll = line.lower().strip()
        if any(kw in ll for kw in keywords) and ("##" in line or "**" in line):
            in_section = True
            continue
        if in_section:
            if line.strip().startswith(("#", "##")):
                in_section = False
                continue
            cleaned = line.strip().lstrip("-*•0123456789. ")
            if cleaned and len(cleaned) > 15 and len(cleaned) < 300:
                items.append(_clean_markdown(cleaned))
                if len(items) >= 5:
                    break
    return items



def _clean_markdown(text: str) -> str:
    """Strip markdown formatting from extracted text."""
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # **bold**
    text = re.sub(r'^#{1,4}\s*', '', text)  # ### headers
    text = re.sub(r'^\s*[-*•]\s*', '', text)  # bullet prefixes
    return text.strip()


async def run_trading_assistant(request: TradingRequest) -> TradingResponse:
    orchestrator = TradingAssistantOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id, analysis_type=request.analysis_type.value,
        context=request.additional_context)

    market_analysis = None
    if final_state.get("market_analysis"):
        market_analysis = parse_market_analysis(final_state["market_analysis"].get("analysis", ""))

    recommendations = []
    if final_state.get("trade_ideas"):
        recommendations.append("Trade ideas generated - see raw analysis")
    if final_state.get("execution_plan"):
        recommendations.append("Execution plan prepared - see raw analysis")

    return TradingResponse(
        entity_id=request.entity_id, analysis_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(), market_analysis=market_analysis,
        recommendations=recommendations, summary=final_state.get("final_summary", "Analysis completed"),
        raw_analysis={"market_analysis": final_state.get("market_analysis"),
                      "trade_ideas": final_state.get("trade_ideas"),
                      "execution_plan": final_state.get("execution_plan")})
