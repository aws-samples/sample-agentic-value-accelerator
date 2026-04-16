export interface RiskAssessment {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  recommendations: string[];
}

export interface FraudAlert {
  alert_id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: string[];
  recommended_actions: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  customer_id?: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface MonitoringResponse {
  customer_id: string;
  session_id: string;
  timestamp: string;
  risk_assessment: RiskAssessment;
  alerts: FraudAlert[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
