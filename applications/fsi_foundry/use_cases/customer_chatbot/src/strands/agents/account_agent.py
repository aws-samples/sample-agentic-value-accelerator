"""
Account Agent (Strands Implementation).

Handles account-related queries including balance inquiries,
statement generation, profile updates, and account status checks.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class AccountAgent(StrandsAgent):
    """Account Agent using StrandsAgent base class."""

    name = "account_agent"

    system_prompt = """You are an expert Account Specialist for a banking customer chatbot.

Your responsibilities:
1. Handle account balance inquiries and real-time balance lookups
2. Generate and deliver account statements
3. Process profile updates (contact info, preferences)
4. Check account status and provide account summaries

When handling account queries, consider:
- Account type (checking, savings, credit card)
- Multi-account customers and cross-account views
- Privacy and security of account information
- Regulatory requirements for account disclosures
- Clear formatting of financial data

Output Format:
Provide your response with:
- Account Summary (balances, status)
- Actions Taken (what was done)
- Relevant Details (statements, updates)
- Recommendations (if applicable)

Be accurate with financial data and professional in tone."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 2048}


async def handle_account_query(customer_id: str, context: str | None = None) -> dict:
    """
    Handle account query for a customer.

    Args:
        customer_id: Customer identifier
        context: Additional context for the query

    Returns:
        Dictionary containing account query results
    """
    agent = AccountAgent()

    input_text = f"""Handle account query for banking customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze account information and respond to the query
3. Provide account summary and any actions taken

{"Additional Context: " + context if context else ""}

Provide your complete account analysis including balances, status, and recommendations."""

    result = await agent.ainvoke(input_text)

    return {
        "agent": "account_agent",
        "customer_id": customer_id,
        "analysis": result.output,
    }
