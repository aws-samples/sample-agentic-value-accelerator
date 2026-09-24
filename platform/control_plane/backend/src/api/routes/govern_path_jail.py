"""Govern Path Jail API — Rule management for harness path security.

Provides endpoints to manage path jailing rules that prevent unauthorized
file access by AI harnesses (Claude Code, MCP servers, Bedrock agents).

Endpoints:
- GET /govern/path-jail/rules - list all rules
- POST /govern/path-jail/rules - create rule
- PUT /govern/path-jail/rules/{id} - update rule
- DELETE /govern/path-jail/rules/{id} - delete rule
- POST /govern/path-jail/test - test a path against rules
- GET /govern/path-jail/violations - recent violations
- GET /govern/path-jail/default-patterns - built-in blocked patterns
"""

import logging
import re
import uuid
from datetime import datetime, timezone
from enum import Enum
from fnmatch import fnmatch
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import region_scope
from core.path_jail import check_traversal
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/path-jail", tags=["govern-path-jail"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_path_jail", region_scope.CONTROL_PLANE, prefix="/govern/path-jail")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class PatternType(str, Enum):
    """Pattern matching type for path rules."""
    GLOB = "glob"
    REGEX = "regex"
    EXACT = "exact"


class RuleScope(str, Enum):
    """Scope of a path jail rule."""
    GLOBAL = "global"
    HARNESS = "harness"


class PathJailRule(BaseModel):
    """A path jailing rule."""
    id: str = Field(description="Unique rule identifier")
    pattern: str = Field(description="Path pattern to match")
    pattern_type: PatternType = Field(default=PatternType.GLOB, description="Pattern matching type")
    description: str = Field(default="", description="Human-readable description")
    scope: RuleScope = Field(default=RuleScope.GLOBAL, description="Rule scope")
    harness_types: List[str] = Field(default_factory=list, description="Harness types if scope is 'harness'")
    enabled: bool = Field(default=True, description="Whether rule is active")
    is_default: bool = Field(default=False, description="Whether this is a built-in rule")
    created_at: str = Field(description="Creation timestamp (ISO 8601)")
    updated_at: Optional[str] = Field(default=None, description="Last update timestamp")


class PathJailRuleCreate(BaseModel):
    """Request to create a new path jail rule."""
    pattern: str = Field(description="Path pattern to match")
    pattern_type: PatternType = Field(default=PatternType.GLOB, description="Pattern matching type")
    description: str = Field(default="", description="Human-readable description")
    scope: RuleScope = Field(default=RuleScope.GLOBAL, description="Rule scope")
    harness_types: List[str] = Field(default_factory=list, description="Harness types if scope is 'harness'")
    enabled: bool = Field(default=True, description="Whether rule is active")


class PathJailRuleUpdate(BaseModel):
    """Request to update a path jail rule."""
    pattern: Optional[str] = Field(default=None, description="Path pattern to match")
    pattern_type: Optional[PatternType] = Field(default=None, description="Pattern matching type")
    description: Optional[str] = Field(default=None, description="Human-readable description")
    scope: Optional[RuleScope] = Field(default=None, description="Rule scope")
    harness_types: Optional[List[str]] = Field(default=None, description="Harness types if scope is 'harness'")
    enabled: Optional[bool] = Field(default=None, description="Whether rule is active")


class PathJailRulesResponse(BaseModel):
    """Response containing all path jail rules."""
    rules: List[PathJailRule]
    total: int
    default_count: int
    custom_count: int


class PathTestRequest(BaseModel):
    """Request to test a path against rules."""
    path: str = Field(description="Path to test")
    harness_type: Optional[str] = Field(default=None, description="Harness type for context")


class PathTestResult(BaseModel):
    """Result of testing a path against rules."""
    path: str
    would_be_blocked: bool
    matching_rules: List[PathJailRule]
    reason: str


class PatternTestRequest(BaseModel):
    """Request to test a single pattern against a single path (rule preview)."""
    path: str = Field(description="Path to test")
    pattern: str = Field(description="Pattern to test the path against")
    pattern_type: PatternType = Field(default=PatternType.GLOB, description="Pattern matching type")


class PatternTestResult(BaseModel):
    """Result of testing one pattern against one path.

    Deliberately not a PathTestResult: `matched` answers "does this pattern match", which is
    a narrower question than "would the jail block this". A path can match no pattern and
    still be refused - traversal and absolute paths are refused before rules are consulted -
    so reusing `would_be_blocked` here would overstate what was checked.
    """
    path: str
    pattern: str
    pattern_type: PatternType
    matched: bool
    reason: str


class ViolationType(str, Enum):
    """Types of path jail violations."""
    TRAVERSAL_ATTACK = "traversal_attack"
    SYMLINK_ESCAPE = "symlink_escape"
    ABSOLUTE_OUTSIDE = "absolute_outside"
    BLOCKED_PATTERN = "blocked_pattern"
    NOT_ALLOWED = "not_allowed"


class PathJailViolation(BaseModel):
    """A recorded path jail violation."""
    id: str
    timestamp: str
    path: str
    harness_type: str
    user_identity: str
    violation_type: ViolationType
    matched_rule_id: Optional[str] = None
    matched_pattern: Optional[str] = None
    details: str


class ViolationsResponse(BaseModel):
    """Response containing recent violations."""
    violations: List[PathJailViolation]
    total: int


class DefaultPatternsResponse(BaseModel):
    """Response containing default blocked patterns."""
    patterns: List[dict]
    total: int


# ---------------------------------------------------------------------------
# In-memory store (production would use database)
# ---------------------------------------------------------------------------

# Default blocked patterns from core/path_jail.py HarnessJailConfig
DEFAULT_BLOCKED_PATTERNS = [
    {"pattern": "**/secrets/**", "description": "Secrets directory"},
    {"pattern": "**/.env", "description": "Environment file (root)"},
    {"pattern": "**/.env.*", "description": "Environment file variants"},
    {"pattern": "**/*.env", "description": "Any .env file"},
    {"pattern": "**/credentials*", "description": "Credentials files"},
    {"pattern": "**/*credential*", "description": "Files with 'credential' in name"},
    {"pattern": "**/*secret*", "description": "Files with 'secret' in name"},
    {"pattern": "**/private_key*", "description": "Private key files"},
    {"pattern": "**/*.pem", "description": "PEM certificate/key files"},
    {"pattern": "**/*.key", "description": "Key files"},
    {"pattern": "**/id_rsa*", "description": "RSA SSH keys"},
    {"pattern": "**/id_ed25519*", "description": "Ed25519 SSH keys"},
    {"pattern": "**/.aws/**", "description": "AWS credentials directory"},
    {"pattern": "**/.ssh/**", "description": "SSH configuration directory"},
    {"pattern": "**/.gnupg/**", "description": "GnuPG keyring directory"},
    {"pattern": "**/node_modules/**", "description": "Node.js dependencies"},
    {"pattern": "**/__pycache__/**", "description": "Python bytecode cache"},
    {"pattern": "**/.git/**", "description": "Git repository internals"},
]

# Convert defaults to PathJailRule objects
_default_rules: List[PathJailRule] = [
    PathJailRule(
        id=f"default-{i:03d}",
        pattern=p["pattern"],
        pattern_type=PatternType.GLOB,
        description=p["description"],
        scope=RuleScope.GLOBAL,
        harness_types=[],
        enabled=True,
        is_default=True,
        created_at="2024-01-01T00:00:00Z",
    )
    for i, p in enumerate(DEFAULT_BLOCKED_PATTERNS)
]

# Custom rules (in-memory for demo, would be persisted in production)
_custom_rules: List[PathJailRule] = [
    PathJailRule(
        id="custom-001",
        pattern="**/terraform.tfstate*",
        pattern_type=PatternType.GLOB,
        description="Terraform state files (may contain sensitive data)",
        scope=RuleScope.GLOBAL,
        harness_types=[],
        enabled=True,
        is_default=False,
        created_at="2026-07-15T10:30:00Z",
    ),
    PathJailRule(
        id="custom-002",
        pattern="**/kubeconfig*",
        pattern_type=PatternType.GLOB,
        description="Kubernetes configuration files",
        scope=RuleScope.GLOBAL,
        harness_types=[],
        enabled=True,
        is_default=False,
        created_at="2026-07-20T14:15:00Z",
    ),
    PathJailRule(
        id="custom-003",
        pattern="**/config/production/**",
        pattern_type=PatternType.GLOB,
        description="Production configuration directory",
        scope=RuleScope.HARNESS,
        harness_types=["claude-code", "kiro-ide"],
        enabled=True,
        is_default=False,
        created_at="2026-07-22T09:00:00Z",
    ),
]

# Sample violations for demo
_violations: List[PathJailViolation] = [
    PathJailViolation(
        id="v-001",
        timestamp="2026-08-03T14:32:15Z",
        path="../../../etc/passwd",
        harness_type="claude-code",
        user_identity="developer@example.com",
        violation_type=ViolationType.TRAVERSAL_ATTACK,
        matched_rule_id=None,
        matched_pattern=None,
        details="Directory traversal attempt detected: '..' component in path",
    ),
    PathJailViolation(
        id="v-002",
        timestamp="2026-08-03T14:28:42Z",
        path="/home/user/.aws/credentials",
        harness_type="mcp-server",
        user_identity="analyst@example.com",
        violation_type=ViolationType.BLOCKED_PATTERN,
        matched_rule_id="default-013",
        matched_pattern="**/.aws/**",
        details="Path matches blocked pattern for AWS credentials directory",
    ),
    PathJailViolation(
        id="v-003",
        timestamp="2026-08-03T13:45:00Z",
        path="config/.env.production",
        harness_type="claude-code",
        user_identity="ops@example.com",
        violation_type=ViolationType.BLOCKED_PATTERN,
        matched_rule_id="default-002",
        matched_pattern="**/.env.*",
        details="Path matches blocked pattern for environment file variants",
    ),
    PathJailViolation(
        id="v-004",
        timestamp="2026-08-03T12:15:33Z",
        path="terraform/prod/terraform.tfstate",
        harness_type="kiro-ide",
        user_identity="infra@example.com",
        violation_type=ViolationType.BLOCKED_PATTERN,
        matched_rule_id="custom-001",
        matched_pattern="**/terraform.tfstate*",
        details="Path matches custom blocked pattern for Terraform state",
    ),
    PathJailViolation(
        id="v-005",
        timestamp="2026-08-03T11:50:22Z",
        path="/opt/secrets/api-keys.json",
        harness_type="bedrock-agent",
        user_identity="service-account",
        violation_type=ViolationType.BLOCKED_PATTERN,
        matched_rule_id="default-000",
        matched_pattern="**/secrets/**",
        details="Path matches blocked pattern for secrets directory",
    ),
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _get_all_rules() -> List[PathJailRule]:
    """Get all rules (default + custom)."""
    return _default_rules + _custom_rules


def _glob_to_regex(pattern: str) -> str:
    """Translate a glob pattern to an anchored regex, one token at a time.

    Written as a single left-to-right scan rather than a sequence of str.replace calls,
    because chained replaces rewrite their own output. The previous implementation did
    exactly that and matched NOTHING - every pattern in the default rule set, including
    `**/.env`, failed against the path it names. Three separate collisions, each enough
    on its own:

      - the escape loop ran over '.[](){}+^$|\\' in order, so escaping `.` inserted a
        backslash and the LATER pass over `\\` doubled it. `**/.env` acquired `\\.`,
        a regex demanding a literal backslash before "env".
      - `'*' -> '[^/]*'` then rewrote the `*` inside the `(?:.*/)?` that the preceding
        `'**/'` step had just produced.
      - `'?' -> '[^/]'` then rewrote both `?` in that same fragment, turning `(?:` into
        `([^/]:` and dropping the group's trailing `?`.

    `**/.env` compiled to `^([^/]:.[^/]*/)[^/]\\.env$`. It is not a near miss; the
    endpoint answered "Path is allowed - no blocking rules match" for every input it
    was ever given, which is the most reassuring possible wrong answer for a tool whose
    entire job is to tell an operator what would be blocked.

    Semantics: `**/` is zero or more leading directory components (so `**/.env` matches
    both `.env` and `a/b/.env`), a bare `**` crosses separators, `*` and `?` do not.
    Everything else is a literal, via re.escape rather than a hand-kept char list.
    """
    out: List[str] = []
    i, n = 0, len(pattern)
    while i < n:
        if pattern.startswith("**/", i):
            # Zero or more directory components. `(?:[^/]+/)*` matches the empty string,
            # which is why `**/.env` matches a bare `.env` - a leading-`**/` pattern is
            # conventionally understood as "at any depth, including none".
            out.append("(?:[^/]+/)*")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return "^" + "".join(out) + "$"


def _matches_pattern(path: str, pattern: str, pattern_type: PatternType) -> bool:
    """Check if a path matches a pattern."""
    # Normalize path separators. The PATH only - see the REGEX arm.
    normalized_path = path.replace("\\", "/")
    normalized_pattern = pattern.replace("\\", "/")

    if pattern_type == PatternType.EXACT:
        return normalized_path == normalized_pattern or normalized_path.lower() == normalized_pattern.lower()

    elif pattern_type == PatternType.REGEX:
        try:
            # `pattern`, not `normalized_pattern`: in a regex a backslash is an escape
            # character, not a separator. Rewriting it to "/" turned `src/.*\.py` into
            # `src/.*/.py` and every `\.` `\d` `\w` `\s` `\(` in an operator's rule into
            # something else - so a REGEX-type rule quietly stopped matching the paths it
            # was written for. Windows separators inside a regex rule are written `\\` or
            # `[/\\]` by the author, which survives this arm intact.
            return bool(re.match(pattern, normalized_path, re.IGNORECASE))
        except re.error:
            return False

    else:  # GLOB (default)
        try:
            # re.IGNORECASE rather than .lower() on both sides: lowercasing the pattern
            # before escaping is what made the old code's casing interact with its
            # escaping at all.
            return bool(re.match(_glob_to_regex(normalized_pattern), normalized_path, re.IGNORECASE))
        except re.error:
            # A glob cannot produce an invalid regex now that literals go through
            # re.escape, but a malformed pattern must still fail closed-ish rather than
            # 500 the request. fnmatch has no `**` concept, so it is a weaker answer, not
            # an equivalent one - hence the log.
            logger.warning("Glob pattern %r did not compile; falling back to fnmatch.", pattern)
            return fnmatch(normalized_path.lower(), normalized_pattern.lower())


def _test_path_against_rules(
    path: str,
    harness_type: Optional[str] = None,
) -> PathTestResult:
    """Predict what `core.path_jail.PathJail` would do with `path`.

    Two kinds of block, checked in the same order the enforcer checks them:

    1. Structural - traversal, or an absolute path. These are decided by the shape of the
       path itself and are refused before any rule is consulted, so a pattern list that
       mentions nothing about `..` still does not make `../../etc/passwd` allowed. Reported
       here because this endpoint previously answered "Path is allowed - no blocking rules
       match" for exactly those payloads: true as stated about the rules, and the opposite
       of what enforcement does.
    2. Pattern - one of the configured rules matches.

    The absolute-path arm is the one place this cannot be exact. The enforcer permits an
    absolute path that resolves *inside* the jail root; this endpoint is not given a root,
    so it says "blocked" and names the condition in the reason rather than guessing a root
    or - worse - reporting "allowed" for a path that will usually be refused.
    """
    matching_rules: List[PathJailRule] = []

    traversal = check_traversal(path)
    if traversal:
        return PathTestResult(
            path=path,
            would_be_blocked=True,
            matching_rules=[],
            reason=(
                f"Blocked before rules are consulted: directory traversal ('{traversal}'). "
                "The jail refuses this regardless of which patterns are configured."
            ),
        )

    # `Path(...).is_absolute()`, the identical call `PathJail.jail` makes at its step 2, run
    # in the same interpreter on the same OS - so the two cannot answer differently. Worth
    # noting the answer is platform-dependent: on this Linux control plane "C:/Windows" is a
    # relative path named "C:", and reporting it that way is correct precisely because that
    # is how enforcement will treat it too.
    if Path(path).is_absolute():
        return PathTestResult(
            path=path,
            would_be_blocked=True,
            matching_rules=[],
            reason=(
                "Blocked before rules are consulted: absolute path. The jail allows an "
                "absolute path only when it resolves inside the jail root, which this test "
                "does not know - so treat this as blocked unless the path is inside the "
                "harness workspace."
            ),
        )

    for rule in _get_all_rules():
        if not rule.enabled:
            continue

        # Check harness scope
        if rule.scope == RuleScope.HARNESS:
            if harness_type and harness_type not in rule.harness_types:
                continue
            if not harness_type:
                continue

        # Check pattern match
        if _matches_pattern(path, rule.pattern, rule.pattern_type):
            matching_rules.append(rule)

    would_be_blocked = len(matching_rules) > 0

    if would_be_blocked:
        reasons = [f"'{r.pattern}' ({r.description or 'no description'})" for r in matching_rules[:3]]
        reason = f"Blocked by {len(matching_rules)} rule(s): " + ", ".join(reasons)
        if len(matching_rules) > 3:
            reason += f" and {len(matching_rules) - 3} more"
    else:
        reason = "Path is allowed - no blocking rules match"

    return PathTestResult(
        path=path,
        would_be_blocked=would_be_blocked,
        matching_rules=matching_rules,
        reason=reason,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/rules", response_model=PathJailRulesResponse)
async def list_rules(
    include_disabled: bool = Query(False, description="Include disabled rules"),
    _=Depends(require_role(Role.VIEWER)),
):
    """List all path jail rules (default + custom).

    Returns all rules sorted by: defaults first, then custom by creation date.
    """
    all_rules = _get_all_rules()

    if not include_disabled:
        all_rules = [r for r in all_rules if r.enabled]

    default_count = len([r for r in all_rules if r.is_default])
    custom_count = len([r for r in all_rules if not r.is_default])

    return PathJailRulesResponse(
        rules=all_rules,
        total=len(all_rules),
        default_count=default_count,
        custom_count=custom_count,
    )


@router.post("/rules", response_model=PathJailRule)
async def create_rule(
    request: PathJailRuleCreate,
    _=Depends(require_role(Role.ADMIN)),
):
    """Create a new custom path jail rule.

    Default rules cannot be created via API; they are built-in.
    """
    now = datetime.now(timezone.utc).isoformat()
    rule = PathJailRule(
        id=f"custom-{uuid.uuid4().hex[:8]}",
        pattern=request.pattern,
        pattern_type=request.pattern_type,
        description=request.description,
        scope=request.scope,
        harness_types=request.harness_types,
        enabled=request.enabled,
        is_default=False,
        created_at=now,
    )
    _custom_rules.append(rule)
    logger.info(f"Created path jail rule: {rule.id} pattern={rule.pattern}")
    return rule


@router.get("/rules/{rule_id}", response_model=PathJailRule)
async def get_rule(
    rule_id: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get a specific rule by ID."""
    for rule in _get_all_rules():
        if rule.id == rule_id:
            return rule
    raise HTTPException(status_code=404, detail=f"Rule not found: {rule_id}")


@router.put("/rules/{rule_id}", response_model=PathJailRule)
async def update_rule(
    rule_id: str,
    update: PathJailRuleUpdate,
    _=Depends(require_role(Role.ADMIN)),
):
    """Update a path jail rule.

    Default rules can only have their 'enabled' status changed.
    Custom rules can be fully modified.
    """
    now = datetime.now(timezone.utc).isoformat()

    # Check default rules first
    for rule in _default_rules:
        if rule.id == rule_id:
            # Default rules: only allow toggling enabled
            if update.enabled is not None:
                rule.enabled = update.enabled
                rule.updated_at = now
                logger.info(f"Toggled default rule {rule_id} enabled={rule.enabled}")
                return rule
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Default rules can only have their enabled status changed"
                )

    # Check custom rules
    for rule in _custom_rules:
        if rule.id == rule_id:
            if update.pattern is not None:
                rule.pattern = update.pattern
            if update.pattern_type is not None:
                rule.pattern_type = update.pattern_type
            if update.description is not None:
                rule.description = update.description
            if update.scope is not None:
                rule.scope = update.scope
            if update.harness_types is not None:
                rule.harness_types = update.harness_types
            if update.enabled is not None:
                rule.enabled = update.enabled
            rule.updated_at = now
            logger.info(f"Updated custom rule {rule_id}")
            return rule

    raise HTTPException(status_code=404, detail=f"Rule not found: {rule_id}")


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    _=Depends(require_role(Role.ADMIN)),
):
    """Delete a custom path jail rule.

    Default rules cannot be deleted; they can only be disabled.
    """
    # Check if it's a default rule
    for rule in _default_rules:
        if rule.id == rule_id:
            raise HTTPException(
                status_code=400,
                detail="Default rules cannot be deleted. Use PUT to disable instead."
            )

    # Find and remove custom rule
    for i, rule in enumerate(_custom_rules):
        if rule.id == rule_id:
            del _custom_rules[i]
            logger.info(f"Deleted custom rule: {rule_id}")
            return {"status": "deleted", "rule_id": rule_id}

    raise HTTPException(status_code=404, detail=f"Rule not found: {rule_id}")


@router.post("/test", response_model=PathTestResult)
async def test_path(
    request: PathTestRequest,
    _=Depends(require_role(Role.VIEWER)),
):
    """Test a path against all active rules.

    Returns whether the path would be blocked and which rules match.
    """
    return _test_path_against_rules(request.path, request.harness_type)


@router.post("/test-pattern", response_model=PatternTestResult)
async def test_pattern(
    request: PatternTestRequest,
    _=Depends(require_role(Role.VIEWER)),
):
    """Test one pattern against one path, for previewing a rule that does not exist yet.

    Separate from POST /test because the rule being previewed is not in the store: the
    author is still typing it. The Add Rule form used to answer this in the browser with
    `path.includes(pattern.replace(/\\*/g, ''))`, which is not glob matching and disagreed
    with this service both ways - it called `**/*secret*` a non-match for `config/x.yaml`
    (correct by luck) and `**/.env` a match for `notes-env.md` (wrong). Answering here
    means the preview and the enforcement path run the same `_matches_pattern`.

    Structural blocks are deliberately NOT applied: the question asked is only "does this
    pattern match this path", and the caller is shown the traversal/absolute rules by
    POST /test.
    """
    matched = _matches_pattern(request.path, request.pattern, request.pattern_type)
    if matched:
        reason = f"Matches pattern '{request.pattern}'"
    else:
        reason = f"Does not match pattern '{request.pattern}'"
    return PatternTestResult(
        path=request.path,
        pattern=request.pattern,
        pattern_type=request.pattern_type,
        matched=matched,
        reason=reason,
    )


@router.get("/violations", response_model=ViolationsResponse)
async def get_violations(
    limit: int = Query(10, ge=1, le=100, description="Number of violations to return"),
    harness_type: Optional[str] = Query(None, description="Filter by harness type"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get recent path jail violations.

    Returns the most recent violations, optionally filtered by harness type.
    """
    violations = _violations

    if harness_type:
        violations = [v for v in violations if v.harness_type == harness_type]

    # Sort by timestamp descending (most recent first)
    violations = sorted(violations, key=lambda v: v.timestamp, reverse=True)

    return ViolationsResponse(
        violations=violations[:limit],
        total=len(violations),
    )


@router.get("/default-patterns", response_model=DefaultPatternsResponse)
async def get_default_patterns(_=Depends(require_role(Role.VIEWER))):
    """Get the list of default blocked patterns.

    These are the built-in security patterns from core/path_jail.py.
    """
    return DefaultPatternsResponse(
        patterns=DEFAULT_BLOCKED_PATTERNS,
        total=len(DEFAULT_BLOCKED_PATTERNS),
    )


@router.get("/harness-overrides/{harness_type}", response_model=PathJailRulesResponse)
async def get_harness_overrides(
    harness_type: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get rules that apply to a specific harness type.

    Returns both global rules and harness-specific rules.
    """
    all_rules = _get_all_rules()

    applicable_rules = [
        r for r in all_rules
        if r.enabled and (
            r.scope == RuleScope.GLOBAL or
            (r.scope == RuleScope.HARNESS and harness_type in r.harness_types)
        )
    ]

    global_count = len([r for r in applicable_rules if r.scope == RuleScope.GLOBAL])
    harness_specific = len([r for r in applicable_rules if r.scope == RuleScope.HARNESS])

    return PathJailRulesResponse(
        rules=applicable_rules,
        total=len(applicable_rules),
        default_count=global_count,
        custom_count=harness_specific,
    )
