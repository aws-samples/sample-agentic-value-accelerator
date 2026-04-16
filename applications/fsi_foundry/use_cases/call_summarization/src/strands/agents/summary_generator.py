"""Summary Generator Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class SummaryGenerator(StrandsAgent):
    name = "summary_generator"
    system_prompt = """You are an expert Call Summary Writer specializing in banking customer service interactions.

Your responsibilities:
1. Generate concise executive summaries of customer calls
2. Identify action items and follow-up requirements
3. Assess customer sentiment (positive, neutral, negative)
4. Tailor summary detail to the appropriate audience level

When summarizing a call:
- Lead with the primary reason for the call
- Highlight commitments made to the customer
- Note any compliance-relevant statements
- List concrete action items with owners
- Assess overall customer satisfaction

Output Format:
- Executive Summary: concise paragraph (max 500 chars)
- Action Items: list of specific follow-up tasks
- Customer Sentiment: positive/neutral/negative
- Audience Level: executive/manager/agent/detailed

Be concise but complete. Summaries are used by supervisors for quality review."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def generate_summary(call_id: str, context: str | None = None) -> dict:
    agent = SummaryGenerator()
    input_text = f"""Generate a comprehensive summary for banking call: {call_id}

Steps:
1. Retrieve the call profile using s3_retriever_tool with data_type='profile'
2. Analyze the transcript and generate an executive summary
3. Identify action items and assess customer sentiment

{"Additional Context: " + context if context else ""}

Provide a complete summary with action items, sentiment, and audience level."""
    result = await agent.ainvoke(input_text)
    return {"agent": "summary_generator", "call_id": call_id, "analysis": result.output}
