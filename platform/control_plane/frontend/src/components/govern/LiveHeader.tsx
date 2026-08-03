/**
 * LiveHeader — the one shared header strip for every "Live · from AWS" surface.
 *
 * Unifies the live dot, uppercase source label, sub-caption, an optional
 * auto-refreshing indicator, and an optional right-aligned summary — so every live
 * hero across Govern looks and reads identically (cohesion). Falls to a neutral
 * grey dot + honest label when the surface isn't live.
 */
import type { ReactNode } from 'react';

interface LiveHeaderProps {
  /** True when the surface has live data. Drives the pulsing dot + emerald label. */
  live: boolean;
  /** Uppercase label, e.g. "Live · Bedrock model evaluations". */
  label: string;
  /** Muted sub-caption (the API / what it is). */
  caption?: string;
  /** True to show the small "auto-refreshing" indicator (polling surfaces). */
  autoRefresh?: boolean;
  /** Optional right-aligned summary node (counts, totals). */
  right?: ReactNode;
}

export default function LiveHeader({ live, label, caption, autoRefresh, right }: LiveHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
      <span className="relative flex h-2 w-2">
        {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      </span>
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${live ? 'text-emerald-700' : 'text-slate-500'}`}>{label}</span>
      {caption && <span className="text-[10px] text-slate-400">{caption}</span>}
      {live && autoRefresh && (
        <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600/80" title="Refreshes automatically every 60s">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
          auto-refreshing
        </span>
      )}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}
