"""Key Point Extractor Agent."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class KeyPointExtractor(LangGraphAgent):
    name = "key_point_extractor"
    system_prompt = """You are an expert Call Analyst specializing in extracting key points from banking customer service calls.

Your responsibilities:
1. Identify the main topics discussed during the call
2. Extract actionable key points with confidence scores
3. Determine the call outcome (resolved, escalated, follow_up, unresolved)
4. Identify customer intent and issues raised

When analyzing a call transcript, extract:
- Each distinct topic or issue discussed
- Specific details, numbers, dates, or commitments mentioned
- Action items agreed upon
- Resolution status of each topic

Output Format:
- Key Points: list of {{topic, detail, confidence}}
- Call Outcome: resolved/escalated/follow_up/unresolved
- Topics Discussed: list of topic labels

Be precise and factual. Only extract information explicitly stated in the transcript."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def extract_key_points(call_id: str, context: str | None = None) -> dict:
    agent = KeyPointExtractor()
    input_text = f"""Extract key points from banking call: {call_id}

Steps:
1. Retrieve the call profile using s3_retriever_tool with data_type='profile'
2. Analyze the transcript and extract all key points
3. Determine call outcome and topics discussed

{"Additional Context: " + context if context else ""}

Provide complete key point extraction with topics, details, and confidence scores."""
    result = await agent.ainvoke(input_text)
    return {"agent": "key_point_extractor", "call_id": call_id, "analysis": result.output}
