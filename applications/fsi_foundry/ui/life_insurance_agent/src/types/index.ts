export interface NeedsAnalysis {
  life_stage: string;
  recommended_coverage: number;
  coverage_gap: number;
  income_replacement_years: number;
  key_needs: string[];
  notes: string;
}

export interface ProductRecommendations {
  primary_product: string;
  recommended_products: string[];
  coverage_amount: number;
  estimated_premium: number;
  comparison_notes: string;
  notes: string;
}

export interface UnderwritingAssessment {
  risk_category: string;
  confidence_score: number;
  health_factors: string[];
  lifestyle_factors: string[];
  recommended_actions: string[];
  notes: string;
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface InsuranceResponse {
  entity_id: string;
  assessment_id: string;
  timestamp: string;
  needs_analysis: NeedsAnalysis | null;
  product_recommendations: ProductRecommendations | null;
  underwriting_assessment: UnderwritingAssessment | null;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
