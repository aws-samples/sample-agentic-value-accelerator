"use client";

import { useState, isValidElement, ReactNode } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, ExternalLink } from "lucide-react";

/**
 * Markdown renderer for assistant chat responses.
 *
 * Pipeline:
 *   - remark-gfm:        GitHub-flavored markdown (tables, task lists, strikethrough, autolinks)
 *   - rehype-highlight:  syntax highlighting for fenced code blocks (auto language detection)
 *
 * Every node type is mapped to a tailwind-styled component so the rendering
 * matches the rest of the UI (dark surfaces, accent dots, premium tables).
 *
 * The renderer is XSS-safe by default: react-markdown does not allow raw HTML
 * unless `rehype-raw` is added. We intentionally do not enable it.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body min-w-0 break-words text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode }).children;
    return extractText(children);
  }
  return "";
}

/* ------------------------------- code block ------------------------------- */

function CodeBlock({
  children,
  className,
  language,
}: {
  children: ReactNode;
  className?: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractText(children));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g., insecure context) — fail silently.
    }
  };

  return (
    <div className="group my-3 min-w-0 overflow-hidden rounded-xl border border-ink-700/70 bg-[#0a0f1c]">
      <div className="flex items-center justify-between border-b border-ink-700/70 bg-ink-900/70 px-3 py-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-ink-700/60 hover:text-slate-200"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent-soft" />
              <span className="text-accent-soft">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

/* ----------------------------- node components ---------------------------- */

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-xl font-bold text-white first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-lg font-bold text-white first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-base font-semibold text-white first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-[15px] font-semibold text-white first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-1 mt-2 text-sm font-semibold uppercase tracking-wider text-slate-300 first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wider text-slate-400 first:mt-0">
      {children}
    </h6>
  ),

  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,

  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
  del: ({ children }) => (
    <del className="text-slate-500 decoration-slate-500">{children}</del>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-0.5 font-medium text-accent-soft underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
    >
      {children}
      <ExternalLink className="h-3 w-3 self-center opacity-70" aria-hidden />
    </a>
  ),

  hr: () => <hr className="my-4 border-0 border-t border-ink-700/70" />,

  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-2 border-accent/60 bg-accent/5 px-4 py-2 text-slate-300">
      {children}
    </blockquote>
  ),

  ul: ({ children }) => (
    <ul className="md-ul my-2 space-y-1.5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="md-ol my-2 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-electric-soft first:mt-0 last:mb-0">
      {children}
    </ol>
  ),

  li: ({ children, className }) => {
    // Task list item — remark-gfm tags it with className "task-list-item"
    if (className?.includes("task-list-item")) {
      return (
        <li className="task-list-item flex items-start gap-2 leading-relaxed">
          <TaskCheckbox checked={isCheckedTask(children)} />
          <span className="flex-1">{stripCheckboxInput(children)}</span>
        </li>
      );
    }
    return <li className="leading-relaxed">{children}</li>;
  },

  table: ({ children }) => (
    <div className="scroll-thin my-3 overflow-x-auto rounded-xl border border-ink-700/70 bg-ink-850/60">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink-700/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-t border-ink-600/50 transition-colors first:border-t-0 hover:bg-ink-700/30">
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-3 py-2 align-top text-slate-300">
      {children}
    </td>
  ),

  // Unwrap <pre> so our CodeBlock owns the wrapping element.
  pre: ({ children }) => <>{children}</>,

  code: (props) => {
    const { className, children } = props;
    const text = extractText(children);
    const langMatch = /language-(\w+)/.exec(className || "");
    const isBlock = Boolean(langMatch) || text.includes("\n");

    if (isBlock) {
      return (
        <CodeBlock language={langMatch?.[1]} className={className}>
          {children}
        </CodeBlock>
      );
    }

    return (
      <code className="rounded bg-ink-700/70 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-soft">
        {children}
      </code>
    );
  },
};

/* ------------------------------ task helpers ------------------------------ */

function isCheckedTask(children: ReactNode): boolean {
  let checked = false;
  const visit = (node: ReactNode) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (isValidElement(node)) {
      const props = node.props as { type?: string; checked?: boolean; children?: ReactNode };
      if (props.type === "checkbox" && props.checked) {
        checked = true;
      }
      visit(props.children);
    }
  };
  visit(children);
  return checked;
}

function stripCheckboxInput(children: ReactNode): ReactNode {
  if (Array.isArray(children)) {
    return children.filter((c) => {
      if (isValidElement(c)) {
        const props = c.props as { type?: string };
        return props.type !== "checkbox";
      }
      return true;
    });
  }
  return children;
}

function TaskCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
        checked
          ? "border-accent bg-accent text-white"
          : "border-slate-500 bg-ink-850"
      }`}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}
