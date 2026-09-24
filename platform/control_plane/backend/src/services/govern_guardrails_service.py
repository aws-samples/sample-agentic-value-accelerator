"""Govern Guardrails service — real Bedrock Guardrails telemetry, read-through + cached.

Joins two live AWS sources:
  - bedrock:ListGuardrails             → the configured guardrail fleet
  - cloudwatch AWS/Bedrock/Guardrails  → Invocations + InvocationsIntervened,
    per-guardrail (GuardrailArn+GuardrailVersion) and per-policy-type
    (GuardrailPolicyType+Operation=ApplyGuardrail).

Follows the govern_models / govern_evals convention: lazy boto3 clients, honest
live/source/note flags, graceful live=False fallback that never raises, short TTL.

Verified against the account: policy types emitting metrics are ContentPolicy,
TopicPolicy, WordPolicy, SensitiveInformationPolicy, ContextualGroundingPolicy;
the per-policy InvocationsIntervened series carry Operation=ApplyGuardrail.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load
from models.govern_guardrails import (
    GuardrailSummary,
    GuardrailTelemetryResponse,
    PolicyBreakdown,
)
from models.guardrail import (
    ContentFilterConfig,
    ContextualGroundingConfig,
    DeniedTopic,
    FilterStrength,
    FilterType,
    GuardrailStatus,
    GuardrailTemplate,
    PiiAction,
    PiiEntityConfig,
    PiiEntityType,
    SensitiveRegexConfig,
    WordFilterConfig,
)

logger = logging.getLogger(__name__)

_TELEMETRY_TTL = 120  # 2 min
_LIST_TTL = 120  # 2 min — live guardrail config list

# Policy types Bedrock emits under GuardrailPolicyType, with display metadata.
_POLICY_TYPES = {
    "ContentPolicy": ("Content filters", "Hate, violence, insults, sexual, misconduct & prompt-attack"),
    "TopicPolicy": ("Denied topics", "Out-of-scope / prohibited subject matter"),
    "WordPolicy": ("Word filters", "Profanity & blocked terms"),
    "SensitiveInformationPolicy": ("PII / sensitive data", "PII, PHI & PCI detection / redaction"),
    "ContextualGroundingPolicy": ("Contextual grounding", "Hallucination & relevance thresholds"),
}

# Bedrock guardrail status → GuardrailTemplate status. Anything unlisted falls back
# to the matching lowercase enum member when valid, else DRAFT (keeps the model valid).
_BEDROCK_STATUS_MAP = {
    "READY": GuardrailStatus.ACTIVE,
    "CREATING": GuardrailStatus.CREATING,
    "UPDATING": GuardrailStatus.UPDATING,
    "FAILED": GuardrailStatus.FAILED,
}


def _map_guardrail_status(bedrock_status: str | None) -> GuardrailStatus:
    """Map a Bedrock guardrail status to the GuardrailTemplate status enum."""
    s = (bedrock_status or "").upper()
    if s in _BEDROCK_STATUS_MAP:
        return _BEDROCK_STATUS_MAP[s]
    try:
        return GuardrailStatus(s.lower())
    except ValueError:
        return GuardrailStatus.DRAFT


def _safe_filter_strength(value: str | None) -> FilterStrength:
    """Coerce a Bedrock filter strength to the FilterStrength enum (MEDIUM fallback)."""
    try:
        return FilterStrength(value)
    except ValueError:
        return FilterStrength.MEDIUM


class GovernGuardrailsService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._bedrock = None
        self._cw = None

    def _bedrock_client(self):
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock", region_name=self.region)
        return self._bedrock

    def _cw_client(self):
        if self._cw is None:
            self._cw = boto3.client("cloudwatch", region_name=self.region)
        return self._cw

    def get_telemetry(self, days: int = 30) -> GuardrailTelemetryResponse:
        """Cached wrapper around the live guardrail-telemetry fetch (2 min TTL)."""
        result, cached_at = get_or_load(
            f"guardrails:telemetry:{self.region}:{days}", _TELEMETRY_TTL,
            lambda: self._fetch_telemetry(days), should_cache=lambda r: r.live,
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

    def _fetch_telemetry(self, days: int = 30) -> GuardrailTelemetryResponse:
        try:
            guardrails, arn_by_id = self._list_guardrails()
            if not guardrails:
                return GuardrailTelemetryResponse(
                    guardrails=[], window_days=days, live=False, source="no-guardrails",
                    note="No Bedrock guardrails configured in this account/region.",
                )

            end = datetime.now(timezone.utc)
            start = end - timedelta(days=days)
            period = 86400 * max(1, days)  # single bucket over the whole window

            # 1) Per-guardrail Invocations + InvocationsIntervened (by ARN+Version).
            per_guardrail = self._per_guardrail_metrics(guardrails, arn_by_id, start, end, period)
            for g in guardrails:
                m = per_guardrail.get(g.guardrail_id) or {}
                inv = m.get("Invocations", 0)
                intv = m.get("InvocationsIntervened", 0)
                g.invocations = inv
                g.interventions = intv
                g.blocked = m.get("InvocationsBlocked", 0)
                g.has_metrics = (inv > 0 or intv > 0)
                g.intervention_rate_pct = round((intv / inv * 100), 2) if inv > 0 else 0.0

            # 2) Per-policy-type interventions across the account.
            by_policy = self._per_policy_metrics(start, end, period)

            total_inv = sum(g.invocations for g in guardrails)
            total_intv = sum(g.interventions for g in guardrails)
            total_blocked = sum(g.blocked for g in guardrails)
            with_metrics = sum(1 for g in guardrails if g.has_metrics)
            guardrails.sort(key=lambda g: (g.interventions, g.invocations), reverse=True)

            return GuardrailTelemetryResponse(
                guardrails=guardrails,
                by_policy=by_policy,
                total_guardrails=len(guardrails),
                total_invocations=total_inv,
                total_interventions=total_intv,
                total_blocked=total_blocked,
                intervention_rate_pct=round((total_intv / total_inv * 100), 2) if total_inv > 0 else 0.0,
                guardrails_with_metrics=with_metrics,
                window_days=days,
                live=True,
                source="bedrock-guardrails+cloudwatch",
                note=None if total_inv > 0 else "Guardrails configured but no invocations recorded in the window yet.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Guardrail telemetry unavailable, returning fallback: %s", e)
            return GuardrailTelemetryResponse(
                guardrails=[], window_days=days, live=False, source="unavailable-fallback",
                note="Bedrock/CloudWatch unreachable or bedrock:ListGuardrails not granted.",
            )

    def _list_guardrails(self) -> tuple[list[GuardrailSummary], dict[str, str]]:
        """The account's configured guardrails (bedrock:ListGuardrails, paginated).

        Returns the summaries plus an id→ARN map (the ARN is only needed to key the
        CloudWatch GuardrailArn dimension, so it is not surfaced on the model).
        """
        client = self._bedrock_client()
        out: list[GuardrailSummary] = []
        arn_by_id: dict[str, str] = {}
        token = None
        while len(out) < 100:
            kwargs = {"maxResults": 50}
            if token:
                kwargs["nextToken"] = token
            resp = client.list_guardrails(**kwargs)
            for g in resp.get("guardrails", []):
                gid = g.get("id", "")
                ct = g.get("createdAt")
                if g.get("arn"):
                    arn_by_id[gid] = g["arn"]
                out.append(GuardrailSummary(
                    guardrail_id=gid,
                    name=g.get("name", gid),
                    region=self.region,
                    status=g.get("status", ""),
                    version=g.get("version", ""),
                    description=g.get("description"),
                    created_at=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                ))
            token = resp.get("nextToken")
            if not token:
                break
        return out, arn_by_id

    #: CloudWatch metrics fetched per guardrail. Intervened and Blocked are NOT the
    #: same measurement and must not be substituted for one another: an intervention
    #: is any guardrail action, which includes masking PII and letting the request
    #: through, while blocked counts only refusals. Reporting interventions as blocks
    #: overstates refusals by however much PII masking is in use.
    _PER_GUARDRAIL_METRICS = ("Invocations", "InvocationsIntervened", "InvocationsBlocked")

    def _per_guardrail_metrics(self, guardrails, arn_by_id, start, end, period) -> dict[str, dict[str, int]]:
        """Sum of Invocations / InvocationsIntervened / InvocationsBlocked per guardrail id."""
        cw = self._cw_client()
        queries = []
        qid_map: dict[str, tuple[str, str]] = {}  # query id -> (guardrail_id, metric)
        for i, g in enumerate(guardrails):
            arn = arn_by_id.get(g.guardrail_id) or f"arn:aws:bedrock:{self.region}::guardrail/{g.guardrail_id}"
            for j, metric in enumerate(self._PER_GUARDRAIL_METRICS):
                qid = f"g{i}_{j}"
                qid_map[qid] = (g.guardrail_id, metric)
                queries.append({
                    "Id": qid,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/Bedrock/Guardrails",
                            "MetricName": metric,
                            "Dimensions": [
                                {"Name": "GuardrailArn", "Value": arn},
                                {"Name": "GuardrailVersion", "Value": g.version or "DRAFT"},
                            ],
                        },
                        "Period": period,
                        "Stat": "Sum",
                    },
                    "ReturnData": True,
                })

        results: dict[str, float] = {}
        for k in range(0, len(queries), 450):
            chunk = queries[k:k + 450]
            if not chunk:
                continue
            resp = cw.get_metric_data(MetricDataQueries=chunk, StartTime=start, EndTime=end)
            for r in resp.get("MetricDataResults", []):
                vals = r.get("Values", [])
                results[r["Id"]] = sum(vals) if vals else 0.0

        agg: dict[str, dict[str, float]] = {}
        for qid, (gid, metric) in qid_map.items():
            agg.setdefault(gid, {})[metric] = results.get(qid, 0.0)
        return {
            gid: {m: int(v.get(m, 0)) for m in self._PER_GUARDRAIL_METRICS}
            for gid, v in agg.items()
        }

    def _per_policy_metrics(self, start, end, period) -> list[PolicyBreakdown]:
        """InvocationsIntervened per GuardrailPolicyType (Operation=ApplyGuardrail)."""
        cw = self._cw_client()
        queries = []
        qid_map: dict[str, str] = {}
        for i, pt in enumerate(_POLICY_TYPES):
            qid = f"p{i}"
            qid_map[qid] = pt
            queries.append({
                "Id": qid,
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/Bedrock/Guardrails",
                        "MetricName": "InvocationsIntervened",
                        "Dimensions": [
                            {"Name": "GuardrailPolicyType", "Value": pt},
                            {"Name": "Operation", "Value": "ApplyGuardrail"},
                        ],
                    },
                    "Period": period,
                    "Stat": "Sum",
                },
                "ReturnData": True,
            })

        resp = cw.get_metric_data(MetricDataQueries=queries, StartTime=start, EndTime=end)
        totals: dict[str, int] = {}
        for r in resp.get("MetricDataResults", []):
            vals = r.get("Values", [])
            totals[qid_map[r["Id"]]] = int(sum(vals)) if vals else 0

        out = [
            PolicyBreakdown(
                policy_type=pt,
                label=_POLICY_TYPES[pt][0],
                dimension=_POLICY_TYPES[pt][1],
                interventions=totals.get(pt, 0),
            )
            for pt in _POLICY_TYPES
        ]
        out.sort(key=lambda p: p.interventions, reverse=True)
        return out

    # --- Live guardrail config list (Secure module's GuardrailTemplate shape) ---

    def get_guardrails_list(self) -> list[GuardrailTemplate]:
        """Live Bedrock guardrails in this region as GuardrailTemplate records (2 min TTL).

        Same shape the Secure module serves so the Prompt Governance panel renders
        content filters / PII / denied topics / grounding with no transform. Never
        raises: any AWS error yields []. Cached only when the list is non-empty so a
        transient failure doesn't pin an empty list for the whole TTL.
        """
        result, _cached_at = get_or_load(
            f"guardrails:list:{self.region}", _LIST_TTL,
            self._fetch_guardrails_list, should_cache=lambda r: bool(r),
        )
        return result

    def _fetch_guardrails_list(self) -> list[GuardrailTemplate]:
        try:
            client = self._bedrock_client()
            summaries: list[dict] = []
            token = None
            while len(summaries) < 200:
                kwargs = {"maxResults": 50}
                if token:
                    kwargs["nextToken"] = token
                resp = client.list_guardrails(**kwargs)
                summaries.extend(resp.get("guardrails", []))
                token = resp.get("nextToken")
                if not token:
                    break
        except (ClientError, BotoCoreError) as e:
            logger.warning("bedrock:ListGuardrails unavailable, returning []: %s", e)
            return []

        templates: list[GuardrailTemplate] = []
        for summary in summaries:
            gid = summary.get("id", "")
            if not gid:
                continue
            try:
                templates.append(self._guardrail_to_template(client, summary))
            except (ClientError, BotoCoreError, ValueError, KeyError) as e:
                logger.warning("Skipping guardrail %s (get_guardrail failed): %s", gid, e)
        return templates

    def _guardrail_to_template(self, client, summary: dict) -> GuardrailTemplate:
        """Map one Bedrock guardrail (+ its DRAFT config) to a GuardrailTemplate.

        Mirrors the Secure guardrail service's Bedrock→template field mapping so both
        surfaces render identically; account IDs in the ARN are masked.
        """
        gid = summary["id"]
        version = summary.get("version") or "DRAFT"
        detail = client.get_guardrail(guardrailIdentifier=gid, guardrailVersion="DRAFT")

        # Content filters ← contentPolicy.filters (skip types this model doesn't know).
        valid_filter_types = {t.value for t in FilterType}
        content_filters: list[ContentFilterConfig] = []
        for f in (detail.get("contentPolicy") or {}).get("filters", []) or []:
            ftype = f.get("type")
            if ftype not in valid_filter_types:
                continue
            content_filters.append(ContentFilterConfig(
                type=FilterType(ftype),
                input_strength=_safe_filter_strength(f.get("inputStrength")),
                output_strength=_safe_filter_strength(f.get("outputStrength")),
            ))

        # Denied topics ← topicPolicy.topics (DENY).
        denied_topics: list[DeniedTopic] = []
        for t in (detail.get("topicPolicy") or {}).get("topics", []) or []:
            if t.get("type") and t.get("type") != "DENY":
                continue
            denied_topics.append(DeniedTopic(
                name=t.get("name", ""),
                definition=t.get("definition") or "",
                examples=t.get("examples", []) or [],
            ))

        # PII entities + custom regexes ← sensitiveInformationPolicy.
        si = detail.get("sensitiveInformationPolicy") or {}
        pii_entities: list[PiiEntityConfig] = []
        for p in si.get("piiEntities", []) or []:
            try:
                pii_entities.append(PiiEntityConfig(
                    type=PiiEntityType(p.get("type")),
                    action=PiiAction(p.get("action", "ANONYMIZE")),
                ))
            except ValueError:
                continue  # entity type this model doesn't enumerate
        sensitive_regexes: list[SensitiveRegexConfig] = []
        for r in si.get("regexes", []) or []:
            try:
                sensitive_regexes.append(SensitiveRegexConfig(
                    name=r.get("name") or "pattern",
                    pattern=r.get("pattern") or "",
                    description=r.get("description"),
                    action=PiiAction(r.get("action", "BLOCK")),
                ))
            except ValueError:
                continue

        # Word filter ← wordPolicy.
        word_filter = None
        wp = detail.get("wordPolicy") or {}
        managed = wp.get("managedWordLists", []) or []
        words = wp.get("words", []) or []
        if managed or words:
            word_filter = WordFilterConfig(
                enable_profanity=any(m.get("type") == "PROFANITY" for m in managed),
                blocked_words=[w.get("text", "") for w in words if w.get("text")],
            )

        # Contextual grounding ← contextualGroundingPolicy.filters.
        contextual_grounding = None
        cg_filters = (detail.get("contextualGroundingPolicy") or {}).get("filters", []) or []
        if cg_filters:
            thresholds = {c.get("type"): c.get("threshold") for c in cg_filters}
            contextual_grounding = ContextualGroundingConfig(
                enabled=True,
                grounding_threshold=float(thresholds.get("GROUNDING") or 0.0),
                relevance_threshold=float(thresholds.get("RELEVANCE") or 0.0),
            )

        arn = detail.get("guardrailArn") or summary.get("arn")
        return GuardrailTemplate(
            template_id=gid,  # stable, unique key for the frontend
            name=detail.get("name") or summary.get("name") or gid,
            description=detail.get("description"),
            status=_map_guardrail_status(detail.get("status") or summary.get("status")),
            guardrail_id=gid,
            guardrail_arn=mask_account_id(arn),
            guardrail_version=version,
            content_filters=content_filters,
            denied_topics=denied_topics,
            pii_entities=pii_entities,
            sensitive_regexes=sensitive_regexes,
            word_filter=word_filter,
            contextual_grounding=contextual_grounding,
            created_by="bedrock-live",
        )
