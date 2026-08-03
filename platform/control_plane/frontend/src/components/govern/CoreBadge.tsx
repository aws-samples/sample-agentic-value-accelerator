/**
 * CoreBadge — Visual indicator for Govern Core modules.
 *
 * Core modules represent the foundational pillars of AI governance:
 * - SEE IT: Command Center, Agent Registry, Model Management, Cost & FinOps
 * - GOVERN IT: Policy Management (Compliance Center)
 * - SHOW IT: Audit & Incidents, Data Governance
 *
 * The badge appears on module cards and headers to help users identify
 * which capabilities form the essential governance foundation.
 */

interface CoreBadgeProps {
  /** Which pillar this module belongs to */
  pillar?: 'see' | 'govern' | 'show';
  /** Compact mode for tight spaces */
  compact?: boolean;
  /** Show pillar label */
  showPillar?: boolean;
}

const PILLAR_COLORS = {
  see: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  govern: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  show: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const PILLAR_LABELS = {
  see: 'See It',
  govern: 'Govern It',
  show: 'Show It',
};

export default function CoreBadge({ pillar, compact = false, showPillar = false }: CoreBadgeProps) {
  const colors = pillar ? PILLAR_COLORS[pillar] : { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' };

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}
        title={pillar ? `Core Module - ${PILLAR_LABELS[pillar]}` : 'Core Module'}
      >
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
        </svg>
        Core
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${colors.bg} ${colors.text} border ${colors.border}`}
      title={pillar ? `Core Module - ${PILLAR_LABELS[pillar]}` : 'Core Module'}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
      </svg>
      Core{showPillar && pillar ? ` - ${PILLAR_LABELS[pillar]}` : ''}
    </span>
  );
}

/**
 * CorePillarLegend — Shows the 3-pillar structure for onboarding/education.
 */
export function CorePillarLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-xs ${className}`}>
      <span className="text-slate-500 font-medium">Core Pillars:</span>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        See It
      </span>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-violet-50 text-violet-700 border border-violet-100">
        <span className="w-2 h-2 rounded-full bg-violet-500" />
        Govern It
      </span>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Show It
      </span>
    </div>
  );
}

/**
 * Module definitions - which modules are Core and their pillar assignment.
 */
export const CORE_MODULES: Record<string, { isCore: true; pillar: 'see' | 'govern' | 'show' }> = {
  'command-center': { isCore: true, pillar: 'see' },
  'agents': { isCore: true, pillar: 'see' },
  'fleet': { isCore: true, pillar: 'see' },
  'models': { isCore: true, pillar: 'see' },
  'finops': { isCore: true, pillar: 'see' },
  'compliance': { isCore: true, pillar: 'govern' },
  'prompt-governance': { isCore: true, pillar: 'govern' },
  'audit': { isCore: true, pillar: 'show' },
  'data': { isCore: true, pillar: 'show' },
};

export function isCoreMModule(id: string): boolean {
  return id in CORE_MODULES;
}

export function getModulePillar(id: string): 'see' | 'govern' | 'show' | undefined {
  return CORE_MODULES[id]?.pillar;
}
