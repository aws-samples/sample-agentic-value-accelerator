/**
 * FrontierThresholds — per-model Frontier Capability Thresholds register.
 *
 * The frontier-safety pattern all labs converged on: critical capability
 * threshold → dangerous-capability eval → deploy/no-deploy gate. This surface is
 * the register: per model, which framework/level covers it (FMSF / ASL-N /
 * Preparedness tier / CCL), the Seoul-commitment attestation, and eval status
 * across the three FMSF critical-capability domains (CBRN, offensive cyber,
 * autonomy/ARA). It feeds the existing Deployment Gate as a capability-gating
 * input.
 *
 * HONESTY (design doc §6): we surface the lab's ATTESTATION and reported eval
 * status — we do NOT auto-judge dangerous capability. The deploy-gate verdict is
 * a mechanical roll-up of the attested statuses, not an independent judgment.
 * Data is illustrative.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import GovernPageLayout from '../GovernPageLayout';
import { MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { Icon } from '../icons';
import {
  CAPABILITY_DOMAINS,
  FRONTIER_MODELS,
  deriveVerdict,
  STATUS_COLOR,
  STATUS_BADGE,
  STATUS_LABEL,
  VERDICT_COLOR,
  VERDICT_BADGE,
  VERDICT_LABEL,
  type DeployVerdict,
  type ThresholdStatus,
} from './frontierThresholdsData';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#0f172a', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

export default function FrontierThresholds() {
  const rows = useMemo(
    () => FRONTIER_MODELS.map(m => ({ model: m, verdict: deriveVerdict(m) })),
    [],
  );

  const clearedN = rows.filter(r => r.verdict === 'cleared').length;
  const conditionalN = rows.filter(r => r.verdict === 'conditional').length;
  const blockedN = rows.filter(r => r.verdict === 'blocked').length;

  const verdictBars: { verdict: DeployVerdict; label: string; value: number }[] = [
    { verdict: 'cleared', label: VERDICT_LABEL.cleared, value: clearedN },
    { verdict: 'conditional', label: VERDICT_LABEL.conditional, value: conditionalN },
    { verdict: 'blocked', label: VERDICT_LABEL.blocked, value: blockedN },
  ];

  return (
    <GovernPageLayout
      title="Frontier Capability Thresholds"
      description="Per-model register of dangerous-capability thresholds and framework attestation — the frontier-safety pattern all labs converged on: critical capability threshold → dangerous-capability eval → deploy/no-deploy gate. Tracks CBRN, offensive cyber, and autonomy/ARA across each governing framework, feeding the Deployment Gate."
      badge={<MockDataBadge integration="Amazon FMSF · Anthropic RSP · OpenAI Preparedness · DeepMind FSF · METR" />}
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {/* Honesty seam — we surface attestation, we do not auto-judge capability */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
        <Icon name="flag" className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-[12px] text-amber-900 leading-relaxed">
          <span className="font-semibold">We surface attestation, we do not auto-judge capability.</span>{' '}
          Dangerous-capability determination is the lab's own expert eval (often needing white-box access AVA lacks).
          This register consolidates the framework/level each model is governed under, the Seoul/Korea Frontier AI
          Safety Commitment attestation, and the lab-reported eval status per critical-capability domain. The deploy-gate
          verdict below is a mechanical roll-up of those attested statuses — not an independent judgment. Where a
          benchmark is inverted (e.g. WMDP-style: <span className="font-medium">lower is safer</span>) it is labelled as such.
          Data is illustrative.
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Models tracked" value={rows.length} variant="info" sub="in the register" />
        <StatCard label="Cleared" value={clearedN} variant="success" sub="all domains below threshold" />
        <StatCard label="Conditional" value={conditionalN} variant={conditionalN ? 'warning' : 'muted'} sub="a domain approaching" />
        <StatCard label="Blocked" value={blockedN} variant={blockedN ? 'danger' : 'muted'} sub="a domain exceeded" />
      </div>

      {/* Matrix: models × 3 capability domains */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-6">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Icon name="cpu-chip" className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Capability-Threshold Matrix</h2>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">FMSF critical-capability domains</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Model</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Framework / Level</th>
                <th scope="col" className="px-4 py-2.5 text-center font-medium">Seoul commitment</th>
                {CAPABILITY_DOMAINS.map(d => (
                  <th scope="col" key={d.id} className="px-4 py-2.5 text-left font-medium" title={d.blurb}>{d.short}</th>
                ))}
                <th scope="col" className="px-4 py-2.5 text-center font-medium">Deploy gate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ model, verdict }) => (
                <tr key={model.id} className="hover:bg-slate-50/60 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{model.name}</div>
                    <div className="text-[10px] text-slate-500">{model.vendor}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{model.frameworkTag}</span>
                    <div className="text-[10px] text-slate-500 mt-1">{model.framework}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {model.seoulCommitment ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        <Icon name="check-circle" className="w-3 h-3" /> Attested
                      </span>
                    ) : (
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-400">Not attested</span>
                    )}
                  </td>
                  {CAPABILITY_DOMAINS.map(d => {
                    const ev = model.evals[d.id];
                    return (
                      <td key={d.id} className="px-4 py-3">
                        <span className={`inline-block text-[9px] font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[ev.status]}`}>
                          {STATUS_LABEL[ev.status]}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1 max-w-[16rem]">{ev.note}</div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${VERDICT_BADGE[verdict]}`}>{VERDICT_LABEL[verdict]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center gap-4">
          {(Object.keys(STATUS_LABEL) as ThresholdStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1.5 text-[10px] text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Deploy-gate explainer */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="shield-check" className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-900">Feeds the Deployment Gate</h3>
          </div>
          <p className="text-[12px] text-slate-600 leading-relaxed mb-3">
            This register is a <span className="font-medium">capability-gating input</span> to the existing Deployment
            Gate — which previously checked only responsible-AI eval quality, not dangerous-capability status. The
            mechanical roll-up: any domain <span className="font-medium text-rose-600">exceeded</span> → blocked; any
            domain <span className="font-medium text-amber-600">approaching</span> → conditional; otherwise cleared. A
            <span className="font-medium"> not-evaluated</span> domain does not block on its own but is surfaced as a
            coverage gap for the safety case.
          </p>
          <Link
            to="/govern/models?tab=gate"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Icon name="arrow-right" className="w-3.5 h-3.5" /> Open the Deployment Gate
          </Link>
        </div>

        {/* Verdict distribution */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Deploy-Gate Verdicts</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={verdictBars} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {verdictBars.map(b => <Cell key={b.verdict} fill={VERDICT_COLOR[b.verdict]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </GovernPageLayout>
  );
}
