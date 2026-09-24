export interface ReportConfig {
  frameworks: string[];
  dateRange: '7d' | '30d' | '90d' | 'custom';
  riskAppetite: 'conservative' | 'balanced' | 'progressive';
  scope: 'kyc' | 'all';
  sections: string[];
}

export const defaultConfig: ReportConfig = {
  frameworks: ['CRI', 'NIST'],
  dateRange: '30d',
  riskAppetite: 'balanced',
  scope: 'kyc',
  sections: ['executive-summary', 'risk-register', 'control-mapping', 'gap-analysis', 'evidence-completeness', 'decision-traces', 'hitl-stats', 'recommendations', 'appendix'],
};

export const sectionLabels: Record<string, string> = {
  'executive-summary': 'Executive Summary',
  'risk-register': 'Risk Register Snapshot',
  'control-mapping': 'Control Mapping Coverage',
  'gap-analysis': 'Gap Analysis',
  'evidence-completeness': 'Evidence Completeness Score',
  'decision-traces': 'Decision Trace Summary',
  'hitl-stats': 'HITL Escalation Statistics',
  'recommendations': 'Recommendations',
  'appendix': 'Appendix: Full Control List',
};

export const frameworkOptions = [
  { id: 'CRI', label: 'CRI v2.0' },
  { id: 'NIST', label: 'NIST AI RMF' },
  { id: 'ISO42001', label: 'ISO 42001' },
  { id: 'EU_AI_ACT', label: 'EU AI Act' },
  { id: 'FCA', label: 'FCA Handbook' },
];

export interface ReportRecommendation {
  priority: 'P1' | 'P2' | 'P3';
  description: string;
  rationale: string;
  owner: string;
}

export const sampleRecommendations: ReportRecommendation[] = [
  { priority: 'P1', description: 'Deploy Automated Reasoning (Cedar formal verification)', rationale: 'Grounding score at 94% — formal verification would increase to 99%+ for critical claims', owner: 'Engineering Lead' },
  { priority: 'P1', description: 'Refresh adverse media data pipeline (<7 day SLA)', rationale: 'Evidence Pack #47 flagged stale adverse media (8 days). Breach of internal 7-day policy', owner: 'Data Operations' },
  { priority: 'P2', description: 'Implement change advisory board for AI model updates', rationale: 'ISO 42001 gap (ISO-6.3): no formal change control for model version deployments', owner: 'CTO Office' },
  { priority: 'P2', description: 'Complete bias impact assessment for input data', rationale: 'EU AI Act Art 10.3 partial compliance. Input data bias assessment incomplete', owner: 'RAI Lead' },
  { priority: 'P3', description: 'Establish Board-level AI risk reporting cadence', rationale: 'CRI GV.OV-05 warning: Board presentation scheduled but not yet delivered', owner: 'CRO' },
];

export const reportMetadata = {
  version: 'v0.20',
  classification: 'INTERNAL \u2014 AUDIT COMMITTEE USE ONLY',
  generatedBy: 'j.thompson@bankco.com via FSI Governance Console',
};
