"""Render attestation-report.md from attestation-results.json.

Produces a human-readable control x verdict matrix organized by category x scope.

Untrusted strings (CLI stdout/stderr, AWS error messages) flow through the
`markdown_safe` Jinja filter, which neutralizes the markdown special chars
that would otherwise break the rendered tables (backticks, pipes, angle
brackets, leading hashes/asterisks). Jinja's HTML autoescape is the wrong
layer for markdown output, so we use a custom filter instead.
"""
from __future__ import annotations

import json
import shlex
from pathlib import Path
from typing import Any

try:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
except ImportError:
    raise ImportError("jinja2 required for rendering. Install with: pip install jinja2")


# Characters that break markdown table cells (pipes split columns, backticks
# open code spans, angle brackets are HTML-passthrough). We don't try to
# preserve formatting — the goal is "the table parses and the value is
# recognizable", not "the value renders identically to source".
_MARKDOWN_SPECIALS = {
    "|": "\\|",
    "`": "\\`",
    "<": "&lt;",
    ">": "&gt;",
    "\\": "\\\\",
    "\n": " ",
    "\r": " ",
}


def markdown_safe(value: Any) -> str:
    """Escape characters that would break markdown tables / code fences.

    Idempotent enough for our purposes: stdout flowing in once is escaped
    once. Returns empty string for None to keep templates terse.
    """
    if value is None:
        return ""
    s = str(value)
    out: list[str] = []
    for ch in s:
        out.append(_MARKDOWN_SPECIALS.get(ch, ch))
    return "".join(out)


def _make_env(template_dir: Path) -> Environment:
    """Build a Jinja Environment with autoescape on (HTML/XML, defense in
    depth) plus the markdown_safe filter for markdown contexts."""
    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    env.filters["markdown_safe"] = markdown_safe
    # Helper for templates: shlex-join an argv array into a quoted string.
    env.filters["shlex_join"] = lambda argv: shlex.join(argv) if argv else ""
    return env


def render_attestation_report(
    attestation_results: dict[str, Any],
    output_path: Path,
) -> None:
    """Render attestation-report.md from attestation-results.json."""
    template_dir = Path(__file__).parent / "templates"
    env = _make_env(template_dir)
    template = env.get_template("attestation-report.md.j2")

    # Enrich results with control metadata (scope, category) for matrix rendering.
    results_with_metadata = []
    for result in attestation_results.get("results", []):
        result = dict(result)  # don't mutate caller's data
        control_id = result.get("control_id", "")
        if control_id.startswith("CTRL-"):
            parts = control_id.split("-")
            if len(parts) >= 4:
                result["scope"] = parts[1]
                result["category"] = parts[2]
        # Surface a humanized command_str for the report; programmatic
        # consumers should still read command_argv from the JSON.
        if "command_str" not in result and result.get("command_argv"):
            result["command_str"] = shlex.join(result["command_argv"])
        results_with_metadata.append(result)

    category_names = {
        "PRO": "Proactive",
        "PRV": "Preventive",
        "DET": "Detective",
        "COR": "Corrective/Responsive",
    }

    rendered = template.render(
        service=attestation_results.get("service", ""),
        service_slug=attestation_results.get("service_slug", ""),
        evidence_run_id=attestation_results.get("evidence_run_id", ""),
        stack_id=attestation_results.get("stack_id", ""),
        overall_verdict=attestation_results.get("overall_verdict", ""),
        results=results_with_metadata,
        total_controls=attestation_results["counts"]["total_controls"],
        pass_count=attestation_results["counts"]["pass"],
        fail_count=attestation_results["counts"]["fail"],
        error_count=attestation_results["counts"]["error"],
        ncv_count=attestation_results["counts"]["not_cli_validatable"],
        category_names=category_names,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(rendered)


def render_summary(
    attestation_results: dict[str, Any],
    output_path: Path,
) -> None:
    """Render summary.md from attestation-results.json."""
    template_dir = Path(__file__).parent / "templates"
    env = _make_env(template_dir)
    template = env.get_template("summary.md.j2")

    rendered = template.render(
        service=attestation_results.get("service", ""),
        service_slug=attestation_results.get("service_slug", ""),
        evidence_run_id=attestation_results.get("evidence_run_id", ""),
        stack_id=attestation_results.get("stack_id", ""),
        overall_verdict=attestation_results.get("overall_verdict", ""),
        results=attestation_results.get("results", []),
        total_controls=attestation_results["counts"]["total_controls"],
        pass_count=attestation_results["counts"]["pass"],
        fail_count=attestation_results["counts"]["fail"],
        error_count=attestation_results["counts"]["error"],
        ncv_count=attestation_results["counts"]["not_cli_validatable"],
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(rendered)
