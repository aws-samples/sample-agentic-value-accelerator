"""Govern live signal — real Bedrock guardrail check → audit log.

This is the Govern module's first *live* signal end-to-end: it runs an actual
Amazon Bedrock guardrail evaluation (bedrock-runtime ApplyGuardrail) against a
guardrail template's real guardrail_id, and — when the guardrail intervenes —
writes a real audit event into the append-only govern audit log.

That closes the loop on real infrastructure: a real AWS safety signal produces a
real, persisted, examiner-facing audit record with decision-context ("why").

No mock fallback for the AWS call itself: the point is that it is genuinely live.
If Bedrock/credentials/guardrail are unavailable, the call raises and the route
surfaces the error honestly rather than fabricating a result.
"""

from __future__ import annotations

import logging
from typing import Optional

import boto3

from models.govern_audit import AuditCategory, AuditEventCreate, AuditSeverity
from services.govern_audit_service import GovernAuditService
from services.guardrail_service import GuardrailService

logger = logging.getLogger(__name__)


class GuardrailNotReadyError(Exception):
    """Raised when the template has no published Bedrock guardrail to check against."""


class GovernGuardrailCheckService:
    """Runs a real Bedrock guardrail check and records the outcome to the audit log."""

    def __init__(
        self,
        audit_service: GovernAuditService,
        guardrail_service: GuardrailService,
        region: str = "us-east-1",
    ):
        self.region = region
        self.audit = audit_service
        self.guardrails = guardrail_service
        self.runtime = boto3.client("bedrock-runtime", region_name=region)

    def check(
        self,
        template_id: str,
        text: str,
        source: str = "OUTPUT",
        agent: Optional[str] = None,
        actor: str = "system",
    ) -> dict:
        """Apply the template's Bedrock guardrail to `text`; audit any intervention.

        Returns the raw guardrail assessment plus the audit event id (if one was
        written). Raises GuardrailNotReadyError if the template isn't published.
        """
        template = self.guardrails.get_template(template_id)
        if not template or not template.guardrail_id:
            raise GuardrailNotReadyError(
                f"Guardrail template '{template_id}' has no published Bedrock guardrail_id"
            )

        version = template.guardrail_version or "DRAFT"
        resp = self.runtime.apply_guardrail(
            guardrailIdentifier=template.guardrail_id,
            guardrailVersion=version,
            source=source,  # "INPUT" | "OUTPUT"
            content=[{"text": {"text": text}}],
        )

        action = resp.get("action", "NONE")  # GUARDRAIL_INTERVENED | NONE
        intervened = action == "GUARDRAIL_INTERVENED"
        audit_event_id: Optional[str] = None

        if intervened:
            reasons = self._summarize_assessments(resp.get("assessments", []))
            event = self.audit.append(
                AuditEventCreate(
                    category=AuditCategory.GUARDRAIL,
                    severity=self._severity_for(reasons),
                    actor=actor,
                    agent=agent,
                    summary=f"Guardrail intervened on {source.lower()} for '{template.name}'",
                    action="block",
                    evidence=f"guardrail:{template.guardrail_id} v{version}",
                    decision_context=(
                        f"Bedrock ApplyGuardrail returned GUARDRAIL_INTERVENED on a "
                        f"{source.lower()} check. Triggered policies: {reasons or 'unspecified'}. "
                        f"This is a live Bedrock safety signal recorded for accountability."
                    ),
                ),
                created_by=actor,
            )
            audit_event_id = event.id

        return {
            "action": action,
            "intervened": intervened,
            "assessments": resp.get("assessments", []),
            "outputs": resp.get("outputs", []),
            "guardrail_id": template.guardrail_id,
            "guardrail_version": version,
            "audit_event_id": audit_event_id,
        }

    # --- helpers -----------------------------------------------------------

    def _summarize_assessments(self, assessments: list) -> str:
        """Flatten Bedrock's assessment blocks into a short reason string."""
        reasons: list[str] = []
        for a in assessments:
            for policy_key, label in (
                ("topicPolicy", "denied-topic"),
                ("contentPolicy", "content-filter"),
                ("wordPolicy", "word-filter"),
                ("sensitiveInformationPolicy", "sensitive-info"),
                ("contextualGroundingPolicy", "grounding"),
            ):
                if policy_key in a:
                    reasons.append(label)
        return ", ".join(sorted(set(reasons)))

    def _severity_for(self, reasons: str) -> AuditSeverity:
        # Sensitive-info / grounding failures are the highest-signal in FSI.
        if "sensitive-info" in reasons or "grounding" in reasons:
            return AuditSeverity.HIGH
        if reasons:
            return AuditSeverity.MEDIUM
        return AuditSeverity.LOW
