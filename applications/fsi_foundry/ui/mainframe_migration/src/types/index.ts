export interface MainframeAnalysis {
  programs_analyzed: number;
  jcl_jobs_analyzed: number;
  copybooks_found: number;
  total_lines: number;
  complexity_level: string;
  dependencies: string[];
  risks: string[];
}

export interface BusinessRules {
  rules_extracted: number;
  validation_rules: string[];
  computational_formulas: string[];
  extraction_confidence: string;
  manual_review_items: string[];
}

export interface CloudCode {
  files_generated: number;
  target_language: string;
  generation_quality_score: string;
  functional_equivalence_score: string;
  services_mapped: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface MainframeMigrationResponse {
  project_id: string;
  migration_id: string;
  timestamp: string;
  mainframe_analysis: MainframeAnalysis;
  business_rules: BusinessRules;
  cloud_code: CloudCode;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
