import { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}

const CEDAR_EXAMPLES = [
  {
    label: 'Forbid tool',
    code: `forbid(
  principal,
  action,
  resource is AgentCore::Gateway
) when {
  context has tool_name && context.tool_name == "bash_executor"
};`,
  },
  {
    label: 'Require guardrail',
    code: `forbid(
  principal,
  action,
  resource is AgentCore::Gateway
) when {
  !(context has guardrail_attached) || context.guardrail_attached == false
};`,
  },
  {
    label: 'Deny model',
    code: `forbid(
  principal,
  action,
  resource is AgentCore::Gateway
) when {
  context has model_id && context.model_id like "*opus*"
};`,
  },
  {
    label: 'Permit all',
    code: `permit(
  principal,
  action,
  resource is AgentCore::Gateway
);`,
  },
  {
    label: 'Conditional forbid (multiple)',
    code: `forbid(
  principal,
  action,
  resource is AgentCore::Gateway
) when {
  (context has tool_name && context.tool_name == "bash_executor")
  || (context has tool_name && context.tool_name == "file_write")
  || (!(context has guardrail_attached) || context.guardrail_attached == false)
};`,
  },
];

export default function CedarEditor({ value, onChange, readOnly = false, height = '400px' }: Props) {
  const editorRef = useRef<any>(null);

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Register Cedar language
    monaco.languages.register({ id: 'cedar' });

    // Cedar tokenization
    monaco.languages.setMonarchTokensProvider('cedar', {
      keywords: ['permit', 'forbid', 'when', 'unless', 'if', 'then', 'else', 'in', 'like', 'has', 'is'],
      typeKeywords: ['principal', 'action', 'resource', 'context', 'true', 'false'],
      operators: ['==', '!=', '<', '>', '<=', '>=', '&&', '||', '!'],

      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/\b(permit|forbid|when|unless|if|then|else|in|like|has|is)\b/, 'keyword'],
          [/\b(principal|action|resource|context|true|false)\b/, 'type'],
          [/\b(AgentCore|Gateway|Runtime|PolicyEngine)\b/, 'type.identifier'],
          [/[a-zA-Z_]\w*/, 'identifier'],
          [/[{}()[\]]/, '@brackets'],
          [/[;,.]/, 'delimiter'],
          [/&&|\|\||!|==|!=|<=|>=|<|>/, 'operator'],
          [/\d+/, 'number'],
          [/\*/, 'operator'],
        ],
        comment: [
          [/[^/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[/*]/, 'comment'],
        ],
      },
    });

    // Theme
    monaco.editor.defineTheme('cedar-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c586c0', fontStyle: 'bold' },
        { token: 'type', foreground: '4ec9b0' },
        { token: 'type.identifier', foreground: '4fc1ff' },
        { token: 'string', foreground: 'ce9178' },
        { token: 'comment', foreground: '6a9955' },
        { token: 'operator', foreground: 'd4d4d4' },
        { token: 'number', foreground: 'b5cea8' },
        { token: 'identifier', foreground: '9cdcfe' },
      ],
      colors: {
        'editor.background': '#1e1e2e',
        'editor.foreground': '#d4d4d4',
        'editorLineNumber.foreground': '#5a5a7a',
        'editorCursor.foreground': '#a6e3a1',
        'editor.selectionBackground': '#44475a',
      },
    });

    monaco.editor.setTheme('cedar-dark');

    // Completions
    monaco.languages.registerCompletionItemProvider('cedar', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          { label: 'permit', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'permit(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n)', range },
          { label: 'forbid', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n  $0\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
          { label: 'when', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'when {\n  $0\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
          { label: 'unless', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'unless {\n  $0\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
          { label: 'context has', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'context has ${1:attribute}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
          { label: 'context.tool_name', kind: monaco.languages.CompletionItemKind.Property, insertText: 'context.tool_name', range },
          { label: 'context.model_id', kind: monaco.languages.CompletionItemKind.Property, insertText: 'context.model_id', range },
          { label: 'context.guardrail_attached', kind: monaco.languages.CompletionItemKind.Property, insertText: 'context.guardrail_attached', range },
          { label: 'AgentCore::Gateway', kind: monaco.languages.CompletionItemKind.Class, insertText: 'AgentCore::Gateway', range },
          { label: 'like', kind: monaco.languages.CompletionItemKind.Operator, insertText: 'like "*${1:pattern}*"', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
          { label: 'principal', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'principal', range },
          { label: 'action', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'action', range },
          { label: 'resource', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'resource', range },
        ];

        return { suggestions };
      },
    });
  };

  const insertSnippet = useCallback((code: string) => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue();
      const newValue = currentValue ? `${currentValue}\n\n${code}` : code;
      onChange(newValue);
    } else {
      const newValue = value ? `${value}\n\n${code}` : code;
      onChange(newValue);
    }
  }, [value, onChange]);

  return (
    <div className="space-y-3">
      {/* Snippet buttons */}
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Insert:</span>
          {CEDAR_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => insertSnippet(ex.code)}
              className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600 rounded-md transition-colors border border-slate-200 hover:border-indigo-200"
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="rounded-xl overflow-hidden border border-slate-700/50 shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e2e] border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-[11px] text-slate-400 font-mono ml-2">policy.cedar</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Cedar Policy Language</span>
        </div>
        <Editor
          height={height}
          language="cedar"
          theme="cedar-dark"
          value={value}
          onChange={(v) => onChange(v || '')}
          onMount={handleEditorMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 22,
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            renderLineHighlight: 'gutter',
            folding: true,
            lineNumbers: 'on',
            glyphMargin: false,
          }}
        />
      </div>

      {/* Reference */}
      {!readOnly && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Cedar Quick Reference</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-600">
            <div><code className="text-indigo-600">forbid(...) when {"{ }"}</code> — block when condition true</div>
            <div><code className="text-indigo-600">permit(...)</code> — allow access</div>
            <div><code className="text-indigo-600">context has X</code> — check attribute exists</div>
            <div><code className="text-indigo-600">context.X == "val"</code> — exact match</div>
            <div><code className="text-indigo-600">context.X like "*pat*"</code> — wildcard match</div>
            <div><code className="text-indigo-600">{"&&"} / {"||"} / !</code> — logical operators</div>
            <div><code className="text-indigo-600">unless {"{ }"}</code> — block unless condition</div>
            <div><code className="text-indigo-600">resource is Type</code> — type constraint</div>
          </div>
        </div>
      )}
    </div>
  );
}
