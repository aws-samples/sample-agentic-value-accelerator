"""Transcript Processor Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class TranscriptProcessor(StrandsAgent):
    name = "transcript_processor"
    system_prompt = """You are an Earnings Call Transcript Processor for capital markets.

Responsibilities:
1. Structure raw earnings call transcripts into organized sections
2. Identify prepared remarks vs Q&A sections
3. Extract key discussion topics and management commentary
4. Organize content by business segment and topic

Output: Structured transcript with sections, speakers, key topics, and segment breakdowns."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def process_transcript(entity_id: str, context: str | None = None) -> dict:
    agent = TranscriptProcessor()
    input_text = f"""Process earnings call transcript for: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Structure and organize the transcript content
3. Identify key sections and discussion topics

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "transcript_processor", "entity_id": entity_id, "transcript": result.output}
