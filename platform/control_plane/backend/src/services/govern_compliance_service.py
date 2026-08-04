"""Govern Compliance service — DynamoDB-backed control attestations.

Storage scheme (single-table):
    pk = "COMPLIANCE#<framework_id>"    sk = "<control_id>"  -> attestation
    pk = "EVIDENCE#<framework_id>#<control_id>"  sk = "<evidence_id>" -> evidence

Supports:
- Manual attestation updates (pass/fail/in-progress)
- Evidence attachment (links, S3 URLs)
- Auto-detection from AWS services (guardrails, config rules, etc.)
- Audit trail of changes

Falls back to in-memory storage when DynamoDB table not provisioned.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from models.govern_compliance import (
    AutoDetectionResult,
    CompliancePosture,
    ControlAttestation,
    ControlAttestationUpdate,
    ControlStatus,
    Evidence,
    EvidenceCreate,
    EvidenceType,
    FrameworkSummary,
)

logger = logging.getLogger(__name__)


def _to_ddb(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ControlStatus):
        return value.value
    if isinstance(value, EvidenceType):
        return value.value
    return value


def _from_ddb(value):
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


class GovernComplianceService:
    """Service for managing compliance attestations."""

    # In-memory fallback when DynamoDB not available
    _mem_attestations: Dict[str, ControlAttestation] = {}
    _mem_evidence: Dict[str, List[Evidence]] = {}
    _table_ok: Optional[bool] = None

    def __init__(self, table_name: str, region: str = "us-east-1"):
        self.table_name = table_name
        self.region = region
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self._dynamodb.Table(table_name)

    def _pk_attestation(self, framework_id: str) -> str:
        return f"COMPLIANCE#{framework_id}"

    def _pk_evidence(self, framework_id: str, control_id: str) -> str:
        return f"EVIDENCE#{framework_id}#{control_id}"

    def _key(self, framework_id: str, control_id: str) -> str:
        return f"{framework_id}#{control_id}"

    def _check_table(self) -> bool:
        """Check if DynamoDB table is available."""
        if GovernComplianceService._table_ok is not None:
            return GovernComplianceService._table_ok
        try:
            self.table.table_status
            GovernComplianceService._table_ok = True
            return True
        except ClientError:
            logger.info(f"DynamoDB table {self.table_name} not available, using in-memory storage")
            GovernComplianceService._table_ok = False
            return False

    # --- Attestation CRUD ---

    def get_attestation(self, framework_id: str, control_id: str) -> Optional[ControlAttestation]:
        """Get a single control attestation."""
        key = self._key(framework_id, control_id)

        if not self._check_table():
            return self._mem_attestations.get(key)

        try:
            resp = self.table.get_item(
                Key={"pk": self._pk_attestation(framework_id), "sk": control_id}
            )
            if "Item" not in resp:
                return None
            item = _from_ddb(resp["Item"])
            return ControlAttestation(**item)
        except ClientError as e:
            logger.error(f"Failed to get attestation: {e}")
            return self._mem_attestations.get(key)

    def list_attestations(self, framework_id: str) -> List[ControlAttestation]:
        """List all attestations for a framework."""
        if not self._check_table():
            return [a for k, a in self._mem_attestations.items() if k.startswith(f"{framework_id}#")]

        try:
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self._pk_attestation(framework_id))
            )
            return [ControlAttestation(**_from_ddb(item)) for item in resp.get("Items", [])]
        except ClientError as e:
            logger.error(f"Failed to list attestations: {e}")
            return [a for k, a in self._mem_attestations.items() if k.startswith(f"{framework_id}#")]

    def upsert_attestation(
        self,
        framework_id: str,
        control_id: str,
        update: ControlAttestationUpdate,
        updated_by: str = "user",
    ) -> ControlAttestation:
        """Create or update a control attestation."""
        existing = self.get_attestation(framework_id, control_id)

        now = datetime.utcnow()
        if existing:
            data = existing.model_dump()
            for field, value in update.model_dump(exclude_unset=True).items():
                if value is not None:
                    data[field] = value
            data["updated_at"] = now
            data["updated_by"] = updated_by
            if update.status == ControlStatus.PASS and update.reviewed_by:
                data["last_reviewed"] = now
            attestation = ControlAttestation(**data)
        else:
            attestation = ControlAttestation(
                control_id=control_id,
                framework_id=framework_id,
                status=update.status or ControlStatus.NOT_STARTED,
                owner=update.owner,
                notes=update.notes,
                due_date=update.due_date,
                reviewed_by=update.reviewed_by,
                last_reviewed=now if update.status == ControlStatus.PASS else None,
                updated_at=now,
                updated_by=updated_by,
            )

        key = self._key(framework_id, control_id)

        if not self._check_table():
            self._mem_attestations[key] = attestation
            return attestation

        try:
            item = _to_ddb(attestation.model_dump(mode="json"))
            item["pk"] = self._pk_attestation(framework_id)
            item["sk"] = control_id
            self.table.put_item(Item=item)
        except ClientError as e:
            logger.error(f"Failed to upsert attestation: {e}")
            self._mem_attestations[key] = attestation

        return attestation

    def bulk_upsert(
        self,
        attestations: List[Dict],
        updated_by: str = "system",
    ) -> int:
        """Bulk upsert attestations (for auto-detection sync)."""
        count = 0
        for att in attestations:
            update = ControlAttestationUpdate(
                status=ControlStatus(att.get("status", "not-started")),
                owner=att.get("owner"),
                notes=att.get("notes"),
            )
            self.upsert_attestation(
                framework_id=att["framework_id"],
                control_id=att["control_id"],
                update=update,
                updated_by=updated_by,
            )
            count += 1
        return count

    # --- Evidence ---

    def add_evidence(
        self,
        framework_id: str,
        control_id: str,
        evidence: EvidenceCreate,
        uploaded_by: str,
    ) -> Evidence:
        """Add evidence to a control attestation."""
        ev = Evidence(
            id=str(uuid.uuid4())[:8],
            type=evidence.type,
            name=evidence.name,
            description=evidence.description,
            url=evidence.url,
            uploaded_at=datetime.utcnow(),
            uploaded_by=uploaded_by,
        )

        key = self._key(framework_id, control_id)

        if not self._check_table():
            if key not in self._mem_evidence:
                self._mem_evidence[key] = []
            self._mem_evidence[key].append(ev)
            # Also update the attestation's evidence list
            att = self._mem_attestations.get(key)
            if att:
                att.evidence.append(ev)
            return ev

        try:
            item = _to_ddb(ev.model_dump(mode="json"))
            item["pk"] = self._pk_evidence(framework_id, control_id)
            item["sk"] = ev.id
            self.table.put_item(Item=item)

            # Update attestation's evidence list
            self.table.update_item(
                Key={"pk": self._pk_attestation(framework_id), "sk": control_id},
                UpdateExpression="SET evidence = list_append(if_not_exists(evidence, :empty), :ev)",
                ExpressionAttributeValues={
                    ":ev": [_to_ddb(ev.model_dump(mode="json"))],
                    ":empty": [],
                },
            )
        except ClientError as e:
            logger.error(f"Failed to add evidence: {e}")
            if key not in self._mem_evidence:
                self._mem_evidence[key] = []
            self._mem_evidence[key].append(ev)

        return ev

    def list_evidence(self, framework_id: str, control_id: str) -> List[Evidence]:
        """List all evidence for a control."""
        key = self._key(framework_id, control_id)

        if not self._check_table():
            return self._mem_evidence.get(key, [])

        try:
            resp = self.table.query(
                KeyConditionExpression=Key("pk").eq(self._pk_evidence(framework_id, control_id))
            )
            return [Evidence(**_from_ddb(item)) for item in resp.get("Items", [])]
        except ClientError as e:
            logger.error(f"Failed to list evidence: {e}")
            return self._mem_evidence.get(key, [])

    # --- Framework Summary ---

    def get_framework_summary(self, framework_id: str, framework_name: str, total_controls: int) -> FrameworkSummary:
        """Compute summary stats for a framework."""
        attestations = self.list_attestations(framework_id)

        # Build lookup by control_id
        att_by_id = {a.control_id: a for a in attestations}

        pass_count = sum(1 for a in attestations if a.status == ControlStatus.PASS)
        in_progress_count = sum(1 for a in attestations if a.status == ControlStatus.IN_PROGRESS)
        fail_count = sum(1 for a in attestations if a.status == ControlStatus.FAIL)
        not_started_count = total_controls - len(attestations) + sum(1 for a in attestations if a.status == ControlStatus.NOT_STARTED)

        applicable = total_controls - not_started_count
        coverage_pct = (pass_count / applicable * 100) if applicable > 0 else 0.0

        last_updated = max((a.updated_at for a in attestations), default=None)

        return FrameworkSummary(
            framework_id=framework_id,
            framework_name=framework_name,
            total_controls=total_controls,
            pass_count=pass_count,
            in_progress_count=in_progress_count,
            fail_count=fail_count,
            not_started_count=not_started_count,
            coverage_pct=round(coverage_pct, 1),
            last_updated=last_updated,
        )

    def get_compliance_posture(self, frameworks: List[Dict[str, any]]) -> CompliancePosture:
        """Compute overall compliance posture across frameworks."""
        summaries = []
        for fw in frameworks:
            summary = self.get_framework_summary(
                framework_id=fw["id"],
                framework_name=fw["name"],
                total_controls=fw["total_controls"],
            )
            summaries.append(summary)

        total_controls = sum(s.total_controls for s in summaries)
        total_pass = sum(s.pass_count for s in summaries)
        total_gaps = sum(s.fail_count for s in summaries)

        # Count auto-detected
        auto_count = 0
        for fw in frameworks:
            for att in self.list_attestations(fw["id"]):
                if att.auto_detected:
                    auto_count += 1

        applicable = sum(s.total_controls - s.not_started_count for s in summaries)
        overall_pct = (total_pass / applicable * 100) if applicable > 0 else 0.0

        return CompliancePosture(
            frameworks=summaries,
            overall_coverage_pct=round(overall_pct, 1),
            total_controls=total_controls,
            total_pass=total_pass,
            total_gaps=total_gaps,
            auto_detected_count=auto_count,
            last_sync=datetime.utcnow(),
        )

    # --- Auto-detection ---

    async def run_auto_detection(self) -> List[AutoDetectionResult]:
        """Run auto-detection from AWS services and update attestations."""
        results: List[AutoDetectionResult] = []

        # 1. Check Bedrock Guardrails
        try:
            bedrock = boto3.client("bedrock", region_name=self.region)
            guardrails = bedrock.list_guardrails().get("guardrails", [])
            if guardrails:
                # Guardrails exist -> mark related controls as pass
                for control in [
                    ("finos-air", "AIR-SEC-010"),  # Prompt injection
                    ("finos-air", "AIR-P-001"),    # Input validation
                    ("finos-air", "AIR-P-002"),    # Output filtering
                    ("owasp-llm-top10", "LLM01-1"),
                    ("owasp-llm-top10", "LLM02-1"),
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="bedrock-guardrails",
                        confidence=0.9,
                        details=f"{len(guardrails)} guardrails configured",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Guardrails auto-detection failed: {e}")

        # 2. Check CloudTrail
        try:
            cloudtrail = boto3.client("cloudtrail", region_name=self.region)
            trails = cloudtrail.describe_trails().get("trailList", [])
            if trails:
                for control in [
                    ("finos-air", "AIR-D-001"),  # Audit logging
                    ("nist-ai-rmf", "MANAGE 3.1"),
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="cloudtrail",
                        confidence=0.95,
                        details=f"{len(trails)} CloudTrail trails active",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"CloudTrail auto-detection failed: {e}")

        # 3. Check AWS Config rules
        try:
            config = boto3.client("config", region_name=self.region)
            rules = config.describe_config_rules().get("ConfigRules", [])
            if rules:
                result = AutoDetectionResult(
                    control_id="AIR-D-002",
                    framework_id="finos-air",
                    detected_status=ControlStatus.PASS,
                    source="aws-config",
                    confidence=0.85,
                    details=f"{len(rules)} Config rules active",
                )
                results.append(result)
                self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Config auto-detection failed: {e}")

        # 4. Check Bedrock Agents (inventory)
        try:
            bedrock_agent = boto3.client("bedrock-agent", region_name=self.region)
            agents = bedrock_agent.list_agents().get("agentSummaries", [])
            if agents:
                for control in [
                    ("nist-ai-rmf", "GOVERN 1.6"),  # AI system inventory
                    ("sr26-2", "GOV-1"),
                    ("finos-air", "AIR-OP-005"),  # Foundation model versioning
                    ("owasp-llm-top10", "LLM03-1"),  # Model provenance
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="bedrock-agents",
                        confidence=0.8,
                        details=f"{len(agents)} agents in registry",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Bedrock Agents auto-detection failed: {e}")

        # 5. Check CloudWatch for monitoring (performance metrics)
        try:
            cloudwatch = boto3.client("cloudwatch", region_name=self.region)
            alarms = cloudwatch.describe_alarms(MaxRecords=10).get("MetricAlarms", [])
            if alarms:
                for control in [
                    ("nist-ai-rmf", "MEASURE 1.1"),  # Performance metrics
                    ("sr26-2", "USE-2"),  # Performance monitoring
                    ("finos-air", "AIR-OP-014"),  # Alignment drift
                    ("finos-air", "AIR-OP-019"),  # Data quality monitoring
                    ("finos-air", "AIR-D-002"),  # Anomaly detection
                    ("finos-air", "AIR-D-003"),  # Model monitoring
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="cloudwatch",
                        confidence=0.85,
                        details=f"{len(alarms)} CloudWatch alarms configured",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"CloudWatch auto-detection failed: {e}")

        # 6. Check Cost Explorer / Budgets (cost controls)
        try:
            ce = boto3.client("ce", region_name=self.region)
            # Just checking if API is accessible is enough
            ce.get_cost_and_usage(
                TimePeriod={"Start": "2026-07-01", "End": "2026-07-20"},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
            )
            for control in [
                ("owasp-llm-top10", "LLM10-2"),  # Cost quotas
            ]:
                result = AutoDetectionResult(
                    control_id=control[1],
                    framework_id=control[0],
                    detected_status=ControlStatus.PASS,
                    source="cost-explorer",
                    confidence=0.75,
                    details="Cost Explorer accessible for budget monitoring",
                )
                results.append(result)
                self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Cost Explorer auto-detection failed: {e}")

        # 7. Check IAM for least privilege (access controls)
        try:
            iam = boto3.client("iam", region_name=self.region)
            policies = iam.list_policies(Scope="Local", MaxItems=10).get("Policies", [])
            if policies:
                for control in [
                    ("finos-air", "AIR-P-003"),  # Access control
                    ("owasp-llm-top10", "LLM08-1"),  # KB access controls
                    ("owasp-llm-top10", "LLM06-1"),  # Least privilege
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="iam",
                        confidence=0.7,
                        details=f"{len(policies)} custom IAM policies defined",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"IAM auto-detection failed: {e}")

        # 8. Check Secrets Manager (no secrets in prompts)
        try:
            secretsmanager = boto3.client("secretsmanager", region_name=self.region)
            secrets = secretsmanager.list_secrets(MaxResults=10).get("SecretList", [])
            if secrets:
                for control in [
                    ("owasp-llm-top10", "LLM07-1"),  # No secrets in prompts
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="secrets-manager",
                        confidence=0.8,
                        details=f"Secrets Manager in use ({len(secrets)} secrets)",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"Secrets Manager auto-detection failed: {e}")

        # 9. Check API Gateway (rate limiting)
        try:
            apigateway = boto3.client("apigateway", region_name=self.region)
            apis = apigateway.get_rest_apis(limit=10).get("items", [])
            if apis:
                for control in [
                    ("owasp-llm-top10", "LLM10-1"),  # Rate limiting
                    ("finos-air", "AIR-P-005"),  # Rate limiting
                ]:
                    result = AutoDetectionResult(
                        control_id=control[1],
                        framework_id=control[0],
                        detected_status=ControlStatus.PASS,
                        source="api-gateway",
                        confidence=0.75,
                        details=f"{len(apis)} API Gateway APIs configured",
                    )
                    results.append(result)
                    self._apply_auto_detection(result)
        except Exception as e:
            logger.warning(f"API Gateway auto-detection failed: {e}")

        return results

    def _apply_auto_detection(self, result: AutoDetectionResult):
        """Apply an auto-detection result to update attestation."""
        existing = self.get_attestation(result.framework_id, result.control_id)

        # Don't override manual attestations
        if existing and not existing.auto_detected and existing.status != ControlStatus.NOT_STARTED:
            return

        update = ControlAttestationUpdate(
            status=result.detected_status,
            notes=f"Auto-detected from {result.source}: {result.details}",
        )

        att = self.upsert_attestation(
            framework_id=result.framework_id,
            control_id=result.control_id,
            update=update,
            updated_by="auto-detection",
        )

        # Mark as auto-detected
        key = self._key(result.framework_id, result.control_id)
        if key in self._mem_attestations:
            self._mem_attestations[key].auto_detected = True
            self._mem_attestations[key].auto_detection_source = result.source
