export interface TradePattern {
  patterns_detected: string[];
  risk_score: number;
  anomalies: string[];
  notes: string;
}

export interface CommsMonitor {
  flagged_communications: string[];
  risk_indicators: string[];
  compliance_concerns: string[];
}

export interface SurveillanceAlert {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  alert_type: string;
  recommended_actions: string[];
  escalation_required: boolean;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface SurveillanceResponse {
  entity_id: string;
  surveillance_id: string;
  timestamp: string;
  trade_pattern: TradePattern | null;
  comms_monitor: CommsMonitor | null;
  alert: SurveillanceAlert | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
