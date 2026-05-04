"""CodeCommit API routes - list pre-seeded FSI Foundry use case repositories"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import logging

import boto3
from botocore.exceptions import ClientError

from core.config import settings
from fastapi import Depends as RBACDepends
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/codecommit", tags=["codecommit"])

FOUNDRY_PREFIX = "fsi-foundry-"
REFIMPL_PREFIX = "fsi-foundry-use-case-"


class CodeCommitRepo(BaseModel):
    repository_name: str
    template_id: str
    source: str  # "fsi_foundry" or "reference_implementations"
    clone_url_http: str
    default_branch: str
    description: str


@router.get("/repositories", response_model=List[CodeCommitRepo])
async def list_codecommit_repositories(_=RBACDepends(require_role(Role.VIEWER))):
    """List pre-seeded CodeCommit repositories available for Git deployment."""
    try:
        cc = boto3.client("codecommit", region_name=settings.AWS_REGION)

        repos: List[CodeCommitRepo] = []
        paginator = cc.get_paginator("list_repositories")
        for page in paginator.paginate():
            for entry in page.get("repositories", []):
                name = entry["repositoryName"]
                if not name.startswith(FOUNDRY_PREFIX):
                    continue

                try:
                    detail = cc.get_repository(repositoryName=name)["repositoryMetadata"]
                except ClientError as e:
                    logger.warning(f"Could not read metadata for {name}: {e}")
                    continue

                if name.startswith(REFIMPL_PREFIX):
                    template_id = name[len(REFIMPL_PREFIX):]
                    source = "reference_implementations"
                else:
                    template_id = name[len(FOUNDRY_PREFIX):]
                    source = "fsi_foundry"

                repos.append(CodeCommitRepo(
                    repository_name=name,
                    template_id=template_id,
                    source=source,
                    clone_url_http=detail.get("cloneUrlHttp", ""),
                    default_branch=detail.get("defaultBranch", "main"),
                    description=detail.get("repositoryDescription", ""),
                ))

        repos.sort(key=lambda r: (r.source, r.template_id))
        return repos
    except ClientError as e:
        logger.error(f"CodeCommit list failed: {e}")
        raise HTTPException(status_code=500, detail=f"CodeCommit list failed: {e}")
