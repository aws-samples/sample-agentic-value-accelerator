/**
 * ControlPlanePillars — 5-pillar control plane posture strip for governance dashboard.
 *
 * Surfaces the Agent Control Plane posture across 5 key pillars:
 *   - Registry: Single source of truth for agents, MCP servers, tools
 *   - Access Control: Cedar policies, IAM, deny-by-default
 *   - Visualization: Connection graph, analytics dashboards
 *   - Interoperability: Multi-framework, model providers, MCP gateway
 *   - Security: Composite posture, weighted checks, A-F grade
 *
 * Each tile shows score, primary metric, and supporting detail.
 */

import { useMemo } from 'react';
import { getPostureColor } from './postureColor';

interface PillarData {
  score: number;
  primary: string | number;
  label: string;
}

interface Props {
  data?: {
    registry?: PillarData;
    access?: PillarData;
    visualization?: PillarData;
    interoperability?: PillarData;
    security?: PillarData;
    quarantinedCount?: number;
  };
  onSelect?: (pillar: string | null) => void;
  selected?: string | null;
}

const PILLARS = [
  {
    key: 'registry',
    label: 'Registry',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    color: '#3b82f6',
    description: 'Single source of truth for every agent, MCP server, and tool',
    defaultPrimary: '24',
    defaultLabel: 'agents registered',
  },
  {
    key: 'access',
    label: 'Access Control',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    color: '#10b981',
    description: 'Cedar deny-by-default + per-agent IAM + policy templates',
    defaultPrimary: '49',
    defaultLabel: 'Cedar policies',
  },
  {
    key: 'visualization',
    label: 'Visualization',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: '#8b5cf6',
    description: 'Connection graph + analytics dashboards',
    defaultPrimary: '6',
    defaultLabel: 'active dashboards',
  },
  {
    key: 'interoperability',
    label: 'Interoperability',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    color: '#f59e0b',
    description: 'Multi-framework support · model providers · MCP gateway',
    defaultPrimary: '12',
    defaultLabel: 'integrations',
  },
  {
    key: 'security',
    label: 'Security',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    color: '#ef4444',
    description: 'Composite posture · 8 weighted checks · graded A-F',
    defaultPrimary: 'B',
    defaultLabel: 'security grade',
  },
];

// ControlPlanePillars grades pillars on a stricter curve than the fleet posture
// default (80/60/40); preserve its 90/75/60 cutoffs via the thresholds override.
const scoreColor = (score: number): string =>
  getPostureColor(score, { great: 90, good: 75, watch: 60 });

function scoreGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export default function ControlPlanePillars({ data, onSelect, selected }: Props) {
  const pillarsWithData = useMemo(() => {
    return PILLARS.map(p => {
      const pd = data?.[p.key as keyof typeof data] as PillarData | undefined;
      return {
        ...p,
        score: pd?.score ?? 75,
        primary: pd?.primary ?? p.defaultPrimary,
        label: pd?.label ?? p.defaultLabel,
      };
    });
  }, [data]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Control Plane · 5-Pillar Posture</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] text-slate-400">Registry · Access · Visualization · Interop · Security</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.quarantinedCount && data.quarantinedCount > 0 && (
            <span className="text-[10px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium">
              {data.quarantinedCount} quarantined
            </span>
          )}
          <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
            Live
          </span>
        </div>
      </div>

      {/* 5-Pillar Grid */}
      <div className="grid grid-cols-5 gap-3">
        {pillarsWithData.map(p => {
          const isSelected = selected === p.key;
          const grade = p.key === 'security' && typeof p.primary === 'string' && p.primary.length === 1
            ? p.primary
            : scoreGrade(p.score);

          return (
            <button
              key={p.key}
              onClick={() => onSelect?.(p.key === selected ? null : p.key)}
              className={`p-4 rounded-xl text-left transition-all hover:shadow-md ${
                isSelected
                  ? 'bg-blue-50 ring-2 ring-blue-300'
                  : 'bg-slate-50 hover:bg-slate-100'
              }`}
              style={{ borderTop: `3px solid ${p.color}` }}
              title={p.description}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: p.color }}>{p.icon}</span>
                  <span className="text-[10px] font-semibold text-slate-700">{p.label}</span>
                </div>
                <span
                  className="text-base font-bold"
                  style={{ color: scoreColor(p.score) }}
                >
                  {p.key === 'security' ? grade : p.score}
                </span>
              </div>

              {/* Primary Metric */}
              <div className="text-2xl font-bold mb-1" style={{ color: p.color }}>
                {p.primary}
              </div>

              {/* Label */}
              <div className="text-[10px] text-slate-500 mb-2 min-h-[2em]">
                {p.label}
              </div>

              {/* Score Bar */}
              <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${p.score}%`, backgroundColor: scoreColor(p.score) }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Pillar Detail */}
      {selected && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-xs text-blue-800">
            <span className="font-semibold">{PILLARS.find(p => p.key === selected)?.label}:</span>{' '}
            {PILLARS.find(p => p.key === selected)?.description}
          </div>
        </div>
      )}
    </div>
  );
}
