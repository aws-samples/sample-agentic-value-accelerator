// markdown.ts — the shared "executive markdown" renderer used by the assistant thread and
// every primitive panel (Harness, Evaluations, Registry) so rich model output renders the
// same way everywhere: escape HTML FIRST (XSS guard for dangerouslySetInnerHTML), then
// bold/italic/code/headers/bullets/pipe-tables/line-breaks, and finally colorize signed
// numeric deltas (+green / −red). All transforms operate on the already-escaped string.
//
// Wrap the output in an element with the `prose-exec` class (see styles.css) for typography.

export function renderMarkdown(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = esc.split('\n');
  const out: string[] = [];
  let i = 0;

  // Color signed numeric deltas (+green / −red) so day-change / spread figures read
  // semantically in the executive tables. Guarded so dates like 2026-07-15 (the "-07"
  // is preceded by a digit) are never matched: sign must not follow a digit, and the
  // number must not be followed by another digit or a dash. Runs LAST on the escaped
  // string, after bold/em/code, so the spans it inserts contain only digits/signs.
  const colorizeDeltas = (s: string) =>
    s.replace(/(^|[^\d>])([+\-])(\d+(?:\.\d+)?\s?(?:%|bps)?)(?![\d-])/g, (_m, pre, sign, num) => {
      const cls = sign === '+' ? 'delta-pos' : 'delta-neg';
      const glyph = sign === '+' ? '+' : '−'; // real minus glyph
      return `${pre}<span class="${cls}">${glyph}${num}</span>`;  // nosemgrep  (html-in-template-string: escape-first — interpolated value already HTML-escaped)
    });

  const inline = (s: string) =>
    colorizeDeltas(
      s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>'),
    );

  const isTableSep = (s: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(s);  // nosemgrep  (detect-redos: fixed-alt separator regex on short pre-split lines, not user-length input)
  const splitRow = (s: string) =>
    s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule.
    if (/^\s*---+\s*$/.test(line)) {
      out.push('<hr/>');
      i += 1;
      continue;
    }

    // Pipe table: header row, then a |---| separator, then body rows.
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push(
        '<table><thead><tr>' +
          header.map((h) => `<th>${inline(h)}</th>`).join('') +  // nosemgrep  (html-in-template-string: escape-first — inline() output over escaped text)
          '</tr></thead><tbody>' +
          rows
            .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')  // nosemgrep  (html-in-template-string: escape-first — inline() output over escaped text)
            .join('') +
          '</tbody></table>',
      );
      continue;
    }

    // Headers (#, ##, ### all fold into the two prose-exec heading levels).
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1 || h2 || h3) {
      if (h3) out.push(`<h4>${inline(h3[1])}</h4>`);  // nosemgrep  (html-in-template-string: escape-first — inline() output over escaped text)
      else out.push(`<h3>${inline(((h2 || h1) as RegExpMatchArray)[1])}</h3>`);  // nosemgrep  (html-in-template-string: escape-first — inline() output over escaped text)
      i += 1;
      continue;
    }

    // Blockquote.
    if (/^\s*&gt;\s?/.test(line)) {
      out.push(`<blockquote>${inline(line.replace(/^\s*&gt;\s?/, ''))}</blockquote>`);  // nosemgrep  (html-in-template-string: escape-first — inline() output over escaped text)
      i += 1;
      continue;
    }

    // Bullet list block.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);  // nosemgrep  (html-in-template-string: escape-first — inline() output over escaped text)
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);  // nosemgrep  (html-in-template-string: escape-first — join of escaped <li> fragments)
      continue;
    }

    // Numbered list block.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);  // nosemgrep  (html-in-template-string: escape-first — inline() output over escaped text)
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);  // nosemgrep  (html-in-template-string: escape-first — join of escaped <li> fragments)
      continue;
    }

    // Blank line → spacer; plain line → inline + <br/>.
    if (line.trim() === '') {
      out.push('');
    } else {
      out.push(inline(line) + '<br/>');
    }
    i += 1;
  }

  return out.join('\n');
}
