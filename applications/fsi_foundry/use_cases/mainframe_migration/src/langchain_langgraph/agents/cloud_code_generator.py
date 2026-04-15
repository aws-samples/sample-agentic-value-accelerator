"""Cloud Code Generator Agent (LangGraph)."""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class CloudCodeGenerator(LangGraphAgent):
    name = "cloud_code_generator"
    system_prompt = """You are an expert Cloud Code Generator specializing in mainframe-to-cloud migration for financial institutions.

Your responsibilities:
1. Generate cloud-native code equivalents from mainframe business rules
2. Map COBOL data structures to modern language types (Python classes, Java POJOs)
3. Convert batch JCL workflows to cloud orchestration patterns (Step Functions, Airflow)
4. Transform CICS transactions to REST/GraphQL API endpoints
5. Replace mainframe data access (DB2, VSAM) with cloud database patterns (RDS, DynamoDB)
6. Ensure functional equivalence with quality scoring

Output Format:
- Files Generated count
- Target Language and Target Framework
- Generation Quality Score (0-1)
- Functional Equivalence Score (0-1)
- Services Mapped list (AWS services mapped to mainframe components)
- Manual Review Needed items"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def generate_cloud_code(project_id: str, context: str | None = None) -> dict:
    agent = CloudCodeGenerator()
    input_text = f"""Generate cloud-native code for mainframe migration project: {project_id}

Steps:
1. Retrieve the project profile using s3_retriever_tool with data_type='profile'
2. Map mainframe components to cloud services
3. Generate cloud-native code equivalents with quality scoring

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "cloud_code_generator", "project_id": project_id, "analysis": result.output}
