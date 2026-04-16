export interface KeyMetric {
  label: string;
  value: string;
  change?: string;
  direction?: 'up' | 'down' | 'flat';
}

export interface EarningsOverview {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
  key_metrics: Record<string, string>;
  guidance_changes: string[];
  notable_quotes: string[];
  risks_identified: string[];
}

export interface SummarizationResponse {
  entity_id: string;
  session_id: string;
  timestamp: string;
  earnings_overview: EarningsOverview | null;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
