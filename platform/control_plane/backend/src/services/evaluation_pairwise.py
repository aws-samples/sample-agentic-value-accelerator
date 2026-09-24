"""Pairwise battles — head-to-head judging of two runs' answers.

Judges are more reliable at ranking than at absolute scoring, so A/B
comparisons get a second, stronger signal: for every common case and every
judge dimension, the judge sees BOTH answers anonymized and picks a winner.
Position bias is cancelled by judging each pair twice with the order swapped —
only a verdict that survives the swap counts as a win; disagreement is a tie.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List

from services.evaluation_runner import (
    EVALUATORS,
    JUDGE_MODEL_ID,
    _judge_client,
    _parse_judge_json,
)

logger = logging.getLogger(__name__)

PAIRWISE_SYSTEM = (
    "You are an evaluation judge comparing two AI agent answers to the same financial-services "
    "test case. Judge ONLY against the stated rubric — ignore style and length unless the rubric "
    "covers them. Be strict. Respond with ONLY JSON: "
    '{"winner": "1" | "2" | "tie", "reasoning": "<2 sentences>"}'
)

_ANSWER_LIMIT = 6000


def _judge_pair(client, spec, case_input: str, expected: str, first: str, second: str) -> dict:
    user = (
        f"RUBRIC — {spec.name}:\n{spec.rubric}\n\n"
        f"CASE INPUT:\n{case_input}\n\n"
        f"EXPECTED BEHAVIOR:\n{expected}\n\n"
        f"ANSWER 1:\n{first[:_ANSWER_LIMIT]}\n\n"
        f"ANSWER 2:\n{second[:_ANSWER_LIMIT]}\n\n"
        "Which answer better satisfies the rubric?"
    )
    result = client.converse(
        modelId=JUDGE_MODEL_ID,
        system=[{"text": PAIRWISE_SYSTEM}],
        messages=[{"role": "user", "content": [{"text": user}]}],
        inferenceConfig={"maxTokens": 400, "temperature": 0},
    )
    text = result["output"]["message"]["content"][0]["text"]
    return _parse_judge_json(text, require="winner")


def pairwise_compare(run_a: dict, run_b: dict, region: str, max_workers: int = 6) -> dict:
    """Battle every common case across every judge dimension. Returns
    {battles, byEvaluator, tally} with winners 'A' | 'B' | 'tie'."""
    client = _judge_client(region)
    specs = [s for s in EVALUATORS if s.kind == "judge"]
    cases_b: Dict[str, dict] = {c["id"]: c for c in run_b.get("cases", [])}
    pairs = [
        (ca, cases_b[ca["id"]])
        for ca in run_a.get("cases", [])
        if ca["id"] in cases_b and ca.get("agentResponse") and cases_b[ca["id"]].get("agentResponse")
    ]

    def _battle(task):
        ca, cb, spec = task
        case_input, expected = str(ca.get("input", "")), str(ca.get("expectedBehavior", ""))
        # Two calls with the order swapped: a win only counts if it survives
        # the swap; anything else is a tie (position bias or genuine parity).
        r1 = _judge_pair(client, spec, case_input, expected, ca["agentResponse"], cb["agentResponse"])
        r2 = _judge_pair(client, spec, case_input, expected, cb["agentResponse"], ca["agentResponse"])
        w1 = {"1": "A", "2": "B"}.get(str(r1.get("winner")), "tie")
        w2 = {"1": "B", "2": "A"}.get(str(r2.get("winner")), "tie")
        winner = w1 if w1 == w2 else "tie"
        return {
            "caseId": ca["id"], "evaluatorId": spec.id, "evaluatorName": spec.name,
            "winner": winner,
            "reasoning": str(r1.get("reasoning", ""))[:500],
            "consistent": w1 == w2,
        }

    tasks = [(ca, cb, spec) for ca, cb in pairs for spec in specs]
    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="pairwise") as pool:
        battles = list(pool.map(_battle, tasks))

    by_eval: List[dict] = []
    for spec in specs:
        rows = [b for b in battles if b["evaluatorId"] == spec.id]
        if rows:
            by_eval.append({
                "evaluatorId": spec.id, "evaluatorName": spec.name,
                "aWins": sum(1 for b in rows if b["winner"] == "A"),
                "bWins": sum(1 for b in rows if b["winner"] == "B"),
                "ties": sum(1 for b in rows if b["winner"] == "tie"),
            })
    tally = {
        "A": sum(1 for b in battles if b["winner"] == "A"),
        "B": sum(1 for b in battles if b["winner"] == "B"),
        "tie": sum(1 for b in battles if b["winner"] == "tie"),
    }
    return {"battles": battles, "byEvaluator": by_eval, "tally": tally,
            "caseCount": len(pairs), "judgeModel": JUDGE_MODEL_ID}
