import type { ComputedOrganizationDesign } from '../types';
import { PHASES, PHASE_ATTRIBUTES } from '../types';
import { phaseColor } from '../scoring';

// 4-phase implementation roadmap.
export default function PhaseRoadmapView({ computed, currentPhase, targetPhase }: { computed: ComputedOrganizationDesign; currentPhase: string; targetPhase: string }) {
  return (
    <div className="p-5 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">4-phase roadmap</h3>
          <p className="text-xs text-slate-500">Current: <b>{currentPhase}</b> · Target: <b>{targetPhase}</b>. Each phase gates the next.</p>
        </div>
      </div>

      {/* Timeline strip */}
      <div className="relative mb-6 mt-4">
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200"></div>
        <div className="relative grid grid-cols-4 gap-2">
          {PHASES.map((p) => {
            const active = p === currentPhase;
            const target = p === targetPhase;
            return (
              <div key={p} className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md ${
                  target ? 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white ring-4 ring-indigo-100'
                  : active ? 'bg-white border-2 border-indigo-500 text-indigo-700'
                  : 'bg-white border-2 border-slate-300 text-slate-400'
                }`}>{p.replace('Phase ', '')}</div>
                <div className={`mt-2 text-[11px] font-semibold ${target ? 'text-indigo-700' : active ? 'text-slate-800' : 'text-slate-500'}`}>{p}</div>
                <div className="text-[10px] text-slate-500">{PHASE_ATTRIBUTES[p].timeline}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {PHASES.map((p) => {
          const a = PHASE_ATTRIBUTES[p];
          const isTarget = p === targetPhase;
          return (
            <div key={p} className={`p-3 rounded-xl border ${isTarget ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${phaseColor(p)}`}>{p}</span>
                {isTarget && <span className="text-[10px] font-bold text-indigo-600">TARGET</span>}
              </div>
              <div className="text-sm font-bold text-slate-900 mb-1">{a.agentRole}</div>
              <div className="text-[11px] text-slate-500 mb-2">{a.timeline}</div>
              <div className="space-y-1 text-[11px] text-slate-700">
                <PhaseRow k="Governance" v={a.governance} />
                <PhaseRow k="Ratio" v={a.ratio} />
                <PhaseRow k="Prod gain" v={a.gain} />
                <PhaseRow k="Span" v={a.span} />
                <PhaseRow k="Layers" v={a.layers} />
                <PhaseRow k="Key roles" v={a.keyRoles} />
                <PhaseRow k="Investment" v={a.investment} />
                <PhaseRow k="Risk" v={a.risk} />
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Gate to next phase</div>
                <div className="text-[11px] text-slate-700 italic">{a.gates}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhaseRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400 shrink-0 text-[10px] uppercase tracking-wider font-semibold pt-0.5">{k}</span>
      <span className="text-right text-slate-700">{v}</span>
    </div>
  );
}
