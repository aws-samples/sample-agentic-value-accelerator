import { Fragment, type JSX } from 'react';

interface Props {
  markdown: string;
}

/**
 * Minimal markdown renderer.
 *
 * Intentionally scoped to the subset the App Factory docs-builder subagent is
 * prompted to emit: H2 headings, paragraphs, bullet lists, inline **bold** /
 * *italic* / `code`. No tables, links, images, code fences, or nested lists.
 *
 * Keeping this inline avoids pulling react-markdown (+remark) into the bundle
 * for a single use case. If the supported subset grows, replace with a real
 * library rather than bolting on patches here.
 */
export default function MarkdownRenderer({ markdown }: Props) {
  const blocks = parseBlocks(markdown.replace(/\r\n?/g, '\n'));
  return (
    <div className="space-y-3 text-slate-700 leading-relaxed">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

function parseBlocks(src: string): Block[] {
  const chunks = src.split(/\n\s*\n+/);
  const blocks: Block[] = [];
  for (const raw of chunks) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const lines = chunk.split('\n');
    if (lines[0].startsWith('## ')) {
      blocks.push({ kind: 'heading', text: lines[0].slice(3).trim() });
      const rest = lines.slice(1).join('\n').trim();
      if (rest) blocks.push(...parseBlocks(rest));
      continue;
    }
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      blocks.push({
        kind: 'list',
        items: lines.map((l) => l.replace(/^\s*-\s+/, '').trim()),
      });
      continue;
    }
    blocks.push({ kind: 'paragraph', text: chunk });
  }
  return blocks;
}

function renderBlock(block: Block, key: number): JSX.Element {
  if (block.kind === 'heading') {
    return (
      <h3 key={key} className="text-base font-semibold text-slate-900 mt-5 mb-1">
        {renderInline(block.text)}
      </h3>
    );
  }
  if (block.kind === 'list') {
    return (
      <ul key={key} className="list-disc pl-5 space-y-1">
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  const text = block.text.trim();
  // Render a trailing italic footer line separately (small + muted).
  if (text.startsWith('*') && text.endsWith('*') && !text.includes('\n')) {
    return (
      <p key={key} className="italic text-slate-500 text-sm mt-4">
        {text.slice(1, -1)}
      </p>
    );
  }
  return (
    <p key={key} className="whitespace-pre-line">
      {renderInline(text)}
    </p>
  );
}

/**
 * Inline formatting: **bold**, *italic*, `code`. Runs left-to-right; earliest
 * match wins per scan. Plain text outside matches is preserved verbatim.
 */
function renderInline(input: string): JSX.Element[] {
  const out: JSX.Element[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      out.push(<Fragment key={key++}>{input.slice(lastIndex, match.index)}</Fragment>);
    }
    const token = match[0];
    if (token.startsWith('**')) {
      out.push(
        <strong key={key++} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      out.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[0.85em] font-mono"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      out.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < input.length) {
    out.push(<Fragment key={key++}>{input.slice(lastIndex)}</Fragment>);
  }
  return out;
}
