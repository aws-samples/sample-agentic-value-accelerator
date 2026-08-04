"""Unit tests for validate_pipeline_integrity checks."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from validate_pipeline_integrity import (
    CONDITION_OPERATOR_PAIRS,
    MIN_FRAMEWORK_COVERAGE_PCT,
    MIN_MCP_CALLS,
    check_framework_coverage,
    check_iac_placeholders,
    check_iam_policies,
    check_mcp_log,
    check_validated_notes,
    check_verdict_consistency,
    validate_pipeline,
)


# ---------- P1: mcp-calls.log ----------


def test_mcp_log_missing_fails(tmp_path: Path) -> None:
    """Neither pipeline.log nor mcp-calls.log exists → P1 fails."""
    errors = check_mcp_log(tmp_path)
    assert len(errors) == 1
    assert errors[0].startswith("P1")
    # Either log file name appears in the error message
    assert "pipeline.log" in errors[0] or "mcp-calls.log" in errors[0]


def test_mcp_log_below_minimum_fails(tmp_path: Path) -> None:
    (tmp_path / "mcp-calls.log").write_text("MCP CALL 1\nMCP CALL 2\n")
    errors = check_mcp_log(tmp_path)
    assert len(errors) == 1
    assert "P1" in errors[0] and f"minimum {MIN_MCP_CALLS}" in errors[0]


def test_mcp_log_at_minimum_passes(tmp_path: Path) -> None:
    (tmp_path / "mcp-calls.log").write_text(
        "\n".join(f"MCP CALL {i}" for i in range(MIN_MCP_CALLS))
    )
    assert check_mcp_log(tmp_path) == []


def test_mcp_log_case_insensitive_call_marker(tmp_path: Path) -> None:
    # Both "MCP CALL" and "MCP call" are recognised per the implementation.
    lines = ["MCP CALL foo"] * 5 + ["MCP call bar"] * 5
    (tmp_path / "mcp-calls.log").write_text("\n".join(lines))
    assert check_mcp_log(tmp_path) == []


def test_pipeline_log_mcp_calls_counted(tmp_path: Path) -> None:
    """P1 reads MCP call count from the consolidated pipeline.log.

    The consolidated logger writes lines like:
      <ts> [01-assess] [mcp:awsknowledge:call]  <message>
    P1 must recognize these and count them — same threshold as legacy.
    """
    pipeline_lines = [
        f"2026-05-14T18:32:0{i}Z [01-assess] [mcp:awsknowledge:call]  search_documentation: query{i}"
        for i in range(MIN_MCP_CALLS)
    ]
    (tmp_path / "pipeline.log").write_text("\n".join(pipeline_lines))
    assert check_mcp_log(tmp_path) == []


def test_pipeline_log_below_minimum_fails(tmp_path: Path) -> None:
    """pipeline.log present but with too few MCP calls fails P1."""
    pipeline_lines = [
        f"2026-05-14T18:32:0{i}Z [01-assess] [mcp:awsknowledge:call]  q{i}"
        for i in range(2)
    ]
    (tmp_path / "pipeline.log").write_text("\n".join(pipeline_lines))
    errors = check_mcp_log(tmp_path)
    assert len(errors) == 1
    assert "P1" in errors[0]


# ---------- P2: validated.json verification notes ----------


def test_validated_notes_missing_file_is_p2_failure(tmp_path: Path) -> None:
    """A missing validated.json must be a P2 failure, not a silent pass.

    Previously the gate returned [] when the file was absent — letting a
    pipeline that skipped Phase 2 entirely sneak through. Now the gate
    reports a hard fail.
    """
    errors = check_validated_notes(tmp_path)
    assert len(errors) == 1
    assert "P2 FAIL" in errors[0] and "missing" in errors[0]


def test_validated_notes_unparseable_file_is_p2_failure(tmp_path: Path) -> None:
    """A validated.json that exists but doesn't parse must also be a P2 failure."""
    (tmp_path / "validated.json").write_text("{not valid json")
    errors = check_validated_notes(tmp_path)
    assert len(errors) == 1
    assert "P2 FAIL" in errors[0] and "failed to parse" in errors[0]


def test_validated_notes_no_notes_fails(tmp_path: Path) -> None:
    (tmp_path / "validated.json").write_text(json.dumps({"capabilities": {}}))
    errors = check_validated_notes(tmp_path)
    assert len(errors) == 1
    assert "P2" in errors[0] and "zero verification_note" in errors[0]


def test_validated_notes_unique_notes_pass(tmp_path: Path) -> None:
    data = {
        "items": [
            {"verification_note": f"Verified via MCP call for item {i} — details {i}"}
            for i in range(6)
        ]
    }
    (tmp_path / "validated.json").write_text(json.dumps(data))
    assert check_validated_notes(tmp_path) == []


def test_validated_notes_heavily_duplicated_fails(tmp_path: Path) -> None:
    data = {"items": [{"verification_note": "TODO"} for _ in range(8)]}
    (tmp_path / "validated.json").write_text(json.dumps(data))
    errors = check_validated_notes(tmp_path)
    assert any("P2" in e and "duplicated" in e for e in errors)


def test_validated_notes_feasibility_note_also_counted(tmp_path: Path) -> None:
    # feasibility_note is also scanned — reusing the same string across both
    # field names should still trip the duplication rule.
    data = {
        "items": [
            {"verification_note": "same"} for _ in range(4)
        ] + [
            {"feasibility_note": "same"} for _ in range(4)
        ]
    }
    (tmp_path / "validated.json").write_text(json.dumps(data))
    errors = check_validated_notes(tmp_path)
    assert any("P2" in e and "duplicated" in e for e in errors)


def test_validated_notes_short_summary_fails(tmp_path: Path) -> None:
    data = {
        "items": [{"verification_note": f"unique note {i} with enough length"} for i in range(4)],
        "verification": {"summary": "ok"},
    }
    (tmp_path / "validated.json").write_text(json.dumps(data))
    errors = check_validated_notes(tmp_path)
    assert any("P2" in e and "summary is too short" in e for e in errors)


# ---------- P3: IAM policy logic ----------


def _write_policy(tmp_path: Path, name: str, policy: dict) -> None:
    (tmp_path / name).write_text(json.dumps(policy))


def test_iam_inverted_string_equals_fails(tmp_path: Path) -> None:
    policy = {
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::bucket/*",
                "Condition": {
                    "StringEquals": {"aws:PrincipalOrgID": "o-abc"},
                    "StringNotEquals": {"aws:ResourceTag/Env": "prod"},
                },
            }
        ]
    }
    _write_policy(tmp_path, "policy.json", policy)
    errors = check_iam_policies(tmp_path)
    assert any("P3" in e and "StringEquals" in e and "cannot fire" in e for e in errors)


def test_iam_overlapping_keys_pass(tmp_path: Path) -> None:
    # Same key in both StringEquals and StringNotEquals is a legitimate pattern
    # (allow one value but exclude a subset), so the inverted-key check must not trip.
    policy = {
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::bucket/*",
                "Condition": {
                    "StringEquals": {"aws:ResourceTag/Env": "prod"},
                    "StringNotEquals": {"aws:ResourceTag/Env": "prod-readonly"},
                },
            }
        ]
    }
    _write_policy(tmp_path, "policy.json", policy)
    # The check may still flag exfil-path issues, but never an inverted-keys P3.
    errors = check_iam_policies(tmp_path)
    assert not any("cannot fire correctly" in e for e in errors)


@pytest.mark.parametrize("pos_op,neg_op", CONDITION_OPERATOR_PAIRS)
def test_iam_inverted_logic_detected_for_all_operator_pairs(
    tmp_path: Path, pos_op: str, neg_op: str
) -> None:
    policy = {
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::bucket/*",
                "Condition": {
                    pos_op: {"aws:PrincipalOrgID": "o-abc"},
                    neg_op: {"aws:ResourceTag/Env": "prod"},
                },
            }
        ]
    }
    _write_policy(tmp_path, "policy.json", policy)
    errors = check_iam_policies(tmp_path)
    assert any(
        "P3" in e and pos_op in e and neg_op in e and "cannot fire" in e for e in errors
    ), f"expected inverted-logic finding for {pos_op} vs {neg_op}, got: {errors}"


def test_iam_allow_star_without_condition_fails(tmp_path: Path) -> None:
    policy = {
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "logs:*",
                "Resource": "*",
            }
        ]
    }
    _write_policy(tmp_path, "policy.json", policy)
    errors = check_iam_policies(tmp_path)
    assert any("P3" in e and "exfiltration path" in e for e in errors)


def test_iam_allow_star_with_condition_passes(tmp_path: Path) -> None:
    policy = {
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "logs:*",
                "Resource": "*",
                "Condition": {"StringEquals": {"aws:PrincipalOrgID": "o-abc"}},
            }
        ]
    }
    _write_policy(tmp_path, "policy.json", policy)
    errors = check_iam_policies(tmp_path)
    assert not any("exfiltration path" in e for e in errors)


def test_scp_without_deny_fails(tmp_path: Path) -> None:
    policy = {
        "Statement": [
            {"Effect": "Allow", "Action": "s3:GetObject", "Resource": "*"}
        ]
    }
    _write_policy(tmp_path, "scp-baseline.json", policy)
    errors = check_iam_policies(tmp_path)
    assert any("P3" in e and "SCP has no Deny" in e for e in errors)


def test_scp_with_deny_passes(tmp_path: Path) -> None:
    policy = {
        "Statement": [
            {"Effect": "Deny", "Action": "s3:DeleteBucket", "Resource": "*"}
        ]
    }
    _write_policy(tmp_path, "scp-guardrail.json", policy)
    errors = check_iam_policies(tmp_path)
    assert not any("SCP has no Deny" in e for e in errors)


def test_non_scp_without_deny_passes(tmp_path: Path) -> None:
    # The SCP Deny requirement should only apply to files named like SCPs.
    policy = {
        "Statement": [
            {"Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::b/*"}
        ]
    }
    _write_policy(tmp_path, "resource-policy.json", policy)
    errors = check_iam_policies(tmp_path)
    assert not any("SCP has no Deny" in e for e in errors)


# ---------- P4: IaC placeholders ----------


def test_iac_placeholder_account_fails(tmp_path: Path) -> None:
    (tmp_path / "template.yaml").write_text(
        "Resources:\n  Role:\n    Arn: arn:aws:iam::123456789012:role/foo\n"
    )
    errors = check_iac_placeholders(tmp_path)
    assert any("P4" in e and "123456789012" in e for e in errors)


def test_iac_placeholder_arn_fragment_fails(tmp_path: Path) -> None:
    (tmp_path / "stack.ts").write_text(
        'const kmsArn = "arn:aws:kms:us-east-1:123456789012:key/example";\n'
    )
    errors = check_iac_placeholders(tmp_path)
    # Both the account ID and the ARN fragment should trigger; at least one P4 required.
    assert any("P4" in e for e in errors)


def test_iac_parameterized_passes(tmp_path: Path) -> None:
    (tmp_path / "template.yaml").write_text(
        "Parameters:\n  AccountId:\n    Type: String\nResources:\n"
        '  Role:\n    Arn: !Sub "arn:aws:iam::${AccountId}:role/foo"\n'
    )
    assert check_iac_placeholders(tmp_path) == []


# ---------- P5: framework coverage ----------


def test_framework_coverage_both_files_missing_fails_closed(tmp_path: Path) -> None:
    """04-map/ exists but neither mapping-results.json nor
    map-framework-mapped.json is present. Pre-fix this returned [] silently;
    same Probe 33 pattern X1 closed for P2 and X2 closed for P6."""
    errors = check_framework_coverage(tmp_path)
    assert errors and "P5 FAIL" in errors[0] and "neither" in errors[0]


def test_framework_coverage_corrupt_json_fails_closed(tmp_path: Path) -> None:
    """A 1024+ byte mapping-results.json that fails to parse must
    fail-closed (P7's size threshold is content-blind)."""
    (tmp_path / "mapping-results.json").write_text("{not valid json" + "x" * 2000)
    errors = check_framework_coverage(tmp_path)
    assert errors and "P5 FAIL" in errors[0]


def test_framework_coverage_no_mapping_key_fails_closed(tmp_path: Path) -> None:
    """A file that parses but lacks the `framework_mapping` key must
    fail-closed. P7 only enforces size, not content shape."""
    (tmp_path / "mapping-results.json").write_text(
        json.dumps({"controls": [{"id": "c1"}], "padding": "x" * 2000})
    )
    errors = check_framework_coverage(tmp_path)
    assert errors and "P5 FAIL" in errors[0] and "framework_mapping" in errors[0]


def test_framework_coverage_empty_mapping_list_fails_closed(tmp_path: Path) -> None:
    """`framework_mapping: []` is the same shape as missing — fail-closed."""
    (tmp_path / "mapping-results.json").write_text(
        json.dumps({"framework_mapping": [], "padding": "x" * 2000})
    )
    errors = check_framework_coverage(tmp_path)
    assert errors and "P5 FAIL" in errors[0] and "framework_mapping" in errors[0]


def test_framework_coverage_high_passes(tmp_path: Path) -> None:
    data = {
        "framework_mapping": [{"status": "MAPPED"} for _ in range(8)] + [
            {"status": "N/A", "rationale": "x" * 40}
        ]
    }
    (tmp_path / "mapping-results.json").write_text(json.dumps(data))
    assert check_framework_coverage(tmp_path) == []


def test_framework_coverage_low_without_rationale_fails(tmp_path: Path) -> None:
    data = {
        "framework_mapping": (
            [{"status": "MAPPED"}]
            + [{"status": "N/A", "rationale": "short"} for _ in range(20)]
        )
    }
    (tmp_path / "mapping-results.json").write_text(json.dumps(data))
    errors = check_framework_coverage(tmp_path)
    assert any("P5" in e and "below" in e and str(MIN_FRAMEWORK_COVERAGE_PCT) in e for e in errors)


def test_framework_coverage_low_with_rationale_passes(tmp_path: Path) -> None:
    data = {
        "framework_mapping": (
            [{"status": "MAPPED"}]
            + [{"status": "N/A", "rationale": "r" * 50} for _ in range(20)]
        )
    }
    (tmp_path / "mapping-results.json").write_text(json.dumps(data))
    assert check_framework_coverage(tmp_path) == []


def test_framework_coverage_falls_back_to_mapped_file(tmp_path: Path) -> None:
    # Implementation tries mapping-results.json first, then map-framework-mapped.json.
    data = {"framework_mapping": [{"status": "MAPPED"} for _ in range(10)]}
    (tmp_path / "map-framework-mapped.json").write_text(json.dumps(data))
    assert check_framework_coverage(tmp_path) == []


# ---------- P6: verdict consistency ----------


def test_verdict_missing_report_is_noop(tmp_path: Path) -> None:
    assert check_verdict_consistency(tmp_path, integrity_errors_count=5) == []


def test_verdict_approved_with_errors_fails(tmp_path: Path) -> None:
    (tmp_path / "APPROVAL-REPORT.md").write_text("# Report\n\n## Verdict\nAPPROVED\n")
    errors = check_verdict_consistency(tmp_path, integrity_errors_count=3)
    assert any("P6" in e and "APPROVED" in e for e in errors)


def test_verdict_approved_with_exception_passes(tmp_path: Path) -> None:
    (tmp_path / "APPROVAL-REPORT.md").write_text(
        "# Report\n\n## Verdict\nAPPROVED WITH EXCEPTION\n"
    )
    assert check_verdict_consistency(tmp_path, integrity_errors_count=3) == []


def test_verdict_requires_remediation_passes(tmp_path: Path) -> None:
    (tmp_path / "APPROVAL-REPORT.md").write_text(
        "# Report\n\n## Verdict\nREQUIRES REMEDIATION\n"
    )
    assert check_verdict_consistency(tmp_path, integrity_errors_count=3) == []


def test_verdict_no_errors_approved_passes(tmp_path: Path) -> None:
    (tmp_path / "APPROVAL-REPORT.md").write_text("# Report\n\n## Verdict\nAPPROVED\n")
    assert check_verdict_consistency(tmp_path, integrity_errors_count=0) == []


def test_verdict_h3_header_fails_closed(tmp_path: Path) -> None:
    """A report with `### Verdict` H3 (instead of `## Verdict` H2) must
    fail-closed. Pre-fix this returned [] silently — letting any verdict
    through, even APPROVED with integrity failures."""
    (tmp_path / "APPROVAL-REPORT.md").write_text("# Report\n\n### Verdict\nAPPROVED\n")
    errors = check_verdict_consistency(tmp_path, integrity_errors_count=3)
    assert errors and "P6 FAIL" in errors[0] and "no `## Verdict` H2 header" in errors[0]


def test_verdict_no_header_at_all_fails_closed(tmp_path: Path) -> None:
    """A report without any verdict header (e.g., truncated mid-write)
    must fail-closed for the same reason."""
    (tmp_path / "APPROVAL-REPORT.md").write_text("# Report\n\nNo verdict here.\n")
    errors = check_verdict_consistency(tmp_path, integrity_errors_count=0)
    assert errors and "P6 FAIL" in errors[0]


# ---------- validate_pipeline integration ----------


def test_validate_pipeline_no_state_dir_returns_empty(tmp_path: Path) -> None:
    # No .service-approval/ → nothing to validate (pre-pipeline run).
    assert validate_pipeline(tmp_path) == []


def test_validate_pipeline_aggregates_errors(tmp_path: Path) -> None:
    # New layout: .service-approval/<slug>/0N-phase/
    out = tmp_path / ".service-approval"
    service = out / "testservice"
    service.mkdir(parents=True)

    # Create phase directories
    (service / "03-validate").mkdir()
    (service / "05-generate").mkdir()
    (service / "05-generate" / "preventive").mkdir()

    # Trigger P1 (missing mcp-calls.log at service root)
    # No mcp-calls.log created → will fail P1

    # Trigger P3 (SCP without at least one Deny)
    _write_policy(
        service / "05-generate",
        "scp-baseline.json",
        {"Statement": [{"Effect": "Allow", "Action": "*", "Resource": "*"}]},
    )

    errors = validate_pipeline(tmp_path)
    assert any("P1" in e for e in errors)
    assert any("P3" in e and "SCP has no Deny" in e for e in errors)


# ---------- P1 sentinel anchoring ----------


def test_pipeline_complete_sentinel_in_message_does_not_close_p1(tmp_path: Path) -> None:
    """A pipeline.log line whose MESSAGE contains the literal sentinel text must
    NOT close out P1 — only a real `[pipeline:complete:<VERDICT>]` source-tag
    counts. This protects against the validator getting tricked by skill prose
    that happens to quote the sentinel."""
    leaked = (
        "2026-05-14T18:32:01Z [07-summarize] [skill:summarize:end]  "
        "wrote `[pipeline:complete:APPROVED]` reference to docs only\n"
    )
    (tmp_path / "pipeline.log").write_text(leaked)
    errors = check_mcp_log(tmp_path)
    # P1 should still fail (no real MCP calls AND no real sentinel).
    assert errors and "P1" in errors[0]


def test_pipeline_complete_sentinel_at_source_tag_closes_p1(tmp_path: Path) -> None:
    """The real sentinel format closes out P1 retroactively — finalized runs
    are exempt because the file is frozen at that point."""
    line = (
        "2026-05-14T18:32:01Z [07-summarize] [pipeline:complete:APPROVED]  "
        "summarize finalized; verdict=APPROVED\n"
    )
    (tmp_path / "pipeline.log").write_text(line)
    assert check_mcp_log(tmp_path) == []


def test_pipeline_complete_sentinel_with_underscored_verdict(tmp_path: Path) -> None:
    """All three closed-set verdicts close out P1."""
    for verdict in ("APPROVED", "APPROVED_WITH_EXCEPTIONS", "REQUIRES_REMEDIATION"):
        line = (
            f"2026-05-14T18:32:01Z [07-summarize] [pipeline:complete:{verdict}]  "
            f"finalized; verdict={verdict}\n"
        )
        (tmp_path / "pipeline.log").write_text(line)
        assert check_mcp_log(tmp_path) == [], f"verdict {verdict} should close P1"


def test_pipeline_complete_sentinel_with_unknown_verdict_is_ignored(tmp_path: Path) -> None:
    """A sentinel with an out-of-set verdict (e.g., a typo or future verdict)
    should NOT close P1 — fail closed against unknown values."""
    line = (
        "2026-05-14T18:32:01Z [07-summarize] [pipeline:complete:UNCLEAR]  "
        "weird state\n"
    )
    (tmp_path / "pipeline.log").write_text(line)
    errors = check_mcp_log(tmp_path)
    assert errors and "P1" in errors[0]


# ---------- P3 wildcard-only literal-only matching ----------


def test_action_matches_wildcard_only_literal_match() -> None:
    """A literal action present in the wildcard-only set is exempt."""
    from validate_pipeline_integrity import _action_matches_wildcard_only
    wildcard_only = {"datasync:DescribeAgent", "datasync:DescribeTask"}
    assert _action_matches_wildcard_only("datasync:DescribeAgent", wildcard_only)


def test_action_matches_wildcard_only_glob_no_longer_exempted() -> None:
    """Globs (`Describe*`) are NOT exempted — even if some matching actions
    are wildcard-only. SAR data is incomplete; literal-only matching keeps
    the carve-out tight."""
    from validate_pipeline_integrity import _action_matches_wildcard_only
    wildcard_only = {"datasync:DescribeAgent"}
    assert not _action_matches_wildcard_only("datasync:Describe*", wildcard_only)


def test_action_matches_wildcard_only_unknown_action_not_exempted() -> None:
    """An action not in the set is not exempted regardless of prefix overlap."""
    from validate_pipeline_integrity import _action_matches_wildcard_only
    wildcard_only = {"datasync:DescribeAgent"}
    assert not _action_matches_wildcard_only("datasync:CreateTask", wildcard_only)


# ---------- _load_wildcard_only_actions empty-prefix guard (F11) ----------


def test_wildcard_only_loader_skips_bare_actions_when_prefix_empty(tmp_path: Path) -> None:
    """When sar-facts.json omits service_prefix and an action has no prefix,
    the loader must NOT emit `:Action` (which silently matches nothing)."""
    from validate_pipeline_integrity import _load_wildcard_only_actions
    assess_dir = tmp_path / "01-assess"
    assess_dir.mkdir()
    (assess_dir / "sar-facts.json").write_text(json.dumps({
        "wildcard_only_actions": ["BareAction"],
        "actions": [{"name": "AnotherBare", "resource_types": []}],
    }))
    controls_dir = tmp_path / "05-generate"
    controls_dir.mkdir()
    out = _load_wildcard_only_actions(controls_dir)
    # Cross-service entries are still present, but no malformed ":Action" entries.
    assert all(":" in a and not a.startswith(":") for a in out), out


def test_wildcard_only_loader_qualifies_with_prefix(tmp_path: Path) -> None:
    """When service_prefix is present, bare actions are qualified properly."""
    from validate_pipeline_integrity import _load_wildcard_only_actions
    assess_dir = tmp_path / "01-assess"
    assess_dir.mkdir()
    (assess_dir / "sar-facts.json").write_text(json.dumps({
        "service_prefix": "datasync",
        "wildcard_only_actions": ["DescribeAgent"],
    }))
    controls_dir = tmp_path / "05-generate"
    controls_dir.mkdir()
    out = _load_wildcard_only_actions(controls_dir)
    assert "datasync:DescribeAgent" in out
