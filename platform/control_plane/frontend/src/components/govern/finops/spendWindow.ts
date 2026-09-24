/**
 * spendWindow — the one definition of "which period is the FinOps page showing".
 *
 * WHY A DESCRIPTOR RATHER THAN A BARE `months` NUMBER
 *
 * Two of the five presets cannot be expressed as a single trailing count. Month-to-date
 * and "last month" are both one calendar month long; what differs is where the window
 * ENDS. So the shape has to carry both a length and an offset, and callers must never
 * reduce it back to one number.
 *
 * Cost Explorer semantics, confirmed empirically against the live API rather than
 * assumed: `months=N` covers the current calendar month plus N-1 prior, ending at the
 * first of NEXT month. `months_offset` shifts that whole window back N whole months.
 *
 *   months=1  offset=0  ->  2026-09-01 .. 2026-10-01   month-to-date (partial month)
 *   months=1  offset=1  ->  2026-08-01 .. 2026-09-01   last month (complete)
 *   months=12 offset=0  ->  2025-10-01 .. 2026-10-01
 *
 * FORWARD COMPATIBILITY WITH COST AND USAGE REPORTS
 *
 * Cost Explorer's API only retains about 13 months, so anything deeper needs CUR (or
 * CUR 2.0 / BCM data exports) landing in S3 and queried through Athena. CUR takes an
 * arbitrary date range, not a month offset, so when it is wired the right move is to add
 * a `{ kind: 'range', start, end }` variant to this union and a matching pair of query
 * params - NOT to keep stacking offsets. Everything downstream reads `toQuery()` and the
 * label, so that change lands here and in the API client, not in every panel.
 *
 * Worth stating plainly for whoever picks that up: enabling CUR does not backfill. History
 * begins at first delivery, so it deepens the window going forward and does nothing for
 * periods before it was switched on. For anything earlier than that, Cost Explorer's ~13
 * months is the whole of what exists.
 */

/** A period the FinOps spend views can be scoped to. */
export interface SpendWindow {
  /** Stable identifier, used for the selected-state and as a React key. */
  id: SpendWindowId;
  /** What the user sees on the control. */
  label: string;
  /** Window length in calendar months, counting the end month. */
  months: number;
  /** Whole calendar months to shift the window back. 0 ends at the first of next month. */
  monthsOffset: number;
  /**
   * True when the window includes the current, still-accruing month. Any figure from
   * such a window covers a PARTIAL period and must not be compared like-for-like against
   * a closed month - the UI says so rather than leaving the reader to work it out.
   */
  partial: boolean;
  /** Shown beside the figures so the period is never implicit. */
  hint: string;
}

export type SpendWindowId = 'mtd' | 'last-month' | '3m' | '6m' | '12m';

export const SPEND_WINDOWS: SpendWindow[] = [
  {
    id: 'mtd',
    label: 'Month to date',
    months: 1,
    monthsOffset: 0,
    partial: true,
    hint: 'Current calendar month so far',
  },
  {
    id: 'last-month',
    label: 'Last month',
    months: 1,
    monthsOffset: 1,
    partial: false,
    hint: 'Previous calendar month, complete',
  },
  { id: '3m', label: '3 months', months: 3, monthsOffset: 0, partial: true, hint: 'Last 3 calendar months' },
  { id: '6m', label: '6 months', months: 6, monthsOffset: 0, partial: true, hint: 'Last 6 calendar months' },
  { id: '12m', label: '1 year', months: 12, monthsOffset: 0, partial: true, hint: 'Last 12 calendar months' },
];

/** Default matches the previous hardcoded behaviour, so nothing shifts on first load. */
export const DEFAULT_SPEND_WINDOW: SpendWindowId = '6m';

export const spendWindowById = (id: SpendWindowId): SpendWindow =>
  SPEND_WINDOWS.find(w => w.id === id) ?? SPEND_WINDOWS.find(w => w.id === DEFAULT_SPEND_WINDOW)!;

/** Query params for the govern_cost endpoints that accept a window. */
export const toQuery = (w: SpendWindow): { months: number; months_offset: number } => ({
  months: w.months,
  months_offset: w.monthsOffset,
});

/**
 * Caps that some sources impose regardless of the selected window.
 *
 * These endpoints take `days` with a maximum, so they physically cannot cover a longer
 * selection. Rather than silently render 90 days of data under a "1 year" heading - which
 * is the mislabelling this module has been cleaning up - a panel backed by one of these
 * states the window it is ACTUALLY on.
 */
export const SOURCE_DAY_CAPS = {
  trend: 90,
  anomalies: 90,
  useCaseSpend: 90,
  agentCoreCosts: 90,
  byResource: 14,
} as const;

/**
 * Days a capped source will really cover for the selected window, plus whether that is
 * short of what was asked for.
 */
export function cappedDays(w: SpendWindow, cap: number): { days: number; capped: boolean } {
  // Approximate the selection in days only to decide whether the cap binds. The value
  // returned is what gets requested, so it is always a window the source can honour.
  const approxDays = w.months * 31;
  return { days: Math.min(approxDays, cap), capped: approxDays > cap };
}

/** Label for a capped panel, e.g. "90 days (max for this source)". */
export const cappedLabel = (days: number, capped: boolean): string =>
  capped ? `${days} days (max for this source)` : `${days} days`;
