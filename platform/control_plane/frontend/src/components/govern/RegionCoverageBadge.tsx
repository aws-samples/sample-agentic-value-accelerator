/**
 * Region coverage and floor-count badges.
 *
 * Every multi-region Govern response carries a `regions` provenance block
 * (backend: models/govern_region_provenance.py). The fan-out deliberately degrades
 * an unreachable region to nothing rather than failing the whole request, which is
 * the right behavior and also lossy: the viewer gets a smaller total with no way to
 * tell it from a genuinely smaller fleet. These badges are where that gap gets said
 * out loud.
 *
 * Two distinctions the badges preserve, because they need different fixes:
 *   - `unreachable` — the region did not answer. Its contribution is missing, so
 *     every total is a FLOOR. Amber.
 *   - `degraded` — the region answered with a live=False fallback (service not
 *     enabled there, or the read not granted). It answered honestly and contributed
 *     nothing. Not an error; worth naming. Slate.
 *
 * Deliberately silent cases:
 *   - `regions` absent/null. Absence means single-region BY CONSTRUCTION (a surface
 *     declared SINGLE_REGION in core/region_scope.py), not "all regions succeeded".
 *     Inventing a badge for it would assert coverage nobody measured.
 *   - one region, complete. The ordinary case. A badge on every card reading
 *     "1 region" is noise that trains people to ignore the badge that matters.
 */

import { Icon } from './icons';
import type { AwsRegionProvenance } from '../../api/client';

function list(regions: string[]): string {
  return regions.join(', ');
}

/**
 * Region coverage for one number or panel.
 *
 * `noun` names what the totals count so the tooltip can be specific about what is
 * a floor ("agents", "findings"). Renders null for the silent cases above.
 */
export function RegionCoverageBadge({
  regions,
  noun = 'totals',
}: {
  regions?: AwsRegionProvenance | null;
  noun?: string;
}) {
  if (!regions) return null;

  const queried = regions.queried?.length ?? 0;
  const unreachable = regions.unreachable ?? [];
  const degraded = regions.degraded ?? [];
  const reachable = regions.reachable ?? [];

  if (queried === 0) return null;

  // Missing regions dominate: the counts are a floor, and that outranks the
  // quieter "answered with nothing" case even when both are true.
  if (unreachable.length > 0) {
    const detail =
      `${reachable.length} of ${queried} governed regions answered. ` +
      `No response from ${list(unreachable)}, so ${noun} shown here are a floor, ` +
      `not a count.` +
      (degraded.length > 0 ? ` ${list(degraded)} answered with no live data.` : '');
    return (
      <span
        className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-300 cursor-help"
        title={detail}
      >
        <Icon name="exclamation-triangle" className="w-2.5 h-2.5" />
        {reachable.length}/{queried} regions
      </span>
    );
  }

  if (degraded.length > 0) {
    const liveCount = reachable.length - degraded.length;
    return (
      <span
        className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 cursor-help"
        title={
          `All ${queried} governed regions answered, but ${list(degraded)} reported ` +
          `no live data (service not enabled there, or the read not granted). ` +
          `${noun} come from ${liveCount} region${liveCount === 1 ? '' : 's'}.`
        }
      >
        <Icon name="globe-alt" className="w-2.5 h-2.5" />
        {liveCount}/{queried} live
      </span>
    );
  }

  // Complete. Only worth a badge when there is more than one region to aggregate:
  // it is the difference between "us-east-1" and "everywhere we govern".
  if (queried === 1) return null;

  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 cursor-help"
      title={`Aggregated across all ${queried} governed regions: ${list(regions.queried)}.`}
    >
      <Icon name="globe-alt" className="w-2.5 h-2.5" />
      {queried} regions
    </span>
  );
}

/**
 * Marks a count the backend already told us is incomplete.
 *
 * A scan that hit its limit returns a real number that is not the answer — 200
 * findings out of an unknown larger set. The number is worth showing; presenting it
 * as the account's finding count is not. Renders null when nothing was truncated,
 * so callers can pass the flag through unconditionally.
 */
export function FloorCountBadge({
  truncated,
  scanned,
  noun = 'records',
}: {
  truncated?: boolean | null;
  scanned?: number | null;
  noun?: string;
}) {
  if (!truncated) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-300 cursor-help"
      title={
        (scanned != null
          ? `Scan limit reached at ${scanned.toLocaleString()} ${noun}. `
          : 'Scan limit reached. ') +
        `More exist than were examined, so these counts are a floor, not a total.`
      }
    >
      <Icon name="exclamation-triangle" className="w-2.5 h-2.5" />
      Floor
    </span>
  );
}

export default RegionCoverageBadge;
