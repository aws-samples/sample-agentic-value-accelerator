"""Govern Knowledge Bases service — real Bedrock KB inventory, read-through + cached.

Uses bedrock-agent:ListKnowledgeBases (paginated), GetKnowledgeBase for details,
and ListDataSources per KB. Follows the govern_cost convention: honest live/source/note,
graceful live=False fallback, short TTL cache.
"""

from __future__ import annotations

import logging
import re
import time

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from core.security_utils import mask_arn
from models.govern_knowledge_bases import (
    KnowledgeBaseDataSource,
    KnowledgeBaseSummary,
    KnowledgeBasesResponse,
)

logger = logging.getLogger(__name__)

_KB_TTL = 300  # 5 min — KBs don't change often

_ARN_TAIL = re.compile(r"[:/]([^:/]+)$")


def _short_model(identifier: str) -> str:
    """Shorten a model identifier (ARN or bare id) to a display name."""
    if identifier.startswith("arn:"):
        m = _ARN_TAIL.search(identifier)
        identifier = m.group(1) if m else identifier
    return re.sub(r"^(us|eu|apac|us-gov)\.", "", identifier)


class GovernKnowledgeBasesService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._agent = None

    def _client(self):
        if self._agent is None:
            self._agent = boto3.client("bedrock-agent", region_name=self.region)
        return self._agent

    def _load_knowledge_bases(self, max_kbs: int) -> KnowledgeBasesResponse:
        """Live loader — called by get_or_load on cache miss."""
        client = self._client()
        kbs: list[KnowledgeBaseSummary] = []
        by_storage: dict[str, int] = {}
        by_model: dict[str, int] = {}
        total_ds = 0

        try:
            paginator = client.get_paginator("list_knowledge_bases")
            for page in paginator.paginate(PaginationConfig={"MaxItems": max_kbs}):
                for summary in page.get("knowledgeBaseSummaries", []):
                    kb_id = summary.get("knowledgeBaseId", "")
                    name = summary.get("name", kb_id)
                    status = summary.get("status", "")
                    created = summary.get("createdAt")
                    updated = summary.get("updatedAt")

                    # Enrich with GetKnowledgeBase details
                    embedding_model = None
                    storage_type = None
                    description = None
                    data_sources: list[KnowledgeBaseDataSource] = []

                    try:
                        detail = client.get_knowledge_base(knowledgeBaseId=kb_id)
                        kb_detail = detail.get("knowledgeBase", {})
                        description = kb_detail.get("description")

                        # Embedding model
                        kbc = kb_detail.get("knowledgeBaseConfiguration", {})
                        vec_cfg = kbc.get("vectorKnowledgeBaseConfiguration", {})
                        model_arn = vec_cfg.get("embeddingModelArn", "")
                        if model_arn:
                            embedding_model = _short_model(model_arn)

                        # Storage type
                        storage = kb_detail.get("storageConfiguration", {})
                        storage_type = storage.get("type", "")

                        # Data sources
                        try:
                            ds_paginator = client.get_paginator("list_data_sources")
                            for ds_page in ds_paginator.paginate(knowledgeBaseId=kb_id, PaginationConfig={"MaxItems": 50}):
                                for ds_summary in ds_page.get("dataSourceSummaries", []):
                                    ds = KnowledgeBaseDataSource(
                                        data_source_id=ds_summary.get("dataSourceId", ""),
                                        name=ds_summary.get("name", ""),
                                        status=ds_summary.get("status", ""),
                                        type=ds_summary.get("type", "S3"),
                                        updated_at=ds_summary.get("updatedAt").isoformat() if ds_summary.get("updatedAt") else None,
                                    )
                                    data_sources.append(ds)
                        except (ClientError, BotoCoreError) as ds_err:
                            logger.debug("ListDataSources for %s failed: %s", kb_id, ds_err)

                    except (ClientError, BotoCoreError) as detail_err:
                        logger.debug("GetKnowledgeBase %s failed: %s", kb_id, detail_err)

                    # Track counts
                    if storage_type:
                        by_storage[storage_type] = by_storage.get(storage_type, 0) + 1
                    if embedding_model:
                        by_model[embedding_model] = by_model.get(embedding_model, 0) + 1
                    total_ds += len(data_sources)

                    kbs.append(
                        KnowledgeBaseSummary(
                            knowledge_base_id=kb_id,
                            name=name,
                            status=status,
                            description=description,
                            embedding_model_arn=embedding_model,
                            storage_type=storage_type,
                            created_at=created.isoformat() if created else None,
                            updated_at=updated.isoformat() if updated else None,
                            data_source_count=len(data_sources),
                            data_sources=data_sources,
                        )
                    )

            active = sum(1 for kb in kbs if kb.status == "ACTIVE")
            return KnowledgeBasesResponse(
                knowledge_bases=kbs,
                total=len(kbs),
                active=active,
                by_storage_type=by_storage,
                by_embedding_model=by_model,
                total_data_sources=total_ds,
                live=True,
                source="bedrock-agent:ListKnowledgeBases + GetKnowledgeBase + ListDataSources",
            )

        except (ClientError, BotoCoreError) as err:
            code = getattr(err, "response", {}).get("Error", {}).get("Code", "")
            logger.warning("Bedrock Knowledge Bases call failed (%s): %s", code, err)
            return KnowledgeBasesResponse(
                live=False,
                source="bedrock-agent:ListKnowledgeBases",
                note=f"API call failed: {code or type(err).__name__}",
            )

    def get_knowledge_bases(self, max_kbs: int = 100) -> KnowledgeBasesResponse:
        """Return cached or freshly loaded knowledge bases inventory."""
        cache_key = f"govern:knowledge-bases:{self.region}:{max_kbs}"
        result, _ = get_or_load(
            cache_key, _KB_TTL, lambda: self._load_knowledge_bases(max_kbs),
            # The ClientError/BotoCoreError path returns live=False with an empty
            # inventory; caching it hid every knowledge base for the full TTL after one
            # transient failure. An account that genuinely has zero KBs comes back
            # live=True, so that measured empty inventory is still cached.
            should_cache=lambda r: r.live,
        )
        return result
