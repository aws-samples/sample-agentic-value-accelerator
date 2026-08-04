"""
Templates API routes for template catalog
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import require_role, Role
from typing import List, Optional
import logging
import io
import zipfile
from pathlib import Path

from fastapi.responses import StreamingResponse
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
    tiers: dict = {}
    categories: dict = {}
    frameworks: List[str] = []
    iac_options: List[str] = []


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    tier: Optional[str] = Query(None, description="Filter by tier (module, starter)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    framework: Optional[str] = Query(None, description="Filter by framework (strands, langgraph)"),
    search: Optional[str] = Query(None, description="Search query"),
    _=Depends(require_role(Role.VIEWER)),
):
    """
    List available templates with optional filtering

    Args:
        tier: Filter by tier (module, starter)
        category: Filter by category (compute, api, auth, etc.)
        framework: Filter by framework (strands, langgraph)
        search: Search query for template name, description, tags

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
                tier=tier,
                category=category,
                framework=framework,
            )

        return TemplateListResponse(
            templates=[t.metadata for t in templates if not t.metadata.hidden],
            total=len([t for t in templates if not t.metadata.hidden])
        )
    except Exception as e:
        logger.error(f"Failed to list templates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {str(e)}")


@router.get("/stats", response_model=CatalogStatsResponse)
async def get_catalog_stats(_=Depends(require_role(Role.VIEWER))):
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
async def get_template(template_id: str, _=Depends(require_role(Role.VIEWER))):
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
async def validate_template(template_id: str, _=Depends(require_role(Role.OPERATOR))):
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
async def reload_catalog(_=Depends(require_role(Role.ADMIN))):
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


@router.get("/{template_id}/download")
async def download_template(
    template_id: str,
    iac: Optional[str] = Query(None, description="IaC variant to include (terraform, cdk). If not specified, includes all."),
    _=Depends(require_role(Role.VIEWER)),
):
    """
    Download a template as a ZIP file

    Args:
        template_id: Template identifier
        iac: Optional IaC variant filter (terraform, cdk, cloudformation)

    Returns:
        ZIP file of the template directory
    """
    catalog = get_catalog()

    template = catalog.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

    template_path = Path(template.path)
    if not template_path.exists():
        raise HTTPException(status_code=404, detail=f"Template directory not found: {template_id}")

    EXCLUDE_DIRS = {
        ".terraform", ".git", "node_modules", "__pycache__",
        ".venv", "dist", "build", ".cache", ".sisyphus",
    }
    EXCLUDE_FILES = {
        ".terraform.lock.hcl", "terraform.tfstate", "terraform.tfstate.backup",
        ".DS_Store", "Thumbs.db", ".env",
    }

    try:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for file_path in template_path.rglob("*"):
                if not file_path.is_file():
                    continue
                relative = file_path.relative_to(template_path)
                parts = relative.parts
                # Skip excluded directories
                if any(part in EXCLUDE_DIRS for part in parts):
                    continue
                # Skip excluded files
                if file_path.name in EXCLUDE_FILES:
                    continue
                # If iac filter specified, skip other iac directories
                if iac and len(parts) > 1 and parts[0] == "iac":
                    if parts[1] != iac:
                        continue
                zf.write(file_path, relative)
        buffer.seek(0)

        filename = f"{template_id}-{iac}.zip" if iac else f"{template_id}.zip"
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Failed to create template ZIP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to download template: {str(e)}")
