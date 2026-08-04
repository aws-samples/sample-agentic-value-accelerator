"""Custom LLM-as-Judge Evaluation.

For custom evaluation criteria not covered by built-in evaluators.
Uses Bedrock directly to score agent responses.
"""
import json
import boto3


class LLMJudge:
    def __init__(self, model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0", region="us-east-1"):
        self.client = boto3.client("bedrock-runtime", region_name=region)
        self.model_id = model_id

    def evaluate(self, query: str, response: str, criteria: str) -> dict:
        """Score a response on given criteria (1-5)."""
        prompt = f"""Evaluate this AI response on a scale of 1-5.

Criteria: {criteria}
User Query: {query}
AI Response: {response}

Respond with JSON: {{"score": <1-5>, "reasoning": "<explanation>"}}"""

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 300,
            "messages": [{"role": "user", "content": prompt}],
        })

        resp = self.client.invoke_model(modelId=self.model_id, body=body)
        text = json.loads(resp["body"].read())["content"][0]["text"]

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"score": 0, "reasoning": f"Parse error: {text[:100]}"}


if __name__ == "__main__":
    judge = LLMJudge()
    result = judge.evaluate(
        query="What is machine learning?",
        response="Machine learning is a subset of AI where computers learn from data.",
        criteria="Accuracy, completeness, and clarity for a beginner audience.",
    )
    print(f"Score: {result['score']}/5")
    print(f"Reasoning: {result['reasoning']}")
