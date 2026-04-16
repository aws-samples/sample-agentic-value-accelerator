export interface MediaFinding {
  articles_screened: number;
  adverse_mentions: number;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
  categories: string[];
  key_findings: string[];
  sources: string[];
}

export interface RiskSignal {
  signal_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  description: string;
  source_references: string[];
  entity_linkage: string;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface ScreeningResponse {
  entity_id: string;
  screening_id: string;
  timestamp: string;
  media_findings: MediaFinding | null;
  risk_signals: RiskSignal[] | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
