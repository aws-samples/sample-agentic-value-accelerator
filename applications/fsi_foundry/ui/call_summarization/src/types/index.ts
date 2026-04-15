export interface KeyPointsResult {
  key_points: string[];
  call_outcome: string;
  topics_discussed: string[];
}

export interface SummaryResult {
  executive_summary: string;
  action_items: string[];
  customer_sentiment: string;
  audience_level: string;
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface SummarizationResponse {
  call_id: string;
  session_id: string;
  timestamp: string;
  key_points: KeyPointsResult;
  summary_result: SummaryResult;
  overall_summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
