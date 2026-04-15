export interface LeadScore {
  score: number;
  tier: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  factors: string[];
  recommendations: string[];
}

export interface OpportunityDetail {
  stage: 'PROSPECTING' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';
  confidence: number;
  estimated_value: number;
  key_drivers: string[];
  risks: string[];
  next_steps: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface SalesResponse {
  customer_id: string;
  assessment_id: string;
  timestamp: string;
  lead_score: LeadScore | null;
  opportunity: OpportunityDetail | null;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
