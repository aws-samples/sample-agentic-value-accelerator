import type { ChatResponse, SSEEvent } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function sendMessage(message: string, sessionId?: string): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
  return res.json() as Promise<ChatResponse>;
}

export async function streamMessage(
  message: string,
  sessionId: string | null,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  if (!res.ok) throw new Error(`Stream request failed: ${res.status}`);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as SSEEvent);
      } catch {
        // skip malformed events
      }
    }
  }
}
