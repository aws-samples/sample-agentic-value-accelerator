/**
 * FleetRiskPosture — At-a-glance live risk posture across the deployed agent fleet.
 *
 * Renders a 4-tile strip:
 *   - Overall fleet score (0-100) with grade
 *   - Scope distribution (4-bar mini-chart aligned to AWS Scoping Matrix)
 *   - Status breakdown (healthy/watch/gap counts)
 *   - Top control gaps
 *
 * Aligned to: AWS Agentic Scoping Matrix, OWASP Agentic AI Threats, SR 26-2, NIST AI RMF
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getPostureColor } from './postureColor';
import { Icon } from './icons';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
// Canonical autonomy ladder — names/colors come from one source of truth.
import { SCOPE_TAILWIND as SCOPE_COLORS, scopeName } from './autonomyLadder';

interface Props {
  fleetSize: number;
  scopeCounts: { 1: number; 2: number; 3: number; 4: number };
  /** Overall fleet score (0-100). Omit when no real posture score is available. */
  overallScore?: number;
  statusCounts?: { healthy: number; watch: number; gap: number };
  controlGaps?: { dimension: string; gap: number; agentName?: string }[];
  /** True only when overallScore is sourced from live posture data. Gates the Live badge. */
  live?: boolean;
}

const scoreColor = (score: number): string => getPostureColor(score);

function scoreGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export default function FleetRiskPosture({
  fleetSize,
  scopeCounts,
  overallScore,
  statusCounts = { healthy: 0, watch: 0, gap: 0 },
  controlGaps = [],
  live = false,
}: Props) {
  const maxScopeCount = useMemo(() => Math.max(1, ...Object.values(scopeCounts)), [scopeCounts]);

  // Only present a score (and a Live badge) when we actually have live posture data —
  // never fabricate a default under a Live claim.
  const hasScore = typeof overallScore === 'number';
  const scoreIsLive = live && hasScore;
  const tileColor = typeof overallScore === 'number' ? scoreColor(overallScore) : '#94a3b8';
  const grade = typeof overallScore === 'number' ? scoreGrade(overallScore) : '—';
  const barWidth = typeof overallScore === 'number' ? overallScore : 0;

  // Calculate status from fleet if not provided
  const calculatedStatus = useMemo(() => {
    if (statusCounts.healthy + statusCounts.watch + statusCounts.gap > 0) {
      return statusCounts;
    }
    // Derive from scope distribution
    const s1 = scopeCounts[1] || 0;
    const s2 = scopeCounts[2] || 0;
    const s3 = scopeCounts[3] || 0;
    const s4 = scopeCounts[4] || 0;
    return {
      healthy: s1 + s2,
      watch: s3,
      gap: s4,
    };
  }, [statusCounts, scopeCounts]);

  const topGaps = controlGaps.slice(0, 3);
  const totalAgents = fleetSize || Object.values(scopeCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Icon name="shield-check" className="w-4 h-4 text-violet-600" strokeWidth={2} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Fleet Risk Posture</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">AWS Scoping Matrix</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">OWASP Agentic</span>
              {scoreIsLive
                ? <LiveDataBadge source="Fleet risk posture" />
                : <MockDataBadge integration="Fleet risk scoring across the deployed agent fleet" />}
            </div>
          </div>
        </div>
        <Link to="/govern/risk" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          Full Assessment →
        </Link>
      </div>

      {/* 4-Tile Grid */}
      <div className="grid grid-cols-4 gap-4">
        {/* Tile 1: Overall Score */}
        <div className="p-4 bg-slate-50 rounded-xl border-t-4" style={{ borderTopColor: tileColor }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Overall Score</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: tileColor }}
            >
              {grade}
            </span>
          </div>
          <div className="text-3xl font-bold" style={{ color: tileColor }}>
            {hasScore ? overallScore : '—'}<span className="text-lg text-slate-400">/100</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {hasScore
              ? `avg of 6 risk dimensions across ${totalAgents} agents`
              : 'awaiting live posture scoring'}
          </div>
          {/* Score bar */}
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-3">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%`, backgroundColor: tileColor }}
            />
          </div>
        </div>

        {/* Tile 2: Scope Distribution */}
        <div className="p-4 bg-slate-50 rounded-xl border-t-4 border-blue-500">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2">Scope Distribution</div>
          <div className="flex items-end gap-1.5 h-12 mb-2">
            {([1, 2, 3, 4] as const).map(s => {
              const count = scopeCounts[s] || 0;
              const pct = (count / maxScopeCount) * 100;
              return (
                <div key={s} className="flex-1 flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-700 mb-1">{count}</span>
                  <div
                    className={`w-full rounded-t transition-all ${SCOPE_COLORS[s].bg}`}
                    style={{ height: `${Math.max(8, pct)}%` }}
                    title={`S${s}: ${scopeName(s)} — ${count} agents`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-slate-400">
            <span>S1</span>
            <span>S2</span>
            <span>S3</span>
            <span>S4</span>
          </div>
          <div className="text-[9px] text-slate-500 mt-2">
            Higher scope = more autonomy = more controls
          </div>
        </div>

        {/* Tile 3: Status Breakdown */}
        <div className={`p-4 bg-slate-50 rounded-xl border-t-4 ${
          calculatedStatus.gap > 0 ? 'border-rose-500' :
          calculatedStatus.watch > 0 ? 'border-amber-500' :
          'border-emerald-500'
        }`}>
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2">Posture Status</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[9px] text-slate-500">Healthy</span>
              </div>
              <div className="text-xl font-bold text-emerald-600">{calculatedStatus.healthy}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[9px] text-slate-500">Watch</span>
              </div>
              <div className="text-xl font-bold text-amber-600">{calculatedStatus.watch}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-[9px] text-slate-500">Gap</span>
              </div>
              <div className="text-xl font-bold text-rose-600">{calculatedStatus.gap}</div>
            </div>
          </div>
          <div className="text-[9px] text-slate-500 mt-2 text-center">
            graded against per-scope dimension floors
          </div>
        </div>

        {/* Tile 4: Top Control Gaps */}
        <div className={`p-4 bg-slate-50 rounded-xl border-t-4 ${topGaps.length > 0 ? 'border-amber-500' : 'border-emerald-500'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Control Gaps</span>
            {controlGaps.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                {controlGaps.length} total
              </span>
            )}
          </div>
          {topGaps.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-600 mt-3">
              <Icon name="check-circle" className="w-5 h-5" strokeWidth={2} />
              <span className="text-xs font-medium">No gaps — all agents meet floor</span>
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {topGaps.map((g, i) => (
                <div key={i} className="text-[10px]">
                  <span className="font-bold text-amber-600">{g.gap}pts</span>
                  <span className="text-slate-700 ml-1">{g.dimension}</span>
                  {g.agentName && (
                    <span className="text-slate-400 ml-1">· {g.agentName}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
