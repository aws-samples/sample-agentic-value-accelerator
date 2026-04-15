"""
Projects API routes
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Dict
import json
import logging

import boto3
from botocore.exceptions import ClientError

from core.database import get_db
from core.auth import get_current_user
from schemas.project import ProjectCreate, ProjectResponse
from models.project import Project
from models.langfuse import LangfuseServer
from services import (
    TemplateService,
    SubstitutionService,
    S3Service,
    ZipService
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/generate", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def generate_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Generate a new project from template

    Args:
        project_data: Project creation data
        db: Database session
        current_user: Current authenticated user

    Returns:
        Generated project information with S3 download URL

    Raises:
        HTTPException: If generation fails
    """
    logger.info(f"Generating project: {project_data.project_name} for user {current_user['user_id']}")

    try:
        # 1. Check project name uniqueness
        existing_project = db.query(Project).filter(
            Project.project_name == project_data.project_name
        ).first()

        if existing_project:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Project name '{project_data.project_name}' already exists"
            )

        # 2. Validate Langfuse server if provided
        langfuse_server = None
        langfuse_host = ""
        langfuse_public_key = ""
        langfuse_secret_key = ""

        if project_data.langfuse_server_id:
            langfuse_server = db.query(LangfuseServer).filter(
                LangfuseServer.id == project_data.langfuse_server_id
            ).first()

            if not langfuse_server:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Langfuse server not found: {project_data.langfuse_server_id}"
                )

            langfuse_host = langfuse_server.endpoint
            langfuse_public_key = langfuse_server.public_key

            # Fetch secret key from AWS Secrets Manager
            if langfuse_server.secret_name:
                try:
                    sm_client = boto3.client(
                        "secretsmanager",
                        region_name=langfuse_server.region
                    )
                    secret_response = sm_client.get_secret_value(
                        SecretId=langfuse_server.secret_name
                    )
                    secret_data = json.loads(secret_response["SecretString"])
                    field = langfuse_server.secret_key_field or "langfuse_secret_key"
                    langfuse_secret_key = secret_data.get(field, "")
                    if not langfuse_secret_key:
                        logger.warning(
                            f"Field '{field}' not found in secret '{langfuse_server.secret_name}'"
                        )
                except ClientError as e:
                    logger.error(f"Failed to retrieve Langfuse secret key: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to retrieve Langfuse secret key from Secrets Manager: {e.response['Error']['Code']}"
                    )

        # 3. Select and load template
        from core.config import settings
        template_service = TemplateService(settings.TEMPLATES_DIR)
        template_name = template_service.select_template(project_data.framework)
        template_files = template_service.load_template(template_name, project_data.iac_type)

        logger.info(f"Loaded template: {template_name} (IaC: {project_data.iac_type}) with {len(template_files)} files")

        # 4. Prepare substitution variables
        variables = {
            "PROJECT_NAME": project_data.project_name,
            "AWS_REGION": project_data.aws_region,
            "LANGFUSE_HOST": langfuse_host,
            "LANGFUSE_PUBLIC_KEY": langfuse_public_key,
            "LANGFUSE_SECRET_KEY": langfuse_secret_key,
            "TAGS": project_data.tags or {}
        }

        # 5. Substitute variables
        substitution_service = SubstitutionService()
        processed_files = substitution_service.substitute_variables(
            template_files,
            variables
        )

        logger.info(f"Substituted variables in {len(processed_files)} files")

        # 6. Create zip archive
        zip_service = ZipService()
        zip_data = zip_service.create_zip(processed_files)

        logger.info(f"Created zip archive: {len(zip_data)} bytes")

        # 7. Upload to S3
        s3_service = S3Service()
        s3_key, presigned_url = s3_service.upload_project(
            zip_data,
            project_data.project_name
        )

        logger.info(f"Uploaded to S3: {s3_key}")

        # 8. Calculate expiration time
        expires_at = s3_service.get_expiration_time()

        # 9. Save to database
        project = Project(
            project_name=project_data.project_name,
            framework=project_data.framework,
            template_name=template_name,
            iac_type=project_data.iac_type,
            aws_region=project_data.aws_region,
            tags=project_data.tags,
            langfuse_server_id=project_data.langfuse_server_id,
            s3_url=presigned_url,
            s3_key=s3_key,
            expires_at=expires_at,
            created_by=current_user["user_id"]
        )

        db.add(project)
        db.commit()
        db.refresh(project)

        logger.info(f"Project created successfully: {project.id}")

        # 10. Return response
        return ProjectResponse(**project.to_dict())

    except HTTPException:
        raise
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Database integrity error: {e}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project already exists or constraint violation"
        )
    except FileNotFoundError as e:
        logger.error(f"Template not found: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Project generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Project generation failed: {str(e)}"
        )


@router.get("/{project_name}", response_model=ProjectResponse)
async def get_project(
    project_name: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Get project by name

    Args:
        project_name: Project name
        db: Database session
        current_user: Current authenticated user

    Returns:
        Project information

    Raises:
        HTTPException: If project not found
    """
    project = db.query(Project).filter(
        Project.project_name == project_name
    ).first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project not found: {project_name}"
        )

    return ProjectResponse(**project.to_dict())
