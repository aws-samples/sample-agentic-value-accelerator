export interface KeyRatio {
  name: string;
  value: string;
  benchmark: string;
  status: 'strong' | 'adequate' | 'weak';
}

export interface CreditAnalysis {
  rating: string;
  memo_format: string;
  confidence_score: number;
  key_ratios: KeyRatio[];
  risk_factors: string[];
  peer_comparison_notes: string[];
}

export interface Recommendation {
  title: string;
  rationale: string;
  confidence: number;
  timeframe: string;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface MemoResponse {
  entity_id: string;
  research_id: string;
  timestamp: string;
  credit_analysis: CreditAnalysis | null;
  recommendations: Recommendation[] | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
