/**
 * Hardcoded fallback KYCResponses for both scenarios.
 * Used when both the live API fails AND localStorage cache is empty.
 * This ensures the demo NEVER breaks — even on first run with no network.
 */
import type { KYCResponse } from '../types';

export const FALLBACK_RESPONSE: KYCResponse = {
  customer_id: 'CUST001',
  assessment_id: 'KYC-2026-001',
  timestamp: '2026-06-19T09:14:36.000Z',
  credit_risk: {
    score: 22,
    level: 'low',
    factors: [
      'Strong revenue growth (12% YoY)',
      'Excellent payment history (96% on-time, 48/50)',
      'Low leverage ratio (D/E 0.33)',
      'Diversified client base across 3 sectors',
      'A-rated credit score (750)',
    ],
    recommendations: [
      'Standard facility terms ($15M–$23M)',
      'Prime + 75–100 bps pricing',
      'Annual review cycle — no enhanced monitoring required',
    ],
  },
  compliance: {
    status: 'compliant',
    checks_passed: [
      'Corporate Registration — Active, Good Standing',
      'Beneficial Ownership — 3 UBOs identified and verified',
      'OFAC Sanctions Screening — Clear',
      'UN Sanctions Screening — Clear',
      'EU Sanctions Screening — Clear',
      'UK HMT Sanctions Screening — Clear',
      'PEP Screening (All UBOs) — No associations',
      'Adverse Media Check — No findings',
      'Source of Funds Verification — Legitimate business revenue',
      'Geographic Risk Assessment — Low (domestic operations)',
      'Industry Risk Assessment — Standard (manufacturing)',
      'Transaction Pattern Analysis — Normal, no anomalies',
    ],
    checks_failed: [],
    regulatory_notes: [
      'All checks conducted per MLR 2017 / AML requirements',
      'FATF guidelines fully satisfied',
      'No enhanced due diligence required',
      'Standard KYC refresh cycle: 12 months',
    ],
  },
  summary: `**OVERALL RECOMMENDATION: APPROVE**

Acme Corporation Ltd presents an excellent risk profile suitable for corporate banking onboarding with favorable credit terms.

- Credit Risk Score: 22/100 (LOW) — 750 credit score, A-rated
- Compliance: COMPLIANT — All 12 KYC/AML checks passed
- Financial Position: STRONG — D/E 0.33, Current Ratio 2.1x, $8.5M net income
- Payment History: EXCELLENT — 96% on-time (48/50), zero defaults
- Business Volume: LEGITIMATE — $87M annual, diversified base
- Ownership: VERIFIED — Smith 45%, Doe 30%, Fund ABC 25%

Recommended Facilities: $15M–$23M | Prime + 75–100 bps | 3–5 year tenor`,
  raw_analysis: {
    credit_analysis: {
      agent: 'credit_analyst',
      customer_id: 'CUST001',
      analysis: 'Credit assessment complete. Score: 22/100 (LOW). Strong financials, excellent payment history, low leverage.',
    },
    compliance_check: {
      agent: 'compliance_officer',
      customer_id: 'CUST001',
      assessment: 'Compliance verification complete. Status: COMPLIANT. All 12 checks passed. No sanctions, PEP, or adverse media findings.',
    },
  },
};

export const FALLBACK_RESPONSE_BLOCK: KYCResponse = {
  customer_id: 'CUST047',
  assessment_id: 'KYC-2026-047',
  timestamp: '2026-06-19T10:22:14.000Z',
  credit_risk: {
    score: 81,
    level: 'critical',
    factors: [
      'BVI incorporation — high-risk jurisdiction',
      'Nominee shareholders (40% combined) — opaque ownership',
      'Credit score 520 — below threshold',
      'High leverage: D/E 5.4x (liabilities $38M vs equity $7M)',
      'Payment defaults: 2 of 50 (4%)',
      'Revenue-to-asset mismatch: $12M revenue against $45M assets',
    ],
    recommendations: [
      'REJECT — mandatory MLRO escalation',
      'File SAR with NCA within 24 hours',
      'Freeze any pending facility approvals',
    ],
  },
  compliance: {
    status: 'non_compliant',
    checks_passed: [
      'Corporate Registration — Active (BVI Registry)',
      'Source of Funds — Declared (unverified)',
    ],
    checks_failed: [
      'OFAC Sanctions Screening — MATCH: Viktor Petrov (78% fuzzy match)',
      'PEP Screening — Level 2 association detected',
      'Adverse Media — Regulatory investigation 2024 (Cyprus)',
      'Geographic Risk — CRITICAL (BVI + nominee structure)',
      'Beneficial Ownership — Opaque: 2 nominee entities unresolved',
      'Transaction Pattern — Anomalous: 6 large transfers to non-correlated jurisdictions',
    ],
    regulatory_notes: [
      'OFAC SDN partial match exceeds 70% threshold — org policy BLOCK',
      'PEP Level 2 requires enhanced due diligence (MLR 2017 Reg 33)',
      'Adverse media: Cyprus Securities & Exchange Commission investigation 2024',
      'SAR filing mandatory per POCA 2002 s.330',
    ],
  },
  summary: `**OVERALL RECOMMENDATION: REJECT — BLOCKED BY POLICY ENGINE**

Omega Trading Ltd presents critical risk indicators that triggered an automatic policy block before agent approval could proceed.

- Credit Risk Score: 81/100 (CRITICAL) — 520 credit score, sub-investment grade
- Compliance: NON-COMPLIANT — 6 of 8 KYC/AML checks FAILED
- Sanctions: MATCH — Viktor Petrov 78% fuzzy match (OFAC SDN) > 70% org threshold
- PEP: Level 2 association detected
- Ownership: OPAQUE — 40% held by nominee entities (Cayman Holdings BVI, Nominee Services Ltd)
- Jurisdiction: HIGH RISK — BVI incorporation with multi-jurisdictional nominee structures

Policy Engine Decision: BLOCK (Org Layer) — sanctions match exceeds threshold. Agent opinion overridden.
Escalation: MLRO mandatory review. SAR filing required.`,
  raw_analysis: {
    credit_analysis: {
      agent: 'credit_analyst',
      customer_id: 'CUST047',
      analysis: 'Credit assessment complete. Score: 81/100 (CRITICAL). BVI incorporation, nominee structures, high leverage, payment defaults.',
    },
    compliance_check: {
      agent: 'compliance_officer',
      customer_id: 'CUST047',
      assessment: 'Compliance verification complete. Status: NON-COMPLIANT. Sanctions match 78% (OFAC SDN). PEP Level 2. Adverse media flagged. 6 checks failed.',
    },
  },
};
