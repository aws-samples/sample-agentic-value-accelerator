/**
 * ReportsOverview — the reporting module's landing view.
 *
 * Replaces a first impression that was a blank pane: the module used to open on Control
 * Assessments, whose right-hand side reads "Select agents to view control coverage matrix"
 * until you tick boxes in a tall selector. Nothing was visible without doing work first.
 *
 * This view requires no selection. It answers "what is the state of my compliance estate,
 * and what should I do next" from data already fetched, then hands off to the task tabs.
 *
 * Honesty rules this view follows, because it is the first thing anyone sees:
 *  - Framework and control counts come from the DEDUPLICATED framework list. The posture
 *    endpoint returns alias ids for three frameworks, so a naive count reports 17/318 for a
 *    real estate of 14/281 (see useFrameworkCompliance).
 *  - Coverage bars render the measured split (pass / in-progress / fail / not started). The
 *    not-started share is drawn, not hidden, so a framework nobody has assessed looks empty
 *    rather than looking compliant.
 *  - Every number carries its own provenance. A tile whose source is not live renders an
 *    em-dash, never a zero — a 0% compliance figure reads as total failure when it usually
 *    means nothing has been attested.
 *  - Recent reports starts genuinely empty. The old Recent Reports card seeded six invented
 *    reports with named authors and file sizes ("2.4 MB"), unbadged.
 */

import { useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import { useFrameworkCompliance } from './useReportsLiveData';

export type ReportsOverviewTarget = 'framework' | 'assessments' | 'inventory' | 'attestation' | 'trends';

interface Props {
  /** Jump to a task tab. The overview never does work itself; it routes to the tab that does. */
  onNavigate: (target: ReportsOverviewTarget) => void;
}

/** A headline count. `value` null renders an em-dash — see the honesty rules above. */
function HeadlineStat({
  label,
  value,
  sub,
  tone = 'default',
  why,
}: {
  label: string;
  value: number | string | null;
  sub: string;
  tone?: 'default' | 'critical' | 'muted';
  why?: string;
}) {
  const valueTone =
    value === null ? 'text-slate-400' : tone === 'critical' ? 'text-rose-600' : 'text-slate-900';
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4" title={why}>
      <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueTone}`}>{value === null ? '—' : value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

/**
 * A four-segment coverage bar. Not-started is rendered as visible empty track rather than
 * omitted, so an unassessed framework cannot be mistaken for a compliant one.
 */
function CoverageBar({
  pass,
  inProgress,
  fail,
  notStarted,
}: {
  pass: number;
  inProgress: number;
  fail: number;
  notStarted: number;
}) {
  const total = pass + inProgress + fail + notStarted;
  if (total <= 0) {
    return <div className="h-1.5 rounded-full bg-slate-100" />;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
      <div className="h-full bg-emerald-500" style={{ width: pct(pass) }} title={`${pass} passing`} />
      <div className="h-full bg-amber-400" style={{ width: pct(inProgress) }} title={`${inProgress} in progress`} />
      <div className="h-full bg-rose-500" style={{ width: pct(fail) }} title={`${fail} failing`} />
      <div className="h-full bg-slate-200" style={{ width: pct(notStarted) }} title={`${notStarted} not assessed`} />
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: IconName;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 hover:border-indigo-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
          <Icon name={icon} className="w-4 h-4 text-indigo-600" strokeWidth={2} />
        </div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <Icon name="arrow-right" className="w-3.5 h-3.5 text-slate-300 ml-auto group-hover:text-indigo-500 transition-colors" />
      </div>
      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{description}</p>
    </button>
  );
}

export default function ReportsOverview({ onNavigate }: Props) {
  const { frameworks, loading, isLive, error } = useFrameworkCompliance();

  const stats = useMemo(() => {
    const totalControls = frameworks.reduce((a, f) => a + f.totalControls, 0);
    const notAssessed = frameworks.reduce((a, f) => a + f.notStartedCount, 0);
    const failing = frameworks.reduce((a, f) => a + f.failCount, 0);
    const passing = frameworks.reduce((a, f) => a + f.passCount, 0);
    const inProgress = frameworks.reduce((a, f) => a + f.inProgressCount, 0);
    const assessed = totalControls - notAssessed;

    // Denominator is the ASSESSED population, and `assessed` travels with it so the caller
    // can state what was excluded. Dividing by every control would understate compliance for
    // an estate that has simply not been attested yet.
    const compliancePct = assessed > 0 ? Math.round((passing / assessed) * 100) : null;

    // A framework nobody has started is a distinct governance state from a failing one.
    const unassessedFrameworks = frameworks.filter(f => f.notStartedCount >= f.totalControls).length;

    return { totalControls, notAssessed, failing, passing, inProgress, assessed, compliancePct, unassessedFrameworks };
  }, [frameworks]);

  const ranked = useMemo(
    () =>
      [...frameworks].sort((a, b) => {
        // Worst first: most failing controls, then least assessed.
        if (b.failCount !== a.failCount) return b.failCount - a.failCount;
        return b.notStartedCount / (b.totalControls || 1) - a.notStartedCount / (a.totalControls || 1);
      }),
    [frameworks],
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <div className="h-72 bg-slate-200 rounded-xl" />
          <div className="h-72 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Headline counts. Deduplicated framework list — see useFrameworkCompliance. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HeadlineStat
          label="Frameworks"
          value={frameworks.length || null}
          sub={frameworks.length ? 'tracked in this estate' : 'compliance posture unavailable'}
          why="Distinct frameworks. The posture endpoint returns alias ids for three of them; those are collapsed so nothing is counted twice."
        />
        <HeadlineStat
          label="Controls"
          value={stats.totalControls || null}
          sub={stats.totalControls ? `${stats.assessed} assessed · ${stats.notAssessed} not yet` : 'no controls returned'}
        />
        <HeadlineStat
          label="Compliance"
          value={stats.compliancePct === null ? null : `${stats.compliancePct}%`}
          sub={
            stats.compliancePct === null
              ? 'nothing attested yet'
              : `of ${stats.assessed} assessed controls`
          }
          why={
            stats.compliancePct === null
              ? 'No control carries an attestation yet, so there is no compliance rate to report. This is an absence of assessment, not a score of zero.'
              : `Passing ÷ assessed. Excludes ${stats.notAssessed} controls nobody has assessed, which would otherwise drag the rate down for work simply not started.`
          }
        />
        <HeadlineStat
          label="Failing controls"
          value={stats.failing}
          sub={stats.unassessedFrameworks > 0 ? `${stats.unassessedFrameworks} frameworks unassessed` : 'across all frameworks'}
          tone={stats.failing > 0 ? 'critical' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        {/* Coverage by framework */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Coverage by framework</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Worst first — most failing controls, then least assessed</div>
            </div>
            {isLive
              ? <LiveDataBadge source="Compliance Posture API" detail="Control counts and attestation status from the control-plane backend; alias framework ids deduplicated" />
              : <MockDataBadge integration="Attest at least one control to populate compliance posture" />}
          </div>

          {ranked.length === 0 ? (
            <div className="text-center py-10">
              <Icon name="clipboard-document-list" className="w-10 h-10 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
              <div className="text-sm font-medium text-slate-600">No compliance posture available</div>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                {error
                  ? 'The compliance posture endpoint could not be reached.'
                  : 'No frameworks were returned for this account.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ranked.map(f => {
                const assessed = f.totalControls - f.notStartedCount;
                return (
                  <button
                    key={f.frameworkId}
                    onClick={() => onNavigate('framework')}
                    className="w-full text-left group"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-slate-700 truncate group-hover:text-indigo-600 transition-colors">
                        {f.frameworkName}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
                        {assessed === 0
                          ? `not assessed · ${f.totalControls} controls`
                          : `${f.passCount}/${assessed} passing · ${f.totalControls} controls`}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <CoverageBar
                        pass={f.passCount}
                        inProgress={f.inProgressCount}
                        fail={f.failCount}
                        notStarted={f.notStartedCount}
                      />
                    </div>
                  </button>
                );
              })}
              <div className="flex items-center gap-3 pt-2 text-[9px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />passing</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />in progress</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />failing</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200" />not assessed</span>
              </div>
            </div>
          )}
        </div>

        {/* Needs attention */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900 mb-4">Needs attention</div>
          <div className="space-y-2.5">
            {stats.failing > 0 && (
              <button
                onClick={() => onNavigate('framework')}
                className="w-full flex items-start gap-2.5 p-2.5 rounded-lg bg-rose-50/60 border border-rose-200/60 hover:border-rose-300 transition-colors text-left"
              >
                <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-600 flex-shrink-0 mt-px" />
                <div>
                  <div className="text-xs font-medium text-rose-800">{stats.failing} failing controls</div>
                  <div className="text-[10px] text-rose-600/80 mt-0.5">Review the framework detail and open a remediation playbook</div>
                </div>
              </button>
            )}
            {stats.notAssessed > 0 && (
              <button
                onClick={() => onNavigate('assessments')}
                className="w-full flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 hover:border-slate-300 transition-colors text-left"
              >
                <Icon name="clipboard-document-list" className="w-4 h-4 text-slate-500 flex-shrink-0 mt-px" />
                <div>
                  <div className="text-xs font-medium text-slate-800">{stats.notAssessed} controls not assessed</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {stats.unassessedFrameworks > 0
                      ? `${stats.unassessedFrameworks} framework${stats.unassessedFrameworks === 1 ? '' : 's'} have no assessment at all`
                      : 'Spread across frameworks already in progress'}
                  </div>
                </div>
              </button>
            )}
            {stats.inProgress > 0 && (
              <button
                onClick={() => onNavigate('attestation')}
                className="w-full flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60 hover:border-amber-300 transition-colors text-left"
              >
                <Icon name="check-badge" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-px" />
                <div>
                  <div className="text-xs font-medium text-amber-800">{stats.inProgress} controls in progress</div>
                  <div className="text-[10px] text-amber-600/80 mt-0.5">Awaiting sign-off in the attestation workflow</div>
                </div>
              </button>
            )}
            {stats.failing === 0 && stats.notAssessed === 0 && stats.inProgress === 0 && (
              <div className="text-center py-6">
                <Icon name="check-circle" className="w-8 h-8 mx-auto mb-2 text-slate-300" strokeWidth={1.5} />
                <div className="text-xs text-slate-500">
                  {frameworks.length === 0 ? 'No posture data to assess' : 'Nothing outstanding'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate a report */}
      <div>
        <div className="text-sm font-semibold text-slate-900 mb-3">Generate a report</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ActionCard
            icon="clipboard-document-list"
            title="Framework report"
            description="Per-framework requirement and control detail for a named standard — SR 26-2, NIST AI RMF, EU AI Act, ISO 42001."
            onClick={() => onNavigate('framework')}
          />
          <ActionCard
            icon="shield-check"
            title="Control assessment"
            description="Assess selected agents against control design and operating effectiveness, with an evidence trail."
            onClick={() => onNavigate('assessments')}
          />
          <ActionCard
            icon="cube-transparent"
            title="Resource inventory"
            description="Full agent inventory with the guardrails, policies and controls bound to each one."
            onClick={() => onNavigate('inventory')}
          />
        </div>
      </div>

      {/* Recent reports — genuinely empty until a report store exists. */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold text-slate-900">Recent reports</div>
          <MockDataBadge integration="Report history requires a report store — generated reports are not currently persisted" />
        </div>
        <p className="text-[11px] text-slate-400">
          Generated reports download directly to your machine and are not retained here, so there is no history to show.
          Wiring a report store would let this list show what was produced, by whom, and against which data.
        </p>
      </div>
    </div>
  );
}
