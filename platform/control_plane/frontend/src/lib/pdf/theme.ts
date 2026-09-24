// Shared PDF report theme — the single source of formatting truth for every
// Plan-pillar report (maturity, operating model, business case, use case).
//
// Adapters describe *what* goes in a report (see ./types); this file and the
// ReportBuilder own *how* it looks, so all four record types render with an
// identical visual language. Change a color or spacing value here and every
// report updates.

export type RGB = [number, number, number];

// Report semantic tone — drives KPI/badge/bar/table-cell coloring.
export type Tone = 'default' | 'positive' | 'negative' | 'warning' | 'info';

// Page geometry (US Letter, points). Kept here so a future switch to A4 is a
// one-line change.
export const PAGE = {
  format: 'letter' as const,
  orientation: 'portrait' as const,
  unit: 'pt' as const,
  width: 612,
  height: 792,
  margin: { top: 54, right: 48, bottom: 54, left: 48 },
} as const;

export const CONTENT_WIDTH = PAGE.width - PAGE.margin.left - PAGE.margin.right;
export const CONTENT_TOP = PAGE.margin.top;
// Reserve a strip at the bottom for the page footer.
export const FOOTER_HEIGHT = 26;
export const CONTENT_BOTTOM = PAGE.height - PAGE.margin.bottom - FOOTER_HEIGHT;

// Core palette — mirrors the Tailwind slate/blue/indigo scale used across the UI.
export const COLORS = {
  brand: [79, 70, 229] as RGB, // indigo-600
  brandAlt: [37, 99, 235] as RGB, // blue-600
  ink: [15, 23, 42] as RGB, // slate-900
  body: [51, 65, 85] as RGB, // slate-700
  muted: [100, 116, 139] as RGB, // slate-500
  faint: [148, 163, 184] as RGB, // slate-400
  line: [226, 232, 240] as RGB, // slate-200
  panel: [248, 250, 252] as RGB, // slate-50
  white: [255, 255, 255] as RGB,

  positive: [4, 120, 87] as RGB, // emerald-700
  positiveBg: [236, 253, 245] as RGB, // emerald-50
  negative: [185, 28, 28] as RGB, // red-700
  negativeBg: [254, 242, 242] as RGB, // red-50
  warning: [180, 83, 9] as RGB, // amber-700
  warningBg: [255, 251, 235] as RGB, // amber-50
  info: [29, 78, 216] as RGB, // blue-700
  infoBg: [239, 246, 255] as RGB, // blue-50
} as const;

// Font sizes (pt). helvetica is the built-in jsPDF font (no embedding needed).
export const FONT = {
  family: 'helvetica',
  coverTitle: 26,
  coverEyebrow: 10,
  coverSubtitle: 12,
  h1: 15,
  h2: 11,
  body: 10,
  small: 8,
  tiny: 7,
  kpiValue: 17,
  kpiLabel: 7,
} as const;

// Vertical rhythm (pt).
export const SPACE = {
  blockGap: 16,
  headingGap: 9,
  paraGap: 6,
  afterTable: 18,
  afterChart: 18,
  kpiGap: 8,
  kpiHeight: 52,
} as const;

export interface ToneStyle {
  fg: RGB;
  bg: RGB;
}

// Resolve a semantic tone to foreground/background colors.
export function toneStyle(tone: Tone = 'default'): ToneStyle {
  switch (tone) {
    case 'positive':
      return { fg: COLORS.positive, bg: COLORS.positiveBg };
    case 'negative':
      return { fg: COLORS.negative, bg: COLORS.negativeBg };
    case 'warning':
      return { fg: COLORS.warning, bg: COLORS.warningBg };
    case 'info':
      return { fg: COLORS.info, bg: COLORS.infoBg };
    default:
      return { fg: COLORS.ink, bg: COLORS.panel };
  }
}

// Lighten an RGB color toward white by `amount` (0..1). Used for chart fills
// where jsPDF alpha compositing is unreliable across versions.
export function tint(rgb: RGB, amount: number): RGB {
  const a = Math.max(0, Math.min(1, amount));
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * a),
    Math.round(rgb[1] + (255 - rgb[1]) * a),
    Math.round(rgb[2] + (255 - rgb[2]) * a),
  ];
}

// --- timestamp helpers (local time) ----------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Filename-safe timestamp: YYYY-MM-DD-hh-mm (24h, local time). */
export function fileTimestamp(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}-${pad2(d.getMinutes())}`
  );
}

/** Human-readable timestamp for the "Generated" line, e.g. "July 16, 2026 at 14:45". */
export function displayTimestamp(d: Date = new Date()): string {
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return `${date} at ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
