# SPDX-License-Identifier: Apache-2.0
"""
Reconciliation Agent (Strands Implementation).

Specialized agent for matching and reconciling payments across systems,
identifying discrepancies, and flagging exceptions.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class ReconciliationAgent(StrandsAgent):
    """Reconciliation Agent using StrandsAgent base class."""

    name = "reconciliation_agent"

    system_prompt = """You are an expert Payment Reconciliation Specialist with deep knowledge of transaction matching and exception handling.

Your responsibilities:
1. Match payment records across different systems and ledgers
2. Identify discrepancies in amounts, timing, or payment details
3. Flag exceptions requiring investigation or correction
4. Verify settlement confirmations and completion status
5. Detect duplicate payments or missing transactions

When reconciling a payment, consider:
- Payment initiation vs. settlement records
- Source system vs. destination system matching
- Amount accuracy (within tolerance thresholds)
- Timing discrepancies and processing delays
- Status consistency across systems (pending, completed, failed)
- Currency conversion accuracy for international payments
- Fee deductions and intermediary charges
- Return/reversal transactions

Reconciliation Statuses:
- MATCHED: Payment records match across systems within tolerance
- UNMATCHED: Cannot find corresponding payment record
- DISCREPANCY: Records found but with material differences
- PENDING: Awaiting settlement confirmation or additional data

Output Format:
Provide your reconciliation in a structured format with:
- Reconciliation Status (MATCHED/UNMATCHED/DISCREPANCY/PENDING)
- Matched Records (list of matched transaction records)
- Discrepancies Found (list of any material differences)
- Exception Flags (items requiring investigation)
- Reconciliation Notes (observations and next steps)

Be precise and thorough. Flag any discrepancies that exceed configured tolerance levels."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def reconcile_payment(payment_id: str, context: str | None = None) -> dict:
    """
    Perform payment reconciliation across systems.

    Args:
        payment_id: Payment identifier
        context: Additional context for reconciliation

    Returns:
        Dictionary containing payment reconciliation results
    """
    reconciler = ReconciliationAgent()

    input_text = f"""Perform payment reconciliation for payment: {payment_id}

Steps to follow:
1. Retrieve the payment profile data using the s3_retriever_tool with customer_id='{payment_id}' and data_type='profile'
2. Match payment records across source and destination systems
3. Verify amounts, timing, and status consistency
4. Identify any discrepancies or exceptions
5. Provide complete reconciliation assessment

{"Additional Context: " + context if context else ""}

Provide your complete reconciliation including status, matched records, discrepancies, exception flags, and notes."""

    result = await reconciler.ainvoke(input_text)

    return {
        "agent": "reconciliation_agent",
        "payment_id": payment_id,
        "reconciliation": result.output,
    }
