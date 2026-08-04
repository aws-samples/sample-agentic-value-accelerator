/**
 * SafetyCases — structured claims–arguments–evidence behind each deploy decision.
 *
 * Renders a selected safety case as a readable GSN/CAE tree: top claim → argument
 * type (Clymer taxonomy) → sub-claims → evidence items, each with a met/partial/
 * unmet status and a cross-link to the platform surface that owns it.
 *
 * Honest framing: the case is the ARGUMENT behind the deploy verdict. Verdict
 * soundness stays expert/qualitative — we structure the argument and surface a
 * coverage completeness signal; we do not auto-judge whether the case is sound.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import GovernPageLayout from '../GovernPageLayout';
import { MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { Icon, type IconName } from '../icons';
import {
  SAFETY_CASES,
  ARGUMENT_TYPES,
  EVIDENCE_TYPE_LABEL,
  evidenceCoverage,
  type CaseStatus,
  type EvidenceStatus,
  type EvidenceType,
} from './safetyCaseData';

const statusBadge: Record<CaseStatus, string> = {
  'draft': 'bg-slate-100 text-slate-600',
  'under-review': 'bg-amber-100 text-amber-700',
  'approved': 'bg-emerald-100 text-emerald-700',
  'rejected': 'bg-rose-100 text-rose-700',
};
const statusLabel: Record<CaseStatus, string> = {
  'draft': 'Draft',
  'under-review': 'Under review',
  'approved': 'Approved',
  'rejected': 'Rejected',
};

const evStatusStyle: Record<EvidenceStatus, { dot: string; text: string; badge: string; label: string }> = {
  'met': { dot: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-50 border-emerald-200', label: 'Met' },
  'partial': { dot: 'bg-amber-500', text: 'text-amber-700', badge: 'bg-amber-50 border-amber-200', label: 'Partial' },
  'unmet': { dot: 'bg-rose-500', text: 'text-rose-700', badge: 'bg-rose-50 border-rose-200', label: 'Unmet' },
};

const evTypeIcon: Record<EvidenceType, IconName> = {
  'eval': 'beaker',
  'guardrail': 'shield-check',
  'hitl': 'user',
  'red-team': 'shield-exclamation',
  'audit': 'clipboard-list',
};

function coverageVariant(pct: number): 'success' | 'warning' | 'danger' {
  return pct >= 75 ? 'success' : pct >= 50 ? 'warning' : 'danger';
}

export default function SafetyCases() {
  const [selectedId, setSelectedId] = useState(SAFETY_CASES[0]?.id ?? '');
  const selected = SAFETY_CASES.find(c => c.id === selectedId) ?? SAFETY_CASES[0];

  const stats = useMemo(() => {
    const total = SAFETY_CASES.length;
    const approved = SAFETY_CASES.filter(c => c.status === 'approved').length;
    const underReview = SAFETY_CASES.filter(c => c.status === 'under-review').length;
    const avgCoverage = total
      ? Math.round(SAFETY_CASES.reduce((s, c) => s + evidenceCoverage(c), 0) / total)
      : 0;
    return { total, approved, underReview, avgCoverage };
  }, []);

  const arg = ARGUMENT_TYPES[selected.argumentType];
  const coverage = evidenceCoverage(selected);
  const allEvidence = selected.subClaims.flatMap(c => c.evidence);
  const metN = allEvidence.filter(e => e.status === 'met').length;
  const partialN = allEvidence.filter(e => e.status === 'partial').length;
  const unmetN = allEvidence.filter(e => e.status === 'unmet').length;

  return (
    <GovernPageLayout
      title="Safety Cases"
      description="Structured claims–arguments–evidence supporting each deploy decision. The Deployment Gate gives the verdict; the safety case gives the argument — organized on the Clymer taxonomy (Inability / Control / Trustworthiness / Deference)."
      badge={<MockDataBadge integration="GSN · CAE · Clymer safety-case taxonomy" />}
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Safety cases" value={stats.total} sub="deployed use cases" />
        <StatCard label="Approved" value={stats.approved} variant={stats.approved ? 'success' : 'muted'} />
        <StatCard label="Under review" value={stats.underReview} variant={stats.underReview ? 'warning' : 'muted'} />
        <StatCard
          label="Avg evidence coverage"
          value={`${stats.avgCoverage}%`}
          variant={coverageVariant(stats.avgCoverage)}
          sub="% of evidence met"
        />
      </div>

      {/* Framing */}
      <div className="mb-6 flex items-start gap-2 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Icon name="information-circle" className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-blue-800 leading-relaxed max-w-4xl">
          A safety case is the <span className="font-semibold">argument</span> behind a deploy verdict — a top claim,
          the argument type that carries it, sub-claims, and the evidence that backs each. We structure and cross-link
          the argument; we do <span className="font-semibold">not</span> auto-judge whether it is sound. The verdict
          stays an expert, qualitative decision. Coverage % is a completeness signal (share of evidence met), not a
          safety score. Illustrative data.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Case selector */}
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Select a case</div>
          <div className="space-y-2">
            {SAFETY_CASES.map(c => {
              const cov = evidenceCoverage(c);
              const isActive = c.id === selected.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${
                    isActive
                      ? 'border-indigo-300 bg-indigo-50/60 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-900">{c.system}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusBadge[c.status]}`}>
                      {statusLabel[c.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                      {ARGUMENT_TYPES[c.argumentType].name}
                    </span>
                    <span className={evStatusStyle[cov >= 75 ? 'met' : cov >= 50 ? 'partial' : 'unmet'].text}>
                      {cov}% evidence met
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Case detail: claims → argument → sub-claims → evidence */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selected.system}</h2>
              <p className="text-[11px] text-slate-500">For: {selected.useCase}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge[selected.status]}`}>
              {statusLabel[selected.status]}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mb-4">
            Owner: {selected.owner} · Last reviewed {selected.lastReviewed}
          </div>

          {/* Coverage strip */}
          <div className="flex items-center gap-4 mb-5 p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex flex-col">
              <span className={`text-2xl font-semibold ${evStatusStyle[coverage >= 75 ? 'met' : coverage >= 50 ? 'partial' : 'unmet'].text}`}>
                {coverage}%
              </span>
              <span className="text-[9px] text-slate-400 uppercase tracking-wide">evidence met</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{metN} met</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{partialN} partial</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />{unmetN} unmet</span>
            </div>
          </div>

          {/* Top claim */}
          <div className="relative pl-4 border-l-2 border-indigo-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-semibold text-indigo-600 uppercase tracking-wide">Top claim</span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed mb-3">{selected.topClaim}</p>

            {/* Argument type */}
            <div className="mb-4 flex items-start gap-2 bg-indigo-50/50 rounded-lg px-3 py-2 border border-indigo-100">
              <Icon name="share" className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Argument type</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{arg.name}</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">{arg.gist}</p>
                <p className="text-[11px] text-slate-500 italic mt-1">{selected.argumentRationale}</p>
              </div>
            </div>

            {/* Sub-claims */}
            <div className="space-y-3">
              {selected.subClaims.map((sub, i) => (
                <div key={i} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-start gap-2 px-4 py-2.5 bg-slate-50/80 border-b border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-400 mt-0.5">C{i + 1}</span>
                    <span className="text-[13px] font-medium text-slate-800 leading-snug">{sub.claim}</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {sub.evidence.map((ev, j) => {
                      const st = evStatusStyle[ev.status];
                      return (
                        <li key={j} className="flex items-start gap-3 px-4 py-2.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border ${st.badge}`}>
                            <Icon name={evTypeIcon[ev.type]} className={`w-3.5 h-3.5 ${st.text}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center flex-wrap gap-2">
                              {ev.link ? (
                                <Link to={ev.link} className="text-[13px] font-medium text-blue-600 hover:underline inline-flex items-center gap-1">
                                  {ev.label}
                                  <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                                </Link>
                              ) : (
                                <span className="text-[13px] font-medium text-slate-700">{ev.label}</span>
                              )}
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                                {EVIDENCE_TYPE_LABEL[ev.type]}
                              </span>
                            </div>
                            {ev.note && <p className="text-[11px] text-slate-500 mt-0.5">{ev.note}</p>}
                          </div>
                          <span className={`flex items-center gap-1 text-[10px] font-semibold ${st.text} flex-shrink-0`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GovernPageLayout>
  );
}
