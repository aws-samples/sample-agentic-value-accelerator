export interface OfferResult {
  status: 'GENERATED' | 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
  offers: string[];
  personalization_score: number;
  notes: string[];
}

export interface FulfillmentResult {
  status: 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
  channel: string;
  steps_completed: string[];
  blockers: string[];
}

export interface MatchResult {
  matched_products: string[];
  confidence_scores: Record<string, number>;
  recommendations: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface CommerceResponse {
  customer_id: string;
  commerce_id: string;
  timestamp: string;
  offer_result: OfferResult | null;
  fulfillment_result: FulfillmentResult | null;
  match_result: MatchResult | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
