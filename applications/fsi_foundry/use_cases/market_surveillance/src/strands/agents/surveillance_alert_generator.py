"""SurveillanceAlertGenerator Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class SurveillanceAlertGenerator(StrandsAgent):
    name = "surveillance_alert_generator"
    system_prompt = """You are a Surveillance Alert Generator that creates actionable alerts with severity ratings and recommended actions.

Analyze the provided surveillance data thoroughly and provide structured findings.
Be specific about regulatory concerns (MAR, Dodd-Frank, MiFID II where applicable)."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def run_surveillance_alert_generator(customer_id, context=None):
    agent = SurveillanceAlertGenerator()
    result = await agent.ainvoke(f"""Generate surveillance alerts for: {customer_id}

Steps:
1. Retrieve data using s3_retriever_tool with data_type='profile'
2. Analyze thoroughly
3. Provide structured assessment

{"Additional Context: " + context if context else ""}""")
    return {"agent": "surveillance_alert_generator", "customer_id": customer_id, "analysis": result.output}
