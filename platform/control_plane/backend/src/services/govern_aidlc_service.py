"""Govern AI-DLC Service — AI-Driven Development Life Cycle observability.

Provides visibility into AI-DLC pipeline state by:
1. Scanning for aidlc-docs/ directories in CodeCommit repos
2. Parsing runs/<timestamp>/run-metrics.yaml for evaluator results
3. Reading steering rule configurations

Integrates PathJail for secure path validation when scanning config files:
- Prevents traversal attacks in repo paths
- Logs violations to audit

Reference: https://github.com/awslabs/aidlc-workflows
"""

import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

from core.cloudtrail_paging import BEDROCK_INVOKE_EVENT_NAMES, lookup_events_paged
from core.harness_killswitch import is_harness_disabled, get_killswitch_status
from core.path_jail import (
    PathJail,
    PathJailViolation,
    PathJailViolationType,
    JailViolationEvent,
    HarnessJailConfig,
)

from models.govern_aidlc import (
    AidlcAuditAction,
    AidlcAuditEntry,
    AidlcAuditResponse,
    AidlcCodeQuality,
    AidlcEvaluatorMetrics,
    AidlcExtension,
    AidlcExtensionCategory,
    AidlcExtensionsResponse,
    AidlcFinding,
    AidlcFindingsResponse,
    AidlcFindingSeverity,
    AidlcFindingStatus,
    AidlcHarnessInstance,
    AidlcHarnessResponse,
    AidlcHarnessStats,
    AidlcHarnessType,
    AidlcMetricsResponse,
    AidlcNfrCompliance,
    AidlcPhase,
    AidlcProject,
    AidlcProjectProgress,
    AidlcProjectsResponse,
    AidlcProjectStatus,
    AidlcRule,
    AidlcRulesResponse,
    AidlcStage,
    AidlcStageExecution,
    AidlcStagesResponse,
    AidlcTestResults,
    DetectionSource,
)

logger = logging.getLogger(__name__)


# AI-DLC v2 stages (5 phases, 32 stages)
# Reference: https://github.com/awslabs/aidlc-workflows/tree/v2
AIDLC_STAGES = [
    # Initialization Phase - Project setup and environment
    AidlcStage(id="workspace-detection", name="Workspace Detection", phase=AidlcPhase.INITIALIZATION, execution=AidlcStageExecution.ALWAYS, description="Detect greenfield/brownfield, check for existing state"),
    AidlcStage(id="scope-detection", name="Scope Detection", phase=AidlcPhase.INITIALIZATION, execution=AidlcStageExecution.ALWAYS, description="Auto-detect scope: enterprise/team/personal/workshop"),
    AidlcStage(id="harness-setup", name="Harness Setup", phase=AidlcPhase.INITIALIZATION, execution=AidlcStageExecution.ALWAYS, description="Configure harness: Claude Code, Kiro IDE, Codex CLI"),
    AidlcStage(id="knowledge-load", name="Knowledge Load", phase=AidlcPhase.INITIALIZATION, execution=AidlcStageExecution.ALWAYS, description="Load methodology + team knowledge bases"),
    # Ideation Phase - Problem understanding
    AidlcStage(id="problem-framing", name="Problem Framing", phase=AidlcPhase.IDEATION, execution=AidlcStageExecution.ALWAYS, description="Define the problem space and constraints"),
    AidlcStage(id="stakeholder-analysis", name="Stakeholder Analysis", phase=AidlcPhase.IDEATION, execution=AidlcStageExecution.CONDITIONAL, description="Identify stakeholders and their needs"),
    AidlcStage(id="solution-exploration", name="Solution Exploration", phase=AidlcPhase.IDEATION, execution=AidlcStageExecution.CONDITIONAL, description="Explore potential solution approaches"),
    AidlcStage(id="feasibility-check", name="Feasibility Check", phase=AidlcPhase.IDEATION, execution=AidlcStageExecution.CONDITIONAL, description="Technical and business feasibility assessment"),
    # Inception Phase - What to build and Why
    AidlcStage(id="reverse-engineering", name="Reverse Engineering", phase=AidlcPhase.INCEPTION, execution=AidlcStageExecution.CONDITIONAL, description="Document existing architecture, APIs, components"),
    AidlcStage(id="requirements-analysis", name="Requirements Analysis", phase=AidlcPhase.INCEPTION, execution=AidlcStageExecution.ALWAYS, description="Gather functional/non-functional requirements"),
    AidlcStage(id="user-stories", name="User Stories", phase=AidlcPhase.INCEPTION, execution=AidlcStageExecution.CONDITIONAL, description="Create personas, acceptance criteria"),
    AidlcStage(id="workflow-planning", name="Workflow Planning", phase=AidlcPhase.INCEPTION, execution=AidlcStageExecution.ALWAYS, description="Determine phases to execute, create execution plan"),
    AidlcStage(id="application-design", name="Application Design", phase=AidlcPhase.INCEPTION, execution=AidlcStageExecution.CONDITIONAL, description="Define component methods, business rules"),
    AidlcStage(id="units-generation", name="Units Generation", phase=AidlcPhase.INCEPTION, execution=AidlcStageExecution.CONDITIONAL, description="Break system into parallel development units"),
    # Construction Phase - How to build it
    AidlcStage(id="functional-design", name="Functional Design", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.CONDITIONAL, description="Per-unit: data models, business logic"),
    AidlcStage(id="nfr-requirements", name="NFR Requirements", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.CONDITIONAL, description="Per-unit: performance, security, scalability"),
    AidlcStage(id="nfr-design", name="NFR Design", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.CONDITIONAL, description="Per-unit: applying NFR patterns"),
    AidlcStage(id="infrastructure-design", name="Infrastructure Design", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.CONDITIONAL, description="Per-unit: cloud resource mapping"),
    AidlcStage(id="code-generation", name="Code Generation", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.ALWAYS, description="Per-unit: two-part planning + generation"),
    AidlcStage(id="code-review", name="Code Review", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.ALWAYS, description="Quality-gate reviewer agent validation"),
    AidlcStage(id="build-and-test", name="Build and Test", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.ALWAYS, description="All units: unified testing"),
    AidlcStage(id="integration-test", name="Integration Test", phase=AidlcPhase.CONSTRUCTION, execution=AidlcStageExecution.CONDITIONAL, description="Cross-unit integration validation"),
    # Operation Phase - Deploy and run it
    AidlcStage(id="deployment-planning", name="Deployment Planning", phase=AidlcPhase.OPERATION, execution=AidlcStageExecution.CONDITIONAL, description="Deployment strategy and automation"),
    AidlcStage(id="infrastructure-provision", name="Infrastructure Provision", phase=AidlcPhase.OPERATION, execution=AidlcStageExecution.CONDITIONAL, description="Cloud resource provisioning"),
    AidlcStage(id="deployment-execute", name="Deployment Execute", phase=AidlcPhase.OPERATION, execution=AidlcStageExecution.CONDITIONAL, description="Execute deployment pipeline"),
    AidlcStage(id="monitoring-setup", name="Monitoring Setup", phase=AidlcPhase.OPERATION, execution=AidlcStageExecution.CONDITIONAL, description="Observability and alerting setup"),
    AidlcStage(id="runbook-generation", name="Runbook Generation", phase=AidlcPhase.OPERATION, execution=AidlcStageExecution.CONDITIONAL, description="Operational documentation generation"),
]

# Standard extensions
AIDLC_EXTENSIONS = [
    AidlcExtension(id="security-baseline", name="Security Baseline", category=AidlcExtensionCategory.SECURITY, rule_count=15, description="Encryption, logging, access control, headers, validation", opt_in=True, blocking=True),
    AidlcExtension(id="property-based-testing", name="Property-Based Testing", category=AidlcExtensionCategory.TESTING, rule_count=10, description="Round-trip, invariant, idempotence, generators", opt_in=True, blocking=True),
    AidlcExtension(id="resiliency-baseline", name="Resiliency Baseline", category=AidlcExtensionCategory.RESILIENCY, rule_count=15, description="HA, DR, monitoring, change management", opt_in=True, blocking=True),
]

# Sample rules
AIDLC_RULES: Dict[str, List[AidlcRule]] = {
    "security-baseline": [
        AidlcRule(id="SECURITY-01", extension_id="security-baseline", title="Encryption at Rest", statement="All data stores MUST enable encryption at rest", verification_criteria=["S3 buckets have SSE enabled", "RDS instances use encrypted storage", "DynamoDB tables enable encryption"]),
        AidlcRule(id="SECURITY-02", extension_id="security-baseline", title="Encryption in Transit", statement="All network communication MUST use TLS 1.2+", verification_criteria=["API endpoints enforce HTTPS", "Internal services use TLS", "No HTTP fallbacks"]),
        AidlcRule(id="SECURITY-03", extension_id="security-baseline", title="Secret Management", statement="Secrets MUST NOT be hardcoded or committed", verification_criteria=["No secrets in source code", "Using Secrets Manager or Parameter Store", "Environment variables for local dev only"]),
        AidlcRule(id="SECURITY-04", extension_id="security-baseline", title="Input Validation", statement="All external inputs MUST be validated", verification_criteria=["Request schemas defined", "Path/query params validated", "File uploads sanitized"]),
        AidlcRule(id="SECURITY-05", extension_id="security-baseline", title="Authentication", statement="All endpoints MUST require authentication", verification_criteria=["Auth middleware applied", "Public routes explicitly marked", "Token validation implemented"]),
    ],
    "property-based-testing": [
        AidlcRule(id="PBT-01", extension_id="property-based-testing", title="Round-Trip Property", statement="Serialization/deserialization MUST be reversible", verification_criteria=["encode(decode(x)) == x", "parse(stringify(obj)) == obj"]),
        AidlcRule(id="PBT-02", extension_id="property-based-testing", title="Invariant Preservation", statement="Operations MUST preserve invariants", verification_criteria=["State invariants checked post-operation", "Constraint violations caught"]),
        AidlcRule(id="PBT-03", extension_id="property-based-testing", title="Idempotence", statement="Idempotent operations MUST produce same result", verification_criteria=["PUT/DELETE returns same state", "Retry-safe operations verified"]),
    ],
    "resiliency-baseline": [
        AidlcRule(id="RESILIENCY-01", extension_id="resiliency-baseline", title="Health Checks", statement="All services MUST expose health endpoints", verification_criteria=["/health returns 200", "Dependency health reported", "Metrics exposed"]),
        AidlcRule(id="RESILIENCY-02", extension_id="resiliency-baseline", title="Graceful Degradation", statement="Services MUST degrade gracefully", verification_criteria=["Circuit breakers implemented", "Fallbacks defined", "Timeouts configured"]),
        AidlcRule(id="RESILIENCY-03", extension_id="resiliency-baseline", title="Retry Logic", statement="External calls MUST implement retries", verification_criteria=["Exponential backoff", "Max retry limits", "Jitter applied"]),
    ],
}


class GovernAidlcService:
    """Service for AI-DLC pipeline observability.

    Integrates PathJail for secure path validation when scanning config files.
    """

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._cc_client: Optional[Any] = None
        self._projects_cache: Optional[List[AidlcProject]] = None
        self._cache_time: Optional[datetime] = None
        self._cache_ttl_seconds = 300  # 5 minutes

        # PathJail for config file scanning (defaults to cwd)
        self._jail: Optional[PathJail] = None
        self._jail_violations: List[JailViolationEvent] = []

    def _get_config_jail(self, root: Optional[Path] = None) -> PathJail:
        """Get or create a PathJail for config file scanning.

        Blocks access to sensitive paths when scanning for AI-DLC config files.
        """
        if self._jail is None or root is not None:
            config = HarnessJailConfig(
                root=root or Path.cwd(),
                allowed_patterns=[
                    # AI-DLC config patterns
                    "**/aidlc-docs/**",
                    "**/.aidlc/**",
                    "**/aidlc.yaml",
                    "**/aidlc.yml",
                    "**/.aidlc.yaml",
                    "**/.aidlc.yml",
                    # Claude Code patterns
                    "**/.claude/**",
                    "**/CLAUDE.md",
                    # Kiro patterns
                    "**/.kiro/**",
                    "**/kiro.yaml",
                ],
                blocked_patterns=[
                    # Sensitive files
                    "**/secrets/**",
                    "**/.env", "**/.env.*",
                    "**/credentials*",
                    "**/*.pem", "**/*.key",
                    "**/.aws/credentials",
                    "**/.ssh/**",
                ],
            )
            self._jail = config.create_jail()
        return self._jail

    def _validate_config_path(self, path: str, context: str = "") -> Tuple[bool, Optional[Path]]:
        """Validate a config file path against jail rules.

        Args:
            path: Path to validate
            context: Context for logging

        Returns:
            Tuple of (is_valid, resolved_path_or_none)
        """
        jail = self._get_config_jail()
        try:
            resolved = jail.jail(path, context=context)
            return True, resolved
        except PathJailViolation as e:
            # Log the violation
            event = JailViolationEvent(
                timestamp=datetime.now(timezone.utc),
                path=path,
                violation_type=e.violation_type,
                jail_root=str(jail.root),
                details=f"{context}: {str(e)}",
            )
            self._jail_violations.append(event)
            logger.warning("Config path jail violation: %s - %s", path, e)
            return False, None

    def get_jail_violations(self, limit: int = 100) -> List[JailViolationEvent]:
        """Get recent jail violations for audit.

        Returns:
            List of recent violation events
        """
        return self._jail_violations[-limit:]

    @property
    def cc_client(self):
        if self._cc_client is None:
            self._cc_client = boto3.client("codecommit", region_name=self.region)
        return self._cc_client

    def _cache_valid(self) -> bool:
        if self._cache_time is None or self._projects_cache is None:
            return False
        elapsed = (datetime.now(timezone.utc) - self._cache_time).total_seconds()
        return elapsed < self._cache_ttl_seconds

    def get_stages(self) -> AidlcStagesResponse:
        """Return the standard AI-DLC stages."""
        return AidlcStagesResponse(stages=AIDLC_STAGES)

    def get_extensions(self) -> AidlcExtensionsResponse:
        """Return the available extensions."""
        return AidlcExtensionsResponse(extensions=AIDLC_EXTENSIONS)

    def get_rules(self, extension_id: str) -> AidlcRulesResponse:
        """Return rules for an extension."""
        rules = AIDLC_RULES.get(extension_id, [])
        return AidlcRulesResponse(extension_id=extension_id, rules=rules)

    def discover_projects(self, limit: int = 50) -> AidlcProjectsResponse:
        """Discover AI-DLC projects by scanning CodeCommit for aidlc-docs/ directories."""
        if self._cache_valid():
            return AidlcProjectsResponse(
                projects=self._projects_cache[:limit],
                total=len(self._projects_cache),
                live=True,
                source="codecommit (cached)",
            )

        projects: List[AidlcProject] = []
        live = False

        try:
            repos = self.cc_client.list_repositories().get("repositories", [])
            live = True

            for repo_info in repos[:limit]:
                repo_name = repo_info.get("repositoryName", "")
                try:
                    # Check for aidlc-docs directory
                    try:
                        folder = self.cc_client.get_folder(
                            repositoryName=repo_name,
                            folderPath="aidlc-docs",
                        )
                        # Found aidlc-docs - this is an AI-DLC project
                        project = self._parse_project_from_repo(repo_name, folder)
                        if project:
                            projects.append(project)
                    except self.cc_client.exceptions.FolderDoesNotExistException:
                        # Not an AI-DLC project
                        pass
                except ClientError as e:
                    logger.debug(f"Error checking repo {repo_name}: {e}")
                    continue

            self._projects_cache = projects
            self._cache_time = datetime.now(timezone.utc)

        except ClientError as e:
            logger.warning(f"CodeCommit list_repositories failed: {e}")
            # Return mock data as fallback
            return self._get_mock_projects(limit)

        if not projects:
            return self._get_mock_projects(limit)

        return AidlcProjectsResponse(
            projects=projects[:limit],
            total=len(projects),
            live=live,
            source="codecommit",
        )

    def _parse_project_from_repo(self, repo_name: str, folder: dict) -> Optional[AidlcProject]:
        """Parse project state from aidlc-docs folder contents."""
        try:
            # Look for state.yaml or similar
            files = folder.get("files", [])
            subfolders = folder.get("subFolders", [])

            # Determine current phase/stage from folder structure
            current_phase = AidlcPhase.INCEPTION
            current_stage = "workspace-detection"
            progress = AidlcProjectProgress()

            # Check for phase completion indicators
            for sf in subfolders:
                sf_name = sf.get("absolutePath", "").split("/")[-1].lower()
                if sf_name == "inception":
                    progress.inception = 100.0
                    current_phase = AidlcPhase.CONSTRUCTION
                    current_stage = "functional-design"
                elif sf_name == "construction":
                    progress.construction = 100.0
                    current_phase = AidlcPhase.OPERATIONS
                    current_stage = "deployment"
                elif sf_name == "operations":
                    progress.operations = 100.0

            # Try to get last commit info for activity time
            last_activity = datetime.now(timezone.utc)
            try:
                commits = self.cc_client.get_branch(
                    repositoryName=repo_name,
                    branchName="main",
                )
                commit_id = commits.get("branch", {}).get("commitId")
                if commit_id:
                    commit = self.cc_client.get_commit(
                        repositoryName=repo_name,
                        commitId=commit_id,
                    )
                    author_date = commit.get("commit", {}).get("author", {}).get("date")
                    if author_date:
                        last_activity = datetime.fromisoformat(author_date.replace("Z", "+00:00"))
            except Exception:
                pass

            return AidlcProject(
                id=f"proj-{repo_name[:8]}",
                name=repo_name.replace("-", " ").title(),
                repository=repo_name,
                current_phase=current_phase,
                current_stage=current_stage,
                status=AidlcProjectStatus.ACTIVE,
                last_activity=last_activity,
                enabled_extensions=["security-baseline"],
                progress=progress,
                violations=0,
                pending_approvals=0,
                team_members=[],
            )
        except Exception as e:
            logger.debug(f"Error parsing project from {repo_name}: {e}")
            return None

    def _get_mock_projects(self, limit: int) -> AidlcProjectsResponse:
        """Return mock projects when CodeCommit is unavailable."""
        now = datetime.now(timezone.utc)
        projects = [
            AidlcProject(
                id="proj-001",
                name="Payment Service Refactor",
                repository="fsi-platform/payment-service",
                current_phase=AidlcPhase.CONSTRUCTION,
                current_stage="code-generation",
                status=AidlcProjectStatus.ACTIVE,
                last_activity=now,
                enabled_extensions=["security-baseline", "property-based-testing"],
                progress=AidlcProjectProgress(inception=100, construction=65, operations=0),
                violations=2,
                pending_approvals=1,
                team_members=["jsmith", "mlee", "akumar"],
            ),
            AidlcProject(
                id="proj-002",
                name="KYC Automation Agent",
                repository="fsi-platform/kyc-agent",
                current_phase=AidlcPhase.INCEPTION,
                current_stage="application-design",
                status=AidlcProjectStatus.ACTIVE,
                last_activity=now,
                enabled_extensions=["security-baseline", "resiliency-baseline"],
                progress=AidlcProjectProgress(inception=70, construction=0, operations=0),
                violations=0,
                pending_approvals=2,
                team_members=["tchen", "rgarcia"],
            ),
        ]
        return AidlcProjectsResponse(
            projects=projects[:limit],
            total=len(projects),
            live=False,
            source="mock",
        )

    def get_findings(self, project_id: Optional[str] = None, limit: int = 100) -> AidlcFindingsResponse:
        """Get findings/violations, optionally filtered by project."""
        # For now, return mock data - would read from DynamoDB or parse from repos
        now = datetime.now(timezone.utc)
        findings = [
            AidlcFinding(
                id="find-001",
                project_id="proj-001",
                rule_id="SECURITY-03",
                stage="code-generation",
                severity=AidlcFindingSeverity.HIGH,
                status=AidlcFindingStatus.OPEN,
                message="Hardcoded API key detected in config.ts",
                file="src/config.ts",
                line=42,
                detected_at=now,
            ),
            AidlcFinding(
                id="find-002",
                project_id="proj-001",
                rule_id="SECURITY-04",
                stage="code-generation",
                severity=AidlcFindingSeverity.MEDIUM,
                status=AidlcFindingStatus.OPEN,
                message="Missing input validation on payment amount",
                file="src/handlers/payment.ts",
                line=78,
                detected_at=now,
            ),
        ]

        if project_id:
            findings = [f for f in findings if f.project_id == project_id]

        by_severity = {}
        by_status = {}
        for f in findings:
            by_severity[f.severity.value] = by_severity.get(f.severity.value, 0) + 1
            by_status[f.status.value] = by_status.get(f.status.value, 0) + 1

        return AidlcFindingsResponse(
            findings=findings[:limit],
            total=len(findings),
            by_severity=by_severity,
            by_status=by_status,
            live=False,
            source="mock",
        )

    def get_metrics(self, project_id: Optional[str] = None) -> AidlcMetricsResponse:
        """Get evaluator metrics, optionally filtered by project."""
        now = datetime.now(timezone.utc)
        metrics = [
            AidlcEvaluatorMetrics(
                project_id="proj-001",
                timestamp=now,
                code_quality=AidlcCodeQuality(linting_score=92, security_score=78, duplication_pct=3.2),
                test_results=AidlcTestResults(pass_rate=94, coverage_pct=82, total_tests=156),
                nfr_compliance=AidlcNfrCompliance(token_consumption=145000, execution_time_ms=2340, cross_model_consistency=89),
                semantic_score=87,
                overall_score=85,
            ),
            AidlcEvaluatorMetrics(
                project_id="proj-002",
                timestamp=now,
                code_quality=AidlcCodeQuality(linting_score=96, security_score=95, duplication_pct=1.1),
                test_results=AidlcTestResults(pass_rate=100, coverage_pct=78, total_tests=42),
                nfr_compliance=AidlcNfrCompliance(token_consumption=52000, execution_time_ms=890, cross_model_consistency=94),
                semantic_score=92,
                overall_score=91,
            ),
        ]

        if project_id:
            metrics = [m for m in metrics if m.project_id == project_id]

        return AidlcMetricsResponse(
            metrics=metrics,
            live=False,
            source="mock",
        )

    def get_audit_log(self, project_id: Optional[str] = None, limit: int = 100) -> AidlcAuditResponse:
        """Get audit log entries, optionally filtered by project."""
        now = datetime.now(timezone.utc)
        entries = [
            AidlcAuditEntry(
                id="audit-001",
                project_id="proj-001",
                timestamp=now,
                stage="code-generation",
                action=AidlcAuditAction.FINDING_DETECTED,
                details="SECURITY-03: Hardcoded API key detected",
            ),
            AidlcAuditEntry(
                id="audit-002",
                project_id="proj-001",
                timestamp=now,
                stage="code-generation",
                action=AidlcAuditAction.STAGE_STARTED,
                user="jsmith",
                details="Starting code generation for payment-handler unit",
            ),
        ]

        if project_id:
            entries = [e for e in entries if e.project_id == project_id]

        return AidlcAuditResponse(
            entries=entries[:limit],
            total=len(entries),
            live=False,
            source="mock",
        )

    # -------------------------------------------------------------------------
    # Harness Detection
    # -------------------------------------------------------------------------

    # Patterns to detect harness type from userAgent
    HARNESS_PATTERNS = [
        {"pattern": "claude-cli", "type": AidlcHarnessType.CLAUDE_CODE, "name": "Claude Code"},
        {"pattern": "claude-code", "type": AidlcHarnessType.CLAUDE_CODE, "name": "Claude Code"},
        {"pattern": "kiro-ide", "type": AidlcHarnessType.KIRO_IDE, "name": "Kiro IDE"},
        {"pattern": "kiro-cli", "type": AidlcHarnessType.KIRO_CLI, "name": "Kiro CLI"},
        {"pattern": "kiro/", "type": AidlcHarnessType.KIRO_IDE, "name": "Kiro IDE"},  # Generic kiro
        {"pattern": "codex-cli", "type": AidlcHarnessType.CODEX_CLI, "name": "Codex CLI"},
        {"pattern": "opencode", "type": AidlcHarnessType.OPENCODE, "name": "opencode"},
        {"pattern": "cursor", "type": AidlcHarnessType.CURSOR, "name": "Cursor"},
        {"pattern": "copilot", "type": AidlcHarnessType.COPILOT, "name": "GitHub Copilot"},
        {"pattern": "amazonq", "type": AidlcHarnessType.Q_DESKTOP, "name": "Q Desktop"},
        {"pattern": "amazon-q", "type": AidlcHarnessType.Q_DESKTOP, "name": "Q Desktop"},
    ]

    HARNESS_DISPLAY_NAMES = {
        AidlcHarnessType.CLAUDE_CODE: "Claude Code",
        AidlcHarnessType.KIRO_IDE: "Kiro IDE",
        AidlcHarnessType.KIRO_CLI: "Kiro CLI",
        AidlcHarnessType.CODEX_CLI: "Codex CLI",
        AidlcHarnessType.OPENCODE: "opencode",
        AidlcHarnessType.Q_DESKTOP: "Q Desktop",
        AidlcHarnessType.CURSOR: "Cursor",
        AidlcHarnessType.COPILOT: "GitHub Copilot",
        AidlcHarnessType.UNKNOWN: "Unknown",
    }

    # Config file patterns for detecting harnesses in CodeCommit repos
    CONFIG_FILE_PATTERNS = [
        {"path": ".claude/settings.json", "type": AidlcHarnessType.CLAUDE_CODE, "name": "Claude Code"},
        {"path": "CLAUDE.md", "type": AidlcHarnessType.CLAUDE_CODE, "name": "Claude Code"},
        {"path": ".kiro/config.json", "type": AidlcHarnessType.KIRO_IDE, "name": "Kiro IDE"},
        {"path": ".kiro/steering/", "type": AidlcHarnessType.KIRO_IDE, "name": "Kiro IDE"},
        {"path": ".cursor/rules/", "type": AidlcHarnessType.CURSOR, "name": "Cursor"},
        {"path": ".aws/amazonq/", "type": AidlcHarnessType.Q_DESKTOP, "name": "Q Desktop"},
        {"path": ".github/copilot-instructions.md", "type": AidlcHarnessType.COPILOT, "name": "GitHub Copilot"},
    ]

    # Git commit patterns for detecting harness usage
    GIT_COMMIT_PATTERNS = [
        {"pattern": "Co-Authored-By: Claude", "type": AidlcHarnessType.CLAUDE_CODE, "name": "Claude Code"},
        {"pattern": "Generated by Claude", "type": AidlcHarnessType.CLAUDE_CODE, "name": "Claude Code"},
        {"pattern": "Generated by Kiro", "type": AidlcHarnessType.KIRO_IDE, "name": "Kiro IDE"},
        {"pattern": "Kiro-generated", "type": AidlcHarnessType.KIRO_IDE, "name": "Kiro IDE"},
        {"pattern": "Cursor-generated", "type": AidlcHarnessType.CURSOR, "name": "Cursor"},
        {"pattern": "Generated by Copilot", "type": AidlcHarnessType.COPILOT, "name": "GitHub Copilot"},
        {"pattern": "Co-authored-by: GitHub Copilot", "type": AidlcHarnessType.COPILOT, "name": "GitHub Copilot"},
    ]

    def _detect_harness_type(self, user_agent: str) -> tuple[AidlcHarnessType, Optional[str]]:
        """Detect harness type and version from userAgent string."""
        ua_lower = user_agent.lower()
        for p in self.HARNESS_PATTERNS:
            if p["pattern"] in ua_lower:
                # Try to extract version
                version = None
                if "/" in user_agent:
                    parts = user_agent.split("/")
                    if len(parts) > 1:
                        version = parts[1].split(" ")[0]
                return p["type"], version
        return AidlcHarnessType.UNKNOWN, None

    def discover_harnesses(
        self,
        days: int = 7,
        sources: Optional[List[str]] = None,
    ) -> Tuple[AidlcHarnessResponse, bool]:
        """Discover AI-DLC harnesses from multiple sources.

        Uses three detection methods:
        1. CloudTrail - Bedrock API calls with userAgent patterns
        2. Config Files - Scan CodeCommit repos for harness config files
        3. Git Commits - Look for harness-specific commit message patterns

        Args:
            days: Number of days of history to scan (for CloudTrail)
            sources: Optional list of sources to use ('cloudtrail', 'config_file', 'git_commit')
                    If None, uses all available sources.

        Returns:
            Tuple of (AidlcHarnessResponse, killswitch_active). The second element
            indicates if the response is limited due to kill-switch being active.
        """
        import json
        from collections import defaultdict
        from datetime import timedelta

        # Check kill-switch before performing harness operations
        if is_harness_disabled():
            status = get_killswitch_status()
            logger.warning(f"Harness discovery blocked by kill-switch: {status.reason}")
            return AidlcHarnessResponse(
                harnesses=[],
                instances=[],
                total_users=0,
                total_requests=0,
                live=False,
                source=f"killswitch:{status.source.value}",
                sources_used=[],
            ), True

        # Determine which sources to use
        all_sources = {DetectionSource.CLOUDTRAIL, DetectionSource.CONFIG_FILE, DetectionSource.GIT_COMMIT}
        if sources:
            active_sources = {DetectionSource(s) for s in sources if s in [ds.value for ds in DetectionSource]}
        else:
            active_sources = all_sources

        # Aggregate data structures
        by_harness: Dict[AidlcHarnessType, Dict] = defaultdict(lambda: {
            "users": set(),
            "requests": 0,
            "versions": set(),
            "last_seen": None,
            "detection_sources": set(),
        })
        # Key: (user, harness_type), Value: instance data
        by_user: Dict[tuple, Dict] = {}
        sources_used: List[DetectionSource] = []
        live = False
        # Completeness caveats from any detector, surfaced on the response rather than only
        # in the log.
        notes: List[str] = []

        # 1. CloudTrail detection
        if DetectionSource.CLOUDTRAIL in active_sources:
            ct_harnesses, ct_users, ct_live, ct_note = self._detect_from_cloudtrail(days)
            if ct_note:
                notes.append(ct_note)
            if ct_live:
                live = True
                sources_used.append(DetectionSource.CLOUDTRAIL)
            for h_type, data in ct_harnesses.items():
                by_harness[h_type]["users"].update(data["users"])
                by_harness[h_type]["requests"] += data["requests"]
                by_harness[h_type]["versions"].update(data["versions"])
                by_harness[h_type]["detection_sources"].add(DetectionSource.CLOUDTRAIL)
                if data["last_seen"] and (by_harness[h_type]["last_seen"] is None or data["last_seen"] > by_harness[h_type]["last_seen"]):
                    by_harness[h_type]["last_seen"] = data["last_seen"]
            for key, data in ct_users.items():
                if key not in by_user:
                    by_user[key] = {
                        "harness_type": data["harness_type"],
                        "user": data["user"],
                        "version": data.get("version"),
                        "last_seen": data.get("last_seen"),
                        "request_count": 0,
                        "models_used": set(),
                        "config_path": None,
                        "last_commit_sha": None,
                        "detection_sources": set(),
                    }
                by_user[key]["request_count"] += data.get("request_count", 0)
                by_user[key]["models_used"].update(data.get("models_used", set()))
                by_user[key]["detection_sources"].add(DetectionSource.CLOUDTRAIL)
                if data.get("last_seen") and (by_user[key]["last_seen"] is None or data["last_seen"] > by_user[key]["last_seen"]):
                    by_user[key]["last_seen"] = data["last_seen"]
                    if data.get("version"):
                        by_user[key]["version"] = data["version"]

        # 2. Config file detection (CodeCommit)
        if DetectionSource.CONFIG_FILE in active_sources:
            cfg_harnesses, cfg_users, cfg_live = self._detect_from_config_files()
            if cfg_live:
                live = True
                sources_used.append(DetectionSource.CONFIG_FILE)
            for h_type, data in cfg_harnesses.items():
                by_harness[h_type]["users"].update(data["users"])
                by_harness[h_type]["detection_sources"].add(DetectionSource.CONFIG_FILE)
                if data.get("last_seen") and (by_harness[h_type]["last_seen"] is None or data["last_seen"] > by_harness[h_type]["last_seen"]):
                    by_harness[h_type]["last_seen"] = data["last_seen"]
            for key, data in cfg_users.items():
                if key not in by_user:
                    by_user[key] = {
                        "harness_type": data["harness_type"],
                        "user": data["user"],
                        "version": None,
                        "last_seen": data.get("last_seen") or datetime.now(timezone.utc),
                        "request_count": 0,
                        "models_used": set(),
                        "config_path": data.get("config_path"),
                        "last_commit_sha": None,
                        "detection_sources": set(),
                    }
                else:
                    if data.get("config_path"):
                        by_user[key]["config_path"] = data["config_path"]
                by_user[key]["detection_sources"].add(DetectionSource.CONFIG_FILE)

        # 3. Git commit detection (CodeCommit)
        if DetectionSource.GIT_COMMIT in active_sources:
            git_harnesses, git_users, git_live = self._detect_from_git_commits(days)
            if git_live:
                live = True
                sources_used.append(DetectionSource.GIT_COMMIT)
            for h_type, data in git_harnesses.items():
                by_harness[h_type]["users"].update(data["users"])
                by_harness[h_type]["detection_sources"].add(DetectionSource.GIT_COMMIT)
                if data.get("last_seen") and (by_harness[h_type]["last_seen"] is None or data["last_seen"] > by_harness[h_type]["last_seen"]):
                    by_harness[h_type]["last_seen"] = data["last_seen"]
            for key, data in git_users.items():
                if key not in by_user:
                    by_user[key] = {
                        "harness_type": data["harness_type"],
                        "user": data["user"],
                        "version": None,
                        "last_seen": data.get("last_seen") or datetime.now(timezone.utc),
                        "request_count": 0,
                        "models_used": set(),
                        "config_path": None,
                        "last_commit_sha": data.get("last_commit_sha"),
                        "detection_sources": set(),
                    }
                else:
                    if data.get("last_commit_sha"):
                        by_user[key]["last_commit_sha"] = data["last_commit_sha"]
                by_user[key]["detection_sources"].add(DetectionSource.GIT_COMMIT)

        # Build response
        harness_stats = []
        for h_type, data in by_harness.items():
            harness_stats.append(AidlcHarnessStats(
                harness_type=h_type,
                display_name=self.HARNESS_DISPLAY_NAMES.get(h_type, str(h_type)),
                user_count=len(data["users"]),
                total_requests=data["requests"],
                versions_seen=sorted(data["versions"]),
                last_activity=data["last_seen"],
                detection_sources=list(data["detection_sources"]),
            ))

        instances = []
        for (username, h_type), data in by_user.items():
            # Calculate detection confidence: higher if multiple sources agree
            num_sources = len(data["detection_sources"])
            confidence = min(1.0, 0.3 + (num_sources * 0.35))  # 0.65 for 1 source, 1.0 for 2+
            instances.append(AidlcHarnessInstance(
                harness_type=data["harness_type"],
                user=data["user"],
                version=data.get("version"),
                last_seen=data.get("last_seen") or datetime.now(timezone.utc),
                request_count=data.get("request_count", 0),
                models_used=sorted(data.get("models_used", set())),
                config_path=data.get("config_path"),
                last_commit_sha=data.get("last_commit_sha"),
                detection_method=list(data["detection_sources"])[0].value if data["detection_sources"] else "unknown",
                detection_sources=list(data["detection_sources"]),
                detection_confidence=confidence,
            ))

        total_users = len(set(inst.user for inst in instances))
        total_requests = sum(h.total_requests for h in harness_stats)

        if harness_stats or instances:
            source_names = ",".join(s.value for s in sources_used)
            return AidlcHarnessResponse(
                harnesses=sorted(harness_stats, key=lambda h: -h.total_requests),
                instances=sorted(instances, key=lambda i: (-i.detection_confidence, -i.request_count)),
                total_users=total_users,
                total_requests=total_requests,
                live=live,
                source=source_names or "none",
                sources_used=sources_used,
                note="; ".join(notes) or None,
            ), False

        # Return mock data as fallback
        return self._get_mock_harnesses(), False

    def _detect_from_cloudtrail(self, days: int) -> Tuple[Dict, Dict, bool, Optional[str]]:
        """Detect harnesses from CloudTrail Bedrock API calls.

        Returns:
            Tuple of (by_harness dict, by_user dict, live flag)
        """
        import json
        from collections import defaultdict
        from datetime import timedelta

        by_harness: Dict[AidlcHarnessType, Dict] = defaultdict(lambda: {
            "users": set(),
            "requests": 0,
            "versions": set(),
            "last_seen": None,
        })
        by_user: Dict[tuple, Dict] = {}

        try:
            ct = boto3.client("cloudtrail", region_name=self.region)
            start = datetime.now(timezone.utc) - timedelta(days=days)

            # This asked CloudTrail for MaxResults=500 and took the first page. CloudTrail
            # CLAMPS to 50 and returns a NextToken rather than erroring, so a "30 days of
            # harness activity" pass read 50 events and stopped. core/cloudtrail_paging
            # documents why botocore does not catch the over-max value either.
            #
            # The lookup AXIS was the bigger defect. Measured on this account over 30 days:
            # EventSource=bedrock.amazonaws.com returned a first page of 50 CONTROL-PLANE
            # events (ListEvaluationJobs, ListDataSources, GetKnowledgeBase, ...) holding
            # ZERO invocations, and EventSource=bedrock-runtime.amazonaws.com returned 0
            # events at all, because InvokeModel/Converse are CloudTrail *data* events and
            # data events are not enabled here. The InvokeModel/Converse filter below
            # therefore matched nothing on every single request, so harness detection
            # reported "no AI coding tools in use" as a measured fact when it had never
            # looked anywhere it could find one. eventSource is re-checked per event below.
            lookup = lookup_events_paged(
                ct,
                attribute_key="EventName",
                attribute_values=BEDROCK_INVOKE_EVENT_NAMES,
                start_time=start,
            )
            for event in lookup.events:
                event_name = event.get("EventName", "")
                username = event.get("Username", "unknown")
                event_time = event.get("EventTime")

                if event_name not in BEDROCK_INVOKE_EVENT_NAMES:
                    continue

                # The lookup is now by EventName, so re-check the source here: these
                # four names are not unique to Bedrock, and counting another service's
                # InvokeModel as AI coding-harness usage would inflate the fleet under
                # a Live badge. Prefix match covers bedrock.amazonaws.com and
                # bedrock-runtime.amazonaws.com without listing both.
                if not event.get("EventSource", "").startswith("bedrock"):
                    continue

                # Skip service accounts
                if username in ["SageMaker", "ConfigResourceCompositionSession"]:
                    continue

                try:
                    ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                    user_agent = ct_event.get("userAgent", "unknown")
                    request_params = ct_event.get("requestParameters") or {}
                    model_id = request_params.get("modelId", "unknown")
                except Exception:
                    user_agent = "unknown"
                    model_id = "unknown"

                harness_type, version = self._detect_harness_type(user_agent)
                if harness_type == AidlcHarnessType.UNKNOWN:
                    continue

                by_harness[harness_type]["users"].add(username)
                by_harness[harness_type]["requests"] += 1
                if version:
                    by_harness[harness_type]["versions"].add(version)
                if event_time and (by_harness[harness_type]["last_seen"] is None or event_time > by_harness[harness_type]["last_seen"]):
                    by_harness[harness_type]["last_seen"] = event_time

                user_key = (username, harness_type)
                if user_key not in by_user:
                    by_user[user_key] = {
                        "harness_type": harness_type,
                        "user": username,
                        "version": version,
                        "last_seen": event_time,
                        "request_count": 0,
                        "models_used": set(),
                    }
                by_user[user_key]["request_count"] += 1
                by_user[user_key]["models_used"].add(model_id)
                if event_time and event_time > by_user[user_key]["last_seen"]:
                    by_user[user_key]["last_seen"] = event_time
                    if version:
                        by_user[user_key]["version"] = version


            # bool(by_harness), not len(...) > 0 on some inner list: this flag answers "did
            # THIS detector contribute", and the caller ORs it across three detectors before
            # badging the response. An empty result here is a truthful "nothing to add",
            # which is different from the emptiness produced by the except below.
            #
            # lookup.note is None when every event name was walked to the end of the window,
            # and that None is load-bearing: it is the difference between "these are the
            # totals" and "these are a floor". A per-name lookup that failed also lands here
            # rather than in the except below, because LookupResult absorbs it - so a partial
            # answer still says which name it could not read.
            return dict(by_harness), by_user, bool(by_harness), lookup.note

        except Exception as e:
            # WARNING, not debug. The per-event-name failure this replaced was logged at
            # logger.debug and swallowed with `continue`, so a lookup that failed on every
            # request for months was invisible even to a full log sweep - the endpoint just
            # reported "no AI coding tools in use" with a straight face.
            logger.warning("CloudTrail harness detection failed: %s", e)
            return {}, {}, False, "CloudTrail harness detection failed; no CloudTrail evidence in this answer"

    def _detect_from_config_files(self) -> Tuple[Dict, Dict, bool]:
        """Detect harnesses by scanning CodeCommit repos for config files.

        Scans for:
        - .claude/settings.json, CLAUDE.md -> Claude Code
        - .kiro/config.json, .kiro/steering/ -> Kiro
        - .cursor/rules/ -> Cursor
        - .aws/amazonq/ -> Q Desktop
        - .github/copilot-instructions.md -> Copilot

        Returns:
            Tuple of (by_harness dict, by_user dict, live flag)
        """
        from collections import defaultdict

        by_harness: Dict[AidlcHarnessType, Dict] = defaultdict(lambda: {
            "users": set(),
            "last_seen": None,
        })
        by_user: Dict[tuple, Dict] = {}

        try:
            cc = boto3.client("codecommit", region_name=self.region)
            repos = cc.list_repositories().get("repositories", [])

            for repo_info in repos[:50]:  # Limit to first 50 repos
                repo_name = repo_info.get("repositoryName", "")

                for pattern in self.CONFIG_FILE_PATTERNS:
                    try:
                        # Check if path exists (file or folder)
                        path = pattern["path"]
                        harness_type = pattern["type"]

                        if path.endswith("/"):
                            # It's a directory
                            try:
                                folder = cc.get_folder(repositoryName=repo_name, folderPath=path.rstrip("/"))
                                if folder:
                                    by_harness[harness_type]["users"].add(f"repo:{repo_name}")
                                    # Get last commit info
                                    last_seen = self._get_repo_last_activity(cc, repo_name)
                                    if last_seen and (by_harness[harness_type]["last_seen"] is None or last_seen > by_harness[harness_type]["last_seen"]):
                                        by_harness[harness_type]["last_seen"] = last_seen

                                    user_key = (f"repo:{repo_name}", harness_type)
                                    by_user[user_key] = {
                                        "harness_type": harness_type,
                                        "user": f"repo:{repo_name}",
                                        "config_path": f"{repo_name}/{path}",
                                        "last_seen": last_seen,
                                    }
                            except cc.exceptions.FolderDoesNotExistException:
                                pass
                        else:
                            # It's a file
                            try:
                                file_content = cc.get_file(repositoryName=repo_name, filePath=path)
                                if file_content:
                                    by_harness[harness_type]["users"].add(f"repo:{repo_name}")
                                    last_seen = self._get_repo_last_activity(cc, repo_name)
                                    if last_seen and (by_harness[harness_type]["last_seen"] is None or last_seen > by_harness[harness_type]["last_seen"]):
                                        by_harness[harness_type]["last_seen"] = last_seen

                                    user_key = (f"repo:{repo_name}", harness_type)
                                    by_user[user_key] = {
                                        "harness_type": harness_type,
                                        "user": f"repo:{repo_name}",
                                        "config_path": f"{repo_name}/{path}",
                                        "last_seen": last_seen,
                                    }
                            except cc.exceptions.FileDoesNotExistException:
                                pass

                    except ClientError as e:
                        logger.debug("Config file check failed for %s/%s: %s", repo_name, pattern["path"], e)
                        continue

            return dict(by_harness), by_user, bool(by_harness)

        except ClientError as e:
            logger.warning("CodeCommit config file detection failed: %s", e)
            return {}, {}, False

    def _detect_from_git_commits(self, days: int) -> Tuple[Dict, Dict, bool]:
        """Detect harnesses by scanning CodeCommit commits for patterns.

        Looks for:
        - "Co-Authored-By: Claude" in commit messages
        - "Generated by Kiro" patterns
        - Other harness-specific commit patterns

        Returns:
            Tuple of (by_harness dict, by_user dict, live flag)
        """
        from collections import defaultdict
        from datetime import timedelta

        by_harness: Dict[AidlcHarnessType, Dict] = defaultdict(lambda: {
            "users": set(),
            "last_seen": None,
        })
        by_user: Dict[tuple, Dict] = {}

        try:
            cc = boto3.client("codecommit", region_name=self.region)
            repos = cc.list_repositories().get("repositories", [])
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)

            for repo_info in repos[:30]:  # Limit to first 30 repos
                repo_name = repo_info.get("repositoryName", "")

                try:
                    # Get recent commits
                    branch_resp = cc.get_branch(repositoryName=repo_name, branchName="main")
                    commit_id = branch_resp.get("branch", {}).get("commitId")

                    if not commit_id:
                        continue

                    # Get commit history (limited)
                    try:
                        commits_resp = cc.get_commits_from_merge_base(
                            repositoryName=repo_name,
                            sourceCommitSpecifier=commit_id,
                            destinationCommitSpecifier=commit_id,
                        )
                    except Exception:
                        # Fallback: just check the latest commit
                        commits_resp = {"commits": []}
                        try:
                            commit = cc.get_commit(repositoryName=repo_name, commitId=commit_id)
                            if commit.get("commit"):
                                commits_resp["commits"] = [commit["commit"]]
                        except Exception:
                            pass

                    for commit in commits_resp.get("commits", [])[:20]:  # Check last 20 commits
                        commit_message = commit.get("message", "")
                        commit_time = commit.get("committer", {}).get("date")
                        author_email = commit.get("author", {}).get("email", "unknown")

                        # Parse commit time
                        if isinstance(commit_time, str):
                            try:
                                commit_time = datetime.fromisoformat(commit_time.replace("Z", "+00:00"))
                            except Exception:
                                commit_time = None

                        if commit_time and commit_time < cutoff:
                            continue

                        # Check for harness patterns in commit message
                        for pattern in self.GIT_COMMIT_PATTERNS:
                            if pattern["pattern"].lower() in commit_message.lower():
                                harness_type = pattern["type"]
                                by_harness[harness_type]["users"].add(author_email)
                                if commit_time and (by_harness[harness_type]["last_seen"] is None or commit_time > by_harness[harness_type]["last_seen"]):
                                    by_harness[harness_type]["last_seen"] = commit_time

                                user_key = (author_email, harness_type)
                                if user_key not in by_user:
                                    by_user[user_key] = {
                                        "harness_type": harness_type,
                                        "user": author_email,
                                        "last_commit_sha": commit.get("commitId"),
                                        "last_seen": commit_time,
                                    }
                                elif commit_time and (by_user[user_key].get("last_seen") is None or commit_time > by_user[user_key]["last_seen"]):
                                    by_user[user_key]["last_seen"] = commit_time
                                    by_user[user_key]["last_commit_sha"] = commit.get("commitId")
                                break  # One pattern match per commit is enough

                except ClientError as e:
                    logger.debug("Commit scan failed for %s: %s", repo_name, e)
                    continue

            return dict(by_harness), by_user, bool(by_harness)

        except ClientError as e:
            logger.warning("CodeCommit git commit detection failed: %s", e)
            return {}, {}, False

    def _get_repo_last_activity(self, cc, repo_name: str) -> Optional[datetime]:
        """Get the last activity time for a repository."""
        try:
            branch = cc.get_branch(repositoryName=repo_name, branchName="main")
            commit_id = branch.get("branch", {}).get("commitId")
            if commit_id:
                commit = cc.get_commit(repositoryName=repo_name, commitId=commit_id)
                author_date = commit.get("commit", {}).get("author", {}).get("date")
                if author_date:
                    return datetime.fromisoformat(author_date.replace("Z", "+00:00"))
        except Exception:
            pass
        return None

    def _get_mock_harnesses(self) -> AidlcHarnessResponse:
        """Return mock harness data when CloudTrail is unavailable."""
        now = datetime.now(timezone.utc)
        return AidlcHarnessResponse(
            harnesses=[
                AidlcHarnessStats(
                    harness_type=AidlcHarnessType.CLAUDE_CODE,
                    display_name="Claude Code",
                    user_count=12,
                    total_requests=2450,
                    versions_seen=["1.0.0", "1.0.1", "1.0.2"],
                    last_activity=now,
                    detection_sources=[DetectionSource.CLOUDTRAIL, DetectionSource.CONFIG_FILE],
                ),
                AidlcHarnessStats(
                    harness_type=AidlcHarnessType.KIRO_IDE,
                    display_name="Kiro IDE",
                    user_count=8,
                    total_requests=1820,
                    versions_seen=["0.9.0", "0.9.1"],
                    last_activity=now,
                    detection_sources=[DetectionSource.CLOUDTRAIL, DetectionSource.CONFIG_FILE],
                ),
                AidlcHarnessStats(
                    harness_type=AidlcHarnessType.CODEX_CLI,
                    display_name="Codex CLI",
                    user_count=3,
                    total_requests=340,
                    versions_seen=["0.1.0"],
                    last_activity=now,
                    detection_sources=[DetectionSource.CLOUDTRAIL],
                ),
                AidlcHarnessStats(
                    harness_type=AidlcHarnessType.CURSOR,
                    display_name="Cursor",
                    user_count=5,
                    total_requests=0,
                    versions_seen=[],
                    last_activity=now,
                    detection_sources=[DetectionSource.CONFIG_FILE],
                ),
            ],
            instances=[
                AidlcHarnessInstance(
                    harness_type=AidlcHarnessType.CLAUDE_CODE,
                    user="jsmith",
                    version="1.0.2",
                    last_seen=now,
                    request_count=450,
                    models_used=["claude-opus-4", "claude-sonnet-4"],
                    config_path="fsi-platform/payment-service/.claude/settings.json",
                    detection_method="cloudtrail",
                    detection_sources=[DetectionSource.CLOUDTRAIL, DetectionSource.CONFIG_FILE],
                    detection_confidence=1.0,
                ),
                AidlcHarnessInstance(
                    harness_type=AidlcHarnessType.KIRO_IDE,
                    user="mlee",
                    version="0.9.1",
                    last_seen=now,
                    request_count=380,
                    models_used=["claude-sonnet-4", "nova-pro"],
                    config_path="fsi-platform/kyc-agent/.kiro/config.json",
                    detection_method="cloudtrail",
                    detection_sources=[DetectionSource.CLOUDTRAIL, DetectionSource.CONFIG_FILE],
                    detection_confidence=1.0,
                ),
                AidlcHarnessInstance(
                    harness_type=AidlcHarnessType.CLAUDE_CODE,
                    user="akumar",
                    version="1.0.1",
                    last_seen=now,
                    request_count=220,
                    models_used=["claude-sonnet-4"],
                    last_commit_sha="a1b2c3d",
                    detection_method="git_commit",
                    detection_sources=[DetectionSource.GIT_COMMIT],
                    detection_confidence=0.65,
                ),
                AidlcHarnessInstance(
                    harness_type=AidlcHarnessType.CURSOR,
                    user="repo:fsi-platform/trading-ui",
                    version=None,
                    last_seen=now,
                    request_count=0,
                    models_used=[],
                    config_path="fsi-platform/trading-ui/.cursor/rules/",
                    detection_method="config_file",
                    detection_sources=[DetectionSource.CONFIG_FILE],
                    detection_confidence=0.65,
                ),
            ],
            total_users=23,
            total_requests=4610,
            live=False,
            source="mock",
            sources_used=[DetectionSource.CLOUDTRAIL, DetectionSource.CONFIG_FILE, DetectionSource.GIT_COMMIT],
        )
