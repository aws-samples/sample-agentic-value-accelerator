export interface InsightsDetail {
  signal_strength: number;
  scenario_likelihood: number;
  signals_identified: SignalItem[];
  cross_asset_opportunities: CrossAssetOpportunity[];
  scenario_outcomes: ScenarioOutcome[];
  confidence_score: number;
}

export interface SignalItem {
  name: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  asset_class: string;
  strength: number;
  description: string;
}

export interface CrossAssetOpportunity {
  pair: string;
  correlation: number;
  direction: 'LONG' | 'SHORT' | 'PAIR';
  expected_return: number;
  rationale: string;
}

export interface ScenarioOutcome {
  scenario: string;
  likelihood: number;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  expected_move: number;
  description: string;
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

export interface InsightsResponse {
  entity_id: string;
  assessment_id: string;
  timestamp: string;
  insights_detail: InsightsDetail | null;
  recommendations: Recommendation[] | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
