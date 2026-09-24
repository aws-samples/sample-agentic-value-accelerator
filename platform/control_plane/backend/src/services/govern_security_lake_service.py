"""Govern Security Lake service — AWS Security Lake data lakes, subscribers, and log sources.

Follows the govern_security convention: honest live/source/note, graceful per-source fallback,
short TTL cache. Security Lake centralizes security data from AWS and third-party sources.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from core.security_utils import mask_account_id

logger = logging.getLogger(__name__)

_CACHE_TTL = 900  # 15 min — Security Lake config rarely changes


def _mask_deep(value: Any) -> Any:
    """Recursively mask AWS account IDs in any strings within a nested structure.

    subscriberIdentity is a dict ({principal, externalId}); mask_account_id only
    accepts strings, so this walks dicts/lists to scrub embedded account IDs while
    preserving the response shape.
    """
    if isinstance(value, str):
        return mask_account_id(value)
    if isinstance(value, dict):
        return {k: _mask_deep(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask_deep(v) for v in value]
    return value


class GovernSecurityLakeService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = boto3.client("securitylake", region_name=self.region)
        return self._client

    def list_data_lakes(self) -> dict[str, Any]:
        """List Security Lake data lakes in the account."""
        def fetch():
            try:
                client = self._get_client()
                response = client.list_data_lakes()
                data_lakes = response.get("dataLakes", [])
                return {
                    "data_lakes": [
                        {
                            "data_lake_arn": mask_account_id(dl.get("dataLakeArn")),
                            "region": dl.get("region"),
                            "status": dl.get("createStatus"),
                            "s3_bucket_arn": mask_account_id(dl.get("s3BucketArn")),
                            "encryption_configuration": dl.get("encryptionConfiguration"),
                            "lifecycle_configuration": dl.get("lifecycleConfiguration"),
                            "replication_configuration": dl.get("replicationConfiguration"),
                        }
                        for dl in data_lakes
                    ],
                    "total": len(data_lakes),
                    "live": True,
                    "source": "securitylake:list_data_lakes",
                    "note": None,
                }
            except client.exceptions.AccessDeniedException:
                logger.info("Security Lake access denied")
                return {
                    "data_lakes": [],
                    "total": 0,
                    "live": False,
                    "source": "securitylake:list_data_lakes",
                    "note": "Access denied to Security Lake. Check IAM permissions.",
                }
            except (ClientError, BotoCoreError) as e:
                code = getattr(e, "response", {}).get("Error", {}).get("Code", "")
                if code == "ResourceNotFoundException" or "not enabled" in str(e).lower():
                    return {
                        "data_lakes": [],
                        "total": 0,
                        "live": False,
                        "source": "securitylake:list_data_lakes",
                        "note": "Security Lake is not enabled in this account/region.",
                    }
                logger.warning("Security Lake list_data_lakes error: %s", e)
                return {
                    "data_lakes": [],
                    "total": 0,
                    "live": False,
                    "source": "securitylake:list_data_lakes",
                    "note": "Security Lake unavailable.",
                }

        result, cached_at = get_or_load(
            f"security_lake:data_lakes:{self.region}",
            _CACHE_TTL,
            fetch,
            should_cache=lambda r: r.get("live", False),
        )
        if result.get("live") and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the dict it still holds, so assigning
            # result["note"] would append a stamp per hit and grow the cached note
            # without bound. A shallow copy swaps only this top-level scalar.
            result = {**result, "note": f"{result.get('note', '')} · {stamp}".strip(" ·")}
        return result

    def list_subscribers(self) -> dict[str, Any]:
        """List Security Lake subscribers."""
        def fetch():
            try:
                client = self._get_client()
                subscribers = []
                paginator = client.get_paginator("list_subscribers")
                for page in paginator.paginate(PaginationConfig={"MaxItems": 100, "PageSize": 50}):
                    for sub in page.get("subscribers", []):
                        subscribers.append({
                            "subscriber_id": sub.get("subscriberId"),
                            "subscriber_arn": mask_account_id(sub.get("subscriberArn")),
                            "subscriber_name": sub.get("subscriberName"),
                            "subscriber_identity": _mask_deep(sub.get("subscriberIdentity")),
                            "access_types": sub.get("accessTypes", []),
                            "sources": sub.get("sources", []),
                            "subscriber_status": sub.get("subscriberStatus"),
                            "resource_share_arn": mask_account_id(sub.get("resourceShareArn")),
                            "s3_bucket_arn": mask_account_id(sub.get("s3BucketArn")),
                            "created_at": str(sub.get("createdAt")) if sub.get("createdAt") else None,
                            "updated_at": str(sub.get("updatedAt")) if sub.get("updatedAt") else None,
                        })
                return {
                    "subscribers": subscribers,
                    "total": len(subscribers),
                    "live": True,
                    "source": "securitylake:list_subscribers",
                    "note": None,
                }
            except (ClientError, BotoCoreError) as e:
                code = getattr(e, "response", {}).get("Error", {}).get("Code", "")
                if code == "AccessDeniedException":
                    return {
                        "subscribers": [],
                        "total": 0,
                        "live": False,
                        "source": "securitylake:list_subscribers",
                        "note": "Access denied to list subscribers.",
                    }
                if code == "ResourceNotFoundException" or "not enabled" in str(e).lower():
                    return {
                        "subscribers": [],
                        "total": 0,
                        "live": False,
                        "source": "securitylake:list_subscribers",
                        "note": "Security Lake is not enabled.",
                    }
                logger.warning("Security Lake list_subscribers error: %s", e)
                return {
                    "subscribers": [],
                    "total": 0,
                    "live": False,
                    "source": "securitylake:list_subscribers",
                    "note": "Error listing subscribers.",
                }

        result, cached_at = get_or_load(
            f"security_lake:subscribers:{self.region}",
            _CACHE_TTL,
            fetch,
            should_cache=lambda r: r.get("live", False),
        )
        if result.get("live") and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the dict it still holds, so assigning
            # result["note"] would append a stamp per hit and grow the cached note
            # without bound. A shallow copy swaps only this top-level scalar.
            result = {**result, "note": f"{result.get('note', '')} · {stamp}".strip(" ·")}
        return result

    def list_log_sources(self) -> dict[str, Any]:
        """List Security Lake log sources (AWS and custom)."""
        def fetch():
            try:
                client = self._get_client()
                log_sources = []
                paginator = client.get_paginator("list_log_sources")
                for page in paginator.paginate(PaginationConfig={"MaxItems": 200, "PageSize": 50}):
                    for src in page.get("sources", []):
                        log_sources.append({
                            "region": src.get("region"),
                            "account": src.get("account"),
                            "sources": src.get("sources", []),
                        })
                return {
                    "log_sources": log_sources,
                    "total": len(log_sources),
                    "live": True,
                    "source": "securitylake:list_log_sources",
                    "note": None,
                }
            except (ClientError, BotoCoreError) as e:
                code = getattr(e, "response", {}).get("Error", {}).get("Code", "")
                if code == "AccessDeniedException":
                    return {
                        "log_sources": [],
                        "total": 0,
                        "live": False,
                        "source": "securitylake:list_log_sources",
                        "note": "Access denied to list log sources.",
                    }
                if code == "ResourceNotFoundException" or "not enabled" in str(e).lower():
                    return {
                        "log_sources": [],
                        "total": 0,
                        "live": False,
                        "source": "securitylake:list_log_sources",
                        "note": "Security Lake is not enabled.",
                    }
                logger.warning("Security Lake list_log_sources error: %s", e)
                return {
                    "log_sources": [],
                    "total": 0,
                    "live": False,
                    "source": "securitylake:list_log_sources",
                    "note": "Error listing log sources.",
                }

        result, cached_at = get_or_load(
            f"security_lake:log_sources:{self.region}",
            _CACHE_TTL,
            fetch,
            should_cache=lambda r: r.get("live", False),
        )
        if result.get("live") and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the dict it still holds, so assigning
            # result["note"] would append a stamp per hit and grow the cached note
            # without bound. A shallow copy swaps only this top-level scalar.
            result = {**result, "note": f"{result.get('note', '')} · {stamp}".strip(" ·")}
        return result

    def get_summary(self) -> dict[str, Any]:
        """Get unified Security Lake summary — data lakes + subscribers + log sources."""
        def fetch():
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = {
                    pool.submit(self.list_data_lakes): "data_lakes",
                    pool.submit(self.list_subscribers): "subscribers",
                    pool.submit(self.list_log_sources): "log_sources",
                }
                results = {}
                for fut in as_completed(futures):
                    key = futures[fut]
                    try:
                        results[key] = fut.result()
                    except Exception as e:
                        logger.warning("Security Lake %s fetch failed: %s", key, e)
                        results[key] = {
                            f"{key}": [],
                            "total": 0,
                            "live": False,
                            "note": "Fetch failed.",
                        }

            dl_result = results.get("data_lakes", {})
            sub_result = results.get("subscribers", {})
            src_result = results.get("log_sources", {})

            any_live = any(r.get("live", False) for r in [dl_result, sub_result, src_result])

            return {
                "data_lakes": dl_result.get("data_lakes", []),
                "data_lakes_count": dl_result.get("total", 0),
                "subscribers": sub_result.get("subscribers", []),
                "subscribers_count": sub_result.get("total", 0),
                "log_sources": src_result.get("log_sources", []),
                "log_sources_count": src_result.get("total", 0),
                "live": any_live,
                "source": "securitylake:summary",
                "note": None if any_live else "Security Lake not enabled or access denied.",
            }

        result, cached_at = get_or_load(
            f"security_lake:summary:{self.region}",
            _CACHE_TTL,
            fetch,
            should_cache=lambda r: r.get("live", False),
        )
        if result.get("live") and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the dict it still holds, so assigning
            # result["note"] would append a stamp per hit and grow the cached note
            # without bound. A shallow copy swaps only this top-level scalar.
            result = {**result, "note": f"{result.get('note', '')} · {stamp}".strip(" ·")}
        return result
