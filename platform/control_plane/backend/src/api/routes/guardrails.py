"""Guardrail template CRUD API routes"""

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from typing import Optional, List
import logging

from models.guardrail import (
    GuardrailTemplate,
    GuardrailTemplateCreate,
    GuardrailTemplateUpdate,
    GuardrailStatus,
    GuardrailPreset,
    GuardrailMetrics,
)
from services.guardrail_service import GuardrailService
from core.aws_paging import paginate_bounded
from core.config import settings
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/guardrails", tags=["guardrails"])

# bedrock:ListGuardrails maxResults maximum, per the botocore service model. Named rather
# than inlined so the value is stated once and a test can pin it; the original 50 was a round
# number that read like a performance knob and became a ceiling on a reported total.
_GUARDRAIL_PAGE = 1000
_GUARDRAIL_MAX_ITEMS = 2000

_svc = None


def get_service() -> GuardrailService:
    global _svc
    if _svc is None:
        # No region argument: GuardrailService resolves two regions per tier - the
        # template table in the control-plane region, Bedrock and its CloudWatch
        # metrics in the governed region. Passing settings.AWS_REGION here (as this
        # site used to) sent the DynamoDB lookup and the Bedrock calls to the same
        # region, so a split deployment returned an empty 200 from both.
        _svc = GuardrailService(table_name=settings.GUARDRAILS_TABLE_NAME)
    return _svc


# --- Presets ---

@router.get("/presets", response_model=List[GuardrailPreset])
async def list_presets(_=Depends(require_role(Role.VIEWER))):
    """Get pre-built guardrail configuration presets"""
    svc = get_service()
    return svc.get_presets()


# --- Discovery (must be before parameterized routes) ---

@router.post("/discover")
async def discover_guardrails(_=Depends(require_role(Role.OPERATOR))):
    """Discover and sync Bedrock Guardrails from AWS account.

    Lists all guardrails in the connected AWS account and imports any that
    aren't already tracked in the inventory. Returns a summary of what was
    discovered and synced.
    """
    svc = get_service()
    return svc.discover_aws_guardrails()


@router.get("/aws-summary")
async def get_aws_guardrails_summary(_=Depends(require_role(Role.VIEWER))):
    """Get a summary of guardrails in the AWS account vs tracked inventory.

    NOTE: Guardrails are automatically synced from AWS:
    - On backend startup
    - Every 5 minutes when the guardrails list is queried
    - Manually via POST /discover

    This endpoint shows the current sync status without triggering a sync.
    """
    svc = get_service()
    try:
        # Get tracked guardrails (skip auto_sync to show current state).
        #
        # Exclude DELETED rows from the drift comparison, matching reconcile_orphans.
        # Without this the drift never clears: reconciliation closes an orphan row by
        # setting status=deleted, but a closed row still carries its guardrail_id, so
        # counting it as tracked kept reporting the same orphan forever and made the
        # reconcile endpoint look ineffective.
        all_rows = svc.list_templates(auto_sync=False)
        tracked = [t for t in all_rows if str(getattr(t.status, "value", t.status)) != "deleted"]
        tracked_ids = {t.guardrail_id for t in tracked if t.guardrail_id}
        closed_rows = len(all_rows) - len(tracked)

        # List AWS guardrails.
        #
        # This was `list_guardrails(maxResults=50)` with no paging, against an API maximum
        # of 1000. Every number below is derived from the result and every one is rendered
        # as a measurement: `aws_total`, and worse, `orphaned = tracked_ids - aws_ids`. A
        # truncated read does not just undercount `aws_total`, it FABRICATES orphans - the
        # 51st guardrail onward is missing from `aws_ids`, so a live guardrail's row is
        # reported as pointing at nothing, `in_sync` flips to False, and `drift_note`
        # explains at length that enforcement is over-reported. It is now paged.
        read = paginate_bounded(
            svc.bedrock_client, "list_guardrails", "guardrails",
            page_size=_GUARDRAIL_PAGE, max_items=_GUARDRAIL_MAX_ITEMS,
        )
        aws_guardrails = read.items

        aws_ids = {g.get("id") for g in aws_guardrails}

        # A bounded or failed walk cannot support a set difference in either direction, so
        # the drift verdict is withheld rather than guessed. `read.note` is None when the
        # walk was complete, which is what keeps this from being a reflexive caveat.
        listing_note = read.note

        # Drift runs in BOTH directions and this endpoint only looked one way.
        #
        # `untracked` is an AWS guardrail with no template row - something created outside
        # the platform. `orphaned` is the opposite: a template row whose guardrail no longer
        # exists in AWS, because it was deleted there or never finished creating. Only the
        # first was computed, so `in_sync` reported True while rows pointed at nothing.
        #
        # Measured on the reference account: 7 guardrails in AWS, 11 tracked rows all marked
        # active, untracked_in_aws 0, in_sync True. The 7 and the 11 sat in the same payload
        # contradicting the flag. Four rows were stale. Their ids are deliberately not
        # quoted here: they name live guardrails in the reference account, and this repo is
        # published. `GET /guardrails/aws-summary` returns them as `orphaned_ids` at runtime,
        # which is where an id belongs - a comment cannot go stale safely.
        untracked = aws_ids - tracked_ids
        # `orphaned` is only computable from a COMPLETE listing. On a truncated read the
        # unread tail is indistinguishable from absent, so every guardrail past the bound
        # would be reported as an orphaned row. `untracked` survives truncation: an id that
        # did come back from AWS with no template row is untracked whether or not more ids
        # exist beyond the bound, so it is a floor rather than a fabrication.
        orphaned = (tracked_ids - aws_ids) if read.complete else set()

        import time
        from services.guardrail_service import GuardrailService
        last_sync = GuardrailService._last_sync_time
        seconds_since_sync = int(time.time() - last_sync) if last_sync > 0 else None

        return {
            "auto_sync_enabled": True,
            "sync_interval_seconds": GuardrailService._SYNC_INTERVAL_SECONDS,
            "last_sync_seconds_ago": seconds_since_sync,
            # null, not 0, when the listing failed. A 0 there is an artifact of the failure
            # and says nothing about the account, and nothing downstream could tell it apart
            # from an account with no guardrails.
            "aws_total": len(aws_guardrails) if not read.failed else None,
            # True means aws_total is a FLOOR, not a total: read it with listing_note.
            "aws_total_is_floor": read.truncated or read.timed_out,
            "listing_note": listing_note,
            "tracked_total": len(tracked),
            # Rows closed by reconciliation - reported so the count difference between
            # tracked_total and the raw row count is explained rather than puzzling.
            "closed_rows": closed_rows,
            "tracked_with_bedrock_id": len(tracked_ids),
            "untracked_in_aws": len(untracked),
            # A template row pointing at a guardrail that is not in AWS. The row typically
            # still says status=active, so anything counting rows over-reports enforcement.
            # null, not 0, on an incomplete listing: 0 would assert there are none.
            "orphaned_templates": len(orphaned) if read.complete else None,
            "orphaned_ids": sorted(orphaned),
            # Requires BOTH directions clean. Previously `len(untracked) == 0` alone, which
            # is why 11 rows against 7 guardrails still reported in_sync. null when the
            # listing did not complete, because neither True nor False is knowable then.
            "in_sync": (
                (len(untracked) == 0 and len(orphaned) == 0) if read.complete else None
            ),
            "untracked_ids": list(untracked),
            "drift_note": (
                "; ".join(
                    filter(None, [
                        listing_note,
                        f"{len(untracked)} guardrail(s) exist in AWS with no template row"
                        if untracked else None,
                        f"{len(orphaned)} template row(s) reference a guardrail that no longer "
                        f"exists in AWS - they are still marked active, so guardrail counts "
                        f"derived from template rows over-report enforcement by {len(orphaned)}"
                        if orphaned else None,
                        "Orphan detection is withheld: it needs a complete guardrail listing, "
                        "and an unread tail is indistinguishable from a deleted guardrail"
                        if not read.complete else None,
                    ])
                )
                or None
            ),
            "aws_guardrails": [
                {
                    "id": g.get("id"),
                    "name": g.get("name"),
                    "status": g.get("status"),
                    "tracked": g.get("id") in tracked_ids,
                }
                for g in aws_guardrails
            ],
        }
    except Exception as e:
        logger.error(f"Failed to get AWS guardrails summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reconcile-orphans")
async def reconcile_orphans(
    dry_run: bool = Query(default=True, description="Report what would change without changing it"),
    _=Depends(require_role(Role.ADMIN)),
):
    """Close template rows whose Bedrock guardrail no longer exists.

    Deliberately NOT the DELETE route: delete_template calls _delete_bedrock_guardrail
    first, which for an orphan throws and leaves the row FAILED instead of DELETED - and
    would delete a live guardrail if a row ever carried the wrong id. This endpoint makes
    no AWS mutation. It reads list_guardrails, diffs, and writes only control-plane rows.

    An orphan keeps status=active, so anything counting rows over-reports guardrail
    enforcement. See GET /guardrails/aws-summary for the drift this resolves.

    dry_run defaults TRUE. Pass dry_run=false to apply.
    """
    svc = get_service()
    try:
        return svc.reconcile_orphans(dry_run=dry_run)
    except Exception as e:
        logger.error(f"Orphan reconciliation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/store-status")
async def get_store_status(_=Depends(require_role(Role.VIEWER))):
    """Provenance for the guardrail template store: which table, which region, reachable.

    `GET /guardrails` returns a bare list, and a list cannot distinguish "this account
    has no guardrail templates" from "the table is in a region this backend is not
    looking at". Both render as zero. Read this alongside the list before showing a
    count, and degrade honestly when `reachable` is false: the `note` names the table
    and the region that was searched.
    """
    svc = get_service()
    # Touch the store so the status reflects a real call rather than the last one,
    # which may have been minutes ago or may never have happened.
    svc.list_templates(auto_sync=False)
    return svc.store_status()


# --- CRUD ---

@router.post("", response_model=GuardrailTemplate, status_code=201)
async def create_guardrail(
    req: GuardrailTemplateCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Create a new guardrail template and provision it in Bedrock

    `created_by` comes from the `x-user-email` header, or `"unknown"` when absent -
    `require_role` returns only a Role, never a principal.
    """
    # Bedrock requires at least one policy — fail fast with a clear message
    # instead of a 502 from the CreateGuardrail call (and avoid orphan records).
    has_word_filter = bool(
        req.word_filter and (req.word_filter.enable_profanity or req.word_filter.blocked_words)
    )
    has_grounding = bool(req.contextual_grounding and req.contextual_grounding.enabled)
    if not any([
        req.content_filters, req.denied_topics, req.pii_entities,
        req.sensitive_regexes, has_word_filter, has_grounding,
    ]):
        raise HTTPException(
            status_code=400,
            detail="A guardrail must include at least one policy — add a content filter, "
                   "denied topic, PII entity, word filter, or contextual grounding.",
        )

    # Denied topics require a definition (Bedrock rejects otherwise)
    for i, topic in enumerate(req.denied_topics or []):
        if not (topic.definition and topic.definition.strip()):
            raise HTTPException(
                status_code=400,
                detail=f"Denied topic '{topic.name or f'#{i+1}'}' needs a definition "
                       f"(a short description of what to block).",
            )

    svc = get_service()
    # Not the literal "user": created_by="user" reads like a real principal, so a
    # guardrail template with no captured author looked fully attributed.
    template = svc.create_template(req, created_by=x_user_email or "unknown")
    if template.status == GuardrailStatus.FAILED:
        raise HTTPException(
            status_code=502,
            detail=f"Guardrail creation failed: {template.status_history[-1].message if template.status_history else 'Unknown error'}"
        )
    return template


@router.get("", response_model=List[GuardrailTemplate])
async def list_guardrails(status: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    """List all guardrail templates, optionally filtered by status"""
    svc = get_service()
    status_filter = GuardrailStatus(status) if status else None
    return svc.list_templates(status=status_filter)


@router.get("/{template_id}", response_model=GuardrailTemplate)
async def get_guardrail(template_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get a single guardrail template by ID"""
    svc = get_service()
    template = svc.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Guardrail template not found")
    return template


@router.put("/{template_id}", response_model=GuardrailTemplate)
async def update_guardrail(template_id: str, req: GuardrailTemplateUpdate, _=Depends(require_role(Role.OPERATOR))):
    """Update a guardrail template configuration"""
    svc = get_service()
    template = svc.update_template(template_id, req)
    if not template:
        raise HTTPException(status_code=404, detail="Guardrail template not found")
    return template


@router.delete("/{template_id}", response_model=GuardrailTemplate)
async def delete_guardrail(template_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Delete a guardrail template and its Bedrock resource"""
    svc = get_service()
    template = svc.delete_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Guardrail template not found")
    return template


@router.post("/{template_id}/publish", response_model=GuardrailTemplate)
async def publish_guardrail(template_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Publish a new version of the guardrail in Bedrock"""
    svc = get_service()
    template = svc.publish_version(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Guardrail template not found or has no Bedrock resource")
    return template


# --- Observability ---

@router.get("/{template_id}/metrics", response_model=GuardrailMetrics)
async def get_guardrail_metrics(template_id: str, hours: int = Query(default=24, ge=1, le=168), _=Depends(require_role(Role.VIEWER))):
    """Get observability metrics for a guardrail"""
    svc = get_service()
    template = svc.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Guardrail template not found")
    if not template.guardrail_id:
        raise HTTPException(status_code=400, detail="Guardrail has no Bedrock resource (still in draft)")

    return svc.get_metrics(template.guardrail_id, hours=hours)
