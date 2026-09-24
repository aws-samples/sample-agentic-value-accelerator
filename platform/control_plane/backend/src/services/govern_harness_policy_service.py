"""Govern Harness Policy Service — tiered tool access control for AI harnesses.

Provides default policies per harness type, tool access evaluation, and
path-based permission checking. Follows the govern_models/govern_evals
convention with honest live/source/note flags.

Integrates PathJail for secure path validation inspired by Visa VVAH's _jail() function:
- Prevents directory traversal attacks (../)
- Blocks symlink escapes
- Enforces allowed/blocked path patterns
- Logs violations for audit
"""

from __future__ import annotations

import fnmatch
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from core.path_jail import (
    PathJail,
    PathJailViolation,
    PathJailViolationType,
    HarnessJailConfig,
    JailViolationEvent,
)
from core.output_caps import OutputCapConfig, DEFAULT_CAPS
from models.govern_harness_policy import (
    DEFAULT_BLOCKED_PATHS,
    TIER_TOOLS,
    HarnessPhase,
    HarnessPolicy,
    HarnessPolicyCreate,
    HarnessPolicyListResponse,
    HarnessPolicyUpdate,
    TierBreakdownResponse,
    ToolAccessEvaluation,
    ToolTier,
    ToolTierSummary,
)

logger = logging.getLogger(__name__)


# Default policies per harness type
DEFAULT_POLICIES: Dict[str, HarnessPolicy] = {
    "claude_code": HarnessPolicy(
        policy_id="claude_code_default",
        harness_type="claude_code",
        display_name="Claude Code",
        description="Default policy for Claude Code CLI - full access with standard security paths blocked",
        allowed_tier=ToolTier.FULL,
        allowed_tools=[],  # Use tier defaults
        blocked_tools=[],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=200,
        max_file_size_kb=1000,
        require_human_approval=False,
        approval_required_for=["Bash"],  # Bash requires approval by default
        enabled=True,
    ),
    "kiro": HarnessPolicy(
        policy_id="kiro_default",
        harness_type="kiro",
        display_name="Kiro (AWS)",
        description="Default policy for Kiro IDE/CLI - full access with AWS security controls",
        allowed_tier=ToolTier.FULL,
        allowed_tools=[],
        blocked_tools=[],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=200,
        max_file_size_kb=1000,
        require_human_approval=False,
        approval_required_for=["Bash", "Agent"],
        enabled=True,
    ),
    "codex_cli": HarnessPolicy(
        policy_id="codex_cli_default",
        harness_type="codex_cli",
        display_name="Codex CLI",
        description="Default policy for OpenAI Codex CLI - read-write access",
        allowed_tier=ToolTier.READ_WRITE,
        allowed_tools=[],
        blocked_tools=["Bash", "Agent"],  # No shell/agent access
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=100,
        max_file_size_kb=500,
        require_human_approval=False,
        approval_required_for=[],
        enabled=True,
    ),
    "opencode": HarnessPolicy(
        policy_id="opencode_default",
        harness_type="opencode",
        display_name="OpenCode",
        description="Default policy for OpenCode - read-write with conservative limits",
        allowed_tier=ToolTier.READ_WRITE,
        allowed_tools=[],
        blocked_tools=["Bash", "Agent", "SendMessage"],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=100,
        max_file_size_kb=500,
        require_human_approval=False,
        approval_required_for=["Write"],  # Write requires approval
        enabled=True,
    ),
    "github_copilot": HarnessPolicy(
        policy_id="github_copilot_default",
        harness_type="github_copilot",
        display_name="GitHub Copilot",
        description="Policy for GitHub Copilot - read-only (no direct tool access, completion only)",
        allowed_tier=ToolTier.READ_ONLY,
        allowed_tools=["Glob", "Grep", "Read"],  # Limited tools
        blocked_tools=["Edit", "Write", "Bash", "Agent", "NotebookEdit"],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=50,
        max_file_size_kb=200,
        require_human_approval=False,
        approval_required_for=[],
        enabled=True,
    ),
    "cursor": HarnessPolicy(
        policy_id="cursor_default",
        harness_type="cursor",
        display_name="Cursor",
        description="Policy for Cursor IDE - read-write with approval for writes",
        allowed_tier=ToolTier.READ_WRITE,
        allowed_tools=[],
        blocked_tools=["Bash", "Agent"],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=100,
        max_file_size_kb=500,
        require_human_approval=False,
        approval_required_for=["Write", "Edit"],
        enabled=True,
    ),
    "cody": HarnessPolicy(
        policy_id="cody_default",
        harness_type="cody",
        display_name="Sourcegraph Cody",
        description="Policy for Sourcegraph Cody - read-write with self-hosted option",
        allowed_tier=ToolTier.READ_WRITE,
        allowed_tools=[],
        blocked_tools=["Bash", "Agent"],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=150,
        max_file_size_kb=800,
        require_human_approval=False,
        approval_required_for=[],
        enabled=True,
    ),
    "tabnine": HarnessPolicy(
        policy_id="tabnine_default",
        harness_type="tabnine",
        display_name="Tabnine",
        description="Policy for Tabnine - read-only completion model",
        allowed_tier=ToolTier.READ_ONLY,
        allowed_tools=["Glob", "Grep", "Read"],
        blocked_tools=["Edit", "Write", "Bash", "Agent", "NotebookEdit"],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=50,
        max_file_size_kb=200,
        require_human_approval=False,
        approval_required_for=[],
        enabled=True,
    ),
    # Phase-based discovery policy (read-only for any harness in discovery mode)
    "discovery_phase": HarnessPolicy(
        policy_id="discovery_phase",
        harness_type="discovery_phase",
        display_name="Discovery Phase (Any Harness)",
        description="Read-only policy for discovery/exploration phase - any harness",
        allowed_tier=ToolTier.READ_ONLY,
        allowed_tools=[],
        blocked_tools=["Edit", "Write", "Bash", "Agent", "NotebookEdit"],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=200,
        max_file_size_kb=1000,
        require_human_approval=False,
        approval_required_for=[],
        enabled=True,
    ),
    # Validation phase (adversarial read-only)
    "validation_phase": HarnessPolicy(
        policy_id="validation_phase",
        harness_type="validation_phase",
        display_name="Validation Phase (Any Harness)",
        description="Read-only policy for validation/review phase - adversarial testing",
        allowed_tier=ToolTier.READ_ONLY,
        allowed_tools=["Glob", "Grep", "Read", "WebFetch"],
        blocked_tools=["Edit", "Write", "Bash", "Agent", "NotebookEdit", "SendMessage"],
        allowed_paths=["**"],
        blocked_paths=DEFAULT_BLOCKED_PATHS.copy(),
        max_output_size_kb=100,
        max_file_size_kb=500,
        require_human_approval=False,
        approval_required_for=[],
        enabled=True,
    ),
}


class GovernHarnessPolicyService:
    """Service for managing AI harness tool access policies.

    Integrates PathJail for secure path validation with:
    - Directory traversal protection
    - Symlink escape prevention
    - Pattern-based allow/block lists
    - Violation logging for audit
    """

    def __init__(self, jail_root: Optional[Path] = None):
        # In-memory policy store (in production, this would be DynamoDB/RDS)
        self._policies: Dict[str, HarnessPolicy] = DEFAULT_POLICIES.copy()
        self._custom_policies: Dict[str, HarnessPolicy] = {}

        # Path jails per policy (lazily initialized)
        self._jails: Dict[str, PathJail] = {}
        self._jail_root = jail_root or Path.cwd()

        # Violation tracking for audit
        self._violations: Dict[str, List[JailViolationEvent]] = {}
        self._violation_counts: Dict[str, int] = {}

        # Output caps per policy
        self._output_caps: Dict[str, OutputCapConfig] = {}

    def list_policies(self) -> HarnessPolicyListResponse:
        """List all harness policies (default + custom)."""
        all_policies = list(self._policies.values()) + list(self._custom_policies.values())
        return HarnessPolicyListResponse(
            policies=all_policies,
            total=len(all_policies),
            live=True,
            source="in-memory-policy-store",
            note=None,
        )

    def get_policy(self, harness_type: str, phase: Optional[HarnessPhase] = None) -> Optional[HarnessPolicy]:
        """Get policy for a harness type, optionally adjusted for phase.

        If phase is specified, returns the phase-specific policy (discovery/validation)
        which restricts to read-only regardless of the harness's normal tier.
        """
        # Phase-based policy override
        if phase == HarnessPhase.DISCOVERY:
            return self._policies.get("discovery_phase")
        if phase == HarnessPhase.VALIDATION:
            return self._policies.get("validation_phase")

        # Check custom policies first
        if harness_type in self._custom_policies:
            return self._custom_policies[harness_type]

        # Fall back to defaults
        return self._policies.get(harness_type)

    def get_policy_by_id(self, policy_id: str) -> Optional[HarnessPolicy]:
        """Get a policy by its unique ID."""
        for policy in self._policies.values():
            if policy.policy_id == policy_id:
                return policy
        for policy in self._custom_policies.values():
            if policy.policy_id == policy_id:
                return policy
        return None

    def create_policy(self, request: HarnessPolicyCreate) -> HarnessPolicy:
        """Create a new custom policy."""
        now = datetime.now(timezone.utc).isoformat()
        policy_id = f"{request.harness_type}_custom_{int(datetime.now(timezone.utc).timestamp())}"

        policy = HarnessPolicy(
            policy_id=policy_id,
            harness_type=request.harness_type,
            display_name=request.display_name or request.harness_type,
            description=request.description,
            allowed_tier=request.allowed_tier,
            allowed_tools=request.allowed_tools or [],
            blocked_tools=request.blocked_tools or [],
            allowed_paths=request.allowed_paths or ["**"],
            blocked_paths=request.blocked_paths or DEFAULT_BLOCKED_PATHS.copy(),
            max_output_size_kb=request.max_output_size_kb,
            max_file_size_kb=request.max_file_size_kb,
            require_human_approval=request.require_human_approval,
            approval_required_for=request.approval_required_for or [],
            enabled=True,
            created_at=now,
            updated_at=now,
        )

        self._custom_policies[request.harness_type] = policy
        return policy

    def update_policy(self, harness_type: str, update: HarnessPolicyUpdate) -> Optional[HarnessPolicy]:
        """Update an existing policy (custom or default)."""
        policy = self.get_policy(harness_type)
        if not policy:
            return None

        now = datetime.now(timezone.utc).isoformat()

        # Create updated policy
        updated_data = policy.model_dump()
        update_data = update.model_dump(exclude_none=True)
        updated_data.update(update_data)
        updated_data["updated_at"] = now

        updated_policy = HarnessPolicy(**updated_data)

        # Store as custom policy (overrides default)
        self._custom_policies[harness_type] = updated_policy
        return updated_policy

    def delete_custom_policy(self, harness_type: str) -> bool:
        """Delete a custom policy (revert to default)."""
        if harness_type in self._custom_policies:
            del self._custom_policies[harness_type]
            return True
        return False

    def evaluate_tool_access(
        self,
        harness_type: str,
        tool_name: str,
        target_path: Optional[str] = None,
        phase: Optional[HarnessPhase] = None,
    ) -> ToolAccessEvaluation:
        """Evaluate whether a tool access is allowed for a harness.

        Args:
            harness_type: The harness type (e.g., claude_code, kiro)
            tool_name: The tool being accessed (e.g., Bash, Edit)
            target_path: Optional path being accessed
            phase: Optional phase override (discovery/validation)

        Returns:
            ToolAccessEvaluation with allowed status and reason
        """
        policy = self.get_policy(harness_type, phase)

        if not policy:
            return ToolAccessEvaluation(
                allowed=False,
                reason=f"No policy found for harness type: {harness_type}",
                harness_type=harness_type,
                tool_name=tool_name,
                target_path=target_path,
            )

        if not policy.enabled:
            return ToolAccessEvaluation(
                allowed=False,
                reason=f"Policy for {harness_type} is disabled",
                harness_type=harness_type,
                tool_name=tool_name,
                target_path=target_path,
            )

        # Check if tool is explicitly blocked
        if tool_name in policy.blocked_tools:
            return ToolAccessEvaluation(
                allowed=False,
                reason=f"Tool '{tool_name}' is explicitly blocked by policy",
                harness_type=harness_type,
                tool_name=tool_name,
                target_path=target_path,
                policy_tier=policy.allowed_tier,
            )

        # Determine allowed tools based on tier or explicit list
        if policy.allowed_tools:
            allowed_tools = policy.allowed_tools
        else:
            allowed_tools = TIER_TOOLS.get(policy.allowed_tier, [])

        # Check if tool is in allowed list
        if tool_name not in allowed_tools:
            # Find what tier the tool requires
            tier_required = None
            for tier, tools in TIER_TOOLS.items():
                if tool_name in tools:
                    tier_required = tier
                    break

            return ToolAccessEvaluation(
                allowed=False,
                reason=f"Tool '{tool_name}' requires tier {tier_required.value if tier_required else 'unknown'}, policy allows {policy.allowed_tier.value}",
                harness_type=harness_type,
                tool_name=tool_name,
                target_path=target_path,
                tier_required=tier_required,
                policy_tier=policy.allowed_tier,
            )

        # Check path restrictions if target_path is provided
        if target_path:
            # Check blocked paths
            for blocked_pattern in policy.blocked_paths:
                if fnmatch.fnmatch(target_path, blocked_pattern):
                    return ToolAccessEvaluation(
                        allowed=False,
                        reason=f"Path '{target_path}' matches blocked pattern: {blocked_pattern}",
                        harness_type=harness_type,
                        tool_name=tool_name,
                        target_path=target_path,
                        policy_tier=policy.allowed_tier,
                    )

            # Check allowed paths (if not catch-all)
            if policy.allowed_paths != ["**"]:
                path_allowed = any(
                    fnmatch.fnmatch(target_path, pattern)
                    for pattern in policy.allowed_paths
                )
                if not path_allowed:
                    return ToolAccessEvaluation(
                        allowed=False,
                        reason=f"Path '{target_path}' not in allowed paths",
                        harness_type=harness_type,
                        tool_name=tool_name,
                        target_path=target_path,
                        policy_tier=policy.allowed_tier,
                    )

        # Check if approval is required
        requires_approval = (
            policy.require_human_approval or tool_name in policy.approval_required_for
        )

        return ToolAccessEvaluation(
            allowed=True,
            reason="Access allowed by policy",
            harness_type=harness_type,
            tool_name=tool_name,
            target_path=target_path,
            requires_approval=requires_approval,
            policy_tier=policy.allowed_tier,
        )

    def get_allowed_tools(self, harness_type: str, phase: Optional[HarnessPhase] = None) -> List[str]:
        """Get list of allowed tools for a harness type."""
        policy = self.get_policy(harness_type, phase)
        if not policy or not policy.enabled:
            return []

        if policy.allowed_tools:
            base_tools = policy.allowed_tools
        else:
            base_tools = TIER_TOOLS.get(policy.allowed_tier, [])

        # Remove blocked tools
        return [t for t in base_tools if t not in policy.blocked_tools]

    def get_tier_breakdown(self) -> TierBreakdownResponse:
        """Get breakdown of tools available at each tier."""
        return TierBreakdownResponse(
            tiers=[
                ToolTierSummary(
                    tier=ToolTier.READ_ONLY,
                    label="Read-Only",
                    tools=TIER_TOOLS[ToolTier.READ_ONLY],
                    description="Search and read operations only - no modifications",
                ),
                ToolTierSummary(
                    tier=ToolTier.READ_WRITE,
                    label="Read-Write",
                    tools=TIER_TOOLS[ToolTier.READ_WRITE],
                    description="File read/write operations - can modify code",
                ),
                ToolTierSummary(
                    tier=ToolTier.FULL,
                    label="Full Access",
                    tools=TIER_TOOLS[ToolTier.FULL],
                    description="Full system access including shell and agents",
                ),
            ],
            blocked_paths_default=DEFAULT_BLOCKED_PATHS,
        )

    # =========================================================================
    # PathJail Integration — Secure path validation
    # =========================================================================

    def _get_jail_for_policy(self, policy: HarnessPolicy) -> PathJail:
        """Get or create a PathJail instance for a policy.

        Uses the policy's blocked_paths and allowed_paths for configuration.
        """
        policy_id = policy.policy_id

        if policy_id not in self._jails:
            # Convert fnmatch patterns to PathJail format
            # Note: DEFAULT_BLOCKED_PATHS already use ** prefix
            config = HarnessJailConfig(
                root=self._jail_root,
                allowed_patterns=policy.allowed_paths if policy.allowed_paths != ["**"] else [],
                blocked_patterns=policy.blocked_paths,
                follow_symlinks=True,  # Allow symlinks but verify they stay in jail
            )
            self._jails[policy_id] = config.create_jail()
            logger.debug("Created PathJail for policy: %s", policy_id)

        return self._jails[policy_id]

    def jail_path(
        self,
        harness_type: str,
        path: str,
        phase: Optional[HarnessPhase] = None,
        user_id: Optional[str] = None,
        harness_id: Optional[str] = None,
    ) -> Path:
        """Validate and resolve a path through the policy's PathJail.

        This is the primary security function for path validation.
        Inspired by Visa VVAH's _jail() function.

        Args:
            harness_type: The harness type to get policy for
            path: The path to validate
            phase: Optional phase override
            user_id: Optional user ID for audit logging
            harness_id: Optional harness ID for audit logging

        Returns:
            Resolved safe Path object

        Raises:
            PathJailViolation: If path violates jail rules
        """
        policy = self.get_policy(harness_type, phase)
        if not policy:
            raise PathJailViolation(
                path,
                PathJailViolationType.NOT_ALLOWED,
                f"No policy found for harness type: {harness_type}",
            )

        if not policy.enabled:
            raise PathJailViolation(
                path,
                PathJailViolationType.NOT_ALLOWED,
                f"Policy for {harness_type} is disabled",
            )

        jail = self._get_jail_for_policy(policy)

        try:
            return jail.jail(path, context=f"harness={harness_type}")
        except PathJailViolation as e:
            # Log the violation
            self._log_jail_violation(
                policy_id=policy.policy_id,
                path=path,
                violation_type=e.violation_type,
                user_id=user_id,
                harness_id=harness_id,
                details=str(e),
            )
            raise

    def is_path_allowed(
        self,
        harness_type: str,
        path: str,
        phase: Optional[HarnessPhase] = None,
    ) -> bool:
        """Check if a path is allowed without raising exceptions.

        Args:
            harness_type: The harness type to check against
            path: The path to check
            phase: Optional phase override

        Returns:
            True if path is allowed, False otherwise
        """
        try:
            self.jail_path(harness_type, path, phase)
            return True
        except PathJailViolation:
            return False

    def filter_paths(
        self,
        harness_type: str,
        paths: List[str],
        phase: Optional[HarnessPhase] = None,
    ) -> List[str]:
        """Filter a list of paths to only include allowed ones.

        Args:
            harness_type: The harness type to filter against
            paths: List of paths to filter
            phase: Optional phase override

        Returns:
            List of allowed paths
        """
        return [p for p in paths if self.is_path_allowed(harness_type, p, phase)]

    def filter_paths_with_violations(
        self,
        harness_type: str,
        paths: List[str],
        phase: Optional[HarnessPhase] = None,
    ) -> Tuple[List[str], List[Tuple[str, PathJailViolation]]]:
        """Filter paths and return both allowed paths and violations.

        Args:
            harness_type: The harness type to filter against
            paths: List of paths to filter
            phase: Optional phase override

        Returns:
            Tuple of (allowed_paths, list of (path, violation) tuples)
        """
        allowed: List[str] = []
        violations: List[Tuple[str, PathJailViolation]] = []

        policy = self.get_policy(harness_type, phase)
        if not policy or not policy.enabled:
            # All paths are violations if no valid policy
            for path in paths:
                violations.append((path, PathJailViolation(
                    path,
                    PathJailViolationType.NOT_ALLOWED,
                    f"No valid policy for harness: {harness_type}",
                )))
            return allowed, violations

        jail = self._get_jail_for_policy(policy)

        for path in paths:
            try:
                jail.jail(path)
                allowed.append(path)
            except PathJailViolation as e:
                violations.append((path, e))
                self._log_jail_violation(
                    policy_id=policy.policy_id,
                    path=path,
                    violation_type=e.violation_type,
                )

        return allowed, violations

    def _log_jail_violation(
        self,
        policy_id: str,
        path: str,
        violation_type: PathJailViolationType,
        user_id: Optional[str] = None,
        harness_id: Optional[str] = None,
        details: str = "",
    ) -> None:
        """Log a jail violation for audit purposes."""
        event = JailViolationEvent(
            timestamp=datetime.now(timezone.utc),
            path=path,
            violation_type=violation_type,
            jail_root=str(self._jail_root),
            policy_id=policy_id,
            user_id=user_id,
            harness_id=harness_id,
            details=details,
        )

        # Initialize tracking if needed
        if policy_id not in self._violations:
            self._violations[policy_id] = []
            self._violation_counts[policy_id] = 0

        self._violations[policy_id].append(event)
        self._violation_counts[policy_id] += 1

        # Keep only recent violations in memory (last 1000)
        if len(self._violations[policy_id]) > 1000:
            self._violations[policy_id] = self._violations[policy_id][-500:]

        logger.warning(
            "Jail violation [%s]: type=%s path=%s",
            policy_id,
            violation_type.value,
            path,
        )

    def get_jail_violations(
        self,
        policy_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[JailViolationEvent]:
        """Get recent jail violations, optionally filtered by policy.

        Args:
            policy_id: Optional policy ID to filter by
            limit: Maximum violations to return

        Returns:
            List of violation events, most recent first
        """
        if policy_id:
            violations = self._violations.get(policy_id, [])
        else:
            # Combine all violations
            violations = []
            for policy_violations in self._violations.values():
                violations.extend(policy_violations)
            # Sort by timestamp descending
            violations.sort(key=lambda v: v.timestamp, reverse=True)

        return violations[:limit]

    def get_jail_violation_stats(self, policy_id: str) -> Dict:
        """Get violation statistics for a policy.

        Returns:
            Dict with violation counts and breakdown by type
        """
        violations = self._violations.get(policy_id, [])
        total = self._violation_counts.get(policy_id, 0)

        by_type: Dict[str, int] = {}
        for v in violations:
            by_type[v.violation_type.value] = by_type.get(v.violation_type.value, 0) + 1

        return {
            "policy_id": policy_id,
            "total_violations": total,
            "by_type": by_type,
            "recent_count": len(violations),
            "last_violation_at": violations[-1].timestamp.isoformat() if violations else None,
        }

    def get_blocked_paths_for_policy(self, harness_type: str) -> List[str]:
        """Get blocked path patterns for a harness policy (for UI display)."""
        policy = self.get_policy(harness_type)
        if not policy:
            return DEFAULT_BLOCKED_PATHS.copy()
        return policy.blocked_paths

    def reset_jail_violation_count(self, policy_id: str) -> None:
        """Reset violation count for a policy (after admin review)."""
        if policy_id in self._violation_counts:
            self._violation_counts[policy_id] = 0
            logger.info("Reset jail violation count for policy: %s", policy_id)

    # =========================================================================
    # Output Caps Integration
    # =========================================================================

    def get_output_caps(self, harness_type: str) -> OutputCapConfig:
        """Get output cap configuration for a harness type."""
        policy = self.get_policy(harness_type)
        if not policy:
            return DEFAULT_CAPS

        policy_id = policy.policy_id
        if policy_id not in self._output_caps:
            self._output_caps[policy_id] = OutputCapConfig(
                max_read_size_kb=policy.max_output_size_kb,
                max_grep_matches=200,  # Default
                max_glob_results=500,  # Default
                max_output_lines=1000,  # Default
                max_list_items=500,  # Default
            )

        return self._output_caps[policy_id]
