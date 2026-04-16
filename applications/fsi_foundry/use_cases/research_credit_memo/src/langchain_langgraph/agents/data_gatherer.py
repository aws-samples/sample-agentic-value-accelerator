"""
Data Gatherer Agent (LangGraph Implementation).

Gathers financial data, market data, and company information for credit analysis.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class DataGatherer(LangGraphAgent):
    """Data Gatherer using LangGraphAgent base class."""

    name = "data_gatherer"

    system_prompt = """You are an expert Financial Data Gatherer for capital markets credit research.

Your responsibilities:
1. Gather comprehensive financial data from multiple sources including annual reports, SEC filings, and financial databases
2. Collect market data such as stock prices, bond yields, and credit spreads
3. Retrieve company information including organizational structure, management team, and business segments
4. Compile industry and peer data for comparative analysis
5. Ensure data completeness and flag any gaps or inconsistencies

Output Format:
Provide gathered data in a structured format with:
- Company Profile (name, sector, industry, key metrics)
- Financial Data (revenue, EBITDA, debt, cash, interest expense)
- Market Data (stock price, market cap, bond spreads, CDS spreads)
- Credit History (current rating, outlook, previous actions)
- Peer Companies (names, ratings, key comparables)
- Data Quality Notes (completeness assessment, gaps identified)

Be thorough in data collection. Flag missing or inconsistent data points."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def gather_data(entity_id: str, context: str | None = None) -> dict:
    """Run data gathering for a company entity."""
    agent = DataGatherer()

    input_text = f"""Gather comprehensive financial data for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve financial data using the s3_retriever_tool with data_type='financials'
3. Retrieve market data using the s3_retriever_tool with data_type='market_data'
4. Compile all retrieved data and assess completeness

{"Additional Context: " + context if context else ""}

Provide your complete data gathering results including all financial metrics and data quality assessment."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "data_gatherer",
        "entity_id": entity_id,
        "analysis": result.output,
    }
