"""
Langfuse servers API routes
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Dict
import logging
import uuid

from core.database import get_db
from core.auth import get_current_user
from schemas.langfuse import (
    LangfuseServerCreate,
    LangfuseServerResponse,
    LangfuseServerUpdate
)
from models.langfuse import LangfuseServer, ServerStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/langfuse-servers", tags=["langfuse"])


@router.get("", response_model=List[LangfuseServerResponse])
async def list_langfuse_servers(
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    List all Langfuse servers

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        List of Langfuse servers
    """
    servers = db.query(LangfuseServer).all()
    return [LangfuseServerResponse(**server.to_dict()) for server in servers]


@router.post("", response_model=LangfuseServerResponse, status_code=status.HTTP_201_CREATED)
async def create_langfuse_server(
    server_data: LangfuseServerCreate,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Create a new Langfuse server

    Args:
        server_data: Server creation data
        db: Database session
        current_user: Current authenticated user

    Returns:
        Created server information

    Raises:
        HTTPException: If creation fails
    """
    logger.info(f"Creating Langfuse server: {server_data.name}")

    try:
        # Check name uniqueness
        existing_server = db.query(LangfuseServer).filter(
            LangfuseServer.name == server_data.name
        ).first()

        if existing_server:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Server name '{server_data.name}' already exists"
            )

        # Create server
        server = LangfuseServer(
            name=server_data.name,
            endpoint=str(server_data.endpoint),
            region=server_data.region,
            public_key=server_data.public_key,
            secret_name=server_data.secret_name,
            secret_key_field=server_data.secret_key_field or "langfuse_secret_key",
            status=server_data.status
        )

        db.add(server)
        db.commit()
        db.refresh(server)

        logger.info(f"Langfuse server created: {server.id}")

        return LangfuseServerResponse(**server.to_dict())

    except HTTPException:
        raise
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Database integrity error: {e}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Server already exists or constraint violation"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Server creation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server creation failed: {str(e)}"
        )


@router.get("/{server_id}", response_model=LangfuseServerResponse)
async def get_langfuse_server(
    server_id: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Get Langfuse server by ID

    Args:
        server_id: Server UUID
        db: Database session
        current_user: Current authenticated user

    Returns:
        Server information

    Raises:
        HTTPException: If server not found
    """
    try:
        server_uuid = uuid.UUID(server_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid server ID format"
        )

    server = db.query(LangfuseServer).filter(
        LangfuseServer.id == server_uuid
    ).first()

    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server not found: {server_id}"
        )

    return LangfuseServerResponse(**server.to_dict())


@router.patch("/{server_id}", response_model=LangfuseServerResponse)
async def update_langfuse_server(
    server_id: str,
    server_data: LangfuseServerUpdate,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Update Langfuse server

    Args:
        server_id: Server UUID
        server_data: Server update data
        db: Database session
        current_user: Current authenticated user

    Returns:
        Updated server information

    Raises:
        HTTPException: If update fails
    """
    try:
        server_uuid = uuid.UUID(server_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid server ID format"
        )

    server = db.query(LangfuseServer).filter(
        LangfuseServer.id == server_uuid
    ).first()

    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server not found: {server_id}"
        )

    try:
        # Update fields
        update_data = server_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                if field == "endpoint":
                    value = str(value)
                setattr(server, field, value)

        db.commit()
        db.refresh(server)

        logger.info(f"Langfuse server updated: {server.id}")

        return LangfuseServerResponse(**server.to_dict())

    except Exception as e:
        db.rollback()
        logger.error(f"Server update failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server update failed: {str(e)}"
        )


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_langfuse_server(
    server_id: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Delete Langfuse server

    Args:
        server_id: Server UUID
        db: Database session
        current_user: Current authenticated user

    Raises:
        HTTPException: If deletion fails
    """
    try:
        server_uuid = uuid.UUID(server_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid server ID format"
        )

    server = db.query(LangfuseServer).filter(
        LangfuseServer.id == server_uuid
    ).first()

    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server not found: {server_id}"
        )

    try:
        # Check if server is used by any projects
        if server.projects:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Server is used by {len(server.projects)} project(s). Cannot delete."
            )

        db.delete(server)
        db.commit()

        logger.info(f"Langfuse server deleted: {server_id}")

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Server deletion failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server deletion failed: {str(e)}"
        )
