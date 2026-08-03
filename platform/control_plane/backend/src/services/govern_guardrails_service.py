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

from core.ttl_cache import get_or_load
from models.govern_guardrails import (
    GuardrailSummary,
    GuardrailTelemetryResponse,
    PolicyBreakdown,
)

logger = logging.getLogger(__name__)

_TELEMETRY_TTL = 120  # 2 min

# Policy types Bedrock emits under GuardrailPolicyType, with display metadata.
_POLICY_TYPES = {
    "ContentPolicy": ("Content filters", "Hate, violence, insults, sexual, misconduct & prompt-attack"),
    "TopicPolicy": ("Denied topics", "Out-of-scope / prohibited subject matter"),
    "WordPolicy": ("Word filters", "Profanity & blocked terms"),
    "SensitiveInformationPolicy": ("PII / sensitive data", "PII, PHI & PCI detection / redaction"),
    "ContextualGroundingPolicy": ("Contextual grounding", "Hallucination & relevance thresholds"),
}


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
            result.note = f"{result.note} · {stamp}" if result.note else stamp
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
                inv, intv = per_guardrail.get(g.guardrail_id, (0, 0))
                g.invocations = inv
                g.interventions = intv
                g.has_metrics = (inv > 0 or intv > 0)
                g.intervention_rate_pct = round((intv / inv * 100), 2) if inv > 0 else 0.0

            # 2) Per-policy-type interventions across the account.
            by_policy = self._per_policy_metrics(start, end, period)

            total_inv = sum(g.invocations for g in guardrails)
            total_intv = sum(g.interventions for g in guardrails)
            with_metrics = sum(1 for g in guardrails if g.has_metrics)
            guardrails.sort(key=lambda g: (g.interventions, g.invocations), reverse=True)

            return GuardrailTelemetryResponse(
                guardrails=guardrails,
                by_policy=by_policy,
                total_guardrails=len(guardrails),
                total_invocations=total_inv,
                total_interventions=total_intv,
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
                    status=g.get("status", ""),
                    version=g.get("version", ""),
                    description=g.get("description"),
                    created_at=ct.isoformat() if hasattr(ct, "isoformat") else (str(ct) if ct else None),
                ))
            token = resp.get("nextToken")
            if not token:
                break
        return out, arn_by_id

    def _per_guardrail_metrics(self, guardrails, arn_by_id, start, end, period) -> dict[str, tuple[int, int]]:
        """Sum of Invocations + InvocationsIntervened per guardrail id over the window."""
        cw = self._cw_client()
        queries = []
        qid_map: dict[str, tuple[str, str]] = {}  # query id -> (guardrail_id, metric)
        for i, g in enumerate(guardrails):
            arn = arn_by_id.get(g.guardrail_id) or f"arn:aws:bedrock:{self.region}::guardrail/{g.guardrail_id}"
            for j, metric in enumerate(("Invocations", "InvocationsIntervened")):
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
            gid: (int(v.get("Invocations", 0)), int(v.get("InvocationsIntervened", 0)))
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
