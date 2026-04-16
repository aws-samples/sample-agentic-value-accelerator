export interface RegulatoryMapping {
  regulation: string;
  requirement: string;
  violation_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  evidence_references: string[];
}

export interface InvestigationFindings {
  status: 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
  violations_found: number;
  evidence_items: string[];
  patterns_identified: string[];
  risk_indicators: string[];
  recommendations: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface InvestigationResponse {
  entity_id: string;
  investigation_id: string;
  timestamp: string;
  findings: InvestigationFindings | null;
  regulatory_mappings: RegulatoryMapping[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
