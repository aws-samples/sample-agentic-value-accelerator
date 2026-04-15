export interface ValidationResult {
  status: 'approved' | 'rejected' | 'requires_review';
  rules_checked: string[];
  violations: string[];
  sanctions_clear: boolean;
  risk_score: number;
  notes: string[];
}

export interface RoutingDecision {
  selected_rail: 'fedwire' | 'ach' | 'rtp' | 'swift' | 'sepa';
  alternative_rails: string[];
  estimated_settlement_time: string;
  routing_cost: number;
  routing_rationale: string;
}

export interface PaymentResponse {
  payment_id: string;
  transaction_id: string;
  timestamp: string;
  validation_result: ValidationResult | null;
  routing_decision: RoutingDecision | null;
  reconciliation_status: 'matched' | 'unmatched' | 'discrepancy' | 'pending' | null;
  summary: string;
  raw_analysis: Record<string, unknown>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
