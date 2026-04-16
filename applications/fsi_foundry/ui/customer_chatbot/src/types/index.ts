export interface ActionDetail {
  action_type: 'BALANCE_CHECK' | 'STATEMENT_REQUEST' | 'TRANSFER_INITIATED' | 'BILL_PAID' | 'PROFILE_UPDATED' | 'INFO_PROVIDED';
  description: string;
  status: 'ACTIVE' | 'RESOLVED' | 'ESCALATED' | 'PENDING';
  details: Record<string, unknown>;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface ChatResponse {
  customer_id: string;
  conversation_id: string;
  timestamp: string;
  response_message: string;
  actions_taken: ActionDetail[] | null;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
