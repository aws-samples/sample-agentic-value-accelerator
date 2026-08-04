/**
 * ModelExplainability — "Explainability" tab for Model Management.
 *
 * Five sections, model-scoped:
 *   1. Feature Attribution (SHAP / LIME / Anchor)
 *   2. Adverse-Action Notices (ECOA / Reg B)
 *   3. Counterfactuals / What-If
 *   4. Drift Explainability (root-cause drivers; links to Monitoring for trends)
 *   5. Decision Audit Trail (per-decision record + integrity verification)
 *
 * Bias & fairness has its own first-class tab (see BiasFairness.tsx).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { tooltipStyle } from './mockData';
import {
  MODEL_EXPLAINABILITY, EXPLAIN_MODELS,
  type ShapValue, type LimeFeature,
} from './explainData';

type Section = 'attribution' | 'adverse' | 'counterfactual' | 'drift' | 'audit';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'attribution', label: 'Feature Attribution' },
  { id: 'adverse', label: 'Adverse Action' },
  { id: 'counterfactual', label: 'Counterfactuals' },
  { id: 'drift', label: 'Drift Drivers' },
  { id: 'audit', label: 'Decision Audit' },
];

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';
const heading = 'text-sm font-semibold text-slate-900';

export default function ModelExplainability({ modelId: propModelId, onNavigateTab }: { modelId?: string; onNavigateTab?: (tab: string) => void } = {}) {
  // Use the shared dossier model when provided; otherwise stand alone with a local selector.
  const [localModelId, setLocalModelId] = useState(EXPLAIN_MODELS[0].id);
  const modelId = propModelId && MODEL_EXPLAINABILITY[propModelId] ? propModelId : localModelId;
  const [section, setSection] = useState<Section>('attribution');
  const data = MODEL_EXPLAINABILITY[modelId];

  return (
    <div className="space-y-6">
      {/* Intro (model is chosen by the shared dossier pill when embedded) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Explainability</h2>
          <p className="text-[11px] text-slate-500">
            Feature attribution, adverse-action transparency, counterfactuals, drift root-cause, and a tamper-evident decision trail.
            Bias &amp; fairness testing has its own <Link to="/govern/models?tab=bias" className="text-blue-600 hover:text-blue-700 font-medium">tab →</Link>.
          </p>
        </div>
        {!propModelId && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Model
            <select
              value={modelId}
              onChange={e => setLocalModelId(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              {EXPLAIN_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Section sub-nav */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto" role="tablist">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              section === s.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'attribution' && <AttributionSection data={data.attribution} />}
      {section === 'adverse' && <AdverseSection notice={data.adverseAction} />}
      {section === 'counterfactual' && <CounterfactualSection cf={data.counterfactual} />}
      {section === 'drift' && <DriftSection drift={data.drift} onNavigateTab={onNavigateTab} />}
      {section === 'audit' && <AuditSection decisions={data.decisions} />}
    </div>
  );
}

/* ───────── 1. Feature Attribution ───────── */
function AttributionSection({ data }: { data: typeof MODEL_EXPLAINABILITY[string]['attribution'] }) {
  const [tab, setTab] = useState<'shap' | 'lime' | 'anchor'>('shap');
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Explained prediction</div>
        <div className="text-xs text-slate-700 mb-2"><span className="font-semibold text-blue-600">Prompt:</span> {data.prompt}</div>
        <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100 max-h-28 overflow-auto">{data.response}</div>
      </div>

      <div className="flex gap-1">
        {(['shap', 'lime', 'anchor'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'}`}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'shap' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={card}>
            <h3 className={heading}>SHAP — feature contributions</h3>
            <p className="text-[10px] text-slate-400 mb-3">Base {data.shap.base_value.toFixed(2)} → final {data.shap.final_value.toFixed(2)}</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.shap.shap_values.map((s: ShapValue) => ({ name: s.feature, value: s.shap_value, dir: s.direction }))} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fill: '#475569', fontSize: 9 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" barSize={14} radius={[0, 4, 4, 0]}>
                  {data.shap.shap_values.map((s, i) => <Cell key={i} fill={s.direction === 'positive' ? '#10b981' : '#dc2626'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={card}>
            <h3 className={`${heading} mb-3`}>Quality dimensions</h3>
            <div className="space-y-2">
              {Object.entries(data.shap.dimensions).map(([dim, d]) => (
                <div key={dim} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 capitalize">{dim.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] font-bold text-emerald-600">{Math.round(d.score * 100)}%</span>
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">{d.explanation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'lime' && (
        <div className={card}>
          <h3 className={`${heading} mb-1`}>LIME — local feature weights</h3>
          <p className="text-[10px] text-slate-400 mb-3">Overall confidence {Math.round(data.lime.overall_confidence * 100)}%</p>
          <div className="space-y-2">
            {data.lime.features.map((f: LimeFeature, i) => (
              <div key={i} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-700">{f.feature}</span>
                  <span className={`text-[9px] font-bold px-1.5 rounded ${f.contribution === 'positive' ? 'bg-emerald-100 text-emerald-700' : f.contribution === 'negative' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                    {f.weight.toFixed(2)} · {f.contribution}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mb-1">
                  <div className="h-full rounded-full" style={{ width: `${f.weight * 100}%`, backgroundColor: f.contribution === 'positive' ? '#10b981' : f.contribution === 'negative' ? '#dc2626' : '#94a3b8' }} />
                </div>
                <div className="text-[9px] text-slate-500">{f.explanation}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-3 italic">{data.lime.interpretation}</div>
        </div>
      )}

      {tab === 'anchor' && (
        <div className={card}>
          <h3 className={`${heading} mb-1`}>Anchor — decision rules</h3>
          <p className="text-[10px] text-slate-400 mb-3">Overall precision {Math.round(data.anchor.overall_precision * 100)}% · coverage {Math.round(data.anchor.overall_coverage * 100)}%</p>
          <div className="space-y-2">
            {data.anchor.anchors.map((a, i) => (
              <div key={i} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100" style={{ borderLeft: '3px solid #8b5cf6' }}>
                <div className="text-[11px] font-mono text-slate-700">{a.rule}</div>
                <div className="flex gap-2 mt-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">precision {Math.round(a.precision * 100)}%</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">coverage {Math.round(a.coverage * 100)}%</span>
                </div>
                <div className="text-[9px] text-slate-500 mt-1">{a.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── 2. Adverse Action ───────── */
function AdverseSection({ notice }: { notice: typeof MODEL_EXPLAINABILITY[string]['adverseAction'] }) {
  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-1">
        <h3 className={heading}>{notice.notice_type}</h3>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">{notice.action_taken}</span>
      </div>
      <p className="text-[10px] text-slate-400 mb-4">{notice.regulation} · {notice.date}</p>

      <div className="text-xs text-slate-700 mb-3">Dear {notice.applicant}, we are unable to approve your {notice.application_type} application. The principal reasons are:</div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
            <th scope="col" className="py-2 px-3 text-left font-medium w-10">Rank</th>
            <th scope="col" className="py-2 px-3 text-left font-medium">Principal Reason</th>
            <th scope="col" className="py-2 px-3 text-left font-medium">Category</th>
            <th scope="col" className="py-2 px-3 text-center font-medium w-24">Weight</th>
          </tr>
        </thead>
        <tbody>
          {notice.reasons.map(r => (
            <tr key={r.rank} className="border-t border-slate-100">
              <td className="py-2 px-3 text-slate-400">{r.rank}</td>
              <td className="py-2 px-3 font-medium text-slate-800">{r.reason}</td>
              <td className="py-2 px-3"><span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{r.category}</span></td>
              <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${r.weight * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 w-8">{r.weight.toFixed(2)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Credit Bureau</div>
          <div className="text-xs text-slate-700">{notice.credit_bureau.name}</div>
          <div className="text-[10px] text-slate-500">{notice.credit_bureau.address}</div>
          <div className="text-[10px] text-slate-500">{notice.credit_bureau.phone}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Applicant Rights</div>
          <ul className="text-[10px] text-slate-600 space-y-1 list-disc list-inside">
            {notice.applicant_rights.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      </div>
      <div className="text-[10px] text-slate-400 mt-3">{notice.cfpb_contact}</div>
    </div>
  );
}

/* ───────── 3. Counterfactuals ───────── */
function CounterfactualSection({ cf }: { cf: typeof MODEL_EXPLAINABILITY[string]['counterfactual'] }) {
  const chip = (v: string) => v === 'high' ? 'bg-emerald-100 text-emerald-700' : v === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600';
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">Current: {cf.current_decision}</span>
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Target: {cf.target_decision}</span>
          <span className="ml-auto text-[10px] text-slate-500">{cf.minimum_changes_needed} minimum changes needed</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2 px-3 text-left font-medium">Factor</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Current</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Required</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">Impact</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">Feasibility</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Timeframe</th>
            </tr>
          </thead>
          <tbody>
            {cf.counterfactuals.map((c, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-2 px-3 font-medium text-slate-800">{c.factor}</td>
                <td className="py-2 px-3 text-rose-600">{c.current_value}</td>
                <td className="py-2 px-3 text-emerald-600">{c.required_value}</td>
                <td className="py-2 px-3 text-center"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${chip(c.impact)}`}>{c.impact}</span></td>
                <td className="py-2 px-3 text-center"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${chip(c.feasibility)}`}>{c.feasibility}</span></td>
                <td className="py-2 px-3 text-[11px] text-slate-500">{c.timeframe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={card}>
          <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">Easiest Path</div>
          <div className="text-xs text-slate-600">{cf.easiest_path}</div>
        </div>
        <div className={card}>
          <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Regulatory Note</div>
          <div className="text-xs text-slate-600">{cf.regulatory_note}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────── 4. Drift Drivers ───────── */
function DriftSection({ drift, onNavigateTab }: { drift: typeof MODEL_EXPLAINABILITY[string]['drift']; onNavigateTab?: (tab: string) => void }) {
  const statusColor = drift.status === 'stable' ? 'text-emerald-600' : drift.status === 'drifting' ? 'text-amber-600' : 'text-rose-600';
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <h3 className={heading}>Drift root-cause</h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${drift.status === 'stable' ? 'bg-emerald-100 text-emerald-700' : drift.status === 'drifting' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
            {drift.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 mb-3">
          <span>Overall PSI: <span className={`font-bold ${statusColor}`}>{drift.overallPsi.toFixed(3)}</span> <span className="text-slate-400">(&gt;0.25 significant)</span></span>
          <span>{drift.window}</span>
        </div>
        <div className="space-y-2">
          {drift.drivers.map((d, i) => (
            <div key={i} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-700">{d.feature}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">PSI {d.psi.toFixed(3)}</span>
                  <span className="text-[10px] text-slate-500 w-10 text-right">{Math.round(d.contribution * 100)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mb-1">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${d.contribution * 100}%` }} />
              </div>
              <div className="text-[9px] text-slate-500">{d.shiftDescription}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-slate-500 mt-3">{drift.summary}</div>
      </div>
      <div className="text-[10px] text-slate-400 px-1">
        This view explains <em>why</em> the input distribution is shifting. For drift trend lines and quality/hallucination signals over time, see{' '}
        {onNavigateTab
          ? <button onClick={() => onNavigateTab('monitoring')} className="text-blue-600 hover:text-blue-700 font-medium">Monitoring →</button>
          : <Link to="/govern/models?tab=monitoring" className="text-blue-600 hover:text-blue-700">Monitoring</Link>}.
      </div>
    </div>
  );
}

/* ───────── 5. Decision Audit ───────── */
function AuditSection({ decisions }: { decisions: typeof MODEL_EXPLAINABILITY[string]['decisions'] }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className={heading}>Decision Audit Trail</h3>
        <span className="text-[10px] text-slate-400">Tamper-evident · SHA-256 integrity per record</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
            <th scope="col" className="py-2.5 px-5 text-left font-medium">Run / Time</th>
            <th scope="col" className="py-2.5 px-3 text-left font-medium">Decision</th>
            <th scope="col" className="py-2.5 px-3 text-left font-medium">Method</th>
            <th scope="col" className="py-2.5 px-3 text-left font-medium">Use Case</th>
            <th scope="col" className="py-2.5 px-3 text-left font-medium">Inputs</th>
            <th scope="col" className="py-2.5 px-3 text-left font-medium">Actor</th>
            <th scope="col" className="py-2.5 px-5 text-left font-medium">Integrity</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map(d => (
            <tr key={d.runId} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
              <td className="py-2.5 px-5">
                <div className="font-mono text-[10px] text-slate-700">{d.runId}</div>
                <div className="text-[10px] text-slate-400">{d.timestamp.replace('T', ' ').replace('Z', '')}</div>
              </td>
              <td className="py-2.5 px-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${d.decision === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{d.decision}</span></td>
              <td className="py-2.5 px-3 text-[11px] text-slate-600">{d.method}</td>
              <td className="py-2.5 px-3 text-[11px] text-slate-600">{d.useCase}</td>
              <td className="py-2.5 px-3 text-[11px] text-slate-500">{d.inputsSummary}</td>
              <td className="py-2.5 px-3 text-[11px] text-slate-500">{d.actor}</td>
              <td className="py-2.5 px-5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${d.integrity === 'INTACT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {d.integrity === 'INTACT' ? '✓ INTACT' : '⚠ TAMPERED'}
                  </span>
                </div>
                <div className="font-mono text-[9px] text-slate-400 mt-0.5">{d.integrityHash}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-3 text-[10px] text-slate-400 border-t border-slate-100">
        Each decision record captures inputs, model version, the explanation snapshot, actor, and timestamp, hashed for tamper-evidence — exportable as a regulator evidence pack (SR 11-7, ECOA, EU AI Act).
      </div>
    </div>
  );
}
