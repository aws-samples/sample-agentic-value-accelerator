export interface QualityIssue {
  description: string;
  severity: string;
  call_id: string;
}

export interface ComplianceViolation {
  description: string;
  regulation: string;
  call_id: string;
}

export interface CallMonitoring {
  overall_quality: number;
  average_sentiment: number;
  compliance_score: number;
  calls_reviewed: number;
  quality_issues: QualityIssue[];
  compliance_violations: ComplianceViolation[];
  notes: string;
}

export interface PerformanceMetrics {
  average_handle_time: number;
  first_call_resolution_rate: number;
  customer_satisfaction_score: number;
  coaching_priority: string;
  top_performers: string[];
  coaching_opportunities: string[];
  kpi_summary: Record<string, string | number>;
  notes: string;
}

export interface OperationalInsights {
  call_volume_trend: string;
  peak_hours: string[];
  bottlenecks: string[];
  staffing_recommendations: string[];
  process_improvements: string[];
  forecast_summary: string;
  notes: string;
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface AnalyticsResponse {
  call_center_id: string;
  session_id: string;
  timestamp: string;
  call_monitoring: CallMonitoring;
  performance_metrics: PerformanceMetrics;
  operational_insights: OperationalInsights;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
