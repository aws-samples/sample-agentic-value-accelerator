"""
Evaluation Pipeline for FSI Foundry Agents.

Runs agents against Langfuse datasets, evaluates responses with LLM-as-judge,
and sends scores back to Langfuse for comparison across runs.

Usage:
    # Set required env vars:
    #   LANGFUSE_HOST, LANGFUSE_SECRET_NAME, LANGFUSE_DATASET_NAME,
    #   BEDROCK_MODEL_ID, AWS_REGION
    #
    # Optional: LANGFUSE_PROMPT_NAME, LANGFUSE_PROMPT_VERSION
    #
    python -m utils.evaluation
"""

import json
import os
import sys
import time
import random
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from langfuse import Langfuse

from config.settings import settings
from utils.logging import get_logger
from utils.telemetry import _fetch_langfuse_keys

logger = get_logger(__name__)


def exponential_backoff(max_retries=5, base_delay=2, max_delay=60):
    """Decorator for exponential backoff on Bedrock throttling."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except ClientError as e:
                    error_code = e.response.get("Error", {}).get("Code", "")
                    if error_code in ("ThrottlingException", "TooManyRequestsException") and attempt < max_retries - 1:
                        delay = min(base_delay * (2 ** attempt) + random.uniform(0, 1), max_delay)
                        logger.warning("throttled", retry_in=f"{delay:.1f}s", attempt=attempt + 1)
                        time.sleep(delay)
                        continue
                    raise
            return func(*args, **kwargs)
        return wrapper
    return decorator


class EvaluationPipeline:
    """
    Evaluates FSI Foundry agents against Langfuse datasets.

    Supports both Strands and LangGraph agents via the base class interface.
    Results (scores, response times) are sent back to Langfuse for comparison.
    """

    def __init__(self):
        # Load Langfuse keys from Secrets Manager
        if not settings.langfuse_secret_name:
            raise ValueError("langfuse_secret_name must be configured for evaluation")

        keys = _fetch_langfuse_keys(settings.langfuse_secret_name, settings.aws_region)

        self.langfuse = Langfuse(
            public_key=keys.get("langfuse_public_key", ""),
            secret_key=keys.get("langfuse_secret_key", ""),
            host=settings.langfuse_host,
        )
        logger.info("langfuse_client_initialized")

        self.bedrock_client = boto3.client(
            "bedrock-runtime", region_name=settings.aws_region
        )

    def fetch_dataset(self, dataset_name: Optional[str] = None) -> Any:
        """Fetch evaluation dataset from Langfuse."""
        dataset_name = dataset_name or os.getenv("LANGFUSE_DATASET_NAME")
        if not dataset_name:
            raise ValueError("LANGFUSE_DATASET_NAME env var or dataset_name argument required")

        dataset = self.langfuse.get_dataset(name=dataset_name)
        logger.info("dataset_fetched", name=dataset_name, items=len(dataset.items))
        return dataset

    def fetch_prompt(self, prompt_name: Optional[str] = None, version: Optional[int] = None) -> Optional[Any]:
        """Fetch prompt from Langfuse. Returns None if not configured."""
        prompt_name = prompt_name or settings.langfuse_prompt_name
        if not prompt_name:
            return None

        if version is None and os.getenv("LANGFUSE_PROMPT_VERSION"):
            version = int(os.getenv("LANGFUSE_PROMPT_VERSION"))

        if version:
            prompt = self.langfuse.get_prompt(name=prompt_name, version=version)
        else:
            prompt = self.langfuse.get_prompt(name=prompt_name)

        logger.info("prompt_fetched", name=prompt.name, version=prompt.version)
        return prompt

    @exponential_backoff()
    def evaluate_response(self, input_data: str, output: str, expected_output: str) -> Dict[str, Any]:
        """Use LLM-as-judge to evaluate agent output against expected."""
        eval_prompt = f"""You are an evaluation assistant. Determine if the actual output matches the expected output in meaning and intent.

Input: <input>{input_data}</input>
Actual Output: <output>{output}</output>
Expected Output: <expected_output>{expected_output}</expected_output>

Consider:
1. Semantic similarity - do they convey the same meaning even if wording differs?
2. Accuracy - is the information correct?

Respond ONLY with JSON:
{{
    "success": true/false,
    "confidence": 0.0-1.0,
    "comment": "Brief explanation"
}}"""

        response = self.bedrock_client.converse(
            modelId=settings.effective_bedrock_model_id,
            messages=[{"role": "user", "content": [{"text": eval_prompt}]}],
            inferenceConfig={"temperature": 0.1, "maxTokens": 500},
        )

        eval_response = response["output"]["message"]["content"][0]["text"]
        eval_result = json.loads(eval_response)

        return {
            "success": eval_result.get("success", False),
            "confidence": eval_result.get("confidence", 0.0),
            "comment": eval_result.get("comment", ""),
        }

    def run(self, agent_factory, dataset_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Run evaluation pipeline.

        Args:
            agent_factory: Callable that returns an agent instance with an invoke(str) method.
                           The agent should return an ExecutionResult.
                           Example: lambda sid: MyAgent(session_id=sid, enable_tracing=False)
            dataset_name: Override for LANGFUSE_DATASET_NAME env var.

        Returns:
            List of evaluation results per dataset item.
        """
        dataset = self.fetch_dataset(dataset_name)
        prompt = self.fetch_prompt()
        system_prompt = prompt.prompt if prompt else None

        run_name = (
            f"eval_{settings.use_case_id}_{settings.effective_bedrock_model_id.replace(':', '_')}"
            f"_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        )

        run_metadata = {
            "model_id": settings.effective_bedrock_model_id,
            "use_case": settings.use_case_id,
            "agent_framework": settings.agent_framework,
            "environment": settings.app_env,
        }
        if prompt:
            run_metadata["prompt_name"] = prompt.name
            run_metadata["prompt_version"] = prompt.version

        results = []

        for idx, item in enumerate(dataset.items):
            logger.info("evaluating_item", index=idx + 1, total=len(dataset.items), item_id=item.id)
            session_id = f"eval_{run_name}_{item.id}"

            try:
                with item.run(
                    run_name=run_name,
                    run_description=f"Evaluation with {settings.effective_bedrock_model_id}",
                    run_metadata=run_metadata,
                ) as root_span:

                    agent = agent_factory(session_id)
                    if system_prompt:
                        agent.config.system_prompt = system_prompt

                    # Extract input from dataset item
                    input_query = json.loads(item.input[0]["content"])[0]["text"]

                    start_time = time.time()
                    result = agent.invoke(input_query)
                    response_time = time.time() - start_time

                    actual_output = result.output

                    root_span.update(
                        input=input_query,
                        output=actual_output,
                        expected_output=item.expected_output.get("message", ""),
                    )

                    eval_result = self.evaluate_response(
                        input_data=input_query,
                        output=actual_output,
                        expected_output=item.expected_output.get("message", ""),
                    )
                    eval_result["response_time"] = response_time
                    eval_result["item_id"] = item.id
                    results.append(eval_result)

                    root_span.score(name="evaluation_success", value=1.0 if eval_result["success"] else 0.0, comment=eval_result["comment"])
                    root_span.score(name="confidence", value=eval_result["confidence"])
                    root_span.score(name="response_time", value=response_time)

                    self.langfuse.flush()

            except Exception as e:
                logger.error("item_evaluation_failed", item_id=item.id, error=str(e))
                results.append({"success": False, "confidence": 0.0, "comment": f"Error: {e}", "item_id": item.id})

        self.langfuse.flush()
        self._log_summary(results, dataset.name, run_name)
        return results

    def _log_summary(self, results: List[Dict], dataset_name: str, run_name: str):
        total = len(results)
        if total == 0:
            logger.warning("no_results")
            return

        successful = sum(1 for r in results if r.get("success"))
        avg_confidence = sum(r.get("confidence", 0.0) for r in results) / total
        avg_time = sum(r.get("response_time", 0.0) for r in results) / total

        logger.info(
            "evaluation_summary",
            run_name=run_name,
            dataset=dataset_name,
            model=settings.effective_bedrock_model_id,
            total=total,
            successful=successful,
            failed=total - successful,
            success_rate=f"{(successful / total) * 100:.1f}%",
            avg_confidence=f"{avg_confidence:.2%}",
            avg_response_time=f"{avg_time:.1f}s",
        )


def main():
    """
    CLI entry point. Requires an agent factory to be provided by the use case.

    For now, this demonstrates the pipeline structure. Use cases should import
    EvaluationPipeline and call pipeline.run(agent_factory) directly.
    """
    logger.info("evaluation_pipeline_started")

    pipeline = EvaluationPipeline()
    # Use cases call: pipeline.run(lambda sid: MyStrandsAgent(session_id=sid, enable_tracing=False))
    logger.info("pipeline_ready", hint="Import EvaluationPipeline and call .run(agent_factory)")


if __name__ == "__main__":
    main()
