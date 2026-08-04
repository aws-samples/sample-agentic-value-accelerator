/**
 * postureColor — Shared color mapping for "higher is better" HEALTH/posture scores.
 *
 * Distinct from risk scoring (where higher is worse). Maps a 0-100 posture score
 * to a Tailwind palette hex: emerald (great) → blue (good) → amber (watch) → rose (poor).
 *
 * The default cutoffs are 80/60/40 (the majority convention across the Govern
 * posture tiles). Callers that need different bands — e.g. ControlPlanePillars,
 * which grades pillars on a stricter 90/75/60 curve — can pass a `thresholds`
 * override rather than redefining the color ramp.
 */

export interface PostureThresholds {
  /** At or above this score → emerald (best). */
  great: number;
  /** At or above this score → blue (good). */
  good: number;
  /** At or above this score → amber (watch); below → rose (poor). */
  watch: number;
}

export const DEFAULT_POSTURE_THRESHOLDS: PostureThresholds = {
  great: 80,
  good: 60,
  watch: 40,
};

const POSTURE_HEX = {
  great: '#10b981', // emerald-500
  good: '#3b82f6', // blue-500
  watch: '#f59e0b', // amber-500
  poor: '#ef4444', // rose-500
} as const;

/**
 * Returns the posture color as a hex string for a given score (emerald → blue →
 * amber → rose). Callers use it in `style={{ color }}` / `background`.
 */
export function getPostureColor(
  score: number,
  thresholds: PostureThresholds = DEFAULT_POSTURE_THRESHOLDS,
): string {
  if (score >= thresholds.great) return POSTURE_HEX.great;
  if (score >= thresholds.good) return POSTURE_HEX.good;
  if (score >= thresholds.watch) return POSTURE_HEX.watch;
  return POSTURE_HEX.poor;
}
