"""Trading Assistant Orchestrator."""

import json
import re
import uuid
import asyncio
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.trading_assistant.agents import MarketAnalyst, TradeIdeaGenerator, ExecutionPlanner
from use_cases.trading_assistant.agents.market_analyst import analyze_market
from use_cases.trading_assistant.agents.trade_idea_generator import generate_trade_ideas
from use_cases.trading_assistant.agents.execution_planner import plan_execution
from use_cases.trading_assistant.models import (
    TradingRequest, TradingResponse, AnalysisType,
    MarketAnalysisDetail, MarketCondition, ExecutionUrgency,
)


class TradingAssistantState(TypedDict):
    messages: Annotated[list, add_messages]
    entity_id: str
    analysis_type: str
    market_analyst_result: dict | None
    trade_idea_generator_result: dict | None
    execution_planner_result: dict | None
    additional_context: str | None
    final_summary: str | None


class TradingAssistantOrchestrator(LangGraphOrchestrator):
    name = "trading_assistant_orchestrator"
    state_schema = TradingAssistantState
    system_prompt = """You are a Senior Trading Strategist for a capital markets desk.

Your role is to:
1. Coordinate specialist agents (Market Analyst, Trade Idea Generator, Execution Planner)
2. Synthesize their findings into actionable trading intelligence
3. Ensure recommendations are risk-aware and execution-ready

Be precise and actionable. Your summary will be used by traders."""

    def __init__(self):
        super().__init__(agents={
            "market_analyst": MarketAnalyst(),
            "trade_idea_generator": TradeIdeaGenerator(),
            "execution_planner": ExecutionPlanner(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(TradingAssistantState)
        workflow.add_node("full_assessment", self._full_assessment_node)
        workflow.add_node("market_only", self._market_only_node)
        workflow.add_node("trade_idea_assessment", self._trade_idea_node)
        workflow.add_node("execution_plan_assessment", self._execution_plan_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(self._entry_router, {
            "full_assessment": "full_assessment",
            "market_only": "market_only",
            "trade_idea_assessment": "trade_idea_assessment",
            "execution_plan_assessment": "execution_plan_assessment",
        })
        workflow.add_edge("full_assessment", "synthesize")
        workflow.add_edge("market_only", "synthesize")
        workflow.add_edge("trade_idea_assessment", "synthesize")
        workflow.add_edge("execution_plan_assessment", "synthesize")
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _entry_router(self, state) -> Literal["full_assessment", "market_only", "trade_idea_assessment", "execution_plan_assessment"]:
        at = state.get("analysis_type", "full")
        if at == "market_analysis":
            return "market_only"
        if at == "trade_idea":
            return "trade_idea_assessment"
        if at == "execution_plan":
            return "execution_plan_assessment"
        return "full_assessment"

    async def _full_assessment_node(self, state):
        entity_id, ctx = state["entity_id"], self._extract_context(state)
        m, t, e = await asyncio.gather(
            analyze_market(entity_id, ctx), generate_trade_ideas(entity_id, ctx), plan_execution(entity_id, ctx))
        return {**state, "market_analyst_result": m, "trade_idea_generator_result": t, "execution_planner_result": e,
                "messages": state["messages"] + [AIMessage(content=json.dumps({"market": m, "trades": t, "exec": e}))]}

    async def _market_only_node(self, state):
        result = await analyze_market(state["entity_id"], self._extract_context(state))
        return {**state, "market_analyst_result": result,
                "messages": state["messages"] + [AIMessage(content=json.dumps(result))]}

    async def _trade_idea_node(self, state):
        entity_id, ctx = state["entity_id"], self._extract_context(state)
        m, t = await asyncio.gather(analyze_market(entity_id, ctx), generate_trade_ideas(entity_id, ctx))
        return {**state, "market_analyst_result": m, "trade_idea_generator_result": t,
                "messages": state["messages"] + [AIMessage(content=json.dumps({"market": m, "trades": t}))]}

    async def _execution_plan_node(self, state):
        entity_id, ctx = state["entity_id"], self._extract_context(state)
        m, e = await asyncio.gather(analyze_market(entity_id, ctx), plan_execution(entity_id, ctx))
        return {**state, "market_analyst_result": m, "execution_planner_result": e,
                "messages": state["messages"] + [AIMessage(content=json.dumps({"market": m, "exec": e}))]}

    async def _synthesize_node(self, state):
        sections = []
        for key, label in [("market_analyst_result", "Market Analysis"),
                           ("trade_idea_generator_result", "Trade Ideas"),
                           ("execution_planner_result", "Execution Plan")]:
            if state.get(key):
                sections.append(f"## {label}\n{json.dumps(state[key], indent=2)}")
        prompt = f"""Based on the following assessments, provide a final trading recommendation:

{chr(10).join(sections)}

Include: 1. Market condition 2. Top trades with levels 3. Execution strategy 4. Key risks"""
        summary = await self.synthesize(
            {k: state.get(k) for k in ["market_analyst_result", "trade_idea_generator_result", "execution_planner_result"]},
            prompt)
        return {**state, "final_summary": summary,
                "messages": state["messages"] + [AIMessage(content=f"Final: {summary}")]}

    def _extract_context(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


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
    initial_state: TradingAssistantState = {
        "messages": [HumanMessage(content=f"Begin trading analysis for: {request.entity_id}")],
        "entity_id": request.entity_id, "analysis_type": request.analysis_type.value,
        "market_analyst_result": None, "trade_idea_generator_result": None,
        "execution_planner_result": None, "additional_context": request.additional_context,
        "final_summary": None}
    if request.additional_context:
        initial_state["messages"].append(f"Context: {request.additional_context}")
    final_state = await orchestrator.arun(initial_state)

    market_analysis = None
    if final_state.get("market_analyst_result"):
        market_analysis = parse_market_analysis(final_state["market_analyst_result"].get("analysis", ""))
    recommendations = []
    if final_state.get("trade_idea_generator_result"):
        ti_text = final_state["trade_idea_generator_result"].get("analysis", "")
        recommendations.extend(_extract_bullet_items(ti_text, ["trade idea", "recommendation", "priority"]))
    if final_state.get("execution_planner_result"):
        ep_text = final_state["execution_planner_result"].get("analysis", "")
        recommendations.extend(_extract_bullet_items(ep_text, ["execution", "strategy", "recommend"]))
    if not recommendations:
        recommendations = ["See raw analysis for detailed recommendations"]

    return TradingResponse(
        entity_id=request.entity_id, analysis_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(), market_analysis=market_analysis,
        recommendations=recommendations, summary=final_state.get("final_summary") or "Analysis completed",
        raw_analysis={"market_analysis": final_state.get("market_analyst_result"),
                      "trade_ideas": final_state.get("trade_idea_generator_result"),
                      "execution_plan": final_state.get("execution_planner_result")})
