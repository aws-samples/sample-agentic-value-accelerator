"""
Templates API routes for template catalog
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import logging

from services.template_catalog import TemplateCatalog
from models.template import Template, TemplateMetadata
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/templates", tags=["templates"])

# Initialize catalog (singleton)
_catalog = None


def get_catalog() -> TemplateCatalog:
    """Get or create template catalog instance"""
    global _catalog
    if _catalog is None:
        from core.config import settings
        extra = [settings.REFERENCE_IMPLEMENTATIONS_DIR] if settings.REFERENCE_IMPLEMENTATIONS_DIR else []
        _catalog = TemplateCatalog(settings.TEMPLATES_DIR, extra_dirs=extra)
    return _catalog


class TemplateListResponse(BaseModel):
    """Response for template list"""
    templates: List[TemplateMetadata]
    total: int


class TemplateDetailResponse(BaseModel):
    """Response for template detail"""
    metadata: TemplateMetadata
    path: str


class CatalogStatsResponse(BaseModel):
    """Response for catalog statistics"""
    total_templates: int
    pattern_types: dict
    frameworks: List[str]
    deployment_patterns: List[str]


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    pattern_type: Optional[str] = Query(None, description="Filter by pattern type"),
    framework: Optional[str] = Query(None, description="Filter by framework"),
    deployment_pattern: Optional[str] = Query(None, description="Filter by deployment pattern"),
    search: Optional[str] = Query(None, description="Search query")
):
    """
    List available templates with optional filtering

    Args:
        pattern_type: Filter by pattern type (single_agent, orchestration, rag, tool_calling, etc.)
        framework: Filter by framework support (langchain_langgraph, strands, etc.)
        deployment_pattern: Filter by deployment pattern (terraform, cdk, cloudformation)
        search: Search query for template name, description, tags, use cases

    Returns:
        List of matching templates
    """
    catalog = get_catalog()

    try:
        if search:
            # Search takes precedence over filters
            templates = catalog.search_templates(search)
        else:
            # Apply filters
            templates = catalog.list_templates(
                pattern_type=pattern_type,
                framework=framework,
                deployment_pattern=deployment_pattern
            )

        return TemplateListResponse(
            templates=[t.metadata for t in templates],
            total=len(templates)
        )
    except Exception as e:
        logger.error(f"Failed to list templates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {str(e)}")


@router.get("/stats", response_model=CatalogStatsResponse)
async def get_catalog_stats():
    """
    Get template catalog statistics

    Returns:
        Statistics about the template catalog
    """
    catalog = get_catalog()

    try:
        stats = catalog.get_statistics()
        return CatalogStatsResponse(**stats)
    except Exception as e:
        logger.error(f"Failed to get catalog stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")


@router.get("/{template_id}", response_model=TemplateDetailResponse)
async def get_template(template_id: str):
    """
    Get template details by ID

    Args:
        template_id: Template identifier

    Returns:
        Template details including metadata and path
    """
    catalog = get_catalog()

    template = catalog.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

    return TemplateDetailResponse(
        metadata=template.metadata,
        path=template.path
    )


@router.post("/{template_id}/validate")
async def validate_template(template_id: str):
    """
    Validate a template

    Args:
        template_id: Template identifier

    Returns:
        Validation result with errors and warnings
    """
    catalog = get_catalog()

    try:
        result = catalog.validate_template(template_id)
        return result
    except Exception as e:
        logger.error(f"Failed to validate template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/reload")
async def reload_catalog():
    """
    Reload template catalog from disk

    Returns:
        Status message
    """
    catalog = get_catalog()

    try:
        catalog.reload()
        stats = catalog.get_statistics()
        return {
            "status": "success",
            "message": f"Reloaded {stats['total_templates']} templates"
        }
    except Exception as e:
        logger.error(f"Failed to reload catalog: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Reload failed: {str(e)}")
