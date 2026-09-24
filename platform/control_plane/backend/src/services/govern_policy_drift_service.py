"""Govern Policy Drift Service — compares harness policies against CloudTrail reality.

Analyzes CloudTrail AI-service activity against configured harness policies to detect
drift: tier violations, path violations, and unknown harnesses.

Integrates:
- GovernHarnessPolicyService for policy definitions
- GovernTrailService for CloudTrail activity
- GovernAidlcService for harness detection patterns

Follows the govern_trail convention: honest live/source/note, graceful fallback.
"""

from __future__ import annotations

import fnmatch
import json
import logging
import re
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.region_config import get_governed_regions
from core.ttl_cache import get_or_load
from models.govern_policy_drift import (
    CloudTrailEvidence,
    DriftAnalysisResponse,
    DriftCountBySeverity,
    DriftCountByType,
    DriftFindingsListResponse,
    DriftSeverity,
    DriftSummary,
    DriftSummaryResponse,
    DriftType,
    PolicyDriftFinding,
    WorstOffender,
    WorstOffendersResponse,
)
from models.govern_harness_policy import (
    DEFAULT_BLOCKED_PATHS,
    TIER_TOOLS,
    HarnessPolicy,
    ToolTier,
)
from services.govern_harness_policy_service import GovernHarnessPolicyService

logger = logging.getLogger(__name__)

_DRIFT_TTL = 120  # 2 min — analysis is expensive, cache results

# AI-service event sources to analyze
_AI_SOURCES = ["bedrock.amazonaws.com", "bedrock-runtime.amazonaws.com", "sagemaker.amazonaws.com"]

# Operations that indicate write/modify activity (vs read-only)
_WRITE_OPERATIONS = {
    # Bedrock runtime (model invocation is considered "write" for drift purposes
    # since it can produce side effects via tool use)
    "InvokeModel",
    "InvokeModelWithResponseStream",
    "Converse",
    "ConverseStream",
    # Bedrock management
    "CreateAgent",
    "UpdateAgent",
    "DeleteAgent",
    "CreateKnowledgeBase",
    "UpdateKnowledgeBase",
    "DeleteKnowledgeBase",
    "CreateGuardrail",
    "UpdateGuardrail",
    "DeleteGuardrail",
    # SageMaker
    "CreateEndpoint",
    "UpdateEndpoint",
    "DeleteEndpoint",
    "CreateModel",
    "DeleteModel",
}

# Operations that are read-only
_READ_OPERATIONS = {
    "GetAgent",
    "ListAgents",
    "GetKnowledgeBase",
    "ListKnowledgeBases",
    "GetGuardrail",
    "ListGuardrails",
    "DescribeEndpoint",
    "ListEndpoints",
    "DescribeModel",
    "ListModels",
}

# Harness detection patterns (reused from govern_aidlc_service)
_HARNESS_PATTERNS = [
    {"pattern": "claude-cli", "type": "claude_code"},
    {"pattern": "claude-code", "type": "claude_code"},
    {"pattern": "kiro-ide", "type": "kiro"},
    {"pattern": "kiro-cli", "type": "kiro"},
    {"pattern": "kiro/", "type": "kiro"},
    {"pattern": "codex-cli", "type": "codex_cli"},
    {"pattern": "opencode", "type": "opencode"},
    {"pattern": "cursor", "type": "cursor"},
    {"pattern": "copilot", "type": "github_copilot"},
    {"pattern": "tabnine", "type": "tabnine"},
    {"pattern": "amazonq", "type": "q_desktop"},
    {"pattern": "amazon-q", "type": "q_desktop"},
    {"pattern": "cody", "type": "cody"},
]

# Expected AWS SDK / CLI / service-agent userAgent fragments. Normal programmatic
# Bedrock traffic carries no harness signature by design, so emitting UNKNOWN_HARNESS
# for it is a false positive that swamps Total Findings and the Compliance Gap.
_EXPECTED_SDK_AGENT_PATTERNS = [
    "aws-sdk-",
    "aws_sdk_",
    "aws-cli",
    "boto3",
    "botocore",
    "amazon-bedrock-",
    "aws internal",
    ".amazonaws.com",  # service principals, e.g. bedrock.amazonaws.com
]

# Sensitive path patterns that elevate severity
_SENSITIVE_PATH_PATTERNS = [
    "**/secrets/**",
    "**/.env",
    "**/.env.*",
    "**/credentials*",
    "**/*.pem",
    "**/*.key",
    "**/id_rsa*",
    "**/.aws/credentials",
    "**/.ssh/**",
    "**/private/**",
]


def _mask_identity(ident: str | None) -> str | None:
    """Mask a caller identity for display — preserve recognizable parts, redact sensitive."""
    if not ident:
        return ident
    tail = ident.rsplit("/", 1)[-1].rsplit(":", 1)[-1]
    parts = tail.rsplit("-", 1)
    if len(parts) == 2 and len(parts[1]) >= 6 and any(c.isdigit() for c in parts[1]):
        return f"{parts[0]}-****"
    return tail


def _detect_harness_type(user_agent: str) -> Optional[str]:
    """Detect harness type from userAgent string."""
    if not user_agent:
        return None
    ua_lower = user_agent.lower()
    for p in _HARNESS_PATTERNS:
        if p["pattern"] in ua_lower:
            return p["type"]
    return None


def _is_expected_sdk_agent(user_agent: str) -> bool:
    """Check if a userAgent is a normal AWS SDK/CLI/service agent (not an AI harness).

    Plain boto3/SDK/CLI Bedrock calls have no harness userAgent, so treating them as
    unknown-harness drift produces false positives. An empty userAgent is NOT expected
    and stays flagged.
    """
    if not user_agent:
        return False
    ua_lower = user_agent.lower()
    return any(p in ua_lower for p in _EXPECTED_SDK_AGENT_PATTERNS)


def _is_write_operation(event_name: str) -> bool:
    """Check if an operation is write/modify vs read-only."""
    return event_name in _WRITE_OPERATIONS


def _path_matches_any(path: str, patterns: List[str]) -> bool:
    """Check if a path matches any of the glob patterns."""
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
    return False


def _extract_paths_from_request(request_params: Optional[Dict]) -> List[str]:
    """Extract file paths from request parameters, if present."""
    paths = []
    if not request_params:
        return paths

    # Look for common path-related fields
    for key in ["path", "file_path", "filePath", "target_path", "targetPath", "key", "s3Key"]:
        if key in request_params:
            val = request_params[key]
            if isinstance(val, str):
                paths.append(val)
            elif isinstance(val, list):
                paths.extend(v for v in val if isinstance(v, str))

    # Check nested tool_input for agentic calls
    if "tool_input" in request_params:
        tool_input = request_params["tool_input"]
        if isinstance(tool_input, dict):
            paths.extend(_extract_paths_from_request(tool_input))
        elif isinstance(tool_input, str):
            # Try to parse as JSON
            try:
                parsed = json.loads(tool_input)
                if isinstance(parsed, dict):
                    paths.extend(_extract_paths_from_request(parsed))
            except (json.JSONDecodeError, ValueError):
                pass

    return paths


def _calculate_severity(
    drift_type: DriftType,
    harness_type: str,
    policy: Optional[HarnessPolicy],
    paths: List[str],
    frequency: int = 1,
) -> DriftSeverity:
    """Calculate severity based on drift type, policy strictness, and paths."""

    # Path violations involving sensitive paths are always critical
    if drift_type == DriftType.PATH_VIOLATION:
        for path in paths:
            if _path_matches_any(path, _SENSITIVE_PATH_PATTERNS):
                return DriftSeverity.CRITICAL

    # Tier violations are high severity for read-only policies
    if drift_type == DriftType.TIER_VIOLATION:
        if policy and policy.allowed_tier == ToolTier.READ_ONLY:
            return DriftSeverity.HIGH
        return DriftSeverity.MEDIUM

    # Unknown harness defaults to medium, but low if no sensitive ops
    if drift_type == DriftType.UNKNOWN_HARNESS:
        return DriftSeverity.MEDIUM

    return DriftSeverity.LOW


class GovernPolicyDriftService:
    """Service for detecting policy-reality drift in AI harness activity."""

    def __init__(self):
        """Reads the GOVERNED region's CloudTrail (tier 2), resolved here, not by the caller.

        There is deliberately no `region` parameter, following GovernCapacityService. The
        previous shape was `region: str = "us-east-1"` and the only route that builds this
        service constructs it zero-arg (api/routes/govern_policy_drift.py), so the hardcoded
        default was what actually ran and GOVERN_AWS_REGION was silently ignored.

        The wrong region is not cosmetic here. Every event this service looks up comes from
        _AI_SOURCES - bedrock, bedrock-runtime and sagemaker - which is the governed fleet,
        tier 2, not the control plane. CloudTrail LookupEvents is per-region and does not
        error on the wrong region: it answers with THAT region's event history. So with a
        fleet outside us-east-1 the analysis reads an empty history and reports zero drift
        findings under live=true - and "no policy drift detected" is the reassuring answer,
        which is what makes it dangerous rather than merely wrong. There is no exception to
        catch and no note to render, because the read genuinely succeeded.

        us-east-1 happens to be GOVERN_AWS_REGION in the demo account, so nothing was broken
        there. A knob that is honoured everywhere except one surface is worse than no knob:
        moving the fleet would move every other Govern reader and leave drift analysis
        reporting a clean bill of health from the region the fleet just left.

        SINGLE_REGION per api/routes/govern_policy_drift.py, so this reads the primary
        governed region rather than fanning out over get_governed_regions(). The extension
        point for fan-out is core.multiregion.run_over_regions over that set, not a
        caller-supplied region. See core/region_config.py, tier 2.
        """
        governed = get_governed_regions()
        self.region = governed[0] if governed else "us-east-1"
        self._ct = None
        self._policy_svc: Optional[GovernHarnessPolicyService] = None

        # In-memory findings store (in production, this would be DynamoDB)
        self._findings: Dict[str, PolicyDriftFinding] = {}
        self._last_analysis: Optional[datetime] = None

    def _cloudtrail(self):
        if self._ct is None:
            self._ct = boto3.client("cloudtrail", region_name=self.region)
        return self._ct

    def _policy_service(self) -> GovernHarnessPolicyService:
        if self._policy_svc is None:
            self._policy_svc = GovernHarnessPolicyService()
        return self._policy_svc

    def analyze_drift(self, hours: int = 24) -> DriftAnalysisResponse:
        """Cached wrapper around live drift analysis."""
        result, cached_at = get_or_load(
            f"drift:analysis:{self.region}:{hours}",
            _DRIFT_TTL,
            lambda: self._analyze_drift_live(hours),
            should_cache=lambda r: r.live,
        )
        return result

    def _analyze_drift_live(self, hours: int = 24) -> DriftAnalysisResponse:
        """Analyze CloudTrail AI activity for policy drift.

        Compares actual activity against harness policies to detect:
        - Tier violations: write operations on read-only tier
        - Path violations: blocked paths accessed
        - Unknown harness: activity from unregistered harness
        """
        findings: List[PolicyDriftFinding] = []
        total_events = 0
        events_with_drift = 0
        policies_with_drift = set()

        try:
            ct = self._cloudtrail()
            policy_svc = self._policy_service()
            policies_response = policy_svc.list_policies()
            policies = {p.harness_type: p for p in policies_response.policies}

            start = datetime.now(timezone.utc) - timedelta(hours=hours)

            # Fetch events from each AI source. LookupEvents caps MaxResults at 50
            # per page, so paginate with NextToken (bounded) instead of one call.
            _MAX_PAGES = 20  # up to ~1000 events/source - keeps analysis responsive
            for source in _AI_SOURCES:
                try:
                    next_token: Optional[str] = None
                    pages = 0
                    while pages < _MAX_PAGES:
                        kwargs = {
                            "LookupAttributes": [{"AttributeKey": "EventSource", "AttributeValue": source}],
                            "StartTime": start,
                            "MaxResults": 50,
                        }
                        if next_token:
                            kwargs["NextToken"] = next_token
                        resp = ct.lookup_events(**kwargs)

                        for event in resp.get("Events", []):
                            total_events += 1
                            event_findings = self._analyze_event(event, policies)

                            if event_findings:
                                events_with_drift += 1
                                findings.extend(event_findings)
                                for f in event_findings:
                                    policies_with_drift.add(f.policy_id)

                        next_token = resp.get("NextToken")
                        pages += 1
                        if not next_token:
                            break

                except (ClientError, BotoCoreError) as e:
                    logger.debug("CloudTrail lookup for %s failed: %s", source, e)
                    continue

            # Store findings
            for f in findings:
                self._findings[f.finding_id] = f

            # Build summary
            summary = self._build_summary(findings, total_events, list(policies_with_drift))

            self._last_analysis = datetime.now(timezone.utc)

            return DriftAnalysisResponse(
                findings=findings,
                summary=summary,
                analysis_window_hours=hours,
                total_events_analyzed=total_events,
                last_analysis=self._last_analysis.isoformat(),
                live=True,
                source="cloudtrail+policy-engine",
                note=f"Analyzed {total_events} events, found {len(findings)} drift findings" if findings else None,
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("Drift analysis failed: %s", e)
            return self._get_mock_analysis(hours)

    def _analyze_event(
        self, event: Dict, policies: Dict[str, HarnessPolicy]
    ) -> List[PolicyDriftFinding]:
        """Analyze a single CloudTrail event for policy drift."""
        findings: List[PolicyDriftFinding] = []

        event_name = event.get("EventName", "")
        event_time = event.get("EventTime")
        username = event.get("Username", "unknown")
        event_id = event.get("EventId", str(uuid.uuid4()))

        # Parse CloudTrail event details
        try:
            ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
            user_agent = ct_event.get("userAgent", "")
            request_params = ct_event.get("requestParameters") or {}
            error_code = ct_event.get("errorCode")

            # Get identity from userIdentity if username is empty
            if not username or username == "unknown":
                user_identity = ct_event.get("userIdentity", {}) or {}
                username = user_identity.get("arn") or user_identity.get("userName") or "unknown"
        except (json.JSONDecodeError, ValueError):
            user_agent = ""
            request_params = {}
            error_code = None

        # Skip service accounts
        if username in ["SageMaker", "ConfigResourceCompositionSession"]:
            return findings

        # Detect harness type from userAgent
        harness_type = _detect_harness_type(user_agent)

        # Build evidence object
        evidence = CloudTrailEvidence(
            event_id=event_id,
            event_name=event_name,
            event_source=event.get("EventSource", ""),
            event_time=event_time.isoformat() if hasattr(event_time, "isoformat") else str(event_time) if event_time else None,
            username=_mask_identity(username),
            user_agent=user_agent[:200] if user_agent else None,  # Truncate long userAgents
            request_params={k: v for k, v in list(request_params.items())[:5]} if request_params else None,
            error_code=error_code,
        )

        # Check 1: Unknown harness
        if harness_type is None:
            # Activity without a recognized harness userAgent
            # Only flag if it looks like developer activity (InvokeModel calls) and the
            # caller isn't an expected AWS SDK/CLI/service agent — that traffic never
            # carries a harness signature, so flagging it is a false positive.
            if event_name in _WRITE_OPERATIONS and not _is_expected_sdk_agent(user_agent):
                findings.append(PolicyDriftFinding(
                    finding_id=f"drift-{event_id[:8]}-unknown",
                    drift_type=DriftType.UNKNOWN_HARNESS,
                    severity=DriftSeverity.MEDIUM,
                    policy_id="none",
                    harness_type="unknown",
                    expected="Activity from registered harness",
                    actual=f"Unrecognized userAgent: {user_agent[:50] if user_agent else 'empty'}",
                    evidence=evidence,
                    detected_at=datetime.now(timezone.utc).isoformat(),
                ))
            return findings

        # Get policy for this harness
        policy = policies.get(harness_type)
        if not policy:
            # No policy defined for this harness type
            return findings

        policy_id = policy.policy_id

        # Check 2: Tier violation (write on read-only)
        if policy.allowed_tier == ToolTier.READ_ONLY and _is_write_operation(event_name):
            severity = _calculate_severity(DriftType.TIER_VIOLATION, harness_type, policy, [])
            findings.append(PolicyDriftFinding(
                finding_id=f"drift-{event_id[:8]}-tier",
                drift_type=DriftType.TIER_VIOLATION,
                severity=severity,
                policy_id=policy_id,
                harness_type=harness_type,
                expected=f"Policy tier is {policy.allowed_tier.value} (read-only)",
                actual=f"Write operation {event_name} was executed",
                evidence=evidence,
                detected_at=datetime.now(timezone.utc).isoformat(),
            ))

        # Check 3: Path violations
        paths = _extract_paths_from_request(request_params)
        for path in paths:
            if _path_matches_any(path, policy.blocked_paths):
                severity = _calculate_severity(DriftType.PATH_VIOLATION, harness_type, policy, [path])
                findings.append(PolicyDriftFinding(
                    finding_id=f"drift-{event_id[:8]}-path",
                    drift_type=DriftType.PATH_VIOLATION,
                    severity=severity,
                    policy_id=policy_id,
                    harness_type=harness_type,
                    expected=f"Path blocked by policy: matches {policy.blocked_paths}",
                    actual=f"Accessed blocked path: {path}",
                    evidence=evidence,
                    detected_at=datetime.now(timezone.utc).isoformat(),
                ))
                break  # One path violation per event

        # No approval-bypass check: CloudTrail alone cannot show whether a required
        # human approval was actually obtained. Detecting it needs two things that do
        # not exist yet:
        #   (a) a provisioned approval-requests store (APPROVAL_REQUESTS_TABLE_NAME is
        #       unset by default, so the queue is empty and reads are a no-op), and
        #   (b) a CloudTrail correlation key on approval rows — they key on
        #       resource_kind/resource_id/action with no event_id, principal ARN or
        #       userAgent, so there is no join back to a CloudTrail event.
        # Do not add a placeholder branch here; without those inputs it can only
        # guess, and a type that never fires becomes dead UI.

        return findings

    def _build_summary(
        self, findings: List[PolicyDriftFinding], total_events: int, policies_with_drift: List[str]
    ) -> DriftSummary:
        """Build aggregated summary from findings."""
        by_severity = DriftCountBySeverity()
        by_type = DriftCountByType()
        unresolved = 0

        # Count by severity and type
        for f in findings:
            if f.severity == DriftSeverity.CRITICAL:
                by_severity.critical += 1
            elif f.severity == DriftSeverity.HIGH:
                by_severity.high += 1
            elif f.severity == DriftSeverity.MEDIUM:
                by_severity.medium += 1
            else:
                by_severity.low += 1

            if f.drift_type == DriftType.TIER_VIOLATION:
                by_type.tier_violation += 1
            elif f.drift_type == DriftType.PATH_VIOLATION:
                by_type.path_violation += 1
            else:
                by_type.unknown_harness += 1

            if not f.resolved:
                unresolved += 1

        # Calculate compliance gap - one event can emit multiple findings
        # (e.g. tier + path), so count DISTINCT events with drift, not raw findings.
        events_with_drift = len({f.evidence.event_id for f in findings})
        compliance_gap = (events_with_drift / total_events * 100) if total_events > 0 else 0.0

        # Build worst offenders
        offender_stats: Dict[str, Dict] = defaultdict(lambda: {
            "count": 0, "critical": 0, "high": 0, "types": defaultdict(int), "last": None,
            "harness": False,
        })

        for f in findings:
            identity = f.evidence.username or "unknown"
            offender_stats[identity]["count"] += 1
            # A recognized harness_type means the offender is a governed harness;
            # otherwise the findings came from a plain caller identity.
            if f.harness_type and f.harness_type != "unknown":
                offender_stats[identity]["harness"] = True
            if f.severity == DriftSeverity.CRITICAL:
                offender_stats[identity]["critical"] += 1
            elif f.severity == DriftSeverity.HIGH:
                offender_stats[identity]["high"] += 1
            offender_stats[identity]["types"][f.drift_type] += 1
            if f.detected_at and (offender_stats[identity]["last"] is None or f.detected_at > offender_stats[identity]["last"]):
                offender_stats[identity]["last"] = f.detected_at

        worst_offenders = []
        for identity, stats in sorted(offender_stats.items(), key=lambda x: (-x[1]["critical"], -x[1]["high"], -x[1]["count"])):
            most_common_drift = max(stats["types"].items(), key=lambda x: x[1])[0] if stats["types"] else None
            worst_offenders.append(WorstOffender(
                identity=identity,
                identity_type="harness" if stats["harness"] else "user",
                finding_count=stats["count"],
                critical_count=stats["critical"],
                high_count=stats["high"],
                most_common_drift=most_common_drift,
                last_violation=stats["last"],
            ))

        return DriftSummary(
            total_findings=len(findings),
            unresolved_findings=unresolved,
            by_severity=by_severity,
            by_type=by_type,
            compliance_gap_percentage=round(compliance_gap, 2),
            worst_offenders=worst_offenders,
            policies_with_drift=policies_with_drift,
        )

    def get_drift_summary(self, hours: int = 24) -> DriftSummaryResponse:
        """Get aggregated drift statistics."""
        analysis = self.analyze_drift(hours)
        return DriftSummaryResponse(
            summary=analysis.summary,
            analysis_window_hours=analysis.analysis_window_hours,
            live=analysis.live,
            source=analysis.source,
            note=analysis.note,
        )

    def get_findings(
        self,
        drift_type: Optional[DriftType] = None,
        severity: Optional[DriftSeverity] = None,
        resolved: Optional[bool] = None,
        limit: int = 100,
    ) -> DriftFindingsListResponse:
        """Get drift findings with optional filters."""
        # Run analysis if no findings in memory
        if not self._findings:
            self.analyze_drift(24)

        findings = list(self._findings.values())

        # Apply filters
        if drift_type:
            findings = [f for f in findings if f.drift_type == drift_type]
        if severity:
            findings = [f for f in findings if f.severity == severity]
        if resolved is not None:
            findings = [f for f in findings if f.resolved == resolved]

        # Sort by severity (critical first), then by time
        severity_order = {DriftSeverity.CRITICAL: 0, DriftSeverity.HIGH: 1, DriftSeverity.MEDIUM: 2, DriftSeverity.LOW: 3}
        findings.sort(key=lambda f: (severity_order.get(f.severity, 4), f.detected_at or ""), reverse=True)

        unresolved = sum(1 for f in findings if not f.resolved)

        return DriftFindingsListResponse(
            findings=findings[:limit],
            total=len(findings),
            unresolved=unresolved,
            live=True,
            source="policy-drift-store",
        )

    def resolve_finding(self, finding_id: str, resolved_by: Optional[str] = None, resolution_note: Optional[str] = None) -> Optional[PolicyDriftFinding]:
        """Mark a finding as resolved."""
        if finding_id not in self._findings:
            return None

        finding = self._findings[finding_id]
        finding.resolved = True
        finding.resolved_at = datetime.now(timezone.utc).isoformat()
        finding.resolved_by = resolved_by
        finding.resolution_note = resolution_note

        return finding

    def get_worst_offenders(self, hours: int = 24, limit: int = 10) -> WorstOffendersResponse:
        """Get top violating identities/harnesses."""
        analysis = self.analyze_drift(hours)
        return WorstOffendersResponse(
            offenders=analysis.summary.worst_offenders[:limit],
            analysis_window_hours=hours,
            live=analysis.live,
            source=analysis.source,
        )

    def _get_mock_analysis(self, hours: int) -> DriftAnalysisResponse:
        """Return mock data when CloudTrail is unavailable."""
        now = datetime.now(timezone.utc).isoformat()
        mock_findings = [
            PolicyDriftFinding(
                finding_id="drift-mock-001",
                drift_type=DriftType.TIER_VIOLATION,
                severity=DriftSeverity.HIGH,
                policy_id="github_copilot_default",
                harness_type="github_copilot",
                expected="Policy tier is read_only (read-only)",
                actual="Write operation InvokeModel was executed",
                evidence=CloudTrailEvidence(
                    event_id="evt-mock-001",
                    event_name="InvokeModel",
                    event_source="bedrock-runtime.amazonaws.com",
                    event_time=now,
                    username="jsmith-****",
                    user_agent="copilot/1.0",
                ),
                detected_at=now,
            ),
            PolicyDriftFinding(
                finding_id="drift-mock-002",
                drift_type=DriftType.UNKNOWN_HARNESS,
                severity=DriftSeverity.MEDIUM,
                policy_id="none",
                harness_type="unknown",
                expected="Activity from registered harness",
                actual="Unrecognized userAgent: boto3/1.28.0",
                evidence=CloudTrailEvidence(
                    event_id="evt-mock-002",
                    event_name="InvokeModel",
                    event_source="bedrock-runtime.amazonaws.com",
                    event_time=now,
                    username="mlee-****",
                    user_agent="boto3/1.28.0",
                ),
                detected_at=now,
            ),
            PolicyDriftFinding(
                finding_id="drift-mock-003",
                drift_type=DriftType.PATH_VIOLATION,
                severity=DriftSeverity.CRITICAL,
                policy_id="claude_code_default",
                harness_type="claude_code",
                expected="Path blocked by policy: matches **/secrets/**",
                actual="Accessed blocked path: /app/secrets/api-key.json",
                evidence=CloudTrailEvidence(
                    event_id="evt-mock-003",
                    event_name="InvokeModel",
                    event_source="bedrock-runtime.amazonaws.com",
                    event_time=now,
                    username="akumar-****",
                    user_agent="claude-code/1.0.2",
                ),
                detected_at=now,
            ),
        ]

        summary = self._build_summary(mock_findings, 150, ["github_copilot_default", "claude_code_default"])

        return DriftAnalysisResponse(
            findings=mock_findings,
            summary=summary,
            analysis_window_hours=hours,
            total_events_analyzed=150,
            last_analysis=now,
            live=False,
            source="mock",
            note="CloudTrail unavailable or cloudtrail:LookupEvents not granted",
        )
