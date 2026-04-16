export interface PortfolioAnalysis {
  risk_level: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' | 'VERY_AGGRESSIVE';
  asset_allocation: Record<string, number>;
  performance_summary: string;
  rebalancing_needed: boolean;
  concentration_risks: string[];
}

export interface Recommendation {
  action: string;
  rationale: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  asset_class?: string;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface AdvisoryResponse {
  client_id: string;
  advisory_id: string;
  timestamp: string;
  portfolio_analysis: PortfolioAnalysis | null;
  recommendations: Recommendation[] | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
