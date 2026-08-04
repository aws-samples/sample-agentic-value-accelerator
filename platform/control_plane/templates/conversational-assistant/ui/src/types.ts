export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolName?: string;
}

export interface ChatResponse {
  response: string;
  session_id: string;
}

export type SSEEvent =
  | { type: 'session'; session_id: string }
  | { type: 'token'; content: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_end'; name: string }
  | { type: 'done' };
