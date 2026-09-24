"""Govern Marketplace — internal resource marketplace routes.

Provides:
- Listing CRUD (admin): create, update, publish, deprecate listings
- Catalog browse (consumer): search, filter, view available resources
- Subscription management: request, approve/deny, revoke, unsubscribe
- Entitlement check: runtime verification of user access
- Usage analytics: aggregated usage by business unit and resource
"""

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from core.auth import get_current_user
from models.govern_marketplace import (
    AdminSubscriptionsResponse,
    ApprovalMode,
    AuditAction,
    AuditLogResponse,
    CatalogItemDetailResponse,
    CatalogResponse,
    DEFAULT_APPROVAL_CHAINS,
    EntitlementCheck,
    EntitlementResult,
    Listing,
    ListingCreate,
    ListingResponse,
    ListingsResponse,
    ListingStatus,
    ListingUpdate,
    MySubscriptionsResponse,
    PendingApprovalsResponse,
    ResourceType,
    Subscription,
    SubscriptionApproval,
    SubscriptionDenial,
    SubscriptionRequest,
    SubscriptionResponse,
    SubscriptionsResponse,
    SubscriptionStatus,
    UsageAnalyticsResponse,
)
from services.govern_marketplace_service import GovernMarketplaceService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/marketplace", tags=["govern-marketplace"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_marketplace", region_scope.CONTROL_PLANE, prefix="/govern/marketplace")

_svc: Optional[GovernMarketplaceService] = None


def _check_subscription_access(sub: Subscription, user, user_role: Role) -> None:
    """Check if user can access a subscription.

    Access is granted if:
    1. User owns the subscription (sub.user_id matches user.sub or user.email), OR
    2. User has OPERATOR role or higher

    Raises HTTPException 403 if access denied.
    """
    user_id = user.get("sub") if user else None
    user_email = user.get("email") if user else None

    # Check ownership
    is_owner = sub.user_id in (user_id, user_email)

    # Check role (OPERATOR=1, ADMIN=2)
    is_elevated = user_role >= Role.OPERATOR

    if not is_owner and not is_elevated:
        raise HTTPException(
            status_code=403,
            detail="Access denied: you do not own this subscription"
        )


def get_service() -> GovernMarketplaceService:
    global _svc
    if _svc is None:
        _svc = GovernMarketplaceService(
            table_name=settings.GOVERN_MARKETPLACE_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


# =============================================================================
# Listing Management (Admin)
# =============================================================================


@router.post("/listings", response_model=Listing, status_code=201)
async def create_listing(
    req: ListingCreate,
    user=Depends(get_current_user),
    _=Depends(require_role(Role.ADMIN)),
):
    """Create a new marketplace listing (starts as draft)."""
    return get_service().create_listing(req, created_by=user.get("email") if user else "system")


@router.get("/listings", response_model=ListingsResponse)
async def list_listings(
    status: Optional[ListingStatus] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    _=Depends(require_role(Role.OPERATOR)),
):
    """List all marketplace listings (admin view)."""
    return get_service().list_listings(status=status, page=page, page_size=page_size)


@router.get("/listings/{listing_id}", response_model=ListingResponse)
async def get_listing(listing_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get a listing by ID."""
    listing = get_service().get_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return ListingResponse(listing=listing)


@router.put("/listings/{listing_id}", response_model=Listing)
async def update_listing(
    listing_id: str,
    req: ListingUpdate,
    _=Depends(require_role(Role.ADMIN)),
):
    """Update a marketplace listing."""
    listing = get_service().update_listing(listing_id, req)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@router.delete("/listings/{listing_id}", response_model=Listing)
async def delete_listing(listing_id: str, _=Depends(require_role(Role.ADMIN))):
    """Delete a marketplace listing."""
    listing = get_service().delete_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@router.post("/listings/{listing_id}/publish", response_model=Listing)
async def publish_listing(listing_id: str, _=Depends(require_role(Role.ADMIN))):
    """Publish a listing to make it visible in the catalog."""
    listing = get_service().publish_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@router.post("/listings/{listing_id}/unpublish", response_model=Listing)
async def unpublish_listing(listing_id: str, _=Depends(require_role(Role.ADMIN))):
    """Unpublish a listing (set to draft)."""
    listing = get_service().unpublish_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@router.post("/listings/{listing_id}/deprecate", response_model=Listing)
async def deprecate_listing(listing_id: str, _=Depends(require_role(Role.ADMIN))):
    """Mark a listing as deprecated."""
    listing = get_service().deprecate_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


# =============================================================================
# Catalog (Consumer View)
# =============================================================================


@router.get("/catalog", response_model=CatalogResponse)
async def browse_catalog(
    resource_type: Optional[ResourceType] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user=Depends(get_current_user),
    _=Depends(require_role(Role.VIEWER)),
):
    """Browse the marketplace catalog (consumer view)."""
    user_id = user.get("sub") if user else "anonymous"
    user_teams = []  # TODO: extract teams from user claims
    return get_service().browse_catalog(
        user_id=user_id,
        user_teams=user_teams,
        resource_type=resource_type,
        category=category,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/catalog/{listing_id}", response_model=CatalogItemDetailResponse)
async def get_catalog_item(
    listing_id: str,
    user=Depends(get_current_user),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get detailed view of a catalog item."""
    user_id = user.get("sub") if user else "anonymous"
    item = get_service().get_catalog_item(listing_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    return item


# =============================================================================
# Subscription Management
# =============================================================================


@router.post("/subscriptions", response_model=SubscriptionResponse, status_code=201)
async def request_subscription(
    req: SubscriptionRequest,
    user=Depends(get_current_user),
    _=Depends(require_role(Role.VIEWER)),
):
    """Request a subscription to a resource."""
    # Override user_id and email from auth token
    if user:
        req.user_id = user.get("sub")
        req.user_email = user.get("email")
    try:
        sub, auto_approved = get_service().request_subscription(req)
        note = "Auto-approved" if auto_approved else "Pending approval"
        return SubscriptionResponse(subscription=sub, note=note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/subscriptions/mine", response_model=MySubscriptionsResponse)
async def get_my_subscriptions(
    user=Depends(get_current_user),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get the current user's subscriptions."""
    user_id = user.get("sub") if user else "anonymous"
    return get_service().get_my_subscriptions(user_id)


@router.get("/subscriptions/pending", response_model=PendingApprovalsResponse)
async def get_pending_approvals(
    user=Depends(get_current_user),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Get pending subscription requests (for approvers)."""
    # TODO: filter by user's teams when team-based approval is implemented
    return get_service().get_pending_approvals()


@router.get("/subscriptions/admin", response_model=AdminSubscriptionsResponse)
async def get_admin_subscriptions(
    status: Optional[SubscriptionStatus] = Query(None, description="Filter by subscription status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Items per page"),
    user=Depends(get_current_user),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Get all subscriptions for admin view with optional status filter."""
    return get_service().get_admin_subscriptions(status=status, page=page, page_size=page_size)


@router.get("/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
async def get_subscription(
    subscription_id: str,
    user=Depends(get_current_user),
    user_role: Role = Depends(require_role(Role.VIEWER)),
):
    """Get a subscription by ID."""
    sub = get_service().get_subscription(subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    _check_subscription_access(sub, user, user_role)
    listing = get_service().get_listing(sub.listing_id)
    return SubscriptionResponse(subscription=sub, listing=listing)


@router.post("/subscriptions/{subscription_id}/approve", response_model=Subscription)
async def approve_subscription(
    subscription_id: str,
    approval: SubscriptionApproval,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Approve a pending subscription request."""
    try:
        sub = get_service().approve_subscription(subscription_id, approval)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return sub
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/subscriptions/{subscription_id}/deny", response_model=Subscription)
async def deny_subscription(
    subscription_id: str,
    denial: SubscriptionDenial,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Deny a pending subscription request."""
    try:
        sub = get_service().deny_subscription(subscription_id, denial)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return sub
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/subscriptions/{subscription_id}/revoke", response_model=Subscription)
async def revoke_subscription(
    subscription_id: str,
    reason: str = "",
    user=Depends(get_current_user),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Revoke an active subscription."""
    revoked_by = user.get("email") if user else "system"
    try:
        sub = get_service().revoke_subscription(subscription_id, revoked_by, reason)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return sub
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/subscriptions/{subscription_id}")
async def unsubscribe(
    subscription_id: str,
    user=Depends(get_current_user),
    _=Depends(require_role(Role.VIEWER)),
):
    """Unsubscribe from a resource (user action)."""
    user_id = user.get("sub") if user else "anonymous"
    try:
        sub = get_service().unsubscribe(subscription_id, user_id)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return {"status": "unsubscribed", "subscription_id": subscription_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Entitlement Check (Runtime)
# =============================================================================


@router.post("/entitlement/check", response_model=EntitlementResult)
async def check_entitlement(
    check: EntitlementCheck,
    _=Depends(require_role(Role.VIEWER)),
):
    """Check if a user has entitlement to a resource (for runtime enforcement)."""
    return get_service().check_entitlement(check)


# =============================================================================
# Usage Analytics
# =============================================================================


@router.get("/analytics/usage", response_model=UsageAnalyticsResponse)
async def get_usage_analytics(
    days: int = Query(30, ge=1, le=90),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Get usage analytics across all subscriptions.

    ``days`` is accepted for compatibility but ignored: metering keeps only
    rolling 30-day counters, so totals always describe a 30-day window. The
    response ``note`` field states this to callers.
    """
    return get_service().get_usage_analytics(days=days)


# =============================================================================
# Usage Recording (Internal/Gateway)
# =============================================================================


@router.post("/subscriptions/{subscription_id}/usage")
async def record_usage(
    subscription_id: str,
    invocations: int = 0,
    tokens: int = 0,
    cost: float = 0.0,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Record usage for a subscription (called by runtime/gateway)."""
    sub = get_service().record_usage(subscription_id, invocations, tokens, cost)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found or not active")
    return {"status": "recorded", "subscription_id": subscription_id}


# =============================================================================
# Approval Chain Management
# =============================================================================


@router.post("/subscriptions/{subscription_id}/approve-step")
async def approve_step(
    subscription_id: str,
    step_order: int = Query(..., ge=1),
    notes: str = "",
    user=Depends(get_current_user),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Approve a single step in the multi-level approval chain."""
    approved_by = user.get("email") if user else "system"
    try:
        sub = get_service().approve_step(subscription_id, step_order, approved_by, notes)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return {"subscription": sub, "step_approved": step_order, "fully_approved": sub.status == SubscriptionStatus.ACTIVE}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/subscriptions/{subscription_id}/deny-step")
async def deny_step(
    subscription_id: str,
    step_order: int = Query(..., ge=1),
    reason: str = Query(..., min_length=1),
    user=Depends(get_current_user),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Deny a step in the approval chain (denies the whole subscription)."""
    denied_by = user.get("email") if user else "system"
    try:
        sub = get_service().deny_step(subscription_id, step_order, denied_by, reason)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return sub
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/subscriptions/{subscription_id}/approval-status")
async def get_approval_status(
    subscription_id: str,
    user=Depends(get_current_user),
    user_role: Role = Depends(require_role(Role.VIEWER)),
):
    """Get the approval chain status for a subscription."""
    sub = get_service().get_subscription(subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    _check_subscription_access(sub, user, user_role)

    return {
        "subscription_id": subscription_id,
        "status": sub.status,
        "approval_chain": sub.approval_chain,
        "current_step": sub.current_approval_step,
        "total_steps": len(sub.approval_chain),
        "pending_approver_type": sub.approval_chain[sub.current_approval_step].approver_type if sub.current_approval_step < len(sub.approval_chain) else None
    }


# =============================================================================
# Attestation Management
# =============================================================================


@router.post("/subscriptions/{subscription_id}/accept-attestation")
async def accept_attestation(
    subscription_id: str,
    user=Depends(get_current_user),
    _=Depends(require_role(Role.VIEWER)),
):
    """Accept the attestation/terms for a subscription."""
    user_id = user.get("sub") if user else "anonymous"
    try:
        sub = get_service().accept_attestation(subscription_id, user_id)
        if not sub:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return {"status": "attestation_accepted", "subscription_id": subscription_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/subscriptions/{subscription_id}/attestation")
async def get_attestation(
    subscription_id: str,
    user=Depends(get_current_user),
    user_role: Role = Depends(require_role(Role.VIEWER)),
):
    """Get attestation requirements for a subscription."""
    sub = get_service().get_subscription(subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    _check_subscription_access(sub, user, user_role)

    listing = get_service().get_listing(sub.listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    return {
        "requires_attestation": listing.requires_attestation,
        "attestation_text": listing.attestation_text,
        "attestation_accepted": sub.attestation_accepted,
        "attestation_accepted_at": sub.attestation_accepted_at
    }


# =============================================================================
# Audit Log
# =============================================================================


@router.get("/audit-log", response_model=AuditLogResponse)
async def get_audit_log(
    listing_id: Optional[str] = None,
    subscription_id: Optional[str] = None,
    action: Optional[AuditAction] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Query the audit log with filters."""
    return get_service().get_audit_log(
        listing_id=listing_id,
        subscription_id=subscription_id,
        action=action,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size
    )


@router.get("/subscriptions/{subscription_id}/audit-log", response_model=AuditLogResponse)
async def get_subscription_audit_log(
    subscription_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    user_role: Role = Depends(require_role(Role.VIEWER)),
):
    """Get audit log for a specific subscription."""
    sub = get_service().get_subscription(subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    _check_subscription_access(sub, user, user_role)
    return get_service().get_audit_log(subscription_id=subscription_id, page=page, page_size=page_size)


# =============================================================================
# Budget Management
# =============================================================================


@router.put("/subscriptions/{subscription_id}/budget")
async def set_budget(
    subscription_id: str,
    budget_limit: float = Query(..., ge=0),
    alert_threshold: float = Query(0.8, ge=0, le=1),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Set or update budget limit for a subscription."""
    sub = get_service().set_subscription_budget(subscription_id, budget_limit, alert_threshold)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"subscription_id": subscription_id, "budget_limit": budget_limit, "alert_threshold": alert_threshold}


@router.get("/subscriptions/{subscription_id}/budget-status")
async def get_budget_status(
    subscription_id: str,
    user=Depends(get_current_user),
    user_role: Role = Depends(require_role(Role.VIEWER)),
):
    """Get budget status for a subscription."""
    sub = get_service().get_subscription(subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    _check_subscription_access(sub, user, user_role)

    return {
        "budget_limit": sub.budget_limit,
        "budget_spent_this_month": sub.budget_spent_this_month,
        "budget_remaining": (sub.budget_limit - sub.budget_spent_this_month) if sub.budget_limit else None,
        "alert_threshold": sub.budget_alert_threshold,
        "percentage_used": (sub.budget_spent_this_month / sub.budget_limit * 100) if sub.budget_limit else None
    }


# =============================================================================
# Governance Information
# =============================================================================


@router.get("/listings/{listing_id}/governance")
async def get_listing_governance(
    listing_id: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get governance requirements for a listing."""
    listing = get_service().get_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    return {
        "listing_id": listing_id,
        "risk_level": listing.risk_level,
        "approval_required": listing.approval_mode == ApprovalMode.REQUIRE_APPROVAL,
        "approval_chain_length": len(DEFAULT_APPROVAL_CHAINS.get(listing.risk_level, [])),
        "required_guardrails": listing.required_guardrail_ids,
        "required_policy_engine": listing.required_policy_engine_id,
        "data_classification": listing.data_classification,
        "compliance_frameworks": listing.compliance_frameworks,
        "requires_attestation": listing.requires_attestation,
        "rate_limit_per_minute": listing.rate_limit_per_minute,
        "rate_limit_per_day": listing.rate_limit_per_day,
        "default_budget_limit": listing.default_budget_limit,
        "recertification_enabled": listing.recertification.enabled if hasattr(listing, 'recertification') else False,
        "recertification_interval_days": listing.recertification.interval_days if hasattr(listing, 'recertification') else None
    }


# =============================================================================
# Pending Approvals by Type
# =============================================================================


@router.get("/approvals/pending/by-type/{approver_type}")
async def get_pending_by_approver_type(
    approver_type: str,
    user=Depends(get_current_user),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Get pending approvals for a specific approver type (owner_team, compliance, security, executive)."""
    return get_service().get_pending_by_approver_type(approver_type)
