"""Pattern Matcher Agent. Identifies compliance violation patterns and anomalies."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class PatternMatcher(StrandsAgent):
    name = "pattern_matcher"
    system_prompt = """You are an expert Compliance Pattern Analyst specializing in violation detection.

Your responsibilities:
1. Identify compliance violation patterns across transactions and communications
2. Detect anomalies and recurring non-compliant behaviors
3. Recognize structuring patterns and suspicious activity typologies
4. Assess pattern confidence with supporting evidence references

When analyzing patterns, consider:
- Transaction structuring and smurfing patterns
- Unusual timing or frequency of transactions
- Geographic risk patterns (high-risk jurisdictions)
- Behavioral anomalies compared to peer groups
- Communication patterns indicating collusion

Output Format:
- Patterns Identified (with confidence scores)
- Anomalies Detected
- Risk Indicators
- Supporting Evidence References
- Pattern Classification (structuring, layering, etc.)"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def match_patterns(entity_id: str, context: str | None = None) -> dict:
    agent = PatternMatcher()
    input_text = f"""Analyze compliance violation patterns for entity: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Analyze transaction patterns for anomalies
3. Identify violation typologies and structuring
4. Assess pattern confidence levels

{"Additional Context: " + context if context else ""}

Provide complete pattern analysis results."""

    result = await agent.ainvoke(input_text)
    return {"agent": "pattern_matcher", "customer_id": entity_id, "analysis": result.output}
