/**
 * ThreatModeling — threat-first modeling of autonomous capabilities.
 *
 * The gap this fills: the platform was threat-AWARE (OWASP T1–T17 tagged in the
 * risk register) but not threat-FIRST. Here you pick an autonomous capability
 * (web-search sub-agent, tool use, multi-agent delegation, code exec, …) and see
 * its OWASP threat exposure, the platform controls that mitigate each threat, the
 * residual after those controls, and any coverage gaps — before deployment.
 *
 * Grounded in OWASP Agentic AI — Threats & Mitigations v1.1 (T1–T17) and mapped
 * to the platform's real controls (guardrails, autonomy gate, A2A ceiling, HITL,
 * audit log, Cedar policy, kill switch).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { Icon, type IconName } from './icons';
import {
  CAPABILITIES,
  scoreCapability,
  capabilityExposure,
  threatRag,
  threatMeta,
  threatName,
  CONTROLS,
  MAESTRO_LAYERS,
  MAESTRO_CROSS_LAYER,
  type ControlId,
} from './threatModelData';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#0f172a', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

const ragBadge: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-rose-100 text-rose-700',
};
const ragDot: Record<string, string> = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' };

export default function ThreatModeling() {
  const [view, setView] = useState<'capability' | 'maestro'>('capability');
  const [capId, setCapId] = useState(CAPABILITIES[0].id);
  const cap = CAPABILITIES.find(c => c.id === capId) ?? CAPABILITIES[0];
  const scored = scoreCapability(cap);
  const exposure = capabilityExposure(cap);

  // All distinct controls referenced by this capability's threats.
  const usedControlIds = Array.from(new Set(cap.threats.flatMap(t => t.controls))) as ControlId[];

  const inherentVsResidual = scored.map(s => ({
    name: s.threat,
    inherent: s.inherent,
    residual: s.residual,
  }));

  return (
    <GovernPageLayout
      title="Threat Modeling"
      description="Threat-first modeling of autonomous capabilities — decompose by MAESTRO's 7 layers or by capability, map to OWASP Agentic threats (T1–T17), and see the platform controls that mitigate each with residual exposure and coverage gaps."
      badge={<MockDataBadge integration="MAESTRO (CSA) · OWASP Agentic AI Threats v1.1" />}
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {/* View switcher: MAESTRO layers vs by-capability */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist" aria-label="Threat model view">
        {([['maestro', 'MAESTRO Layers'], ['capability', 'By Capability']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'maestro' && (
        <div role="tabpanel">
          <p className="text-[12px] text-slate-600 max-w-3xl mb-4">
            MAESTRO (Multi-Agent Environment, Security, Threat, Risk &amp; Outcome) decomposes an agentic system into 7 layers. Each layer carries its own threat landscape; cross-layer threats span them. OWASP T-codes are the threat vocabulary placed on each layer.
          </p>
          {/* 7-layer stack */}
          <div className="space-y-2 mb-6">
            {MAESTRO_LAYERS.map(l => (
              <div key={l.id} className={`rounded-xl border p-4 ${l.id === 'sec-compliance' ? 'bg-indigo-50/60 border-indigo-200' : 'bg-white border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">L{l.n}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{l.name}</span>
                      {l.id === 'sec-compliance' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">vertical · cuts across all</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{l.blurb}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {l.threats.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{t} · {threatName(t)}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Cross-layer threats */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Cross-Layer Threats</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Attacks that span layers — MAESTRO's core emphasis for multi-agent systems.</p>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {MAESTRO_CROSS_LAYER.map(c => (
                  <tr key={c.name} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3 font-medium text-slate-900 w-56">{c.name}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">{c.blurb}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 justify-end">
                        {c.owasp.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">{t}</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'capability' && (<div role="tabpanel">
      {/* Capability selector */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Autonomous capability</div>
        <div className="flex flex-wrap gap-2">
          {CAPABILITIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCapId(c.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                c.id === capId ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon name={c.icon as IconName} className="w-4 h-4" />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-slate-600 max-w-3xl mb-4">{cap.description}</p>

      {/* Exposure summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Threats Modeled" value={scored.length} variant="info" sub="OWASP T-codes" />
        <StatCard label="Peak Inherent Risk" value={exposure.inherentMax} variant="muted" sub="L×I, max 25" />
        <StatCard label="Peak Residual Risk" value={exposure.residualMax} variant={threatRag(exposure.residualMax) === 'red' ? 'danger' : threatRag(exposure.residualMax) === 'amber' ? 'warning' : 'success'} sub="after controls" />
        <StatCard label="Coverage Gaps" value={exposure.gaps} variant={exposure.gaps ? 'danger' : 'success'} sub="threats w/ unbuilt control" />
      </div>

      {/* Inherent vs residual chart */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Inherent vs Residual Risk by Threat</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={inherentVsResidual} margin={{ left: 4, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
              <YAxis domain={[0, 25]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="inherent" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Inherent" />
              <Bar dataKey="residual" fill="#6366f1" radius={[4, 4, 0, 0]} name="Residual (after controls)" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300" />Inherent</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Residual (after controls)</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Mitigating Controls</h3>
          <div className="space-y-1.5">
            {usedControlIds.map(id => {
              const c = CONTROLS[id];
              return (
                <Link key={id} to={c.to} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <span className="text-xs font-medium text-slate-800">{c.name}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${c.built ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.built ? 'built' : 'roadmap'}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Threat × control matrix */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Threat → Control Mapping</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Each threat's residual is reduced by the built controls mapped to it. Amber controls are roadmap (don't yet reduce residual).</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Threat</th>
              <th scope="col" className="px-4 py-2.5 text-center font-medium">Inherent</th>
              <th scope="col" className="px-4 py-2.5 text-center font-medium">Residual</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Mitigating Controls</th>
              <th scope="col" className="px-4 py-2.5 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scored.map(s => {
              const meta = threatMeta(s.threat);
              const rag = threatRag(s.residual);
              return (
                <tr key={s.threat} className="hover:bg-slate-50/40 align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">{s.threat}</span>
                      <span className="font-medium text-slate-900">{s.name}</span>
                    </div>
                    {meta && <div className="text-[10px] text-slate-500 max-w-md mt-0.5">{meta.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-400">{s.inherent}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: ragDot[rag] }} />
                      <span className="tabular-nums font-semibold text-slate-800">{s.residual}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.controls.map(c => (
                        <span key={c.id} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${c.built ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                          {c.name}{c.built ? '' : ' (roadmap)'}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${ragBadge[rag]}`}>
                      {rag === 'green' ? 'Mitigated' : rag === 'amber' ? 'Monitor' : 'Elevated'}
                    </span>
                    {s.coverageGap && <div className="text-[9px] text-amber-600 mt-1">gap</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>)}
    </GovernPageLayout>
  );
}
