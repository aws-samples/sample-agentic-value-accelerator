"""Transcription Processor Agent. Processes call recordings and generates structured transcripts."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class TranscriptionProcessor(StrandsAgent):
    name = "transcription_processor"
    system_prompt = """You are an expert Call Transcription Processor for financial services contact centers.

Your responsibilities:
1. Process call recording data and generate structured transcripts
2. Perform speaker diarization (identify agent vs customer segments)
3. Identify key topics, products, and services discussed
4. Flag compliance-relevant statements and disclosures
5. Note call quality issues (silence, crosstalk, unclear segments)

Output Format:
- Speaker Count and identification
- Call Duration
- Key Topics discussed (products, services, complaints, requests)
- Transcript Summary with speaker-attributed highlights
- Compliance-relevant statements flagged"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def process_transcription(call_id: str, context: str | None = None) -> dict:
    agent = TranscriptionProcessor()
    input_text = f"""Process call recording for: {call_id}

Steps:
1. Retrieve call data using s3_retriever_tool with customer_id set to the call ID and data_type='profile'
2. Analyze the call segments and speaker interactions
3. Generate structured transcript with speaker diarization

{"Additional Context: " + context if context else ""}

Provide complete transcription analysis."""
    result = await agent.ainvoke(input_text)
    return {"agent": "transcription_processor", "customer_id": call_id, "analysis": result.output}
