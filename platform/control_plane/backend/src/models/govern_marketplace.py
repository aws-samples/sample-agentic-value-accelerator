"""Govern Marketplace - Pydantic models for the internal resource marketplace.

Enables internal users to discover and subscribe to governed AI resources
(agents, MCP servers, A2A agents, knowledge bases, skills, harnesses, models).

Phase 1: Gated approval for all subscriptions
Phase 2: Self-service for low-risk resources
Phase 3: Policy-based auto-approval via Cedar

FinOps integration: Subscriptions link user -> resource -> cost -> business unit
for accurate chargeback and usage attribution.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================


class ResourceType(str, Enum):
    """Types of resources that can be listed in the marketplace."""
    AGENT = "agent"
    MCP_SERVER = "mcp_server"
    A2A_AGENT = "a2a_agent"
    KNOWLEDGE_BASE = "knowledge_base"
    SKILL = "skill"
    HARNESS = "harness"
    MODEL = "model"


class ListingVisibility(str, Enum):
    """Who can see this listing in the catalog."""
    INTERNAL = "internal"       # All authenticated users
    TEAM = "team"               # Only specified teams
    RESTRICTED = "restricted"   # Only pre-approved users


class ApprovalMode(str, Enum):
    """How subscription requests are handled."""
    REQUIRE_APPROVAL = "require_approval"  # All requests need approval (Phase 1 default)
    AUTO_APPROVE = "auto_approve"          # Self-service (Phase 2)
    DENY = "deny"                          # Not accepting subscriptions


class ListingStatus(str, Enum):
    """Lifecycle status of a marketplace listing."""
    DRAFT = "draft"           # Not visible in catalog
    PUBLISHED = "published"   # Visible and accepting subscriptions
    DEPRECATED = "deprecated" # Visible but flagged as deprecated
    ARCHIVED = "archived"     # Hidden, no new subscriptions


class SubscriptionStatus(str, Enum):
    """Status of a user's subscription to a resource."""
    PENDING = "pending"       # Awaiting approval
    ACTIVE = "active"         # Approved and usable
    REVOKED = "revoked"       # Access removed
    EXPIRED = "expired"       # TTL expired
    DENIED = "denied"         # Request was denied


class RiskLevel(str, Enum):
    """Risk classification for auto-approval decisions."""
    LOW = "low"         # Read-only, non-sensitive
    MEDIUM = "medium"   # Some write access
    HIGH = "high"       # Sensitive data or actions
    CRITICAL = "critical"  # Requires special approval


class AuditAction(str, Enum):
    """Types of auditable actions in the marketplace."""
    LISTING_CREATED = "listing_created"
    LISTING_PUBLISHED = "listing_published"
    LISTING_DEPRECATED = "listing_deprecated"
    LISTING_DELETED = "listing_deleted"
    SUBSCRIPTION_REQUESTED = "subscription_requested"
    SUBSCRIPTION_APPROVED = "subscription_approved"
    SUBSCRIPTION_DENIED = "subscription_denied"
    SUBSCRIPTION_REVOKED = "subscription_revoked"
    SUBSCRIPTION_EXPIRED = "subscription_expired"
    ATTESTATION_ACCEPTED = "attestation_accepted"
    ENTITLEMENT_CHECK_PASSED = "entitlement_check_passed"
    ENTITLEMENT_CHECK_FAILED = "entitlement_check_failed"
    RATE_LIMIT_HIT = "rate_limit_hit"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    BUDGET_ALERT = "budget_alert"
    BUDGET_EXCEEDED = "budget_exceeded"
    USAGE_RECORDED = "usage_recorded"


# ============================================================================
# Approval Chain Models
# ============================================================================


class ApprovalStep(BaseModel):
    """Single step in approval chain."""
    step_order: int
    approver_type: str  # "owner_team" | "compliance" | "security" | "executive"
    approver_email: Optional[str] = None  # specific approver if needed
    required: bool = True
    completed: bool = False
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    decision: Optional[str] = None  # "approved" | "denied"
    notes: str = ""


class ApprovalChainConfig(BaseModel):
    """Approval chain configuration based on risk level."""
    risk_level: RiskLevel
    steps: List[ApprovalStep]


# ============================================================================
# Recertification Models
# ============================================================================


class RecertificationConfig(BaseModel):
    """Configuration for periodic access recertification."""
    enabled: bool = False
    interval_days: int = 90  # recertify every 90 days
    grace_period_days: int = 14  # 14 day grace period
    auto_revoke_on_expiry: bool = True


# ============================================================================
# Marketplace Listing Models
# ============================================================================


class ListingMetadata(BaseModel):
    """Additional metadata for a listing."""
    capabilities: List[str] = Field(default_factory=list, description="What this resource can do")
    use_cases: List[str] = Field(default_factory=list, description="Example use cases")
    limitations: List[str] = Field(default_factory=list, description="Known limitations")
    documentation_url: Optional[str] = None
    support_contact: Optional[str] = None
    sla_tier: Optional[str] = Field(None, description="bronze | silver | gold | platinum")
    tags: List[str] = Field(default_factory=list)


class CostInfo(BaseModel):
    """Cost information for chargeback."""
    cost_model: str = Field("per_invocation", description="per_invocation | per_token | flat_monthly | free")
    estimated_cost_per_1k: Optional[float] = Field(None, description="Estimated cost per 1000 invocations")
    cost_center_required: bool = True
    billing_code: Optional[str] = None


class ListingBase(BaseModel):
    """Base fields for a marketplace listing."""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    resource_type: ResourceType
    resource_id: str = Field(..., min_length=1, max_length=200, description="ID in source registry")

    owner_team: str = Field(..., min_length=1, max_length=100)
    owner_email: Optional[str] = None

    visibility: ListingVisibility = ListingVisibility.INTERNAL
    approval_mode: ApprovalMode = ApprovalMode.REQUIRE_APPROVAL
    risk_level: RiskLevel = RiskLevel.MEDIUM

    allowed_teams: List[str] = Field(default_factory=list, description="Teams with access (if visibility=team)")

    metadata: ListingMetadata = Field(default_factory=ListingMetadata)
    cost_info: CostInfo = Field(default_factory=CostInfo)

    category: str = Field(default="general", max_length=50, description="Grouping category")
    featured: bool = Field(default=False, description="Show in featured section")

    # Governance associations
    required_guardrail_ids: List[str] = Field(default_factory=list)
    required_policy_engine_id: Optional[str] = None
    data_classification: str = Field(default="internal", description="public | internal | confidential | restricted")

    # Compliance
    compliance_frameworks: List[str] = Field(default_factory=list, description="SOC2, PCI-DSS, HIPAA, etc.")
    requires_attestation: bool = False
    attestation_text: Optional[str] = None

    # Rate limiting
    rate_limit_per_minute: Optional[int] = None
    rate_limit_per_day: Optional[int] = None

    # Budget
    default_budget_limit: Optional[float] = None  # per subscription monthly limit

    # Recertification
    recertification: RecertificationConfig = Field(default_factory=RecertificationConfig)


class ListingCreate(ListingBase):
    """Payload to create a marketplace listing."""
    pass


class ListingUpdate(BaseModel):
    """Payload to update a listing (partial)."""
    name: Optional[str] = None
    description: Optional[str] = None
    owner_team: Optional[str] = None
    owner_email: Optional[str] = None
    visibility: Optional[ListingVisibility] = None
    approval_mode: Optional[ApprovalMode] = None
    risk_level: Optional[RiskLevel] = None
    allowed_teams: Optional[List[str]] = None
    metadata: Optional[ListingMetadata] = None
    cost_info: Optional[CostInfo] = None
    category: Optional[str] = None
    featured: Optional[bool] = None
    # Governance fields
    required_guardrail_ids: Optional[List[str]] = None
    required_policy_engine_id: Optional[str] = None
    data_classification: Optional[str] = None
    compliance_frameworks: Optional[List[str]] = None
    requires_attestation: Optional[bool] = None
    attestation_text: Optional[str] = None
    rate_limit_per_minute: Optional[int] = None
    rate_limit_per_day: Optional[int] = None
    default_budget_limit: Optional[float] = None
    recertification: Optional[RecertificationConfig] = None


class Listing(ListingBase):
    """Full marketplace listing record."""
    id: str = Field(default_factory=lambda: f"lst-{uuid.uuid4().hex[:12]}")
    status: ListingStatus = ListingStatus.DRAFT

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    published_at: Optional[datetime] = None
    created_by: Optional[str] = None

    # Aggregated stats
    subscriber_count: int = 0
    total_invocations: int = 0
    avg_rating: Optional[float] = None


class ListingResponse(BaseModel):
    """Response wrapper for a single listing."""
    listing: Listing
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class ListingsResponse(BaseModel):
    """Response for listings list endpoint."""
    listings: List[Listing] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


# ============================================================================
# Catalog Models (Consumer View)
# ============================================================================


class CatalogItem(BaseModel):
    """Consumer-facing view of a listing."""
    id: str
    name: str
    description: str
    resource_type: ResourceType
    resource_id: str

    owner_team: str
    category: str
    featured: bool
    risk_level: RiskLevel

    capabilities: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

    # Consumer-relevant info
    approval_mode: ApprovalMode
    cost_model: str
    estimated_cost_per_1k: Optional[float] = None
    sla_tier: Optional[str] = None

    # Stats
    subscriber_count: int = 0
    avg_rating: Optional[float] = None

    # User-specific
    user_subscription_status: Optional[SubscriptionStatus] = None
    user_subscription_id: Optional[str] = None


class CatalogResponse(BaseModel):
    """Response for catalog browse endpoint."""
    items: List[CatalogItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20

    # Facets for filtering
    categories: List[str] = Field(default_factory=list)
    resource_types: List[str] = Field(default_factory=list)

    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class CatalogItemDetailResponse(BaseModel):
    """Detailed view of a single catalog item."""
    item: CatalogItem

    # Extended details
    full_description: str = ""
    use_cases: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    documentation_url: Optional[str] = None
    support_contact: Optional[str] = None

    # Related items
    related_items: List[CatalogItem] = Field(default_factory=list)

    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


# ============================================================================
# Subscription Models
# ============================================================================


class UsageMetrics(BaseModel):
    """Usage tracking for a subscription."""
    total_invocations: int = 0
    total_tokens: int = 0
    total_cost: float = 0.0
    last_invocation: Optional[datetime] = None
    invocations_30d: int = 0
    cost_30d: float = 0.0


class SubscriptionBase(BaseModel):
    """Base fields for a subscription."""
    listing_id: str = Field(..., min_length=1)

    # User info
    user_id: str = Field(..., min_length=1)
    user_email: str = Field(..., min_length=1)

    # Business attribution
    business_unit: str = Field(..., min_length=1, max_length=100)
    cost_center: str = Field(..., min_length=1, max_length=50)

    # Request details
    justification: str = Field(default="", max_length=1000)
    requested_access_level: str = Field(default="standard", description="standard | elevated | admin")


class SubscriptionRequest(SubscriptionBase):
    """Payload to request a subscription."""
    pass


class Subscription(SubscriptionBase):
    """Full subscription record."""
    id: str = Field(default_factory=lambda: f"sub-{uuid.uuid4().hex[:12]}")
    status: SubscriptionStatus = SubscriptionStatus.PENDING

    # Denormalized from listing for query efficiency
    resource_type: Optional[ResourceType] = None
    resource_id: Optional[str] = None
    listing_name: Optional[str] = None

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None

    # Approval info
    approved_by: Optional[str] = None
    denied_by: Optional[str] = None
    denial_reason: Optional[str] = None

    # Multi-level approval tracking
    approval_chain: List[ApprovalStep] = Field(default_factory=list)
    current_approval_step: int = 0

    # Compliance
    attestation_accepted: bool = False
    attestation_accepted_at: Optional[datetime] = None

    # Budget
    budget_limit: Optional[float] = None
    budget_spent_this_month: float = 0.0
    budget_alert_threshold: float = 0.8  # alert at 80%

    # Rate limiting (inherited from listing or custom)
    rate_limit_per_minute: Optional[int] = None
    rate_limit_per_day: Optional[int] = None
    invocations_this_minute: int = 0
    invocations_today: int = 0
    last_rate_reset: Optional[datetime] = None

    # Recertification tracking
    last_recertification: Optional[datetime] = None
    next_recertification_due: Optional[datetime] = None
    recertification_reminder_sent: bool = False

    # Usage tracking
    usage: UsageMetrics = Field(default_factory=UsageMetrics)


class SubscriptionUpdate(BaseModel):
    """Payload to update a subscription."""
    business_unit: Optional[str] = None
    cost_center: Optional[str] = None
    requested_access_level: Optional[str] = None


class SubscriptionApproval(BaseModel):
    """Payload to approve a subscription."""
    approved_by: str
    expires_in_days: Optional[int] = Field(None, ge=1, le=365, description="TTL in days, null=no expiry")
    notes: str = ""


class SubscriptionDenial(BaseModel):
    """Payload to deny a subscription."""
    denied_by: str
    reason: str = Field(..., min_length=1, max_length=500)


class SubscriptionResponse(BaseModel):
    """Response wrapper for a single subscription."""
    subscription: Subscription
    listing: Optional[Listing] = None
    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class SubscriptionsResponse(BaseModel):
    """Response for subscriptions list endpoint."""
    subscriptions: List[Subscription] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50

    # Summary stats
    active_count: int = 0
    pending_count: int = 0

    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class MySubscriptionsResponse(BaseModel):
    """Response for user's own subscriptions."""
    subscriptions: List[Subscription] = Field(default_factory=list)
    total: int = 0

    # User-level summary
    active_count: int = 0
    pending_count: int = 0
    total_cost_30d: float = 0.0

    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class PendingApprovalsResponse(BaseModel):
    """Response for pending subscription approvals."""
    subscriptions: List[Subscription] = Field(default_factory=list)
    total: int = 0

    # Breakdown by resource type
    by_resource_type: Dict[str, int] = Field(default_factory=dict)

    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


class AdminSubscriptionsResponse(BaseModel):
    """Response for admin subscriptions view (all subscriptions)."""
    subscriptions: List[Subscription] = Field(default_factory=list)
    total: int = 0

    # Counts by status
    active_count: int = 0
    pending_count: int = 0
    revoked_count: int = 0
    expired_count: int = 0
    denied_count: int = 0

    live: bool = False
    source: str = "dynamodb"
    note: Optional[str] = None


# ============================================================================
# Usage Analytics Models
# ============================================================================


class SubscriptionUsageSummary(BaseModel):
    """Usage summary for a single subscription."""
    subscription_id: str
    listing_id: str
    listing_name: str
    resource_type: ResourceType
    user_email: str
    business_unit: str
    cost_center: str

    invocations_30d: int = 0
    tokens_30d: int = 0
    cost_30d: float = 0.0
    last_invocation: Optional[datetime] = None


class UsageByBusinessUnit(BaseModel):
    """Aggregated usage by business unit."""
    business_unit: str
    subscriber_count: int = 0
    total_invocations_30d: int = 0
    total_cost_30d: float = 0.0
    top_resources: List[str] = Field(default_factory=list)


class UsageByResource(BaseModel):
    """Aggregated usage by resource."""
    listing_id: str
    listing_name: str
    resource_type: ResourceType
    subscriber_count: int = 0
    total_invocations_30d: int = 0
    total_cost_30d: float = 0.0
    top_business_units: List[str] = Field(default_factory=list)


class UsageAnalyticsResponse(BaseModel):
    """Response for usage analytics endpoint."""
    period_start: datetime
    period_end: datetime

    total_subscribers: int = 0
    total_invocations: int = 0
    total_cost: float = 0.0

    by_business_unit: List[UsageByBusinessUnit] = Field(default_factory=list)
    by_resource: List[UsageByResource] = Field(default_factory=list)

    live: bool = False
    source: str = "aggregation"
    note: Optional[str] = None


# ============================================================================
# Entitlement Check Models
# ============================================================================


class EntitlementCheck(BaseModel):
    """Request to check if a user has entitlement to a resource."""
    user_id: str
    resource_type: ResourceType
    resource_id: str


class EntitlementResult(BaseModel):
    """Result of an entitlement check."""
    entitled: bool
    subscription_id: Optional[str] = None
    access_level: Optional[str] = None
    expires_at: Optional[datetime] = None
    reason: str = ""

    # Governance info
    required_guardrails: List[str] = Field(default_factory=list)
    policy_engine_id: Optional[str] = None
    rate_limited: bool = False
    rate_limit_remaining: Optional[int] = None
    budget_remaining: Optional[float] = None


# ============================================================================
# Audit Log Models
# ============================================================================


class AuditLogEntry(BaseModel):
    """Immutable audit log entry for governance compliance."""
    id: str = Field(default_factory=lambda: f"aud-{uuid.uuid4().hex[:16]}")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    action: AuditAction
    actor_id: str  # user who performed action
    actor_email: str

    # Target info
    listing_id: Optional[str] = None
    subscription_id: Optional[str] = None
    resource_type: Optional[ResourceType] = None
    resource_id: Optional[str] = None

    # Details
    details: Dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    # Immutability
    checksum: Optional[str] = None  # SHA256 of entry for tamper detection


class AuditLogResponse(BaseModel):
    """Response for audit log queries."""
    entries: List[AuditLogEntry] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 100
    live: bool = False
    source: str = "dynamodb"


# ============================================================================
# Default Approval Chains
# ============================================================================


DEFAULT_APPROVAL_CHAINS: Dict[RiskLevel, List[dict]] = {
    RiskLevel.LOW: [
        {"step_order": 1, "approver_type": "owner_team", "required": True}
    ],
    RiskLevel.MEDIUM: [
        {"step_order": 1, "approver_type": "owner_team", "required": True},
        {"step_order": 2, "approver_type": "compliance", "required": True}
    ],
    RiskLevel.HIGH: [
        {"step_order": 1, "approver_type": "owner_team", "required": True},
        {"step_order": 2, "approver_type": "compliance", "required": True},
        {"step_order": 3, "approver_type": "security", "required": True}
    ],
    RiskLevel.CRITICAL: [
        {"step_order": 1, "approver_type": "owner_team", "required": True},
        {"step_order": 2, "approver_type": "compliance", "required": True},
        {"step_order": 3, "approver_type": "security", "required": True},
        {"step_order": 4, "approver_type": "executive", "required": True}
    ]
}
