"""Custom domain tools for the customer_service use case.

This file is the canonical reference the App Factory's agent-builder
subagent copies from when a generated use case needs deterministic
computation that should NOT be done by the LLM.

Rules for creating a tool (enforced by the builder prompt):
  * Use when: the workflow names a formula, a threshold comparison, a
    ratio, a fixed-category classification, or a structured lookup.
  * Do NOT use for: prose reasoning, narrative summarization, qualitative
    judgment. Those belong in an LLM agent's system_prompt.

Syntax:
  * Decorate with `@tool` from `strands.tools.decorator`
  * Use full Python type hints on every parameter
  * Docstring MUST have an Args: block (Strands auto-generates the input
    schema from it — agents see docstring text when choosing tool calls)
  * Return a plain dict or a JSON string. Both work; Strands normalizes.

Wiring:
  * Import in your agent file:
        from use_cases.<use_case_name>.src.strands.tools import my_tool
  * Add to the agent's tools list:
        tools = [my_tool]
  * The shared s3_retriever_tool is STILL forbidden in agent tools lists
    (per builder prompt Rule C — data fetching belongs in the
    orchestrator's _prefetch_data).
"""

from strands.tools.decorator import tool


@tool
def score_interaction_sentiment(
    positive_word_count: int,
    negative_word_count: int,
    total_words: int,
) -> dict:
    """Compute a deterministic sentiment score for a customer interaction.

    This is a reference example, not domain-complete. It demonstrates the
    canonical @tool pattern: take typed inputs, run a deterministic Python
    calculation, return a dict with {value, formula, inputs} so the calling
    agent can surface the result in its response with full transparency.

    Args:
        positive_word_count: Number of positive signal words observed.
        negative_word_count: Number of negative signal words observed.
        total_words: Total word count in the interaction text.

    Returns:
        Dict with `score` in [-1.0, 1.0], `formula` string, `inputs` dict,
        and `category` (one of: positive | negative | neutral).
    """
    if total_words <= 0:
        return {
            "error": "total_words must be > 0",
            "inputs": {
                "positive_word_count": positive_word_count,
                "negative_word_count": negative_word_count,
                "total_words": total_words,
            },
        }
    score = (positive_word_count - negative_word_count) / total_words
    category = "positive" if score > 0.05 else ("negative" if score < -0.05 else "neutral")
    return {
        "score": round(score, 4),
        "category": category,
        "formula": "(positive_word_count - negative_word_count) / total_words",
        "inputs": {
            "positive_word_count": positive_word_count,
            "negative_word_count": negative_word_count,
            "total_words": total_words,
        },
    }


@tool
def classify_priority(
    severity: str,
    impact_scope: str,
    escalation_requested: bool = False,
) -> dict:
    """Deterministically classify an interaction's handling priority.

    Another reference example — shows the fixed-category classification
    pattern. The LLM decides which categorical inputs apply; the tool
    applies deterministic rules to return the final category.

    Args:
        severity: One of 'low', 'medium', 'high', 'critical'.
        impact_scope: One of 'single_customer', 'multiple_customers', 'systemic'.
        escalation_requested: Whether the customer explicitly asked for escalation.

    Returns:
        Dict with `priority` (P1|P2|P3|P4), `reason`, and `inputs`.
    """
    severity_rank = {"low": 1, "medium": 2, "high": 3, "critical": 4}.get(severity.lower(), 0)
    scope_rank = {"single_customer": 1, "multiple_customers": 2, "systemic": 3}.get(
        impact_scope.lower(), 0
    )

    if severity_rank == 0 or scope_rank == 0:
        return {
            "error": f"Unknown severity ({severity!r}) or impact_scope ({impact_scope!r})",
            "valid_severity": ["low", "medium", "high", "critical"],
            "valid_impact_scope": ["single_customer", "multiple_customers", "systemic"],
        }

    rank = severity_rank + scope_rank + (1 if escalation_requested else 0)
    if rank >= 7:
        priority, reason = "P1", "Critical severity and/or systemic impact"
    elif rank >= 5:
        priority, reason = "P2", "High severity or multi-customer impact"
    elif rank >= 3:
        priority, reason = "P3", "Moderate severity, single-customer impact"
    else:
        priority, reason = "P4", "Low severity, isolated interaction"

    return {
        "priority": priority,
        "reason": reason,
        "inputs": {
            "severity": severity,
            "impact_scope": impact_scope,
            "escalation_requested": escalation_requested,
            "computed_rank": rank,
        },
    }
