"""Tests for core.ai_tool_provenance.

The classifications this module makes are the kind that quietly become wrong: a default
that fills an unknown with a confident value reads as a clean estate and nobody notices.
So these tests are written to fail on exactly that — most of them assert what must NOT
happen (no `public_api` without DNS evidence, no `self_installed` without inventory, no
`0%` where the denominator is zero) rather than only checking the happy path.

Run: python -m pytest tests/test_ai_tool_provenance.py -q
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from core.ai_tool_provenance import (  # noqa: E402
    CallPath,
    CoverageRatio,
    InstallProvenance,
    ProvenanceCoverage,
    ProvenanceRecord,
    ToolClass,
    attribute_host,
    classify_call_path,
    classify_install,
    classify_tool,
    detect_exec_env,
    summarise,
)


# ──────────────────────────────────────────────────────────────────────────────
# Tool identity
# ──────────────────────────────────────────────────────────────────────────────

def test_real_claude_code_user_agent_is_a_coding_tool():
    ident = classify_tool("claude-cli/2.1.220 md/botocore#1.42.97 ua/2.1 os/linux")
    assert ident.tool_class is ToolClass.CODING_TOOL
    assert ident.tool == "Claude Code"
    # The version must come from the matched token, not from botocore's — real agent
    # strings carry several and picking the wrong one misreports the tool version.
    assert ident.version == "2.1.220"


def test_boto3_workload_is_an_sdk_caller_not_a_coding_tool():
    """The exact string this account produces. It was previously surfaced as a
    high-risk "local agent" called "Boto3", which is a false positive: a deployed
    workload calling Bedrock is a governed application, not shadow dev tooling."""
    ident = classify_tool("Boto3/1.42.97 md/Botocore#1.42.97 ua/2.1 os/linux/4.14.336")
    assert ident.tool_class is ToolClass.SDK_CALLER
    assert ident.version == "1.42.97"
    rec = _record(tool_class=ToolClass.SDK_CALLER, install=InstallProvenance.UNKNOWN_HOST)
    assert rec.needs_attention is False, "an SDK caller must never raise a shadow-AI finding"


def test_coding_tool_wins_over_sdk_when_both_appear():
    """Claude Code ships its calls through botocore, so both tokens are present. The
    specific identity is the useful one; matching the SDK first would erase every
    coding tool from the report."""
    ident = classify_tool("claude-cli/2.1.220 md/botocore#1.42.97")
    assert ident.tool_class is ToolClass.CODING_TOOL


def test_unmatched_agent_stays_unidentified_and_is_not_guessed_into_a_tool():
    ident = classify_tool("SomeInternalThing/9.9 (build 12)")
    assert ident.tool_class is ToolClass.UNIDENTIFIED
    # Must NOT be split on "/" and presented as a tool named "SomeInternalThing" —
    # that is how every SDK caller became a discovered agent in the prior version.
    assert ident.tool.startswith("SomeInternalThing/9.9")
    assert ident.version is None


def test_missing_user_agent_is_unidentified_not_empty_string_tool():
    for value in (None, "", "   "):
        ident = classify_tool(value)
        assert ident.tool_class is ToolClass.UNIDENTIFIED
        assert ident.tool == "Unknown caller"


def test_every_signature_pattern_matches_its_own_tool():
    """Guards the never-matching-lookup bug class: a table whose keys cannot be hit by
    the strings it is matched against. This has already happened three times in this
    codebase (pricing 0/11, harness 4/8, TokenEconomics 0/5)."""
    from core.ai_tool_provenance import CODING_TOOL_SIGNATURES, SDK_SIGNATURES

    for sig in CODING_TOOL_SIGNATURES:
        ident = classify_tool(f"{sig['pattern']}/1.2.3")
        assert ident.tool_class is ToolClass.CODING_TOOL, sig
        assert ident.tool == sig["tool"], sig
    for sig in SDK_SIGNATURES:
        ident = classify_tool(f"{sig['pattern']}/1.2.3")
        assert ident.tool_class is ToolClass.SDK_CALLER, sig


# ──────────────────────────────────────────────────────────────────────────────
# Call path
# ──────────────────────────────────────────────────────────────────────────────

def test_bedrock_event_source_proves_a_bedrock_call():
    for source in ("bedrock.amazonaws.com", "bedrock-runtime.amazonaws.com",
                   "bedrock-agentcore.amazonaws.com"):
        verdict = classify_call_path(event_source=source)
        assert verdict.call_path is CallPath.BEDROCK, source


def test_no_evidence_gives_unknown_never_public_api():
    """The load-bearing assertion of this module. Absence of a Bedrock call is not
    evidence of a vendor API call — the tool may simply not have run."""
    verdict = classify_call_path(event_source=None, dns_domain=None)
    assert verdict.call_path is CallPath.UNKNOWN
    assert verdict.call_path is not CallPath.PUBLIC_API


def test_public_api_requires_a_dns_match_and_cannot_be_reached_otherwise():
    assert classify_call_path(dns_domain="api.anthropic.com").call_path is CallPath.PUBLIC_API
    assert classify_call_path(dns_domain="api.openai.com.").call_path is CallPath.PUBLIC_API
    assert classify_call_path(dns_domain="foo.api.openai.com").call_path is CallPath.PUBLIC_API
    # A non-provider domain is not a public AI call.
    assert classify_call_path(dns_domain="example.com").call_path is CallPath.UNKNOWN
    # And a lookalike suffix must not match: "notapi.anthropic.com.evil.test".
    assert classify_call_path(dns_domain="api.anthropic.com.evil.test").call_path is CallPath.UNKNOWN


def test_dns_evidence_outranks_a_bedrock_event():
    """A tool doing both is the interesting case, and the ungoverned path is the one
    worth surfacing."""
    verdict = classify_call_path(event_source="bedrock.amazonaws.com", dns_domain="api.anthropic.com")
    assert verdict.call_path is CallPath.PUBLIC_API
    assert verdict.provider == "Anthropic"


def test_unknown_call_path_is_not_reported_as_governed():
    rec = _record(call_path=CallPath.UNKNOWN)
    assert rec.is_governed is False
    rec = _record(call_path=CallPath.BEDROCK)
    assert rec.is_governed is True


# ──────────────────────────────────────────────────────────────────────────────
# Host attribution
# ──────────────────────────────────────────────────────────────────────────────

def test_instance_role_session_name_attributes_the_host_exactly():
    identity = {"arn": "arn:aws:sts::123456789012:assumed-role/MyRole/i-0257cf63e781102f5"}
    attribution = attribute_host(user_identity=identity)
    assert attribution.host_id == "i-0257cf63e781102f5"


def test_source_ip_attributes_only_against_an_inventoried_map():
    ip_map = {"10.0.1.42": "i-04b3d6bf1dc14dbcc"}
    assert attribute_host(source_ip="10.0.1.42", ip_to_instance=ip_map).host_id == "i-04b3d6bf1dc14dbcc"
    # An unknown IP must not be attributed to anything.
    assert attribute_host(source_ip="203.0.113.7", ip_to_instance=ip_map).host_id is None
    # And with no map at all, an IP alone proves nothing.
    assert attribute_host(source_ip="10.0.1.42").host_id is None


def test_iam_user_identity_yields_no_host():
    """A call from a laptop has an IAM user ARN and no instance id anywhere. This is the
    common real case, and it must produce None rather than a nearest-guess host."""
    identity = {"arn": "arn:aws:iam::123456789012:user/some-developer"}
    assert attribute_host(user_identity=identity).host_id is None


# ──────────────────────────────────────────────────────────────────────────────
# Install provenance — the three-state discipline
# ──────────────────────────────────────────────────────────────────────────────

def test_unattributable_host_is_unknown_host_not_self_installed():
    verdict = classify_install(host_id=None, managed_hosts={"i-1"})
    assert verdict.install is InstallProvenance.UNKNOWN_HOST
    assert verdict.install is not InstallProvenance.SELF_INSTALLED


def test_unreadable_inventory_is_unknown_host_not_self_installed():
    """`managed_hosts=None` means we could not look. Calling that self-installed would
    manufacture a finding out of a missing permission."""
    verdict = classify_install(host_id="i-1", managed_hosts=None, tool="Claude Code")
    assert verdict.install is InstallProvenance.UNKNOWN_HOST
    assert "unavailable" in verdict.evidence


def test_empty_inventory_is_distinguishable_from_unreadable_inventory():
    """Both yield unknown_host, but the evidence must differ: one is a measured
    'nothing is managed', the other is 'we have no visibility'."""
    unreadable = classify_install(host_id="i-1", managed_hosts=None)
    measured_empty = classify_install(host_id="i-1", managed_hosts=set())
    assert unreadable.install is measured_empty.install is InstallProvenance.UNKNOWN_HOST
    assert unreadable.evidence != measured_empty.evidence


def test_unmanaged_host_is_unknown_host():
    verdict = classify_install(host_id="i-laptop", managed_hosts={"i-server"}, tool="Cursor")
    assert verdict.install is InstallProvenance.UNKNOWN_HOST
    assert "not under endpoint management" in verdict.evidence


def test_managed_host_without_package_inventory_is_managed_but_says_host_level_only():
    """A managed host with no package inventory cannot confirm the TOOL is managed. It
    must not be upgraded to a tool-level assurance it has not earned."""
    verdict = classify_install(
        host_id="i-1", managed_hosts={"i-1"}, host_applications={}, tool="Claude Code"
    )
    assert verdict.install is InstallProvenance.MANAGED
    assert "host-level only" in verdict.evidence


def test_tool_absent_from_a_read_inventory_is_self_installed():
    """This is the ONE path to self_installed: inventory was successfully read for this
    host and the tool is not in it."""
    verdict = classify_install(
        host_id="i-1",
        managed_hosts={"i-1"},
        host_applications={"i-1": {"passwd", "tzdata", "postfix"}},
        tool="Claude Code",
    )
    assert verdict.install is InstallProvenance.SELF_INSTALLED


def test_tool_present_in_inventory_is_managed():
    verdict = classify_install(
        host_id="i-1",
        managed_hosts={"i-1"},
        host_applications={"i-1": {"claude-code", "passwd"}},
        tool="Claude Code",
    )
    assert verdict.install is InstallProvenance.MANAGED
    assert "package inventory" in verdict.evidence


def test_package_name_matching_tolerates_display_name_differences():
    """"Claude Code" ships as `claude-code`; "Q Developer" as `amazon-q-developer`.
    Exact equality would report every managed install as self-installed."""
    for package in ("claude-code", "claude_code", "ClaudeCode"):
        verdict = classify_install(
            host_id="i-1", managed_hosts={"i-1"},
            host_applications={"i-1": {package}}, tool="Claude Code",
        )
        assert verdict.install is InstallProvenance.MANAGED, package


def test_inventory_for_a_different_host_does_not_vouch_for_this_one():
    verdict = classify_install(
        host_id="i-1",
        managed_hosts={"i-1", "i-2"},
        host_applications={"i-2": {"claude-code"}},
        tool="Claude Code",
    )
    # i-1 has no inventory of its own, so host-level MANAGED, not tool-level.
    assert verdict.install is InstallProvenance.MANAGED
    assert "host-level only" in verdict.evidence


# ──────────────────────────────────────────────────────────────────────────────
# Managed runtimes — serverless callers have no host to inventory
# ──────────────────────────────────────────────────────────────────────────────

def test_lambda_exec_env_is_detected_from_the_real_user_agent():
    """The exact string this account produces. Without this, the only real caller in the
    estate is filed as an unseen host, counting a governed Lambda as a blind spot."""
    ua = ("Boto3/1.42.97 md/Botocore#1.42.97 ua/2.1 os/linux#5.10 md/arch#x86_64 "
          "lang/python#3.12.13 md/pyimpl#CPython exec-env/AWS_Lambda_python3.12")
    assert detect_exec_env(ua) == "AWS Lambda"


def test_exec_env_requires_the_token_not_a_passing_mention():
    assert detect_exec_env("MyTool/1.0 (lambda-ish helper for lambda users)") is None
    assert detect_exec_env("Boto3/1.0 exec-env/AWS_ECS_FARGATE") == "ECS on Fargate"
    assert detect_exec_env(None) is None
    assert detect_exec_env("Boto3/1.0 exec-env/SomethingElse") is None


def test_serverless_caller_is_managed_runtime_not_unknown_host():
    verdict = classify_install(
        host_id=None, managed_hosts={"i-1"}, tool="Boto3 (SDK)", exec_env="AWS Lambda"
    )
    assert verdict.install is InstallProvenance.MANAGED_RUNTIME
    assert verdict.install is not InstallProvenance.UNKNOWN_HOST
    assert "AWS Lambda" in verdict.evidence


def test_exec_env_is_checked_before_host_lookup():
    """A serverless caller has no host BY DESIGN, so looking for one first would file
    managed infrastructure under a visibility gap."""
    verdict = classify_install(
        host_id=None, managed_hosts=None, host_applications=None,
        tool="Claude Code", exec_env="Bedrock AgentCore",
    )
    assert verdict.install is InstallProvenance.MANAGED_RUNTIME


def test_managed_runtime_does_not_need_attention():
    assert _record(tool_class=ToolClass.CODING_TOOL,
                   install=InstallProvenance.MANAGED_RUNTIME).needs_attention is False
    # …but a managed runtime calling a vendor API still does.
    assert _record(tool_class=ToolClass.CODING_TOOL, call_path=CallPath.PUBLIC_API,
                   install=InstallProvenance.MANAGED_RUNTIME).needs_attention is True


def test_summarise_includes_managed_runtime_bucket():
    buckets = summarise([_record(install=InstallProvenance.MANAGED_RUNTIME)])
    assert buckets["by_install_provenance"]["managed_runtime"] == 1
    assert set(buckets["by_install_provenance"]) == {
        "managed", "managed_runtime", "self_installed", "unknown_host"
    }


# ──────────────────────────────────────────────────────────────────────────────
# Coverage
# ──────────────────────────────────────────────────────────────────────────────

def test_zero_denominator_yields_none_percent_not_zero_percent():
    """0% reads as a failing control. None reads as "there is nothing to measure",
    which is the truth when the denominator is empty."""
    ratio = CoverageRatio(covered=0, total=0, label="Hosts")
    assert ratio.pct is None
    assert ratio.complete is False


def test_measured_zero_coverage_is_zero_percent_not_none():
    """The opposite direction matters just as much: hosts exist and none are covered is
    a real 0%, and must not be softened into "unmeasured"."""
    ratio = CoverageRatio(covered=0, total=8, label="Hosts")
    assert ratio.pct == 0.0


def test_full_coverage_is_complete():
    ratio = CoverageRatio(covered=2, total=2, label="Hosts")
    assert ratio.pct == 100.0
    assert ratio.complete is True


def test_blind_spots_call_out_missing_dns_logging_explicitly():
    """With no DNS logging, public_api is unreachable — so the report MUST say that a
    zero is not evidence of absence, or the number lies by omission."""
    coverage = _coverage(dns_covered=0, dns_total=5)
    text = " ".join(coverage.blind_spots).lower()
    assert "dns" in text
    assert "api.anthropic.com" in text
    assert "not counted as unknown" in text


def test_blind_spots_always_mention_off_network_laptops():
    """True at every coverage level, including full: cloud telemetry cannot see a laptop
    on home wifi, and implying otherwise is the failure mode this whole module targets."""
    for covered, total in ((0, 5), (5, 5), (0, 0)):
        coverage = _coverage(dns_covered=covered, dns_total=total)
        assert any("off the corporate network" in s for s in coverage.blind_spots)


def test_complete_endpoint_ratio_beside_an_unattributed_caller_is_called_out():
    """The most dangerous single reading in this response: "2 of 2 hosts managed, 100%"
    printed next to a caller marked unknown_host. The EC2 denominator does not contain
    developer machines, so a complete ratio is not coverage of the observed callers."""
    coverage = _coverage(endpoint_covered=2, endpoint_total=2)
    coverage.unattributed_callers = 1
    text = " ".join(coverage.blind_spots)
    assert "2 of 2 EC2 hosts" in text
    assert "developer machines are not EC2" in text


def test_no_unattributed_callers_means_no_ec2_caveat():
    """Do not cry wolf: with every caller attributed, the caveat is noise."""
    coverage = _coverage(endpoint_covered=2, endpoint_total=2)
    coverage.unattributed_callers = 0
    assert not any("developer machines are not EC2" in s for s in coverage.blind_spots)


def test_blind_spots_flag_host_level_only_provenance():
    coverage = _coverage(endpoint_covered=2, endpoint_total=2, pkg_covered=0, pkg_total=2)
    assert any("package inventory" in s for s in coverage.blind_spots)


def test_partial_dns_coverage_is_reported_as_partial_not_as_absent():
    coverage = _coverage(dns_covered=2, dns_total=5)
    text = " ".join(coverage.blind_spots)
    assert "2 of 5" in text


# ──────────────────────────────────────────────────────────────────────────────
# Aggregation
# ──────────────────────────────────────────────────────────────────────────────

def test_summarise_seeds_every_bucket_so_unknown_is_never_absent():
    """A missing `unknown` key renders as "no unknowns", which is the opposite of what
    an absent measurement means."""
    buckets = summarise([_record(call_path=CallPath.BEDROCK)])
    assert set(buckets["by_call_path"]) == {"bedrock", "public_api", "unknown"}
    assert buckets["by_call_path"]["unknown"] == 0
    assert set(buckets["by_install_provenance"]) == {
        "managed", "managed_runtime", "self_installed", "unknown_host"
    }
    assert set(buckets["by_tool_class"]) == {"coding_tool", "sdk_caller", "unidentified"}


def test_summarise_of_nothing_still_reports_all_buckets():
    buckets = summarise([])
    assert buckets["by_call_path"] == {"bedrock": 0, "public_api": 0, "unknown": 0}


def test_needs_attention_flags_unvouched_coding_tools_only():
    # Coding tool on an unknown host → needs attention.
    assert _record(tool_class=ToolClass.CODING_TOOL,
                   install=InstallProvenance.UNKNOWN_HOST).needs_attention is True
    # Coding tool calling a vendor API → needs attention even if managed.
    assert _record(tool_class=ToolClass.CODING_TOOL, call_path=CallPath.PUBLIC_API,
                   install=InstallProvenance.MANAGED).needs_attention is True
    # Managed coding tool on Bedrock → fine.
    assert _record(tool_class=ToolClass.CODING_TOOL, call_path=CallPath.BEDROCK,
                   install=InstallProvenance.MANAGED).needs_attention is False
    # SDK caller → never, regardless of how little we know about it.
    assert _record(tool_class=ToolClass.SDK_CALLER,
                   install=InstallProvenance.UNKNOWN_HOST).needs_attention is False
    assert _record(tool_class=ToolClass.UNIDENTIFIED,
                   install=InstallProvenance.UNKNOWN_HOST).needs_attention is False


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _record(
    tool_class: ToolClass = ToolClass.CODING_TOOL,
    call_path: CallPath = CallPath.BEDROCK,
    install: InstallProvenance = InstallProvenance.MANAGED,
) -> ProvenanceRecord:
    return ProvenanceRecord(
        principal="dev", tool="Claude Code", tool_class=tool_class,
        call_path=call_path, install=install,
    )


def _coverage(
    endpoint_covered: int = 2, endpoint_total: int = 2,
    dns_covered: int = 0, dns_total: int = 5,
    pkg_covered: int = 2, pkg_total: int = 2,
) -> ProvenanceCoverage:
    return ProvenanceCoverage(
        endpoint=CoverageRatio(endpoint_covered, endpoint_total, "Hosts managed"),
        dns=CoverageRatio(dns_covered, dns_total, "VPCs with DNS logging", unit="VPCs"),
        call_path=CoverageRatio(3, 3, "Calls classified", unit="calls"),
        package_inventory=CoverageRatio(pkg_covered, pkg_total, "Hosts with packages"),
    )
