export interface RiskScore {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  recommendations: string[];
}

export interface ComplianceStatus {
  status: 'compliant' | 'non_compliant' | 'review_required';
  checks_passed: string[];
  checks_failed: string[];
  regulatory_notes: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  customer_id?: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface KYCResponse {
  customer_id: string;
  assessment_id: string;
  timestamp: string;
  credit_risk: RiskScore | null;
  compliance: ComplianceStatus | null;
  summary: string;
  raw_analysis: {
    credit_analysis?: RawAgentAnalysis;
    compliance_check?: RawAgentAnalysis;
  };
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
