"""Govern Posture service — real AWS Config compliance, read-through.

Follows the govern_cost convention: lazy boto3 client, honest live/source/note
flags, graceful live=False fallback that never raises. Paginates Config rules
so the count reflects the whole account, not just the first page.
"""

from __future__ import annotations

import logging
import time

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_posture import ConfigCompliance, ConfigRuleDetail, FailingRule

logger = logging.getLogger(__name__)

_CONFIG_TTL = 300   # 5 min — Config rule evaluations move slowly
_DETAIL_TTL = 300
_MAX_RULES_DETAIL = 20   # cap rules we pull per-resource detail for (keeps it fast)


class GovernPostureService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._config = None

    def _config_client(self):
        if self._config is None:
            self._config = boto3.client("config", region_name=self.region)
        return self._config

    def get_config_compliance(self) -> ConfigCompliance:
        """Cached wrapper around the live Config compliance fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"posture:config:{self.region}", _CONFIG_TTL,
            self._fetch_config_compliance, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_config_compliance(self) -> ConfigCompliance:
        """AWS Config rule compliance summary, paginated across all rules."""
        try:
            client = self._config_client()
            compliant = non_compliant = insufficient = 0
            token = None
            while True:
                kwargs = {}
                if token:
                    kwargs["NextToken"] = token
                resp = client.describe_compliance_by_config_rule(**kwargs)
                for rule in resp.get("ComplianceByConfigRules", []):
                    ct = (rule.get("Compliance", {}) or {}).get("ComplianceType", "")
                    if ct == "COMPLIANT":
                        compliant += 1
                    elif ct == "NON_COMPLIANT":
                        non_compliant += 1
                    elif ct == "INSUFFICIENT_DATA":
                        insufficient += 1
                token = resp.get("NextToken")
                if not token:
                    break

            evaluated = compliant + non_compliant
            return ConfigCompliance(
                compliant=compliant,
                non_compliant=non_compliant,
                insufficient_data=insufficient,
                total_rules=evaluated,
                pct_compliant=round(compliant / evaluated * 100, 1) if evaluated > 0 else 0.0,
                live=True,
                source="aws-config",
                note=None if evaluated else "AWS Config has no evaluated rules yet.",
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("AWS Config compliance unavailable, returning fallback: %s", e)
            return ConfigCompliance(
                live=False, source="unavailable-fallback",
                note="AWS Config unreachable or config:DescribeComplianceByConfigRule not granted.",
            )

    def get_rule_detail(self) -> ConfigRuleDetail:
        """Cached wrapper around the failing-rule detail fetch (5 min TTL)."""
        result, cached_at = get_or_load(
            f"posture:config-detail:{self.region}", _DETAIL_TTL,
            self._fetch_rule_detail, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            result.note = f"{result.note} · {stamp}" if result.note else stamp
        return result

    def _fetch_rule_detail(self) -> ConfigRuleDetail:
        """Which Config rules are NON_COMPLIANT + a sample of failing resources each."""
        try:
            client = self._config_client()
            # 1) All non-compliant rule names (paginated).
            failing_names: list[str] = []
            token = None
            while True:
                kwargs = {"ComplianceTypes": ["NON_COMPLIANT"]}
                if token:
                    kwargs["NextToken"] = token
                resp = client.describe_compliance_by_config_rule(**kwargs)
                failing_names.extend(
                    r["ConfigRuleName"] for r in resp.get("ComplianceByConfigRules", [])
                    if (r.get("Compliance", {}) or {}).get("ComplianceType") == "NON_COMPLIANT"
                )
                token = resp.get("NextToken")
                if not token:
                    break
            total_failing = len(failing_names)

            # 2) Rule metadata (description + managed-rule id) for the ones we'll detail.
            detail_names = failing_names[:_MAX_RULES_DETAIL]
            meta: dict[str, dict] = {}
            if detail_names:
                # describe_config_rules accepts up to 25 names per call.
                for i in range(0, len(detail_names), 25):
                    chunk = detail_names[i:i + 25]
                    dr = client.describe_config_rules(ConfigRuleNames=chunk)
                    for r in dr.get("ConfigRules", []):
                        meta[r["ConfigRuleName"]] = {
                            "description": r.get("Description"),
                            "managed": (r.get("Source", {}) or {}).get("SourceIdentifier"),
                        }

            # 3) Failing resources per rule (sampled).
            rules: list[FailingRule] = []
            for name in detail_names:
                rtypes: set[str] = set()
                count = 0
                last: str | None = None
                try:
                    dresp = client.get_compliance_details_by_config_rule(
                        ConfigRuleName=name, ComplianceTypes=["NON_COMPLIANT"], Limit=25,
                    )
                    for ev in dresp.get("EvaluationResults", []):
                        q = (ev.get("EvaluationResultIdentifier", {}) or {}).get("EvaluationResultQualifier", {}) or {}
                        if q.get("ResourceType"):
                            rtypes.add(q["ResourceType"])
                        count += 1
                        rt = ev.get("ResultRecordedTime")
                        ts = rt.isoformat() if hasattr(rt, "isoformat") else (str(rt) if rt else None)
                        if ts and (last is None or ts > last):
                            last = ts
                except (ClientError, BotoCoreError, KeyError, ValueError):
                    pass  # keep the rule listed even if resource detail is unavailable
                m = meta.get(name, {})
                rules.append(FailingRule(
                    rule_name=name, description=m.get("description"), managed_rule=m.get("managed"),
                    failing_resource_count=count, resource_types=sorted(rtypes), last_evaluated=last,
                ))

            return ConfigRuleDetail(
                failing_rules=rules, total_failing=total_failing,
                live=True, source="aws-config",
                note=(f"Showing detail for {len(rules)} of {total_failing} failing rules."
                      if total_failing > len(rules) else None),
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("AWS Config rule detail unavailable, returning fallback: %s", e)
            return ConfigRuleDetail(
                live=False, source="unavailable-fallback",
                note="AWS Config unreachable or config detail APIs not granted.",
            )
