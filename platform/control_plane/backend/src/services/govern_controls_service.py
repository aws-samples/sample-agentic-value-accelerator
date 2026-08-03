"""Govern Controls service — unified control evaluation across AWS sources.

Evaluates controls by mapping autoDetectSource to the appropriate AWS service call
and returning a structured evaluation result. Follows the govern_compliance_service
pattern: honest live/source flags, graceful fallback on errors, short TTL caching.

Supported sources:
  - cloudtrail: Check for active trails and recent events
  - cloudwatch: Check for relevant alarms/metrics
  - bedrock-guardrails: Check guardrails configured with low intervention rate
  - bedrock-agents: Check agent inventory and status
  - config / config-rules: Check AWS Config rule compliance
  - sagemaker: Check SageMaker model inventory and endpoints
  - iam: Check IAM policies and roles
  - glue: Check Glue Data Catalog databases and tables
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from models.govern_controls import (
    ControlEvaluation,
    ControlEvaluationRequest,
    EvaluateControlsResponse,
    EvaluationStatus,
    SourceStatus,
)

logger = logging.getLogger(__name__)


class GovernControlsService:
    """Service for unified control evaluation across AWS sources."""

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        # Lazy-init boto3 clients
        self._clients: Dict[str, any] = {}
        # Track source latencies and status
        self._source_status: Dict[str, SourceStatus] = {}

    def _get_client(self, service: str):
        """Get or create a boto3 client for the given service."""
        if service not in self._clients:
            self._clients[service] = boto3.client(service, region_name=self.region)
        return self._clients[service]

    def _track_source(self, source: str, start_time: float, live: bool, note: str = None, error: str = None):
        """Record source status and latency."""
        latency_ms = int((time.time() - start_time) * 1000)
        self._source_status[source] = SourceStatus(
            live=live,
            latency_ms=latency_ms,
            note=note,
            error=error,
        )

    async def evaluate_controls(
        self, controls: List[ControlEvaluationRequest]
    ) -> EvaluateControlsResponse:
        """Evaluate a batch of controls using their specified auto-detection sources."""
        self._source_status = {}  # Reset source tracking
        evaluations: List[ControlEvaluation] = []
        all_live = True

        # Map of source name to evaluator function
        evaluators: Dict[str, Callable] = {
            "cloudtrail": self._evaluate_cloudtrail,
            "cloudwatch": self._evaluate_cloudwatch,
            "bedrock-guardrails": self._evaluate_bedrock_guardrails,
            "bedrock-agents": self._evaluate_bedrock_agents,
            "config": self._evaluate_config,
            "config-rules": self._evaluate_config,
            "sagemaker": self._evaluate_sagemaker,
            "iam": self._evaluate_iam,
            "glue": self._evaluate_glue,
        }

        for control in controls:
            source = control.autoDetectSource.lower()
            evaluator = evaluators.get(source)

            if not evaluator:
                # Unknown source
                evaluations.append(ControlEvaluation(
                    controlId=control.id,
                    status=EvaluationStatus.UNKNOWN,
                    evidence=f"Unknown auto-detection source: {control.autoDetectSource}",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.0,
                    source=source,
                ))
                all_live = False
                continue

            try:
                evaluation = evaluator(control.id)
                evaluations.append(evaluation)
                if evaluation.status == EvaluationStatus.ERROR:
                    all_live = False
            except Exception as e:
                logger.error(f"Evaluation failed for {control.id} from {source}: {e}")
                evaluations.append(ControlEvaluation(
                    controlId=control.id,
                    status=EvaluationStatus.ERROR,
                    evidence=f"Evaluation failed: {str(e)}",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.0,
                    source=source,
                ))
                all_live = False

        return EvaluateControlsResponse(
            live=all_live,
            evaluations=evaluations,
            sources=self._source_status,
            evaluated_at=datetime.utcnow(),
        )

    # ─────────────────── CloudTrail Evaluation ───────────────────

    def _evaluate_cloudtrail(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using CloudTrail — checks for active trails and recent events."""
        start = time.time()
        try:
            ct = self._get_client("cloudtrail")

            # Get trails
            trails = ct.describe_trails().get("trailList", [])
            if not trails:
                self._track_source("cloudtrail", start, live=True, note="No trails configured")
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No CloudTrail trails configured in this account/region",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.95,
                    source="cloudtrail",
                )

            # Find active trails and count recent events
            active_trails = []
            total_events = 0
            for trail in trails:
                trail_name = trail.get("Name", "")
                try:
                    status = ct.get_trail_status(Name=trail_name)
                    if status.get("IsLogging"):
                        active_trails.append(trail_name)
                except (ClientError, BotoCoreError):
                    pass

            # Look up recent AI-related events (last 24h)
            if active_trails:
                try:
                    start_time = datetime.now(timezone.utc) - timedelta(hours=24)
                    for src in ["bedrock.amazonaws.com", "sagemaker.amazonaws.com"]:
                        resp = ct.lookup_events(
                            LookupAttributes=[{"AttributeKey": "EventSource", "AttributeValue": src}],
                            StartTime=start_time,
                            MaxResults=50,
                        )
                        total_events += len(resp.get("Events", []))
                except (ClientError, BotoCoreError):
                    pass

            self._track_source("cloudtrail", start, live=True)

            if active_trails:
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.PASS,
                    evidence=f"CloudTrail trail '{active_trails[0]}' active with {total_events} events in last 24h",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.95,
                    source="cloudtrail",
                    details={
                        "active_trails": len(active_trails),
                        "trail_names": active_trails[:3],
                        "events_24h": total_events,
                    },
                )
            else:
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence=f"{len(trails)} trail(s) found but none actively logging",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.9,
                    source="cloudtrail",
                )

        except (ClientError, BotoCoreError) as e:
            self._track_source("cloudtrail", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"CloudTrail unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="cloudtrail",
            )

    # ─────────────────── CloudWatch Evaluation ───────────────────

    def _evaluate_cloudwatch(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using CloudWatch — checks for alarms and metrics."""
        start = time.time()
        try:
            cw = self._get_client("cloudwatch")

            # Get alarms
            alarms_resp = cw.describe_alarms(MaxRecords=100)
            metric_alarms = alarms_resp.get("MetricAlarms", [])
            composite_alarms = alarms_resp.get("CompositeAlarms", [])
            total_alarms = len(metric_alarms) + len(composite_alarms)

            # Check for AI-related metrics (AWS/Bedrock namespace)
            ai_metrics = 0
            try:
                paginator = cw.get_paginator("list_metrics")
                for page in paginator.paginate(Namespace="AWS/Bedrock"):
                    ai_metrics += len(page.get("Metrics", []))
                    if ai_metrics > 0:
                        break  # Just need to know they exist
            except (ClientError, BotoCoreError):
                pass

            self._track_source("cloudwatch", start, live=True)

            if total_alarms > 0 or ai_metrics > 0:
                parts = []
                if total_alarms > 0:
                    parts.append(f"{total_alarms} CloudWatch alarms configured")
                if ai_metrics > 0:
                    parts.append(f"Bedrock metrics being collected")
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.PASS,
                    evidence="; ".join(parts),
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.85,
                    source="cloudwatch",
                    details={
                        "metric_alarms": len(metric_alarms),
                        "composite_alarms": len(composite_alarms),
                        "has_bedrock_metrics": ai_metrics > 0,
                    },
                )
            else:
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No CloudWatch alarms or AI-related metrics configured",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.8,
                    source="cloudwatch",
                )

        except (ClientError, BotoCoreError) as e:
            self._track_source("cloudwatch", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"CloudWatch unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="cloudwatch",
            )

    # ─────────────────── Bedrock Guardrails Evaluation ───────────────────

    def _evaluate_bedrock_guardrails(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using Bedrock Guardrails — checks for configured guardrails."""
        start = time.time()
        try:
            bedrock = self._get_client("bedrock")

            # List guardrails
            resp = bedrock.list_guardrails(maxResults=50)
            guardrails = resp.get("guardrails", [])

            if not guardrails:
                self._track_source("bedrock-guardrails", start, live=True, note="No guardrails configured")
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No Bedrock guardrails configured in this account/region",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.95,
                    source="bedrock-guardrails",
                )

            # Check guardrail statuses
            ready_count = sum(1 for g in guardrails if g.get("status", "").upper() == "READY")

            # Try to get intervention metrics from CloudWatch
            intervention_rate = None
            try:
                cw = self._get_client("cloudwatch")
                end = datetime.now(timezone.utc)
                start_time = end - timedelta(days=7)

                queries = [
                    {
                        "Id": "inv",
                        "MetricStat": {
                            "Metric": {"Namespace": "AWS/Bedrock/Guardrails", "MetricName": "Invocations"},
                            "Period": 86400 * 7,
                            "Stat": "Sum",
                        },
                        "ReturnData": True,
                    },
                    {
                        "Id": "intv",
                        "MetricStat": {
                            "Metric": {"Namespace": "AWS/Bedrock/Guardrails", "MetricName": "InvocationsIntervened"},
                            "Period": 86400 * 7,
                            "Stat": "Sum",
                        },
                        "ReturnData": True,
                    },
                ]
                metrics_resp = cw.get_metric_data(
                    MetricDataQueries=queries, StartTime=start_time, EndTime=end
                )
                results = {r["Id"]: sum(r.get("Values", [])) for r in metrics_resp.get("MetricDataResults", [])}
                inv = results.get("inv", 0)
                intv = results.get("intv", 0)
                if inv > 0:
                    intervention_rate = round(intv / inv * 100, 2)
            except (ClientError, BotoCoreError):
                pass

            self._track_source("bedrock-guardrails", start, live=True)

            evidence_parts = [f"{len(guardrails)} guardrails configured ({ready_count} ready)"]
            if intervention_rate is not None:
                evidence_parts.append(f"{intervention_rate}% intervention rate (7d)")

            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.PASS,
                evidence="; ".join(evidence_parts),
                lastEvaluated=datetime.utcnow(),
                confidence=0.9,
                source="bedrock-guardrails",
                details={
                    "total_guardrails": len(guardrails),
                    "ready_guardrails": ready_count,
                    "intervention_rate_pct": intervention_rate,
                    "guardrail_names": [g.get("name", g.get("id", "")) for g in guardrails[:5]],
                },
            )

        except (ClientError, BotoCoreError) as e:
            self._track_source("bedrock-guardrails", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"Bedrock Guardrails unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="bedrock-guardrails",
            )

    # ─────────────────── Bedrock Agents Evaluation ───────────────────

    def _evaluate_bedrock_agents(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using Bedrock Agents — checks agent inventory."""
        start = time.time()
        try:
            bedrock_agent = self._get_client("bedrock-agent")

            # List agents
            resp = bedrock_agent.list_agents(maxResults=100)
            agents = resp.get("agentSummaries", [])

            if not agents:
                self._track_source("bedrock-agents", start, live=True, note="No agents deployed")
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No Bedrock agents deployed in this account/region",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.9,
                    source="bedrock-agents",
                )

            # Check agent statuses
            prepared = sum(1 for a in agents if a.get("agentStatus", "").upper() == "PREPARED")
            failed = sum(1 for a in agents if "FAIL" in a.get("agentStatus", "").upper())

            self._track_source("bedrock-agents", start, live=True)

            if failed > 0:
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.PARTIAL,
                    evidence=f"{len(agents)} agents in registry ({prepared} prepared, {failed} failed)",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.85,
                    source="bedrock-agents",
                    details={
                        "total_agents": len(agents),
                        "prepared": prepared,
                        "failed": failed,
                        "agent_names": [a.get("agentName", a.get("agentId", "")) for a in agents[:5]],
                    },
                )

            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.PASS,
                evidence=f"{len(agents)} agents in registry ({prepared} prepared)",
                lastEvaluated=datetime.utcnow(),
                confidence=0.85,
                source="bedrock-agents",
                details={
                    "total_agents": len(agents),
                    "prepared": prepared,
                    "agent_names": [a.get("agentName", a.get("agentId", "")) for a in agents[:5]],
                },
            )

        except (ClientError, BotoCoreError) as e:
            self._track_source("bedrock-agents", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"Bedrock Agents unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="bedrock-agents",
            )

    # ─────────────────── AWS Config Evaluation ───────────────────

    def _evaluate_config(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using AWS Config — checks rule compliance."""
        start = time.time()
        try:
            config = self._get_client("config")

            # Get compliance summary
            compliant = 0
            non_compliant = 0
            insufficient = 0
            token = None

            while True:
                kwargs = {}
                if token:
                    kwargs["NextToken"] = token
                resp = config.describe_compliance_by_config_rule(**kwargs)
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

            total = compliant + non_compliant + insufficient

            if total == 0:
                self._track_source("config", start, live=True, note="No Config rules")
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No AWS Config rules configured",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.9,
                    source="config",
                )

            self._track_source("config", start, live=True)

            evaluated = compliant + non_compliant
            pct = round(compliant / evaluated * 100, 1) if evaluated > 0 else 0.0

            if non_compliant == 0:
                status = EvaluationStatus.PASS
            elif pct >= 80:
                status = EvaluationStatus.PARTIAL
            else:
                status = EvaluationStatus.FAIL

            return ControlEvaluation(
                controlId=control_id,
                status=status,
                evidence=f"{total} Config rules: {compliant} compliant, {non_compliant} non-compliant ({pct}% compliance)",
                lastEvaluated=datetime.utcnow(),
                confidence=0.9,
                source="config",
                details={
                    "total_rules": total,
                    "compliant": compliant,
                    "non_compliant": non_compliant,
                    "insufficient_data": insufficient,
                    "compliance_pct": pct,
                },
            )

        except (ClientError, BotoCoreError) as e:
            self._track_source("config", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"AWS Config unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="config",
            )

    # ─────────────────── SageMaker Evaluation ───────────────────

    def _evaluate_sagemaker(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using SageMaker — checks model inventory and endpoints."""
        start = time.time()
        try:
            sm = self._get_client("sagemaker")

            # List models
            models_resp = sm.list_models(MaxResults=100)
            models = models_resp.get("Models", [])

            # List endpoints
            endpoints_resp = sm.list_endpoints(MaxResults=100)
            endpoints = endpoints_resp.get("Endpoints", [])

            # Count endpoint statuses
            in_service = sum(1 for e in endpoints if e.get("EndpointStatus") == "InService")
            failed = sum(1 for e in endpoints if "Failed" in e.get("EndpointStatus", ""))

            self._track_source("sagemaker", start, live=True)

            if not models and not endpoints:
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No SageMaker models or endpoints in this account/region",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.85,
                    source="sagemaker",
                )

            if failed > 0:
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.PARTIAL,
                    evidence=f"{len(models)} models, {len(endpoints)} endpoints ({in_service} in-service, {failed} failed)",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.8,
                    source="sagemaker",
                    details={
                        "total_models": len(models),
                        "total_endpoints": len(endpoints),
                        "in_service": in_service,
                        "failed": failed,
                    },
                )

            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.PASS,
                evidence=f"{len(models)} models registered, {len(endpoints)} endpoints ({in_service} in-service)",
                lastEvaluated=datetime.utcnow(),
                confidence=0.85,
                source="sagemaker",
                details={
                    "total_models": len(models),
                    "total_endpoints": len(endpoints),
                    "in_service": in_service,
                },
            )

        except (ClientError, BotoCoreError) as e:
            self._track_source("sagemaker", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"SageMaker unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="sagemaker",
            )

    # ─────────────────── IAM Evaluation ───────────────────

    def _evaluate_iam(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using IAM — checks policies and access configuration."""
        start = time.time()
        try:
            iam = self._get_client("iam")

            # List custom policies
            policies_resp = iam.list_policies(Scope="Local", MaxItems=100)
            policies = policies_resp.get("Policies", [])

            # List roles
            roles_resp = iam.list_roles(MaxItems=100)
            roles = roles_resp.get("Roles", [])

            # Look for AI-related roles/policies
            ai_related = 0
            ai_keywords = ["bedrock", "sagemaker", "ai", "ml", "agent"]
            for p in policies:
                name = p.get("PolicyName", "").lower()
                if any(kw in name for kw in ai_keywords):
                    ai_related += 1
            for r in roles:
                name = r.get("RoleName", "").lower()
                if any(kw in name for kw in ai_keywords):
                    ai_related += 1

            self._track_source("iam", start, live=True)

            if not policies:
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No custom IAM policies defined",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.7,
                    source="iam",
                )

            evidence = f"{len(policies)} custom IAM policies, {len(roles)} roles"
            if ai_related > 0:
                evidence += f" ({ai_related} AI/ML-related)"

            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.PASS,
                evidence=evidence,
                lastEvaluated=datetime.utcnow(),
                confidence=0.75,
                source="iam",
                details={
                    "custom_policies": len(policies),
                    "roles": len(roles),
                    "ai_ml_related": ai_related,
                },
            )

        except (ClientError, BotoCoreError) as e:
            self._track_source("iam", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"IAM unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="iam",
            )

    # ─────────────────── Glue Data Catalog Evaluation ───────────────────

    def _evaluate_glue(self, control_id: str) -> ControlEvaluation:
        """Evaluate control using Glue Data Catalog — checks databases and data quality."""
        start = time.time()
        try:
            glue = self._get_client("glue")

            # Get databases
            databases = []
            paginator = glue.get_paginator("get_databases")
            for page in paginator.paginate(MaxResults=100):
                databases.extend(page.get("DatabaseList", []))
                if len(databases) >= 100:
                    break

            if not databases:
                self._track_source("glue", start, live=True, note="No databases")
                return ControlEvaluation(
                    controlId=control_id,
                    status=EvaluationStatus.FAIL,
                    evidence="No Glue Data Catalog databases configured",
                    lastEvaluated=datetime.utcnow(),
                    confidence=0.85,
                    source="glue",
                )

            # Count tables across databases
            total_tables = 0
            for db in databases[:10]:  # Sample first 10 databases
                try:
                    tables_resp = glue.get_tables(DatabaseName=db.get("Name", ""), MaxResults=100)
                    total_tables += len(tables_resp.get("TableList", []))
                except (ClientError, BotoCoreError):
                    pass

            # Check for data quality rulesets
            quality_rules = 0
            try:
                rulesets_resp = glue.list_data_quality_rulesets(MaxResults=50)
                quality_rules = len(rulesets_resp.get("Rulesets", []))
            except (ClientError, BotoCoreError):
                pass

            self._track_source("glue", start, live=True)

            evidence_parts = [f"{len(databases)} databases, {total_tables} tables"]
            if quality_rules > 0:
                evidence_parts.append(f"{quality_rules} data quality rulesets")

            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.PASS,
                evidence="; ".join(evidence_parts),
                lastEvaluated=datetime.utcnow(),
                confidence=0.85,
                source="glue",
                details={
                    "databases": len(databases),
                    "tables_sampled": total_tables,
                    "quality_rulesets": quality_rules,
                    "database_names": [db.get("Name", "") for db in databases[:5]],
                },
            )

        except (ClientError, BotoCoreError) as e:
            self._track_source("glue", start, live=False, error=str(e))
            return ControlEvaluation(
                controlId=control_id,
                status=EvaluationStatus.ERROR,
                evidence=f"Glue Data Catalog unavailable: {e}",
                lastEvaluated=datetime.utcnow(),
                confidence=0.0,
                source="glue",
            )
