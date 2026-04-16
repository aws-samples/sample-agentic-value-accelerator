export interface AgentRequest {
  [key: string]: string | undefined;
}

export interface AgentResponse {
  customer_id?: string;
  entity_id?: string;
  assessment_id?: string;
  monitoring_id?: string;
  service_id?: string;
  management_id?: string;
  surveillance_id?: string;
  timestamp?: string;
  summary?: string;
  recommendations?: string[];
  credit_risk_score?: {
    score: number;
    level: string;
    rating: string;
    probability_of_default: number;
    loss_given_default: number;
    factors: string[];
    recommendations: string[];
  };
  portfolio_impact?: {
    concentration_change: number;
    diversification_score: number;
    sector_exposure: string;
    risk_adjusted_return: number;
    notes: string[];
  };
  risk_assessment?: {
    score: number;
    level: string;
    factors: string[];
  };
  raw_analysis?: Record<string, RawAgentAnalysis>;
  [key: string]: unknown;
}

export interface RawAgentAnalysis {
  agent: string;
  customer_id?: string;
  entity_id?: string;
  analysis?: string;
  scoring?: string;
  portfolio?: string;
  [key: string]: unknown;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
