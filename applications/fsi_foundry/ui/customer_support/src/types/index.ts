export interface TicketClassification {
  category: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  required_expertise: string[];
  tags: string[];
}

export interface ResolutionSuggestion {
  suggested_resolution: string;
  confidence: number;
  similar_cases: string[];
  steps: string[];
  knowledge_base_refs: string[];
}

export interface EscalationDecision {
  status: 'NOT_NEEDED' | 'RECOMMENDED' | 'REQUIRED';
  reason: string;
  recommended_team: string;
  priority_override: boolean;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface SupportResponse {
  customer_id: string;
  ticket_id: string;
  timestamp: string;
  classification: TicketClassification | null;
  resolution: ResolutionSuggestion | null;
  escalation: EscalationDecision | null;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
