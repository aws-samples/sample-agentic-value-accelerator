export interface ExceptionResolution {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  resolution: string;
  actions_taken: string[];
  requires_escalation: boolean;
}

export interface SettlementResult {
  status: 'PENDING' | 'SETTLED' | 'FAILED' | 'REQUIRES_ACTION';
  settlement_date: string | null;
  reconciled: boolean;
  notes: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface OperationsResponse {
  customer_id: string;
  operation_id: string;
  timestamp: string;
  exception_resolution: ExceptionResolution | null;
  settlement_result: SettlementResult | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
