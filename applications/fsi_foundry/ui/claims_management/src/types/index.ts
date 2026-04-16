export interface IntakeSummary {
  claim_type: string;
  status: string;
  documentation_complete: boolean;
  missing_documents: string[];
  key_details: Record<string, string>;
  notes: string;
}

export interface DamageAssessment {
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  estimated_repair_cost: number;
  estimated_replacement_cost: number;
  evidence_quality: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
  findings: string[];
  notes: string;
}

export interface SettlementRecommendation {
  recommended_amount: number;
  confidence_score: number;
  policy_coverage_applicable: string[];
  justification: string;
  comparable_settlements: ComparableSettlement[];
  notes: string;
}

export interface ComparableSettlement {
  claim_id: string;
  amount: number;
  similarity_score: number;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface ClaimResponse {
  entity_id: string;
  assessment_id: string;
  timestamp: string;
  intake_summary: IntakeSummary | null;
  damage_assessment: DamageAssessment | null;
  settlement_recommendation: SettlementRecommendation | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
