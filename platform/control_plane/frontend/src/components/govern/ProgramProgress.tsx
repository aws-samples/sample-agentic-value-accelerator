/**
 * ProgramProgress — the "Getting Started with AI Governance" block on the Govern
 * landing. The single front door: it combines the start-by-role entry points
 * with a stateful program spine — six causal steps graded from the signals the
 * Command Center already computes, an overall completeness ring, a *computed*
 * maturity stage, and a single next-best-action.
 *
 * This replaces the old split between a static getting-started guide and a
 * separate tracker (both carried a journey + maturity ladder — the guide's were
 * static, these are live). One block now owns: pick your role → see where the
 * program stands → do the next thing.
 *
 * Reads useGovernanceAggregator (same source as Command Center) so the numbers
 * reconcile. Grading logic lives in governProgram.ts (pure + testable).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useGovernanceAggregator from './useGovernanceAggregator';
import {
  gradeProgram,
  programCompleteness,
  maturityFor,
  nextBestAction,
  MATURITY_STAGES,
  PERSONAS,
  type StepStatus,
} from './governProgram';

const STATUS_META: Record<StepStatus, { dot: string; ring: string; icon: string; label: string }> = {
  complete: { dot: 'bg-emerald-500', ring: 'border-emerald-300', icon: '✓', label: 'Complete' },
  partial: { dot: 'bg-amber-500', ring: 'border-amber-300', icon: '◐', label: 'In progress' },
  empty: { dot: 'bg-slate-300', ring: 'border-slate-200', icon: '○', label: 'Not started' },
};

const ROLES_PREF_KEY = 'govern.gettingStarted.rolesOpen';
const PANEL_PREF_KEY = 'govern.gettingStarted.panelOpen';

export default function ProgramProgress() {
  const navigate = useNavigate();
  const agg = useGovernanceAggregator();

  // Whole panel is collapsible — returns a compact status bar when closed.
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(PANEL_PREF_KEY) !== 'closed'; } catch { return true; }
  });
  const togglePanel = () => {
    setPanelOpen(prev => {
      const nextVal = !prev;
      try { localStorage.setItem(PANEL_PREF_KEY, nextVal ? 'open' : 'closed'); } catch { /* ignore */ }
      return nextVal;
    });
  };

  // "Start by role" is collapsible so returning users can dismiss it while the
  // live spine stays visible. Default open (first-run path); choice persists.
  const [rolesOpen, setRolesOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(ROLES_PREF_KEY) !== 'closed'; } catch { return true; }
  });
  const toggleRoles = () => {
    setRolesOpen(prev => {
      const nextVal = !prev;
      try { localStorage.setItem(ROLES_PREF_KEY, nextVal ? 'open' : 'closed'); } catch { /* ignore */ }
      return nextVal;
    });
  };

  const { graded, completeness, maturity, next } = useMemo(() => {
    const g = gradeProgram(agg);
    const c = programCompleteness(g);
    return { graded: g, completeness: c, maturity: maturityFor(c), next: nextBestAction(g) };
  }, [agg]);

  const go = (nav: string) => navigate(`/govern/${nav}`);
  const ringColor = completeness >= 90 ? '#10b981' : completeness >= 60 ? '#3b82f6' : completeness >= 25 ? '#f59e0b' : '#ef4444';

  // Count steps by status for collapsed summary
  const stepsDone = graded.filter(g => g.status === 'complete').length;
  const stepsPartial = graded.filter(g => g.status === 'partial').length;

  // Collapsed compact bar
  if (!panelOpen) {
    return (
      <button
        onClick={togglePanel}
        className="mb-4 w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm hover:bg-slate-50 transition-colors animate-fade-in"
      >
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-600 via-violet-500 to-pink-500">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-slate-700">Getting Started</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Mini completeness ring */}
          <div className="flex items-center gap-2">
            <div className="relative w-7 h-7">
              <svg viewBox="0 0 36 36" className="w-7 h-7 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={ringColor} strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={`${(completeness / 100) * 97.4} 97.4`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-700">{completeness}%</span>
            </div>
            <span className="text-[10px] text-slate-500">complete</span>
          </div>

          {/* Steps summary */}
          <div className="hidden sm:flex items-center gap-3 text-[10px]">
            <span className="text-emerald-600 font-medium">{stepsDone}/6 done</span>
            {stepsPartial > 0 && <span className="text-amber-600 font-medium">{stepsPartial} in progress</span>}
          </div>

          {/* Maturity badge */}
          <span className="hidden md:inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase"
            style={{ backgroundColor: `${maturity.color}18`, color: maturity.color }}>
            {maturity.label}
          </span>

          {/* Next action teaser */}
          {next && (
            <span className="hidden lg:inline text-[10px] text-indigo-600 font-medium truncate max-w-[180px]">
              Next: {next.action}
            </span>
          )}

          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm overflow-hidden animate-fade-in">
      {/* Title — clickable to collapse */}
      <button onClick={togglePanel} className="w-full flex items-center justify-between gap-2.5 px-5 pt-4 pb-3 hover:bg-slate-50/50 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-600 via-violet-500 to-pink-500 shadow-sm shadow-violet-200">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-900">Getting Started with AI Governance</div>
            <div className="text-[11px] text-slate-500">Pick your role, see where the program stands, do the next thing.</div>
          </div>
        </div>
        <svg className="w-4 h-4 text-slate-400 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Start by role — collapsible persona entry points that route into the spine */}
      <div className="px-5 pb-4">
        <button
          onClick={toggleRoles}
          aria-expanded={rolesOpen}
          className="flex items-center gap-1.5 mb-2 group"
        >
          <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-600 uppercase tracking-wide transition-colors">Start by role</span>
          <svg className={`w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-all ${rolesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {!rolesOpen && <span className="text-[9px] text-slate-400 font-normal normal-case">7 roles</span>}
        </button>
        {rolesOpen && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {PERSONAS.map(p => (
              <button
                key={p.role}
                onClick={() => go(p.nav)}
                className="text-left rounded-lg border p-2.5 transition-all hover:shadow-md hover:-translate-y-0.5"
                style={{ backgroundColor: `${p.color}08`, borderColor: `${p.color}33` }}
              >
                <div className="text-[11px] font-bold leading-tight" style={{ color: p.color }}>{p.role}</div>
                <div className="text-[9px] text-slate-500 mt-0.5 leading-tight line-clamp-2 min-h-[1.6rem]">{p.description}</div>
                <div className="text-[9px] font-medium mt-1 truncate" style={{ color: p.color }}>→ {p.startWith}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Header: completeness ring + maturity ladder */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-5 p-5 border-t border-b border-slate-100 bg-gradient-to-br from-indigo-50/60 via-white to-white">
        {/* Program completeness */}
        <div className="flex items-center gap-4 lg:pr-6 lg:border-r border-slate-200">
          <div className="relative w-[72px] h-[72px] flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-[72px] h-[72px] -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke={ringColor} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(completeness / 100) * 97.4} 97.4`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-base font-bold text-slate-900">{completeness}%</span>
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Your governance program</div>
            <div className="text-[11px] text-slate-500 max-w-[15rem]">
              Completeness across the six-step program, graded from live platform signals.
            </div>
          </div>
        </div>

        {/* Computed maturity ladder */}
        <div className="flex-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Maturity <span className="normal-case font-normal text-slate-400">· computed, not self-declared</span>
          </div>
          <div className="flex gap-1.5">
            {MATURITY_STAGES.map(stage => {
              const active = stage.key === maturity.key;
              return (
                <div key={stage.key} className="flex-1 rounded-lg px-2.5 py-1.5 border transition-all"
                  style={{
                    backgroundColor: active ? `${stage.color}12` : 'transparent',
                    borderColor: active ? `${stage.color}66` : '#e2e8f0',
                  }}>
                  <div className="text-[11px] font-bold" style={{ color: active ? stage.color : '#94a3b8' }}>{stage.label}</div>
                  <div className="text-[9px] text-slate-500 leading-tight mt-0.5 hidden md:block">{stage.blurb}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Six-step spine */}
      <div className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {graded.map((g, i) => {
            const meta = STATUS_META[g.status];
            const isNext = next?.id === g.id;
            return (
              <button
                key={g.id}
                onClick={() => go(g.modules[0].nav)}
                className={`relative text-left rounded-xl border p-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  isNext ? 'border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                {/* connector arrow between steps (visual spine) */}
                {i < graded.length - 1 && (
                  <span className="hidden lg:block absolute -right-[9px] top-1/2 -translate-y-1/2 text-slate-300 text-xs z-10">›</span>
                )}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: g.color }}>{g.step}</span>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white ${meta.dot}`}>{meta.icon}</span>
                </div>
                <div className="text-[12px] font-semibold text-slate-900">{g.title}</div>
                <div className="text-[9px] text-slate-500 leading-tight mt-0.5 line-clamp-2 min-h-[1.75rem]">{g.desc}</div>
                <div className="text-[9px] font-medium mt-1.5 tabular-nums" style={{ color: g.color }}>{g.metric}</div>
                {isNext && (
                  <span className="inline-block mt-1.5 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    Next
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Next-best-action */}
        {next ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ backgroundColor: next.color }}>
                {next.step}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Next best action · {next.title}</div>
                <div className="text-[13px] font-medium text-slate-800 truncate">{next.action}</div>
              </div>
            </div>
            <button
              onClick={() => go(next.actionNav ?? next.modules[0].nav)}
              className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Start →
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-3">
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px]">✓</span>
            <span className="text-[13px] font-medium text-emerald-800">Program complete across all six steps — keep monitoring and reporting.</span>
          </div>
        )}
      </div>
    </div>
  );
}
