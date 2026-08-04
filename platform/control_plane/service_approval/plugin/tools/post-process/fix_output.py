#!/usr/bin/env python3
"""
Post-process assessment output files.

Applies deterministic fixes that are too important to leave to prompt compliance:
1. Sanitize leaked pipeline terminology (37 pairs)
2. Remove meta-commentary lines (18 markers)
3. Strip leaked S3 bucket ARNs
4. Normalize answer direction prefixes (8 mappings + stuttered dedup)
5. Enrich bare "Not found" to canonical form
6. Fix GAPS table totals to match actual row counts
7. Check CloudWatch namespace consistency (summary only)
8. Collapse excessive blank lines
9. (Optional) Strip source data sections (--strip-source-data)

Matches the hosted solution's 6-step post-processing chain in app.py.

Usage:
    python3 fix_output.py <file_path> [--strip-source-data]
"""

import re
import sys


# ================================================================
# Terminology Pairs (longest-first for correct replacement order)
# ================================================================

_TERMINOLOGY_PAIRS = [
    # MCP tool name sanitization (longest first)
    ("gateway_aws-documentation-mcp___read_documentation", "AWS Documentation"),
    ("gateway_aws-documentation-mcp___search_documentation", "AWS Documentation Search"),
    ("gateway_iam-policy-mcp___read_iam_policy", "IAM Policy Reference"),
    ("mcp__aws-documentation__read_documentation", "AWS Documentation"),
    ("mcp__aws-documentation__search_documentation", "AWS Documentation Search"),
    ("mcp__kb-search__search_security_accelerators_kb", "Security Accelerator KB"),
    ("mcp__kb-search__search_customer_requirements_kb", "Customer Requirements KB"),
    ("mcp__kb-search__search_compliance_frameworks_kb", "Compliance Frameworks KB"),
    ("mcp__kb-search__search_threat_models_kb", "Threat Models KB"),
    ("mcp__kb-search__search_iam_personas_kb", "IAM Personas KB"),
    ("gateway_aws-documentation-mcp", "AWS Documentation"),
    ("aws-documentation-mcp", "AWS Documentation"),
    ("iam-policy-mcp", "IAM Policy Reference"),
    ("search_security_accelerators_kb", "Security Accelerator KB"),
    ("search_customer_requirements_kb", "Customer Requirements KB"),
    ("search_compliance_frameworks_kb", "Compliance Frameworks KB"),
    ("search_threat_models_kb", "Threat Models KB"),
    ("search_iam_personas_kb", "IAM Personas KB"),
    ("Gateway MCP", "AWS Documentation"),
    ("AWS Documentation MCP", "AWS Documentation"),
    # Reference documentation variants (longest first)
    ("Based on the reference documentation provided below", "Based on available AWS documentation"),
    ("Based on the reference documentation provided", "Based on available AWS documentation"),
    ("According to the reference documentation provided below", "According to available AWS documentation"),
    ("According to the reference documentation provided", "According to available AWS documentation"),
    ("from the reference documentation provided below", "from available AWS documentation"),
    ("the reference documentation provided below", "available AWS documentation"),
    ("the reference documentation provided", "available AWS documentation"),
    ("Based on the reference documentation", "Based on available AWS documentation"),
    ("According to the reference documentation", "According to available AWS documentation"),
    ("from the reference documentation", "from available AWS documentation"),
    ("in the reference documentation", "in available AWS documentation"),
    ("the reference documentation does not", "AWS documentation does not"),
    ("the reference documentation", "available AWS documentation"),
    ("reference documentation", "AWS documentation"),
    # MCP failure meta-commentary
    ("due to MCP tool unavailability", "based on available information"),
    ("MCP tool unavailability", "limited tool availability"),
    ("persistent MCP client session errors", "temporary service interruption"),
    ("MCP client session error", "temporary service interruption"),
    ("session context error", "temporary service interruption"),
    # Other leaked prompt terminology
    ("pre-researched findings", "available documentation"),
    ("pre-researched", "available"),
    ("TOOL FAILURE GUARD: ", ""),
    ("TOOL FAILURE GUARD", ""),
]

_META_COMMENTARY_MARKERS = [
    "as a synthesizer",
    "as the synthesizer",
    "i am a synthesizer",
    "my role as synthesizer",
    "direction should be",
    "the direction should",
    "should be changed to",
    "the answer direction",
    "answer direction should",
    "note to reviewer",
    "note for reviewer",
    "editorial note:",
    "internal note:",
    "tool unavailable",
    "tools were unavailable",
    "mcp tool unavailability",
    "mcp client session error",
    "mcp session error",
]

# Direction normalization (bad prefix -> canonical prefix)
_DIRECTION_FIXES = [
    ("no, partially", "No."),
    ("no partially", "No."),
    ("no, with a nuance", "No."),
    ("no with a nuance", "No."),
    ("partially", "Yes, partially."),
    ("partial.", "Yes, partially."),
    ("partial,", "Yes, partially."),
    ("partial ", "Yes, partially."),
]


def _ci_replace(text: str, old: str, new: str) -> str:
    """Case-insensitive string replacement preserving structure."""
    lower = text.lower()
    old_lower = old.lower()
    parts = []
    i = 0
    while True:
        idx = lower.find(old_lower, i)
        if idx == -1:
            parts.append(text[i:])
            break
        parts.append(text[i:idx])
        parts.append(new)
        i = idx + len(old)
    return "".join(parts)


def sanitize_terminology(text: str) -> str:
    """Replace leaked pipeline terminology with user-facing language."""
    for leaked, replacement in _TERMINOLOGY_PAIRS:
        text = _ci_replace(text, leaked, replacement)
    return text


def remove_meta_commentary(text: str) -> str:
    """Strip entire lines that are pure pipeline meta-commentary."""
    lines = text.split("\n")
    kept = []
    removed = 0
    for line in lines:
        line_lower = line.strip().lower()
        if line_lower and any(marker in line_lower for marker in _META_COMMENTARY_MARKERS):
            removed += 1
            continue
        kept.append(line)
    if removed:
        print(f"  Removed {removed} meta-commentary line(s)")
    return "\n".join(kept)


def normalize_answer_direction(text: str) -> str:
    """Normalize non-canonical answer direction prefixes.

    Matches the hosted solution's _normalize_answer_direction() in app.py.
    Applied per [A#] answer block.
    """
    # Find all [A#] answer blocks
    pattern = re.compile(r"(\[A\d+\])\s*(.*?)(?=\n\[A\d+\]|\Z)", re.DOTALL)
    fixed = 0

    # Stuttered direction dedup patterns
    stutter_patterns = [
        (re.compile(r"^(partially)[,.\s]+(partially)\b", re.IGNORECASE), "Yes, partially."),
        (re.compile(r"^(yes,?\s*partially)[,.\s]+(yes,?\s*partially)\b", re.IGNORECASE), "Yes, partially."),
        (re.compile(r"^(no)[,.\s]+(no)\b", re.IGNORECASE), "No."),
        (re.compile(r"^(yes)[,.\s]+(yes)\b", re.IGNORECASE), "Yes."),
    ]

    def _fix_direction(match):
        nonlocal fixed
        marker = match.group(1)
        body = match.group(2).strip()
        if not body:
            return match.group(0)

        # Fix stuttered directions first (e.g., "partially, partially" -> "Yes, partially.")
        for stutter_re, stutter_fix in stutter_patterns:
            stutter_match = stutter_re.match(body)
            if stutter_match:
                rest = body[stutter_match.end():].lstrip(" .,;:")
                body = f"{stutter_fix} {rest}" if rest else stutter_fix
                fixed += 1
                break

        body_lower = body.lower()
        for bad_prefix, good_prefix in _DIRECTION_FIXES:
            if body_lower.startswith(bad_prefix):
                # Extract the rest of the text after the bad prefix
                rest = body[len(bad_prefix):].lstrip(" .,;:")
                body = f"{good_prefix} {rest}" if rest else good_prefix
                fixed += 1
                break

        return f"{marker} {body}"

    result = pattern.sub(_fix_direction, text)
    if fixed:
        print(f"  Normalized {fixed} answer direction(s)")
    return result


def fix_gap_counts(text: str) -> str:
    """Correct GAPS summary line to match actual GAPS Summary table row counts.

    Only counts rows in the GAPS Summary section (after '## GAPS Summary'),
    not rows in per-domain compliance matrices.
    """
    # Find the GAPS Summary section
    gaps_section_match = re.search(r"## GAPS Summary", text)
    if not gaps_section_match:
        return text

    gaps_section = text[gaps_section_match.start():]

    gap_rows = re.findall(r"^\|\s*\d+\s*\|.*REQUIREMENT GAP", gaps_section, re.MULTILINE)
    action_rows = re.findall(r"^\|\s*\d+\s*\|.*CUSTOMER ACTION REQUIRED", gaps_section, re.MULTILINE)
    actual_gaps = len(gap_rows)
    actual_actions = len(action_rows)

    if actual_gaps == 0 and actual_actions == 0:
        return text

    total_pattern = re.compile(r"Total gaps:\s*\d+\s*\|\s*Total customer actions:\s*\d+")
    correct_line = f"Total gaps: {actual_gaps} | Total customer actions: {actual_actions}"

    if total_pattern.search(text):
        new_text = total_pattern.sub(correct_line, text)
        if new_text != text:
            print(f"  Fixed gap counts: gaps={actual_gaps}, actions={actual_actions}")
        return new_text

    return text


def strip_s3_arns(text: str) -> str:
    """Remove leaked S3 bucket ARNs that expose stack info."""
    new_text = re.sub(
        r"(?:s3://|arn:aws:s3:::)serviceenablementsta-[^\s,)\]]+",
        "[internal]",
        text,
    )
    if new_text != text:
        print("  Stripped leaked S3 ARNs")
    return new_text


def enrich_bare_not_found(text: str) -> str:
    """Expand bare 'Not found' to canonical form."""
    lines = text.split("\n")
    fixed = 0
    result = []
    for line in lines:
        stripped = line.strip().rstrip(".")
        if stripped.lower() == "not found":
            result.append("Not found in available AWS documentation.")
            fixed += 1
        else:
            result.append(line)
    if fixed:
        print(f"  Enriched {fixed} bare 'Not found' line(s)")
    return "\n".join(result)


def check_namespace_consistency(text: str) -> str:
    """Check CloudWatch metric namespace consistency in summary output.

    Matches the hosted solution's _check_namespace_consistency() in app.py.
    Flags mixed AWS/ prefixes or casing inconsistencies.
    """
    # Only applies to summaries (has ## [LOGGING] section)
    if "## [LOGGING]" not in text and "## LOGGING" not in text:
        return text

    # Extract namespace references
    ns_pattern = re.compile(
        r"(?:Namespace:\s*|--namespace\s+|`)(AWS/[\w-]+|[\w-]+/[\w-]+)`?",
        re.IGNORECASE,
    )
    namespaces = ns_pattern.findall(text)
    if not namespaces:
        return text

    # Group by base name (lowercase, strip AWS/ prefix)
    groups: dict[str, list[str]] = {}
    for ns in namespaces:
        if ns.lower() == "aws/usage":
            continue  # Legitimate separate namespace
        base = ns.lower().replace("aws/", "")
        groups.setdefault(base, []).append(ns)

    issues = []
    for base, variants in groups.items():
        unique = set(variants)
        if len(unique) > 1:
            has_prefix = any(v.startswith("AWS/") for v in unique)
            no_prefix = any(not v.startswith("AWS/") for v in unique)
            if has_prefix and no_prefix:
                issues.append(f"Mixed AWS/ prefix for '{base}': {sorted(unique)}")
            elif len(set(v.lower() for v in unique)) < len(unique):
                issues.append(f"Casing inconsistency for '{base}': {sorted(unique)}")

    if issues:
        note = "\n\n> **NOTE**: CloudWatch namespace inconsistencies detected:\n"
        for issue in issues:
            note += f"> - {issue}\n"

        # Insert after LOGGING section (before next ## section)
        logging_end = re.search(
            r"(## \[LOGGING\].*?)(\n## \[)", text, re.DOTALL
        )
        if logging_end:
            insert_pos = logging_end.end(1)
            text = text[:insert_pos] + note + text[insert_pos:]
            print(f"  Flagged {len(issues)} namespace inconsistency(ies)")

    return text


def collapse_blank_lines(text: str) -> str:
    """Reduce 3+ consecutive blank lines to 2."""
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text


def strip_source_data(text: str) -> str:
    """Strip SOURCE REGISTRY sections, pipe-delimited source tables, residual [S#] markers,
    and leaked tool metadata.

    Used when producing clean output without inline source tracking.
    """
    stripped = 0

    # Remove SOURCE REGISTRY / SOURCE DATA sections (header through next ## or end)
    source_section_re = re.compile(
        r"^#{1,3}\s*SOURCE\s+(?:REGISTRY|DATA|REFERENCES?).*?(?=\n#{1,3}\s|\Z)",
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    text, n = source_section_re.subn("", text)
    stripped += n

    # Remove pipe-delimited source table rows (lines starting with | S# | or | Source | or | # |)
    source_table_re = re.compile(
        r"^\|[\s]*(?:S\d+|Source|#|----)[\s]*\|.*$\n?",
        re.MULTILINE,
    )
    text, n = source_table_re.subn("", text)
    stripped += n

    # Remove residual [S#] markers (e.g., [S1], [S12])
    text, n = re.subn(r"\s*\[S\d+\]", "", text)
    stripped += n

    # Remove leaked tool metadata lines (tool_use_id, tool_name, etc.)
    tool_meta_re = re.compile(
        r"^.*(?:tool_use_id|tool_name|tool_call_id|<tool_result>|</tool_result>).*$\n?",
        re.MULTILINE,
    )
    text, n = tool_meta_re.subn("", text)
    stripped += n

    if stripped:
        print(f"  Stripped {stripped} source data element(s)")

    return text


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}

    if not args:
        print("Usage: python3 fix_output.py <file_path> [--strip-source-data]")
        sys.exit(1)

    file_path = args[0]
    do_strip_source = "--strip-source-data" in flags
    print(f"Post-processing: {file_path}")

    with open(file_path) as f:
        text = f.read()

    original_len = len(text)

    # Detect file type
    is_questionnaire = bool(re.search(r"\[A\d+\]", text))

    # Apply fixes in order (matches hosted solution's post-processing chain)
    text = sanitize_terminology(text)
    text = remove_meta_commentary(text)
    text = strip_s3_arns(text)
    if is_questionnaire:
        text = normalize_answer_direction(text)
    text = enrich_bare_not_found(text)
    text = fix_gap_counts(text)
    text = check_namespace_consistency(text)
    if do_strip_source:
        text = strip_source_data(text)
    text = collapse_blank_lines(text)

    with open(file_path, "w") as f:
        f.write(text)

    delta = original_len - len(text)
    print(f"  Done. {original_len} -> {len(text)} chars (delta: {delta:+d})")


if __name__ == "__main__":
    main()
