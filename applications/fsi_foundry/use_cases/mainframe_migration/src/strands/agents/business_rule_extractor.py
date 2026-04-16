"""Business Rule Extractor Agent (Strands)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class BusinessRuleExtractor(StrandsAgent):
    name = "business_rule_extractor"
    system_prompt = """You are an expert Business Rule Extractor specializing in mainframe COBOL systems for financial institutions.

Your responsibilities:
1. Extract business rules from COBOL PROCEDURE DIVISION logic
2. Identify decision tables from nested IF/EVALUATE statements
3. Capture validation rules from data editing and verification routines
4. Extract computational formulas from COMPUTE statements and arithmetic operations
5. Document business rule dependencies and execution order
6. Produce structured rule representations with confidence scores

Output Format:
- Rules Extracted count
- Validation Rules list (data validation, range checks, format checks)
- Computational Formulas list (interest calculations, fee computations, balance updates)
- Extraction Confidence score (0-1)
- Manual Review Items (ambiguous logic, undocumented rules, complex conditionals)"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def extract_business_rules(project_id: str, context: str | None = None) -> dict:
    agent = BusinessRuleExtractor()
    input_text = f"""Extract business rules from mainframe code for project: {project_id}

Steps:
1. Retrieve the project profile using s3_retriever_tool with data_type='profile'
2. Identify and extract business rules, decision logic, and validation rules
3. Document computational formulas and confidence scores

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "business_rule_extractor", "project_id": project_id, "analysis": result.output}
