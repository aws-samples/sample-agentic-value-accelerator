"""Govern Bedrock Assets service — Flows and Prompts.

Read-through + cached. Discovers Bedrock Flows and Prompts via bedrock-agent API.
Each AWS call is independently graceful.

Shape notes (boto3):
  - list_flows → flowSummaries[]{id, name, arn, status, version, description, createdAt, updatedAt}
  - get_flow → {id, name, arn, status, executionRoleArn, definition, createdAt, updatedAt}
  - list_prompts → promptSummaries[]{id, name, arn, version, description, createdAt, updatedAt}
  - get_prompt → {id, name, arn, version, description, defaultVariant, variants, createdAt, updatedAt}
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from core.security_utils import mask_account_id
from models.govern_bedrock_assets import (
    BedrockAssetsOverviewResponse,
    FlowDetail,
    FlowDetailResponse,
    FlowsResponse,
    FlowSummary,
    PromptDetail,
    PromptDetailResponse,
    PromptsResponse,
    PromptSummary,
)

logger = logging.getLogger(__name__)

_TTL = 600  # 10 min


def _iso(v) -> str | None:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


class GovernBedrockAssetsService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region

    def _bedrock_agent(self):
        return boto3.client("bedrock-agent", region_name=self.region)

    # ─────────────────── Flows ───────────────────

    def get_flows(self) -> FlowsResponse:
        result, cached_at = get_or_load(
            f"bedrock-assets:flows:{self.region}", _TTL,
            lambda: self._fetch_flows(), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_flows(self) -> FlowsResponse:
        try:
            client = self._bedrock_agent()
            flows = []
            paginator = client.get_paginator("list_flows")
            for page in paginator.paginate():
                for f in page.get("flowSummaries", []):
                    flows.append(FlowSummary(
                        id=f.get("id", ""),
                        name=f.get("name", ""),
                        arn=mask_account_id(f.get("arn", "")),
                        status=f.get("status", "UNKNOWN"),
                        description=f.get("description"),
                        version=f.get("version"),
                        created_at=_iso(f.get("createdAt")),
                        updated_at=_iso(f.get("updatedAt")),
                    ))
            return FlowsResponse(flows=flows, live=True, note=f"{len(flows)} flows")
        except (ClientError, BotoCoreError) as e:
            logger.warning(f"list_flows failed: {e}")
            return FlowsResponse(flows=[], live=False, note=f"API unavailable: {type(e).__name__}")
        except Exception as e:
            logger.error(f"list_flows unexpected error: {e}")
            return FlowsResponse(flows=[], live=False, note="Unexpected error")

    def get_flow_detail(self, flow_id: str) -> FlowDetailResponse:
        try:
            client = self._bedrock_agent()
            resp = client.get_flow(flowIdentifier=flow_id)
            flow = FlowDetail(
                id=resp.get("id", ""),
                name=resp.get("name", ""),
                arn=mask_account_id(resp.get("arn", "")),
                status=resp.get("status", "UNKNOWN"),
                description=resp.get("description"),
                version=resp.get("version"),
                execution_role_arn=mask_account_id(resp.get("executionRoleArn")),
                definition=resp.get("definition"),
                created_at=_iso(resp.get("createdAt")),
                updated_at=_iso(resp.get("updatedAt")),
            )
            return FlowDetailResponse(flow=flow, live=True)
        except (ClientError, BotoCoreError) as e:
            logger.warning(f"get_flow({flow_id}) failed: {e}")
            return FlowDetailResponse(flow=None, live=False, note=f"API unavailable: {type(e).__name__}")
        except Exception as e:
            logger.error(f"get_flow({flow_id}) unexpected error: {e}")
            return FlowDetailResponse(flow=None, live=False, note="Unexpected error")

    # ─────────────────── Prompts ───────────────────

    def get_prompts(self) -> PromptsResponse:
        result, cached_at = get_or_load(
            f"bedrock-assets:prompts:{self.region}", _TTL,
            lambda: self._fetch_prompts(), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_prompts(self) -> PromptsResponse:
        try:
            client = self._bedrock_agent()
            prompts = []
            paginator = client.get_paginator("list_prompts")
            for page in paginator.paginate():
                for p in page.get("promptSummaries", []):
                    prompts.append(PromptSummary(
                        id=p.get("id", ""),
                        name=p.get("name", ""),
                        arn=mask_account_id(p.get("arn", "")),
                        version=p.get("version"),
                        description=p.get("description"),
                        created_at=_iso(p.get("createdAt")),
                        updated_at=_iso(p.get("updatedAt")),
                    ))
            return PromptsResponse(prompts=prompts, live=True, note=f"{len(prompts)} prompts")
        except (ClientError, BotoCoreError) as e:
            logger.warning(f"list_prompts failed: {e}")
            return PromptsResponse(prompts=[], live=False, note=f"API unavailable: {type(e).__name__}")
        except Exception as e:
            logger.error(f"list_prompts unexpected error: {e}")
            return PromptsResponse(prompts=[], live=False, note="Unexpected error")

    def get_prompt_detail(self, prompt_id: str) -> PromptDetailResponse:
        try:
            client = self._bedrock_agent()
            resp = client.get_prompt(promptIdentifier=prompt_id)
            prompt = PromptDetail(
                id=resp.get("id", ""),
                name=resp.get("name", ""),
                arn=mask_account_id(resp.get("arn", "")),
                version=resp.get("version"),
                description=resp.get("description"),
                default_variant=resp.get("defaultVariant"),
                variants=resp.get("variants"),
                created_at=_iso(resp.get("createdAt")),
                updated_at=_iso(resp.get("updatedAt")),
            )
            return PromptDetailResponse(prompt=prompt, live=True)
        except (ClientError, BotoCoreError) as e:
            logger.warning(f"get_prompt({prompt_id}) failed: {e}")
            return PromptDetailResponse(prompt=None, live=False, note=f"API unavailable: {type(e).__name__}")
        except Exception as e:
            logger.error(f"get_prompt({prompt_id}) unexpected error: {e}")
            return PromptDetailResponse(prompt=None, live=False, note="Unexpected error")

    # ─────────────────── Overview ───────────────────

    def get_overview(self) -> BedrockAssetsOverviewResponse:
        result, cached_at = get_or_load(
            f"bedrock-assets:overview:{self.region}", _TTL,
            lambda: self._fetch_overview(), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_overview(self) -> BedrockAssetsOverviewResponse:
        flows_resp = self._fetch_flows()
        prompts_resp = self._fetch_prompts()
        live = flows_resp.live or prompts_resp.live
        return BedrockAssetsOverviewResponse(
            flows_count=len(flows_resp.flows),
            prompts_count=len(prompts_resp.prompts),
            flows=flows_resp.flows,
            prompts=prompts_resp.prompts,
            live=live,
            note=f"{len(flows_resp.flows)} flows, {len(prompts_resp.prompts)} prompts",
        )
