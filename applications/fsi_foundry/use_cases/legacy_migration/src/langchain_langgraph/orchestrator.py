"""Legacy Migration Orchestrator (LangGraph)."""
import json, uuid
from typing import TypedDict, Annotated
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
from use_cases.legacy_migration.agents import CodeAnalyzer, MigrationPlanner, ConversionAgent
from use_cases.legacy_migration.agents.code_analyzer import analyze_code
from use_cases.legacy_migration.agents.migration_planner import plan_migration
from use_cases.legacy_migration.agents.conversion_agent import convert_code
from use_cases.legacy_migration.models import (MigrationRequest, MigrationResponse, MigrationScope, CodeAnalysisResult, MigrationPlanResult, ConversionResult, ComplexityLevel)
from utils.json_extract import extract_json
from pydantic import BaseModel, Field


class LegacyMigrationSynthesisSchema(BaseModel):
    complexity_level: str = Field(default="medium", description="Complexity: low, medium, high, critical")
    languages_detected: list[str] = Field(default_factory=list, description="Programming languages found")
    estimated_effort_days: int = Field(default=0, description="Estimated effort in days")
    conversion_confidence: float = Field(default=0.0, description="Conversion confidence 0.0-1.0")
    risks: list[str] = Field(default_factory=list, description="Key risks identified")
    recommendations: list[str] = Field(default_factory=list, description="Actionable recommendations")
    summary: str = Field(..., description="Executive summary with migration readiness, key findings, risks, and next steps")


class LegacyMigrationState(TypedDict):
    messages: Annotated[list, add_messages]
    project_id: str
    migration_scope: str
    code_analyzer_result: dict | None
    migration_planner_result: dict | None
    conversion_agent_result: dict | None
    final_summary: str | None


class LegacyMigrationOrchestrator(LangGraphOrchestrator):
    name = "legacy_migration_orchestrator"
    state_schema = LegacyMigrationState
    system_prompt = """You are a Senior Legacy Migration Architect for financial services institutions.

Your role is to:
1. Coordinate specialist agents (Code Analyzer, Migration Planner, Conversion Agent)
2. Synthesize their findings into a comprehensive migration assessment
3. Ensure legacy systems are migrated safely and efficiently

When creating the final summary, consider:
- Code analysis completeness and accuracy of dependency mapping
- Migration plan feasibility, risk levels, and phasing strategy
- Conversion confidence scores and areas requiring manual review
- Overall migration readiness and recommended next steps
- Compliance and regulatory considerations for financial systems

Be concise but thorough. Your summary will be used by engineering teams and stakeholders."""

    def __init__(self):
        super().__init__(agents={
            "code_analyzer": CodeAnalyzer(),
            "migration_planner": MigrationPlanner(),
            "conversion_agent": ConversionAgent(),
        })

    def build_graph(self):
        workflow = StateGraph(LegacyMigrationState)
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("code_analyzer", self._code_analyzer_node)
        workflow.add_node("migration_planner", self._migration_planner_node)
        workflow.add_node("conversion_agent", self._conversion_agent_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment", "code_analyzer": "code_analyzer",
            "migration_planner": "migration_planner", "conversion_agent": "conversion_agent"})
        workflow.add_edge("parallel_assessment", "synthesize")
        for node in ["code_analyzer", "migration_planner", "conversion_agent"]:
            workflow.add_conditional_edges(node, self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state):
        scope = state.get("migration_scope", "full")
        ca = state.get("code_analyzer_result") is not None
        mp = state.get("migration_planner_result") is not None
        cv = state.get("conversion_agent_result") is not None
        if scope == "code_analysis":
            return "synthesize" if ca else "code_analyzer"
        if scope == "planning":
            return "synthesize" if ca and mp else "parallel_assessment"
        if scope == "conversion":
            return "synthesize" if ca and cv else "parallel_assessment"
        # full
        return "synthesize" if ca and mp and cv else "parallel_assessment"

    async def _parallel_assessment_node(self, state):
        import asyncio
        project_id = state["project_id"]
        context = self._extract_context(state)
        scope = state.get("migration_scope", "full")
        if scope == "planning":
            ca, mp = await asyncio.gather(analyze_code(project_id, context), plan_migration(project_id, context))
            return {**state, "code_analyzer_result": ca, "migration_planner_result": mp,
                    "messages": state["messages"] + [AIMessage(content="Planning assessments complete")]}
        if scope == "conversion":
            ca, cv = await asyncio.gather(analyze_code(project_id, context), convert_code(project_id, context))
            return {**state, "code_analyzer_result": ca, "conversion_agent_result": cv,
                    "messages": state["messages"] + [AIMessage(content="Conversion assessments complete")]}
        ca, mp, cv = await asyncio.gather(analyze_code(project_id, context), plan_migration(project_id, context), convert_code(project_id, context))
        return {**state, "code_analyzer_result": ca, "migration_planner_result": mp, "conversion_agent_result": cv,
                "messages": state["messages"] + [AIMessage(content="All assessments complete")]}

    async def _code_analyzer_node(self, state):
        result = await analyze_code(state["project_id"], self._extract_context(state))
        return {**state, "code_analyzer_result": result, "messages": state["messages"] + [AIMessage(content=f"Code Analysis: {json.dumps(result, indent=2)}")]}

    async def _migration_planner_node(self, state):
        result = await plan_migration(state["project_id"], self._extract_context(state))
        return {**state, "migration_planner_result": result, "messages": state["messages"] + [AIMessage(content=f"Migration Plan: {json.dumps(result, indent=2)}")]}

    async def _conversion_agent_node(self, state):
        result = await convert_code(state["project_id"], self._extract_context(state))
        return {**state, "conversion_agent_result": result, "messages": state["messages"] + [AIMessage(content=f"Conversion: {json.dumps(result, indent=2)}")]}

    async def _synthesize_node(self, state):
        ca, mp, cv = state.get("code_analyzer_result"), state.get("migration_planner_result"), state.get("conversion_agent_result")
        sections = []
        if ca: sections.append(f"## Code Analysis\n{json.dumps(ca, indent=2)}")
        if mp: sections.append(f"## Migration Plan\n{json.dumps(mp, indent=2)}")
        if cv: sections.append(f"## Conversion\n{json.dumps(cv, indent=2)}")
        synthesis_prompt = f"""You are a Senior Legacy Migration Architect. Based on the following specialist assessments, produce a structured migration synthesis.\n\n{chr(10).join(sections)}\n\nFill in all fields based on the agent assessments above. Use actual findings, data, and details — not generic defaults."""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(LegacyMigrationSynthesisSchema)
            result = await structured_llm.ainvoke(synthesis_prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
            if not structured.get("risks") and not structured.get("recommendations"):
                raise ValueError("structured output returned defaults")
        except Exception:
            raw_summary = await self.synthesize({"ca": ca, "mp": mp, "cv": cv}, synthesis_prompt)
            try:
                structured = extract_json(raw_summary) if raw_summary else {}
            except (ValueError, Exception):
                structured = {}
            if not structured.get("summary"):
                structured["summary"] = raw_summary
        return {**state, "final_summary": json.dumps(structured), "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


async def run_legacy_migration(request: MigrationRequest) -> MigrationResponse:
    orchestrator = LegacyMigrationOrchestrator()
    initial_state: LegacyMigrationState = {
        "messages": [HumanMessage(content=f"Begin legacy migration analysis for: {request.project_id}")],
        "project_id": request.project_id, "migration_scope": request.migration_scope.value,
        "code_analyzer_result": None, "migration_planner_result": None, "conversion_agent_result": None, "final_summary": None}
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)
    code_analysis, migration_plan, conversion_output, summary = None, None, None, "Migration analysis completed"
    try:
        raw = final_state.get("final_summary", "{}")
        try: structured = json.loads(raw)
        except (json.JSONDecodeError, Exception): structured = extract_json(raw) if raw else {}
        summary = structured.get("summary", raw if raw else summary)
        cl = structured.get("complexity_level", "medium")
        if request.migration_scope in [MigrationScope.FULL, MigrationScope.CODE_ANALYSIS, MigrationScope.PLANNING, MigrationScope.CONVERSION]:
            code_analysis = CodeAnalysisResult(
                languages_detected=structured.get("languages_detected", []),
                complexity_level=ComplexityLevel(cl) if cl in [e.value for e in ComplexityLevel] else ComplexityLevel.MEDIUM,
                dependencies=structured.get("dependencies", []), risks=structured.get("risks", []))
        if request.migration_scope in [MigrationScope.FULL, MigrationScope.PLANNING]:
            migration_plan = MigrationPlanResult(
                estimated_effort_days=int(structured.get("estimated_effort_days", 0)),
                risk_assessment=structured.get("risks", []), rollback_strategy=structured.get("rollback_strategy", ""))
        if request.migration_scope in [MigrationScope.FULL, MigrationScope.CONVERSION]:
            conversion_output = ConversionResult(
                conversion_confidence=float(structured.get("conversion_confidence", 0.0)),
                patterns_converted=structured.get("patterns_converted", []), target_framework=structured.get("target_framework", ""))
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary", summary)
    return MigrationResponse(
        project_id=request.project_id, migration_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        code_analysis=code_analysis, migration_plan=migration_plan, conversion_output=conversion_output, summary=summary,
        raw_analysis={"code_analysis": final_state.get("code_analyzer_result"), "migration_plan": final_state.get("migration_planner_result"), "conversion": final_state.get("conversion_agent_result")})
