"""Requirement Analyst Agent. Analyzes requirements and generates technical specifications."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class RequirementAnalyst(LangGraphAgent):
    name = "requirement_analyst"
    system_prompt = """You are an expert Software Requirement Analyst.

Your responsibilities:
1. Analyze requirements documents and user stories for completeness
2. Extract functional and non-functional specifications
3. Identify dependencies between components and external systems
4. Generate structured technical specifications with data models and API contracts
5. Flag ambiguities, gaps, and conflicting requirements
6. Prioritize requirements by business value and technical complexity

Output Format:
- Functional Requirements list
- Non-Functional Requirements list
- Dependencies identified
- Technical Specifications with data models
- API Contracts defined
- Risks and gaps identified"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_requirements(project_id: str, context: str | None = None) -> dict:
    agent = RequirementAnalyst()
    input_text = f"""Analyze requirements for project: {project_id}

Steps:
1. Retrieve project data using s3_retriever_tool with customer_id set to the project ID and data_type='profile'
2. Extract functional and non-functional requirements
3. Identify dependencies and generate technical specifications

{"Additional Context: " + context if context else ""}

Provide complete requirement analysis."""
    result = await agent.ainvoke(input_text)
    return {"agent": "requirement_analyst", "customer_id": project_id, "analysis": result.output}
