import { useChat } from '../hooks/useChat';
import ChatInput from './ChatInput';
import MessageList from './MessageList';

export default function ChatLayout() {
  const { messages, isStreaming, sendMessage, clearChat } = useChat();

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-800">Conversational Assistant</h1>
        <button
          onClick={clearChat}
          className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Clear conversation"
        >
          Clear
        </button>
      </header>

      <MessageList messages={messages} isStreaming={isStreaming} />
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
