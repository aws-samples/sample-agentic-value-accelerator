import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '../types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-800 shadow-sm border border-gray-200'
        }`}
      >
        {message.toolName && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-gray-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Using {message.toolName}…
          </div>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-pre:p-0 prose-pre:bg-transparent">
            <Markdown
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className ?? '');
                  const code = String(children).replace(/\n$/, '');
                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={oneLight}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-lg text-sm"
                      >
                        {code}
                      </SyntaxHighlighter>
                    );
                  }
                  return (
                    <code className="rounded bg-gray-100 px-1 py-0.5 text-sm" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
