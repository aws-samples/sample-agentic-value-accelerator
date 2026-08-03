/**
 * explainData — Explainability & Fairness data model + fixtures.
 *
 * Six capabilities, keyed to the real model fleet (haiku-4-5, sonnet-4-5,
 * opus-4-7, nova-pro, nova-lite):
 *   1. Feature attribution — SHAP / LIME / Anchor (ported from AI Trust Tool)
 *   2. Adverse-action notices — ECOA / Reg B ranked reason codes (ported)
 *   3. Counterfactuals / what-if (ported)
 *   4. Bias & fairness — disparate impact, four-fifths rule, subgroup metrics (new)
 *   5. Drift explainability — root-cause drivers (links to Monitoring for trends)
 *   6. Decision audit trail — per-decision record + SHA-256-style integrity hash
 *
 * SHAP/LIME/Anchor/adverse-action/counterfactual fixtures are the real JSON
 * shapes from the AI Trust Tool (data/explanations/samples/*). Bias, drift, and
 * audit are mock but shaped for a clean swap to live data later.
 */

// ─────────────────────────── Feature attribution ───────────────────────────

export interface ShapValue {
  feature: string;
  shap_value: number;
  direction: 'positive' | 'negative';
  explanation: string;
}

export interface ShapDimension {
  score: number;
  shap_contribution: number;
  explanation: string;
}

export interface ShapExplanation {
  method: 'SHAP';
  base_value: number;
  final_value: number;
  shap_values: ShapValue[];
  dimensions: Record<string, ShapDimension>;
  interpretation: string;
}

export interface LimeFeature {
  feature: string;
  weight: number;
  contribution: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

export interface LimeExplanation {
  method: 'LIME';
  features: LimeFeature[];
  overall_confidence: number;
  interpretation: string;
}

export interface AnchorRule {
  rule: string;
  precision: number;
  coverage: number;
  explanation: string;
}

export interface AnchorExplanation {
  method: 'Anchor';
  anchors: AnchorRule[];
  overall_precision: number;
  overall_coverage: number;
  interpretation: string;
}

export interface AttributionExample {
  prompt: string;
  response: string;
  shap: ShapExplanation;
  lime: LimeExplanation;
  anchor: AnchorExplanation;
}

// ─────────────────────────── Adverse-action ───────────────────────────

export interface AdverseReason {
  rank: number;
  reason: string;
  weight: number;
  category: string;
}

export interface AdverseActionNotice {
  notice_type: string;
  regulation: string;
  date: string;
  applicant: string;
  application_type: string;
  action_taken: string;
  reasons: AdverseReason[];
  credit_bureau: { name: string; address: string; phone: string };
  applicant_rights: string[];
  cfpb_contact: string;
}

// ─────────────────────────── Counterfactual ───────────────────────────

export interface Counterfactual {
  factor: string;
  current_value: string;
  required_value: string;
  impact: 'high' | 'medium' | 'low';
  feasibility: 'high' | 'medium' | 'low';
  timeframe: string;
  explanation: string;
}

export interface CounterfactualAnalysis {
  current_decision: string;
  target_decision: string;
  counterfactuals: Counterfactual[];
  minimum_changes_needed: number;
  easiest_path: string;
  regulatory_note: string;
}

// ─────────────────────────── Bias & fairness ───────────────────────────

export interface SubgroupMetric {
  group: string;
  approvalRate: number;   // 0–1
  accuracy: number;       // 0–1
  count: number;
}

/** One protected attribute's fairness assessment. */
export interface FairnessAssessment {
  attribute: string;            // e.g. "Race / Ethnicity"
  privilegedGroup: string;      // reference group
  subgroups: SubgroupMetric[];
  /** Ratio of least-favored to most-favored selection rate (four-fifths rule). */
  disparateImpactRatio: number; // pass if >= 0.8
  /** Max gap in accuracy across subgroups (equal-opportunity proxy). */
  accuracyGap: number;
  status: 'pass' | 'warning' | 'fail';
  note: string;
}

// ─────────────────────────── Drift explainability ───────────────────────────

export interface DriftDriver {
  feature: string;
  /** Population Stability Index — >0.25 = significant shift. */
  psi: number;
  shiftDescription: string;
  contribution: number; // share of overall drift, 0–1
}

export interface DriftExplanation {
  overallPsi: number;
  window: string;
  status: 'stable' | 'drifting' | 'significant';
  drivers: DriftDriver[];
  summary: string;
}

// ─────────────────────────── Decision audit trail ───────────────────────────

export interface DecisionRecord {
  runId: string;
  timestamp: string;
  actor: string;
  decision: string;
  method: string;          // e.g. "SHAP + Adverse Action"
  useCase: string;
  inputsSummary: string;
  integrityHash: string;   // SHA-256-style (mock)
  integrity: 'INTACT' | 'TAMPERED';
}

// ─────────────────────────── Per-model bundle ───────────────────────────

export interface ModelExplainability {
  modelId: string;
  attribution: AttributionExample;
  adverseAction: AdverseActionNotice;
  counterfactual: CounterfactualAnalysis;
  fairness: FairnessAssessment[];
  drift: DriftExplanation;
  decisions: DecisionRecord[];
}

// ─────────────────────────── Real fixtures (ported) ───────────────────────────

const ATTRIBUTION_FIXTURE: AttributionExample = {
  prompt: 'What are the different types of checking accounts available?',
  response: 'There are several types of checking accounts: 1. Basic Checking — minimal fees, core features. 2. Premium/Interest Checking — earns interest, perks for higher balances. 3. Student Checking — reduced fees for students. 4. Senior Checking — tailored for older customers. 5. Business Checking — for commercial use. Choose based on your balance, transaction volume, and fee tolerance.',
  shap: {
    method: 'SHAP',
    base_value: 0.7,
    final_value: 0.92,
    shap_values: [
      { feature: 'comprehensive account types', shap_value: 0.10, direction: 'positive', explanation: 'The response provides distinct types of checking accounts, offering a thorough overview of available options.' },
      { feature: 'feature descriptions', shap_value: 0.06, direction: 'positive', explanation: 'Each account type includes specific features that distinguish it from others.' },
      { feature: 'target audience identification', shap_value: 0.04, direction: 'positive', explanation: 'The response specifies which customer segments each account type serves best.' },
      { feature: 'structured format', shap_value: 0.02, direction: 'positive', explanation: 'The numbered list with bold headers makes the information easily scannable and digestible.' },
    ],
    dimensions: {
      factual_accuracy: { score: 0.95, shap_contribution: 0.08, explanation: 'The information about checking account types is accurate and reflects standard banking offerings.' },
      regulatory_compliance: { score: 0.90, shap_contribution: 0.05, explanation: 'The response avoids specific claims about rates or fees that would require regulatory disclosures.' },
      customer_helpfulness: { score: 0.93, shap_contribution: 0.06, explanation: 'The answer is actionable and guides the customer toward choosing an appropriate account.' },
      safety: { score: 0.98, shap_contribution: 0.03, explanation: 'No harmful, biased, or misleading content; appropriate financial guidance.' },
    },
    interpretation: 'The response quality is driven primarily by comprehensive coverage of account types and clear feature descriptions, with strong factual accuracy and regulatory compliance.',
  },
  lime: {
    method: 'LIME',
    features: [
      { feature: 'types of checking accounts', weight: 0.95, contribution: 'positive', explanation: 'The core query that directly asks for a categorization of checking accounts.' },
      { feature: 'checking accounts', weight: 0.85, contribution: 'positive', explanation: 'The specific financial product that is the subject of the query.' },
      { feature: 'different', weight: 0.75, contribution: 'positive', explanation: 'Signals the user wants a comparison or categorization of multiple varieties.' },
      { feature: 'available', weight: 0.60, contribution: 'positive', explanation: 'Indicates the user wants currently-offered options in the market.' },
      { feature: 'what are', weight: 0.40, contribution: 'neutral', explanation: 'A generic question format that does not strongly shape the specific content.' },
    ],
    overall_confidence: 0.90,
    interpretation: 'The response was primarily driven by the direct request to enumerate and explain the various types of checking accounts currently available.',
  },
  anchor: {
    method: 'Anchor',
    anchors: [
      { rule: "IF prompt contains 'checking accounts' AND asks about 'types' or 'different' THEN provide comprehensive categorized list", precision: 0.98, coverage: 0.85, explanation: 'The prompt directly asks about different types of checking accounts, triggering a structured, categorized response.' },
      { rule: 'IF question is about financial products THEN structure response with headers and brief descriptions', precision: 0.93, coverage: 0.80, explanation: 'Financial product queries receive well-structured responses with clear headers and concise descriptions.' },
      { rule: 'IF prompt requests information about banking products THEN include distinguishing features for comparison', precision: 0.95, coverage: 0.75, explanation: 'Users asking about account types likely need to compare options, so distinguishing features are included.' },
      { rule: 'IF question is about financial services THEN avoid specific recommendations but provide general guidance', precision: 0.97, coverage: 0.90, explanation: 'The response provides factual information without recommending specific banks or products.' },
    ],
    overall_precision: 0.96,
    overall_coverage: 0.83,
    interpretation: 'The response is driven by recognition of a classification request, financial-information formatting standards, inclusion of distinguishing features, and adherence to financial-advice guidelines.',
  },
};

const ADVERSE_ACTION_FIXTURE: AdverseActionNotice = {
  notice_type: 'Adverse Action Notice',
  regulation: 'Equal Credit Opportunity Act (Regulation B)',
  date: 'April 21, 2026',
  applicant: 'John Smith',
  application_type: 'mortgage',
  action_taken: 'Application Denied',
  reasons: [
    { rank: 1, reason: 'Insufficient credit score', weight: 0.85, category: 'Credit History' },
    { rank: 2, reason: 'Excessive debt-to-income ratio', weight: 0.62, category: 'Income/Debt' },
    { rank: 3, reason: 'Insufficient length of employment', weight: 0.45, category: 'Employment' },
    { rank: 4, reason: 'Income insufficient for requested loan amount', weight: 0.31, category: 'Income/Debt' },
  ],
  credit_bureau: { name: 'Equifax', address: 'P.O. Box 740241, Atlanta, GA 30374', phone: '1-800-685-1111' },
  applicant_rights: [
    'You have the right to obtain a free copy of your credit report within 60 days',
    'You have the right to dispute the accuracy of information in your credit report',
    'You have the right to know the reasons for this adverse action',
    'The federal agency that administers compliance is the Consumer Financial Protection Bureau',
  ],
  cfpb_contact: 'Consumer Financial Protection Bureau, 1700 G Street NW, Washington, DC 20552, www.consumerfinance.gov',
};

const COUNTERFACTUAL_FIXTURE: CounterfactualAnalysis = {
  current_decision: 'denied',
  target_decision: 'approved',
  counterfactuals: [
    { factor: 'credit score', current_value: '580', required_value: '620+', impact: 'high', feasibility: 'medium', timeframe: '6-12 months', explanation: 'Most conventional lenders require a minimum score of 620. FHA loans may accept 580, but with other suboptimal factors a higher score would significantly improve chances.' },
    { factor: 'DTI ratio', current_value: '45%', required_value: 'below 43%', impact: 'high', feasibility: 'medium', timeframe: '3-6 months', explanation: '43% is the maximum DTI for Qualified Mortgages. Reducing DTI requires paying down existing debt or increasing income.' },
    { factor: 'employment history', current_value: '1 year', required_value: '2+ years', impact: 'medium', feasibility: 'low', timeframe: '12 months', explanation: 'Most lenders require at least 2 years of stable employment history to demonstrate income stability.' },
    { factor: 'loan amount', current_value: '$250,000', required_value: '$180,000 or less', impact: 'high', feasibility: 'high', timeframe: 'immediate', explanation: 'With current income and DTI, a smaller loan amount would be more proportionate to financial capacity.' },
  ],
  minimum_changes_needed: 2,
  easiest_path: 'Reducing the requested loan amount to $180,000 or less is the most immediately feasible change and would meaningfully improve the DTI ratio at the same time.',
  regulatory_note: 'Under ECOA, these counterfactual factors must align with the principal reasons disclosed in the adverse-action notice. They are illustrative of model behavior and not a guarantee of approval.',
};

// ─────────────────────────── Per-model variation ───────────────────────────

/** Deterministic pseudo-random in [0,1) from a string seed. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const FLEET: { id: string; name: string; quality: number }[] = [
  { id: 'opus-4-7', name: 'Claude Opus 4.7', quality: 91 },
  { id: 'sonnet-4-5', name: 'Claude Sonnet 4.5', quality: 88 },
  { id: 'haiku-4-5', name: 'Claude Haiku 4.5', quality: 82 },
  { id: 'nova-pro', name: 'Nova Pro', quality: 76 },
  { id: 'nova-lite', name: 'Nova Lite', quality: 68 },
];

const PROTECTED_ATTRS: { attribute: string; privileged: string; groups: string[] }[] = [
  { attribute: 'Race / Ethnicity', privileged: 'White', groups: ['White', 'Black', 'Hispanic', 'Asian'] },
  { attribute: 'Gender', privileged: 'Male', groups: ['Male', 'Female'] },
  { attribute: 'Age Group', privileged: '35-54', groups: ['18-34', '35-54', '55+'] },
];

function buildFairness(modelId: string, quality: number): FairnessAssessment[] {
  return PROTECTED_ATTRS.map(pa => {
    const subgroups: SubgroupMetric[] = pa.groups.map((g, i) => {
      const isPriv = g === pa.privileged;
      const base = 0.62 + (quality - 70) / 200; // stronger models slightly higher approval
      const penalty = isPriv ? 0 : (seeded(`${modelId}-${pa.attribute}-${g}`) * 0.18);
      return {
        group: g,
        approvalRate: Math.max(0.35, Math.min(0.85, +(base - penalty).toFixed(3))),
        accuracy: +(0.9 - (isPriv ? 0 : seeded(`${modelId}-acc-${g}`) * 0.08)).toFixed(3),
        count: 400 + Math.round(seeded(`${modelId}-n-${g}-${i}`) * 600),
      };
    });
    const rates = subgroups.map(s => s.approvalRate);
    const di = +(Math.min(...rates) / Math.max(...rates)).toFixed(3);
    const accs = subgroups.map(s => s.accuracy);
    const accuracyGap = +(Math.max(...accs) - Math.min(...accs)).toFixed(3);
    const status: FairnessAssessment['status'] = di >= 0.8 ? 'pass' : di >= 0.7 ? 'warning' : 'fail';
    return {
      attribute: pa.attribute,
      privilegedGroup: pa.privileged,
      subgroups,
      disparateImpactRatio: di,
      accuracyGap,
      status,
      note: status === 'pass'
        ? `Selection-rate ratio of ${di} clears the four-fifths (0.80) threshold; no disparate impact indicated.`
        : status === 'warning'
          ? `Selection-rate ratio of ${di} is below 0.80 — potential disparate impact warrants review and documentation under ECOA.`
          : `Selection-rate ratio of ${di} fails the four-fifths rule — escalate to fair-lending compliance before deployment.`,
    };
  });
}

function buildDrift(modelId: string): DriftExplanation {
  const drivers: DriftDriver[] = [
    { feature: 'Applicant income distribution', psi: +(0.12 + seeded(`${modelId}-d1`) * 0.2).toFixed(3), shiftDescription: 'Median applicant income rose ~8% vs the training window, shifting the input distribution.', contribution: 0.38 },
    { feature: 'Loan purpose mix', psi: +(0.08 + seeded(`${modelId}-d2`) * 0.15).toFixed(3), shiftDescription: 'Higher share of debt-consolidation requests relative to purchase.', contribution: 0.27 },
    { feature: 'Geographic mix', psi: +(0.05 + seeded(`${modelId}-d3`) * 0.12).toFixed(3), shiftDescription: 'Increased volume from new metro markets onboarded this quarter.', contribution: 0.21 },
    { feature: 'Prompt phrasing / channel', psi: +(0.03 + seeded(`${modelId}-d4`) * 0.1).toFixed(3), shiftDescription: 'More queries arriving via the mobile channel with shorter phrasing.', contribution: 0.14 },
  ];
  const overallPsi = +(drivers.reduce((s, d) => s + d.psi * d.contribution, 0)).toFixed(3);
  const status: DriftExplanation['status'] = overallPsi >= 0.25 ? 'significant' : overallPsi >= 0.1 ? 'drifting' : 'stable';
  return {
    overallPsi,
    window: 'Last 30 days vs training baseline',
    status,
    drivers,
    summary: status === 'stable'
      ? 'Input distribution is stable; no material drift detected this window.'
      : `Drift is concentrated in input distribution, led by income and loan-purpose shifts (combined ${Math.round((drivers[0].contribution + drivers[1].contribution) * 100)}% of total drift). Quality scores remain within tolerance — see Monitoring for the trend.`,
  };
}

function buildDecisions(modelId: string): DecisionRecord[] {
  const methods = ['SHAP + Adverse Action', 'LIME', 'Counterfactual', 'Fairness Audit', 'SHAP'];
  const useCases = ['Mortgage underwriting assist', 'Credit-line increase', 'Fraud triage', 'KYC risk scoring', 'Loan modification'];
  const actors = ['j.okafor@bank.com', 'compliance-bot', 'm.alvarez@bank.com', 's.chen@bank.com', 'risk-pipeline'];
  return Array.from({ length: 5 }, (_, i) => {
    const r = seeded(`${modelId}-dec-${i}`);
    const hash = Array.from({ length: 12 }, (_, k) => '0123456789abcdef'[Math.floor(seeded(`${modelId}-${i}-${k}`) * 16)]).join('');
    return {
      runId: `${modelId.replace(/-/g, '')}${i}${hash.slice(0, 6)}`,
      timestamp: `2026-05-${String(20 + i).padStart(2, '0')}T1${i}:${String(10 + i * 7).padStart(2, '0')}:00Z`,
      actor: actors[i % actors.length],
      decision: r > 0.5 ? 'Approved' : 'Denied',
      method: methods[i % methods.length],
      useCase: useCases[i % useCases.length],
      inputsSummary: `score ${560 + Math.round(r * 180)}, DTI ${Math.round(28 + r * 20)}%, $${(150 + Math.round(r * 250))}k`,
      integrityHash: `sha256:${hash}…`,
      integrity: i === 3 ? 'TAMPERED' : 'INTACT',
    };
  });
}

export const MODEL_EXPLAINABILITY: Record<string, ModelExplainability> = Object.fromEntries(
  FLEET.map(f => [
    f.id,
    {
      modelId: f.id,
      attribution: ATTRIBUTION_FIXTURE,
      adverseAction: ADVERSE_ACTION_FIXTURE,
      counterfactual: COUNTERFACTUAL_FIXTURE,
      fairness: buildFairness(f.id, f.quality),
      drift: buildDrift(f.id),
      decisions: buildDecisions(f.id),
    } as ModelExplainability,
  ])
);

export const EXPLAIN_MODELS = FLEET.map(f => ({ id: f.id, name: f.name }));
