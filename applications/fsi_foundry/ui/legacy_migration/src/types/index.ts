export interface CodeAnalysis {
  languages_detected: string[];
  total_files: number;
  total_lines: number;
  complexity_level: string;
  dependencies: string[];
  patterns_identified: string[];
  risks: string[];
}

export interface MigrationPhase {
  name: string;
  description: string;
  estimated_days: number;
}

export interface MigrationPlan {
  phases: MigrationPhase[];
  estimated_effort_days: number;
  risk_assessment: string;
  dependency_order: string[];
  rollback_strategy: string;
}

export interface ConversionOutput {
  files_converted: number;
  conversion_confidence: number;
  patterns_converted: string[];
  manual_review_needed: string[];
  target_framework: string;
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface MigrationResponse {
  project_id: string;
  session_id: string;
  timestamp: string;
  code_analysis: CodeAnalysis;
  migration_plan: MigrationPlan;
  conversion_output: ConversionOutput;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
