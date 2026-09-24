"""Govern Harness Backend Service — Backend-specific sandboxing for AI harnesses.

Provides functionality to:
1. Get backend capabilities
2. Validate tool operations against backend restrictions
3. Detect backend type from userAgent patterns
4. Compute effective tools (intersection of backend + harness policy)
"""

import logging
import re
from typing import List, Optional, Tuple

from models.govern_harness_backend import (
    BACKEND_DEFAULTS,
    BACKEND_DETECTION_RULES,
    STANDARD_TOOLS,
    BackendAssignment,
    BackendCapabilities,
    BackendCapabilitiesResponse,
    BackendComparisonResponse,
    BackendToolsResponse,
    BackendToolValidation,
    HarnessBackend,
)

logger = logging.getLogger(__name__)


class GovernHarnessBackendService:
    """Service for managing backend-specific sandboxing."""

    def __init__(self):
        # Cache for custom backend configurations
        self._custom_configs: dict[HarnessBackend, BackendCapabilities] = {}
        # Cache for harness-to-backend assignments
        self._assignments: dict[str, BackendAssignment] = {}

    def get_all_backends(self) -> BackendCapabilitiesResponse:
        """Get capabilities for all backends."""
        backends = []
        for backend_type in HarnessBackend:
            capabilities = self._custom_configs.get(backend_type) or BACKEND_DEFAULTS.get(backend_type)
            if capabilities:
                backends.append(capabilities)
        return BackendCapabilitiesResponse(
            backends=backends,
            standard_tools=STANDARD_TOOLS,
        )

    def get_backend_capabilities(self, backend: HarnessBackend) -> BackendCapabilities:
        """Get capabilities for a specific backend."""
        # Check for custom config first
        if backend in self._custom_configs:
            return self._custom_configs[backend]
        # Fall back to defaults
        if backend in BACKEND_DEFAULTS:
            return BACKEND_DEFAULTS[backend]
        # Unknown backend - return restrictive defaults
        return BackendCapabilities(
            backend=backend,
            allowed_tools=["Read", "Glob", "Grep"],
            blocked_tools=["Write", "Edit", "Bash", "Agent"],
            can_write=False,
            can_execute=False,
            max_context_tokens=128000,
            supports_streaming=True,
            supports_tool_use=True,
            requires_human_approval_for=[],
            supports_mcp=False,
            supports_agents=False,
        )

    def get_backend_tools(self, backend: HarnessBackend) -> BackendToolsResponse:
        """Get allowed tools for a specific backend."""
        capabilities = self.get_backend_capabilities(backend)
        return BackendToolsResponse(
            backend=backend,
            allowed_tools=capabilities.allowed_tools,
            blocked_tools=capabilities.blocked_tools,
            requires_approval=capabilities.requires_human_approval_for,
        )

    def is_tool_allowed(self, backend: HarnessBackend, tool_name: str) -> bool:
        """Check if a tool is allowed for a backend."""
        capabilities = self.get_backend_capabilities(backend)
        # Explicitly blocked tools
        if tool_name in capabilities.blocked_tools:
            return False
        # Must be in allowed list
        return tool_name in capabilities.allowed_tools

    def get_effective_tools(
        self,
        backend: HarnessBackend,
        harness_allowed_tools: Optional[List[str]] = None,
        harness_blocked_tools: Optional[List[str]] = None,
    ) -> List[str]:
        """Get effective tools - intersection of backend + harness policy.

        Args:
            backend: The backend type
            harness_allowed_tools: Tools allowed by the harness policy (if any)
            harness_blocked_tools: Tools blocked by the harness policy (if any)

        Returns:
            List of tool names that are effectively allowed
        """
        capabilities = self.get_backend_capabilities(backend)

        # Start with backend's allowed tools
        effective = set(capabilities.allowed_tools)

        # Remove backend's blocked tools
        effective -= set(capabilities.blocked_tools)

        # Intersect with harness allowed tools if specified
        if harness_allowed_tools:
            effective &= set(harness_allowed_tools)

        # Remove harness blocked tools if specified
        if harness_blocked_tools:
            effective -= set(harness_blocked_tools)

        return sorted(list(effective))

    def validate_operation(
        self,
        backend: HarnessBackend,
        tool_name: str,
        is_write: bool = False,
    ) -> BackendToolValidation:
        """Validate whether a tool operation is allowed for a backend.

        Args:
            backend: The backend type
            tool_name: The tool being used
            is_write: Whether this is a write operation

        Returns:
            Validation result with allowed status and reason
        """
        capabilities = self.get_backend_capabilities(backend)

        # Check if tool is explicitly blocked
        if tool_name in capabilities.blocked_tools:
            return BackendToolValidation(
                allowed=False,
                reason=f"Tool '{tool_name}' is blocked for {backend.value} backend",
                requires_approval=False,
            )

        # Check if tool is in allowed list
        if tool_name not in capabilities.allowed_tools:
            return BackendToolValidation(
                allowed=False,
                reason=f"Tool '{tool_name}' is not in allowed list for {backend.value} backend",
                requires_approval=False,
            )

        # Check write capability
        if is_write and not capabilities.can_write:
            return BackendToolValidation(
                allowed=False,
                reason=f"{backend.value} backend does not support write operations",
                requires_approval=False,
            )

        # Check execution capability for Bash
        if tool_name == "Bash" and not capabilities.can_execute:
            return BackendToolValidation(
                allowed=False,
                reason=f"{backend.value} backend does not support shell execution",
                requires_approval=False,
            )

        # Check if approval is required
        requires_approval = tool_name in capabilities.requires_human_approval_for

        return BackendToolValidation(
            allowed=True,
            reason="",
            requires_approval=requires_approval,
        )

    def detect_backend_from_user_agent(self, user_agent: str) -> Tuple[HarnessBackend, int]:
        """Detect backend type from userAgent string.

        Args:
            user_agent: The userAgent string from the request

        Returns:
            Tuple of (detected backend, confidence score 0-100)
        """
        if not user_agent:
            return HarnessBackend.SDK, 0  # Default to SDK with low confidence

        ua_lower = user_agent.lower()

        # Sort rules by priority (highest first)
        sorted_rules = sorted(
            BACKEND_DETECTION_RULES,
            key=lambda r: r.priority,
            reverse=True,
        )

        for rule in sorted_rules:
            if rule.pattern.lower() in ua_lower:
                # Confidence based on pattern specificity
                confidence = min(rule.priority, 100)
                return rule.backend, confidence

        # No match - default to SDK
        return HarnessBackend.SDK, 10

    def get_backend_comparison(self) -> BackendComparisonResponse:
        """Get a comparison matrix of all backends."""
        backends = []
        tool_matrix: dict[str, dict[str, str]] = {}

        for backend_type in HarnessBackend:
            capabilities = self.get_backend_capabilities(backend_type)
            backends.append(capabilities)

            # Build tool matrix
            for tool in STANDARD_TOOLS:
                if tool not in tool_matrix:
                    tool_matrix[tool] = {}

                if tool in capabilities.blocked_tools:
                    tool_matrix[tool][backend_type.value] = "blocked"
                elif tool in capabilities.requires_human_approval_for:
                    tool_matrix[tool][backend_type.value] = "approval"
                elif tool in capabilities.allowed_tools:
                    tool_matrix[tool][backend_type.value] = "allowed"
                else:
                    tool_matrix[tool][backend_type.value] = "not_available"

        return BackendComparisonResponse(
            backends=backends,
            tool_matrix=tool_matrix,
        )

    def assign_backend_to_harness(
        self,
        harness_id: str,
        backend: HarnessBackend,
        custom_allowed_tools: Optional[List[str]] = None,
        custom_blocked_tools: Optional[List[str]] = None,
        assigned_by: Optional[str] = None,
    ) -> BackendAssignment:
        """Assign a backend to a harness instance.

        Args:
            harness_id: The harness instance ID
            backend: The backend type to assign
            custom_allowed_tools: Override allowed tools
            custom_blocked_tools: Additional tools to block
            assigned_by: User making the assignment

        Returns:
            The created assignment
        """
        from datetime import datetime, timezone

        assignment = BackendAssignment(
            harness_id=harness_id,
            backend=backend,
            custom_allowed_tools=custom_allowed_tools,
            custom_blocked_tools=custom_blocked_tools,
            assigned_by=assigned_by,
            assigned_at=datetime.now(timezone.utc).isoformat(),
        )

        self._assignments[harness_id] = assignment
        return assignment

    def get_harness_assignment(self, harness_id: str) -> Optional[BackendAssignment]:
        """Get the backend assignment for a harness."""
        return self._assignments.get(harness_id)

    def get_harness_effective_capabilities(
        self,
        harness_id: str,
        detected_user_agent: Optional[str] = None,
    ) -> BackendCapabilities:
        """Get effective capabilities for a harness instance.

        Uses assignment if exists, otherwise detects from userAgent.
        """
        # Check for explicit assignment
        assignment = self._assignments.get(harness_id)
        if assignment:
            capabilities = self.get_backend_capabilities(assignment.backend)

            # Apply custom overrides
            if assignment.custom_allowed_tools:
                capabilities = capabilities.model_copy(update={
                    "allowed_tools": assignment.custom_allowed_tools,
                })
            if assignment.custom_blocked_tools:
                # Merge custom blocked with default blocked
                merged_blocked = list(set(capabilities.blocked_tools) | set(assignment.custom_blocked_tools))
                capabilities = capabilities.model_copy(update={
                    "blocked_tools": merged_blocked,
                })

            return capabilities

        # Detect from userAgent
        if detected_user_agent:
            backend, _ = self.detect_backend_from_user_agent(detected_user_agent)
            return self.get_backend_capabilities(backend)

        # Default to SDK (most restrictive common case)
        return self.get_backend_capabilities(HarnessBackend.SDK)
