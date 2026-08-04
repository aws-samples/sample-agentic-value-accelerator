/**
 * AISafety — the AI Safety module hub + RAI Coverage Rubric.
 *
 * Landing for the Safety module: surface cards for each capability, plus the
 * Responsible-AI Coverage Rubric — a per-agent scorecard across AWS's 8 RAI
 * dimensions that aggregates signals the platform already computes. Organized on
 * the 8 dimensions so "coverage across all 8" is the executive view.
 *
 * The rubric READS existing signals (agent scope, guardrails, incidents) and
 * cross-links to the owning surfaces — it does not re-implement controls.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import GovernPageLayout from '../GovernPageLayout';
import { MockDataBadge } from '../DataSourceIndicator';
import { Icon, type IconName } from '../icons';
import UnifiedGuide, { SAFETY_GUIDE } from '../UnifiedGuide';
import { useAgentRegistry } from '../useAgentRegistry';
import { RAI_DIMENSIONS, SAFETY_SURFACES, SAFETY_PHASES, type RaiDimensionId } from './safetyData';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#0f172a', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

type Cov = 'strong' | 'partial' | 'gap';
const covColor: Record<Cov, string> = { strong: '#10b981', partial: '#f59e0b', gap: '#ef4444' };
const covBadge: Record<Cov, string> = {
  strong: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  gap: 'bg-rose-100 text-rose-700',
};
const covLabel: Record<Cov, string> = { strong: 'Strong', partial: 'Partial', gap: 'Gap' };

// Short labels for RAI dimensions, used as chips on the surface cards so each
// card shows which dimensions it serves (the surface→dimension half of the link).
const DIM_SHORT: Record<RaiDimensionId, string> = {
  'fairness': 'Fairness',
  'explainability': 'Explainability',
  'privacy-security': 'Privacy',
  'safety': 'Safety',
  'controllability': 'Control',
  'veracity-robustness': 'Robustness',
  'governance': 'Governance',
  'transparency': 'Transparency',
};

export default function AISafety() {
  const reg = useAgentRegistry();

  // Per-dimension coverage across the fleet — derived from real agent signals
  // where available, else a documented baseline. Honest: signal-backed dimensions
  // reflect the fleet; the rest show the platform's control posture.
  const dimensionCoverage = useMemo(() => {
    const agents = reg.agents;
    const n = agents.length || 1;
    const withGuardrails = agents.filter(a => !!a.guardrailId).length;
    const openIncidents = agents.reduce((s, a) => s + (a.incidents?.openCount ?? 0), 0);
    const guardrailPct = withGuardrails / n;

    // Map each dimension to a coverage grade. Safety/Privacy tie to guardrail
    // coverage (real signal); Controllability/Governance are strong (HITL, audit,
    // enforcement all live); the assurance dimensions are partial (illustrative).
    const grade: Record<RaiDimensionId, Cov> = {
      'fairness': 'partial',
      'explainability': 'strong',
      'privacy-security': guardrailPct >= 0.8 ? 'strong' : guardrailPct >= 0.5 ? 'partial' : 'gap',
      'safety': guardrailPct >= 0.8 ? 'strong' : 'partial',
      'controllability': 'strong',
      'veracity-robustness': 'partial',
      'governance': openIncidents > 0 ? 'partial' : 'strong',
      'transparency': 'partial',
    };
    return grade;
  }, [reg.agents]);

  const grades = RAI_DIMENSIONS.map(d => dimensionCoverage[d.id]);
  const strongN = grades.filter(g => g === 'strong').length;
  const partialN = grades.filter(g => g === 'partial').length;
  const gapN = grades.filter(g => g === 'gap').length;
  const coverageScore = Math.round(((strongN + partialN * 0.5) / RAI_DIMENSIONS.length) * 100);

  const donut = [
    { name: 'Strong', value: strongN, color: covColor.strong },
    { name: 'Partial', value: partialN, color: covColor.partial },
    { name: 'Gap', value: gapN, color: covColor.gap },
  ].filter(d => d.value > 0);

  return (
    <GovernPageLayout
      title="AI Safety"
      description="Capability-safety and assurance for autonomous AI — organized on AWS's 8 Responsible-AI dimensions. Frontier capability thresholds, MAESTRO threat modeling, safety cases, incident management, and red-team evals, with cross-links to the operational controls that enforce them."
      badge={<MockDataBadge integration="AWS Responsible AI · NIST AI RMF · MAESTRO · CoSAI · METR" />}
      backPath="/govern"
      backLabel="Govern"
    >
      {/* Unified Guide (How to Use + Make Live in AWS) */}
      <UnifiedGuide {...SAFETY_GUIDE} />

      {/* ── Safety posture hero ─────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-gradient-to-br from-indigo-50/70 via-white to-white p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          {/* Posture score */}
          <div className="flex items-center gap-4 lg:pr-6 lg:border-r border-slate-200">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={coverageScore >= 75 ? '#10b981' : coverageScore >= 50 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(coverageScore / 100) * 97.4} 97.4`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-slate-900">{coverageScore}%</span>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Responsible-AI Safety Posture</div>
              <div className="text-[11px] text-slate-500 max-w-xs">Coverage across AWS's 8 RAI dimensions. Target ≥ 75%. Most surfaces are illustrative in this edition — this is a coverage map, not a live safety score.</div>
            </div>
          </div>
          {/* Coverage breakdown pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500" />{strongN} strong</span>
            <span className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-medium"><span className="w-2 h-2 rounded-full bg-amber-500" />{partialN} partial</span>
            <span className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-medium"><span className="w-2 h-2 rounded-full bg-rose-500" />{gapN} gaps</span>
            <span className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium">
              {SAFETY_SURFACES.filter(s => s.status === 'live').length} live · {SAFETY_SURFACES.filter(s => s.status === 'illustrative').length} illustrative
            </span>
          </div>
        </div>
      </div>

      {/* ── Safety lifecycle: surfaces grouped by phase ──────────────────── */}
      <div className="mb-8">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Safety lifecycle</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {SAFETY_PHASES.map((phase, pi) => {
            const surfaces = SAFETY_SURFACES.filter(s => s.phase === phase.id && s.id !== 'rubric');
            return (
              <div key={phase.id} className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">{pi + 1}</span>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">{phase.name}</div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 mb-2 ml-7">{phase.blurb}</div>
                <div className="space-y-2 flex-1">
                  {surfaces.map(s => (
                    <Link key={s.id} to={s.path} className="group block bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-3 hover:border-indigo-300 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                          <Icon name={s.icon as IconName} className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${s.status === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {s.status === 'live' ? '● LIVE' : 'illustrative'}
                        </span>
                      </div>
                      <div className="text-[12px] font-semibold text-slate-900 group-hover:text-indigo-700 leading-tight">{s.name}</div>
                      {s.tag && <div className="text-[9px] text-slate-400 mt-0.5">{s.tag}</div>}
                      <p className="text-[10px] text-slate-500 leading-relaxed mt-1 mb-2">{s.blurb}</p>
                      <div className="flex flex-wrap gap-1">
                        {s.dimensions.slice(0, 3).map(dim => (
                          <span key={dim} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">{DIM_SHORT[dim]}</span>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RAI Coverage Rubric ──────────────────────────────────────────── */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Responsible-AI Coverage Rubric</h2>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">AWS 8 dimensions · NIST crosswalk</span>
      </div>
      <p className="text-[11px] text-slate-500 max-w-3xl mb-4">
        Coverage across the 8 Responsible-AI dimensions, aggregating signals the platform already computes. Each dimension links to the surface that evidences it — the rubric consolidates, it doesn't re-implement.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Coverage Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {donut.map(d => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 -mt-2">
            {donut.map(d => (
              <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Dimension</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">NIST crosswalk</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Evidenced by</th>
                <th scope="col" className="px-4 py-2.5 text-center font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {RAI_DIMENSIONS.map(d => {
                const cov = dimensionCoverage[d.id];
                return (
                  <tr key={d.id} className="hover:bg-slate-50/60 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{d.name}</div>
                      <div className="text-[10px] text-slate-500 max-w-xs">{d.blurb}</div>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">{d.nistCrosswalk}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {d.evidencedBy.map(e => (
                          <Link key={e.to} to={e.to} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-blue-600 hover:bg-blue-50 font-medium">{e.label}</Link>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${covBadge[cov]}`}>{covLabel[cov]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </GovernPageLayout>
  );
}
