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

export interface MessageLogEntry {
  timestamp: string;
  from_agent: string;
  to_agent: string | null;
  message_type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface DeterministicChecks {
  sanctions?: { match: string; score: number; list: string };
  pep?: { level: number; source: string };
  adverse_media?: string[];
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
  message_log?: MessageLogEntry[];
  // BLOCKED response fields (Scenario B — policy engine override)
  status?: 'BLOCKED' | 'COMPLETE';
  decision?: 'APPROVE' | 'REJECT';
  block_reason?: string;
  policy_layer?: string;
  incident_id?: string;
  escalation_to?: string;
  deterministic_checks?: DeterministicChecks;
}
