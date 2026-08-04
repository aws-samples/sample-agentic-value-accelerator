import type { ComputedOrganizationDesign } from '../types';

// Blended human+AI org chart. Renders the 7 hierarchy layers as a pyramid.
export default function OrgChartPyramid({ computed, targetPhase }: { computed: ComputedOrganizationDesign; targetPhase: string }) {
  const layers = computed.hierarchy;
  const maxHc = Math.max(1, ...layers.map((l) => l.headcount));
  return (
    <div className="p-5 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Blended org chart — 7 layers</h3>
          <p className="text-xs text-slate-500">Human roles and AI agent functions at every layer. Layer 7 activates in {targetPhase === 'Phase 3' || targetPhase === 'Phase 4' ? 'this phase.' : 'Phase 3-4.'}</p>
        </div>
        <div className="text-xs text-slate-500">Target: <b>{targetPhase}</b></div>
      </div>

      <div className="space-y-1.5">
        {layers.map((l) => {
          const active = l.phase_active !== 'Not Yet Active';
          const width = 40 + (l.headcount / maxHc) * 60; // 40%–100%
          return (
            <div key={l.layer} className={`flex items-stretch gap-2 ${active ? '' : 'opacity-40'}`}>
              <div className="w-8 shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-400">L{l.layer}</div>
              <div className="flex-1 flex justify-center">
                <div
                  className={`relative rounded-xl border shadow-sm px-4 py-2.5 transition-all ${
                    active
                      ? 'border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-violet-50/60 to-fuchsia-50/60'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                  style={{ width: `${width}%`, minWidth: 260 }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">{l.level_name}</div>
                      <div className="text-xs font-medium text-slate-800 mt-0.5 whitespace-pre-line">{l.human_roles}</div>
                      <div className="text-[11px] text-emerald-700 mt-1 whitespace-pre-line"><span className="font-semibold">Agents:</span> {l.agent_functions}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ratio</div>
                      <div className="text-xs font-bold text-slate-800 tabular-nums">{l.ratio}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{l.headcount} humans</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
        <span><b className="text-slate-700">Span (AI-adjusted):</b> {computed.span_ai_adjusted}</span>
        <span><b className="text-slate-700">Layers:</b> {computed.current_layers} → {computed.target_layers} <span className="text-emerald-700">(−{computed.layers_eliminated})</span></span>
        <span><b className="text-slate-700">Structure:</b> {computed.recommended_structure}</span>
      </div>
    </div>
  );
}
