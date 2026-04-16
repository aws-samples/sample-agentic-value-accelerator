"""
Data Lookup Agent.

Retrieves and summarizes data from internal banking systems.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class DataLookupAgent(LangGraphAgent):
    """Data Lookup Agent using LangGraphAgent base class."""

    name = "data_lookup_agent"

    system_prompt = """You are a Data Lookup specialist for a banking AI assistant system.

Your responsibilities:
1. Retrieve data from internal banking systems and data stores
2. Summarize and contextualize retrieved results
3. Identify relevant data points, trends, and anomalies
4. Provide data freshness and reliability indicators

When performing data lookups, consider:
- Data source reliability and freshness
- Relevance to the employee's specific request
- Cross-referencing multiple data sources for accuracy
- Highlighting key metrics and trends

Output Format:
- Data Sources Consulted
- Key Findings and Metrics
- Data Freshness Indicators
- Contextual Summary with actionable insights"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def lookup_data(employee_id: str, context: str | None = None) -> dict:
    """Perform data lookup for an employee request."""
    agent = DataLookupAgent()

    input_text = f"""Perform data lookup for employee: {employee_id}

Steps:
1. Retrieve employee profile using s3_retriever_tool with data_type='profile'
2. Retrieve relevant data based on the request context
3. Summarize findings with key metrics and insights

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "data_lookup_agent",
        "employee_id": employee_id,
        "lookup_result": result.output,
    }
