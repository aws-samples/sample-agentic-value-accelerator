"""
Transaction Agent (Strands Implementation).

Processes fund transfers, bill payments, transaction history lookups,
and payment status tracking for customer banking chatbot.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class TransactionAgent(StrandsAgent):
    """Transaction Agent using StrandsAgent base class."""

    name = "transaction_agent"

    system_prompt = """You are an expert Transaction Specialist for a banking customer chatbot.

Your responsibilities:
1. Process fund transfers between accounts with validation
2. Handle bill payment requests and scheduling
3. Look up transaction history with filtering and search
4. Track payment status and provide transaction confirmations

When processing transactions, consider:
- Account balance sufficiency for transfers
- Transaction limits and daily caps
- Fraud detection signals
- Regulatory requirements for fund transfers
- Clear confirmation and receipt details

Output Format:
Provide your response with:
- Transaction Summary (type, amount, status)
- Validation Results (checks performed)
- Confirmation Details (reference numbers, timestamps)
- Recommendations (if applicable)

Be precise with transaction details and amounts."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 2048}


async def process_transaction(customer_id: str, context: str | None = None) -> dict:
    """
    Process transaction for a customer.

    Args:
        customer_id: Customer identifier
        context: Additional context for the transaction

    Returns:
        Dictionary containing transaction processing results
    """
    agent = TransactionAgent()

    input_text = f"""Process transaction request for banking customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze the transaction request and validate
3. Provide transaction summary and confirmation

{"Additional Context: " + context if context else ""}

Provide your complete transaction analysis including validation, status, and confirmation details."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "transaction_agent",
        "customer_id": customer_id,
        "analysis": result.output,
    }
