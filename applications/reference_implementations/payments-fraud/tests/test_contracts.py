"""Unit tests for the agent contracts (src/strands/contracts.py).

These are pure, fast, and need no AWS/Bedrock — they validate the most important
interface in the app: the typed input/output contracts the agents must conform to,
and that the bundled sample data conforms to them too.

Run from the package root:  pytest
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

# Make src/strands importable without installing the package.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "strands"))

import contracts as c  # noqa: E402


# ---------------------------------------------------------------------------
# Score scale & enums
# ---------------------------------------------------------------------------

def test_score_scale_is_0_to_1_float():
    """Scores are 0.0-1.0 floats (matches case-management for comparability)."""
    sr = c.ScoreResult(
        transaction_id="T1", fraud_score=0.96, risk_level=c.RiskLevel.CRITICAL,
        decision=c.ScoringDecision.HOLD_AND_CASE, recommended_action="hold",
    )
    assert 0.0 <= sr.fraud_score <= 1.0


@pytest.mark.parametrize("bad_score", [1.5, -0.1, 2.0])
def test_fraud_score_out_of_range_rejected(bad_score):
    with pytest.raises(ValidationError):
        c.ScoreResult(
            transaction_id="T1", fraud_score=bad_score, risk_level=c.RiskLevel.LOW,
            decision=c.ScoringDecision.APPROVE, recommended_action="x",
        )


def test_decision_enum_values():
    assert {d.value for d in c.ScoringDecision} == {
        "approve", "step_up_review", "hold_and_case",
    }


def test_invalid_decision_rejected():
    with pytest.raises(ValidationError):
        c.ScoreResult(
            transaction_id="T1", fraud_score=0.5, risk_level=c.RiskLevel.MEDIUM,
            decision="escalate", recommended_action="x",  # not a valid ScoringDecision
        )


def test_fraud_pattern_shared_vocabulary():
    """Transaction-level tags (verbatim from case-management) + investigation typologies."""
    txn_level = {"SMURFING", "HIGH_VELOCITY", "FAN_IN_TO_DST", "MULE_DESTINATION",
                 "LARGE_AMOUNT", "NEW_BENEFICIARY", "GEO_SUDDEN_HOP", "RAPID_DEVICE_CHANGE"}
    values = {p.value for p in c.FraudPattern}
    assert txn_level <= values
    assert "MULE_NETWORK" in values and "AUTHORIZED_PUSH_PAYMENT" in values


# ---------------------------------------------------------------------------
# Each agent contract round-trips
# ---------------------------------------------------------------------------

def test_score_result_round_trips():
    sr = c.ScoreResult(
        transaction_id="TXN_MULE_1", fraud_score=0.96, risk_level=c.RiskLevel.CRITICAL,
        decision=c.ScoringDecision.HOLD_AND_CASE,
        reason_tags=[c.FraudPattern.FAN_IN_TO_DST, c.FraudPattern.MULE_DESTINATION],
        recommended_action="Hold funds and open a case.",
    )
    dumped = sr.model_dump(mode="json")
    assert c.ScoreResult.model_validate(dumped) == sr


def test_investigation_result_validates():
    ir = c.InvestigationResult.model_validate({
        "case_id": "CASE-A705-001", "account_id": "A705",
        "narrative": "Structuring observed.",
        "detected_patterns": [{
            "pattern": "SMURFING", "confidence": 0.85,
            "description": "5 sub-threshold deposits", "supporting_transaction_ids": ["T1"],
        }],
        "risk_assessment": {"score": 0.88, "level": "high", "factors": ["sub-threshold"]},
        "escalation": "escalate_to_sar",
    })
    assert ir.detected_patterns[0].pattern is c.FraudPattern.SMURFING
    assert ir.escalation is c.EscalationRecommendation.ESCALATE_TO_SAR


def test_sar_report_validates_and_defaults_to_human_review():
    sar = c.SARReport.model_validate({
        "sar_id": "SAR-CASE-A801-001-001", "case_id": "CASE-A801-001",
        "filer_information": {"institution_name": "Demo Bank"},
        "subjects": [{"subject_id": "A801", "account_numbers_masked": ["****A801"]}],
        "suspicious_activity": {"patterns": ["MULE_NETWORK"], "instruments_involved": ["ach"]},
        "narrative": "Subject account aggregated funds from five sources.",
    })
    # Human-in-the-loop default when not explicitly set.
    assert sar.filing_recommendation is c.FilingRecommendation.NEEDS_HUMAN_REVIEW


def test_sar_instruments_must_be_lowercase_network_values():
    """Regression: the SAR agent once emitted 'ACH'; PaymentNetwork is lowercase."""
    with pytest.raises(ValidationError):
        c.SuspiciousActivity(instruments_involved=["ACH"])  # uppercase invalid
    ok = c.SuspiciousActivity(instruments_involved=["ach", "wire"])
    assert ok.instruments_involved[0] is c.PaymentNetwork.ACH


# ---------------------------------------------------------------------------
# Bundled sample data conforms to the contracts
# ---------------------------------------------------------------------------

ACCOUNT_PROFILES = sorted((ROOT / "data" / "accounts").glob("*/profile.json"))


def test_sample_data_present():
    assert ACCOUNT_PROFILES, "no sample account profiles found under data/accounts/"


@pytest.mark.parametrize("profile_path", ACCOUNT_PROFILES, ids=lambda p: p.parent.name)
def test_sample_transactions_match_transaction_contract(profile_path):
    data = json.loads(profile_path.read_text())
    for txn in data["transactions"]:
        c.Transaction.model_validate(txn)


@pytest.mark.parametrize("profile_path", ACCOUNT_PROFILES, ids=lambda p: p.parent.name)
def test_sample_expected_assessment_uses_real_enums(profile_path):
    ea = json.loads(profile_path.read_text())["expected_assessment"]
    c.ScoringDecision(ea["decision"])
    c.RiskLevel(ea["risk_level"])
    assert 0.0 <= ea["fraud_score"] <= 1.0
    for tag in ea["reason_tags"]:
        c.FraudPattern(tag)
