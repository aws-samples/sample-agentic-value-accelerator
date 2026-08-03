"""
Agent Contracts — Payments Fraud Scoring & Investigation

Pydantic models defining the input/output schemas for the three agents in this
reference implementation:

    1. Transaction Scorer    — real-time fraud scoring on an incoming payment
    2. Investigation Agent   — NL-powered case investigation over an account/subject
    3. SAR Report Agent      — FinCEN-structured Suspicious Activity Report generation

These contracts are the stable interface between the AgentCore Runtime entrypoint,
the coordinator, the specialist agents, and the React frontend. The wire format is
snake_case JSON; the frontend mirrors these as TypeScript interfaces (see
frontend/types/).

Scoring convention: all risk/fraud scores are floats on a 0.0–1.0 scale, where
higher means more suspicious. This deliberately matches the case-management
reference implementation so the two apps are directly comparable (the difference
is the architecture, not the numbers). Decision thresholds mirror case-management:
score < 0.85 -> approve, 0.85-0.95 -> step-up review, >= 0.95 -> hold and case.

Fraud patterns use a single shared vocabulary (FraudPattern) across both the
Transaction Scorer (as machine reason tags on a transaction) and the Investigation
Agent (as higher-level detected patterns). The transaction-level values mirror
case-management's reason tags verbatim for comparability.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    """Timezone-aware UTC now (datetime.utcnow() is deprecated in 3.12+)."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Shared enums
# ---------------------------------------------------------------------------

class PaymentNetwork(str, Enum):
    """Rail the payment moved over."""
    ACH = "ach"
    WIRE = "wire"
    SWIFT = "swift"
    CARD = "card"
    RTP = "rtp"            # Real-Time Payments / FedNow / instant rails
    INTERNAL = "internal"  # book transfer between accounts at the same institution


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ScoringDecision(str, Enum):
    """Three-tier real-time response (mirrors case-management decision engine)."""
    APPROVE = "approve"                  # execute normally
    STEP_UP_REVIEW = "step_up_review"    # require OTP/3DS, brief hold
    HOLD_AND_CASE = "hold_and_case"      # hold funds, open analyst case


class FraudPattern(str, Enum):
    """
    Shared fraud/AML pattern vocabulary used by both agents:
      - the Transaction Scorer attaches these as machine reason tags on a payment
      - the Investigation Agent reports these as higher-level detected patterns

    The transaction-level values (SMURFING ... RAPID_DEVICE_CHANGE) mirror the
    case-management reference implementation's reason tags verbatim, so scored
    transactions are directly comparable between the two apps. The remaining
    values are investigation-level typologies that emerge from analyzing many
    transactions together.
    """
    # --- transaction-level reason tags (verbatim from case-management) ---
    SMURFING = "SMURFING"                      # structuring below reporting thresholds
    HIGH_VELOCITY = "HIGH_VELOCITY"            # rapid successive transactions
    FAN_IN_TO_DST = "FAN_IN_TO_DST"            # many sources into one destination
    MULE_DESTINATION = "MULE_DESTINATION"      # known/suspected mule account
    LARGE_AMOUNT = "LARGE_AMOUNT"              # anomalously large value
    NEW_BENEFICIARY = "NEW_BENEFICIARY"        # first-time, high-value payee
    GEO_SUDDEN_HOP = "GEO_SUDDEN_HOP"          # impossible-travel location change
    RAPID_DEVICE_CHANGE = "RAPID_DEVICE_CHANGE"

    # --- investigation-level typologies (emergent across many transactions) ---
    MULE_NETWORK = "MULE_NETWORK"              # coordinated fan-in/fan-out mule ring
    ROUND_TRIPPING = "ROUND_TRIPPING"          # funds returning to origin via hops
    LAYERING = "LAYERING"                      # money-laundering placement/layering
    ACCOUNT_TAKEOVER = "ACCOUNT_TAKEOVER"      # ATO-driven activity
    AUTHORIZED_PUSH_PAYMENT = "AUTHORIZED_PUSH_PAYMENT"  # APP / social-engineering scam
    UNKNOWN = "UNKNOWN"


class EscalationRecommendation(str, Enum):
    NO_ACTION = "no_action"
    MONITOR = "monitor"
    ESCALATE_TO_SAR = "escalate_to_sar"


class FilingRecommendation(str, Enum):
    FILE = "file"
    DO_NOT_FILE = "do_not_file"
    NEEDS_HUMAN_REVIEW = "needs_human_review"


# ---------------------------------------------------------------------------
# Shared value objects
# ---------------------------------------------------------------------------

class GeoLocation(BaseModel):
    country: str | None = Field(default=None, description="ISO-3166 alpha-2 country code")
    city: str | None = None
    lat: float | None = None
    lon: float | None = None


class Counterparty(BaseModel):
    counterparty_id: str | None = Field(default=None, description="Internal id of the payee/payer")
    name: str | None = None
    account_number_masked: str | None = Field(default=None, description="Masked PAN/IBAN, last 4 only")
    country: str | None = Field(default=None, description="ISO-3166 alpha-2 country code")


class Transaction(BaseModel):
    """A single payment event presented for scoring."""
    transaction_id: str = Field(..., description="Unique transaction identifier")
    account_id: str = Field(..., description="Originating account identifier")
    timestamp: datetime = Field(..., description="When the payment was initiated (UTC)")
    amount: float = Field(..., ge=0, description="Transaction amount in minor->major units")
    currency: str = Field(default="USD", description="ISO-4217 currency code")
    network: PaymentNetwork = Field(..., description="Payment rail used")
    counterparty: Counterparty | None = None
    channel: str | None = Field(default=None, description="e.g. mobile, web, branch, api")
    device_id: str | None = None
    ip_address: str | None = None
    geo: GeoLocation | None = None
    merchant_category_code: str | None = Field(default=None, description="MCC for card payments")


class RiskAssessment(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0, description="Risk score 0.0-1.0 (higher = more suspicious)")
    level: RiskLevel = Field(..., description="Bucketed risk level")
    factors: list[str] = Field(default_factory=list, description="Human-readable contributing factors")


class EvidenceItem(BaseModel):
    source: str = Field(..., description="Where the evidence came from, e.g. txn_logs, profile, alert_history")
    reference_id: str | None = Field(default=None, description="Id of the underlying record (txn id, alert id)")
    description: str = Field(..., description="What this evidence shows")


class DetectedPattern(BaseModel):
    pattern: FraudPattern = Field(..., description="The fraud/AML pattern identified")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence 0-1")
    description: str = Field(..., description="Why this pattern was flagged")
    supporting_transaction_ids: list[str] = Field(default_factory=list)


# ===========================================================================
# 1. Transaction Scorer
# ===========================================================================

class ScoreRequest(BaseModel):
    """Input to the Transaction Scorer — a single incoming payment to score."""
    transaction: Transaction
    explain: bool = Field(default=True, description="Whether to return human-readable risk factors")


class ScoreResult(BaseModel):
    """Output of the Transaction Scorer."""
    transaction_id: str
    fraud_score: float = Field(..., ge=0.0, le=1.0, description="Fraud score 0.0-1.0 (higher = more suspicious)")
    risk_level: RiskLevel
    decision: ScoringDecision
    reason_tags: list[FraudPattern] = Field(default_factory=list)
    risk_factors: list[str] = Field(default_factory=list, description="Human-readable rationale")
    recommended_action: str = Field(..., description="Plain-language action for the payment system")
    scored_at: datetime = Field(default_factory=_utcnow)


# ===========================================================================
# 2. Investigation Agent
# ===========================================================================

class InvestigationRequest(BaseModel):
    """Input to the Investigation Agent — a natural-language investigation prompt."""
    query: str = Field(..., description="Analyst's natural-language question")
    account_id: str | None = Field(default=None, description="Account/subject to focus the investigation on")
    case_id: str | None = Field(default=None, description="Existing case to append to, if any")
    session_id: str = Field(default="default_session", description="Conversation/session id for memory threading")
    user_id: str = Field(default="anonymous", description="Investigating analyst id (for audit + memory actor)")


class InvestigationResult(BaseModel):
    """Output of the Investigation Agent."""
    case_id: str = Field(..., description="Case id (existing or newly created)")
    account_id: str | None = None
    narrative: str = Field(..., description="Investigation findings written for a human analyst")
    detected_patterns: list[DetectedPattern] = Field(default_factory=list)
    entities_of_interest: list[str] = Field(default_factory=list, description="Accounts/counterparties to review")
    risk_assessment: RiskAssessment | None = None
    evidence: list[EvidenceItem] = Field(default_factory=list)
    recommended_next_steps: list[str] = Field(default_factory=list)
    escalation: EscalationRecommendation = Field(default=EscalationRecommendation.MONITOR)
    investigated_at: datetime = Field(default_factory=_utcnow)


# ===========================================================================
# 3. SAR Report Agent
# ===========================================================================

class FilerInformation(BaseModel):
    institution_name: str
    institution_ein: str | None = Field(default=None, description="Employer Identification Number")
    contact_name: str | None = None
    contact_phone: str | None = None


class SubjectInformation(BaseModel):
    subject_id: str = Field(..., description="Internal account/customer id")
    full_name: str | None = None
    relationship_to_institution: str | None = Field(default=None, description="e.g. accountholder, beneficiary")
    account_numbers_masked: list[str] = Field(default_factory=list)
    address: str | None = None


class SuspiciousActivity(BaseModel):
    activity_start_date: datetime | None = None
    activity_end_date: datetime | None = None
    total_amount: float | None = Field(default=None, description="Aggregate suspicious amount")
    currency: str = Field(default="USD")
    patterns: list[FraudPattern] = Field(default_factory=list)
    instruments_involved: list[PaymentNetwork] = Field(default_factory=list)


class SARRequest(BaseModel):
    """Input to the SAR Report Agent."""
    case_id: str = Field(..., description="Case the SAR is being drafted for")
    subject_account_id: str = Field(..., description="Primary subject account")
    investigation: InvestigationResult | None = Field(
        default=None, description="Upstream investigation findings to base the SAR on"
    )
    filer: FilerInformation | None = Field(default=None, description="Defaults applied if omitted")


class SARReport(BaseModel):
    """Output of the SAR Report Agent — a FinCEN-structured draft SAR."""
    sar_id: str = Field(..., description="Draft SAR identifier")
    case_id: str
    filer_information: FilerInformation
    subjects: list[SubjectInformation] = Field(default_factory=list)
    suspicious_activity: SuspiciousActivity
    narrative: str = Field(
        ...,
        description="The SAR narrative covering who/what/when/where/why/how (FinCEN 5 W's + how)",
    )
    supporting_evidence: list[EvidenceItem] = Field(default_factory=list)
    filing_recommendation: FilingRecommendation = Field(default=FilingRecommendation.NEEDS_HUMAN_REVIEW)
    generated_at: datetime = Field(default_factory=_utcnow)


__all__ = [
    # enums
    "PaymentNetwork", "RiskLevel", "ScoringDecision", "FraudPattern",
    "EscalationRecommendation", "FilingRecommendation",
    # value objects
    "GeoLocation", "Counterparty", "Transaction", "RiskAssessment", "EvidenceItem", "DetectedPattern",
    # scorer
    "ScoreRequest", "ScoreResult",
    # investigation
    "InvestigationRequest", "InvestigationResult",
    # SAR
    "FilerInformation", "SubjectInformation", "SuspiciousActivity", "SARRequest", "SARReport",
]
