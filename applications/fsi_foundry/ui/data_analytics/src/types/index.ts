export interface AnalyticsDetail {
  data_quality: string;
  insight_confidence: string;
  patterns_identified: number;
  statistical_findings: string[];
  visualization_suggestions: string[];
  data_coverage_pct: number;
}

export interface RawAgentAnalysis {
  agent: string;
  entity_id?: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface AnalyticsResponse {
  entity_id: string;
  analytics_id: string;
  timestamp: string;
  analytics_detail: AnalyticsDetail;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
