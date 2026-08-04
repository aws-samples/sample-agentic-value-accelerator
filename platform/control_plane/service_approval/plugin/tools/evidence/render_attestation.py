"""Render <slug>/attestation.md — the reviewer's audit guide.

This is the top-level entry point for an independent reviewer auditing the
service approval directory. It describes every artifact in the tree with
chain-of-custody traceability.
"""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
except ImportError:
    raise ImportError("jinja2 required for rendering. Install with: pip install jinja2")

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore

from tools.evidence.render_report import markdown_safe
from tools.paths import phase_dir, repo_root, service_root


def _resolve_pipeline_version() -> str:
    """Read the pipeline version from manifest.yaml.

    Falls back to "unknown" if manifest.yaml is missing or PyYAML isn't available.
    """
    if yaml is None:
        return "unknown (PyYAML not installed)"
    try:
        manifest_path = repo_root() / "manifest.yaml"
        with open(manifest_path) as f:
            manifest = yaml.safe_load(f)
        return str(manifest.get("version", "unknown"))
    except (OSError, yaml.YAMLError):
        return "unknown"


def _resolve_git_commit() -> str:
    """Resolve the current git commit SHA.

    Returns the short SHA (12 chars), or 'unknown' if git is unavailable
    or this isn't a git checkout. Includes 'dirty' suffix if there are
    uncommitted changes.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            capture_output=True, text=True, cwd=str(repo_root()), timeout=5,
        )
        if result.returncode != 0:
            return "unknown"
        sha = result.stdout.strip()

        # Check for uncommitted changes
        dirty = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=str(repo_root()), timeout=5,
        )
        if dirty.returncode == 0 and dirty.stdout.strip():
            sha = f"{sha}-dirty"
        return sha
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return "unknown"


def _resolve_operator() -> str:
    """Resolve the operator running this pipeline.

    Order: AWS_PROFILE env var → USER env var → 'unknown'.
    Captures who ran the pipeline for the chain-of-custody record.
    """
    return (
        os.environ.get("AWS_PROFILE")
        or os.environ.get("USER")
        or os.environ.get("USERNAME")  # Windows
        or "unknown"
    )


def render_attestation_guide(
    service_slug: str,
    attestation_results: dict[str, Any],
    sar_facts: dict[str, Any],
    mapping_results: dict[str, Any],
) -> None:
    """Render <slug>/attestation.md from phase outputs.

    Args:
        service_slug: Service slug (e.g., "awslambda")
        attestation_results: Parsed attestation-results.json
        sar_facts: Parsed sar-facts.json
        mapping_results: Parsed mapping-results.json
    """
    # Load template — autoescape configured for HTML/XML (defense in depth);
    # untrusted strings flow through the markdown_safe filter in the template.
    template_dir = Path(__file__).parent / "templates"
    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    env.filters["markdown_safe"] = markdown_safe
    template = env.get_template("attestation.md.j2")

    # Extract metadata
    service = sar_facts.get("service", "")
    service_prefix = sar_facts.get("service_prefix", "")
    sar_url = sar_facts.get("documentation", {}).get("service_authorization_reference", "")
    framework = mapping_results.get("framework", {})
    framework_name = framework.get("name", "")
    framework_source = framework.get("source_file", "")

    # CFN reference URL (constructed from service_prefix)
    cfn_ref_url = f"https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/AWS_{service_prefix}.html"

    # Pipeline chain-of-custody — resolved at render time, not hardcoded.
    pipeline_version = _resolve_pipeline_version()
    git_commit = _resolve_git_commit()
    operator = _resolve_operator()

    # Render
    rendered = template.render(
        service=service,
        service_slug=service_slug,
        generated_at=datetime.now(timezone.utc).isoformat(),
        overall_verdict=attestation_results.get("overall_verdict", ""),
        total_controls=attestation_results["counts"]["total_controls"],
        pass_count=attestation_results["counts"]["pass"],
        fail_count=attestation_results["counts"]["fail"],
        ncv_count=attestation_results["counts"]["not_cli_validatable"],
        framework_name=framework_name,
        sar_url=sar_url,
        cfn_ref_url=cfn_ref_url,
        framework_source_file=framework_source,
        pipeline_version=pipeline_version,
        git_commit=git_commit,
        operator=operator,
    )

    # Write to <slug>/attestation.md
    output_path = service_root(service_slug) / "attestation.md"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(rendered)
