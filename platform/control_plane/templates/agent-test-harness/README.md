# Agent Test Harness

Evaluation patterns for AI agents using `strands-agents-evals` and custom LLM-as-judge.

## What It Provides

| File | Pattern | Description |
|------|---------|-------------|
| `src/strands_evaluation.py` | Strands Evals | Full evaluation workflow: `@eval_task`, `Case`, `Experiment`, multiple evaluators, CI/CD gating |
| `src/llm_judge.py` | Custom Judge | Framework-agnostic LLM-as-judge using Bedrock directly — score any response on arbitrary criteria |

## Install

```bash
pip install -e ".[strands]"
```

## Run

```bash
# Strands evaluation (requires AWS credentials for Bedrock)
python -m src.strands_evaluation

# Custom LLM judge
python -m src.llm_judge
```

## Evaluation Patterns

### 1. Strands Evals (Recommended)

Uses the `strands-agents-evals` package with built-in evaluators:

- **OutputEvaluator** — LLM-as-judge on final output quality
- **TrajectoryEvaluator** — evaluates tool usage sequence
- **ToolSelectionAccuracy** — did the agent call the right tools?
- **HelpfulnessEvaluator** — 7-level helpfulness scoring
- **GoalSuccessRate** — binary task completion

### 2. Custom LLM Judge

For evaluation criteria not covered by built-in evaluators. Calls Bedrock directly to score responses on a 1-5 scale with reasoning.

## CI/CD Integration

```python
# Gate deployments on evaluation pass rate
summary = reports[0].get_summary()
assert summary["pass_rate"] >= 0.80, "Evaluation pass rate below threshold"
```

## Adding Test Cases

```python
from strands_evals import Case

CASES = [
    Case(
        name="my-test",
        input="User question",
        expected_output="Expected answer",
        expected_trajectory=["tool_name"],
    ),
]
```
