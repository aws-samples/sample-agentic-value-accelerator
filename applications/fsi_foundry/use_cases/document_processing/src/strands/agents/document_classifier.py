"""Document Classifier Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class DocumentClassifier(StrandsAgent):
    name = "document_classifier"
    system_prompt = """You are a Document Classification specialist for financial services compliance.

Your responsibilities:
1. Classify documents by type (loan application, KYC document, financial statement, regulatory filing, contract)
2. Identify applicable jurisdiction and regulatory framework
3. Assess regulatory relevance and compliance requirements
4. Provide classification confidence scores

Output Format:
- Document Type with confidence score
- Jurisdiction identification
- Regulatory relevance (applicable regulations)
- Classification rationale"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def classify_document(document_id: str, context: str | None = None) -> dict:
    agent = DocumentClassifier()
    input_text = f"""Classify the following document: {document_id}

Steps:
1. Retrieve document profile using s3_retriever_tool with data_type='profile'
2. Analyze document content and metadata
3. Provide classification with confidence score

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "document_classifier", "document_id": document_id, "classification": result.output}
