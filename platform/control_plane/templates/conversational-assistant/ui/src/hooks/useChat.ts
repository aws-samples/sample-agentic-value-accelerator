import { useCallback, useRef, useState } from 'react';
import { streamMessage } from '../api/client';
import type { Message } from '../types';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      await streamMessage(trimmed, sessionRef.current, (event) => {
        switch (event.type) {
          case 'session':
            sessionRef.current = event.session_id;
            setSessionId(event.session_id);
            break;
          case 'token':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.content } : m,
              ),
            );
            break;
          case 'tool_start':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolName: event.name } : m,
              ),
            );
            break;
          case 'tool_end':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolName: undefined } : m,
              ),
            );
            break;
          case 'done':
            break;
        }
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    sessionRef.current = null;
  }, []);

  return { messages, isStreaming, sessionId, sendMessage, clearChat };
}
