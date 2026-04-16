export interface ChurnPrediction {
  risk_level: string;
  churn_probability: number;
  risk_factors: string[];
  behavioral_signals: string[];
  retention_window_days: number;
  notes: string;
}

export interface OutreachPlan {
  recommended_channel: string;
  secondary_channels: string[];
  messaging_theme: string;
  talking_points: string[];
  optimal_timing: string;
  personalization_elements: string[];
  notes: string;
}

export interface PolicyRecommendations {
  recommended_actions: string[];
  coverage_adjustments: string[];
  bundling_opportunities: string[];
  estimated_savings: string;
  value_improvements: string[];
  notes: string;
}

export interface RawAgentAnalysis {
  agent: string;
  customer_id?: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface EngagementResponse {
  customer_id: string;
  engagement_id: string;
  timestamp: string;
  churn_prediction: ChurnPrediction;
  outreach_plan: OutreachPlan;
  policy_recommendations: PolicyRecommendations;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
