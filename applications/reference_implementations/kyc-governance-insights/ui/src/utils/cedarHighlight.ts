export interface HighlightToken {
  text: string;
  className: string;
}

const KEYWORDS = ['permit', 'forbid', 'when', 'unless', 'in'];
const ENTITIES = ['principal', 'action', 'resource', 'context'];
const OPERATORS = ['==', '!=', '>=', '<=', '>', '<'];

export function highlightCedarDsl(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const lines = code.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (li > 0) tokens.push({ text: '\n', className: '' });

    // Comment check
    const commentIdx = line.indexOf('//');
    const activeLine = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : '';

    // Tokenize active part
    let i = 0;
    while (i < activeLine.length) {
      // Whitespace
      if (/\s/.test(activeLine[i])) {
        let ws = '';
        while (i < activeLine.length && /\s/.test(activeLine[i])) { ws += activeLine[i]; i++; }
        tokens.push({ text: ws, className: '' });
        continue;
      }

      // String literal
      if (activeLine[i] === '"') {
        let str = '"';
        i++;
        while (i < activeLine.length && activeLine[i] !== '"') { str += activeLine[i]; i++; }
        if (i < activeLine.length) { str += '"'; i++; }
        tokens.push({ text: str, className: 'cedar-string' });
        continue;
      }

      // Action:: pattern
      if (activeLine.slice(i).startsWith('Action::')) {
        let act = 'Action::';
        i += 8;
        if (i < activeLine.length && activeLine[i] === '"') {
          act += '"';
          i++;
          while (i < activeLine.length && activeLine[i] !== '"') { act += activeLine[i]; i++; }
          if (i < activeLine.length) { act += '"'; i++; }
        }
        tokens.push({ text: act, className: 'cedar-action' });
        continue;
      }

      // Operators (multi-char first)
      let foundOp = false;
      for (const op of OPERATORS) {
        if (activeLine.slice(i, i + op.length) === op) {
          tokens.push({ text: op, className: 'cedar-operator' });
          i += op.length;
          foundOp = true;
          break;
        }
      }
      if (foundOp) continue;

      // Word
      if (/[a-zA-Z_]/.test(activeLine[i])) {
        let word = '';
        while (i < activeLine.length && /[a-zA-Z_0-9.-]/.test(activeLine[i])) { word += activeLine[i]; i++; }
        if (KEYWORDS.includes(word)) tokens.push({ text: word, className: 'cedar-keyword' });
        else if (ENTITIES.includes(word)) tokens.push({ text: word, className: 'cedar-entity' });
        else if (/^(true|false)$/.test(word)) tokens.push({ text: word, className: 'cedar-literal' });
        else tokens.push({ text: word, className: '' });
        continue;
      }

      // Number
      if (/[0-9]/.test(activeLine[i])) {
        let num = '';
        while (i < activeLine.length && /[0-9.]/.test(activeLine[i])) { num += activeLine[i]; i++; }
        tokens.push({ text: num, className: 'cedar-literal' });
        continue;
      }

      // Punctuation
      tokens.push({ text: activeLine[i], className: '' });
      i++;
    }

    // Comment
    if (commentPart) {
      tokens.push({ text: commentPart, className: 'cedar-comment' });
    }
  }

  return tokens;
}
