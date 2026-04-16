export interface Classification {
  category: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  sender_importance: number;
  topics: string[];
  actions_required: string[];
  deadlines: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface TriageResponse {
  entity_id: string;
  triage_id: string;
  timestamp: string;
  classification: Classification;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
