"""Govern Security Hub AI Inventory service — discovers AI workloads via Security Hub.

Queries Security Hub for AI-related resources (Bedrock, SageMaker) to support
the AI asset inventory and shadow AI detection. Follows the govern_cost
convention: honest live/source/note, graceful live=False fallback, TTL cache.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # 5 min


@dataclass
class AIAssetSummary:
    """Summary of discovered AI assets from Security Hub."""
    total: int
    bedrock_models: int
    bedrock_agents: int
    bedrock_guardrails: int
    bedrock_knowledge_bases: int
    sagemaker_endpoints: int
    sagemaker_models: int
    with_findings: int
    critical_high: int
    live: bool
    source: str
    note: Optional[str] = None


class GovernSecurityHubAIService:
    """Service for discovering AI assets via Security Hub and related APIs."""

    # Resource types that indicate AI workloads
    AI_RESOURCE_TYPES = [
        "AwsBedrock",
        "AwsBedrockAgent",
        "AwsBedrockGuardrail",
        "AwsBedrockKnowledgeBase",
        "AwsSageMakerEndpoint",
        "AwsSageMakerModel",
        "AwsSageMakerNotebookInstance",
    ]

    # Keywords in resource IDs/ARNs that indicate AI workloads
    AI_KEYWORDS = ["bedrock", "sagemaker", "ml.", "ai-", "llm", "agent"]

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._sh = None
        self._bedrock = None

    def _security_hub_client(self):
        if self._sh is None:
            self._sh = boto3.client("securityhub", region_name=self.region)
        return self._sh

    def _bedrock_client(self):
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock", region_name=self.region)
        return self._bedrock

    def get_ai_inventory(self) -> AIAssetSummary:
        """Get cached AI asset inventory (5 min TTL)."""
        result, cached_at = get_or_load(
            f"security_hub_ai:inventory:{self.region}",
            _CACHE_TTL,
            self._fetch_ai_inventory,
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_ai_inventory(self) -> AIAssetSummary:
        """Fetch AI asset inventory from Security Hub and Bedrock APIs."""
        counts = {
            "bedrock_models": 0,
            "bedrock_agents": 0,
            "bedrock_guardrails": 0,
            "bedrock_knowledge_bases": 0,
            "sagemaker_endpoints": 0,
            "sagemaker_models": 0,
        }
        with_findings = 0
        critical_high = 0
        sources = []

        # 1. Try Security Hub for AI-related findings/resources
        try:
            sh = self._security_hub_client()
            # Query for findings related to AI resources
            filters = {
                "RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}],
            }

            paginator = sh.get_paginator("get_findings")
            ai_findings = []

            for page in paginator.paginate(Filters=filters, MaxResults=100):
                for finding in page.get("Findings", []):
                    # Check if this finding relates to AI workloads
                    resources = finding.get("Resources", [])
                    for res in resources:
                        res_type = res.get("Type", "")
                        res_id = res.get("Id", "").lower()

                        is_ai = (
                            any(t in res_type for t in ["Bedrock", "SageMaker"])
                            or any(kw in res_id for kw in self.AI_KEYWORDS)
                        )

                        if is_ai:
                            ai_findings.append(finding)
                            severity = finding.get("Severity", {}).get("Label", "")
                            if severity in ("CRITICAL", "HIGH"):
                                critical_high += 1
                            break

                # Limit to first 200 findings for performance
                if len(ai_findings) >= 200:
                    break

            with_findings = len(ai_findings)
            if with_findings > 0:
                sources.append("SecurityHub")

        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Security Hub query failed: {e}")

        # 2. Count Bedrock resources directly (more reliable than Security Hub)
        try:
            bedrock = self._bedrock_client()

            # Foundation models (enabled in account)
            try:
                models_resp = bedrock.list_foundation_models()
                counts["bedrock_models"] = len(models_resp.get("modelSummaries", []))
            except Exception:
                pass

            # Guardrails
            try:
                gr_resp = bedrock.list_guardrails(maxResults=50)
                counts["bedrock_guardrails"] = len(gr_resp.get("guardrails", []))
            except Exception:
                pass

            # Agents
            try:
                bedrock_agent = boto3.client("bedrock-agent", region_name=self.region)
                agents_resp = bedrock_agent.list_agents(maxResults=50)
                counts["bedrock_agents"] = len(agents_resp.get("agentSummaries", []))
            except Exception:
                pass

            # Knowledge Bases
            try:
                bedrock_agent = boto3.client("bedrock-agent", region_name=self.region)
                kb_resp = bedrock_agent.list_knowledge_bases(maxResults=50)
                counts["bedrock_knowledge_bases"] = len(kb_resp.get("knowledgeBaseSummaries", []))
            except Exception:
                pass

            sources.append("Bedrock")

        except (BotoCoreError, ClientError) as e:
            logger.warning(f"Bedrock query failed: {e}")

        # 3. Count SageMaker resources
        try:
            sm = boto3.client("sagemaker", region_name=self.region)

            # Endpoints
            try:
                ep_resp = sm.list_endpoints(MaxResults=50)
                counts["sagemaker_endpoints"] = len(ep_resp.get("Endpoints", []))
            except Exception:
                pass

            # Models
            try:
                models_resp = sm.list_models(MaxResults=50)
                counts["sagemaker_models"] = len(models_resp.get("Models", []))
            except Exception:
                pass

            sources.append("SageMaker")

        except (BotoCoreError, ClientError) as e:
            logger.warning(f"SageMaker query failed: {e}")

        total = sum(counts.values())
        live = total > 0 or len(sources) > 0

        return AIAssetSummary(
            total=total,
            bedrock_models=counts["bedrock_models"],
            bedrock_agents=counts["bedrock_agents"],
            bedrock_guardrails=counts["bedrock_guardrails"],
            bedrock_knowledge_bases=counts["bedrock_knowledge_bases"],
            sagemaker_endpoints=counts["sagemaker_endpoints"],
            sagemaker_models=counts["sagemaker_models"],
            with_findings=with_findings,
            critical_high=critical_high,
            live=live,
            source="+".join(sources) if sources else "none",
            note=f"{total} AI assets discovered" if total > 0 else None,
        )
