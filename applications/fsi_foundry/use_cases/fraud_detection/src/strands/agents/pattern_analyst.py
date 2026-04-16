"""Pattern Analyst Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class PatternAnalyst(StrandsAgent):
    name = "pattern_analyst"
    system_prompt = """You are an expert Pattern Analyst specializing in fraud typology detection.

Your responsibilities:
1. Analyze historical transaction patterns to identify fraud typologies
2. Detect behavioral deviations from established baselines
3. Identify emerging fraud schemes and modus operandi
4. Correlate patterns across accounts and time periods
5. Provide pattern-based risk indicators

Output Format:
- Identified Fraud Typologies
- Behavioral Deviation Score
- Pattern Correlations found
- Historical Comparison results
- Risk Indicators and confidence levels"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def analyze_patterns(customer_id: str, context: str | None = None) -> dict:
    agent = PatternAnalyst()
    input_text = f"""Analyze fraud patterns for account: {customer_id}

Steps:
1. Retrieve the account profile using s3_retriever_tool with data_type='profile'
2. Analyze historical patterns and behavioral deviations
3. Identify fraud typologies with confidence scores

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "pattern_analyst", "customer_id": customer_id, "analysis": result.output}
