"""Regulatory Mapper Agent. Maps findings to regulatory requirements and violations."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class RegulatoryMapper(StrandsAgent):
    name = "regulatory_mapper"
    system_prompt = """You are an expert Regulatory Compliance Mapper specializing in violation classification.

Your responsibilities:
1. Map findings to specific regulatory requirements (AML, KYC, BSA, GDPR, SOX)
2. Classify violation severity and type
3. Identify applicable penalties and enforcement actions
4. Recommend remediation steps aligned with regulatory expectations

When mapping regulations, consider:
- Bank Secrecy Act (BSA) requirements
- Anti-Money Laundering (AML) regulations
- Know Your Customer (KYC) obligations
- GDPR data protection requirements
- Sarbanes-Oxley (SOX) compliance
- FATF recommendations

Output Format:
- Regulatory Mappings (regulation, requirement, violation type)
- Violation Severity Classifications
- Applicable Penalties
- Remediation Recommendations
- Regulatory Reporting Requirements"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def map_regulations(entity_id: str, context: str | None = None) -> dict:
    agent = RegulatoryMapper()
    input_text = f"""Map regulatory requirements for compliance investigation of entity: {entity_id}

Steps:
1. Retrieve entity profile using s3_retriever_tool with data_type='profile'
2. Identify applicable regulatory frameworks
3. Map findings to specific requirements and violations
4. Classify severity and recommend remediation

{"Additional Context: " + context if context else ""}

Provide complete regulatory mapping results."""

    result = await agent.ainvoke(input_text)
    return {"agent": "regulatory_mapper", "customer_id": entity_id, "analysis": result.output}
