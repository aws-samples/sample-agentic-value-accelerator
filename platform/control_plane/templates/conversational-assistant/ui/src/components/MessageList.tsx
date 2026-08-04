import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import MessageBubble from './MessageBubble';
import StreamingIndicator from './StreamingIndicator';

interface Props {
  messages: Message[];
  isStreaming: boolean;
}

export default function MessageList({ messages, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center text-gray-400">
          Send a message to start the conversation
        </div>
      )}
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
          <StreamingIndicator />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
