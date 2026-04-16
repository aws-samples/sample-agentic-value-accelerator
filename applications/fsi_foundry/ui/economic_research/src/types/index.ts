export interface EconomicOverview {
  primary_indicator: string;
  trend_direction: 'UP' | 'DOWN' | 'STABLE' | 'VOLATILE';
  data_sources_used: string[];
  key_findings: Record<string, string>;
  correlations_identified: string[];
  forecast_horizon: string;
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

export interface ResearchResponse {
  entity_id: string;
  research_id: string;
  timestamp: string;
  economic_overview: EconomicOverview | null;
  recommendations: Recommendation[] | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
