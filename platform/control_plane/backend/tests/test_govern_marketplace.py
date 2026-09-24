"""Unit tests for Govern Marketplace service - subscription workflow and entitlement checking.

Tests cover the core business logic of the marketplace:
- Subscription request workflow with approval chains based on risk level
- Auto-approval for low-risk resources
- Multi-step approval chain progression
- Entitlement checking for runtime enforcement
- Attestation requirements

Uses mock DynamoDB (same pattern as test_govern_tablefree.py) to test
service layer directly without infrastructure.
"""

import os
import sys
from datetime import datetime, timedelta

import pytest

# Govern services import cleanly with src on the path (requires venv312 with deps).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "src")))

from botocore.exceptions import ClientError  # noqa: E402

from services.govern_marketplace_service import GovernMarketplaceService  # noqa: E402
from models.govern_marketplace import (  # noqa: E402
    ApprovalMode,
    ApprovalStep,
    EntitlementCheck,
    Listing,
    ListingCreate,
    ListingStatus,
    ResourceType,
    RiskLevel,
    Subscription,
    SubscriptionApproval,
    SubscriptionDenial,
    SubscriptionRequest,
    SubscriptionStatus,
)


_NOT_FOUND = ClientError(
    {"Error": {"Code": "ResourceNotFoundException", "Message": "Requested resource not found"}},
    "PutItem",
)


class _MockTable:
    """In-memory DynamoDB table mock for testing."""

    def __init__(self):
        self._store = {}

    def put_item(self, **kwargs):
        item = kwargs.get("Item", {})
        pk = item.get("pk")
        sk = item.get("sk", "LATEST")
        self._store[(pk, sk)] = item

    def get_item(self, **kwargs):
        key = kwargs.get("Key", {})
        pk = key.get("pk")
        sk = key.get("sk", "LATEST")
        item = self._store.get((pk, sk))
        return {"Item": item} if item else {}

    def query(self, **kwargs):
        # Simple prefix query support
        key_cond = kwargs.get("KeyConditionExpression")
        if key_cond:
            # Extract pk from condition
            pk_prefix = str(key_cond._values[1])
            items = [v for (k, _), v in self._store.items() if k == pk_prefix]
            return {"Items": items}
        return {"Items": []}

    def scan(self, **kwargs):
        filter_exp = kwargs.get("FilterExpression")
        items = list(self._store.values())
        if filter_exp:
            # Simple begins_with filter support
            prefix = None
            if hasattr(filter_exp, "_values"):
                for v in filter_exp._values:
                    if isinstance(v, str) and "#" in v:
                        prefix = v
                        break
            if prefix:
                items = [i for i in items if i.get("pk", "").startswith(prefix)]
        return {"Items": items}

    def delete_item(self, **kwargs):
        key = kwargs.get("Key", {})
        pk = key.get("pk")
        sk = key.get("sk", "LATEST")
        self._store.pop((pk, sk), None)

    @property
    def table_status(self):
        return "ACTIVE"


def _create_service() -> GovernMarketplaceService:
    """Create a service instance with mock table."""
    svc = GovernMarketplaceService.__new__(GovernMarketplaceService)
    svc.table_name = "test-marketplace"
    svc.region = "us-east-1"
    svc.table = _MockTable()
    svc._table_available = True
    return svc


def _create_low_risk_listing(svc: GovernMarketplaceService) -> Listing:
    """Create a published low-risk listing with auto-approve."""
    listing = svc.create_listing(
        ListingCreate(
            name="Test Knowledge Base",
            description="Low-risk read-only knowledge base",
            resource_type=ResourceType.KNOWLEDGE_BASE,
            resource_id="kb-test-001",
            owner_team="Platform Team",
            owner_email="platform@example.com",
            risk_level=RiskLevel.LOW,
            approval_mode=ApprovalMode.AUTO_APPROVE,
            requires_attestation=False,
        ),
        created_by="admin@example.com",
    )
    return svc.publish_listing(listing.id, published_by="admin@example.com")


def _create_medium_risk_listing(svc: GovernMarketplaceService) -> Listing:
    """Create a published medium-risk listing requiring approval."""
    listing = svc.create_listing(
        ListingCreate(
            name="Test MCP Server",
            description="Medium-risk MCP server with write access",
            resource_type=ResourceType.MCP_SERVER,
            resource_id="mcp-test-001",
            owner_team="Data Platform",
            owner_email="data@example.com",
            risk_level=RiskLevel.MEDIUM,
            approval_mode=ApprovalMode.REQUIRE_APPROVAL,
            requires_attestation=False,
        ),
        created_by="admin@example.com",
    )
    return svc.publish_listing(listing.id, published_by="admin@example.com")


def _create_high_risk_listing(svc: GovernMarketplaceService) -> Listing:
    """Create a published high-risk listing requiring compliance + security approval."""
    listing = svc.create_listing(
        ListingCreate(
            name="Test Agent",
            description="High-risk agent with PII access",
            resource_type=ResourceType.AGENT,
            resource_id="agt-test-001",
            owner_team="Compliance Engineering",
            owner_email="compliance@example.com",
            risk_level=RiskLevel.HIGH,
            approval_mode=ApprovalMode.REQUIRE_APPROVAL,
            requires_attestation=True,
            attestation_text="I acknowledge this agent processes PII data.",
            required_guardrail_ids=["gr-pii-filter", "gr-content-safety"],
            required_policy_engine_id="pe-compliance",
        ),
        created_by="admin@example.com",
    )
    return svc.publish_listing(listing.id, published_by="admin@example.com")


def _create_critical_risk_listing(svc: GovernMarketplaceService) -> Listing:
    """Create a published critical-risk listing with full approval chain."""
    listing = svc.create_listing(
        ListingCreate(
            name="Fraud Detection Agent",
            description="Critical agent with financial data access",
            resource_type=ResourceType.AGENT,
            resource_id="agt-fraud-001",
            owner_team="Risk Engineering",
            owner_email="risk@example.com",
            risk_level=RiskLevel.CRITICAL,
            approval_mode=ApprovalMode.REQUIRE_APPROVAL,
            requires_attestation=True,
            attestation_text="I acknowledge this agent accesses financial records.",
            required_guardrail_ids=["gr-pii-filter", "gr-financial-data"],
        ),
        created_by="admin@example.com",
    )
    return svc.publish_listing(listing.id, published_by="admin@example.com")


def _create_subscription_request(listing_id: str) -> SubscriptionRequest:
    """Create a standard subscription request."""
    return SubscriptionRequest(
        listing_id=listing_id,
        user_id="user-test-001",
        user_email="test.user@example.com",
        business_unit="Retail Banking",
        cost_center="CC-1001",
        justification="Need access for Q3 project",
    )


# =============================================================================
# Subscription Workflow Tests (7 tests)
# =============================================================================


def test_request_subscription_creates_pending_status():
    """Requesting a subscription to a REQUIRE_APPROVAL listing creates PENDING status."""
    svc = _create_service()
    listing = _create_medium_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, auto_approved = svc.request_subscription(req)

    assert sub is not None
    assert sub.status == SubscriptionStatus.PENDING
    assert not auto_approved
    assert sub.listing_id == listing.id
    assert sub.user_id == req.user_id
    assert sub.business_unit == req.business_unit
    assert sub.current_approval_step == 0
    assert len(sub.approval_chain) >= 1


def test_request_subscription_auto_approves_low_risk():
    """Low-risk resources with AUTO_APPROVE mode and no attestation auto-approve."""
    svc = _create_service()
    listing = _create_low_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, auto_approved = svc.request_subscription(req)

    assert sub is not None
    assert sub.status == SubscriptionStatus.ACTIVE
    assert auto_approved
    assert sub.approved_at is not None
    assert sub.approved_by == "auto"
    # All approval steps should be auto-completed
    for step in sub.approval_chain:
        assert step.completed
        assert step.completed_by == "auto"
        assert step.decision == "approved"


def test_request_subscription_builds_approval_chain_by_risk():
    """Approval chain length should vary based on risk level."""
    svc = _create_service()

    # Low risk: 1 step (owner_team)
    low_listing = _create_low_risk_listing(svc)
    # Override to REQUIRE_APPROVAL to see the chain
    low_listing.approval_mode = ApprovalMode.REQUIRE_APPROVAL
    svc._put(
        f"{svc.LISTING_PREFIX}{low_listing.id}",
        low_listing.model_dump(mode="json"),
        low_listing.id,
        "listing_id",
    )
    req_low = _create_subscription_request(low_listing.id)
    req_low.user_id = "user-low"
    sub_low, _ = svc.request_subscription(req_low)
    assert len(sub_low.approval_chain) == 1  # owner_team only

    # High risk: 2 steps (owner_team + compliance)
    high_listing = _create_high_risk_listing(svc)
    req_high = _create_subscription_request(high_listing.id)
    req_high.user_id = "user-high"
    sub_high, _ = svc.request_subscription(req_high)
    assert len(sub_high.approval_chain) == 2  # owner_team + compliance

    # Critical risk: 4 steps (owner_team + compliance + security + executive)
    critical_listing = _create_critical_risk_listing(svc)
    req_critical = _create_subscription_request(critical_listing.id)
    req_critical.user_id = "user-critical"
    sub_critical, _ = svc.request_subscription(req_critical)
    assert len(sub_critical.approval_chain) == 4
    approver_types = [s.approver_type for s in sub_critical.approval_chain]
    assert "owner_team" in approver_types
    assert "compliance" in approver_types
    assert "security" in approver_types
    assert "executive" in approver_types


def test_approve_step_advances_chain():
    """Approving a step should advance current_approval_step."""
    svc = _create_service()
    listing = _create_high_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, _ = svc.request_subscription(req)
    assert sub.current_approval_step == 0

    # Approve step 1 (owner_team)
    sub = svc.approve_step(sub.id, step_order=1, approved_by="owner@example.com", notes="Approved")
    assert sub.current_approval_step == 1
    assert sub.approval_chain[0].completed
    assert sub.approval_chain[0].decision == "approved"
    assert sub.approval_chain[0].completed_by == "owner@example.com"

    # Subscription should still be pending (need compliance approval)
    assert sub.status == SubscriptionStatus.PENDING


def test_approve_final_step_activates_subscription():
    """Completing all approval steps should activate the subscription."""
    svc = _create_service()
    listing = _create_high_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, _ = svc.request_subscription(req)

    # High risk has 2 steps: owner_team + compliance
    assert len(sub.approval_chain) == 2

    # Approve step 1
    sub = svc.approve_step(sub.id, step_order=1, approved_by="owner@example.com")
    assert sub.status == SubscriptionStatus.PENDING

    # Approve step 2 (final)
    sub = svc.approve_step(sub.id, step_order=2, approved_by="compliance@example.com")
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.approved_at is not None
    assert sub.approved_by == "compliance@example.com"


def test_deny_step_denies_entire_subscription():
    """Denying any step in the approval chain should deny the entire subscription."""
    svc = _create_service()
    listing = _create_critical_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, _ = svc.request_subscription(req)

    # Approve first step
    sub = svc.approve_step(sub.id, step_order=1, approved_by="owner@example.com")
    assert sub.status == SubscriptionStatus.PENDING

    # Deny second step
    sub = svc.deny_step(sub.id, step_order=2, denied_by="compliance@example.com", reason="Insufficient justification")
    assert sub.status == SubscriptionStatus.DENIED
    assert sub.denied_by == "compliance@example.com"
    assert sub.denial_reason == "Insufficient justification"

    # The denied step should be marked as completed with denied decision
    step2 = sub.approval_chain[1]
    assert step2.completed
    assert step2.decision == "denied"
    assert step2.notes == "Insufficient justification"


def test_existing_subscription_prevents_duplicate():
    """Cannot create duplicate subscription for same user/listing combination."""
    svc = _create_service()
    listing = _create_medium_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub1, _ = svc.request_subscription(req)
    assert sub1.status == SubscriptionStatus.PENDING

    # Attempt second subscription should raise
    with pytest.raises(ValueError, match="already has a pending subscription"):
        svc.request_subscription(req)

    # Activate the first subscription
    sub1 = svc.approve_step(sub1.id, step_order=1, approved_by="approver@example.com")

    # Attempt third subscription should also raise (now active)
    with pytest.raises(ValueError, match="already has a active subscription"):
        svc.request_subscription(req)


# =============================================================================
# Entitlement Checking Tests (6 tests)
# =============================================================================


def test_entitlement_check_passes_for_active_subscription():
    """Active subscription should pass entitlement check."""
    svc = _create_service()
    listing = _create_low_risk_listing(svc)  # Auto-approves

    req = _create_subscription_request(listing.id)
    sub, auto_approved = svc.request_subscription(req)
    assert auto_approved
    assert sub.status == SubscriptionStatus.ACTIVE

    # Check entitlement
    check = EntitlementCheck(
        user_id=req.user_id,
        resource_type=listing.resource_type,
        resource_id=listing.resource_id,
    )
    result = svc.check_entitlement(check)

    assert result.entitled
    assert result.subscription_id == sub.id
    assert result.reason == "Active subscription"


def test_entitlement_check_fails_for_no_subscription():
    """No subscription should fail entitlement check."""
    svc = _create_service()
    listing = _create_medium_risk_listing(svc)

    # Check entitlement without subscription
    check = EntitlementCheck(
        user_id="user-no-sub",
        resource_type=listing.resource_type,
        resource_id=listing.resource_id,
    )
    result = svc.check_entitlement(check)

    assert not result.entitled
    assert result.subscription_id is None
    assert "No subscription found" in result.reason


def test_entitlement_check_fails_for_pending_subscription():
    """Pending subscription should fail entitlement check."""
    svc = _create_service()
    listing = _create_medium_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, auto_approved = svc.request_subscription(req)
    assert not auto_approved
    assert sub.status == SubscriptionStatus.PENDING

    # Check entitlement
    check = EntitlementCheck(
        user_id=req.user_id,
        resource_type=listing.resource_type,
        resource_id=listing.resource_id,
    )
    result = svc.check_entitlement(check)

    assert not result.entitled
    assert "pending" in result.reason.lower()


def test_entitlement_check_fails_for_expired_subscription():
    """Expired subscription should fail entitlement check."""
    svc = _create_service()
    listing = _create_low_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, auto_approved = svc.request_subscription(req)
    assert auto_approved

    # Manually expire the subscription
    sub.expires_at = datetime.utcnow() - timedelta(days=1)
    svc._put(f"{svc.SUB_PREFIX}{sub.id}", sub.model_dump(mode="json"), sub.id, "subscription_id")

    # Check entitlement
    check = EntitlementCheck(
        user_id=req.user_id,
        resource_type=listing.resource_type,
        resource_id=listing.resource_id,
    )
    result = svc.check_entitlement(check)

    assert not result.entitled
    assert "expired" in result.reason.lower()


def test_entitlement_check_requires_attestation():
    """Subscription to attestation-required listing must have attestation accepted."""
    svc = _create_service()
    listing = _create_high_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, _ = svc.request_subscription(req)

    # Complete approval chain
    sub = svc.approve_step(sub.id, step_order=1, approved_by="owner@example.com")
    sub = svc.approve_step(sub.id, step_order=2, approved_by="compliance@example.com")
    assert sub.status == SubscriptionStatus.ACTIVE

    # Attestation not yet accepted
    assert not sub.attestation_accepted

    # Check entitlement should fail
    check = EntitlementCheck(
        user_id=req.user_id,
        resource_type=listing.resource_type,
        resource_id=listing.resource_id,
    )
    result = svc.check_entitlement(check)

    assert not result.entitled
    assert "attestation" in result.reason.lower()

    # Now accept attestation
    sub = svc.accept_attestation(sub.id, req.user_id)
    assert sub.attestation_accepted

    # Check again - should pass
    result = svc.check_entitlement(check)
    assert result.entitled


def test_entitlement_returns_required_guardrails():
    """Entitlement result should include required guardrails from the listing."""
    svc = _create_service()
    listing = _create_high_risk_listing(svc)

    req = _create_subscription_request(listing.id)
    sub, _ = svc.request_subscription(req)

    # Complete approval chain
    sub = svc.approve_step(sub.id, step_order=1, approved_by="owner@example.com")
    sub = svc.approve_step(sub.id, step_order=2, approved_by="compliance@example.com")

    # Accept attestation
    sub = svc.accept_attestation(sub.id, req.user_id)

    # Check entitlement
    check = EntitlementCheck(
        user_id=req.user_id,
        resource_type=listing.resource_type,
        resource_id=listing.resource_id,
    )
    result = svc.check_entitlement(check)

    assert result.entitled
    assert result.required_guardrails == ["gr-pii-filter", "gr-content-safety"]
    assert result.policy_engine_id == "pe-compliance"
