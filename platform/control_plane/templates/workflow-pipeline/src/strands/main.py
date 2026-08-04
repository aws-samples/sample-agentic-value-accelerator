"""Workflow pipeline agent server (Strands SDK).

Sequential document processing pipeline: classify -> extract -> validate -> summarize.
Each agent runs in order, output feeds next. Stops on failure, returns partial results.
"""

import logging
import time

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel

from . import config

logging.basicConfig(level=config.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()


def create_model():
    return BedrockModel(
        model_id=config.MODEL_ID,
        region_name=config.AWS_REGION,
        temperature=config.TEMPERATURE,
        max_tokens=config.MAX_TOKENS,
    )


# Pipeline step agents
classifier = Agent(
    model=create_model(),
    system_prompt="""You are a document classifier. Classify the document as one of:
invoice, contract, report, or letter.
Respond with ONLY the document type — a single word, lowercase.""",
)

extractor = Agent(
    model=create_model(),
    system_prompt="""You are a data extraction specialist. Given a document and its type,
extract all key fields (dates, amounts, names, identifiers, terms).
Return the extracted fields as a structured list.""",
)

validator = Agent(
    model=create_model(),
    system_prompt="""You are a data validation specialist. Given extracted fields,
check for completeness and consistency. Flag missing required fields or inconsistencies.
Return a validation summary: PASS or FAIL with reasons.""",
)

summarizer = Agent(
    model=create_model(),
    system_prompt="""You are a document summarizer. Given a document, its type, extracted fields,
and validation result, produce a concise 2-3 sentence summary.""",
)

# Pipeline definition: (name, agent, prompt_builder)
PIPELINE = [
    ("classify", classifier, lambda ctx: f"Classify this document:\n\n{ctx['document_text']}"),
    ("extract", extractor, lambda ctx: f"Document type: {ctx['classify']}\n\nDocument:\n{ctx['document_text']}"),
    ("validate", validator, lambda ctx: f"Document type: {ctx['classify']}\n\nExtracted fields:\n{ctx['extract']}"),
    ("summarize", summarizer, lambda ctx: (
        f"Document type: {ctx['classify']}\nExtracted fields:\n{ctx['extract']}\n"
        f"Validation: {ctx['validate']}\n\nDocument:\n{ctx['document_text']}"
    )),
]


@app.entrypoint
async def handler(payload: dict, context=None):
    """Handle AgentCore invocations."""
    document = payload.get("document", "")
    if not document:
        return {"error": "document is required"}

    logger.info("Pipeline invocation received")
    start = time.time()
    ctx = {"document_text": document}
    steps_completed = []
    results = {}

    for name, agent, prompt_fn in PIPELINE:
        step_start = time.time()
        try:
            result = agent(prompt_fn(ctx))
            output = result.message
        except Exception as e:
            logger.error("Pipeline step [%s] failed: %s", name, e)
            return {
                "success": False,
                "steps_completed": steps_completed,
                "results": results,
                "failed_at_step": name,
                "error": str(e),
                "elapsed_seconds": round(time.time() - start, 2),
            }

        ctx[name] = output
        results[name] = output
        steps_completed.append(name)
        logger.info("Step [%s] completed in %.2fs", name, time.time() - step_start)

    return {
        "success": True,
        "steps_completed": steps_completed,
        "results": results,
        "elapsed_seconds": round(time.time() - start, 2),
    }


if __name__ == "__main__":
    app.run()
