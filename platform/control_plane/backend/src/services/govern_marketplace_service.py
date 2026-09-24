"""Govern Marketplace service - listing and subscription management.

Manages the internal marketplace where users discover and subscribe to governed
AI resources. Integrates with existing registries (agents, MCP, A2A, knowledge
bases, skills, harnesses) and the approval workflow.

Storage:
  pk="LISTING#<id>" sk=LATEST
  pk="SUBSCRIPTION#<id>" sk=LATEST
  pk="USER_SUBS#<user_id>" sk="<listing_id>" (GSI for user's subscriptions)
  pk="LISTING_SUBS#<listing_id>" sk="<user_id>" (GSI for listing's subscribers)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

import boto3
from boto3.dynamodb.conditions import Attr, Key

from models.govern_marketplace import (
    ApprovalMode,
    ApprovalStep,
    AuditAction,
    AuditLogEntry,
    AuditLogResponse,
    CatalogItem,
    CatalogItemDetailResponse,
    CatalogResponse,
    EntitlementCheck,
    EntitlementResult,
    Listing,
    ListingCreate,
    ListingResponse,
    ListingStatus,
    ListingsResponse,
    ListingUpdate,
    MySubscriptionsResponse,
    PendingApprovalsResponse,
    ResourceType,
    RiskLevel,
    Subscription,
    SubscriptionApproval,
    SubscriptionDenial,
    SubscriptionRequest,
    SubscriptionResponse,
    SubscriptionStatus,
    SubscriptionsResponse,
    SubscriptionUpdate,
    UsageAnalyticsResponse,
    UsageByBusinessUnit,
    UsageByResource,
    UsageMetrics,
)

logger = logging.getLogger(__name__)


def _to_ddb(value):
    """Convert Python types to DynamoDB-compatible types."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _from_ddb(value):
    """Convert DynamoDB types back to Python types."""
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


# Demo listings when DynamoDB is not provisioned
def _demo_listings() -> List[Listing]:
    return [
        Listing(
            id="lst-demo-kyc",
            name="KYC Verification Agent",
            description="Automated Know Your Customer verification using document analysis and identity checks.",
            resource_type=ResourceType.AGENT,
            resource_id="agt-kyc-verification",
            owner_team="Compliance Engineering",
            owner_email="compliance-eng@example.com",
            category="compliance",
            featured=True,
            status=ListingStatus.PUBLISHED,
            published_at=datetime.utcnow(),
            subscriber_count=12,
            metadata={
                "capabilities": ["Document verification", "Identity matching", "Risk scoring"],
                "use_cases": ["Customer onboarding", "Periodic re-verification"],
                "tags": ["kyc", "compliance", "banking"],
            },
            cost_info={"cost_model": "per_invocation", "estimated_cost_per_1k": 2.50},
            # Governance fields
            required_guardrail_ids=["gr-pii-filter", "gr-content-safety"],
            required_policy_engine_id="pe-compliance",
            data_classification="confidential",
            compliance_frameworks=["SOC2", "PCI-DSS"],
            requires_attestation=True,
            attestation_text="I acknowledge this agent processes sensitive PII data including government IDs, addresses, and financial information. I agree to handle all outputs in accordance with data protection policies and will not store or share verification results outside approved systems.",
            rate_limit_per_minute=100,
            rate_limit_per_day=10000,
            default_budget_limit=500.0,
            risk_level=RiskLevel.HIGH,
        ),
        Listing(
            id="lst-demo-fraud",
            name="Fraud Detection Agent",
            description="Real-time transaction fraud detection using ML models and behavioral analysis.",
            resource_type=ResourceType.AGENT,
            resource_id="agt-fraud-detection",
            owner_team="Risk Engineering",
            owner_email="risk-eng@example.com",
            category="risk",
            featured=True,
            status=ListingStatus.PUBLISHED,
            published_at=datetime.utcnow(),
            subscriber_count=8,
            metadata={
                "capabilities": ["Transaction scoring", "Behavioral analysis", "Alert generation"],
                "use_cases": ["Payment fraud", "Account takeover detection"],
                "tags": ["fraud", "risk", "payments"],
            },
            cost_info={"cost_model": "per_invocation", "estimated_cost_per_1k": 1.80},
            # Governance fields
            required_guardrail_ids=["gr-pii-filter", "gr-financial-data"],
            required_policy_engine_id="pe-risk-ops",
            data_classification="confidential",
            compliance_frameworks=["SOC2", "PCI-DSS", "FFIEC"],
            requires_attestation=True,
            attestation_text="I acknowledge this agent accesses real-time transaction data and customer financial records. I agree to use fraud detection outputs only for authorized risk management purposes and will report any suspicious activity through proper channels.",
            rate_limit_per_minute=500,
            rate_limit_per_day=50000,
            default_budget_limit=1000.0,
            risk_level=RiskLevel.CRITICAL,
        ),
        Listing(
            id="lst-demo-market-data",
            name="Market Data MCP Server",
            description="Real-time and historical market data from multiple exchanges.",
            resource_type=ResourceType.MCP_SERVER,
            resource_id="mcp-market-data",
            owner_team="Data Platform",
            owner_email="data-platform@example.com",
            category="data",
            featured=False,
            status=ListingStatus.PUBLISHED,
            published_at=datetime.utcnow(),
            subscriber_count=25,
            metadata={
                "capabilities": ["Real-time quotes", "Historical OHLCV", "Corporate actions"],
                "use_cases": ["Trading systems", "Portfolio analytics", "Research"],
                "tags": ["market-data", "trading", "finance"],
            },
            cost_info={"cost_model": "per_token", "estimated_cost_per_1k": 0.10},
            # Governance fields
            required_guardrail_ids=["gr-market-data-usage"],
            data_classification="internal",
            compliance_frameworks=["SOC2"],
            requires_attestation=False,
            rate_limit_per_minute=1000,
            rate_limit_per_day=100000,
            default_budget_limit=250.0,
            risk_level=RiskLevel.MEDIUM,
        ),
        Listing(
            id="lst-demo-policy-kb",
            name="Policy & Compliance Knowledge Base",
            description="Searchable knowledge base of internal policies, regulations, and compliance guidance.",
            resource_type=ResourceType.KNOWLEDGE_BASE,
            resource_id="kb-policy-compliance",
            owner_team="Legal & Compliance",
            owner_email="legal@example.com",
            category="compliance",
            featured=False,
            status=ListingStatus.PUBLISHED,
            published_at=datetime.utcnow(),
            subscriber_count=45,
            metadata={
                "capabilities": ["Semantic search", "Policy lookup", "Regulatory mapping"],
                "use_cases": ["Policy questions", "Compliance checks", "Audit support"],
                "tags": ["policy", "compliance", "knowledge"],
            },
            cost_info={"cost_model": "free", "estimated_cost_per_1k": 0.0},
            # Governance fields - low risk, read-only
            required_guardrail_ids=[],
            data_classification="internal",
            compliance_frameworks=["SOC2"],
            requires_attestation=False,
            rate_limit_per_minute=200,
            rate_limit_per_day=20000,
            default_budget_limit=None,  # Free resource
            risk_level=RiskLevel.LOW,
            approval_mode=ApprovalMode.AUTO_APPROVE,
        ),
    ]


def _demo_subscriptions() -> List[Subscription]:
    return [
        Subscription(
            id="sub-demo-001",
            listing_id="lst-demo-kyc",
            user_id="user-demo",
            user_email="demo@example.com",
            business_unit="Retail Banking",
            cost_center="CC-1001",
            status=SubscriptionStatus.ACTIVE,
            resource_type=ResourceType.AGENT,
            resource_id="agt-kyc-verification",
            listing_name="KYC Verification Agent",
            approved_at=datetime.utcnow() - timedelta(days=30),
            approved_by="admin@example.com",
            usage=UsageMetrics(
                total_invocations=1250,
                total_cost=3.12,
                invocations_30d=450,
                cost_30d=1.12,
                last_invocation=datetime.utcnow() - timedelta(hours=2),
            ),
            # Governance fields
            approval_chain=[
                ApprovalStep(step_order=1, approver_type="owner_team", completed=True, completed_at=datetime.utcnow() - timedelta(days=30), completed_by="compliance-eng@example.com", decision="approved"),
                ApprovalStep(step_order=2, approver_type="compliance", completed=True, completed_at=datetime.utcnow() - timedelta(days=30), completed_by="compliance-reviewer@example.com", decision="approved"),
            ],
            current_approval_step=2,
            attestation_accepted=True,
            attestation_accepted_at=datetime.utcnow() - timedelta(days=30),
            budget_limit=500.0,
            budget_spent_this_month=45.50,
            rate_limit_per_minute=100,
            rate_limit_per_day=10000,
            invocations_this_minute=5,
            invocations_today=120,
            last_rate_reset=datetime.utcnow() - timedelta(seconds=30),
        ),
        Subscription(
            id="sub-demo-002",
            listing_id="lst-demo-market-data",
            user_id="user-demo",
            user_email="demo@example.com",
            business_unit="Retail Banking",
            cost_center="CC-1001",
            status=SubscriptionStatus.ACTIVE,
            resource_type=ResourceType.MCP_SERVER,
            resource_id="mcp-market-data",
            listing_name="Market Data MCP Server",
            approved_at=datetime.utcnow() - timedelta(days=15),
            approved_by="admin@example.com",
            usage=UsageMetrics(
                total_invocations=8500,
                total_tokens=125000,
                total_cost=12.50,
                invocations_30d=8500,
                cost_30d=12.50,
                last_invocation=datetime.utcnow() - timedelta(minutes=30),
            ),
            # Governance fields
            approval_chain=[
                ApprovalStep(step_order=1, approver_type="owner_team", completed=True, completed_at=datetime.utcnow() - timedelta(days=15), completed_by="data-platform@example.com", decision="approved"),
            ],
            current_approval_step=1,
            attestation_accepted=False,  # Not required for this listing
            budget_limit=250.0,
            budget_spent_this_month=12.50,
            rate_limit_per_minute=1000,
            rate_limit_per_day=100000,
            invocations_this_minute=15,
            invocations_today=850,
            last_rate_reset=datetime.utcnow() - timedelta(seconds=45),
        ),
        Subscription(
            id="sub-demo-003",
            listing_id="lst-demo-fraud",
            user_id="user-demo",
            user_email="demo@example.com",
            business_unit="Retail Banking",
            cost_center="CC-1001",
            status=SubscriptionStatus.PENDING,
            resource_type=ResourceType.AGENT,
            resource_id="agt-fraud-detection",
            listing_name="Fraud Detection Agent",
            # Pending approval - multi-level chain
            approval_chain=[
                ApprovalStep(step_order=1, approver_type="owner_team", completed=True, completed_at=datetime.utcnow() - timedelta(days=2), completed_by="risk-eng@example.com", decision="approved"),
                ApprovalStep(step_order=2, approver_type="compliance", completed=False),
                ApprovalStep(step_order=3, approver_type="security", completed=False),
                ApprovalStep(step_order=4, approver_type="executive", completed=False),
            ],
            current_approval_step=1,
            attestation_accepted=False,  # Will need to accept after approval
            budget_limit=1000.0,
            budget_spent_this_month=0.0,
            rate_limit_per_minute=500,
            rate_limit_per_day=50000,
        ),
    ]


class GovernMarketplaceService:
    LISTING_PREFIX = "LISTING#"
    SUB_PREFIX = "SUBSCRIPTION#"
    USER_SUBS_PREFIX = "USER_SUBS#"
    LISTING_SUBS_PREFIX = "LISTING_SUBS#"
    AUDIT_PREFIX = "AUDIT#"
    SK_LATEST = "LATEST"

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)
        self._table_available = None

    def _is_table_available(self) -> bool:
        """Check if the DynamoDB table is available."""
        if self._table_available is not None:
            return self._table_available
        try:
            self.table.table_status
            self._table_available = True
        except Exception:
            self._table_available = False
        return self._table_available

    def _put(self, pk: str, body: dict, record_id: str, id_field: str) -> None:
        """Put an item to DynamoDB."""
        self.table.put_item(
            Item=_to_ddb({"pk": pk, "sk": self.SK_LATEST, id_field: record_id, "data": json.dumps(body)})
        )

    def _put_index(self, pk: str, sk: str, data: dict) -> None:
        """Put an index entry for efficient queries."""
        self.table.put_item(Item=_to_ddb({"pk": pk, "sk": sk, **data}))

    def _delete_index(self, pk: str, sk: str) -> None:
        """Delete an index entry."""
        self.table.delete_item(Key={"pk": pk, "sk": sk})

    # =========================================================================
    # Audit Logging
    # =========================================================================

    def _log_audit(self, entry: AuditLogEntry) -> None:
        """Write an immutable audit log entry."""
        import hashlib

        # Create checksum for tamper detection
        content = f"{entry.timestamp.isoformat()}|{entry.action.value}|{entry.actor_id}|{entry.listing_id}|{entry.subscription_id}"
        entry.checksum = hashlib.sha256(content.encode()).hexdigest()

        if self._is_table_available():
            # Store with timestamp-based sort key for chronological queries
            self._put(
                f"{self.AUDIT_PREFIX}{entry.timestamp.strftime('%Y%m')}",  # partition by month
                entry.model_dump(mode="json"),
                entry.id,
                "audit_id",
            )
            # Also store by listing/subscription for targeted queries
            if entry.listing_id:
                self._put_index(
                    f"AUDIT_LISTING#{entry.listing_id}",
                    entry.id,
                    {"timestamp": entry.timestamp.isoformat()},
                )
            if entry.subscription_id:
                self._put_index(
                    f"AUDIT_SUB#{entry.subscription_id}",
                    entry.id,
                    {"timestamp": entry.timestamp.isoformat()},
                )

    def get_audit_log(
        self,
        listing_id: Optional[str] = None,
        subscription_id: Optional[str] = None,
        action: Optional[AuditAction] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> AuditLogResponse:
        """Query audit log with filters."""
        if not self._is_table_available():
            return AuditLogResponse(
                entries=[],
                total=0,
                page=page,
                page_size=page_size,
                listing_id=listing_id,
                subscription_id=subscription_id,
                action=action,
                start_date=start_date,
                end_date=end_date,
                source="demo",
                note="DynamoDB not available",
            )

        entries: List[AuditLogEntry] = []

        try:
            # Query by listing or subscription index if specified
            if listing_id:
                resp = self.table.query(
                    KeyConditionExpression=Key("pk").eq(f"AUDIT_LISTING#{listing_id}")
                )
                audit_ids = [item["sk"] for item in resp.get("Items", [])]
                for audit_id in audit_ids:
                    # Need to scan for the actual entry by audit_id
                    scan_resp = self.table.scan(
                        FilterExpression=Attr("pk").begins_with(self.AUDIT_PREFIX) & Attr("audit_id").eq(audit_id)
                    )
                    for item in scan_resp.get("Items", []):
                        entries.append(AuditLogEntry.model_validate(_from_ddb(json.loads(item["data"]))))
            elif subscription_id:
                resp = self.table.query(
                    KeyConditionExpression=Key("pk").eq(f"AUDIT_SUB#{subscription_id}")
                )
                audit_ids = [item["sk"] for item in resp.get("Items", [])]
                for audit_id in audit_ids:
                    scan_resp = self.table.scan(
                        FilterExpression=Attr("pk").begins_with(self.AUDIT_PREFIX) & Attr("audit_id").eq(audit_id)
                    )
                    for item in scan_resp.get("Items", []):
                        entries.append(AuditLogEntry.model_validate(_from_ddb(json.loads(item["data"]))))
            else:
                # Full scan of audit entries
                resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.AUDIT_PREFIX))
                entries = [AuditLogEntry.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]

            # Apply filters
            if action:
                entries = [e for e in entries if e.action == action]
            if start_date:
                entries = [e for e in entries if e.timestamp >= start_date]
            if end_date:
                entries = [e for e in entries if e.timestamp <= end_date]

            # Sort by timestamp descending
            entries.sort(key=lambda x: x.timestamp, reverse=True)

            # Pagination
            total = len(entries)
            start = (page - 1) * page_size
            entries = entries[start : start + page_size]

            return AuditLogResponse(
                entries=entries,
                total=total,
                page=page,
                page_size=page_size,
                listing_id=listing_id,
                subscription_id=subscription_id,
                action=action,
                start_date=start_date,
                end_date=end_date,
                live=True,
                source="dynamodb",
            )
        except Exception as e:
            logger.warning(f"Failed to query audit log: {e}")
            return AuditLogResponse(
                entries=[],
                total=0,
                page=page,
                page_size=page_size,
                source="error",
                note=str(e),
            )

    # =========================================================================
    # Approval Chain Builder
    # =========================================================================

    def _build_approval_chain(self, listing: Listing) -> List[ApprovalStep]:
        """Build approval chain based on listing risk level."""
        steps: List[ApprovalStep] = []

        # Always start with owner team approval
        steps.append(ApprovalStep(
            step_order=1,
            approver_type="owner_team",
            approver_email=listing.owner_email,
            required=True,
        ))

        # Add compliance for high/critical
        if listing.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
            steps.append(ApprovalStep(
                step_order=2,
                approver_type="compliance",
                required=True,
            ))

        # Add security for critical
        if listing.risk_level == RiskLevel.CRITICAL:
            steps.append(ApprovalStep(
                step_order=3,
                approver_type="security",
                required=True,
            ))

        # Add executive for critical
        if listing.risk_level == RiskLevel.CRITICAL:
            steps.append(ApprovalStep(
                step_order=4,
                approver_type="executive",
                required=True,
            ))

        return steps

    # =========================================================================
    # Listing CRUD
    # =========================================================================

    def create_listing(self, req: ListingCreate, created_by: str) -> Listing:
        """Create a new marketplace listing (starts as draft)."""
        listing = Listing(**req.model_dump(), created_by=created_by)

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.LISTING_CREATED,
            actor_id=created_by,
            actor_email=created_by,
            listing_id=listing.id,
            resource_type=listing.resource_type,
            resource_id=listing.resource_id,
            details={
                "name": listing.name,
                "risk_level": listing.risk_level.value,
                "requires_attestation": listing.requires_attestation,
            },
        ))

        if self._is_table_available():
            self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")
        return listing

    def get_listing(self, listing_id: str) -> Optional[Listing]:
        """Get a listing by ID."""
        if not self._is_table_available():
            return next((l for l in _demo_listings() if l.id == listing_id), None)
        try:
            item = self.table.get_item(Key={"pk": f"{self.LISTING_PREFIX}{listing_id}", "sk": self.SK_LATEST}).get("Item")
            return Listing.model_validate(_from_ddb(json.loads(item["data"]))) if item else None
        except Exception:
            return next((l for l in _demo_listings() if l.id == listing_id), None)

    def list_listings(self, status: Optional[ListingStatus] = None, page: int = 1, page_size: int = 50) -> ListingsResponse:
        """List all listings (admin view)."""
        if not self._is_table_available():
            listings = _demo_listings()
            if status:
                listings = [l for l in listings if l.status == status]
            return ListingsResponse(listings=listings, total=len(listings), page=page, page_size=page_size, source="demo")

        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.LISTING_PREFIX))
            listings = [Listing.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]
            if status:
                listings = [l for l in listings if l.status == status]
            listings.sort(key=lambda x: x.created_at, reverse=True)
            total = len(listings)
            start = (page - 1) * page_size
            listings = listings[start:start + page_size]
            return ListingsResponse(listings=listings, total=total, page=page, page_size=page_size, live=True, source="dynamodb")
        except Exception as e:
            logger.warning(f"Failed to list listings: {e}")
            listings = _demo_listings()
            return ListingsResponse(listings=listings, total=len(listings), page=page, page_size=page_size, source="demo")

    def update_listing(self, listing_id: str, req: ListingUpdate) -> Optional[Listing]:
        """Update a listing."""
        listing = self.get_listing(listing_id)
        if not listing:
            return None
        for field, value in req.model_dump(exclude_none=True).items():
            setattr(listing, field, value)
        listing.updated_at = datetime.utcnow()
        if self._is_table_available():
            self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")
        return listing

    def delete_listing(self, listing_id: str, deleted_by: str = "system") -> Optional[Listing]:
        """Delete a listing."""
        listing = self.get_listing(listing_id)
        if not listing:
            return None

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.LISTING_DELETED,
            actor_id=deleted_by,
            actor_email=deleted_by,
            listing_id=listing.id,
            resource_type=listing.resource_type,
            resource_id=listing.resource_id,
            details={"name": listing.name, "subscriber_count": listing.subscriber_count},
        ))

        if self._is_table_available():
            self.table.delete_item(Key={"pk": f"{self.LISTING_PREFIX}{listing_id}", "sk": self.SK_LATEST})
        return listing

    def publish_listing(self, listing_id: str, published_by: str = "system") -> Optional[Listing]:
        """Publish a listing to make it visible in the catalog."""
        listing = self.get_listing(listing_id)
        if not listing:
            return None
        listing.status = ListingStatus.PUBLISHED
        listing.published_at = datetime.utcnow()
        listing.updated_at = datetime.utcnow()

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.LISTING_PUBLISHED,
            actor_id=published_by,
            actor_email=published_by,
            listing_id=listing.id,
            resource_type=listing.resource_type,
            resource_id=listing.resource_id,
            details={"name": listing.name},
        ))

        if self._is_table_available():
            self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")
        return listing

    def unpublish_listing(self, listing_id: str) -> Optional[Listing]:
        """Unpublish a listing (set to draft)."""
        listing = self.get_listing(listing_id)
        if not listing:
            return None
        listing.status = ListingStatus.DRAFT
        listing.updated_at = datetime.utcnow()
        if self._is_table_available():
            self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")
        return listing

    def deprecate_listing(self, listing_id: str, deprecated_by: str = "system") -> Optional[Listing]:
        """Mark a listing as deprecated."""
        listing = self.get_listing(listing_id)
        if not listing:
            return None
        listing.status = ListingStatus.DEPRECATED
        listing.updated_at = datetime.utcnow()

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.LISTING_DEPRECATED,
            actor_id=deprecated_by,
            actor_email=deprecated_by,
            listing_id=listing.id,
            resource_type=listing.resource_type,
            resource_id=listing.resource_id,
            details={"name": listing.name, "subscriber_count": listing.subscriber_count},
        ))

        if self._is_table_available():
            self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")
        return listing

    # =========================================================================
    # Catalog (Consumer View)
    # =========================================================================

    def browse_catalog(
        self,
        user_id: str,
        user_teams: List[str],
        resource_type: Optional[ResourceType] = None,
        category: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> CatalogResponse:
        """Browse the catalog as a consumer."""
        listings_resp = self.list_listings(status=ListingStatus.PUBLISHED)
        listings = listings_resp.listings

        # Filter by visibility
        visible = []
        for listing in listings:
            if listing.visibility.value == "internal":
                visible.append(listing)
            elif listing.visibility.value == "team" and any(t in listing.allowed_teams for t in user_teams):
                visible.append(listing)
        listings = visible

        # Filter by resource type
        if resource_type:
            listings = [l for l in listings if l.resource_type == resource_type]

        # Filter by category
        if category:
            listings = [l for l in listings if l.category == category]

        # Search filter
        if search:
            search_lower = search.lower()
            listings = [
                l for l in listings
                if search_lower in l.name.lower()
                or search_lower in l.description.lower()
                or any(search_lower in t.lower() for t in l.metadata.tags)
            ]

        # Get user's subscriptions to annotate items
        user_subs = self._get_user_subscription_map(user_id)

        # Convert to catalog items
        items = []
        for listing in listings:
            sub = user_subs.get(listing.id)
            items.append(CatalogItem(
                id=listing.id,
                name=listing.name,
                description=listing.description,
                resource_type=listing.resource_type,
                resource_id=listing.resource_id,
                owner_team=listing.owner_team,
                category=listing.category,
                featured=listing.featured,
                risk_level=listing.risk_level,
                capabilities=listing.metadata.capabilities,
                tags=listing.metadata.tags,
                approval_mode=listing.approval_mode,
                cost_model=listing.cost_info.cost_model,
                estimated_cost_per_1k=listing.cost_info.estimated_cost_per_1k,
                sla_tier=listing.metadata.sla_tier,
                subscriber_count=listing.subscriber_count,
                avg_rating=listing.avg_rating,
                user_subscription_status=sub.status if sub else None,
                user_subscription_id=sub.id if sub else None,
            ))

        # Sort: featured first, then by subscriber count
        items.sort(key=lambda x: (not x.featured, -x.subscriber_count))

        # Pagination
        total = len(items)
        start = (page - 1) * page_size
        items = items[start:start + page_size]

        # Compute facets
        all_listings = listings_resp.listings
        categories = sorted(set(l.category for l in all_listings))
        resource_types = sorted(set(l.resource_type.value for l in all_listings))

        return CatalogResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            categories=categories,
            resource_types=resource_types,
            live=listings_resp.live,
            source=listings_resp.source,
        )

    def get_catalog_item(self, listing_id: str, user_id: str) -> Optional[CatalogItemDetailResponse]:
        """Get detailed view of a catalog item."""
        listing = self.get_listing(listing_id)
        if not listing or listing.status != ListingStatus.PUBLISHED:
            return None

        user_subs = self._get_user_subscription_map(user_id)
        sub = user_subs.get(listing_id)

        item = CatalogItem(
            id=listing.id,
            name=listing.name,
            description=listing.description,
            resource_type=listing.resource_type,
            resource_id=listing.resource_id,
            owner_team=listing.owner_team,
            category=listing.category,
            featured=listing.featured,
            risk_level=listing.risk_level,
            capabilities=listing.metadata.capabilities,
            tags=listing.metadata.tags,
            approval_mode=listing.approval_mode,
            cost_model=listing.cost_info.cost_model,
            estimated_cost_per_1k=listing.cost_info.estimated_cost_per_1k,
            sla_tier=listing.metadata.sla_tier,
            subscriber_count=listing.subscriber_count,
            avg_rating=listing.avg_rating,
            user_subscription_status=sub.status if sub else None,
            user_subscription_id=sub.id if sub else None,
        )

        return CatalogItemDetailResponse(
            item=item,
            full_description=listing.description,
            use_cases=listing.metadata.use_cases,
            limitations=listing.metadata.limitations,
            documentation_url=listing.metadata.documentation_url,
            support_contact=listing.metadata.support_contact,
            related_items=[],  # TODO: compute related items
        )

    # =========================================================================
    # Subscription Management
    # =========================================================================

    def request_subscription(self, req: SubscriptionRequest) -> Tuple[Subscription, bool]:
        """Request a subscription to a resource. Returns (subscription, auto_approved)."""
        listing = self.get_listing(req.listing_id)
        if not listing:
            raise ValueError(f"Listing not found: {req.listing_id}")
        if listing.status != ListingStatus.PUBLISHED:
            raise ValueError(f"Listing is not published: {req.listing_id}")
        if listing.approval_mode == ApprovalMode.DENY:
            raise ValueError(f"Listing is not accepting subscriptions: {req.listing_id}")

        # Check for existing subscription
        existing = self._get_user_subscription(req.user_id, req.listing_id)
        if existing and existing.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING):
            raise ValueError(f"User already has a {existing.status.value} subscription")

        # Build approval chain based on risk level
        approval_chain = self._build_approval_chain(listing)

        # Create subscription with governance fields
        sub = Subscription(
            **req.model_dump(),
            resource_type=listing.resource_type,
            resource_id=listing.resource_id,
            listing_name=listing.name,
            approval_chain=approval_chain,
            current_approval_step=0,
            # Inherit rate limits and budget from listing
            rate_limit_per_minute=listing.rate_limit_per_minute,
            rate_limit_per_day=listing.rate_limit_per_day,
            budget_limit=listing.default_budget_limit,
        )

        # Auto-approve if configured AND no attestation required
        auto_approved = False
        if listing.approval_mode == ApprovalMode.AUTO_APPROVE and not listing.requires_attestation:
            sub.status = SubscriptionStatus.ACTIVE
            sub.approved_at = datetime.utcnow()
            sub.approved_by = "auto"
            # Mark all approval steps as auto-completed
            for step in sub.approval_chain:
                step.completed = True
                step.completed_at = datetime.utcnow()
                step.completed_by = "auto"
                step.decision = "approved"
            sub.current_approval_step = len(sub.approval_chain)
            auto_approved = True
            # Update listing subscriber count
            listing.subscriber_count += 1
            if self._is_table_available():
                self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")

        # Log audit entry
        self._log_audit(AuditLogEntry(
            action=AuditAction.SUBSCRIPTION_REQUESTED,
            actor_id=req.user_id,
            actor_email=req.user_email,
            listing_id=listing.id,
            subscription_id=sub.id,
            resource_type=listing.resource_type,
            resource_id=listing.resource_id,
            details={
                "risk_level": listing.risk_level.value,
                "requires_attestation": listing.requires_attestation,
                "auto_approved": auto_approved,
                "approval_steps": len(approval_chain),
            },
        ))

        # Save subscription
        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")
            # Index for user's subscriptions
            self._put_index(
                f"{self.USER_SUBS_PREFIX}{sub.user_id}",
                sub.listing_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )
            # Index for listing's subscribers
            self._put_index(
                f"{self.LISTING_SUBS_PREFIX}{sub.listing_id}",
                sub.user_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )

        return sub, auto_approved

    def get_subscription(self, subscription_id: str) -> Optional[Subscription]:
        """Get a subscription by ID."""
        if not self._is_table_available():
            return next((s for s in _demo_subscriptions() if s.id == subscription_id), None)
        try:
            item = self.table.get_item(Key={"pk": f"{self.SUB_PREFIX}{subscription_id}", "sk": self.SK_LATEST}).get("Item")
            return Subscription.model_validate(_from_ddb(json.loads(item["data"]))) if item else None
        except Exception:
            return next((s for s in _demo_subscriptions() if s.id == subscription_id), None)

    def _get_user_subscription(self, user_id: str, listing_id: str) -> Optional[Subscription]:
        """Get a user's subscription to a specific listing."""
        if not self._is_table_available():
            return next(
                (s for s in _demo_subscriptions() if s.user_id == user_id and s.listing_id == listing_id),
                None,
            )
        try:
            item = self.table.get_item(Key={"pk": f"{self.USER_SUBS_PREFIX}{user_id}", "sk": listing_id}).get("Item")
            if item:
                return self.get_subscription(item["subscription_id"])
            return None
        except Exception:
            return None

    def _get_user_subscription_map(self, user_id: str) -> Dict[str, Subscription]:
        """Get a map of listing_id -> subscription for a user."""
        subs = self.get_my_subscriptions(user_id)
        return {s.listing_id: s for s in subs.subscriptions}

    def get_my_subscriptions(self, user_id: str) -> MySubscriptionsResponse:
        """Get all subscriptions for a user."""
        if not self._is_table_available():
            subs = [s for s in _demo_subscriptions() if s.user_id == user_id or user_id == "user-demo"]
            active = sum(1 for s in subs if s.status == SubscriptionStatus.ACTIVE)
            pending = sum(1 for s in subs if s.status == SubscriptionStatus.PENDING)
            cost_30d = sum(s.usage.cost_30d for s in subs)
            return MySubscriptionsResponse(
                subscriptions=subs,
                total=len(subs),
                active_count=active,
                pending_count=pending,
                total_cost_30d=cost_30d,
                source="demo",
            )

        try:
            resp = self.table.query(KeyConditionExpression=Key("pk").eq(f"{self.USER_SUBS_PREFIX}{user_id}"))
            sub_ids = [item["subscription_id"] for item in resp.get("Items", [])]
            subs = [self.get_subscription(sid) for sid in sub_ids]
            subs = [s for s in subs if s is not None]
            active = sum(1 for s in subs if s.status == SubscriptionStatus.ACTIVE)
            pending = sum(1 for s in subs if s.status == SubscriptionStatus.PENDING)
            cost_30d = sum(s.usage.cost_30d for s in subs)
            return MySubscriptionsResponse(
                subscriptions=subs,
                total=len(subs),
                active_count=active,
                pending_count=pending,
                total_cost_30d=cost_30d,
                live=True,
                source="dynamodb",
            )
        except Exception as e:
            logger.warning(f"Failed to get user subscriptions: {e}")
            return MySubscriptionsResponse(subscriptions=[], total=0, source="error", note=str(e))

    def approve_subscription(self, subscription_id: str, approval: SubscriptionApproval) -> Optional[Subscription]:
        """Approve a pending subscription (legacy single-step approval)."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None
        if sub.status != SubscriptionStatus.PENDING:
            raise ValueError(f"Subscription is not pending: {sub.status.value}")

        sub.status = SubscriptionStatus.ACTIVE
        sub.approved_at = datetime.utcnow()
        sub.approved_by = approval.approved_by
        sub.updated_at = datetime.utcnow()
        if approval.expires_in_days:
            sub.expires_at = datetime.utcnow() + timedelta(days=approval.expires_in_days)

        # Mark all approval steps as complete
        for step in sub.approval_chain:
            if not step.completed:
                step.completed = True
                step.completed_at = datetime.utcnow()
                step.completed_by = approval.approved_by
                step.decision = "approved"
                step.notes = approval.notes
        sub.current_approval_step = len(sub.approval_chain)

        # Update listing subscriber count
        listing = self.get_listing(sub.listing_id)
        if listing:
            listing.subscriber_count += 1
            if self._is_table_available():
                self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.SUBSCRIPTION_APPROVED,
            actor_id=approval.approved_by,
            actor_email=approval.approved_by,
            subscription_id=subscription_id,
            listing_id=sub.listing_id,
            details={"notes": approval.notes, "expires_in_days": approval.expires_in_days},
        ))

        # Save subscription
        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")
            # Update indexes
            self._put_index(
                f"{self.USER_SUBS_PREFIX}{sub.user_id}",
                sub.listing_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )
            self._put_index(
                f"{self.LISTING_SUBS_PREFIX}{sub.listing_id}",
                sub.user_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )

        return sub

    def deny_subscription(self, subscription_id: str, denial: SubscriptionDenial) -> Optional[Subscription]:
        """Deny a pending subscription."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None
        if sub.status != SubscriptionStatus.PENDING:
            raise ValueError(f"Subscription is not pending: {sub.status.value}")

        sub.status = SubscriptionStatus.DENIED
        sub.denied_by = denial.denied_by
        sub.denial_reason = denial.reason
        sub.updated_at = datetime.utcnow()

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.SUBSCRIPTION_DENIED,
            actor_id=denial.denied_by,
            actor_email=denial.denied_by,
            subscription_id=subscription_id,
            listing_id=sub.listing_id,
            details={"reason": denial.reason},
        ))

        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")
            # Update indexes
            self._put_index(
                f"{self.USER_SUBS_PREFIX}{sub.user_id}",
                sub.listing_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )

        return sub

    def revoke_subscription(self, subscription_id: str, revoked_by: str, reason: str = "") -> Optional[Subscription]:
        """Revoke an active subscription."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None
        if sub.status != SubscriptionStatus.ACTIVE:
            raise ValueError(f"Subscription is not active: {sub.status.value}")

        sub.status = SubscriptionStatus.REVOKED
        sub.revoked_at = datetime.utcnow()
        sub.updated_at = datetime.utcnow()
        sub.denial_reason = reason  # reusing field for revocation reason

        # Update listing subscriber count
        listing = self.get_listing(sub.listing_id)
        if listing and listing.subscriber_count > 0:
            listing.subscriber_count -= 1
            if self._is_table_available():
                self._put(f"{self.LISTING_PREFIX}{listing.id}", listing.model_dump(mode="json"), listing.id, "listing_id")

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.SUBSCRIPTION_REVOKED,
            actor_id=revoked_by,
            actor_email=revoked_by,
            subscription_id=subscription_id,
            listing_id=sub.listing_id,
            details={"reason": reason, "user_initiated": revoked_by == sub.user_id},
        ))

        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")
            self._put_index(
                f"{self.USER_SUBS_PREFIX}{sub.user_id}",
                sub.listing_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )

        return sub

    def unsubscribe(self, subscription_id: str, user_id: str) -> Optional[Subscription]:
        """User voluntarily unsubscribes."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None
        if sub.user_id != user_id:
            raise ValueError("Cannot unsubscribe another user's subscription")
        return self.revoke_subscription(subscription_id, user_id, "User unsubscribed")

    def approve_step(
        self,
        subscription_id: str,
        step_order: int,
        approved_by: str,
        notes: str = "",
    ) -> Optional[Subscription]:
        """Approve a single step in the approval chain."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None

        # Find the step
        step = next((s for s in sub.approval_chain if s.step_order == step_order), None)
        if not step:
            raise ValueError(f"Step {step_order} not found")
        if step.completed:
            raise ValueError(f"Step {step_order} already completed")
        if step_order != sub.current_approval_step + 1:
            raise ValueError(f"Must complete step {sub.current_approval_step + 1} first")

        # Mark step complete
        step.completed = True
        step.completed_at = datetime.utcnow()
        step.completed_by = approved_by
        step.decision = "approved"
        step.notes = notes
        sub.current_approval_step = step_order

        # Check if all required steps complete
        if all(s.completed and s.decision == "approved" for s in sub.approval_chain if s.required):
            sub.status = SubscriptionStatus.ACTIVE
            sub.approved_at = datetime.utcnow()
            sub.approved_by = approved_by
            # Update subscriber count on listing
            listing = self.get_listing(sub.listing_id)
            if listing:
                listing.subscriber_count += 1
                if self._is_table_available():
                    self._put(
                        f"{self.LISTING_PREFIX}{listing.id}",
                        listing.model_dump(mode="json"),
                        listing.id,
                        "listing_id",
                    )

        sub.updated_at = datetime.utcnow()

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.SUBSCRIPTION_APPROVED,
            actor_id=approved_by,
            actor_email=approved_by,
            subscription_id=subscription_id,
            listing_id=sub.listing_id,
            details={
                "step": step_order,
                "step_type": step.approver_type,
                "notes": notes,
                "all_steps_complete": sub.status == SubscriptionStatus.ACTIVE,
            },
        ))

        # Save
        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")
            # Update indexes
            self._put_index(
                f"{self.USER_SUBS_PREFIX}{sub.user_id}",
                sub.listing_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )
            self._put_index(
                f"{self.LISTING_SUBS_PREFIX}{sub.listing_id}",
                sub.user_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )

        return sub

    def deny_step(
        self,
        subscription_id: str,
        step_order: int,
        denied_by: str,
        reason: str = "",
    ) -> Optional[Subscription]:
        """Deny a step in the approval chain, rejecting the subscription."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None

        # Find the step
        step = next((s for s in sub.approval_chain if s.step_order == step_order), None)
        if not step:
            raise ValueError(f"Step {step_order} not found")
        if step.completed:
            raise ValueError(f"Step {step_order} already completed")

        # Mark step as denied
        step.completed = True
        step.completed_at = datetime.utcnow()
        step.completed_by = denied_by
        step.decision = "denied"
        step.notes = reason

        # Deny the entire subscription
        sub.status = SubscriptionStatus.DENIED
        sub.denied_by = denied_by
        sub.denial_reason = reason
        sub.updated_at = datetime.utcnow()

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.SUBSCRIPTION_DENIED,
            actor_id=denied_by,
            actor_email=denied_by,
            subscription_id=subscription_id,
            listing_id=sub.listing_id,
            details={
                "step": step_order,
                "step_type": step.approver_type,
                "reason": reason,
            },
        ))

        # Save
        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")
            self._put_index(
                f"{self.USER_SUBS_PREFIX}{sub.user_id}",
                sub.listing_id,
                {"subscription_id": sub.id, "status": sub.status.value},
            )

        return sub

    def accept_attestation(self, subscription_id: str, user_id: str) -> Optional[Subscription]:
        """Record user acceptance of attestation/terms."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None
        if sub.user_id != user_id:
            raise ValueError("Only the subscriber can accept attestation")

        sub.attestation_accepted = True
        sub.attestation_accepted_at = datetime.utcnow()
        sub.updated_at = datetime.utcnow()

        # Log audit
        self._log_audit(AuditLogEntry(
            action=AuditAction.ATTESTATION_ACCEPTED,
            actor_id=user_id,
            actor_email=sub.user_email,
            subscription_id=subscription_id,
            listing_id=sub.listing_id,
        ))

        # Save
        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")

        return sub

    def get_pending_approvals(self, approver_teams: Optional[List[str]] = None) -> PendingApprovalsResponse:
        """Get all pending subscription requests (for approvers)."""
        if not self._is_table_available():
            pending = [s for s in _demo_subscriptions() if s.status == SubscriptionStatus.PENDING]
            by_type = {}
            for s in pending:
                rt = s.resource_type.value if s.resource_type else "unknown"
                by_type[rt] = by_type.get(rt, 0) + 1
            return PendingApprovalsResponse(subscriptions=pending, total=len(pending), by_resource_type=by_type, source="demo")

        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.SUB_PREFIX))
            subs = [Subscription.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]
            pending = [s for s in subs if s.status == SubscriptionStatus.PENDING]

            # Filter by approver teams if specified
            if approver_teams:
                filtered = []
                for s in pending:
                    listing = self.get_listing(s.listing_id)
                    if listing and listing.owner_team in approver_teams:
                        filtered.append(s)
                pending = filtered

            by_type = {}
            for s in pending:
                rt = s.resource_type.value if s.resource_type else "unknown"
                by_type[rt] = by_type.get(rt, 0) + 1

            return PendingApprovalsResponse(
                subscriptions=pending,
                total=len(pending),
                by_resource_type=by_type,
                live=True,
                source="dynamodb",
            )
        except Exception as e:
            logger.warning(f"Failed to get pending approvals: {e}")
            return PendingApprovalsResponse(subscriptions=[], total=0, source="error", note=str(e))

    def get_admin_subscriptions(
        self,
        status: Optional[SubscriptionStatus] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> "AdminSubscriptionsResponse":
        """Get all subscriptions for admin view with optional status filter."""
        from models.govern_marketplace import AdminSubscriptionsResponse

        if not self._is_table_available():
            all_subs = _demo_subscriptions()
            if status:
                all_subs = [s for s in all_subs if s.status == status]

            # Calculate counts from full list (before filtering)
            full_list = _demo_subscriptions()
            active_count = sum(1 for s in full_list if s.status == SubscriptionStatus.ACTIVE)
            pending_count = sum(1 for s in full_list if s.status == SubscriptionStatus.PENDING)
            revoked_count = sum(1 for s in full_list if s.status == SubscriptionStatus.REVOKED)
            expired_count = sum(1 for s in full_list if s.status == SubscriptionStatus.EXPIRED)
            denied_count = sum(1 for s in full_list if s.status == SubscriptionStatus.DENIED)

            # Paginate
            start = (page - 1) * page_size
            end = start + page_size
            paginated = all_subs[start:end]

            return AdminSubscriptionsResponse(
                subscriptions=paginated,
                total=len(all_subs),
                active_count=active_count,
                pending_count=pending_count,
                revoked_count=revoked_count,
                expired_count=expired_count,
                denied_count=denied_count,
                source="demo",
            )

        try:
            resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.SUB_PREFIX))
            all_subs = [Subscription.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]

            # Calculate counts from full list
            active_count = sum(1 for s in all_subs if s.status == SubscriptionStatus.ACTIVE)
            pending_count = sum(1 for s in all_subs if s.status == SubscriptionStatus.PENDING)
            revoked_count = sum(1 for s in all_subs if s.status == SubscriptionStatus.REVOKED)
            expired_count = sum(1 for s in all_subs if s.status == SubscriptionStatus.EXPIRED)
            denied_count = sum(1 for s in all_subs if s.status == SubscriptionStatus.DENIED)

            # Filter by status if specified
            if status:
                all_subs = [s for s in all_subs if s.status == status]

            # Sort by created_at descending
            all_subs.sort(key=lambda s: s.created_at or datetime.min, reverse=True)

            # Paginate
            start = (page - 1) * page_size
            end = start + page_size
            paginated = all_subs[start:end]

            return AdminSubscriptionsResponse(
                subscriptions=paginated,
                total=len(all_subs),
                active_count=active_count,
                pending_count=pending_count,
                revoked_count=revoked_count,
                expired_count=expired_count,
                denied_count=denied_count,
                live=True,
                source="dynamodb",
            )
        except Exception as e:
            logger.warning(f"Failed to get admin subscriptions: {e}")
            return AdminSubscriptionsResponse(subscriptions=[], total=0, source="error", note=str(e))

    def get_pending_by_approver_type(self, approver_type: str) -> PendingApprovalsResponse:
        """Get pending subscriptions that need approval from a specific approver type."""
        all_pending = self.get_pending_approvals()

        # Filter to subscriptions where the current pending step matches the approver type
        filtered = []
        for sub in all_pending.subscriptions:
            if sub.approval_chain and sub.current_approval_step < len(sub.approval_chain):
                current_step = sub.approval_chain[sub.current_approval_step]
                if current_step.approver_type == approver_type and not current_step.completed:
                    filtered.append(sub)

        by_type = {}
        for s in filtered:
            rt = s.resource_type.value if s.resource_type else "unknown"
            by_type[rt] = by_type.get(rt, 0) + 1

        return PendingApprovalsResponse(
            subscriptions=filtered,
            total=len(filtered),
            by_resource_type=by_type,
            live=all_pending.live,
            source=all_pending.source,
        )

    def set_subscription_budget(self, subscription_id: str, budget_limit: float, alert_threshold: float = 0.8) -> Optional[Subscription]:
        """Set or update budget limit for a subscription."""
        sub = self.get_subscription(subscription_id)
        if not sub:
            return None

        sub.budget_limit = budget_limit
        sub.budget_alert_threshold = alert_threshold
        sub.updated_at = datetime.utcnow()

        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")

        return sub

    # =========================================================================
    # Entitlement Check (Runtime)
    # =========================================================================

    def check_entitlement(self, check: EntitlementCheck) -> EntitlementResult:
        """Check if a user has entitlement to a resource (for runtime enforcement)."""
        # Find listing by resource
        listings_resp = self.list_listings(status=ListingStatus.PUBLISHED)
        listing = next(
            (l for l in listings_resp.listings if l.resource_type == check.resource_type and l.resource_id == check.resource_id),
            None,
        )
        if not listing:
            self._log_audit(AuditLogEntry(
                action=AuditAction.ENTITLEMENT_CHECK_FAILED,
                actor_id=check.user_id,
                actor_email=check.user_id,
                resource_type=check.resource_type,
                resource_id=check.resource_id,
                details={"reason": "resource_not_found"},
            ))
            return EntitlementResult(entitled=False, reason="Resource not found in marketplace")

        # Check subscription
        sub = self._get_user_subscription(check.user_id, listing.id)
        if not sub:
            self._log_audit(AuditLogEntry(
                action=AuditAction.ENTITLEMENT_CHECK_FAILED,
                actor_id=check.user_id,
                actor_email=check.user_id,
                listing_id=listing.id,
                resource_type=check.resource_type,
                resource_id=check.resource_id,
                details={"reason": "no_subscription"},
            ))
            return EntitlementResult(entitled=False, reason="No subscription found")
        if sub.status != SubscriptionStatus.ACTIVE:
            self._log_audit(AuditLogEntry(
                action=AuditAction.ENTITLEMENT_CHECK_FAILED,
                actor_id=check.user_id,
                actor_email=sub.user_email,
                listing_id=listing.id,
                subscription_id=sub.id,
                resource_type=check.resource_type,
                resource_id=check.resource_id,
                details={"reason": "subscription_not_active", "status": sub.status.value},
            ))
            return EntitlementResult(entitled=False, reason=f"Subscription is {sub.status.value}")
        if sub.expires_at and sub.expires_at < datetime.utcnow():
            self._log_audit(AuditLogEntry(
                action=AuditAction.ENTITLEMENT_CHECK_FAILED,
                actor_id=check.user_id,
                actor_email=sub.user_email,
                listing_id=listing.id,
                subscription_id=sub.id,
                resource_type=check.resource_type,
                resource_id=check.resource_id,
                details={"reason": "subscription_expired"},
            ))
            return EntitlementResult(entitled=False, reason="Subscription has expired")

        # Check attestation
        if listing.requires_attestation and not sub.attestation_accepted:
            self._log_audit(AuditLogEntry(
                action=AuditAction.ENTITLEMENT_CHECK_FAILED,
                actor_id=check.user_id,
                actor_email=sub.user_email,
                listing_id=listing.id,
                subscription_id=sub.id,
                resource_type=check.resource_type,
                resource_id=check.resource_id,
                details={"reason": "attestation_required"},
            ))
            return EntitlementResult(entitled=False, reason="Attestation required but not accepted")

        # Check rate limits
        rate_limited = False
        rate_limit_remaining = None
        if sub.rate_limit_per_minute:
            # Reset minute counter if needed
            now = datetime.utcnow()
            if sub.last_rate_reset and (now - sub.last_rate_reset).total_seconds() >= 60:
                sub.invocations_this_minute = 0
                sub.last_rate_reset = now

            if sub.invocations_this_minute >= sub.rate_limit_per_minute:
                rate_limited = True
                rate_limit_remaining = 0
                self._log_audit(AuditLogEntry(
                    action=AuditAction.RATE_LIMIT_EXCEEDED,
                    actor_id=check.user_id,
                    actor_email=sub.user_email,
                    listing_id=listing.id,
                    subscription_id=sub.id,
                    resource_type=check.resource_type,
                    resource_id=check.resource_id,
                    details={
                        "limit": sub.rate_limit_per_minute,
                        "current": sub.invocations_this_minute,
                    },
                ))
            else:
                rate_limit_remaining = sub.rate_limit_per_minute - sub.invocations_this_minute

        # Check budget
        budget_remaining = None
        if sub.budget_limit:
            budget_remaining = sub.budget_limit - sub.budget_spent_this_month
            if budget_remaining <= 0:
                self._log_audit(AuditLogEntry(
                    action=AuditAction.BUDGET_EXCEEDED,
                    actor_id=check.user_id,
                    actor_email=sub.user_email,
                    listing_id=listing.id,
                    subscription_id=sub.id,
                    resource_type=check.resource_type,
                    resource_id=check.resource_id,
                    details={
                        "limit": sub.budget_limit,
                        "spent": sub.budget_spent_this_month,
                    },
                ))
                return EntitlementResult(
                    entitled=False,
                    reason="Budget exceeded",
                    subscription_id=sub.id,
                    budget_remaining=0,
                )

        # Log successful check
        self._log_audit(AuditLogEntry(
            action=AuditAction.ENTITLEMENT_CHECK_PASSED,
            actor_id=check.user_id,
            actor_email=sub.user_email,
            listing_id=listing.id,
            subscription_id=sub.id,
            resource_type=check.resource_type,
            resource_id=check.resource_id,
            details={
                "access_level": sub.requested_access_level,
                "rate_limited": rate_limited,
            },
        ))

        return EntitlementResult(
            entitled=True,
            subscription_id=sub.id,
            access_level=sub.requested_access_level,
            expires_at=sub.expires_at,
            required_guardrails=listing.required_guardrail_ids,
            policy_engine_id=listing.required_policy_engine_id,
            rate_limited=rate_limited,
            rate_limit_remaining=rate_limit_remaining,
            budget_remaining=budget_remaining,
            reason="Active subscription",
        )

    # =========================================================================
    # Usage Analytics
    # =========================================================================

    def get_usage_analytics(self, days: int = 30) -> UsageAnalyticsResponse:
        """Get usage analytics across all subscriptions.

        NOTE: ``days`` is accepted for API compatibility but is intentionally
        ignored. Usage metering (``record_usage``) only maintains rolling
        ``invocations_30d`` / ``cost_30d`` counters on each subscription; no
        timestamped usage events are persisted, so no window other than 30 days
        can be computed. The fixed window is disclosed to callers via ``note``.
        Making other windows real requires writing per-invocation usage events
        (a DynamoDB write-schema change), not a read-side change here.
        """
        if not self._is_table_available():
            subs = _demo_subscriptions()
            live = False
        else:
            try:
                resp = self.table.scan(FilterExpression=Attr("pk").begins_with(self.SUB_PREFIX))
                subs = [Subscription.model_validate(_from_ddb(json.loads(i["data"]))) for i in resp.get("Items", [])]
                live = True
            except Exception:
                subs = _demo_subscriptions()
                live = False

        active_subs = [s for s in subs if s.status == SubscriptionStatus.ACTIVE]

        # Aggregate by business unit
        bu_map: Dict[str, UsageByBusinessUnit] = {}
        for s in active_subs:
            if s.business_unit not in bu_map:
                bu_map[s.business_unit] = UsageByBusinessUnit(business_unit=s.business_unit)
            bu = bu_map[s.business_unit]
            bu.subscriber_count += 1
            bu.total_invocations_30d += s.usage.invocations_30d
            bu.total_cost_30d += s.usage.cost_30d
            if s.listing_name and s.listing_name not in bu.top_resources:
                bu.top_resources.append(s.listing_name)

        # Aggregate by resource
        res_map: Dict[str, UsageByResource] = {}
        for s in active_subs:
            if s.listing_id not in res_map:
                res_map[s.listing_id] = UsageByResource(
                    listing_id=s.listing_id,
                    listing_name=s.listing_name or "",
                    resource_type=s.resource_type or ResourceType.AGENT,
                )
            res = res_map[s.listing_id]
            res.subscriber_count += 1
            res.total_invocations_30d += s.usage.invocations_30d
            res.total_cost_30d += s.usage.cost_30d
            if s.business_unit not in res.top_business_units:
                res.top_business_units.append(s.business_unit)

        now = datetime.utcnow()
        return UsageAnalyticsResponse(
            period_start=now - timedelta(days=30),
            period_end=now,
            total_subscribers=len(active_subs),
            total_invocations=sum(s.usage.invocations_30d for s in active_subs),
            total_cost=sum(s.usage.cost_30d for s in active_subs),
            by_business_unit=sorted(bu_map.values(), key=lambda x: -x.total_cost_30d),
            by_resource=sorted(res_map.values(), key=lambda x: -x.total_cost_30d),
            live=live,
            source="aggregation",
            note=(
                "Usage totals reflect a fixed rolling 30-day window. Metering keeps only "
                "per-subscription 30-day counters (no timestamped usage events), so shorter "
                "or longer windows cannot be computed and the requested period is ignored."
            ),
        )

    # =========================================================================
    # Usage Metering (called by runtime)
    # =========================================================================

    def record_usage(
        self,
        subscription_id: str,
        invocations: int = 0,
        tokens: int = 0,
        cost: float = 0.0,
    ) -> Optional[Subscription]:
        """Record usage for a subscription (called by runtime/gateway)."""
        sub = self.get_subscription(subscription_id)
        if not sub or sub.status != SubscriptionStatus.ACTIVE:
            return None

        now = datetime.utcnow()

        # Reset rate counters if needed
        if sub.last_rate_reset:
            # Reset minute counter
            if (now - sub.last_rate_reset).total_seconds() >= 60:
                sub.invocations_this_minute = 0
            # Reset daily counter
            if (now - sub.last_rate_reset).days >= 1:
                sub.invocations_today = 0
        else:
            sub.invocations_this_minute = 0
            sub.invocations_today = 0

        # Update rate limit counters
        sub.invocations_this_minute += invocations
        sub.invocations_today += invocations
        sub.last_rate_reset = now

        # Update budget tracking
        sub.budget_spent_this_month += cost

        # Check for budget alert
        if sub.budget_limit and sub.budget_alert_threshold:
            threshold_amount = sub.budget_limit * sub.budget_alert_threshold
            # Check if we just crossed the threshold
            previous_spent = sub.budget_spent_this_month - cost
            if previous_spent < threshold_amount <= sub.budget_spent_this_month:
                self._log_audit(AuditLogEntry(
                    action=AuditAction.BUDGET_ALERT,
                    actor_id="system",
                    actor_email="system",
                    subscription_id=subscription_id,
                    listing_id=sub.listing_id,
                    details={
                        "spent": sub.budget_spent_this_month,
                        "limit": sub.budget_limit,
                        "threshold_percent": int(sub.budget_alert_threshold * 100),
                    },
                ))

        # Update usage metrics
        sub.usage.total_invocations += invocations
        sub.usage.total_tokens += tokens
        sub.usage.total_cost += cost
        sub.usage.invocations_30d += invocations
        sub.usage.cost_30d += cost
        sub.usage.last_invocation = now
        sub.updated_at = now

        if self._is_table_available():
            self._put(f"{self.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")

        return sub
