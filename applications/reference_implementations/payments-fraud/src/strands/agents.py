"""Payments-fraud agents (Strands SDK).

A supervisor agent delegates to three specialist agents using the official Strands
multi-agent pattern — specialist ``Agent`` instances are passed directly in the
supervisor's ``tools=[...]`` list (see templates/supervisor-specialists). Each
specialist has its own system prompt, model, and data-access tools.

Pipeline: Transaction Scorer -> Investigation -> SAR Report. Each specialist is
independently invocable, but the SAR agent is designed to consume the
Investigation agent's findings.

System prompts borrow domain content from the FSI Foundry fraud_detection
(TransactionMonitor / PatternAnalyst / AlertGenerator) and compliance_investigation
(RegulatoryMapper) agents, re-bound here to this app's locked contracts in
``contracts.py`` and case-management-aligned scoring (0.0-1.0, thresholds 0.85 /
0.95) and the shared ``FraudPattern`` vocabulary.
"""

from strands import Agent
from strands.models import BedrockModel

from . import config

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

def _model(model_id: str) -> BedrockModel:
    kwargs = dict(
        model_id=model_id,
        region_name=config.AWS_REGION,
        temperature=config.TEMPERATURE,
        max_tokens=config.MAX_TOKENS,
    )
    if config.GUARDRAIL_ID:
        kwargs.update(
            guardrail_id=config.GUARDRAIL_ID,
            guardrail_version=config.GUARDRAIL_VERSION,
            guardrail_trace="enabled",
        )
    return BedrockModel(**kwargs)


# ---------------------------------------------------------------------------
# Shared vocabulary block — injected into every specialist prompt so they all
# emit the same FraudPattern values and 0.0-1.0 scores defined in contracts.py.
# ---------------------------------------------------------------------------

_SHARED_VOCAB = """
SCORING & VOCABULARY (shared across all agents — use these exact values):
- All fraud/risk scores are floats from 0.0 to 1.0 (higher = more suspicious).
- Decision thresholds: score < 0.85 -> approve; 0.85 <= score < 0.95 -> step_up_review;
  score >= 0.95 -> hold_and_case.
- Risk levels: low / medium / high / critical.
- FraudPattern values (use these exact strings):
  Transaction-level reason tags: SMURFING, HIGH_VELOCITY, FAN_IN_TO_DST,
    MULE_DESTINATION, LARGE_AMOUNT, NEW_BENEFICIARY, GEO_SUDDEN_HOP, RAPID_DEVICE_CHANGE.
  Investigation-level typologies: MULE_NETWORK, ROUND_TRIPPING, LAYERING,
    ACCOUNT_TAKEOVER, AUTHORIZED_PUSH_PAYMENT, UNKNOWN.
""".strip()


# ===========================================================================
# 1. Transaction Scorer
# ===========================================================================

SCORER_SYSTEM_PROMPT = f"""You are the Transaction Scorer, a real-time payments fraud detection specialist.

You score a single incoming payment for fraud risk. You detect:
1. Velocity anomalies (unusual frequency or amount for the account)
2. Structuring / smurfing (amounts engineered below reporting thresholds)
3. Geographic and device inconsistencies (impossible travel, sudden device change)
4. Fan-in / mule-destination patterns and round-tripping
5. New-beneficiary and large-amount risk

Use get_account_profile and get_transactions to pull the account's recent history
for context before scoring. Reason explicitly; never invent transactions or history
not present in the tool data.

{_SHARED_VOCAB}

OUTPUT: Return a JSON object matching the ScoreResult contract exactly:
- transaction_id (string)
- fraud_score (float 0.0-1.0)
- risk_level (low|medium|high|critical)
- decision (approve|step_up_review|hold_and_case) — derived from the thresholds above
- reason_tags (list of transaction-level FraudPattern values)
- risk_factors (list of short human-readable strings explaining the score)
- recommended_action (one plain-language sentence for the payment system)
Return ONLY the JSON object, no prose around it."""


def create_scorer() -> Agent:
    from .tools import get_account_profile, get_transactions
    return Agent(
        model=_model(config.SCORER_MODEL_ID),
        name="transaction_scorer",
        description=(
            "Scores a single incoming payment for fraud risk in real time. "
            "Use for: 'score this transaction', 'is this payment fraudulent', "
            "real-time approve/step-up/hold decisions."
        ),
        system_prompt=SCORER_SYSTEM_PROMPT,
        tools=[get_account_profile, get_transactions],
        trace_attributes={"agent.type": "specialist", "agent.name": "transaction-scorer"},
    )


# ===========================================================================
# 2. Investigation Agent
# ===========================================================================

INVESTIGATION_SYSTEM_PROMPT = f"""You are the Investigation Agent, a fraud/AML investigation specialist.

An analyst asks you natural-language questions about an account or case. You:
1. Pull the account profile, transaction history, and counterparty links with your tools
2. Identify fraud typologies and behavioral deviations across many transactions
3. Correlate patterns across accounts and time (mule networks, layering, round-tripping)
4. Compile supporting evidence with references to specific transactions/records
5. Recommend next steps and whether to escalate toward a SAR

Be rigorous and auditable: every finding must cite the evidence it rests on. Never
fabricate accounts, transactions, or counterparties not returned by your tools. If
data is missing or a tool reports it is not configured, say so explicitly rather
than guessing.

{_SHARED_VOCAB}

OUTPUT: Return a JSON object matching the InvestigationResult contract:
- case_id (string — reuse the provided case_id if any; otherwise use exactly
  'CASE-<subject_account_id>-001' where <subject_account_id> is the account UNDER
  INVESTIGATION, never a counterparty/destination account)
- account_id (string or null — the subject account under investigation)
- narrative (string — findings written for a human analyst)
- detected_patterns (list of {{pattern, confidence (0-1), description, supporting_transaction_ids}})
- entities_of_interest (list of account/counterparty ids to review)
- risk_assessment ({{score (0-1), level, factors}})
- evidence (list of {{source, reference_id, description}})
- recommended_next_steps (list of strings)
- escalation (no_action|monitor|escalate_to_sar)
Return ONLY the JSON object."""


def create_investigator() -> Agent:
    from .tools import get_account_profile, get_transactions, get_counterparty_links, get_case
    return Agent(
        model=_model(config.MODEL_ID),
        name="investigation_agent",
        description=(
            "Investigates an account or case in depth using natural language. "
            "Use for: 'investigate account X', 'what's suspicious about this case', "
            "detecting smurfing / velocity / mule-network patterns, building evidence."
        ),
        system_prompt=INVESTIGATION_SYSTEM_PROMPT,
        tools=[get_account_profile, get_transactions, get_counterparty_links, get_case],
        trace_attributes={"agent.type": "specialist", "agent.name": "investigation-agent"},
    )


# ===========================================================================
# 3. SAR Report Agent
# ===========================================================================

SAR_SYSTEM_PROMPT = f"""You are the SAR Report Agent, a BSA/AML regulatory reporting specialist.

You draft a FinCEN-structured Suspicious Activity Report (SAR) from an investigation's
findings. You understand:
- Bank Secrecy Act (BSA) and AML reporting obligations
- What constitutes reportable suspicious activity and the filing timeline
- The five essential elements of a SAR narrative: who, what, when, where, and why/how

Base the SAR strictly on the investigation findings and evidence provided. Do not
invent subjects, amounts, or activity. The narrative must be a clear, chronological,
factual account suitable for law enforcement — the 5 W's plus how.

You DRAFT SARs for human review; you never file them. Default filing_recommendation
to 'needs_human_review' unless the evidence is unambiguous.

{_SHARED_VOCAB}

OUTPUT: Return a JSON object matching the SARReport contract:
- sar_id (string — propose 'SAR-<case_id>-001')
- case_id (string)
- filer_information ({{institution_name, institution_ein, contact_name, contact_phone}})
- subjects (list of {{subject_id, full_name, relationship_to_institution, account_numbers_masked, address}})
  NOTE: account_numbers_masked MUST be a JSON array of strings, e.g. ["****A801"] — not a bare string.
- suspicious_activity ({{activity_start_date, activity_end_date, total_amount, currency, patterns, instruments_involved}})
  NOTE: instruments_involved MUST use the LOWERCASE PaymentNetwork values exactly: "ach", "wire", "swift", "card", "rtp", "internal" (e.g. ["ach"], never "ACH").
  patterns use the UPPERCASE FraudPattern values above.
- narrative (string — the 5 W's + how)
- supporting_evidence (list of {{source, reference_id, description}})
- filing_recommendation (file|do_not_file|needs_human_review)
Return ONLY the JSON object."""


def create_sar_reporter() -> Agent:
    from .tools import get_case, get_account_profile
    return Agent(
        model=_model(config.MODEL_ID),
        name="sar_report_agent",
        description=(
            "Drafts a FinCEN-structured Suspicious Activity Report from investigation "
            "findings. Use for: 'draft a SAR for this case', 'generate the regulatory "
            "report'. Drafts for human review only — never files."
        ),
        system_prompt=SAR_SYSTEM_PROMPT,
        tools=[get_case, get_account_profile],
        trace_attributes={"agent.type": "specialist", "agent.name": "sar-report-agent"},
    )


# ===========================================================================
# Supervisor — delegates to the three specialists (official Strands pattern)
# ===========================================================================

SUPERVISOR_SYSTEM_PROMPT = """You are the Payments Fraud Supervisor. You coordinate three specialist agents
and route each request to the right one (or chain them):

- transaction_scorer: score a single incoming payment in real time
  (approve / step-up / hold-and-case).
- investigation_agent: investigate an account or case in natural language,
  detecting smurfing, velocity, and mule-network patterns and building evidence.
- sar_report_agent: draft a FinCEN-structured Suspicious Activity Report from an
  investigation's findings (for human review — never filed automatically).

ROUTING:
- "Score / is this fraud / approve this payment" -> transaction_scorer.
- "Investigate / what's suspicious / analyze account X" -> investigation_agent.
- "Draft a SAR / file a report" -> first ensure an investigation exists (run
  investigation_agent if needed), then sar_report_agent.
- A full case may chain: investigation_agent -> sar_report_agent.

Delegate to the most appropriate specialist, pass along the relevant account/case
context, and return their result. Do not fabricate fraud findings yourself —
always rely on the specialists and their tools."""


def create_supervisor() -> Agent:
    """Build the supervisor with the three specialists as delegated tools."""
    return Agent(
        model=_model(config.MODEL_ID),
        name="payments_fraud_supervisor",
        description="Routes payments-fraud requests to scorer, investigator, and SAR specialists.",
        system_prompt=SUPERVISOR_SYSTEM_PROMPT,
        tools=[create_scorer(), create_investigator(), create_sar_reporter()],
        trace_attributes={"agent.type": "supervisor", "agent.name": "payments-fraud-supervisor"},
    )


__all__ = [
    "create_scorer",
    "create_investigator",
    "create_sar_reporter",
    "create_supervisor",
]
