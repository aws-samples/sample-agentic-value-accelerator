export interface Resolution {
  status: 'RESOLVED' | 'PENDING' | 'ESCALATED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  actions_taken: string[];
  follow_up_required: boolean;
  notes: string;
}

export interface RawAgentAnalysis {
  agent: string;
  customer_id?: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface ServiceResponse {
  customer_id: string;
  service_id: string;
  timestamp: string;
  resolution: Resolution;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
