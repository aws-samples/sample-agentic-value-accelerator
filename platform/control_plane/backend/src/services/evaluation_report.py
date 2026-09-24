"""Evaluation report export — self-contained documents per run or run pair.

Written as model-risk-management artifacts: what was tested, how, by which
judge, what every verdict said, and what the promotion decision was. The file
must stand alone for a reviewer who has never seen the platform. Markdown is
the canonical format; the HTML rendering adds print styling so the browser's
Print → Save as PDF produces a polished document with no server-side PDF
dependencies.
"""

from typing import List, Optional


def _md_escape(text: str) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def build_report(run: dict) -> str:
    lines: List[str] = []
    add = lines.append

    add(f"# Evaluation report — {run.get('appName', 'Unknown application')}")
    add("")
    add(f"- **Run ID:** `{run.get('id')}`")
    add(f"- **Suite:** {run.get('suiteName')} (`{run.get('suiteId', 'n/a')}`)")
    add(f"- **Started:** {run.get('startedAt')}  |  **Status:** {run.get('status')}")
    add(f"- **Judge model:** `{run.get('judgeModel', 'n/a')}` (temperature 0, one rubric per call)")
    add(f"- **Verdict:** **{str(run.get('verdict', '')).upper()}**  |  Overall: {run.get('overallScore')}%  |  "
        f"Hard gates: {run.get('hardGatesPassed')}/{run.get('hardGatesTotal')}  |  "
        f"Evaluators passing: {run.get('evaluatorsPassed')}/{run.get('evaluatorsTotal')}")
    if run.get("error"):
        add(f"- **Error:** {run['error']}")
    add("")

    add("## Evaluator results")
    add("")
    add("Hard gates aggregate the WORST case (a control either held everywhere or it did not); "
        "soft gates average across cases.")
    add("")
    add("| Evaluator | Category | Gate | Score | Threshold | Result |")
    add("|---|---|---|---|---|---|")
    for r in run.get("results", []):
        add(f"| {r.get('name')} | {r.get('category')} | {r.get('gate')} | {r.get('score')}% "
            f"| ≥ {r.get('threshold')}% | {'PASS' if r.get('passed') else '**FAIL**'} |")
    add("")

    for i, c in enumerate(run.get("cases", []), 1):
        add(f"## Case {i}: `{c.get('id')}` — {'PASS' if c.get('passed') else 'FAIL'}")
        add("")
        add(f"- **Sent to the agent:** `{_md_escape(c.get('input', ''))}`")
        add(f"- **Answer key:** {c.get('expectedBehavior', '')}")
        if c.get("latencyMs"):
            add(f"- **Latency:** {c['latencyMs'] / 1000:.1f}s  |  **Estimated cost:** ${c.get('estCostUsd', 0):.3f}")
        add("")
        add("### Judge verdicts")
        add("")
        for v in c.get("judgeVerdicts", []):
            flag = "PASS" if v.get("passed") else "FAIL"
            add(f"- **{v.get('evaluatorName')} — {v.get('score')}% ({flag})**")
            add(f"  {v.get('reasoning', '')}")
        add("")
        add("<details><summary>Agent response (verbatim)</summary>")
        add("")
        add("```")
        add(str(c.get("agentResponse", ""))[:6000])
        add("```")
        add("")
        add("</details>")
        add("")

    recs = run.get("recommendations") or []
    if recs:
        add("## Optimization recommendations")
        add("")
        add("Advisory synthesis of the failing verdicts — suggestions, not applied changes.")
        add("")
        for r in recs:
            add(f"- **[{r.get('lever')}] {r.get('title')}**")
            add(f"  {r.get('detail', '')}")
        add("")

    add(_METHODOLOGY)
    add("")
    return "\n".join(lines)


def build_compare_report(run_a: dict, run_b: dict, pairwise: Optional[dict] = None) -> str:
    """A/B comparison report: per-evaluator deltas plus, when a head-to-head
    has been run, the position-swapped battle results and what they mean."""
    lines: List[str] = []
    add = lines.append

    add(f"# A/B evaluation report — {run_b.get('appName')} vs {run_a.get('appName')}")
    add("")
    add(f"- **Baseline (A):** {run_a.get('appName')} — run `{run_a.get('id')}`, {run_a.get('startedAt')}, "
        f"suite “{run_a.get('suiteName')}”")
    add(f"- **Candidate (B):** {run_b.get('appName')} — run `{run_b.get('id')}`, {run_b.get('startedAt')}, "
        f"suite “{run_b.get('suiteName')}”")
    add(f"- **Overall:** {run_a.get('overallScore')}% → {run_b.get('overallScore')}%  |  "
        f"**Verdict:** {run_a.get('verdict')} → {run_b.get('verdict')}")
    add("")

    add("## Score deltas")
    add("")
    add("| Evaluator | Gate | Baseline (A) | Candidate (B) | Δ |")
    add("|---|---|---|---|---|")
    sb = {r["id"]: r for r in run_b.get("results", [])}
    for ra in run_a.get("results", []):
        rb = sb.get(ra["id"])
        if rb:
            delta = round(rb["score"] - ra["score"], 1)
            sign = "+" if delta > 0 else ""
            add(f"| {ra.get('name')} | {ra.get('gate')} | {ra.get('score')}% | {rb.get('score')}% | {sign}{delta} |")
    add("")

    if pairwise and pairwise.get("battles"):
        t = pairwise.get("tally", {})
        add("## Head-to-head (position-bias cancelled)")
        add("")
        add("Both answers were shown to the judge anonymized, per rubric, judged twice with the order "
            "swapped; a win only counts when it survives the swap. Ties mean the answers are "
            "indistinguishable on that dimension — treat single-run score deltas on tied dimensions "
            "as noise.")
        add("")
        add(f"**Tally:** baseline wins {t.get('A', 0)} · candidate wins {t.get('B', 0)} · ties {t.get('tie', 0)} "
            f"({pairwise.get('caseCount')} cases)")
        add("")
        add("| Evaluator | A wins | Ties | B wins |")
        add("|---|---|---|---|")
        for e in pairwise.get("byEvaluator", []):
            add(f"| {e.get('evaluatorName')} | {e.get('aWins')} | {e.get('ties')} | {e.get('bWins')} |")
        add("")
        improved = sum(1 for e in pairwise.get("byEvaluator", []) if e.get("bWins", 0) > e.get("aWins", 0))
        regressed = sum(1 for e in pairwise.get("byEvaluator", []) if e.get("aWins", 0) > e.get("bWins", 0))
        if regressed:
            reading = (f"The candidate regresses on {regressed} dimension(s) — do not adopt without "
                       "understanding and fixing those regressions.")
        elif improved:
            reading = (f"The candidate improves on {improved} dimension(s) and regresses on none — safe to "
                       "adopt on quality grounds; decide on cost and latency.")
        else:
            reading = ("The variants are statistically indistinguishable on quality — choose on cost, "
                       "latency, or operational simplicity.")
        add(f"**Reading:** {reading}")
        add("")
    else:
        add("_No head-to-head battle has been run for this pair — score deltas above are single-run "
            "comparisons and include run-to-run noise._")
        add("")

    add(_METHODOLOGY)
    add("")
    return "\n".join(lines)


_HTML_STYLE = """
  body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b;
         max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.55; font-size: 14px; }
  h1 { font-size: 1.6rem; border-bottom: 2px solid #6366f1; padding-bottom: .4rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #e2e8f0; padding-bottom: .25rem; }
  h3 { font-size: 1rem; color: #475569; }
  table { border-collapse: collapse; width: 100%; margin: .75rem 0; }
  th, td { border: 1px solid #e2e8f0; padding: .4rem .6rem; text-align: left; font-size: 13px; }
  th { background: #f8fafc; font-weight: 600; }
  code { background: #f1f5f9; padding: .1rem .3rem; border-radius: 3px; font-size: 12px; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: .75rem;
        font-size: 11px; white-space: pre-wrap; word-break: break-word; }
  details { margin: .5rem 0; } summary { font-weight: 600; cursor: pointer; color: #4f46e5; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0; }
  .printbar { position: sticky; top: 0; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px;
              padding: .5rem .75rem; font-size: 13px; display: flex; align-items: center; gap: .75rem; }
  .printbar button { background: #4f46e5; color: #fff; border: none; border-radius: 6px;
                     padding: .35rem .9rem; font-weight: 600; cursor: pointer; }
  @media print { .printbar { display: none; } body { margin: 0; max-width: none; font-size: 12px; } }
"""


def to_html(md_text: str, title: str) -> str:
    """Render a report's markdown as a print-styled HTML page — the browser's
    Print → Save as PDF is the PDF pipeline, no server-side PDF stack."""
    import markdown as md_lib

    body = md_lib.markdown(md_text, extensions=["tables"])
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title><style>{_HTML_STYLE}</style></head><body>"
        "<div class='printbar'><span>Save this report as PDF via your browser's print dialog.</span>"
        "<button onclick='window.print()'>Print / Save as PDF</button></div>"
        f"{body}"
        "<script>document.querySelectorAll('details').forEach(d => d.open = true);</script>"
        "</body></html>"
    )


_METHODOLOGY = """---

## Methodology

Each test case is sent verbatim to the deployed agent through its production invoke API. \
The agent's answer is scored by an LLM judge against one anchored rubric per dimension \
(mandatory written reasoning, temperature 0), complemented by deterministic checks: a regex \
scan force-fails the PII gate on pattern matches regardless of the judge's opinion, and \
latency/cost are measured, not judged. Category scores are weighted \
(accuracy 30%, safety 30%, compliance 15%, quality 15%, performance 10%) into the overall \
score. Any hard gate below threshold blocks autonomy eligibility regardless of the overall \
score. Judge verdicts are advisory evidence for a human promotion decision, not a \
substitute for one."""
