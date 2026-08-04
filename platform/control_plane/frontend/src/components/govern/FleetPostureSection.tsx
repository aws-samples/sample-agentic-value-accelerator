/**
 * FleetPostureSection — Unified posture hero for Agent Fleet Governance.
 *
 * Combines ControlPlanePillars + FleetRiskPosture + 30-day trend into one
 * compact section. Surfaces gaps inline when meaningful issues exist.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getPostureColor } from './postureColor';

interface ControlGap {
  dimension: string;
  gap: number;
  agentName?: string;
}

interface Props {
  score: number;
  pillarScores: {
    registry: number;
    access: number;
    visualization: number;
    interoperability: number;
    security: number;
  };
  statusCounts: { healthy: number; watch: number; gap: number };
  trendData: Array<{ day: string; trustScore: number }>;
  controlGaps: ControlGap[];
  onRemediateGap?: (gap: ControlGap) => void;
  metrics?: {
    totalAgents?: number;
    bedrockAgents?: number;
    agentcoreRuntimes?: number;
    activeGuardrails?: number;
    policiesEnforced?: number;
    eventsToday?: number;
    blockedToday?: number;
    useCases?: number;
    deployments?: number;
    modelsTracked?: number;
  };
}

const PILLARS = [
  { key: 'registry', label: 'Registry', shortLabel: 'Agents', description: 'Agent & model inventory', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4', color: '#3b82f6' },
  { key: 'access', label: 'Access Control', shortLabel: 'Access', description: 'Policies & permissions', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', color: '#10b981' },
  { key: 'visualization', label: 'Monitoring', shortLabel: 'Monitor', description: 'Dashboards & alerts', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', color: '#8b5cf6' },
  { key: 'interoperability', label: 'Integrations', shortLabel: 'Integr.', description: 'External connections', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9', color: '#f59e0b' },
  { key: 'security', label: 'Security', shortLabel: 'Security', description: 'Controls & guardrails', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', color: '#ef4444' },
] as const;

const scoreColor = (score: number): string => getPostureColor(score);

function scoreGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export default function FleetPostureSection({
  score,
  pillarScores,
  statusCounts,
  trendData,
  controlGaps,
  onRemediateGap,
  metrics,
}: Props) {
  const [hoveredPillar, setHoveredPillar] = useState<string | null>(null);

  const sparklineData = useMemo(() =>
    trendData.slice(-14).map(d => ({ value: d.trustScore })),
    [trendData]
  );

  const topGap = controlGaps[0];

  // Detect if this is a new/unconfigured state (no real governance activity yet)
  // Registry requires deployments, Access requires active guardrails - these indicate real setup
  const totalActivity = statusCounts.healthy + statusCounts.watch + statusCounts.gap;
  const hasRealGovernanceSetup = pillarScores.registry > 0 || pillarScores.access > 0;
  const isUnconfigured = !hasRealGovernanceSetup && totalActivity === 0;

  // For unconfigured state, show neutral styling instead of failing grade
  const displayScore = isUnconfigured ? '—' : score;
  const grade = isUnconfigured ? '—' : scoreGrade(score);
  const color = isUnconfigured ? '#94a3b8' : scoreColor(score);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-900">Fleet Posture</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Live</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">AWS</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">OWASP</span>
        </div>
        <Link to="/govern/risk" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          Risk Report →
        </Link>
      </div>

      {/* Main Content - Compact */}
      <div className="px-4 py-3">
        <div className="flex gap-4">
          {/* Score Gauge - Compact */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="relative w-16 h-16">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                {!isUnconfigured && (
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${score * 2.64} 264`}
                    className="transition-all duration-700"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isUnconfigured ? (
                  <span className="text-lg font-bold text-slate-400">—</span>
                ) : (
                  <>
                    <span className="text-lg font-bold" style={{ color }}>{displayScore}</span>
                    <span className="text-[8px] font-bold px-1 rounded text-white" style={{ backgroundColor: color }}>
                      {grade}
                    </span>
                  </>
                )}
              </div>
            </div>
            {/* Trend Sparkline - Inline */}
            <div className="w-20 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#6366f1" fill="url(#sparkGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pillars - Compact inline */}
          <div className="flex-1 grid grid-cols-5 gap-1.5">
            {PILLARS.map(p => {
              const pillarScore = pillarScores[p.key as keyof typeof pillarScores];
              const pillarUnconfigured = pillarScore === 0;
              const isHovered = hoveredPillar === p.key;
              return (
                <div
                  key={p.key}
                  className={`relative bg-slate-50 rounded px-2 py-1.5 border transition-all cursor-default ${
                    isHovered ? 'border-slate-300' : 'border-slate-100'
                  }`}
                  onMouseEnter={() => setHoveredPillar(p.key)}
                  onMouseLeave={() => setHoveredPillar(null)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-medium text-slate-500">{p.shortLabel}</span>
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: pillarUnconfigured ? '#94a3b8' : scoreColor(pillarScore) }}
                    >
                      {pillarUnconfigured ? '—' : `${pillarScore}%`}
                    </span>
                  </div>
                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pillarUnconfigured ? 0 : pillarScore}%`,
                        backgroundColor: pillarUnconfigured ? '#94a3b8' : p.color,
                      }}
                    />
                  </div>
                  {isHovered && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full bg-slate-800 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                      {p.label}: {p.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Status dots */}
          <div className="flex items-center gap-2 text-[9px] flex-shrink-0">
            <span className="flex items-center gap-1" title="Active">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-slate-600">{statusCounts.healthy}</span>
            </span>
            <span className="flex items-center gap-1" title="Draft">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="font-medium text-slate-600">{statusCounts.watch}</span>
            </span>
            <span className="flex items-center gap-1" title="Failed">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="font-medium text-slate-600">{statusCounts.gap}</span>
            </span>
          </div>
        </div>

        {/* Metrics Row - Compact */}
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100">
          {[
            { label: 'Use Cases', value: metrics?.useCases ?? 0, color: 'text-blue-600' },
            { label: 'Deployments', value: metrics?.deployments ?? 0, color: 'text-violet-600' },
            { label: 'Bedrock Agents', value: metrics?.bedrockAgents ?? 0, color: 'text-orange-600', tooltip: 'Classic Bedrock Agents' },
            { label: 'AgentCore', value: metrics?.agentcoreRuntimes ?? 0, color: 'text-cyan-600', tooltip: 'AgentCore Runtimes' },
            { label: 'Guardrails', value: metrics?.activeGuardrails ?? 0, color: 'text-emerald-600' },
            { label: 'Policies', value: metrics?.policiesEnforced ?? 0, color: 'text-indigo-600' },
            { label: 'Blocked', value: metrics?.blockedToday ?? 0, color: 'text-rose-600', highlight: true },
          ].map(m => (
            <div key={m.label} className="flex items-center gap-1.5" title={'tooltip' in m ? m.tooltip : undefined}>
              <span className={`text-sm font-bold ${m.highlight && m.value > 0 ? 'text-rose-600' : m.color}`}>
                {m.value}
              </span>
              <span className="text-[9px] text-slate-500">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Gaps Row (only if gaps exist) */}
      {controlGaps.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-amber-800 uppercase">
                Gaps ({controlGaps.length})
              </span>
              {topGap && (
                <span className="text-xs text-slate-700">
                  {topGap.dimension}
                  {topGap.agentName && <span className="text-slate-500"> · {topGap.agentName}</span>}
                  <span className="text-rose-600 font-medium"> · -{topGap.gap} pts</span>
                </span>
              )}
              {controlGaps.length > 1 && (
                <span className="text-[10px] text-slate-500">+{controlGaps.length - 1} more</span>
              )}
            </div>
            {onRemediateGap && topGap && (
              <button
                onClick={() => onRemediateGap(topGap)}
                className="text-[10px] px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
              >
                Remediate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
