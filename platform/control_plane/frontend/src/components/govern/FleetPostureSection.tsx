/**
 * FleetPostureSection — Unified posture hero for Agent Fleet Governance.
 *
 * Combines the control-plane pillar tiles + FleetRiskPosture + 30-day trend into
 * one compact section. Surfaces gaps inline when meaningful issues exist.
 *
 * This superseded the standalone `ControlPlanePillars.tsx`, which was deleted
 * 2026-09-09 after it sat unimported.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getPostureColor } from './postureColor';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';

interface ControlGap {
  dimension: string;
  gap: number;
  agentName?: string;
}

/** The five control-plane posture pillars. */
export type PosturePillarKey = 'registry' | 'access' | 'visualization' | 'interoperability' | 'security';

interface Props {
  score: number;
  pillarScores: Record<PosturePillarKey, number>;
  statusCounts: { healthy: number; watch: number; gap: number };
  trendData: Array<{ day: string; trustScore: number }>;
  controlGaps: ControlGap[];
  onRemediateGap?: (gap: ControlGap) => void;
  /**
   * Pillar keys whose displayed score is an illustrative constant (e.g. a fixed
   * 80/40 or 70/30 boolean gate) rather than a value derived from a live signal.
   * These are flagged in the UI so a fabricated number never renders as "Live".
   */
  illustrativePillars?: PosturePillarKey[];
  /**
   * Pillar keys whose displayed score IS derived from a live measurement (a real
   * ratio over real counts). Drives the Live badge's detail copy so the badge can
   * only ever name the pillars that are actually live. Pillars in neither list are
   * unavailable and render as "—".
   */
  livePillars?: PosturePillarKey[];
  /** When true, the 30-day trend sparkline is simulated history (only "today" is live). */
  trendIllustrative?: boolean;
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

/**
 * Renders a set of pillar keys as their human labels in PILLARS order
 * ("Registry, Access Control & Security"). The badge copy is derived from the
 * actual live/illustrative key sets via this helper so a badge can never
 * describe pillars other than the ones it is gating.
 */
function pillarLabelList(keys: readonly string[]): string {
  const set = new Set(keys);
  const labels = PILLARS.filter(p => set.has(p.key)).map(p => p.label);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
}

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
  illustrativePillars = [],
  livePillars = [],
  trendIllustrative = false,
}: Props) {
  const [hoveredPillar, setHoveredPillar] = useState<string | null>(null);

  const sparklineData = useMemo(() =>
    trendData.slice(-14).map(d => ({ value: d.trustScore })),
    [trendData]
  );

  const topGap = controlGaps[0];

  // Which pillars/trend are illustrative (not from a live signal) — used to avoid
  // stamping a blanket green "Live" over fabricated numbers.
  const illustrativeSet = new Set<string>(illustrativePillars);
  const liveSet = new Set<string>(livePillars);
  const hasIllustrative = illustrativePillars.length > 0 || trendIllustrative;

  // Badge copy is DERIVED from the live/illustrative key sets (never hardcoded), so
  // the Live badge can only claim the pillars the caller says are live and the Demo
  // badge can only name the pillars that are actually illustrative.
  const liveLabels = pillarLabelList(livePillars);
  const liveDetail = liveLabels
    ? `${liveLabels} scored from live AVA + AWS measurements`
    : 'Fleet score and guardrail status counts from live AVA + AWS data';
  const illustrativeLabels = pillarLabelList(illustrativePillars);
  const illustrativeDetail = [
    illustrativeLabels ? `${illustrativeLabels} scoring` : '',
    trendIllustrative ? '30-day trend' : '',
  ].filter(Boolean).join(', ');

  // Detect if this is a new/unconfigured state (no real governance activity yet).
  // Registry/Access are governance-tag coverage ratios over the AI estate, so a
  // non-zero value on either means a real, scanned governance footprint exists.
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
          {/* Scope the "Live" claim to the pillars actually driven by live data; the
              illustrative pillars/trend are disclosed separately so a fabricated
              number never sits under a green Live badge. */}
          <LiveDataBadge source="AVA + AWS" detail={liveDetail} />
          {hasIllustrative && illustrativeDetail && (
            <MockDataBadge integration={illustrativeDetail} />
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium" title="Posture aligned to the AWS Generative AI Scoping Matrix">AWS</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium" title="Posture aligned to OWASP Agentic AI threats">OWASP</span>
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
            <div
              className="w-20 h-12 relative"
              title={trendIllustrative ? 'Illustrative 30-day trend — simulated history; only today reflects the live score' : undefined}
            >
              {trendIllustrative && (
                <span
                  className="absolute top-0 right-0 z-10 w-1.5 h-1.5 rounded-full border border-dashed border-amber-400 bg-amber-100 cursor-help"
                  title="Illustrative — simulated history"
                />
              )}
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
              // A pillar reading 0 that is neither declared live nor illustrative had
              // its upstream signal degrade — the score is not genuinely zero. Say so
              // on hover instead of letting "—" read as a measured zero. (A live pillar
              // at 0, e.g. security with no controls implemented, IS a real zero.)
              const pillarUnavailable = pillarUnconfigured && !liveSet.has(p.key) && !illustrativeSet.has(p.key);
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
                    <span className="flex items-center gap-0.5 text-[8px] font-medium text-slate-500">
                      {p.shortLabel}
                      {illustrativeSet.has(p.key) && (
                        <span
                          className="w-1.5 h-1.5 rounded-full border border-dashed border-amber-400 bg-amber-100 cursor-help"
                          title="Illustrative score — not yet derived from a live signal"
                        />
                      )}
                    </span>
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: pillarUnconfigured ? '#94a3b8' : scoreColor(pillarScore) }}
                      title={pillarUnavailable ? 'Unavailable — the live signal backing this pillar could not be read' : undefined}
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
