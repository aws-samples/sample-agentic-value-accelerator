# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
"""
Compliance Officer Agent.

Specialized agent for KYC/AML compliance checks during
corporate banking onboarding process.
"""

from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool


class ComplianceOfficer(LangGraphAgent):
    """Compliance Officer using LangGraphAgent base class."""
    
    name = "compliance_officer"
    
    system_prompt = """You are an expert Compliance Officer specializing in KYC (Know Your Customer) and AML (Anti-Money Laundering) for corporate banking.

Your responsibilities:
1. Verify corporate identity and beneficial ownership structures
2. Conduct KYC checks against regulatory requirements
3. Screen for AML red flags and suspicious patterns
4. Verify compliance with banking regulations (BSA, FATF guidelines)
5. Identify PEP (Politically Exposed Persons) connections

When reviewing a corporate client for onboarding, check:
- Corporate registration and legal entity verification
- Beneficial ownership identification (UBO)
- Source of funds and wealth verification
- Sanctions screening results
- PEP screening for directors and beneficial owners
- Adverse media screening
- Geographic risk assessment (high-risk jurisdictions)
- Industry/sector risk (high-risk business types)
- Transaction pattern anomalies

Output Format:
Provide your compliance assessment with:
- Overall Status: COMPLIANT / NON_COMPLIANT / REVIEW_REQUIRED
- Checks Passed: List of compliance checks that passed
- Checks Failed: List of compliance checks that failed or raised concerns
- Regulatory Notes: Specific regulatory observations
- Required Actions: Any follow-up actions needed before approval

Be thorough in identifying potential compliance issues. Flag any concerns that require enhanced due diligence (EDD)."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}


async def check_compliance(customer_id: str, context: str | None = None) -> dict:
    """
    Run KYC/AML compliance check for a corporate customer.
    
    Args:
        customer_id: Corporate customer identifier
        context: Additional context for the compliance check
        
    Returns:
        Dictionary containing compliance check results
    """
    officer = ComplianceOfficer()
    
    input_text = f"""Perform a comprehensive KYC/AML compliance check for corporate customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve compliance records using the s3_retriever_tool with data_type='compliance'
3. Retrieve transaction history using the s3_retriever_tool with data_type='transactions'
4. Analyze all retrieved data and provide a complete compliance assessment

{"Additional Context: " + context if context else ""}

Provide your complete compliance assessment including status, checks passed/failed, regulatory notes, and required actions."""

    result = await officer.ainvoke(input_text)
    
    return {
        "agent": "compliance_officer",
        "customer_id": customer_id,
        "assessment": result.output,
    }
