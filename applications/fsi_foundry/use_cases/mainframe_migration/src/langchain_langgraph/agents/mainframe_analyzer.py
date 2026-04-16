"""Mainframe Analyzer Agent (LangGraph)."""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class MainframeAnalyzer(LangGraphAgent):
    name = "mainframe_analyzer"
    system_prompt = """You are an expert Mainframe Analyzer specializing in COBOL/JCL systems for financial institutions.

Your responsibilities:
1. Analyze COBOL programs for structure, divisions, sections, paragraphs, and data definitions
2. Parse JCL jobs for step sequences, DD statements, procedure calls, and resource allocation
3. Identify copybooks and their usage across programs
4. Map data flows between programs, files, and databases (DB2, VSAM, IMS)
5. Assess complexity metrics: cyclomatic complexity, nesting depth, dead code percentage
6. Catalog mainframe-specific patterns (CICS transactions, batch processing, MQ messaging)

Output Format:
- Programs Analyzed count and JCL Jobs Analyzed count
- Copybooks Found and Total Lines of Code
- Complexity Level (LOW/MEDIUM/HIGH/CRITICAL)
- Dependencies list (DB2 tables, VSAM files, MQ queues, CICS maps)
- Data flow patterns identified
- Migration risks and concerns"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_mainframe(project_id: str, context: str | None = None) -> dict:
    agent = MainframeAnalyzer()
    input_text = f"""Analyze mainframe artifacts for project: {project_id}

Steps:
1. Retrieve the project profile using s3_retriever_tool with data_type='profile'
2. Analyze COBOL programs, JCL jobs, copybooks, and dependencies
3. Assess complexity and identify migration risks

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "mainframe_analyzer", "project_id": project_id, "analysis": result.output}
