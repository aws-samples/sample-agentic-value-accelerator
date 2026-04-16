export interface Transcription {
  speaker_count: number;
  duration_seconds: number;
  key_topics: string[];
  transcript_summary: string;
}

export interface Sentiment {
  overall_sentiment: string;
  customer_sentiment: string;
  agent_sentiment: string;
  satisfaction_score: number;
  emotional_shifts: string[];
}

export interface ActionItem {
  description: string;
  assignee: string;
  priority: string;
  deadline: string;
  status: string;
}

export interface RawAgentAnalysis {
  agent: string;
  analysis?: string;
  assessment?: string;
  [key: string]: unknown;
}

export interface PostCallResponse {
  call_id: string;
  session_id: string;
  timestamp: string;
  transcription: Transcription;
  sentiment: Sentiment;
  action_items: ActionItem[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
