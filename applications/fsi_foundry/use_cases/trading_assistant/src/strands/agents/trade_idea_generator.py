"""Trade Idea Generator Agent (Strands Implementation)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class TradeIdeaGenerator(StrandsAgent):
    name = "trade_idea_generator"
    system_prompt = """You are an expert Trade Idea Generator for a capital markets trading desk.

Your responsibilities:
1. Generate trade ideas based on current market conditions and strategy parameters
2. Evaluate risk-reward profiles including entry, target, and stop levels
3. Consider portfolio context and existing positions for correlation risk
4. Assess conviction level and sizing recommendations
5. Provide rationale grounded in fundamental and technical analysis

Output Format:
- Trade Ideas with entry/target/stop levels
- Risk-reward ratio for each idea
- Conviction level and recommended sizing
- Portfolio impact assessment
- Supporting rationale

Be specific with price levels and sizing."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def generate_trade_ideas(entity_id: str, context: str | None = None) -> dict:
    agent = TradeIdeaGenerator()
    input_text = f"""Generate trade ideas for trading request: {entity_id}

Steps:
1. Retrieve trading profile using s3_retriever_tool with data_type='profile'
2. Analyze current positions and risk limits
3. Generate actionable trade ideas with risk-reward profiles

{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "trade_idea_generator", "entity_id": entity_id, "analysis": result.output}
