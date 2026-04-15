export interface TaskResult {
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  output_data: Record<string, unknown>;
  actions_performed: string[];
  follow_up_items: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface AssistantResponse {
  employee_id: string;
  task_id: string;
  timestamp: string;
  result: TaskResult | null;
  recommendations: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
