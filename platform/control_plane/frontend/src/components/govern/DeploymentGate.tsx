/**
 * DeploymentGate — Safety deployment gate UI.
 *
 * Shows the aggregate "cleared / conditional / blocked" verdict per model and
 * the individual eval/safety/RAG/fairness checks behind it. This is the bridge
 * from Evaluations → governance: a blocked gate stops production promotion.
 */

import { useState } from 'react';
import { allModelGates, computeModelGate, APPROVAL_STATUS, type GateVerdict, type GateStatus } from './deploymentGateData';
import { MODELS } from './mockData';
import { rowButtonProps } from './a11y';

const verdictMeta: Record<GateVerdict, { label: string; badge: string; dot: string; ring: string }> = {
  cleared: { label: 'Cleared', badge: 'bg-emerald-100 text-emerald-700', dot: '#10b981', ring: 'border-emerald-300' },
  conditional: { label: 'Conditional', badge: 'bg-amber-100 text-amber-700', dot: '#f59e0b', ring: 'border-amber-300' },
  blocked: { label: 'Blocked', badge: 'bg-rose-100 text-rose-700', dot: '#dc2626', ring: 'border-rose-300' },
};

const statusMeta: Record<GateStatus, { badge: string; icon: string }> = {
  pass: { badge: 'bg-emerald-100 text-emerald-700', icon: '✓' },
  warning: { badge: 'bg-amber-100 text-amber-700', icon: '!' },
  fail: { badge: 'bg-rose-100 text-rose-700', icon: '✕' },
};

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';

function modelName(id: string) {
  return MODELS.find(m => m.id === id)?.name ?? id;
}

export default function DeploymentGate({ modelId, onSelectModel, onNavigateTab }: { modelId?: string; onSelectModel?: (id: string) => void; onNavigateTab?: (tab: string) => void } = {}) {
  const gates = allModelGates();
  const [localSelected, setLocalSelected] = useState(gates[0]?.modelId ?? '');
  // Follow the shared dossier model when embedded; else use local row-click selection.
  const selected = modelId && gates.some(g => g.modelId === modelId) ? modelId : localSelected;
  const setSelected = (id: string) => { setLocalSelected(id); onSelectModel?.(id); };
  const gate = computeModelGate(selected);

  // Maps a gate check category to the eval tab that produced it.
  const checkTab: Record<string, string> = { Evaluation: 'evaluations', RAG: 'rag', Fairness: 'bias', Safety: 'evaluations' };

  const cleared = gates.filter(g => g.verdict === 'cleared').length;
  const blocked = gates.filter(g => g.verdict === 'blocked').length;
  const conditional = gates.filter(g => g.verdict === 'conditional').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Safety Deployment Gate</h2>
        <p className="text-[11px] text-slate-500">Aggregates evaluation, safety, RAG, and fairness results into a production go/no-go decision, mapped to SageMaker Model Registry <span className="font-medium">ModelApprovalStatus</span>. A blocking failure stops promotion until resolved; the verdict and evidence are recorded on the model card.</p>
      </div>

      {/* Fleet summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${card} !p-4`} style={{ borderTop: '3px solid #10b981' }}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Cleared</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-600">{cleared}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">ready to promote</div>
        </div>
        <div className={`${card} !p-4`} style={{ borderTop: '3px solid #f59e0b' }}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Conditional</div>
          <div className="text-2xl font-semibold mt-1 text-amber-600">{conditional}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">sign-off required</div>
        </div>
        <div className={`${card} !p-4`} style={{ borderTop: '3px solid #dc2626' }}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Blocked</div>
          <div className="text-2xl font-semibold mt-1 text-rose-600">{blocked}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">promotion halted</div>
        </div>
      </div>

      {/* Fleet gate list */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Fleet Gate Status</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2.5 px-5 text-left font-medium">Model</th>
              <th scope="col" className="py-2.5 px-3 text-center font-medium">Verdict</th>
              <th scope="col" className="py-2.5 px-3 text-center font-medium">Checks</th>
              <th scope="col" className="py-2.5 px-5 text-left font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {gates.map(g => {
              const vm = verdictMeta[g.verdict];
              return (
                <tr key={g.modelId}
                  {...rowButtonProps(() => setSelected(g.modelId), `Select ${modelName(g.modelId)} gate`)}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors focus:outline-none focus:bg-blue-50/50 ${selected === g.modelId ? 'bg-blue-50/40' : ''}`}>
                  <td className="py-2.5 px-5 font-medium text-slate-800">{modelName(g.modelId)}</td>
                  <td className="py-2.5 px-3 text-center"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${vm.badge}`}>{vm.label}</span></td>
                  <td className="py-2.5 px-3 text-center text-[11px] text-slate-500">
                    {g.checks.filter(c => c.status === 'pass').length}/{g.checks.length} pass
                  </td>
                  <td className="py-2.5 px-5 text-[11px] text-slate-500">{g.summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected model gate detail */}
      <div className={`bg-white/80 backdrop-blur-sm rounded-xl border-2 ${verdictMeta[gate.verdict].ring} p-5 shadow-sm`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: verdictMeta[gate.verdict].dot }} />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{modelName(gate.modelId)}</h3>
              <p className="text-[11px] text-slate-500">{gate.summary}</p>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xs font-bold px-3 py-1 rounded-lg ${verdictMeta[gate.verdict].badge}`}>
              {gate.verdict === 'cleared' ? '✓ Cleared for Production' : gate.verdict === 'conditional' ? '! Conditional' : '✕ Blocked'}
            </span>
            <div className="text-[9px] text-slate-400 mt-1 font-mono">ModelApprovalStatus: {APPROVAL_STATUS[gate.verdict]}</div>
          </div>
        </div>

        <div className="space-y-2">
          {gate.checks.map(c => {
            const sm = statusMeta[c.status];
            return (
              <div key={c.id} className="flex items-start gap-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
                <span className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>{sm.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-800">
                      {c.label}
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 font-normal">{c.category}</span>
                      {c.blocking && c.status === 'fail' && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">blocking</span>}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      <span className="text-slate-400">{c.requirement}</span> · <span className="font-semibold">{c.value}</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{c.detail}</div>
                </div>
                {onNavigateTab && checkTab[c.category] && (
                  <button
                    onClick={() => onNavigateTab(checkTab[c.category])}
                    className="text-[10px] text-blue-600 hover:text-blue-700 font-medium flex-shrink-0 self-center"
                  >
                    View →
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {gate.verdict === 'blocked' && (
          <div className="mt-4 text-[10px] text-rose-600 bg-rose-50 rounded-lg p-3 border border-rose-100">
            Production promotion is blocked. Resolve the blocking failure(s) above and re-run the affected evaluation before requesting promotion. The gate result is recorded in the model's lifecycle evidence.
          </div>
        )}

        {/* Forward step: promote / record on the model card */}
        {onNavigateTab && (
          <div className="mt-4 flex items-center gap-3 pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">Next:</span>
            {gate.verdict === 'blocked'
              ? <span className="text-[11px] text-rose-600">Resolve blocking checks before promotion.</span>
              : <button onClick={() => onNavigateTab('lifecycle')} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                  {gate.verdict === 'cleared' ? 'Promote in Lifecycle →' : 'Review & promote in Lifecycle →'}
                </button>}
            <button onClick={() => onNavigateTab('governance')} className="text-[11px] text-slate-500 hover:text-slate-700">Record on model card →</button>
          </div>
        )}
      </div>
    </div>
  );
}
