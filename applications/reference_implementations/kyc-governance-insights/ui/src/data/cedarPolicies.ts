export type PolicyCategory = 'authorization' | 'guardrails' | 'data_access' | 'action_limits';
export type PolicyStatus = 'active' | 'shadow' | 'disabled';
export type EvalResult = 'ALLOW' | 'DENY' | 'NOT_APPLICABLE';

export interface CedarPolicy {
  id: string;
  name: string;
  category: PolicyCategory;
  description: string;
  businessRationale: string;
  status: PolicyStatus;
  cedarDsl: string;
  lastTriggered: string;
  triggerCount30d: number;
  impactIfRemoved: string;
  impactPercentage: number;
}

export interface PolicyEvalTrace {
  decision_id: string;
  timestamp: string;
  customer_id: string;
  action: string;
  policies_evaluated: PolicyEvalEntry[];
  final_decision: 'ALLOW' | 'DENY';
  latency_ms: number;
}

export interface PolicyEvalEntry {
  policy_id: string;
  result: EvalResult;
  reason: string;
  duration_us: number;
}

export const cedarPolicies: CedarPolicy[] = [
  {
    id: 'kyc-max-auto-approve', name: 'Max Auto-Approve Limit', category: 'authorization',
    description: 'Blocks auto-approval for assessments above \u00A310,000 exposure.',
    businessRationale: 'Protects against catastrophic loss from incorrect high-value decisions. Board-mandated threshold.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"AutoApprove",\n  resource\n) when {\n  resource.amount > 10000\n};',
    lastTriggered: '2026-06-22T14:32:00Z', triggerCount30d: 47,
    impactIfRemoved: '47 high-value decisions would bypass human review', impactPercentage: 12,
  },
  {
    id: 'kyc-pep-escalation', name: 'PEP Escalation', category: 'guardrails',
    description: 'Forces HITL escalation for any PEP match score above 0.6.',
    businessRationale: 'PEP associations require senior compliance review per FCA guidance. Cannot be auto-decided.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"AutoDecide",\n  resource\n) when {\n  resource.pep_score > 0.6\n};',
    lastTriggered: '2026-06-21T09:15:00Z', triggerCount30d: 8,
    impactIfRemoved: '8 PEP-linked customers would be auto-decided without MLRO review', impactPercentage: 2,
  },
  {
    id: 'kyc-sanctions-hard-block', name: 'Sanctions Hard Block', category: 'guardrails',
    description: 'Immediate block on any sanctions list match (OFAC, UN, EU, UK HMT).',
    businessRationale: 'Legal obligation under UK Sanctions Act 2018. Zero tolerance. Mandatory SAR filing.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"Approve",\n  resource\n) when {\n  resource.sanctions_match == true\n};',
    lastTriggered: '2026-06-22T16:45:00Z', triggerCount30d: 3,
    impactIfRemoved: '3 sanctioned entities would pass KYC (CRITICAL regulatory breach)', impactPercentage: 0,
  },
  {
    id: 'kyc-hallucination-guard', name: 'Hallucination Guard', category: 'guardrails',
    description: 'Requires source grounding score > 0.9 for all agent outputs.',
    businessRationale: 'Prevents AI-fabricated facts reaching customers or compliance records.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"EmitDecision",\n  resource\n) when {\n  resource.grounding_score < 0.9\n};',
    lastTriggered: '2026-06-22T11:20:00Z', triggerCount30d: 14,
    impactIfRemoved: '14 poorly-grounded decisions would reach customers', impactPercentage: 4,
  },
  {
    id: 'kyc-data-residency', name: 'Data Residency', category: 'data_access',
    description: 'Restricts PII data access to eu-west-2 region only.',
    businessRationale: 'GDPR/UK DPA compliance. Customer PII must not leave UK/EU jurisdiction.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"ReadPII",\n  resource\n) unless {\n  context.region == "eu-west-2"\n};',
    lastTriggered: '2026-06-20T08:00:00Z', triggerCount30d: 0,
    impactIfRemoved: 'PII could be processed in non-compliant regions', impactPercentage: 0,
  },
  {
    id: 'kyc-model-allowlist', name: 'Model Allowlist', category: 'authorization',
    description: 'Only approved models: Claude Sonnet, Claude Haiku, Amazon Nova Pro.',
    businessRationale: 'Prevents use of untested or unapproved models that may not meet accuracy thresholds.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"InvokeModel",\n  resource\n) unless {\n  resource.model_id in [\n    "anthropic.claude-*",\n    "amazon.nova-pro-*"\n  ]\n};',
    lastTriggered: '2026-06-19T12:00:00Z', triggerCount30d: 2,
    impactIfRemoved: 'Unapproved models could be invoked for KYC decisions', impactPercentage: 0,
  },
  {
    id: 'kyc-rate-limit', name: 'Rate Limit', category: 'action_limits',
    description: 'Max 100 automated decisions per hour per agent instance.',
    businessRationale: 'Prevents runaway loops and controls blast radius of any misconfigured agent.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"AutoDecide",\n  resource\n) when {\n  context.decisions_this_hour > 100\n};',
    lastTriggered: '2026-06-18T15:30:00Z', triggerCount30d: 1,
    impactIfRemoved: 'A single agent could process unlimited decisions in a burst', impactPercentage: 0,
  },
  {
    id: 'kyc-confidence-threshold', name: 'Confidence Threshold', category: 'guardrails',
    description: 'Requires confidence > 0.85 for auto-approval; lower scores route to HITL.',
    businessRationale: 'Ensures only high-confidence decisions are automated. Uncertain cases get human judgement.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"AutoApprove",\n  resource\n) when {\n  resource.confidence < 0.85\n};',
    lastTriggered: '2026-06-22T10:45:00Z', triggerCount30d: 23,
    impactIfRemoved: '23 low-confidence decisions would be auto-approved', impactPercentage: 6,
  },
  {
    id: 'kyc-adverse-media-review', name: 'Adverse Media Review', category: 'guardrails',
    description: 'If adverse media count > 3, require human review regardless of other scores.',
    businessRationale: 'Multiple adverse media hits indicate elevated risk requiring human judgement.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"AutoDecide",\n  resource\n) when {\n  resource.adverse_media_count > 3\n};',
    lastTriggered: '2026-06-21T14:20:00Z', triggerCount30d: 5,
    impactIfRemoved: '5 customers with significant adverse media would bypass review', impactPercentage: 1,
  },
  {
    id: 'kyc-document-expiry', name: 'Document Expiry Check', category: 'data_access',
    description: 'Block decisions based on expired identity documents (>90 days old).',
    businessRationale: 'Ensures decisions are based on current, valid documentation.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"Assess",\n  resource\n) when {\n  resource.doc_age_days > 90\n};',
    lastTriggered: '2026-06-20T16:10:00Z', triggerCount30d: 11,
    impactIfRemoved: '11 assessments based on stale documents would proceed', impactPercentage: 3,
  },
  {
    id: 'kyc-multi-jurisdiction', name: 'Multi-Jurisdiction EDD', category: 'action_limits',
    description: 'Cross-border transactions require enhanced due diligence path.',
    businessRationale: 'Multi-jurisdiction customers have elevated money laundering risk per FATF guidance.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"StandardKYC",\n  resource\n) when {\n  resource.jurisdictions > 1\n};',
    lastTriggered: '2026-06-22T09:30:00Z', triggerCount30d: 19,
    impactIfRemoved: '19 cross-border customers would skip enhanced due diligence', impactPercentage: 5,
  },
  {
    id: 'kyc-audit-trail-required', name: 'Audit Trail Required', category: 'authorization',
    description: 'All decisions must have complete audit trail before finalisation.',
    businessRationale: 'Regulatory requirement: every AI decision must be explainable to an examiner.',
    status: 'active',
    cedarDsl: 'forbid(\n  principal,\n  action == Action::"Finalise",\n  resource\n) when {\n  resource.audit_steps_complete == false\n};',
    lastTriggered: '2026-06-22T17:00:00Z', triggerCount30d: 0,
    impactIfRemoved: 'Decisions could be finalised without complete audit records', impactPercentage: 0,
  },
];

export const policyEvalTraces: PolicyEvalTrace[] = [
  {
    decision_id: 'DEC-2026-0891', timestamp: '2026-06-22T16:45:00Z', customer_id: 'CUST047', action: 'KYC Assessment',
    final_decision: 'DENY', latency_ms: 12,
    policies_evaluated: [
      { policy_id: 'kyc-sanctions-hard-block', result: 'DENY', reason: 'Sanctions match: OFAC SDN 78%', duration_us: 120 },
      { policy_id: 'kyc-pep-escalation', result: 'DENY', reason: 'PEP Level 2 (score 0.82)', duration_us: 85 },
      { policy_id: 'kyc-confidence-threshold', result: 'DENY', reason: 'Confidence 0.41 < 0.85', duration_us: 45 },
      { policy_id: 'kyc-hallucination-guard', result: 'ALLOW', reason: 'Grounding score 0.96', duration_us: 90 },
      { policy_id: 'kyc-max-auto-approve', result: 'NOT_APPLICABLE', reason: 'Not an approval action', duration_us: 10 },
    ],
  },
  {
    decision_id: 'DEC-2026-0890', timestamp: '2026-06-22T15:30:00Z', customer_id: 'CUST012', action: 'KYC Assessment',
    final_decision: 'ALLOW', latency_ms: 8,
    policies_evaluated: [
      { policy_id: 'kyc-max-auto-approve', result: 'ALLOW', reason: 'Amount 5000 <= 10000', duration_us: 30 },
      { policy_id: 'kyc-sanctions-hard-block', result: 'ALLOW', reason: 'No sanctions match', duration_us: 25 },
      { policy_id: 'kyc-pep-escalation', result: 'ALLOW', reason: 'PEP score 0.0', duration_us: 20 },
      { policy_id: 'kyc-confidence-threshold', result: 'ALLOW', reason: 'Confidence 0.94 >= 0.85', duration_us: 15 },
      { policy_id: 'kyc-hallucination-guard', result: 'ALLOW', reason: 'Grounding score 0.97', duration_us: 18 },
    ],
  },
  {
    decision_id: 'DEC-2026-0887', timestamp: '2026-06-21T09:15:00Z', customer_id: 'CUST089', action: 'KYC Assessment',
    final_decision: 'DENY', latency_ms: 9,
    policies_evaluated: [
      { policy_id: 'kyc-pep-escalation', result: 'DENY', reason: 'PEP Level 1 (score 0.91)', duration_us: 55 },
      { policy_id: 'kyc-sanctions-hard-block', result: 'ALLOW', reason: 'No sanctions match', duration_us: 30 },
      { policy_id: 'kyc-confidence-threshold', result: 'ALLOW', reason: 'Confidence 0.88 >= 0.85', duration_us: 22 },
    ],
  },
  {
    decision_id: 'DEC-2026-0885', timestamp: '2026-06-21T08:00:00Z', customer_id: 'CUST023', action: 'KYC Assessment',
    final_decision: 'DENY', latency_ms: 7,
    policies_evaluated: [
      { policy_id: 'kyc-confidence-threshold', result: 'DENY', reason: 'Confidence 0.72 < 0.85', duration_us: 40 },
      { policy_id: 'kyc-sanctions-hard-block', result: 'ALLOW', reason: 'No sanctions match', duration_us: 20 },
      { policy_id: 'kyc-hallucination-guard', result: 'ALLOW', reason: 'Grounding score 0.93', duration_us: 35 },
    ],
  },
  {
    decision_id: 'DEC-2026-0882', timestamp: '2026-06-20T14:45:00Z', customer_id: 'CUST056', action: 'KYC Assessment',
    final_decision: 'DENY', latency_ms: 11,
    policies_evaluated: [
      { policy_id: 'kyc-multi-jurisdiction', result: 'DENY', reason: '3 jurisdictions (UK, BVI, Cyprus)', duration_us: 60 },
      { policy_id: 'kyc-adverse-media-review', result: 'DENY', reason: '5 adverse media articles', duration_us: 45 },
      { policy_id: 'kyc-sanctions-hard-block', result: 'ALLOW', reason: 'No direct sanctions match', duration_us: 25 },
    ],
  },
];

export const categoryLabels: Record<PolicyCategory, string> = {
  authorization: 'Authorization',
  guardrails: 'Guardrails',
  data_access: 'Data Access',
  action_limits: 'Action Limits',
};
