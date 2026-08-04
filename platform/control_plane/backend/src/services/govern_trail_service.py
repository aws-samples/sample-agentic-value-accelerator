"""Govern Trail service — real CloudTrail AI-service activity, read-through + cached.

Uses cloudtrail:LookupEvents filtered by EventSource to surface recent Bedrock +
SageMaker API activity for the audit trail. The CloudTrailEvent payload is a JSON
string; we parse it for the invoking identity and any error code. Follows the
govern_cost convention: honest live/source/note, graceful fallback, short TTL.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_trail import AiCaller, AiCallersResponse, TrailEvent, TrailResponse

logger = logging.getLogger(__name__)

_TRAIL_TTL = 60   # 1 min — recent activity, near-real-time

# AI-service event sources we surface for the governance audit trail.
_AI_SOURCES = ["bedrock.amazonaws.com", "sagemaker.amazonaws.com"]


def _mask_identity(ident: str | None) -> str | None:
    """Mask a caller identity for the frontend — preserve the governance signal
    (recognizable role/user name, correlatable across events) while redacting the
    sensitive parts (full ARNs, account ids, random STS session-token suffixes).

    Rules: take the ARN/path tail (role or session name), then mask any long random
    suffix after the last '-' (e.g. STS session tokens, resource random ids) to a
    fixed '••••'. Short plain identities (IAM usernames like 'gs1') pass through.
    """
    if not ident:
        return ident
    # Reduce a full ARN / path to its last segment (role name / session name).
    tail = ident.rsplit("/", 1)[-1].rsplit(":", 1)[-1]
    # Mask a trailing random token: name-<random> → name-•••• (keeps the readable name).
    parts = tail.rsplit("-", 1)
    if len(parts) == 2 and len(parts[1]) >= 6 and any(c.isdigit() for c in parts[1]):
        return f"{parts[0]}-••••"
    return tail


class GovernTrailService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._ct = None

    def _client(self):
        if self._ct is None:
            self._ct = boto3.client("cloudtrail", region_name=self.region)
        return self._ct

    def get_ai_activity(self, hours: int = 24, per_source: int = 25) -> TrailResponse:
        """Cached wrapper around the live CloudTrail fetch (2 min TTL)."""
        result, cached_at = get_or_load(
            f"trail:ai:{self.region}:{hours}:{per_source}", _TRAIL_TTL,
            lambda: self._fetch_ai_activity(hours, per_source), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def get_ai_callers(self, hours: int = 168, per_source: int = 200) -> AiCallersResponse:
        """Cached wrapper around the AI-caller rollup (2 min TTL)."""
        result, cached_at = get_or_load(
            f"trail:callers:{self.region}:{hours}:{per_source}", _TRAIL_TTL,
            lambda: self._fetch_ai_callers(hours, per_source), should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_ai_callers(self, hours: int = 168, per_source: int = 200) -> AiCallersResponse:
        """Roll up distinct identities invoking AI services (shadow-AI signal).

        Aggregates CloudTrail Bedrock/SageMaker events by invoking identity, with
        the sources and most-frequent actions per identity. `recognized` is left
        False here — the caller (frontend) marks identities that match a governed
        agent, since the registry lives on that side.
        """
        try:
            client = self._client()
            start = datetime.now(timezone.utc) - timedelta(hours=hours)
            agg: dict[str, dict] = {}
            for src in _AI_SOURCES:
                resp = client.lookup_events(
                    LookupAttributes=[{"AttributeKey": "EventSource", "AttributeValue": src}],
                    StartTime=start,
                    MaxResults=per_source,
                )
                for e in resp.get("Events", []):
                    ident = e.get("Username")
                    if not ident:
                        try:
                            ui = (json.loads(e.get("CloudTrailEvent", "{}")).get("userIdentity", {}) or {})
                            ident = ui.get("arn") or ui.get("userName") or ui.get("type") or "unknown"
                        except (ValueError, TypeError):
                            ident = "unknown"
                    # Masked identity — readable role/user name, random suffixes redacted.
                    display = _mask_identity(ident) or "unknown"
                    b = agg.setdefault(display, {"count": 0, "sources": set(), "actions": {}, "last": None})
                    b["count"] += 1
                    b["sources"].add(src.replace(".amazonaws.com", ""))
                    name = e.get("EventName", "")
                    b["actions"][name] = b["actions"].get(name, 0) + 1
                    et = e.get("EventTime")
                    ts = et.isoformat() if hasattr(et, "isoformat") else (str(et) if et else None)
                    if ts and (b["last"] is None or ts > b["last"]):
                        b["last"] = ts

            callers = [
                AiCaller(
                    identity=ident,
                    event_count=b["count"],
                    sources=sorted(b["sources"]),
                    top_actions=[a for a, _ in sorted(b["actions"].items(), key=lambda kv: kv[1], reverse=True)[:3]],
                    last_seen=b["last"],
                    recognized=False,
                )
                for ident, b in agg.items()
            ]
            callers.sort(key=lambda c: c.event_count, reverse=True)
            return AiCallersResponse(
                callers=callers, total_callers=len(callers), unrecognized=len(callers),
                window_hours=hours, live=True, source="cloudtrail",
                note=None if callers else f"No AI-service callers in the last {hours}h.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudTrail callers unavailable: %s", e)
            return AiCallersResponse(
                callers=[], live=False, source="unavailable-fallback",
                note="CloudTrail unreachable or cloudtrail:LookupEvents not granted.",
            )

    def _fetch_ai_activity(self, hours: int = 24, per_source: int = 25) -> TrailResponse:
        try:
            client = self._client()
            start = datetime.now(timezone.utc) - timedelta(hours=hours)
            events: list[TrailEvent] = []
            by_source: dict[str, int] = {}
            errors = 0

            for src in _AI_SOURCES:
                resp = client.lookup_events(
                    LookupAttributes=[{"AttributeKey": "EventSource", "AttributeValue": src}],
                    StartTime=start,
                    MaxResults=per_source,
                )
                raw = resp.get("Events", [])
                by_source[src] = len(raw)
                for e in raw:
                    err = None
                    username = e.get("Username")
                    try:
                        detail = json.loads(e.get("CloudTrailEvent", "{}"))
                        err = detail.get("errorCode")
                        if not username:
                            username = (detail.get("userIdentity", {}) or {}).get("arn") \
                                or (detail.get("userIdentity", {}) or {}).get("userName")
                    except (ValueError, TypeError):
                        pass
                    if err:
                        errors += 1
                    et = e.get("EventTime")
                    events.append(TrailEvent(
                        event_id=e.get("EventId", ""),
                        event_name=e.get("EventName", ""),
                        event_source=src,
                        event_time=et.isoformat() if hasattr(et, "isoformat") else (str(et) if et else None),
                        username=_mask_identity(username),
                        error_code=err,
                    ))

            events.sort(key=lambda x: x.event_time or "", reverse=True)
            total = len(events)
            return TrailResponse(
                events=events, total=total, by_source=by_source, errors=errors,
                window_hours=hours, live=True, source="cloudtrail",
                note=None if total else f"No AI-service (Bedrock/SageMaker) activity in the last {hours}h.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudTrail unavailable, returning fallback: %s", e)
            return TrailResponse(
                events=[], live=False, source="unavailable-fallback",
                note="CloudTrail unreachable or cloudtrail:LookupEvents not granted.",
            )
