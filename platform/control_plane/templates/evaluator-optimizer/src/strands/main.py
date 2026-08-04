"""Evaluator-optimizer agent server (Strands SDK).

Generator/evaluator critique loop for self-improving content quality.
Loops until score >= threshold or max iterations reached. Returns iteration history.
"""

import json
import logging
import re

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()


def create_model(temperature: float = config.TEMPERATURE):
    return BedrockModel(
        model_id=config.MODEL_ID,
        region_name=config.AWS_REGION,
        temperature=temperature,
        max_tokens=config.MAX_TOKENS,
    )


generator = Agent(
    model=create_model(),
    system_prompt="""You are a content generator. Produce high-quality content based on a goal.
When given feedback, revise to address all suggestions.
Output ONLY the content itself, no meta-commentary.""",
)

evaluator = Agent(
    model=create_model(temperature=0.2),
    system_prompt="""You are a content evaluator. Score content on a 1-5 scale.
You MUST respond with ONLY a JSON object:
{"score": <1-5>, "feedback": "<specific issues>", "suggestions": ["<s1>", "<s2>"]}
Be strict but fair. Only give 5 if excellent.""",
)


def parse_evaluation(text: str) -> dict:
    """Extract JSON evaluation from agent response."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {"score": 3, "feedback": text, "suggestions": []}


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations."""
    goal = payload.get("goal", "")
    if not goal:
        return {"error": "goal is required"}

    max_iterations = payload.get("max_iterations", config.MAX_ITERATIONS)
    threshold = payload.get("threshold", config.QUALITY_THRESHOLD)

    logger.info("Evaluator-optimizer invocation: %s", goal[:100])
    history = []

    # Initial generation
    result = generator(f"Generate content for: {goal}")
    content = result.message
    score = 0

    for i in range(max_iterations):
        # Evaluate
        eval_result = evaluator(f"Evaluate against goal.\n\nGoal: {goal}\n\nContent:\n\n{content}")
        evaluation = parse_evaluation(eval_result.message)
        score = evaluation.get("score", 0)
        history.append({"iteration": i + 1, "score": score, "feedback": evaluation.get("feedback", "")})

        if score >= threshold:
            break

        # Revise
        feedback = evaluation.get("feedback", "")
        result = generator(f"Revise based on feedback:\n\nFeedback: {feedback}\n\nOriginal goal: {goal}")
        content = result.message

    return {
        "content": content,
        "score": score,
        "iterations": len(history),
        "history": history,
    }


if __name__ == "__main__":
    app.run()
