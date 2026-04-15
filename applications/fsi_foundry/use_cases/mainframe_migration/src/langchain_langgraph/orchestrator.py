"""Mainframe Migration Orchestrator (LangGraph)."""

import json, uuid, asyncio
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

from base.langgraph import LangGraphOrchestrator
from use_cases.mainframe_migration.agents import MainframeAnalyzer, BusinessRuleExtractor, CloudCodeGenerator
from use_cases.mainframe_migration.agents.mainframe_analyzer import analyze_mainframe
from use_cases.mainframe_migration.agents.business_rule_extractor import extract_business_rules
from use_cases.mainframe_migration.agents.cloud_code_generator import generate_cloud_code
from use_cases.mainframe_migration.models import (
    MainframeMigrationRequest, MainframeMigrationResponse, MigrationScope,
    MainframeAnalysisResult, BusinessRuleResult, CloudCodeResult, ComplexityLevel,
)


class MainframeMigrationSynthesisSchema(BaseModel):
    complexity_level: str = Field(default="medium")
    programs_analyzed: int = Field(default=0)
    jcl_jobs_analyzed: int = Field(default=0)
    dependencies: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    rules_extracted: int = Field(default=0)
    extraction_confidence: float = Field(default=0.0)
    files_generated: int = Field(default=0)
    generation_quality_score: float = Field(default=0.0)
    services_mapped: list[str] = Field(default_factory=list)
    summary: str = Field(..., description="Executive summary of the migration analysis")


class MainframeMigrationState(TypedDict):
    messages: Annotated[list, add_messages]
    project_id: str
    migration_scope: str
    mainframe_analyzer_result: dict | None
    business_rule_extractor_result: dict | None
    cloud_code_generator_result: dict | None
    final_summary: str | None


class MainframeMigrationOrchestrator(LangGraphOrchestrator):
    name = "mainframe_migration_orchestrator"
    state_schema = MainframeMigrationState

    system_prompt = """You are a Senior Mainframe Migration Architect for financial services institutions.

Your role is to:
1. Coordinate specialist agents (Mainframe Analyzer, Business Rule Extractor, Cloud Code Generator)
2. Synthesize their findings into a comprehensive mainframe migration assessment
3. Ensure mainframe systems are migrated to cloud-native architectures safely and accurately

When creating the final summary, consider:
- Mainframe analysis completeness and COBOL/JCL dependency mapping accuracy
- Business rule extraction confidence and coverage of critical logic paths
- Cloud code generation quality and functional equivalence scores
- Migration readiness, risks, and recommended next steps
- Compliance and regulatory considerations for financial systems
- Data integrity and transaction consistency during migration

Be concise but thorough. Your summary will be used by engineering teams and stakeholders."""

    def __init__(self):
        super().__init__(agents={
            "mainframe_analyzer": MainframeAnalyzer(),
            "business_rule_extractor": BusinessRuleExtractor(),
            "cloud_code_generator": CloudCodeGenerator(),
        })

    def build_graph(self):
        workflow = StateGraph(MainframeMigrationState)
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("mainframe_analyzer", self._mainframe_analyzer_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment",
            "mainframe_analyzer": "mainframe_analyzer",
        })
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("mainframe_analyzer", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state) -> Literal["parallel_assessment", "mainframe_analyzer", "synthesize"]:
        scope = state.get("migration_scope", "full")
        analysis_done = state.get("mainframe_analyzer_result") is not None

        if scope == "mainframe_analysis":
            return "synthesize" if analysis_done else "mainframe_analyzer"
        # full, rule_extraction, code_generation all go through parallel
        return "synthesize" if analysis_done else "parallel_assessment"

    async def _parallel_assessment_node(self, state):
        project_id = state["project_id"]
        context = self._extract_context(state)
        scope = state.get("migration_scope", "full")
        messages = list(state["messages"])
        analysis = rules = code = None

        if scope == "rule_extraction":
            analysis, rules = await asyncio.gather(
                analyze_mainframe(project_id, context),
                extract_business_rules(project_id, context),
            )
        elif scope == "code_generation" or scope == "full":
            analysis, rules, code = await asyncio.gather(
                analyze_mainframe(project_id, context),
                extract_business_rules(project_id, context),
                generate_cloud_code(project_id, context),
            )

        for label, result in [("Mainframe Analysis", analysis), ("Business Rules", rules), ("Cloud Code", code)]:
            if result:
                messages.append(AIMessage(content=f"{label}: {json.dumps(result, indent=2)}"))

        return {**state, "mainframe_analyzer_result": analysis, "business_rule_extractor_result": rules,
                "cloud_code_generator_result": code, "messages": messages}

    async def _mainframe_analyzer_node(self, state):
        result = await analyze_mainframe(state["project_id"], self._extract_context(state))
        return {**state, "mainframe_analyzer_result": result,
                "messages": state["messages"] + [AIMessage(content=f"Analysis: {json.dumps(result, indent=2)}")]}

    async def _synthesize_node(self, state):
        sections = []
        for key, val in state.items():
            if val and key not in ("messages", "project_id", "migration_scope", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")

        prompt = f"""Based on the following assessments, produce a structured migration analysis response:

{chr(10).join(sections)}"""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(MainframeMigrationSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception:
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"):
                return last.content
        return None


async def run_mainframe_migration(request):
    orchestrator = MainframeMigrationOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin mainframe migration analysis for: {request.project_id}")],
        "project_id": request.project_id,
        "migration_scope": request.migration_scope.value if hasattr(request.migration_scope, 'value') else str(request.migration_scope),
    }
    for key in [k for k in MainframeMigrationState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    summary = "Migration analysis completed"
    mainframe_analysis = business_rules = cloud_code = None
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if structured.get("complexity_level"):
            mainframe_analysis = MainframeAnalysisResult(
                complexity_level=ComplexityLevel(structured.get("complexity_level", "medium")),
                programs_analyzed=structured.get("programs_analyzed", 0),
                jcl_jobs_analyzed=structured.get("jcl_jobs_analyzed", 0),
                dependencies=structured.get("dependencies", []),
                risks=structured.get("risks", []),
            )
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return MainframeMigrationResponse(
        project_id=request.project_id,
        migration_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        mainframe_analysis=mainframe_analysis,
        business_rules=business_rules,
        cloud_code=cloud_code,
        summary=summary,
        raw_analysis={
            "mainframe_analyzer": final_state.get("mainframe_analyzer_result"),
            "business_rule_extractor": final_state.get("business_rule_extractor_result"),
            "cloud_code_generator": final_state.get("cloud_code_generator_result"),
        },
    )
