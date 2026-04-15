"""
Bootstrap API routes for project generation
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Dict, Any
import logging
import io

from services.template_catalog import TemplateCatalog
from services.bootstrap_engine import BootstrapEngine
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bootstrap", tags=["bootstrap"])


class BootstrapRequest(BaseModel):
    """Request to bootstrap a new project"""
    template_id: str
    project_name: str
    parameters: Dict[str, Any]
    framework_id: str
    deployment_pattern_id: str


@router.post("")
async def bootstrap_project(request: BootstrapRequest):
    """
    Bootstrap a new project from a template

    Args:
        request: Bootstrap request with template ID, project name, parameters, framework, and deployment pattern

    Returns:
        ZIP file containing the bootstrapped project
    """
    from core.config import settings

    try:
        # Initialize services
        catalog = TemplateCatalog(settings.TEMPLATES_DIR)
        engine = BootstrapEngine(settings.TEMPLATES_DIR)

        # Validate template exists
        template = catalog.get_template(request.template_id)
        if not template:
            raise HTTPException(status_code=404, detail=f"Template not found: {request.template_id}")

        # Bootstrap project
        logger.info(f"Bootstrapping project '{request.project_name}' from template '{request.template_id}'")
        logger.info(f"Framework: {request.framework_id}, Deployment: {request.deployment_pattern_id}")

        zip_buffer = engine.bootstrap_project(
            template_id=request.template_id,
            project_name=request.project_name,
            parameters=request.parameters,
            framework_id=request.framework_id,
            deployment_pattern_id=request.deployment_pattern_id
        )

        logger.info(f"Successfully bootstrapped project '{request.project_name}'")

        # Return ZIP file
        return StreamingResponse(
            io.BytesIO(zip_buffer.getvalue()),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={request.project_name}.zip"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to bootstrap project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Bootstrap failed: {str(e)}")
