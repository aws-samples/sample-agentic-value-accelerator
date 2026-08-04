"""Agent Evaluation with Strands Evals.

Demonstrates the full evaluation workflow:
1. Define an agent task
2. Create test cases with expected outputs and trajectories
3. Run evaluators (output quality, tool usage, helpfulness)
4. Assert pass rate for CI/CD gating

Reference: https://github.com/strands-agents/samples/tree/main/python/06-evaluate
"""

from strands import Agent, tool
from strands.models import BedrockModel
from strands_evals import eval_task, Case, Experiment
from strands_evals.evaluators import (
    OutputEvaluator,
    HelpfulnessEvaluator,
    TrajectoryEvaluator,
    ToolSelectionAccuracy,
)


# --- Agent Under Test ---

@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression. Args: expression: e.g. '2 + 2'"""
    return str(eval(expression))  # noqa: S307 — demo only


@tool
def lookup_policy(topic: str) -> str:
    """Look up company policy. Args: topic: policy topic"""
    policies = {
        "refund": "30-day refund policy for all products.",
        "shipping": "Free shipping on orders over $50.",
    }
    return policies.get(topic, "Policy not found.")


@eval_task()
def customer_service_agent():
    """The agent task to evaluate."""
    return Agent(
        model=BedrockModel(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
        system_prompt="You are a customer service agent. Use tools to look up policies and calculate refunds.",
        tools=[calculator, lookup_policy],
    )


# --- Test Cases ---

CASES = [
    Case(
        name="refund-eligibility",
        input="I bought something 2 weeks ago and it broke. Can I get a refund?",
        expected_output="Yes, eligible for refund within 30-day policy",
        expected_trajectory=["lookup_policy"],
    ),
    Case(
        name="shipping-cost",
        input="How much is shipping for a $30 order?",
        expected_output="Shipping is not free for orders under $50",
        expected_trajectory=["lookup_policy"],
    ),
    Case(
        name="refund-calculation",
        input="I need a 15% restocking fee deducted from my $200 refund. What do I get back?",
        expected_output="$170",
        expected_trajectory=["calculator"],
    ),
]


# --- Evaluators ---

EVALUATORS = [
    OutputEvaluator(rubric="Response is factually correct and addresses the customer's question."),
    TrajectoryEvaluator(rubric="Agent used the appropriate tools in a logical order."),
    ToolSelectionAccuracy(),
    HelpfulnessEvaluator(),
]


# --- Run ---

if __name__ == "__main__":
    experiment = Experiment(cases=CASES, evaluators=EVALUATORS)
    reports = experiment.run_evaluations(customer_service_agent)

    # Display results
    for report in reports:
        report.run_display()

    # CI/CD gate — fail if pass rate drops below 80%
    summary = reports[0].get_summary()
    pass_rate = summary.get("pass_rate", 0)
    print(f"\nOverall pass rate: {pass_rate:.0%}")
    assert pass_rate >= 0.80, f"Pass rate {pass_rate:.0%} below 80% threshold"
