"""Govern Knowledge Bases — real Bedrock KB inventory, aggregated across governed regions."""

import logging
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.multiregion import as_dict, live_region_count, merge_note, provenance, run_over_regions
from core.rbac import Role, require_role
from models.govern_knowledge_bases import KnowledgeBasesResponse
from services.govern_knowledge_bases_service import GovernKnowledgeBasesService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/knowledge-bases", tags=["govern-knowledge-bases"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_knowledge_bases", region_scope.MULTI_REGION, prefix="/govern/knowledge-bases")

# One service instance per region (preserves each region's internal TTL cache).
_svcs: Dict[str, GovernKnowledgeBasesService] = {}


def _svc_for(region: str) -> GovernKnowledgeBasesService:
    if region not in _svcs:
        _svcs[region] = GovernKnowledgeBasesService(region=region)
    return _svcs[region]


def _merge(results: List[Tuple[str, object]]) -> KnowledgeBasesResponse:
    kbs: list = []
    total = active = total_ds = 0
    by_storage: Dict[str, int] = {}
    by_embed: Dict[str, int] = {}
    live = False
    for _region, resp in results:
        d = as_dict(resp)
        if not d:
            continue
        kbs.extend(d.get("knowledge_bases", []))
        total += d.get("total", 0)
        active += d.get("active", 0)
        total_ds += d.get("total_data_sources", 0)
        for k, v in (d.get("by_storage_type") or {}).items():
            by_storage[k] = by_storage.get(k, 0) + v
        for k, v in (d.get("by_embedding_model") or {}).items():
            by_embed[k] = by_embed.get(k, 0) + v
        live = live or bool(d.get("live"))

    n_live = live_region_count(results)
    return KnowledgeBasesResponse(
        knowledge_bases=kbs,
        total=total,
        active=active,
        by_storage_type=by_storage,
        by_embedding_model=by_embed,
        total_data_sources=total_ds,
        live=live,
        source=f"bedrock-agent:ListKnowledgeBases ({n_live} region(s))",
        note=merge_note(results),
        regions=provenance(results),
    )


@router.get("", response_model=KnowledgeBasesResponse)
async def get_knowledge_bases(
    max_kbs: int = Query(default=100, ge=1, le=500),
    _=Depends(require_role(Role.VIEWER)),
):
    """Bedrock Knowledge Bases inventory aggregated across all governed regions."""
    results = run_over_regions(lambda r: _svc_for(r).get_knowledge_bases(max_kbs=max_kbs))
    return _merge(results)
