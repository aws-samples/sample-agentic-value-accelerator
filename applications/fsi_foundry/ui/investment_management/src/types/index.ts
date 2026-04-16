export interface PortfolioAnalysis {
  risk_profile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' | 'ULTRA_AGGRESSIVE';
  rebalance_urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  drift_pct: number;
  allocation_score: number;
  attribution_factors: Record<string, number>;
  trade_recommendations: TradeRecommendation[];
}

export interface TradeRecommendation {
  action: 'BUY' | 'SELL' | 'HOLD';
  asset: string;
  weight_current: number;
  weight_target: number;
  rationale: string;
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

export interface ManagementResponse {
  entity_id: string;
  assessment_id: string;
  timestamp: string;
  portfolio_analysis: PortfolioAnalysis | null;
  recommendations: Recommendation[] | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
