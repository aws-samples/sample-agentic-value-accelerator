export interface RequirementAnalysis {
  functional_requirements: string[];
  non_functional_requirements: string[];
  dependencies: string[];
  technical_specifications: string[];
  data_models: string[];
  api_contracts: string[];
  risks: string[];
}

export interface ScaffoldedCode {
  files_generated: number;
  project_structure: string[];
  design_patterns_applied: string[];
  code_quality: string;
  boilerplate_components: string[];
  configuration_files: string[];
}

export interface TestOutput {
  unit_tests_generated: number;
  integration_tests_generated: number;
  test_coverage_estimate: string;
  test_frameworks_used: string[];
  test_fixtures_created: string[];
  manual_testing_notes: string;
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface GenerationResponse {
  project_id: string;
  generation_id: string;
  timestamp: string;
  requirement_analysis: RequirementAnalysis;
  scaffolded_code: ScaffoldedCode;
  test_output: TestOutput;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
