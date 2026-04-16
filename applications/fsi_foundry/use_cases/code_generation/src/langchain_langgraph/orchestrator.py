"""Code Generation Orchestrator. Coordinates requirement analysis, scaffolding, and test generation."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
from use_cases.code_generation.agents import RequirementAnalyst, CodeScaffolder, TestGenerator
from use_cases.code_generation.agents.requirement_analyst import analyze_requirements
from use_cases.code_generation.agents.code_scaffolder import scaffold_code
from use_cases.code_generation.agents.test_generator import generate_tests
from utils.json_extract import extract_json
from use_cases.code_generation.models import (
    GenerationScope, GenerationRequest, GenerationResponse,
    RequirementAnalysisResult, ScaffoldedCodeResult, TestGenerationResult, CodeQuality,
)




class CodeGenerationState(TypedDict):
    messages: Annotated[list, add_messages]
    project_id: str
    generation_scope: str
    requirement_analyst_result: dict | None
    code_scaffolder_result: dict | None
    test_generator_result: dict | None
    final_summary: str | None


class CodeGenerationOrchestrator(LangGraphOrchestrator):
    name = "code_generation_orchestrator"
    state_schema = CodeGenerationState
    system_prompt = """You are a Senior Software Engineering Lead specializing in AI-powered code generation.

Your role is to:
1. Coordinate specialist agents (Requirement Analyst, Code Scaffolder, Test Generator)
2. Synthesize their findings into a comprehensive code generation report
3. Ensure generated code meets quality standards and requirements

Be concise but thorough. Your summary will be used by development teams and technical leads."""

    def __init__(self):
        super().__init__(agents={
            "requirement_analyst": RequirementAnalyst(),
            "code_scaffolder": CodeScaffolder(),
            "test_generator": TestGenerator(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(CodeGenerationState)
        workflow.add_node("parallel_assessment", self._parallel_node)
        workflow.add_node("requirement_analyst", self._requirement_node)
        workflow.add_node("code_scaffolder", self._scaffolder_node)
        workflow.add_node("test_generator", self._test_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment",
            "requirement_analyst": "requirement_analyst",
            "code_scaffolder": "code_scaffolder",
            "test_generator": "test_generator",
        })
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("requirement_analyst", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("code_scaffolder", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("test_generator", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state) -> Literal["parallel_assessment", "requirement_analyst", "code_scaffolder", "test_generator", "synthesize"]:
        scope = state.get("generation_scope", "full")
        ra = state.get("requirement_analyst_result") is not None
        cs = state.get("code_scaffolder_result") is not None
        tg = state.get("test_generator_result") is not None
        if scope == "requirements_only": return "synthesize" if ra else "requirement_analyst"
        if scope == "scaffolding_only": return "synthesize" if cs else "code_scaffolder"
        if scope == "testing_only": return "synthesize" if tg else "test_generator"
        if not ra and not cs and not tg: return "parallel_assessment"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        pid, ctx = state["project_id"], self._extract_context(state)
        ra, cs, tg = await asyncio.gather(analyze_requirements(pid, ctx), scaffold_code(pid, ctx), generate_tests(pid, ctx))
        return {**state, "requirement_analyst_result": ra, "code_scaffolder_result": cs, "test_generator_result": tg,
                "messages": state["messages"] + [AIMessage(content=f"Requirements: {json.dumps(ra, indent=2)}"), AIMessage(content=f"Scaffolding: {json.dumps(cs, indent=2)}"), AIMessage(content=f"Tests: {json.dumps(tg, indent=2)}")]}

    async def _requirement_node(self, state):
        r = await analyze_requirements(state["project_id"], self._extract_context(state))
        return {**state, "requirement_analyst_result": r, "messages": state["messages"] + [AIMessage(content=f"Requirements: {json.dumps(r, indent=2)}")]}

    async def _scaffolder_node(self, state):
        r = await scaffold_code(state["project_id"], self._extract_context(state))
        return {**state, "code_scaffolder_result": r, "messages": state["messages"] + [AIMessage(content=f"Scaffolding: {json.dumps(r, indent=2)}")]}

    async def _test_node(self, state):
        r = await generate_tests(state["project_id"], self._extract_context(state))
        return {**state, "test_generator_result": r, "messages": state["messages"] + [AIMessage(content=f"Tests: {json.dumps(r, indent=2)}")]}

    async def _synthesize_node(self, state):
        sections = []
        if state.get("requirement_analyst_result"):
            sections.append(f"## Requirement Analysis\n{json.dumps(state['requirement_analyst_result'], indent=2)}")
        if state.get("code_scaffolder_result"):
            sections.append(f"## Code Scaffolding\n{json.dumps(state['code_scaffolder_result'], indent=2)}")
        if state.get("test_generator_result"):
            sections.append(f"## Test Generation\n{json.dumps(state['test_generator_result'], indent=2)}")
        synthesis_prompt = f"""You are a Senior Software Engineering Lead. Based on the following specialist assessments, produce a structured code generation report.

{chr(10).join(sections)}

IMPORTANT: Extract actual values from the agent assessments above. Do NOT use default values.

Respond ONLY with a JSON object (no markdown, no explanation) containing these keys:
- requirement_analysis: {{functional_requirements: [...], non_functional_requirements: [...], dependencies: [...], data_models: [...], risks: [...]}}
- scaffolded_code: {{files_generated: int, project_structure: [...], design_patterns_applied: [...], code_quality: "medium" or "high", boilerplate_components: [...]}}
- test_generation: {{unit_tests_generated: int, integration_tests_generated: int, test_coverage_estimate: float, test_frameworks_used: [...], test_fixtures_created: [...]}}
- summary: "executive summary string"
"""
        try:
            llm = self._create_llm()
            result = await llm.ainvoke(synthesis_prompt)
            raw_text = result.content if hasattr(result, "content") else str(result)
            structured = extract_json(raw_text) if raw_text else {}
            if not structured.get("summary"):
                structured["summary"] = raw_text
        except Exception:
            structured = {"summary": "Code generation analysis completed."}
        return {**state, "final_summary": json.dumps(structured), "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")]}

    def _extract_context(self, state) -> str | None:
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


async def run_code_generation(request: GenerationRequest) -> GenerationResponse:
    orchestrator = CodeGenerationOrchestrator()
    initial_state: CodeGenerationState = {
        "messages": [HumanMessage(content=f"Begin code generation for project: {request.project_id}")],
        "project_id": request.project_id, "generation_scope": request.generation_scope.value,
        "requirement_analyst_result": None, "code_scaffolder_result": None, "test_generator_result": None, "final_summary": None}
    if request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Additional context: {request.additional_context}"))

    final_state = await orchestrator.arun(initial_state)

    requirement_analysis = scaffolded_code = test_output = None
    summary = "Generation completed"
    try:
        raw_summary = final_state.get("final_summary", "{}")
        try:
            structured = json.loads(raw_summary)
        except (json.JSONDecodeError, Exception):
            structured = extract_json(raw_summary) if raw_summary else {}
        summary = structured.get("summary", raw_summary if raw_summary else summary)
        if request.generation_scope in [GenerationScope.FULL, GenerationScope.REQUIREMENTS_ONLY]:
            ra = structured.get("requirement_analysis", {}) if isinstance(structured.get("requirement_analysis"), dict) else {}
            requirement_analysis = RequirementAnalysisResult(
                functional_requirements=structured.get("req_functional_requirements") or ra.get("functional_requirements", []),
                non_functional_requirements=structured.get("req_non_functional_requirements") or ra.get("non_functional_requirements", []),
                dependencies=structured.get("req_dependencies") or ra.get("dependencies", []),
                data_models=structured.get("req_data_models") or ra.get("data_models", []),
                risks=structured.get("req_risks") or ra.get("risks", []))
        if request.generation_scope in [GenerationScope.FULL, GenerationScope.SCAFFOLDING_ONLY]:
            sc = next((structured[k] for k in ("scaffolded_code", "scaffolding", "code_scaffolding") if isinstance(structured.get(k), dict)), {})
            scaffolded_code = ScaffoldedCodeResult(
                files_generated=structured.get("scaffold_files_generated") or sc.get("files_generated", 0),
                project_structure=structured.get("scaffold_project_structure") or sc.get("project_structure", []),
                design_patterns_applied=structured.get("scaffold_design_patterns") or sc.get("design_patterns_applied", []),
                code_quality=CodeQuality(structured.get("scaffold_code_quality") or sc.get("code_quality", "medium")),
                boilerplate_components=structured.get("scaffold_boilerplate") or sc.get("boilerplate_components", []))
        if request.generation_scope in [GenerationScope.FULL, GenerationScope.TESTING_ONLY]:
            tg = next((structured[k] for k in ("test_generation", "test_output", "tests", "testing", "test_results") if isinstance(structured.get(k), dict)), {})
            test_output = TestGenerationResult(
                unit_tests_generated=structured.get("test_unit_count") or tg.get("unit_tests_generated", 0),
                integration_tests_generated=structured.get("test_integration_count") or tg.get("integration_tests_generated", 0),
                test_coverage_estimate=float(structured.get("test_coverage_estimate") or tg.get("test_coverage_estimate", 0.0)),
                test_frameworks_used=structured.get("test_frameworks") or tg.get("test_frameworks_used", []),
                test_fixtures_created=structured.get("test_fixtures") or tg.get("test_fixtures_created", []))
    except (json.JSONDecodeError, Exception):
        summary = final_state.get("final_summary", summary)

    # Fallback: extract structured data from raw agent analysis when synthesis didn't produce nested keys
    if requirement_analysis and not requirement_analysis.functional_requirements:
        try:
            raw = extract_json(final_state.get("requirement_analyst_result", {}).get("analysis", "{}"))
            if raw.get("functional_requirements"):
                requirement_analysis = RequirementAnalysisResult(**raw)
        except Exception:
            pass
    if test_output and test_output.unit_tests_generated == 0:
        # Try top-level keys from synthesis (LLM may not nest under test_generation)
        if structured.get("unit_tests_generated"):
            try:
                test_output = TestGenerationResult(
                    unit_tests_generated=structured.get("unit_tests_generated", 0),
                    integration_tests_generated=structured.get("integration_tests_generated", 0),
                    test_coverage_estimate=float(structured.get("test_coverage_estimate", 0.0)),
                    test_frameworks_used=structured.get("test_frameworks_used", structured.get("test_frameworks", [])),
                    test_fixtures_created=structured.get("test_fixtures_created", structured.get("test_fixtures", [])))
            except Exception:
                pass
        # Try extracting from raw agent text
        if test_output.unit_tests_generated == 0:
            try:
                raw = extract_json(final_state.get("test_generator_result", {}).get("analysis", "{}"))
                if raw.get("unit_tests_generated"):
                    test_output = TestGenerationResult(**raw)
            except Exception:
                pass

    # Ensure result objects exist for their respective scopes even if synthesis parsing failed
    if request.generation_scope in [GenerationScope.FULL, GenerationScope.TESTING_ONLY] and test_output is None:
        test_output = TestGenerationResult()
    if request.generation_scope in [GenerationScope.FULL, GenerationScope.SCAFFOLDING_ONLY] and scaffolded_code is None:
        scaffolded_code = ScaffoldedCodeResult()
    if request.generation_scope in [GenerationScope.FULL, GenerationScope.REQUIREMENTS_ONLY] and requirement_analysis is None:
        requirement_analysis = RequirementAnalysisResult()

    return GenerationResponse(
        project_id=request.project_id, generation_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        requirement_analysis=requirement_analysis, scaffolded_code=scaffolded_code, test_output=test_output,
        summary=summary, raw_analysis={"requirement_analysis": final_state.get("requirement_analyst_result"),
        "scaffolded_code": final_state.get("code_scaffolder_result"), "test_generation": final_state.get("test_generator_result")},
    )
