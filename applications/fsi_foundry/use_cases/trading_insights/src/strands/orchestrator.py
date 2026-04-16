"""
Trading Insights Orchestrator (Strands Implementation).

Orchestrates specialist agents (Signal Generator, Cross Asset Analyst, Scenario Modeler)
for comprehensive trading insights assessment in capital markets.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import SignalGenerator, CrossAssetAnalyst, ScenarioModeler
from .agents.signal_generator import generate_signals
from .agents.cross_asset_analyst import analyze_cross_asset
from .agents.scenario_modeler import model_scenarios
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    InsightsRequest,
    InsightsResponse,
    AssessmentType,
    InsightsDetail,
    SignalStrength,
    ScenarioLikelihood,
)


class TradingInsightsOrchestrator(StrandsOrchestrator):
    """
    Trading Insights Orchestrator using StrandsOrchestrator base class.

    Coordinates Signal Generator, Cross Asset Analyst, and Scenario Modeler agents
    for comprehensive trading insights assessment.
    """

    name = "trading_insights_orchestrator"

    system_prompt = """You are a Senior Trading Insights Supervisor for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Signal Generator, Cross Asset Analyst, Scenario Modeler)
2. Synthesize their findings into comprehensive trading insights and recommendations
3. Ensure signal quality, cross-asset consistency, and scenario-aware risk management

When creating the final summary, consider:
- Signal strength and confidence across technical and fundamental dimensions
- Cross-asset correlations and relative value opportunities identified
- Scenario outcomes and their probability-weighted impact on positions
- Risk/reward profiles for recommended trades
- Hedging strategies and downside protection measures
- Clear actionable recommendations with entry/exit levels and position sizing guidance

Be concise but thorough. Your summary will be used by traders and portfolio managers for decision-making."""

    def __init__(self):
        super().__init__(
            agents={
                "signal_generator": SignalGenerator(),
                "cross_asset_analyst": CrossAssetAnalyst(),
                "scenario_modeler": ScenarioModeler(),
            }
        )

    def run_assessment(
        self,
        entity_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Run the trading insights assessment workflow."""
        signal_result = None
        cross_asset_result = None
        scenario_result = None

        input_text = self._build_input_text(entity_id, context)

        if assessment_type == "full":
            results = self.run_parallel(
                ["signal_generator", "cross_asset_analyst", "scenario_modeler"],
                input_text
            )
            signal_result = {"agent": "signal_generator", "entity_id": entity_id, "analysis": results["signal_generator"].output}
            cross_asset_result = {"agent": "cross_asset_analyst", "entity_id": entity_id, "analysis": results["cross_asset_analyst"].output}
            scenario_result = {"agent": "scenario_modeler", "entity_id": entity_id, "analysis": results["scenario_modeler"].output}
        elif assessment_type == "signal_generation":
            result = self.run_agent("signal_generator", input_text)
            signal_result = {"agent": "signal_generator", "entity_id": entity_id, "analysis": result.output}
        elif assessment_type == "cross_asset_analysis":
            results = self.run_parallel(["signal_generator", "cross_asset_analyst"], input_text)
            signal_result = {"agent": "signal_generator", "entity_id": entity_id, "analysis": results["signal_generator"].output}
            cross_asset_result = {"agent": "cross_asset_analyst", "entity_id": entity_id, "analysis": results["cross_asset_analyst"].output}
        elif assessment_type == "scenario_modeling":
            results = self.run_parallel(["cross_asset_analyst", "scenario_modeler"], input_text)
            cross_asset_result = {"agent": "cross_asset_analyst", "entity_id": entity_id, "analysis": results["cross_asset_analyst"].output}
            scenario_result = {"agent": "scenario_modeler", "entity_id": entity_id, "analysis": results["scenario_modeler"].output}

        synthesis_prompt = self._build_synthesis_prompt(signal_result, cross_asset_result, scenario_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "entity_id": entity_id,
            "signal_generator_result": signal_result,
            "cross_asset_analyst_result": cross_asset_result,
            "scenario_modeler_result": scenario_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        entity_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        signal_result = None
        cross_asset_result = None
        scenario_result = None

        if assessment_type == "full":
            signal_result, cross_asset_result, scenario_result = await asyncio.gather(
                generate_signals(entity_id, context),
                analyze_cross_asset(entity_id, context),
                model_scenarios(entity_id, context),
            )
        elif assessment_type == "signal_generation":
            signal_result = await generate_signals(entity_id, context)
        elif assessment_type == "cross_asset_analysis":
            signal_result, cross_asset_result = await asyncio.gather(
                generate_signals(entity_id, context),
                analyze_cross_asset(entity_id, context),
            )
        elif assessment_type == "scenario_modeling":
            cross_asset_result, scenario_result = await asyncio.gather(
                analyze_cross_asset(entity_id, context),
                model_scenarios(entity_id, context),
            )

        synthesis_prompt = self._build_synthesis_prompt(signal_result, cross_asset_result, scenario_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "entity_id": entity_id,
            "signal_generator_result": signal_result,
            "cross_asset_analyst_result": cross_asset_result,
            "scenario_modeler_result": scenario_result,
            "final_summary": summary,
        }

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive analysis for trading portfolio: {entity_id}

Steps to follow:
1. Retrieve the portfolio profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant market data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(self, signal_result, cross_asset_result, scenario_result) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if signal_result:
            sections.append(f"## Signal Generation\n{json.dumps(signal_result, indent=2)}")
        if cross_asset_result:
            sections.append(f"## Cross-Asset Analysis\n{json.dumps(cross_asset_result, indent=2)}")
        if scenario_result:
            sections.append(f"## Scenario Modeling\n{json.dumps(scenario_result, indent=2)}")

        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide final trading insights:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Overall Signal Strength and Confidence
2. Key Cross-Asset Opportunities
3. Scenario Outcomes and Risk Assessment
4. Actionable Trading Recommendations
5. Hedging and Risk Management Guidance"""



async def run_trading_insights(request):
    """Run the trading insights assessment workflow."""
    orchestrator = TradingInsightsOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id,
        assessment_type=request.assessment_type.value if hasattr(request.assessment_type, 'value') else str(request.assessment_type),
        context=getattr(request, 'additional_context', None))

    insights_detail = None
    recommendations = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("signal_strength") is not None:
            insights_detail = InsightsDetail(
                signal_strength=SignalStrength(structured.get("signal_strength", "neutral")),
                scenario_likelihood=ScenarioLikelihood(structured.get("scenario_likelihood", "medium")),
                signals_identified=structured.get("signals_identified", []),
                cross_asset_opportunities=structured.get("cross_asset_opportunities", []),
                scenario_outcomes=structured.get("scenario_outcomes", []),
                confidence_score=structured.get("confidence_score", 0.0))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return InsightsResponse(
        entity_id=request.entity_id, insights_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        insights_detail=insights_detail, recommendations=recommendations, summary=summary,
        raw_analysis={"signal_generator": final_state.get("signal_generator_result"),
                      "cross_asset_analyst": final_state.get("cross_asset_analyst_result"),
                      "scenario_modeler": final_state.get("scenario_modeler_result")},
    )
