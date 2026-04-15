export interface SearchResult {
  document_id: string;
  title: string;
  snippet: string;
  relevance: 'high' | 'medium' | 'low';
  document_type: string;
  status: 'active' | 'archived' | 'draft' | 'superseded';
}

export interface SearchResponse {
  query: string;
  search_id: string;
  timestamp: string;
  results: SearchResult[];
  relevance_scores: number[];
  summary: string;
  raw_analysis: Record<string, unknown>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
