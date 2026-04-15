# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
"""
Credit Risk Analyst Agent.

Specialized agent for assessing credit risk of corporate entities
during KYC onboarding for corporate banking.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class CreditAnalyst(LangGraphAgent):
    """Credit Risk Analyst using LangGraphAgent base class."""
    
    name = "credit_analyst"
    
    system_prompt = """You are an expert Credit Risk Analyst specializing in corporate banking KYC onboarding.

Your responsibilities:
1. Analyze the creditworthiness of corporate entities applying for banking services
2. Review financial statements, credit history, and transaction patterns
3. Identify potential credit risks and red flags
4. Provide risk scores and recommendations for credit limits

When analyzing a corporate client, consider:
- Historical credit performance and payment behavior
- Financial statement analysis (debt ratios, liquidity, profitability)
- Industry sector risks and economic conditions
- Corporate structure and ownership complexity
- Transaction volume and patterns

Output Format:
Provide your analysis in a structured format with:
- Risk Score (0-100, where 100 is highest risk)
- Risk Level (LOW/MEDIUM/HIGH/CRITICAL)
- Key Risk Factors identified
- Recommended credit limits or restrictions
- Specific concerns or areas requiring further review

Be thorough but concise. Focus on actionable insights for the onboarding decision."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def analyze_credit_risk(customer_id: str, context: str | None = None) -> dict:
    """
    Run credit risk analysis for a corporate customer.
    
    Args:
        customer_id: Corporate customer identifier
        context: Additional context for the analysis
        
    Returns:
        Dictionary containing credit risk analysis results
    """
    analyst = CreditAnalyst()
    
    input_text = f"""Perform a comprehensive credit risk analysis for corporate customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve credit history using the s3_retriever_tool with data_type='credit_history'
3. Retrieve transaction history using the s3_retriever_tool with data_type='transactions'
4. Analyze all retrieved data and provide a complete credit risk assessment

{"Additional Context: " + context if context else ""}

Provide your complete analysis including risk score, risk level, key factors, and recommendations."""

    result = await analyst.ainvoke(input_text)
    
    return {
        "agent": "credit_analyst",
        "customer_id": customer_id,
        "analysis": result.output,
    }
