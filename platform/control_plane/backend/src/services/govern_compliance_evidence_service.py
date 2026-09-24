"""Govern Compliance Evidence Service — collect and manage compliance evidence.

Maps AVA Govern controls to compliance framework requirements and collects
evidence proving compliance. Supports SOC 2, NIST AI RMF, ISO 42001, FFIEC,
PCI DSS, and GDPR AI frameworks.

Evidence collection:
- Kill-switch: Current status + last test timestamp
- Audit artifacts: Sample artifacts from last 30 days
- Validation panels: Panel results with verdicts
- Policy configs: Current policy configurations
- Incident metrics: Incident counts + resolution metrics
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from models.govern_compliance_evidence import (
    AvaControl,
    AVA_CONTROL_DISPLAY_NAMES,
    ComplianceFramework,
    ComplianceReport,
    ControlCoverage,
    ControlMapping,
    ControlMappingsResponse,
    EvidenceExport,
    EvidenceItem,
    EvidenceResponse,
    EvidenceStatus,
    EvidenceType,
    FRAMEWORK_DISPLAY_NAMES,
    FrameworkCoverageResponse,
    FrameworkListResponse,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Control Mappings Database
# ─────────────────────────────────────────────────────────────────────────────

# SOC 2 Control Mappings
SOC2_MAPPINGS: List[ControlMapping] = [
    ControlMapping(
        framework=ComplianceFramework.SOC2,
        control_id="CC6.1",
        control_name="Logical Access Controls",
        description="The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events.",
        ava_controls=[AvaControl.TOOL_TIERS, AvaControl.PATH_JAILING, AvaControl.RBAC],
        evidence_types=[EvidenceType.TOOL_TIER_CONFIG, EvidenceType.PATH_JAIL_CONFIG, EvidenceType.ACCESS_LOG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.SOC2,
        control_id="CC6.2",
        control_name="User Registration and Authorization",
        description="Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.",
        ava_controls=[AvaControl.RBAC, AvaControl.APPROVAL_WORKFLOWS],
        evidence_types=[EvidenceType.ACCESS_LOG, EvidenceType.APPROVAL_WORKFLOW],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.SOC2,
        control_id="CC6.6",
        control_name="System Operations",
        description="The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software.",
        ava_controls=[AvaControl.KILLSWITCH, AvaControl.AUDIT_ARTIFACTS, AvaControl.HARNESS_POLICIES],
        evidence_types=[EvidenceType.KILLSWITCH_STATUS, EvidenceType.AUDIT_ARTIFACT, EvidenceType.POLICY_CONFIG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.SOC2,
        control_id="CC6.7",
        control_name="Restriction of Physical Access",
        description="The entity restricts physical access to facilities and protected information assets.",
        ava_controls=[AvaControl.PATH_JAILING],
        evidence_types=[EvidenceType.PATH_JAIL_CONFIG],
        priority="high",
        notes="AVA implements logical path restrictions; physical access is AWS responsibility.",
    ),
    ControlMapping(
        framework=ComplianceFramework.SOC2,
        control_id="CC7.2",
        control_name="System Monitoring",
        description="The entity monitors system components and the operation of those components for anomalies.",
        ava_controls=[AvaControl.CANDIDATE_INCIDENTS, AvaControl.CLOUDTRAIL_INTEGRATION, AvaControl.DRIFT_DETECTION],
        evidence_types=[EvidenceType.INCIDENT_METRICS, EvidenceType.CLOUDTRAIL_EVENTS, EvidenceType.DRIFT_DETECTION],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.SOC2,
        control_id="CC7.3",
        control_name="Detection and Response",
        description="The entity evaluates security events to determine whether they could or have resulted in a failure to meet objectives.",
        ava_controls=[AvaControl.CANDIDATE_INCIDENTS, AvaControl.VALIDATION_PANELS],
        evidence_types=[EvidenceType.INCIDENT_METRICS, EvidenceType.VALIDATION_PANEL],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.SOC2,
        control_id="CC8.1",
        control_name="Change Management",
        description="The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes.",
        ava_controls=[AvaControl.APPROVAL_WORKFLOWS, AvaControl.AUDIT_ARTIFACTS, AvaControl.VALIDATION_PANELS],
        evidence_types=[EvidenceType.APPROVAL_WORKFLOW, EvidenceType.AUDIT_ARTIFACT, EvidenceType.VALIDATION_PANEL],
        priority="high",
    ),
]

# NIST AI RMF Control Mappings
NIST_AI_RMF_MAPPINGS: List[ControlMapping] = [
    ControlMapping(
        framework=ComplianceFramework.NIST_AI_RMF,
        control_id="GOVERN 1.1",
        control_name="AI Policies and Procedures",
        description="Policies, processes, and procedures are in place, transparent, and implemented effectively.",
        ava_controls=[AvaControl.HARNESS_POLICIES, AvaControl.TOOL_TIERS],
        evidence_types=[EvidenceType.POLICY_CONFIG, EvidenceType.TOOL_TIER_CONFIG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.NIST_AI_RMF,
        control_id="GOVERN 1.5",
        control_name="Risk Assessment Processes",
        description="Ongoing monitoring and periodic review of the risk management process and its outcomes.",
        ava_controls=[AvaControl.POSTURE_SCORING, AvaControl.DRIFT_DETECTION],
        evidence_types=[EvidenceType.POSTURE_SCORE, EvidenceType.DRIFT_DETECTION],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.NIST_AI_RMF,
        control_id="MAP 3.1",
        control_name="AI Risk Assessment",
        description="Potential risks and potential impacts or harms of AI systems are assessed.",
        ava_controls=[AvaControl.VALIDATION_PANELS, AvaControl.ADVERSARIAL_REVIEW],
        evidence_types=[EvidenceType.VALIDATION_PANEL],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.NIST_AI_RMF,
        control_id="MEASURE 2.1",
        control_name="System Evaluation",
        description="Test sets, metrics, and methodologies are used for evaluating AI system performance.",
        ava_controls=[AvaControl.AUDIT_ARTIFACTS, AvaControl.POSTURE_SCORING],
        evidence_types=[EvidenceType.AUDIT_ARTIFACT, EvidenceType.POSTURE_SCORE],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.NIST_AI_RMF,
        control_id="MEASURE 4.1",
        control_name="Regular Monitoring",
        description="Measurement approaches for identifying AI risks are applied regularly and reviewed.",
        ava_controls=[AvaControl.CANDIDATE_INCIDENTS, AvaControl.DRIFT_DETECTION],
        evidence_types=[EvidenceType.INCIDENT_METRICS, EvidenceType.DRIFT_DETECTION],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.NIST_AI_RMF,
        control_id="MANAGE 2.1",
        control_name="Human Oversight",
        description="Human oversight is meaningful and effective in mitigating AI system risks.",
        ava_controls=[AvaControl.KILLSWITCH, AvaControl.APPROVAL_WORKFLOWS],
        evidence_types=[EvidenceType.KILLSWITCH_STATUS, EvidenceType.APPROVAL_WORKFLOW],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.NIST_AI_RMF,
        control_id="MANAGE 4.1",
        control_name="Incident Response",
        description="Incident response procedures are in place for AI system failures or harmful outcomes.",
        ava_controls=[AvaControl.KILLSWITCH, AvaControl.CANDIDATE_INCIDENTS],
        evidence_types=[EvidenceType.KILLSWITCH_STATUS, EvidenceType.INCIDENT_METRICS],
        priority="critical",
    ),
]

# ISO 42001 Control Mappings
ISO_42001_MAPPINGS: List[ControlMapping] = [
    ControlMapping(
        framework=ComplianceFramework.ISO_42001,
        control_id="6.1.2",
        control_name="Risk Treatment",
        description="The organization shall plan actions to address AI-related risks and opportunities.",
        ava_controls=[AvaControl.VALIDATION_PANELS, AvaControl.HARNESS_POLICIES],
        evidence_types=[EvidenceType.VALIDATION_PANEL, EvidenceType.POLICY_CONFIG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.ISO_42001,
        control_id="8.2",
        control_name="AI System Development",
        description="The organization shall establish processes for AI system development.",
        ava_controls=[AvaControl.AUDIT_ARTIFACTS, AvaControl.APPROVAL_WORKFLOWS],
        evidence_types=[EvidenceType.AUDIT_ARTIFACT, EvidenceType.APPROVAL_WORKFLOW],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.ISO_42001,
        control_id="9.1",
        control_name="Monitoring and Measurement",
        description="The organization shall determine what needs to be monitored and measured.",
        ava_controls=[AvaControl.DRIFT_DETECTION, AvaControl.CANDIDATE_INCIDENTS, AvaControl.POSTURE_SCORING],
        evidence_types=[EvidenceType.DRIFT_DETECTION, EvidenceType.INCIDENT_METRICS, EvidenceType.POSTURE_SCORE],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.ISO_42001,
        control_id="9.2",
        control_name="Internal Audit",
        description="The organization shall conduct internal audits at planned intervals.",
        ava_controls=[AvaControl.AUDIT_ARTIFACTS, AvaControl.VALIDATION_PANELS],
        evidence_types=[EvidenceType.AUDIT_ARTIFACT, EvidenceType.VALIDATION_PANEL],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.ISO_42001,
        control_id="10.1",
        control_name="Nonconformity and Corrective Action",
        description="The organization shall react to nonconformities and take action to control and correct them.",
        ava_controls=[AvaControl.KILLSWITCH, AvaControl.CANDIDATE_INCIDENTS],
        evidence_types=[EvidenceType.KILLSWITCH_STATUS, EvidenceType.INCIDENT_METRICS],
        priority="critical",
    ),
]

# FFIEC (FSI) Control Mappings
FFIEC_MAPPINGS: List[ControlMapping] = [
    ControlMapping(
        framework=ComplianceFramework.FFIEC,
        control_id="MRM.1",
        control_name="Model Risk Management Framework",
        description="Banks should have a strong model risk management framework with effective challenge.",
        ava_controls=[AvaControl.VALIDATION_PANELS, AvaControl.AUDIT_ARTIFACTS],
        evidence_types=[EvidenceType.VALIDATION_PANEL, EvidenceType.AUDIT_ARTIFACT],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.FFIEC,
        control_id="MRM.2",
        control_name="Model Validation",
        description="Model validation should be performed by qualified independent parties.",
        ava_controls=[AvaControl.VALIDATION_PANELS, AvaControl.ADVERSARIAL_REVIEW],
        evidence_types=[EvidenceType.VALIDATION_PANEL],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.FFIEC,
        control_id="MRM.3",
        control_name="Model Inventory",
        description="Banks should maintain a comprehensive model inventory.",
        ava_controls=[AvaControl.HARNESS_DETECTION, AvaControl.AUDIT_ARTIFACTS],
        evidence_types=[EvidenceType.AUDIT_ARTIFACT],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.FFIEC,
        control_id="TPR.1",
        control_name="Third-Party Risk Assessment",
        description="Assessment of third-party service provider risk management capabilities.",
        ava_controls=[AvaControl.HARNESS_DETECTION, AvaControl.HARNESS_POLICIES],
        evidence_types=[EvidenceType.POLICY_CONFIG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.FFIEC,
        control_id="TPR.2",
        control_name="Third-Party Monitoring",
        description="Ongoing monitoring of third-party service provider performance and risks.",
        ava_controls=[AvaControl.DRIFT_DETECTION, AvaControl.CANDIDATE_INCIDENTS],
        evidence_types=[EvidenceType.DRIFT_DETECTION, EvidenceType.INCIDENT_METRICS],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.FFIEC,
        control_id="TPR.3",
        control_name="Third-Party Controls",
        description="Appropriate controls over third-party access to bank systems and data.",
        ava_controls=[AvaControl.TOOL_TIERS, AvaControl.PATH_JAILING, AvaControl.RBAC],
        evidence_types=[EvidenceType.TOOL_TIER_CONFIG, EvidenceType.PATH_JAIL_CONFIG, EvidenceType.ACCESS_LOG],
        priority="critical",
    ),
]

# PCI DSS Control Mappings
PCI_DSS_MAPPINGS: List[ControlMapping] = [
    ControlMapping(
        framework=ComplianceFramework.PCI_DSS,
        control_id="7.1",
        control_name="Restrict Access",
        description="Access to system components and cardholder data is limited to only those individuals whose job requires such access.",
        ava_controls=[AvaControl.RBAC, AvaControl.TOOL_TIERS],
        evidence_types=[EvidenceType.ACCESS_LOG, EvidenceType.TOOL_TIER_CONFIG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.PCI_DSS,
        control_id="8.3",
        control_name="Strong Authentication",
        description="Strong authentication for users and administrators is established and managed.",
        ava_controls=[AvaControl.RBAC],
        evidence_types=[EvidenceType.ACCESS_LOG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.PCI_DSS,
        control_id="10.1",
        control_name="Audit Trails",
        description="Implement audit trails to link all access to system components to each individual user.",
        ava_controls=[AvaControl.AUDIT_ARTIFACTS, AvaControl.CLOUDTRAIL_INTEGRATION],
        evidence_types=[EvidenceType.AUDIT_ARTIFACT, EvidenceType.CLOUDTRAIL_EVENTS],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.PCI_DSS,
        control_id="10.6",
        control_name="Review Audit Logs",
        description="Review logs and security events for all system components to identify anomalies.",
        ava_controls=[AvaControl.CANDIDATE_INCIDENTS, AvaControl.AUDIT_ARTIFACTS],
        evidence_types=[EvidenceType.INCIDENT_METRICS, EvidenceType.AUDIT_ARTIFACT],
        priority="high",
    ),
]

# GDPR AI Control Mappings
GDPR_AI_MAPPINGS: List[ControlMapping] = [
    ControlMapping(
        framework=ComplianceFramework.GDPR_AI,
        control_id="GDPR.22",
        control_name="Automated Decision-Making",
        description="The data subject shall have the right not to be subject to a decision based solely on automated processing.",
        ava_controls=[AvaControl.APPROVAL_WORKFLOWS, AvaControl.KILLSWITCH],
        evidence_types=[EvidenceType.APPROVAL_WORKFLOW, EvidenceType.KILLSWITCH_STATUS],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.GDPR_AI,
        control_id="GDPR.25",
        control_name="Data Protection by Design",
        description="Implement appropriate technical and organizational measures for data protection by design.",
        ava_controls=[AvaControl.PATH_JAILING, AvaControl.HARNESS_POLICIES],
        evidence_types=[EvidenceType.PATH_JAIL_CONFIG, EvidenceType.POLICY_CONFIG],
        priority="critical",
    ),
    ControlMapping(
        framework=ComplianceFramework.GDPR_AI,
        control_id="GDPR.30",
        control_name="Records of Processing",
        description="Maintain a record of processing activities under its responsibility.",
        ava_controls=[AvaControl.AUDIT_ARTIFACTS, AvaControl.CLOUDTRAIL_INTEGRATION],
        evidence_types=[EvidenceType.AUDIT_ARTIFACT, EvidenceType.CLOUDTRAIL_EVENTS],
        priority="high",
    ),
    ControlMapping(
        framework=ComplianceFramework.GDPR_AI,
        control_id="GDPR.32",
        control_name="Security of Processing",
        description="Implement appropriate technical and organizational measures to ensure security.",
        ava_controls=[AvaControl.TOOL_TIERS, AvaControl.PATH_JAILING, AvaControl.RBAC],
        evidence_types=[EvidenceType.TOOL_TIER_CONFIG, EvidenceType.PATH_JAIL_CONFIG, EvidenceType.ACCESS_LOG],
        priority="critical",
    ),
]

# Combined mappings by framework
FRAMEWORK_MAPPINGS: Dict[ComplianceFramework, List[ControlMapping]] = {
    ComplianceFramework.SOC2: SOC2_MAPPINGS,
    ComplianceFramework.NIST_AI_RMF: NIST_AI_RMF_MAPPINGS,
    ComplianceFramework.ISO_42001: ISO_42001_MAPPINGS,
    ComplianceFramework.FFIEC: FFIEC_MAPPINGS,
    ComplianceFramework.PCI_DSS: PCI_DSS_MAPPINGS,
    ComplianceFramework.GDPR_AI: GDPR_AI_MAPPINGS,
}


class GovernComplianceEvidenceService:
    """Service for managing compliance evidence chain."""

    # In-memory evidence storage (would be DynamoDB in production)
    _evidence_store: Dict[str, List[EvidenceItem]] = {}

    def __init__(self, region: str = "us-east-1"):
        self.region = region

    # ─────────────────────────────────────────────────────────────────────────
    # Framework & Mapping Queries
    # ─────────────────────────────────────────────────────────────────────────

    def list_frameworks(self) -> FrameworkListResponse:
        """List all supported compliance frameworks."""
        frameworks = []
        for fw in ComplianceFramework:
            mappings = FRAMEWORK_MAPPINGS.get(fw, [])
            frameworks.append({
                "id": fw.value,
                "name": FRAMEWORK_DISPLAY_NAMES.get(fw, fw.value),
                "control_count": len(mappings),
                "description": self._get_framework_description(fw),
            })
        return FrameworkListResponse(frameworks=frameworks, total=len(frameworks))

    def _get_framework_description(self, framework: ComplianceFramework) -> str:
        """Get description for a framework."""
        descriptions = {
            ComplianceFramework.SOC2: "Service Organization Control 2 - Trust Services Criteria for security, availability, processing integrity, confidentiality, and privacy.",
            ComplianceFramework.NIST_AI_RMF: "NIST AI Risk Management Framework - Guidance for managing AI system risks throughout the AI lifecycle.",
            ComplianceFramework.ISO_42001: "ISO/IEC 42001 - International standard for AI management systems.",
            ComplianceFramework.FFIEC: "FFIEC Model Risk Management - Federal Financial Institutions Examination Council guidance for model risk.",
            ComplianceFramework.PCI_DSS: "Payment Card Industry Data Security Standard - Security standards for organizations handling cardholder data.",
            ComplianceFramework.GDPR_AI: "GDPR AI Governance - General Data Protection Regulation requirements for AI systems processing personal data.",
        }
        return descriptions.get(framework, "")

    def get_control_mappings(self, framework: ComplianceFramework) -> ControlMappingsResponse:
        """Get all control mappings for a framework."""
        mappings = FRAMEWORK_MAPPINGS.get(framework, [])
        return ControlMappingsResponse(
            framework=framework,
            framework_name=FRAMEWORK_DISPLAY_NAMES.get(framework, framework.value),
            mappings=mappings,
            total=len(mappings),
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Coverage Calculation
    # ─────────────────────────────────────────────────────────────────────────

    def get_framework_coverage(self, framework: ComplianceFramework) -> FrameworkCoverageResponse:
        """Calculate coverage percentage for a framework."""
        mappings = FRAMEWORK_MAPPINGS.get(framework, [])
        if not mappings:
            return FrameworkCoverageResponse(
                framework=framework,
                framework_name=FRAMEWORK_DISPLAY_NAMES.get(framework, framework.value),
                total_controls=0,
                covered_controls=0,
                pending_controls=0,
                gap_controls=0,
                coverage_percentage=0.0,
            )

        covered = 0
        pending = 0
        gaps = 0
        last_updated = None

        for mapping in mappings:
            control_key = f"{framework.value}#{mapping.control_id}"
            evidence_items = self._evidence_store.get(control_key, [])

            if evidence_items:
                # Check if any evidence is valid (not expired) AND measured. Illustrative
                # items are worked examples, so a control backed only by those is not
                # covered - it is awaiting real collection, which is what `pending` means.
                # Counting them as covered inflated coverage_percentage for a figure an
                # auditor reads as evidenced control coverage.
                valid_evidence = [
                    e for e in evidence_items
                    if not e.is_expired and e.provenance == "measured"
                ]
                has_illustrative_only = (
                    not valid_evidence
                    and any(not e.is_expired for e in evidence_items)
                )
                if valid_evidence:
                    covered += 1
                    # Track most recent evidence
                    for ev in valid_evidence:
                        if last_updated is None or ev.collected_at > last_updated:
                            last_updated = ev.collected_at
                elif has_illustrative_only:
                    pending += 1  # Illustrative evidence only - real collection pending
                else:
                    pending += 1  # Has evidence but expired
            elif mapping.ava_controls:
                # Has AVA controls but no evidence collected yet
                pending += 1
            else:
                gaps += 1

        total = len(mappings)
        coverage_pct = (covered / total * 100) if total > 0 else 0.0

        return FrameworkCoverageResponse(
            framework=framework,
            framework_name=FRAMEWORK_DISPLAY_NAMES.get(framework, framework.value),
            total_controls=total,
            covered_controls=covered,
            pending_controls=pending,
            gap_controls=gaps,
            coverage_percentage=round(coverage_pct, 1),
            last_updated=last_updated,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Evidence Collection
    # ─────────────────────────────────────────────────────────────────────────

    def collect_evidence(
        self, framework: ComplianceFramework, control_id: str
    ) -> EvidenceResponse:
        """Collect evidence for a specific control."""
        control_key = f"{framework.value}#{control_id}"

        # Find the mapping
        mappings = FRAMEWORK_MAPPINGS.get(framework, [])
        mapping = next((m for m in mappings if m.control_id == control_id), None)

        if not mapping:
            return EvidenceResponse(
                control_mapping_id=control_key,
                evidence_items=[],
                status=EvidenceStatus.GAP,
                total=0,
            )

        # Collect evidence based on evidence types
        collected_items: List[EvidenceItem] = []

        for evidence_type in mapping.evidence_types:
            evidence = self._collect_evidence_by_type(evidence_type, mapping)
            if evidence:
                collected_items.append(evidence)

        # Store evidence
        self._evidence_store[control_key] = collected_items

        # Determine status.
        #
        # A control counts as COLLECTED only when at least one of its evidence items was
        # actually measured. This used to be `if collected_items: COLLECTED`, which reported
        # every control as evidenced the moment any item existed - and 11 of the 12 collectors
        # return hardcoded worked examples, so nearly every SOC 2 and NIST AI RMF control in
        # the Compliance Evidence Chain read "collected" without anything being gathered.
        if collected_items:
            measured = [e for e in collected_items if e.provenance == "measured"]
            status = EvidenceStatus.COLLECTED if measured else EvidenceStatus.ILLUSTRATIVE
        elif mapping.ava_controls:
            status = EvidenceStatus.PENDING
        else:
            status = EvidenceStatus.GAP

        return EvidenceResponse(
            control_mapping_id=control_key,
            evidence_items=collected_items,
            status=status,
            total=len(collected_items),
        )

    def _collect_evidence_by_type(
        self, evidence_type: EvidenceType, mapping: ControlMapping
    ) -> Optional[EvidenceItem]:
        """Collect evidence based on type."""
        control_key = f"{mapping.framework.value}#{mapping.control_id}"

        if evidence_type == EvidenceType.KILLSWITCH_STATUS:
            return self._collect_killswitch_evidence(control_key)
        elif evidence_type == EvidenceType.AUDIT_ARTIFACT:
            return self._collect_audit_artifact_evidence(control_key)
        elif evidence_type == EvidenceType.VALIDATION_PANEL:
            return self._collect_validation_panel_evidence(control_key)
        elif evidence_type == EvidenceType.POLICY_CONFIG:
            return self._collect_policy_config_evidence(control_key)
        elif evidence_type == EvidenceType.INCIDENT_METRICS:
            return self._collect_incident_metrics_evidence(control_key)
        elif evidence_type == EvidenceType.TOOL_TIER_CONFIG:
            return self._collect_tool_tier_evidence(control_key)
        elif evidence_type == EvidenceType.PATH_JAIL_CONFIG:
            return self._collect_path_jail_evidence(control_key)
        elif evidence_type == EvidenceType.ACCESS_LOG:
            return self._collect_access_log_evidence(control_key)
        elif evidence_type == EvidenceType.DRIFT_DETECTION:
            return self._collect_drift_evidence(control_key)
        elif evidence_type == EvidenceType.POSTURE_SCORE:
            return self._collect_posture_score_evidence(control_key)
        elif evidence_type == EvidenceType.APPROVAL_WORKFLOW:
            return self._collect_approval_workflow_evidence(control_key)
        elif evidence_type == EvidenceType.CLOUDTRAIL_EVENTS:
            return self._collect_cloudtrail_evidence(control_key)

        return None

    def _collect_killswitch_evidence(self, control_key: str) -> EvidenceItem:
        """Collect kill-switch status evidence."""
        from core.harness_killswitch import get_killswitch_status

        try:
            status = get_killswitch_status()
            data = status.to_dict()
            # `test_result: "functional"` used to be set here unconditionally. Reading the
            # kill switch's reported status is not the same as exercising it, and an auditor
            # reading "functional" takes it as the outcome of a test. Only the status is
            # evidence; whether it has been tested is not known here.
            data["status_read_at"] = datetime.utcnow().isoformat()
            data["tested"] = False
        except Exception as e:
            data = {
                "error": str(e),
                "status": "unknown",
                "last_test_timestamp": datetime.utcnow().isoformat(),
            }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.KILLSWITCH_STATUS,
            source="core/harness_killswitch.py",
            data=data,
            validity_period_days=30,
            # The only collector in this service that reads a real source.
            provenance="measured",
            status=EvidenceStatus.COLLECTED,
        )

    def _collect_audit_artifact_evidence(self, control_key: str) -> EvidenceItem:
        """Collect audit artifact evidence (sample from last 30 days)."""
        # In production, this would query the audit artifact store
        data = {
            "artifact_count_30d": 156,
            "by_action_type": {
                "discovery": 42,
                "invocation": 78,
                "tool_use": 28,
                "validation": 8,
            },
            "by_verdict": {
                "allowed": 142,
                "blocked": 10,
                "needs_review": 4,
            },
            "sample_artifacts": [
                {
                    "artifact_id": "haa-sample-001",
                    "harness_type": "claude-code",
                    "action_type": "invocation",
                    "verdict": "allowed",
                    "timestamp": (datetime.utcnow() - timedelta(hours=2)).isoformat(),
                }
            ],
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.AUDIT_ARTIFACT,
            source="models/govern_harness_audit.py",
            data=data,
            validity_period_days=90,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_validation_panel_evidence(self, control_key: str) -> EvidenceItem:
        """Collect validation panel evidence."""
        data = {
            "panel_count_30d": 12,
            "by_verdict": {
                "validated": 9,
                "validation_failed": 1,
                "needs_review": 2,
            },
            "criteria_weights": {
                "root_cause_analysis": 0.43,
                "instance_coverage": 0.25,
                "no_new_vulnerabilities": 0.19,
                "best_practices": 0.14,
            },
            "average_score": 82.5,
            "critical_gates_pass_rate": 0.92,
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.VALIDATION_PANEL,
            source="models/govern_validation_panel.py",
            data=data,
            validity_period_days=90,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_policy_config_evidence(self, control_key: str) -> EvidenceItem:
        """Collect policy configuration evidence."""
        data = {
            "active_policies": 5,
            "policies": [
                {
                    "policy_id": "claude-code-standard",
                    "harness_type": "claude-code",
                    "allowed_tier": "read_write",
                    "require_human_approval": False,
                },
                {
                    "policy_id": "kiro-restricted",
                    "harness_type": "kiro-ide",
                    "allowed_tier": "read_only",
                    "require_human_approval": True,
                },
            ],
            "blocked_paths_default": [
                "**/secrets/**",
                "**/.env",
                "**/credentials/**",
            ],
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.POLICY_CONFIG,
            source="services/govern_harness_policy_service.py",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_incident_metrics_evidence(self, control_key: str) -> EvidenceItem:
        """Collect incident metrics evidence."""
        data = {
            "incident_count_30d": 7,
            "by_severity": {
                "critical": 0,
                "high": 1,
                "medium": 4,
                "low": 2,
            },
            "resolution_metrics": {
                "mean_time_to_detect_hours": 1.2,
                "mean_time_to_resolve_hours": 4.8,
                "resolution_rate": 1.0,
            },
            "source_breakdown": {
                "cloudtrail": 3,
                "drift_detection": 2,
                "manual_report": 2,
            },
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.INCIDENT_METRICS,
            source="candidate_incidents",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_tool_tier_evidence(self, control_key: str) -> EvidenceItem:
        """Collect tool tier configuration evidence."""
        data = {
            "tiers": {
                "read_only": ["Glob", "Grep", "Read", "WebFetch", "ToolSearch"],
                "read_write": ["Glob", "Grep", "Read", "WebFetch", "ToolSearch", "Edit", "Write", "NotebookEdit"],
                "full": ["Glob", "Grep", "Read", "WebFetch", "ToolSearch", "Edit", "Write", "NotebookEdit", "Bash", "Agent", "SendMessage"],
            },
            "tier_assignments": {
                "claude-code": "read_write",
                "kiro-ide": "read_only",
                "codex-cli": "read_only",
            },
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.TOOL_TIER_CONFIG,
            source="models/govern_harness_policy.py",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_path_jail_evidence(self, control_key: str) -> EvidenceItem:
        """Collect path jailing configuration evidence."""
        data = {
            "blocked_patterns": [
                "**/secrets/**",
                "**/.env",
                "**/.env.*",
                "**/credentials/**",
                "**/*.pem",
                "**/*.key",
                "**/id_rsa*",
                "**/.aws/**",
                "**/.ssh/**",
            ],
            "violation_types": [
                "traversal_attack",
                "symlink_escape",
                "absolute_outside",
                "blocked_pattern",
                "not_allowed",
            ],
            "violations_blocked_30d": 23,
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.PATH_JAIL_CONFIG,
            source="core/path_jail.py",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_access_log_evidence(self, control_key: str) -> EvidenceItem:
        """Collect RBAC access log evidence."""
        data = {
            "roles": ["VIEWER", "OPERATOR", "ADMIN"],
            "access_events_30d": 1247,
            "by_role": {
                "VIEWER": 892,
                "OPERATOR": 312,
                "ADMIN": 43,
            },
            "denied_requests_30d": 18,
            "authentication_method": "cognito_jwt",
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.ACCESS_LOG,
            source="core/rbac.py",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_drift_evidence(self, control_key: str) -> EvidenceItem:
        """Collect drift detection evidence."""
        data = {
            "monitoring_enabled": True,
            "check_frequency_hours": 1,
            "drift_events_30d": 5,
            "auto_remediated": 3,
            "manual_review_required": 2,
            "drift_types": ["policy_change", "version_drift", "config_drift"],
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.DRIFT_DETECTION,
            source="drift_detection",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_posture_score_evidence(self, control_key: str) -> EvidenceItem:
        """Collect posture score evidence."""
        data = {
            "overall_score": 78.5,
            "category_scores": {
                "access_control": 85,
                "monitoring": 72,
                "incident_response": 80,
                "policy_enforcement": 77,
            },
            "trend_30d": "+3.2",
            "last_assessment": datetime.utcnow().isoformat(),
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.POSTURE_SCORE,
            source="posture_scoring",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_approval_workflow_evidence(self, control_key: str) -> EvidenceItem:
        """Collect approval workflow evidence."""
        data = {
            "workflows_configured": 3,
            "approvals_processed_30d": 28,
            "approval_rate": 0.89,
            "average_approval_time_hours": 2.4,
            "escalations": 2,
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.APPROVAL_WORKFLOW,
            source="approval_workflows",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    def _collect_cloudtrail_evidence(self, control_key: str) -> EvidenceItem:
        """Collect CloudTrail integration evidence."""
        data = {
            "integration_status": "active",
            "trails_configured": 2,
            "events_processed_30d": 15420,
            "ai_related_events": 892,
            "anomalies_detected": 3,
        }

        return EvidenceItem(
            control_mapping_id=control_key,
            evidence_type=EvidenceType.CLOUDTRAIL_EVENTS,
            source="cloudtrail_integration",
            data=data,
            validity_period_days=30,
            # Hardcoded worked example, not a reading from the named source. Marked so the
            # Compliance Evidence Chain does not report this control as evidenced.
            provenance="illustrative",
            status=EvidenceStatus.ILLUSTRATIVE,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Report Generation
    # ─────────────────────────────────────────────────────────────────────────

    def generate_report(
        self, framework: ComplianceFramework, generated_by: str = "system"
    ) -> ComplianceReport:
        """Generate a full compliance report for a framework."""
        mappings = FRAMEWORK_MAPPINGS.get(framework, [])

        control_coverages: List[ControlCoverage] = []
        evidence_items: List[EvidenceItem] = []
        gaps: List[str] = []

        covered_count = 0
        pending_count = 0
        gap_count = 0

        for mapping in mappings:
            control_key = f"{framework.value}#{mapping.control_id}"

            # Collect evidence if not already collected
            if control_key not in self._evidence_store:
                self.collect_evidence(framework, mapping.control_id)

            items = self._evidence_store.get(control_key, [])
            valid_items = [e for e in items if not e.is_expired]

            # Determine status. Same rule as get_framework_coverage: only measured evidence
            # makes a control covered. This report is the Compliance Evidence Chain's output,
            # so "collected" here is the claim an auditor would rely on.
            measured_items = [e for e in valid_items if e.provenance == "measured"]
            if measured_items:
                status = EvidenceStatus.COLLECTED
                covered_count += 1
            elif valid_items:
                status = EvidenceStatus.ILLUSTRATIVE
                pending_count += 1
            elif mapping.ava_controls:
                status = EvidenceStatus.PENDING
                pending_count += 1
            else:
                status = EvidenceStatus.GAP
                gap_count += 1
                gaps.append(mapping.control_id)

            # Get AVA control display names
            ava_control_names = [
                AVA_CONTROL_DISPLAY_NAMES.get(ctrl, ctrl.value)
                for ctrl in mapping.ava_controls
            ]

            coverage = ControlCoverage(
                control_id=mapping.control_id,
                control_name=mapping.control_name,
                description=mapping.description,
                ava_controls=ava_control_names,
                evidence_status=status,
                evidence_count=len(valid_items),
                last_evidence_at=max((e.collected_at for e in valid_items), default=None) if valid_items else None,
                gap_reason="No AVA controls mapped" if status == EvidenceStatus.GAP else None,
            )
            control_coverages.append(coverage)
            evidence_items.extend(valid_items)

        total = len(mappings)
        coverage_pct = (covered_count / total * 100) if total > 0 else 0.0

        return ComplianceReport(
            framework=framework,
            framework_name=FRAMEWORK_DISPLAY_NAMES.get(framework, framework.value),
            coverage_percentage=round(coverage_pct, 1),
            total_controls=total,
            covered_controls=covered_count,
            pending_controls=pending_count,
            gap_controls=gap_count,
            control_coverages=control_coverages,
            evidence_items=evidence_items,
            gaps=gaps,
            generated_by=generated_by,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Export
    # ─────────────────────────────────────────────────────────────────────────

    def export_evidence(
        self,
        framework: ComplianceFramework,
        export_format: str = "json",
        generated_by: str = "system",
    ) -> EvidenceExport:
        """Generate an auditor-ready export package."""
        report = self.generate_report(framework, generated_by)

        # Count evidence by type
        evidence_summary: Dict[str, int] = {}
        for item in report.evidence_items:
            key = item.evidence_type.value
            evidence_summary[key] = evidence_summary.get(key, 0) + 1

        # Generate attestation statement
        attestation = (
            f"This evidence package was generated on {datetime.utcnow().isoformat()} "
            f"by the AVA Govern Compliance Evidence Chain system. "
            f"It contains {len(report.evidence_items)} evidence items collected from "
            f"AVA Govern controls covering {report.covered_controls} of {report.total_controls} "
            f"controls in the {report.framework_name} framework ({report.coverage_percentage}% coverage). "
            f"Evidence validity period: {report.validity_days} days."
        )

        return EvidenceExport(
            framework=framework,
            framework_name=report.framework_name,
            export_format=export_format,
            generated_by=generated_by,
            reporting_period_start=datetime.utcnow() - timedelta(days=30),
            reporting_period_end=datetime.utcnow(),
            report=report,
            evidence_summary=evidence_summary,
            attestation_statement=attestation,
        )
