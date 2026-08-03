/**
 * SafetyEvals — Red-Team & Safety Evals surface (AI Safety module).
 *
 * Two tracks in one view:
 *  1) Safety-benchmark scores per model, with EXPLICIT polarity so lower-is-safer
 *     benchmarks (HarmBench ASR, WMDP) aren't misread as accuracy, and Cybench
 *     capability is framed as "more scrutiny" rather than "better".
 *  2) A red-team program: campaigns with findings-by-severity, status, and
 *     remediation rate, plus a findings-by-severity bar chart.
 *
 * Honest badging: all figures are illustrative. Live path = Amazon Bedrock model
 * evaluations / METR Inspect harness feeding these tables.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import GovernPageLayout from '../GovernPageLayout';
import { MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import LiveBedrockEvals from './LiveBedrockEvals';
import LiveRuntimeSafety from './LiveRuntimeSafety';
import { Icon } from '../icons';
import {
  BENCHMARKS, MODEL_BENCHMARKS, CAMPAIGNS, GRADE_ORDER, SEVERITY_ORDER,
  benchmarkValue, passesThreshold, totalFindings, computeAggregate,
  type BenchmarkDef, type ModelBenchmarks, type RedTeamCampaign,
  type CampaignStatus, type Severity, type SafetyGrade, type Polarity,
} from './evalsData';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#0f172a', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

const severityColor: Record<Severity, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#94a3b8',
};
const severityBadge: Record<Severity, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const statusBadge: Record<CampaignStatus, string> = {
  planned: 'bg-slate-100 text-slate-500',
  running: 'bg-blue-100 text-blue-700',
  complete: 'bg-emerald-100 text-emerald-700',
};
const statusLabel: Record<CampaignStatus, string> = {
  planned: 'Planned', running: 'Running', complete: 'Complete',
};

const gradeBadge: Record<SafetyGrade, string> = {
  'Poor': 'bg-rose-100 text-rose-700',
  'Fair': 'bg-orange-100 text-orange-700',
  'Good': 'bg-amber-100 text-amber-700',
  'Very Good': 'bg-emerald-50 text-emerald-700',
  'Excellent': 'bg-emerald-100 text-emerald-700',
};

const polarityNote: Record<Polarity, string> = {
  'lower-is-safer': 'Lower is safer',
  'higher-is-safer': 'Higher is better',
  'capability-scrutiny': 'High capability → more scrutiny',
};
const polarityBadge: Record<Polarity, string> = {
  'lower-is-safer': 'bg-blue-50 text-blue-700 border-blue-200',
  'higher-is-safer': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'capability-scrutiny': 'bg-amber-50 text-amber-700 border-amber-200',
};

/** Colour a numeric benchmark cell green/red by whether the model passes its threshold. */
function cellClass(b: BenchmarkDef, value: number | undefined): string {
  if (value === undefined || b.threshold === undefined) return 'text-slate-700';
  return passesThreshold(b, value) ? 'text-emerald-700' : 'text-rose-600';
}

function fmtValue(b: BenchmarkDef, value: number): string {
  return `${value.toFixed(1)}${b.unit ?? ''}`;
}

export default function SafetyEvals() {
  const agg = useMemo(
    () => computeAggregate(CAMPAIGNS, MODEL_BENCHMARKS, BENCHMARKS),
    [],
  );

  const findingsBySeverity = useMemo(() =>
    SEVERITY_ORDER.map(sev => ({
      name: sev.charAt(0).toUpperCase() + sev.slice(1),
      severity: sev,
      count: CAMPAIGNS.reduce((s, c) => s + c.findings[sev], 0),
    })),
  []);

  const numericBenchmarks = BENCHMARKS.filter(b => b.id !== 'ailuminate');

  return (
    <GovernPageLayout
      title="Red-Team & Safety Evals"
      description="Red-team coverage, findings and remediation, alongside published safety-benchmark scores per model. Benchmarks carry explicit polarity — lower-is-safer evals (HarmBench, WMDP) are not accuracy scores. Grounded in the METR / UK AISI Inspect eval framing."
      badge={<MockDataBadge integration="Published benchmarks (HarmBench/WMDP/AILuminate) illustrative — live Bedrock eval jobs shown up top" />}
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {/* Live AWS — runtime safety telemetry from real invocation logs (aggregates only) */}
      <LiveRuntimeSafety />

      {/* Live AWS — real Bedrock evaluation jobs (distinct from published benchmarks below) */}
      <LiveBedrockEvals />

      {/* Red-Team → Test Pipeline Link */}
      <Link
        to="/govern/safety/redteam-pipeline"
        className="block mb-6 bg-gradient-to-r from-rose-50 to-amber-50 rounded-xl border border-rose-200 p-4 hover:border-rose-300 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
              <span className="text-xl">🎯</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-rose-800">Red-Team → Test Pipeline</div>
              <div className="text-xs text-rose-600">Auto-generate test cases from findings, integrate with CI/CD, monitor regressions</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-semibold">2 open</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">4 tests</span>
            <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Published safety benchmarks + red-team program (illustrative) */}
      <div className="mb-3 flex items-center gap-2">
        <Icon name="beaker" className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Published Safety Benchmarks &amp; Red-Team Program</h2>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Illustrative</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Red-team campaigns"
          value={agg.campaigns}
          variant="info"
          sub={`${CAMPAIGNS.filter(c => c.status === 'running').length} running`}
        />
        <StatCard
          label="Open critical findings"
          value={agg.openCriticals}
          variant={agg.openCriticals ? 'danger' : 'success'}
          sub="in non-complete campaigns"
        />
        <StatCard
          label="Mean remediation"
          value={`${agg.meanRemediation}%`}
          variant={agg.meanRemediation >= 75 ? 'success' : agg.meanRemediation >= 50 ? 'warning' : 'danger'}
          sub="active campaigns"
        />
        <StatCard
          label="Benchmarks tracked"
          value={agg.benchmarksTracked}
          variant="muted"
          sub={`${agg.benchmarksPassing}/${numericBenchmarks.filter(b => b.threshold !== undefined).length} numeric passing`}
        />
      </div>

      {/* Safety benchmarks */}
      <div className="mb-3 flex items-center gap-2">
        <Icon name="beaker" className="w-4 h-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-slate-900">Safety Benchmarks by Model</h2>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">METR Inspect harness</span>
      </div>
      <p className="text-[11px] text-slate-500 max-w-3xl mb-3">
        Each benchmark has a defined safety polarity. Green means the model clears the safety threshold for that
        benchmark; red means it does not. <span className="font-semibold text-slate-600">WMDP is an inverted probe</span> —
        it measures hazardous knowledge, so a lower score is safer (it is not an accuracy metric). Cybench measures
        cyber-offense capability: a high score is not "good", it raises deployment scrutiny.
      </p>

      {/* Polarity legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {BENCHMARKS.map(b => (
          <span
            key={b.id}
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${polarityBadge[b.polarity]}`}
            title={b.blurb}
          >
            <span className="font-semibold">{b.name}</span>
            <span className="opacity-80">· {polarityNote[b.polarity]}</span>
            {b.inverted && <span className="font-semibold uppercase tracking-wide">· inverted</span>}
          </span>
        ))}
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Model</th>
              {BENCHMARKS.map(b => (
                <th scope="col" key={b.id} className="px-4 py-2.5 text-center font-medium">
                  <div>{b.name}</div>
                  <div className="text-[9px] normal-case tracking-normal text-slate-400 font-normal">
                    {b.threshold !== undefined
                      ? `${polarityNote[b.polarity]} · thr ${b.threshold}${b.unit ?? ''}`
                      : polarityNote[b.polarity]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MODEL_BENCHMARKS.map((m: ModelBenchmarks) => (
              <tr key={m.model} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-900">{m.model}</td>
                {BENCHMARKS.map(b => {
                  if (b.id === 'ailuminate') {
                    return (
                      <td key={b.id} className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${gradeBadge[m.ailuminate]}`}>
                          {m.ailuminate}
                        </span>
                      </td>
                    );
                  }
                  const v = benchmarkValue(m, b.id);
                  return (
                    <td key={b.id} className={`px-4 py-3 text-center font-semibold ${cellClass(b, v)}`}>
                      {v !== undefined ? fmtValue(b, v) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-slate-100 text-[9px] text-slate-400">
          AILuminate grades run {GRADE_ORDER.join(' → ')} (worst → best). Thresholds are illustrative safety gates, not vendor SLAs.
        </div>
      </div>

      {/* Red-team program */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Icon name="shield-exclamation" className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-900">Red-Team Campaigns</h2>
          </div>
          <div className="space-y-3">
            {CAMPAIGNS.map((c: RedTeamCampaign) => {
              const total = totalFindings(c.findings);
              return (
                <div key={c.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.scope}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{c.method}</div>
                    </div>
                    <span className={`shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded ${statusBadge[c.status]}`}>
                      {statusLabel[c.status]}
                    </span>
                  </div>

                  {/* Findings by severity */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {SEVERITY_ORDER.map(sev => (
                      <span
                        key={sev}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${severityBadge[sev]} ${c.findings[sev] === 0 ? 'opacity-40' : ''}`}
                      >
                        {c.findings[sev]} {sev}
                      </span>
                    ))}
                    <span className="text-[10px] text-slate-400 ml-1">· {total} total</span>
                  </div>

                  {/* Remediation bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.remediationRate >= 75 ? 'bg-emerald-500' : c.remediationRate >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                        style={{ width: `${c.remediationRate}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-slate-600 w-24 text-right">{c.remediationRate}% remediated</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Findings-by-severity chart */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 h-fit">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Findings by Severity</h3>
          <p className="text-[10px] text-slate-400 mb-3">Across all campaigns</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={findingsBySeverity} margin={{ left: 4, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Findings">
                {findingsBySeverity.map(d => (
                  <Cell key={d.severity} fill={severityColor[d.severity]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
            {findingsBySeverity.map(d => (
              <span key={d.severity} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: severityColor[d.severity] }} />
                {d.name} ({d.count})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Explainer */}
      <div className="mt-5 p-4 bg-blue-50 rounded-lg border border-blue-100">
        <div className="text-[11px] font-semibold text-blue-800 mb-1">How this becomes live</div>
        <div className="text-[10px] text-blue-700 leading-relaxed max-w-4xl">
          All figures here are illustrative demo data. In production, benchmark scores would be produced by an
          eval harness — Amazon Bedrock model evaluations for automated + human eval jobs, and the METR / UK AISI
          Inspect framework for red-team and dangerous-capability probes (HarmBench, WMDP, AILuminate, Cybench).
          Campaign findings and remediation would flow from the red-team tracker into this rollup, gating deploy
          decisions in the Safety Cases and Frontier Capability Thresholds surfaces. Polarity matters: HarmBench ASR
          and WMDP are safer when LOWER; treating them as accuracy scores would invert the safety signal.
        </div>
      </div>
    </GovernPageLayout>
  );
}
