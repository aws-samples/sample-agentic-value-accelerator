import { Highlight, HighlightsBlock } from "./types";

/**
 * Extract a highlights block from an assistant markdown message.
 *
 * The wire-format fence label from the model is `talking_points` (legacy
 * naming on the backend). We accept both `talking_points` and `highlights`
 * so the UI keeps working regardless of which the agent emits.
 *
 * Fail-soft semantics:
 *   - Closed, valid JSON                 → parsed, removed from prose.
 *   - Closed, malformed (parse fails)    → left visible so devs can debug.
 *   - Trailing unclosed (mid-stream)     → stripped from prose so partial
 *                                          JSON doesn't flash.
 *
 * Validation is intentionally permissive:
 *   - `category` is any non-empty string. Known ones get canonicalised to
 *     their well-styled form ("highlight" → "Highlight"); unknown ones get
 *     trimmed and passed through so they still render with a fallback style.
 *   - Individual invalid points are dropped (with a console.warn) but the
 *     surrounding block still renders if at least one valid point survives.
 */
const HIGHLIGHTS_RE = /```(?:highlights|talking_points)\s*([\s\S]*?)```/g;
const TRAILING_OPEN = /```(?:highlights|talking_points)\b[\s\S]*$/;

/**
 * Display order for known categories. New categories from the model that
 * don't appear here render after these, in first-seen order.
 */
export const KNOWN_CATEGORY_ORDER: readonly string[] = [
  // Customer-facing vocabulary (current).
  "Highlight",
  "Outcome",
  "Fact",
  "Trade-off",
  // Sales-side vocabulary (legacy, kept for backwards compat).
  "Value",
  "Differentiator",
  "Discovery",
  "Objection",
  "Champion",
];

export interface ExtractHighlightsResult {
  cleaned: string;
  block: HighlightsBlock | null;
}

export function extractHighlights(markdown: string): ExtractHighlightsResult {
  let block: HighlightsBlock | null = null;

  let cleaned = markdown.replace(HIGHLIGHTS_RE, (match, json: string) => {
    try {
      const parsed = JSON.parse(json) as unknown;
      const validated = validate(parsed);
      if (validated && validated.points.length > 0) {
        block = validated;
        if (typeof console !== "undefined") {
          console.info(
            `[highlights] OK (${validated.points.length} points, categories=${
              new Set(validated.points.map((p) => p.category)).size
            })`
          );
        }
        return "";
      }
      if (typeof console !== "undefined") {
        console.warn(
          "[highlights] Block validated to no usable points. Raw JSON:",
          json
        );
      }
      return match;
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[highlights] JSON.parse failed:", err, "Raw:", json);
      }
      return match;
    }
  });

  // Strip an unclosed trailing block while streaming.
  const trailing = cleaned.match(TRAILING_OPEN);
  if (trailing) {
    cleaned = cleaned.slice(0, trailing.index ?? cleaned.length);
  }

  return { cleaned: cleaned.replace(/\s+$/, ""), block };
}

function validate(value: unknown): HighlightsBlock | null {
  if (!value || typeof value !== "object") {
    console.warn("[highlights] Top-level is not an object:", value);
    return null;
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.points) || v.points.length === 0) {
    console.warn("[highlights] `points` missing or empty:", v);
    return null;
  }

  const points: Highlight[] = [];
  for (let i = 0; i < v.points.length; i++) {
    const validatedPoint = validatePoint(v.points[i], i);
    if (validatedPoint) points.push(validatedPoint);
  }

  if (points.length === 0) return null;

  return {
    title: typeof v.title === "string" ? v.title.trim() || undefined : undefined,
    points,
  };
}

function validatePoint(value: unknown, index: number): Highlight | null {
  if (!value || typeof value !== "object") {
    console.warn(`[highlights] points[${index}] is not an object:`, value);
    return null;
  }
  const p = value as Record<string, unknown>;

  const id = typeof p.id === "string" ? p.id.trim() : "";
  const label = typeof p.label === "string" ? p.label.trim() : "";
  const detail = typeof p.detail === "string" ? p.detail.trim() : "";
  const rawCategory = typeof p.category === "string" ? p.category.trim() : "";

  if (!id || !label || !detail || !rawCategory) {
    console.warn(
      `[highlights] points[${index}] missing required field(s):`,
      { id, label: label.slice(0, 30), detail: detail.slice(0, 30), category: rawCategory }
    );
    return null;
  }

  return { id, label, detail, category: canonicalizeCategory(rawCategory) };
}

/**
 * Canonicalise category casing for known names; pass through unknown ones
 * trimmed so they still render with the fallback style.
 */
function canonicalizeCategory(raw: string): string {
  const lower = raw.toLowerCase();
  for (const c of KNOWN_CATEGORY_ORDER) {
    if (c.toLowerCase() === lower) return c;
  }
  return raw;
}

/**
 * Group highlights by category. Known categories appear first in the
 * display order defined above; unknown categories follow in first-seen
 * order so newly-introduced vocabulary still renders predictably.
 */
export function groupHighlightsByCategory(
  points: Highlight[]
): Array<{ category: string; points: Highlight[] }> {
  const buckets = new Map<string, Highlight[]>();
  const insertion: string[] = [];
  for (const p of points) {
    const existing = buckets.get(p.category);
    if (existing) {
      existing.push(p);
    } else {
      buckets.set(p.category, [p]);
      insertion.push(p.category);
    }
  }
  const result: Array<{ category: string; points: Highlight[] }> = [];
  for (const c of KNOWN_CATEGORY_ORDER) {
    if (buckets.has(c)) {
      result.push({ category: c, points: buckets.get(c) ?? [] });
      buckets.delete(c);
    }
  }
  // Anything left is an unknown category — preserve insertion order.
  for (const c of insertion) {
    if (buckets.has(c)) {
      result.push({ category: c, points: buckets.get(c) ?? [] });
      buckets.delete(c);
    }
  }
  return result;
}
