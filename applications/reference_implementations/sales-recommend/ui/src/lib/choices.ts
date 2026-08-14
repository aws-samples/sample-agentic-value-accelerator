import { ChoiceBlockData } from "./types";

/**
 * Extract ```choices``` JSON blocks from an assistant markdown message.
 *
 * Handles three cases:
 *   1. Closed, valid JSON block        → parsed into `blocks`, removed from prose.
 *   2. Closed, malformed JSON          → left visible so devs can debug.
 *   3. Trailing unclosed block (mid-stream) → stripped from prose so partial
 *      JSON doesn't flash before the closing fence arrives.
 */
const CHOICES_BLOCK = /```choices\s*([\s\S]*?)```/g;
const TRAILING_OPEN = /```choices\s*[\s\S]*$/;

export interface ExtractChoicesResult {
  /** Markdown with all parsed/streaming choice blocks removed. */
  cleaned: string;
  /** Successfully parsed choice blocks, in document order. */
  blocks: ChoiceBlockData[];
}

export function extractChoices(markdown: string): ExtractChoicesResult {
  const blocks: ChoiceBlockData[] = [];

  // 1. Replace closed blocks. Valid → strip & collect; invalid → leave visible.
  let cleaned = markdown.replace(CHOICES_BLOCK, (match, json: string) => {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (isChoiceBlock(parsed)) {
        blocks.push(parsed);
        return "";
      }
      return match;
    } catch {
      return match;
    }
  });

  // 2. Strip a trailing unclosed block — only one can exist by definition.
  const trailing = cleaned.match(TRAILING_OPEN);
  if (trailing) {
    cleaned = cleaned.slice(0, trailing.index ?? cleaned.length);
  }

  return { cleaned: cleaned.replace(/\s+$/, ""), blocks };
}

function isChoiceBlock(value: unknown): value is ChoiceBlockData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.question !== "string") return false;
  if (!Array.isArray(v.options)) return false;
  return v.options.every(
    (o) =>
      o &&
      typeof o === "object" &&
      typeof (o as Record<string, unknown>).id === "string" &&
      typeof (o as Record<string, unknown>).label === "string"
  );
}
