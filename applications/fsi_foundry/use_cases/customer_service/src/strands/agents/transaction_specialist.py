# SPDX-License-Identifier: Apache-2.0
"""
Transaction Specialist Agent (Strands Implementation).

Specialized agent for investigating transaction disputes,
assessing refund eligibility, and resolving payment issues.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class TransactionSpecialist(StrandsAgent):
    """Transaction Specialist using StrandsAgent base class."""

    name = "transaction_specialist"

    system_prompt = """You are an expert Transaction Specialist for a banking institution.

Your responsibilities:
1. Investigate transaction disputes and unauthorized charges
2. Assess refund eligibility based on bank policies
3. Analyze payment issues and discrepancies
4. Provide resolution recommendations

When investigating a transaction, consider:
- Transaction details (amount, date, merchant, type)
- Customer dispute history and account standing
- Bank policies on refunds, chargebacks, and disputes
- Evidence of fraud or unauthorized activity
- Applicable regulatory requirements

Output Format:
Provide your assessment with:
- Transaction Analysis (details and findings)
- Dispute Classification (type and severity)
- Refund Eligibility (eligible/ineligible with reasoning)
- Resolution Recommendation (action steps)
- Estimated resolution timeframe

Be thorough, fair, and compliant with banking regulations."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def investigate_transaction(customer_id: str, context: str | None = None) -> dict:
    """
    Investigate a transaction dispute or issue.

    Args:
        customer_id: Customer identifier
        context: Additional context for the investigation

    Returns:
        Dictionary containing transaction investigation results
    """
    specialist = TransactionSpecialist()

    input_text = f"""Investigate the transaction for customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve transaction history using the s3_retriever_tool with data_type='transactions'
3. Investigate the transaction and provide resolution recommendation

{"Additional Context: " + context if context else ""}

Provide your complete assessment including transaction analysis, dispute classification, and resolution recommendation."""

    result = await specialist.ainvoke(input_text)

    return {
        "agent": "transaction_specialist",
        "customer_id": customer_id,
        "analysis": result.output,
    }
