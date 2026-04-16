"""Mainframe Migration Orchestrator (Strands)."""

import json, uuid, asyncio
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import MainframeAnalyzer, BusinessRuleExtractor, CloudCodeGenerator
from .agents.mainframe_analyzer import analyze_mainframe
from .agents.business_rule_extractor import extract_business_rules
from .agents.cloud_code_generator import generate_cloud_code
from utils.json_extract import extract_json
from .models import (
    MainframeMigrationRequest, MainframeMigrationResponse, MigrationScope,
    MainframeAnalysisResult, BusinessRuleResult, CloudCodeResult, ComplexityLevel,
)


class MainframeMigrationOrchestrator(StrandsOrchestrator):
    name = "mainframe_migration_orchestrator"
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

    async def arun_assessment(self, project_id, migration_scope="full", context=None):
        analysis_result = rules_result = code_result = None

        if migration_scope == "full":
            analysis_result, rules_result, code_result = await asyncio.gather(
                analyze_mainframe(project_id, context),
                extract_business_rules(project_id, context),
                generate_cloud_code(project_id, context),
            )
        elif migration_scope == "mainframe_analysis":
            analysis_result = await analyze_mainframe(project_id, context)
        elif migration_scope == "rule_extraction":
            analysis_result, rules_result = await asyncio.gather(
                analyze_mainframe(project_id, context),
                extract_business_rules(project_id, context),
            )
        elif migration_scope == "code_generation":
            analysis_result, rules_result, code_result = await asyncio.gather(
                analyze_mainframe(project_id, context),
                extract_business_rules(project_id, context),
                generate_cloud_code(project_id, context),
            )

        sections = []
        if analysis_result:
            sections.append(f"## Mainframe Analysis\n{json.dumps(analysis_result, indent=2)}")
        if rules_result:
            sections.append(f"## Business Rule Extraction\n{json.dumps(rules_result, indent=2)}")
        if code_result:
            sections.append(f"## Cloud Code Generation\n{json.dumps(code_result, indent=2)}")

        prompt = f"""Based on the following specialist assessments, provide a comprehensive mainframe migration summary:

{chr(10).join(sections)}

Include: overall complexity, migration readiness, key risks, and actionable recommendations."""

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, prompt))

        return {
            "project_id": project_id,
            "mainframe_analyzer_result": analysis_result,
            "business_rule_extractor_result": rules_result,
            "cloud_code_generator_result": code_result,
            "final_summary": summary,
        }


async def run_mainframe_migration(request):
    orchestrator = MainframeMigrationOrchestrator()
    state = await orchestrator.arun_assessment(
        project_id=request.project_id,
        migration_scope=request.migration_scope.value if hasattr(request.migration_scope, 'value') else str(request.migration_scope),
        context=getattr(request, 'additional_context', None),
    )

    summary = "Migration analysis completed"
    mainframe_analysis = business_rules = cloud_code = None
    try:
        structured = extract_json(state.get("final_summary", "{}"))
        summary = structured.get("summary", str(state.get("final_summary", summary)))
        if structured.get("complexity_level"):
            mainframe_analysis = MainframeAnalysisResult(
                complexity_level=ComplexityLevel(structured.get("complexity_level", "medium")),
                programs_analyzed=structured.get("programs_analyzed", 0),
                jcl_jobs_analyzed=structured.get("jcl_jobs_analyzed", 0),
                dependencies=structured.get("dependencies", []),
                risks=structured.get("risks", []),
            )
    except Exception:
        summary = str(state.get("final_summary", summary))

    return MainframeMigrationResponse(
        project_id=request.project_id,
        migration_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        mainframe_analysis=mainframe_analysis,
        business_rules=business_rules,
        cloud_code=cloud_code,
        summary=summary,
        raw_analysis={
            "mainframe_analyzer": state.get("mainframe_analyzer_result"),
            "business_rule_extractor": state.get("business_rule_extractor_result"),
            "cloud_code_generator": state.get("cloud_code_generator_result"),
        },
    )
