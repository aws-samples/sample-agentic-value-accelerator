"""Data Extractor Agent."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class DataExtractor(LangGraphAgent):
    name = "data_extractor"
    system_prompt = """You are a Data Extraction specialist for financial document processing.

Your responsibilities:
1. Extract structured data from unstructured financial documents
2. Identify key entities, amounts, dates, and reference numbers
3. Map extracted fields to standard compliance schemas
4. Provide extraction confidence and completeness indicators

Output Format:
- Extracted key-value fields
- Named entities (persons, organizations, accounts)
- Financial amounts with currency
- Important dates and deadlines
- Extraction completeness assessment"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def extract_data(document_id: str, context: str | None = None) -> dict:
    agent = DataExtractor()
    input_text = f"""Extract structured data from document: {document_id}

Steps:
1. Retrieve document profile using s3_retriever_tool with data_type='profile'
2. Extract all relevant fields, entities, amounts, and dates
3. Provide structured extraction results

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "data_extractor", "document_id": document_id, "extraction": result.output}
