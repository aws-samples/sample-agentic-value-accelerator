"""Validation Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class ValidationAgent(StrandsAgent):
    name = "validation_agent"
    system_prompt = """You are a Document Validation specialist for financial services compliance.

Your responsibilities:
1. Validate extracted data against regulatory rules and business logic
2. Cross-reference document data with existing records
3. Check for completeness, consistency, and accuracy
4. Flag discrepancies and compliance issues

Output Format:
- Validation Status (VALID/INVALID/REVIEW_REQUIRED)
- Checks Passed
- Checks Failed
- Validation notes and recommendations"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def validate_document(document_id: str, context: str | None = None) -> dict:
    agent = ValidationAgent()
    input_text = f"""Validate document data for: {document_id}

Steps:
1. Retrieve document profile using s3_retriever_tool with data_type='profile'
2. Validate extracted data against compliance rules
3. Provide validation results with pass/fail details

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "validation_agent", "document_id": document_id, "validation": result.output}
