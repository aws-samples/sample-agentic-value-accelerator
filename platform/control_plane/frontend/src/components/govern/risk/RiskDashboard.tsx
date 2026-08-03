/**
 * RiskDashboard — Portfolio risk overview with key metrics and trends
 *
 * HYBRID DATA SOURCES:
 * - Use Case Risk Data: LIVE from prioritizationApi (scores.risk_governance, computed.risk_score)
 * - Security Findings: LIVE from AWS Security Hub + GuardDuty/Macie/Inspector/Access Analyzer
 * - Controls & Issues: MOCK (needs custom backend)
 *
 * Risk heatmap and top risks are derived from actual use case scoring data,
 * ensuring consistency with FleetOverview's risk visualization.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import {
  CONTROLS, ISSUES,
  getControlStats, getIssueStats,
  RISK_CATEGORIES,
} from './riskData';
import StatCard from '../StatCard';
import { useGovernanceAggregator, USE_CASE_RISK_CATEGORIES } from '../useGovernanceAggregator';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { getRiskTierFromScore } from '../riskScoring';
import EmptyState, { EMPTY_STATES } from '../EmptyState';
import RiskMetricsPanel from '../metrics/RiskMetricsPanel';
import { useLiveSecurityRisk } from './useLiveSecurityRisk';
import LiveSecurityPosture from './LiveSecurityPosture';
import SecurityPostureCard from './SecurityPostureCard';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#0f172a',
  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

// Map use case risk categories to traditional risk register categories
const RISK_CATEGORY_MAP: Record<string, typeof RISK_CATEGORIES[number]['id']> = {
  'Regulatory': 'compliance',
  'Data Privacy': 'privacy',
  'Ethical/Bias': 'bias-fairness',
  'Model Reliability': 'model-performance',
  'Autonomy Risk': 'operational',
};

export default function RiskDashboard() {
  const {
    useCases,
    useCaseRiskHeatmap,
    topRiskyUseCases,
  } = useGovernanceAggregator();

  // Live security findings from AWS
  const securityRisk = useLiveSecurityRisk();

  // Control and issue stats still from mock data
  const controlStats = useMemo(() => getControlStats(), []);
  const issueStats = useMemo(() => getIssueStats(), []);

  // Derive risk stats from live use case data
  const liveRiskStats = useMemo(() => {
    const useCasesWithRisk = useCases.filter(uc => uc.computed?.risk_score != null);
    const total = useCasesWithRisk.length;

    if (total === 0) {
      return null; // Will fall back to mock view
    }

    const avgRiskScore = Math.round(
      useCasesWithRisk.reduce((sum, uc) => sum + (uc.computed?.risk_score ?? 0), 0) / total
    );

    // Count by risk tier (0-100 scale) — canonical thresholds (75/50/25) via getRiskTierFromScore
    const critical = useCasesWithRisk.filter(uc => getRiskTierFromScore(uc.computed?.risk_score ?? 0) === 'Critical').length;
    const high = useCasesWithRisk.filter(uc => getRiskTierFromScore(uc.computed?.risk_score ?? 0) === 'High').length;
    const medium = useCasesWithRisk.filter(uc => getRiskTierFromScore(uc.computed?.risk_score ?? 0) === 'Medium').length;
    const low = useCasesWithRisk.filter(uc => getRiskTierFromScore(uc.computed?.risk_score ?? 0) === 'Low').length;

    // Count by GO/NO GO status
    const goCount = useCasesWithRisk.filter(uc => uc.computed?.go_no_go === 'GO').length;
    const conditionalCount = useCasesWithRisk.filter(uc => uc.computed?.go_no_go === 'CONDITIONAL GO').length;
    const noGoCount = useCasesWithRisk.filter(uc => uc.computed?.go_no_go === 'NO GO').length;

    // Count increasing risk (use cases at High+ risk and not yet in production)
    const increasing = useCasesWithRisk.filter(
      uc => (uc.computed?.risk_score ?? 0) >= 50 && uc.status !== 'Production'
    ).length;

    return {
      total,
      avgRiskScore,
      critical,
      high,
      medium,
      low,
      goCount,
      conditionalCount,
      noGoCount,
      increasing,
    };
  }, [useCases]);

  // Distribution by risk class for pie chart (live data)
  const riskByClass = useMemo(() => {
    if (!liveRiskStats || liveRiskStats.total === 0) {
      return []; // No data
    }

    const classes = [
      { name: 'Critical (75+)', min: 75, max: 100, color: '#991b1b', count: liveRiskStats.critical },
      { name: 'High (50-74)', min: 50, max: 74, color: '#c2410c', count: liveRiskStats.high },
      { name: 'Medium (25-49)', min: 25, max: 49, color: '#a16207', count: liveRiskStats.medium },
      { name: 'Low (<25)', min: 0, max: 24, color: '#15803d', count: liveRiskStats.low },
    ];
    return classes.filter(c => c.count > 0);
  }, [liveRiskStats]);

  // Category breakdown from heatmap data
  const categoryData = useMemo(() => {
    if (useCaseRiskHeatmap.length === 0) {
      return [];
    }

    // Aggregate average risk by category across all use cases
    return USE_CASE_RISK_CATEGORIES.map((catName, catIndex) => {
      const scores = useCaseRiskHeatmap.map(row => row.scores[catIndex]);
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const highRiskCount = scores.filter(s => s >= 50).length;

      // Map to RISK_CATEGORIES for color
      const mappedCatId = RISK_CATEGORY_MAP[catName] || 'operational';
      const cat = RISK_CATEGORIES.find(c => c.id === mappedCatId) || RISK_CATEGORIES[0];

      return {
        name: catName,
        avgScore,
        count: highRiskCount,
        color: cat.color,
        icon: cat.icon,
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
  }, [useCaseRiskHeatmap]);

  // Top risks for table (from live data)
  const topRisks = useMemo(() => {
    return topRiskyUseCases.slice(0, 5).map(uc => ({
      id: uc.useCaseId.slice(0, 8).toUpperCase(),
      useCaseId: uc.useCaseId,
      name: uc.name,
      category: uc.businessDomain,
      riskScore: uc.riskScore,
      goNoGo: uc.goNoGo,
      status: uc.status,
    }));
  }, [topRiskyUseCases]);

  const hasLiveData = liveRiskStats && liveRiskStats.total > 0;
  const hasLiveSecurityData = securityRisk.isLive && securityRisk.totalFindings > 0;

  return (
    <div className="space-y-6">
      {/* Data Source Indicator */}
      <div className="flex flex-wrap items-center gap-3">
        {hasLiveData && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Risk Data: {liveRiskStats?.total} use cases scored from Plan module
          </div>
        )}
        {hasLiveSecurityData && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Security Hub: {securityRisk.totalFindings} findings ({securityRisk.criticalCount} critical, {securityRisk.highCount} high)
          </div>
        )}
      </div>

      {/* KPI Row - Live data if available */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="Use Cases Scored"
          value={hasLiveData ? liveRiskStats!.total : 0}
          sub={hasLiveData ? <LiveDataBadge /> : 'Score use cases in Plan'}
          variant="default"
        />
        <StatCard
          label="Critical / High"
          value={hasLiveData ? liveRiskStats!.critical + liveRiskStats!.high : 0}
          sub={hasLiveData ? `${liveRiskStats!.critical} critical, ${liveRiskStats!.high} high` : 'Add risk scores'}
          variant="danger"
        />
        <StatCard
          label="Avg Risk Score"
          value={hasLiveData ? liveRiskStats!.avgRiskScore : '-'}
          sub={hasLiveData ? getRiskTierFromScore(liveRiskStats!.avgRiskScore) + ' Risk' : 'N/A'}
          variant={hasLiveData && liveRiskStats!.avgRiskScore >= 50 ? 'danger' : hasLiveData && liveRiskStats!.avgRiskScore >= 25 ? 'warning' : 'default'}
        />
        <StatCard
          label="Controls"
          value={`${controlStats.implemented}/${controlStats.total}`}
          sub={<><MockDataBadge /> implemented</>}
          variant="success"
        />
        <StatCard
          label="Open Issues"
          value={issueStats.open + issueStats.inProgress}
          sub={<><MockDataBadge /> {issueStats.high} high</>}
          variant="info"
        />
        <StatCard
          label="GO / NO GO"
          value={hasLiveData ? `${liveRiskStats!.goCount}/${liveRiskStats!.noGoCount}` : '-/-'}
          sub={hasLiveData ? `${liveRiskStats!.conditionalCount} conditional` : 'Score use cases'}
          variant={hasLiveData && liveRiskStats!.noGoCount > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk Distribution Pie - Live Data */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Risk Distribution</h3>
            {hasLiveData && <LiveDataBadge />}
          </div>
          {hasLiveData && riskByClass.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={riskByClass}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={2}
                  >
                    {riskByClass.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {riskByClass.map(c => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-slate-600">{c.name}</span>
                    <span className="text-xs font-semibold text-slate-900 ml-auto">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[140px] text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-xs text-slate-500">Score use cases in Plan to see risk distribution</p>
            </div>
          )}
        </div>

        {/* Risk by Category - Live Data */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Avg Risk by Category</h3>
            {categoryData.length > 0 && <LiveDataBadge />}
          </div>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#475569', fontSize: 10 }}
                  width={100}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value}/100`, 'Avg Risk']}
                />
                <Bar dataKey="avgScore" radius={[0, 4, 4, 0]}>
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[160px] text-center">
              <p className="text-xs text-slate-500">Score use cases to see category breakdown</p>
            </div>
          )}
        </div>

        {/* Control Effectiveness - Mock Data */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Control Effectiveness</h3>
            <MockDataBadge />
          </div>
          <div className="space-y-4">
            {[
              { label: 'High', value: controlStats.effectiveness.high, color: '#10b981' },
              { label: 'Medium', value: controlStats.effectiveness.medium, color: '#f59e0b' },
              { label: 'Low', value: controlStats.effectiveness.low, color: '#ef4444' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600">{row.label} effectiveness</span>
                  <span className="font-semibold text-slate-900">{row.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(row.value / controlStats.total) * 100}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Implementation rate</span>
              <span className="font-semibold text-emerald-600">
                {Math.round((controlStats.implemented / controlStats.total) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Security Posture — AWS Security Hub + GuardDuty/Macie/Inspector/Access Analyzer */}
      <div className="space-y-4">
        <LiveSecurityPosture />
        <SecurityPostureCard />
      </div>

      {/* Top Risks Table - Live from Use Cases */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Top Risks by Use Case</h3>
            {topRisks.length > 0 && <LiveDataBadge />}
          </div>
          <span className="text-xs text-slate-400">Derived from use case risk scoring</span>
        </div>
        {topRisks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                  <th scope="col" className="text-left py-2 px-3 font-medium">Use Case</th>
                  <th scope="col" className="text-left py-2 px-3 font-medium">Domain</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium">Risk Score</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium">GO / NO GO</th>
                  <th scope="col" className="text-left py-2 px-3 font-medium">Status</th>
                  <th scope="col" className="text-right py-2 px-3 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody>
                {topRisks.map(risk => {
                  // Critical tier uses rose (canonical palette), aligning with getRiskScoreBadge / RISK_TIER_CONFIG.
                  const riskClass = risk.riskScore >= 75 ? 'bg-rose-100 text-rose-800 border-rose-200' :
                                    risk.riskScore >= 50 ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                    risk.riskScore >= 25 ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                    'bg-emerald-100 text-emerald-800 border-emerald-200';
                  return (
                    <tr key={risk.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 max-w-xs truncate">{risk.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{risk.id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs">{risk.category}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${riskClass}`}>
                          {risk.riskScore}/100
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          risk.goNoGo === 'GO' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                          risk.goNoGo === 'CONDITIONAL GO' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                          risk.goNoGo === 'NO GO' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                          'bg-slate-100 border-slate-200 text-slate-600'
                        }`}>
                          {risk.goNoGo}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          risk.status === 'Production' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                          risk.status === 'Pilot' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                          risk.status === 'Active' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                          'bg-slate-100 border-slate-200 text-slate-600'
                        }`}>
                          {risk.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {/* Contextual deep-link to this use case in Plan (carries the
                            id via ?focus= so Plan can light up the row when it adds handling). */}
                        <Link
                          to={`/use-cases?focus=${encodeURIComponent(risk.useCaseId)}`}
                          className="text-[10px] font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                        >
                          View in Plan →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState {...EMPTY_STATES.risks} />
        )}
      </div>

      {/* Issues Summary - Mock Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open Issues */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Open Issues</h3>
              <MockDataBadge />
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
              issueStats.overdue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {issueStats.overdue > 0 ? `${issueStats.overdue} overdue` : 'On track'}
            </span>
          </div>
          <div className="space-y-3">
            {ISSUES.filter(i => i.status !== 'closed' && i.status !== 'remediated').slice(0, 4).map(issue => (
              <div key={issue.id} className="p-3 border border-slate-200 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">{issue.id}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                        issue.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        issue.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        issue.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {issue.severity}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-900 mt-1 truncate">{issue.title}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Owner: {issue.owner} · Due: {issue.dueDate}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${
                    issue.status === 'open' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                    'bg-blue-50 border-blue-200 text-blue-700'
                  }`}>
                    {issue.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Three Lines of Defense Summary */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Three Lines of Defense</h3>
            <MockDataBadge />
          </div>
          <div className="space-y-4">
            {[
              { line: '1st Line', role: 'Business / Operations', desc: 'Risk ownership, day-to-day controls', controls: CONTROLS.filter(c => ['ML Platform', 'Platform', 'FinOps'].includes(c.owner)).length },
              { line: '2nd Line', role: 'Risk / Compliance', desc: 'Oversight, policy, monitoring', controls: CONTROLS.filter(c => ['RAI Council', 'Fair Lending Team', 'Security', 'Data Governance'].includes(c.owner)).length },
              { line: '3rd Line', role: 'Internal Audit', desc: 'Independent assurance', controls: 0 },
            ].map((lod, i) => (
              <div key={i} className="flex items-center gap-4 p-3 border border-slate-200 rounded-lg">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-purple-500' : 'bg-slate-500'
                }`}>
                  {lod.line.split(' ')[0]}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{lod.role}</div>
                  <div className="text-xs text-slate-500">{lod.desc}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900">{lod.controls}</div>
                  <div className="text-[10px] text-slate-400">controls</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shared metric contract: Risk Management's contribution to the scorecard */}
      <RiskMetricsPanel />
    </div>
  );
}
