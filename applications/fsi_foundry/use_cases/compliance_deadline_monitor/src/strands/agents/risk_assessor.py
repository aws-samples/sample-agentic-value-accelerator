"""Risk Assessor Agent (Strands Implementation)."""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class RiskAssessor(StrandsAgent):
    name = "risk_assessor"
    system_prompt = """You are a Compliance Risk Assessor specializing in regulatory filing risk.

Your responsibilities:
1. Evaluate the risk of missing each upcoming deadline based on current progress
2. Consider historical filing patterns (has this team missed deadlines before?)
3. Assess resource availability and workload for the compliance team
4. Determine escalation requirements based on regulatory severity
5. Recommend specific actions to mitigate deadline risk

Escalation rules:
- OVERDUE filings: Immediate escalation to Chief Compliance Officer + legal counsel
- CRITICAL filings (≤3 days, not submitted): Escalate to BSA Officer / department head
- WARNING filings (≤7 days, not started): Escalate to team lead
- Multiple at-risk filings: Flag systemic capacity issue to management

Regulatory consequences to consider:
- SAR late filing: FinCEN penalties up to $1M per violation
- CTR late filing: Civil money penalties, potential criminal referral
- SEC late filing: Public disclosure of delinquency, potential enforcement action

Output Format:
- Risk assessment per filing with mitigation steps
- Escalation recommendations with rationale
- Overall compliance posture assessment"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def assess_risk(as_of_date: str, context: str | None = None) -> dict:
    agent = RiskAssessor()
    input_text = f"""Assess compliance filing risk as of: {as_of_date}

Steps:
1. Retrieve filing status data using s3_retriever_tool with data_type='profile'
2. Evaluate risk of missing each deadline
3. Determine escalation requirements
4. Provide mitigation recommendations

{"Additional Context: " + context if context else ""}"""

    result = await agent.ainvoke(input_text)
    return {"agent": "risk_assessor", "as_of_date": as_of_date, "analysis": result.output}
