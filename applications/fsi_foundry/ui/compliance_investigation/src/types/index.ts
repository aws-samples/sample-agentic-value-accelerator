export interface InvestigationResponse {
  investigation_status: string;
  findings_count: number;
  key_findings: string[];
  regulatory_violations: string[];
  recommended_actions: string[];
  summary: string;
  raw_agent_analysis?: Record<string, RawAgentAnalysis>;
  // Also support nested format if backend changes
  entity_id?: string;
  investigation_id?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  [key: string]: unknown;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
