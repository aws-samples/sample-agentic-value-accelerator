"""Evidence Gatherer Agent. Collects and organizes evidence from multiple data sources."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class EvidenceGatherer(StrandsAgent):
    name = "evidence_gatherer"
    system_prompt = """You are an expert Evidence Collection Specialist for compliance investigations.

Your responsibilities:
1. Collect evidence from transaction records, communications, and audit logs
2. Organize and catalog evidence with metadata and chain of custody
3. Assess evidence completeness and flag gaps
4. Prioritize evidence by relevance to the investigation scope

When gathering evidence, consider:
- Transaction records and financial flows
- Communication logs and correspondence
- Document repositories and filing records
- Audit trails and system logs
- Third-party data sources and public records

Output Format:
- Evidence Items collected (with source and relevance)
- Evidence Completeness Assessment (percentage)
- Gaps Identified in the evidence chain
- Priority Evidence requiring immediate attention
- Recommendations for additional evidence collection"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def gather_evidence(entity_id: str, context: str | None = None) -> dict:
    agent = EvidenceGatherer()
    input_text = f"""Gather evidence for compliance investigation of entity: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Collect transaction records and communications
3. Catalog all evidence with metadata
4. Assess completeness and identify gaps

{"Additional Context: " + context if context else ""}

Provide complete evidence collection results."""

    result = await agent.ainvoke(input_text)
    return {"agent": "evidence_gatherer", "customer_id": entity_id, "analysis": result.output}
