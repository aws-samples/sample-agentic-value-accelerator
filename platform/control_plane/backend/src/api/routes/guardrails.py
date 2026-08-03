"""Guardrail template CRUD API routes"""

from fastapi import APIRouter, Depends, HTTPException, Query
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
from core.config import settings
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/guardrails", tags=["guardrails"])

_svc = None


def get_service() -> GuardrailService:
    global _svc
    if _svc is None:
        _svc = GuardrailService(
            table_name=settings.GUARDRAILS_TABLE_NAME,
            region=settings.AWS_REGION,
        )
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
        # Get tracked guardrails (skip auto_sync to show current state)
        tracked = svc.list_templates(auto_sync=False)
        tracked_ids = {t.guardrail_id for t in tracked if t.guardrail_id}

        # List AWS guardrails
        resp = svc.bedrock_client.list_guardrails(maxResults=50)
        aws_guardrails = resp.get("guardrails", [])

        aws_ids = {g.get("id") for g in aws_guardrails}
        untracked = aws_ids - tracked_ids

        import time
        from services.guardrail_service import GuardrailService
        last_sync = GuardrailService._last_sync_time
        seconds_since_sync = int(time.time() - last_sync) if last_sync > 0 else None

        return {
            "auto_sync_enabled": True,
            "sync_interval_seconds": GuardrailService._SYNC_INTERVAL_SECONDS,
            "last_sync_seconds_ago": seconds_since_sync,
            "aws_total": len(aws_guardrails),
            "tracked_total": len(tracked),
            "tracked_with_bedrock_id": len(tracked_ids),
            "untracked_in_aws": len(untracked),
            "in_sync": len(untracked) == 0,
            "untracked_ids": list(untracked),
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


# --- CRUD ---

@router.post("", response_model=GuardrailTemplate, status_code=201)
async def create_guardrail(req: GuardrailTemplateCreate, _=Depends(require_role(Role.OPERATOR))):
    """Create a new guardrail template and provision it in Bedrock"""
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
    template = svc.create_template(req, created_by="user")
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
