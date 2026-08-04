"""AgentCore Policy data models — resource-level operational policies"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime
import uuid


class PolicyStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    DISABLED = "disabled"


class RuleType(str, Enum):
    DENY = "deny"
    REQUIRE = "require"


class RuleAction(str, Enum):
    ENFORCE = "enforce"
    LOG = "log"


class ResourceType(str, Enum):
    GATEWAY = "gateway"


class RuleCategory(str, Enum):
    TOOLS = "tools"
    MODELS = "models"
    COMPLIANCE = "compliance"


# --- Rule definition ---

class PolicyRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    type: RuleType
    category: RuleCategory
    target: str  # e.g., "bash_execution", "model_tier", "max_tokens_per_invocation"
    condition: str = "always"  # e.g., "always", "equals", "exceeds"
    value: str = ""  # e.g., "50000", "opus", "s3://bucket-name"
    action: RuleAction = RuleAction.ENFORCE


# --- Request/Response models ---

class PolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    resource_type: ResourceType = ResourceType.GATEWAY
    resource_id: Optional[str] = Field(default=None, max_length=200)
    rules: List[PolicyRule] = Field(default_factory=list)
    cedar_code: Optional[str] = Field(default=None, description="Raw Cedar code (used when creating via code editor)")
    engine_id: Optional[str] = Field(default=None, description="Target policy engine ID")


class PolicyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    resource_type: Optional[ResourceType] = None
    resource_id: Optional[str] = None
    status: Optional[PolicyStatus] = None
    rules: Optional[List[PolicyRule]] = None


class StatusHistoryEntry(BaseModel):
    status: str
    timestamp: str
    message: Optional[str] = None


class Policy(BaseModel):
    policy_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    resource_type: ResourceType
    resource_id: Optional[str] = None
    status: PolicyStatus = PolicyStatus.DRAFT
    rules: List[PolicyRule] = Field(default_factory=list)
    rules_count: int = 0
    blocking_rules: int = 0
    triggered_count: int = 0
    last_triggered: Optional[str] = None
    status_history: List[StatusHistoryEntry] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class PolicyPreset(BaseModel):
    id: str
    name: str
    description: str
    tags: List[str] = Field(default_factory=list)
    resource_type: ResourceType
    config: PolicyCreate


# --- Audit Events ---

class AuditActionTaken(str, Enum):
    ENFORCED = "enforced"
    LOGGED = "logged"


class PolicyAuditEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    policy_id: str
    policy_name: str
    resource_type: ResourceType
    resource_id: str
    rule_type: RuleType
    action_taken: AuditActionTaken
    target: str
    details: str
    caller: Optional[str] = None


class PolicyMetrics(BaseModel):
    policy_id: str
    total_events: int = 0
    enforced_count: int = 0
    logged_count: int = 0
    enforce_rate: float = 0.0
    recent_events: List[PolicyAuditEvent] = Field(default_factory=list)
