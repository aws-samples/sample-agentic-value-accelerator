/**
 * ScoreDisclosure — renders a score together with what it means and what it is made of.
 *
 * Why this exists: Govern shows several 0-100 numbers that are NOT comparable with
 * each other. `riskScore` is higher-is-worse (Critical 75-100). Readiness and the
 * posture scores are higher-is-better. A bare "78" therefore means opposite things
 * depending on which panel it is in, and nothing on the page said which. This
 * component makes the polarity, the method, the inputs and the measurement coverage
 * travel with the number instead of living in a tooltip somewhere else.
 *
 * Two rules it enforces:
 *
 *  1. `value === null` renders as "not scored", never as 0. A score of 0 is a
 *     measured verdict; null is an absence of evidence. The reason is required in
 *     that case, so an unscored number always says why and what would fix it.
 *  2. Coverage is always shown when it is below 100%. A score computed over 60% of
 *     a model is a different claim from one computed over all of it, and the reader
 *     cannot tell them apart from the number alone.
 *
 * Usage: pass a `ScoreProvenance` from the backend (or the graduation demo roster,
 * which mirrors it). Compact mode renders an inline value + coverage for table
 * cells; the default renders the full disclosure panel.
 */
import { useState } from 'react';
import { Icon } from './icons';
import type { ScoreProvenance } from './graduationData';

export interface ScoreDisclosureProps {
  /** null = not scored. Rendered as an em dash with the reason, never as 0. */
  value: number | null;
  provenance: ScoreProvenance;
  /** Upper bound, for the "/100" suffix. */
  outOf?: number;
  /** Inline form for table cells and tight headers. */
  compact?: boolean;
  /** Blocking criteria currently failing — surfaced above the fold, not buried. */
  blockingFailures?: string[];
}

const POLARITY_TEXT: Record<ScoreProvenance['polarity'], string> = {
  higher_is_better: 'Higher is better',
  // Spelled out because the platform carries both directions in the same 0-100
  // space; "lower is better" here is genuinely the opposite of the neighbouring card.
  lower_is_better: 'Lower is better',
};

/** Inline value for a table cell: the number, or an em dash that explains itself. */
export function ScoreValue({
  value,
  provenance,
  outOf = 100,
}: {
  value: number | null;
  provenance: ScoreProvenance;
  outOf?: number;
}) {
  if (value === null) {
    return (
      <span
        className="text-slate-400 tabular-nums"
        title={provenance.unscoredReason ?? 'Not scored.'}
      >
        &mdash;
      </span>
    );
  }
  const partial = provenance.scoredWeightPct < 100;
  return (
    <span
      className="tabular-nums font-semibold text-slate-700"
      title={
        `${provenance.metric} ${value}/${outOf}. ${POLARITY_TEXT[provenance.polarity]}. ` +
        (partial
          ? `Scored on ${provenance.scoredWeightPct}% of the model (${provenance.knownCriteria} of ${provenance.totalCriteria} criteria known).`
          : 'All criteria evaluated.')
      }
    >
      {value}
      {partial && (
        // A dot rather than a number: the cell must stay scannable, but a score
        // built on part of the model should not look identical to a complete one.
        <span className="text-amber-500 ml-0.5" aria-hidden="true">
          &bull;
        </span>
      )}
      {partial && <span className="sr-only"> (partial coverage)</span>}
    </span>
  );
}

export default function ScoreDisclosure({
  value,
  provenance,
  outOf = 100,
  compact = false,
  blockingFailures = [],
}: ScoreDisclosureProps) {
  const [open, setOpen] = useState(false);

  if (compact) {
    return <ScoreValue value={value} provenance={provenance} outOf={outOf} />;
  }

  const partial = provenance.scoredWeightPct < 100;

  return (
    <div className="text-left">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
          {provenance.metric}
        </span>
        {value === null ? (
          <span className="text-sm font-semibold text-slate-400">not scored</span>
        ) : (
          <span className="text-sm font-bold text-slate-800 tabular-nums">
            {value}
            <span className="text-[10px] font-normal text-slate-400">/{outOf}</span>
          </span>
        )}
        {!provenance.live && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
            Illustrative
          </span>
        )}
      </div>

      {/* The reason a score is absent is not an edge case to hide - it is the
          actionable part. Shown inline rather than behind the disclosure. */}
      {value === null && provenance.unscoredReason && (
        <div className="text-[10px] text-slate-500 mt-1 max-w-md">{provenance.unscoredReason}</div>
      )}

      {/* Blocking failures answer "what do I do about it", which a score cannot. */}
      {blockingFailures.length > 0 && (
        <div className="text-[10px] text-rose-700 mt-1">
          <span className="font-semibold">Blocked by:</span> {blockingFailures.join(', ')}
        </div>
      )}

      {value !== null && partial && (
        <div className="text-[10px] text-amber-700 mt-1">
          Scored on {provenance.scoredWeightPct}% of the model &mdash; {provenance.knownCriteria} of{' '}
          {provenance.totalCriteria} criteria evaluated
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="mt-1 text-[10px] text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-0.5"
      >
        {open ? 'Hide' : 'How this score works'}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" strokeWidth={2} />
      </button>

      {open && (
        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 max-w-2xl">
          <Field label="What it means">{provenance.definition}</Field>
          <Field label="Direction">
            {POLARITY_TEXT[provenance.polarity]}. Not comparable with risk scores, which run
            the other way on the same 0&ndash;{outOf} scale.
          </Field>
          <Field label="How it is calculated">{provenance.method}</Field>
          <Field label="What data it is made of">
            <ul className="list-disc list-outside ml-3.5 space-y-0.5 mt-0.5">
              {provenance.inputs.map(s => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Field>
          <Field label="Coverage">
            {provenance.knownCriteria} of {provenance.totalCriteria} criteria evaluated,{' '}
            {provenance.scoredWeightPct}% of the scoring weight. A score is only reported at{' '}
            {provenance.minCoveragePct}% or above.
            {provenance.unknownCriteria.length > 0 && (
              <>
                {' '}
                Not evaluated: <span className="text-slate-700">{provenance.unknownCriteria.join(', ')}</span>.
              </>
            )}
          </Field>
          <Field label="Source">
            {provenance.live
              ? 'Computed from this account’s real audit and telemetry records.'
              : 'Illustrative roster — deterministic sample data, not measurements from this account.'}
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-[11px] text-slate-600">{children}</div>
    </div>
  );
}
