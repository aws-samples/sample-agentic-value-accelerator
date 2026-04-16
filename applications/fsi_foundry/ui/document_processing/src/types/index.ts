export interface Classification {
  type: string;
  confidence: number;
  jurisdiction: string;
  regulatory_relevance: string;
}

export interface ExtractedData {
  fields: Record<string, string>;
  entities: string[];
  amounts: string[];
  dates: string[];
}

export interface ValidationResult {
  status: 'PASSED' | 'FAILED' | 'PARTIAL';
  checks_passed: string[];
  checks_failed: string[];
  notes: string;
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface ProcessingResponse {
  document_id: string;
  processing_id: string;
  timestamp: string;
  classification: Classification;
  extracted_data: ExtractedData;
  validation_result: ValidationResult;
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
