"""Knowledge API routes — discovery and registration."""

import asyncio
import logging

import boto3
from fastapi import APIRouter, HTTPException, Depends as RBACDepends

from core.config import settings
from core.rbac import Role, require_role
from models.knowledge import (
    GlueDatabase,
    GlueDatabaseListResponse,
    GlueTable,
    AthenaWorkgroup,
    AthenaWorkgroupListResponse,
    KnowledgeRegistrationCreate,
    KnowledgeRegistration,
    KnowledgeRegistrationListResponse,
)
from services.knowledge_service import KnowledgeService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# --- Service singleton ---

_knowledge_svc = None


def _get_knowledge_svc() -> KnowledgeService:
    global _knowledge_svc
    if _knowledge_svc is None:
        _knowledge_svc = KnowledgeService(
            table_name=settings.KNOWLEDGE_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _knowledge_svc


def _glue_client():
    return boto3.client("glue", region_name=settings.AWS_REGION)


def _athena_client():
    return boto3.client("athena", region_name=settings.AWS_REGION)


# -----------------------------------------------------------------------------
# Discovery
# -----------------------------------------------------------------------------

@router.get("/glue/databases", response_model=GlueDatabaseListResponse)
async def list_glue_databases(_=RBACDepends(require_role(Role.VIEWER))):
    """List Glue databases with their tables."""
    try:
        glue = _glue_client()
        databases = []

        for db in glue.get_databases().get("DatabaseList", []):
            tables = [
                GlueTable(name=t["Name"], table_type=t.get("TableType", ""))
                for t in glue.get_tables(DatabaseName=db["Name"]).get("TableList", [])
            ]
            databases.append(GlueDatabase(
                name=db["Name"],
                description=db.get("Description", ""),
                tables=tables,
            ))

        return GlueDatabaseListResponse(databases=databases)
    except Exception as e:
        logger.error(f"Failed to list Glue databases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/athena/workgroups", response_model=AthenaWorkgroupListResponse)
async def list_athena_workgroups(_=RBACDepends(require_role(Role.VIEWER))):
    """List Athena workgroups."""
    try:
        athena = _athena_client()
        workgroups = [
            AthenaWorkgroup(name=wg["Name"], state=wg.get("State", "UNKNOWN"))
            for wg in athena.list_work_groups().get("WorkGroups", [])
        ]
        return AthenaWorkgroupListResponse(workgroups=workgroups)
    except Exception as e:
        logger.error(f"Failed to list Athena workgroups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bedrock/knowledge-bases")
async def list_bedrock_knowledge_bases(_=RBACDepends(require_role(Role.VIEWER))):
    """List existing Bedrock Knowledge Bases in the account."""
    try:
        client = boto3.client("bedrock-agent", region_name=settings.AWS_REGION)
        knowledge_bases = []
        paginator = client.get_paginator("list_knowledge_bases")
        for page in paginator.paginate():
            for kb in page.get("knowledgeBaseSummaries", []):
                if kb.get("status") == "ACTIVE":
                    knowledge_bases.append({
                        "id": kb["knowledgeBaseId"],
                        "name": kb["name"],
                        "description": kb.get("description", ""),
                        "status": kb["status"],
                        "updated_at": str(kb.get("updatedAt", "")),
                    })
        return {"knowledge_bases": knowledge_bases}
    except Exception as e:
        logger.error(f"Failed to list Bedrock knowledge bases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------------------------------------------------------
# Registration
# -----------------------------------------------------------------------------

@router.post("/register", response_model=KnowledgeRegistration, status_code=201)
async def register_knowledge(req: KnowledgeRegistrationCreate, _=RBACDepends(require_role(Role.OPERATOR))):
    """Register a new knowledge source. Returns immediately; provisioning runs in background."""
    svc = _get_knowledge_svc()
    try:
        reg = svc.create(req)

        # Kick off background provisioning based on type
        if req.type == "knowledge_base":
            from services.provisioners.kb_provisioner import KBProvisioner
            provisioner = KBProvisioner(svc)
        else:
            from services.provisioners.datalake_provisioner import DataLakeProvisioner
            provisioner = DataLakeProvisioner(svc)

        asyncio.create_task(provisioner.provision(reg.registration_id, reg.config))

        return reg
    except Exception as e:
        logger.error(f"Failed to register knowledge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=KnowledgeRegistrationListResponse)
async def list_knowledge(_=RBACDepends(require_role(Role.VIEWER))):
    """List all knowledge registrations."""
    svc = _get_knowledge_svc()
    try:
        registrations = svc.list_all()
        return KnowledgeRegistrationListResponse(registrations=registrations, total=len(registrations))
    except Exception as e:
        logger.error(f"Failed to list knowledge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{registration_id}", response_model=KnowledgeRegistration)
async def get_knowledge(registration_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    """Get a single knowledge registration."""
    svc = _get_knowledge_svc()
    reg = svc.get(registration_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    return reg


@router.post("/{registration_id}/retry", response_model=KnowledgeRegistration)
async def retry_knowledge(registration_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Retry provisioning for a FAILED registration."""
    svc = _get_knowledge_svc()
    reg = svc.get(registration_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    if reg.status != "FAILED":
        raise HTTPException(status_code=409, detail=f"Can only retry FAILED registrations, current status: {reg.status}")

    svc.update_status(registration_id, "PROVISIONING", error_message="")

    if reg.type == "knowledge_base":
        from services.provisioners.kb_provisioner import KBProvisioner
        provisioner = KBProvisioner(svc)
    else:
        from services.provisioners.datalake_provisioner import DataLakeProvisioner
        provisioner = DataLakeProvisioner(svc)

    asyncio.create_task(provisioner.provision(registration_id, reg.config))

    reg.status = "PROVISIONING"
    reg.error_message = ""
    return reg


@router.delete("/{registration_id}", status_code=202)
async def delete_knowledge(registration_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Delete a knowledge registration. Tears down resources in background."""
    svc = _get_knowledge_svc()
    reg = svc.get(registration_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")

    if reg.type == "knowledge_base":
        from services.provisioners.kb_provisioner import KBProvisioner
        provisioner = KBProvisioner(svc)
    else:
        from services.provisioners.datalake_provisioner import DataLakeProvisioner
        provisioner = DataLakeProvisioner(svc)

    asyncio.create_task(provisioner.teardown(registration_id, reg.dict()))

    return {"status": "deleting", "registration_id": registration_id}
