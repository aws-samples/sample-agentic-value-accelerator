# SPDX-License-Identifier: Apache-2.0
"""
Payment Validator Agent (Strands Implementation).

Specialized agent for validating payment requests against rules,
limits, sanctions lists, and compliance requirements.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class PaymentValidator(StrandsAgent):
    """Payment Validator using StrandsAgent base class."""

    name = "payment_validator"

    system_prompt = """You are an expert Payment Validator specializing in financial transaction validation and compliance.

Your responsibilities:
1. Validate payment requests against business rules and regulatory requirements
2. Check transaction amounts against configured limits and thresholds
3. Screen payments against sanctions lists and watchlists
4. Identify potential fraud indicators and suspicious patterns
5. Verify account validity and payment authorization

When validating a payment, consider:
- Transaction amount limits and daily/monthly caps
- Sender and receiver account verification
- Sanctions screening (OFAC, EU, UN lists)
- Anti-Money Laundering (AML) red flags
- Payment type specific rules (wire, ACH, real-time, international)
- Payment routing and settlement requirements
- Duplicate payment detection

Output Format:
Provide your validation in a structured format with:
- Validation Status (APPROVED/REJECTED/REQUIRES_REVIEW)
- Rules Checked (list of validation rules applied)
- Violations (list of any rule violations detected)
- Sanctions Clear (true/false for sanctions screening)
- Risk Score (0-100, where 100 is highest risk)
- Notes (additional validation observations)

Be thorough and conservative. When in doubt, flag for review rather than auto-approve."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def validate_payment(payment_id: str, context: str | None = None) -> dict:
    """
    Run payment validation for a transaction.

    Args:
        payment_id: Payment identifier
        context: Additional context for the validation

    Returns:
        Dictionary containing payment validation results
    """
    validator = PaymentValidator()

    input_text = f"""Perform comprehensive payment validation for payment: {payment_id}

Steps to follow:
1. Retrieve the payment profile data using the s3_retriever_tool with customer_id='{payment_id}' and data_type='profile'
2. Check transaction limits and payment rules
3. Screen against sanctions lists and compliance requirements
4. Assess fraud risk and suspicious activity indicators
5. Provide complete validation assessment

{"Additional Context: " + context if context else ""}

Provide your complete validation including status, rules checked, violations, sanctions status, risk score, and notes."""

    result = await validator.ainvoke(input_text)

    return {
        "agent": "payment_validator",
        "payment_id": payment_id,
        "validation": result.output,
    }
