/**
 * RiskRegister — Central inventory of all identified risks
 *
 * HYBRID DATA SOURCES:
 * - Use Case Risks: LIVE - derived from use cases with risk scoring
 * - Security Findings: LIVE - from AWS Security Hub + GuardDuty/Macie/Inspector
 * - Traditional Risks: MOCK - enterprise risk register format
 *
 * Use cases with high risk scores and AWS security findings are surfaced as
 * risks in the register, providing a unified view across all risk sources.
 */

import { useState, useMemo, useId } from 'react';
import {
  RISKS as INITIAL_RISKS, CONTROLS, RISK_CATEGORIES, getRiskClass,
  LIKELIHOOD_LABELS, SEVERITY_LABELS,
  type Risk, type RiskCategory, type RiskStatus, type Likelihood, type Severity,
} from './riskData';
import { rowButtonProps } from '../a11y';
import Drawer from '../Drawer';
import { usePersistedState } from '../usePersistedState';
import { useGovernanceAggregator, USE_CASE_RISK_CATEGORIES } from '../useGovernanceAggregator';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { useLiveSecurityRisk } from './useLiveSecurityRisk';

// Extended risk type to track source
interface ExtendedRisk extends Risk {
  isLive?: boolean;
  useCaseId?: string;
  goNoGo?: string;
  // Security finding fields
  source?: 'use-case' | 'security-hub' | 'guardduty' | 'macie' | 'inspector' | 'access-analyzer' | 'mock';
  findingId?: string;
  awsProduct?: string;
}

// Map risk categories from use case scoring to traditional risk categories
const CATEGORY_MAP: Record<string, RiskCategory> = {
  'Regulatory': 'compliance',
  'Data Privacy': 'privacy',
  'Ethical/Bias': 'bias-fairness',
  'Model Reliability': 'model-performance',
  'Autonomy Risk': 'operational',
};

export default function RiskRegister() {
  const [mockRisks, setMockRisks] = usePersistedState<Risk[]>('risk_register', INITIAL_RISKS);
  const [selectedRisk, setSelectedRisk] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<RiskCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<RiskStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'live' | 'security' | 'mock'>('all');
  const [search, setSearch] = useState('');
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);

  const { useCases, useCaseRiskHeatmap } = useGovernanceAggregator();
  const securityRisk = useLiveSecurityRisk();

  // Convert use case risk data to Risk format for the register
  const useCaseRisks = useMemo<ExtendedRisk[]>(() => {
    const risks: ExtendedRisk[] = [];

    useCaseRiskHeatmap.forEach((row) => {
      const useCase = useCases.find(uc => uc.use_case_id === row.useCaseId);
      if (!useCase) return;

      // Create a risk entry for each high-risk dimension (score >= 50)
      row.scores.forEach((score, dimIndex) => {
        if (score >= 50) {
          const categoryName = USE_CASE_RISK_CATEGORIES[dimIndex];
          const category = CATEGORY_MAP[categoryName] || 'operational';

          // Convert 0-100 score to 1-5 likelihood/severity
          const riskLevel = score >= 80 ? 5 : score >= 60 ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1;

          // Derive inherent as higher (no controls), residual as current
          const inherentLevel = Math.min(5, riskLevel + 1) as Likelihood;

          risks.push({
            id: `UCR-${row.useCaseId.slice(0, 4)}-${dimIndex}`.toUpperCase(),
            title: `${categoryName} risk in ${row.name}`,
            description: `${categoryName} dimension scored ${score}/100 for use case "${row.name}" (${useCase.business_domain}). ${
              score >= 80 ? 'Critical attention required.' :
              score >= 60 ? 'Elevated risk - monitor closely.' :
              'Moderate risk - standard controls apply.'
            }`,
            category,
            status: row.goNoGo === 'GO' ? 'mitigated' as RiskStatus :
                    row.goNoGo === 'CONDITIONAL GO' ? 'open' as RiskStatus :
                    row.goNoGo === 'NO GO' ? 'open' as RiskStatus : 'open' as RiskStatus,
            owner: useCase.business_owner || 'Unassigned',
            ownerRole: useCase.business_domain,
            inherentLikelihood: inherentLevel,
            inherentSeverity: inherentLevel,
            inherentScore: inherentLevel * inherentLevel,
            residualLikelihood: riskLevel as Likelihood,
            residualSeverity: riskLevel as Severity,
            residualScore: riskLevel * riskLevel,
            trend: row.goNoGo === 'GO' ? 'decreasing' : row.goNoGo === 'NO GO' ? 'increasing' : 'stable',
            controlIds: [],
            affectedAssets: [row.name],
            dateIdentified: useCase.created_at.split('T')[0],
            lastReviewed: useCase.updated_at.split('T')[0],
            nextReview: '', // Would be calculated
            notes: `Auto-generated from use case risk scoring. GO/NO GO: ${row.goNoGo}`,
            isLive: true,
            useCaseId: row.useCaseId,
            goNoGo: row.goNoGo,
            source: 'use-case',
          });
        }
      });
    });

    return risks;
  }, [useCaseRiskHeatmap, useCases]);

  // Convert live security findings to Risk format
  const securityRisks = useMemo<ExtendedRisk[]>(() => {
    if (!securityRisk.isLive || securityRisk.liveRisks.length === 0) {
      return [];
    }

    return securityRisk.liveRisks.map((sr): ExtendedRisk => ({
      ...sr,
      source: sr.source,
      findingId: sr.findingId,
      awsProduct: sr.awsProduct,
    }));
  }, [securityRisk.isLive, securityRisk.liveRisks]);

  // Combine all live risks
  const liveRisks = useMemo<ExtendedRisk[]>(() => {
    return [...useCaseRisks, ...securityRisks];
  }, [useCaseRisks, securityRisks]);

  // Combine live and mock risks
  const allRisks = useMemo<ExtendedRisk[]>(() => {
    const mock = mockRisks.map(r => ({ ...r, isLive: false }));
    return [...liveRisks, ...mock];
  }, [liveRisks, mockRisks]);

  const filteredRisks = useMemo(() => {
    return allRisks.filter(r => {
      const categoryOk = categoryFilter === 'all' || r.category === categoryFilter;
      const statusOk = statusFilter === 'all' || r.status === statusFilter;
      const extRisk = r as ExtendedRisk;
      const isSecurityRisk = extRisk.source && ['security-hub', 'guardduty', 'macie', 'inspector', 'access-analyzer'].includes(extRisk.source);
      const sourceOk = sourceFilter === 'all' ||
        (sourceFilter === 'live' && r.isLive && !isSecurityRisk) ||
        (sourceFilter === 'security' && isSecurityRisk) ||
        (sourceFilter === 'mock' && !r.isLive);
      const searchOk = !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase());
      return categoryOk && statusOk && sourceOk && searchOk;
    });
  }, [allRisks, categoryFilter, statusFilter, sourceFilter, search]);

  const selectedRiskData = selectedRisk ? allRisks.find(r => r.id === selectedRisk) : null;
  const selectedControls = selectedRiskData ? CONTROLS.filter(c => selectedRiskData.controlIds.includes(c.id)) : [];

  const hasSecurityRisks = securityRisks.length > 0;

  const handleAddRisk = (newRisk: Risk) => {
    setMockRisks(prev => [...prev, newRisk]);
    setShowAddDrawer(false);
  };

  const handleEditRisk = (updatedRisk: Risk) => {
    setMockRisks(prev => prev.map(r => r.id === updatedRisk.id ? updatedRisk : r));
    setEditingRisk(null);
  };

  const handleDeleteRisk = (riskId: string) => {
    // Can only delete mock risks
    const risk = allRisks.find(r => r.id === riskId);
    if (risk?.isLive) {
      alert('Live risks from use cases cannot be deleted here. Adjust the use case scoring in Plan → Prioritization.');
      return;
    }
    if (confirm('Are you sure you want to delete this risk?')) {
      setMockRisks(prev => prev.filter(r => r.id !== riskId));
      setSelectedRisk(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Source Indicators */}
      <div className="flex flex-wrap items-center gap-3">
        {useCaseRisks.length > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Use Case Risks: {useCaseRisks.length} from {useCaseRiskHeatmap.length} scored use cases
          </div>
        )}
        {hasSecurityRisks && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Security Findings: {securityRisks.length} from AWS Security Hub
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              aria-label="Search risks"
              placeholder="Search risks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <select
              aria-label="Filter by source"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | 'live' | 'security' | 'mock')}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Sources ({allRisks.length})</option>
              <option value="live">Live from Use Cases ({useCaseRisks.length})</option>
              <option value="security">Security Hub Findings ({securityRisks.length})</option>
              <option value="mock">Demo / Manual ({mockRisks.length})</option>
            </select>
          </div>
          <div>
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as RiskCategory | 'all')}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {RISK_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RiskStatus | 'all')}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="mitigated">Mitigated</option>
              <option value="accepted">Accepted</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <button
            onClick={() => setShowAddDrawer(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            + Add Risk
          </button>
        </div>
      </div>

      {/* Risk Matrix Quick View */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Risk Matrix (Residual)</h3>
        <div className="flex gap-6">
          {/* Matrix Grid */}
          <div className="flex-shrink-0">
            <div className="flex">
              <div className="w-8" />
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className="w-12 text-center text-[9px] text-slate-400 pb-1">{s}</div>
              ))}
            </div>
            {[5, 4, 3, 2, 1].map(l => (
              <div key={l} className="flex items-center">
                <div className="w-8 text-right text-[9px] text-slate-400 pr-2">{l}</div>
                {[1, 2, 3, 4, 5].map(s => {
                  const score = l * s;
                  const riskClass = getRiskClass(score);
                  const risksInCell = filteredRisks.filter(r => r.residualLikelihood === l && r.residualSeverity === s);
                  return (
                    <div
                      key={s}
                      className={`w-12 h-10 border border-white flex items-center justify-center text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${
                        score >= 20 ? 'bg-red-200 text-red-800' :
                        score >= 15 ? 'bg-orange-200 text-orange-800' :
                        score >= 10 ? 'bg-amber-200 text-amber-800' :
                        score >= 5 ? 'bg-emerald-200 text-emerald-800' :
                        'bg-slate-200 text-slate-600'
                      }`}
                      title={`L${l} × S${s} = ${score} (${riskClass.label})`}
                    >
                      {risksInCell.length > 0 ? risksInCell.length : ''}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="flex mt-1">
              <div className="w-8" />
              <div className="flex-1 text-center text-[9px] text-slate-400">Severity →</div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1">
            <div className="text-xs text-slate-500 mb-2">Likelihood ↑</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'Critical (20-25)', color: 'bg-red-200' },
                { label: 'High (15-19)', color: 'bg-orange-200' },
                { label: 'Medium (10-14)', color: 'bg-amber-200' },
                { label: 'Low (5-9)', color: 'bg-emerald-200' },
                { label: 'Very Low (1-4)', color: 'bg-slate-200' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${item.color}`} />
                  <span className="text-slate-600">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[10px] text-slate-400">
              Click a cell to filter risks. {filteredRisks.length} risks shown.
            </div>
          </div>
        </div>
      </div>

      {/* Risk Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th scope="col" className="text-left py-2.5 px-4 font-medium">ID</th>
                <th scope="col" className="text-center py-2.5 px-2 font-medium">Source</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium">Risk</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium">Category</th>
                <th scope="col" className="text-center py-2.5 px-3 font-medium">Inherent</th>
                <th scope="col" className="text-center py-2.5 px-3 font-medium">Residual</th>
                <th scope="col" className="text-center py-2.5 px-3 font-medium">Trend</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium">Status</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {filteredRisks.map(risk => {
                const cat = RISK_CATEGORIES.find(c => c.id === risk.category);
                const inherentClass = getRiskClass(risk.inherentScore);
                const residualClass = getRiskClass(risk.residualScore);
                const extRisk = risk as ExtendedRisk;
                return (
                  <tr
                    key={risk.id}
                    {...rowButtonProps(
                      () => setSelectedRisk(selectedRisk === risk.id ? null : risk.id),
                      `View risk ${risk.id}: ${risk.title}`
                    )}
                    className={`border-t border-slate-100 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50 ${
                      selectedRisk === risk.id ? 'bg-blue-50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{risk.id}</td>
                    <td className="py-2.5 px-2 text-center">
                      {extRisk.isLive ? (
                        extRisk.source && ['security-hub', 'guardduty', 'macie', 'inspector', 'access-analyzer'].includes(extRisk.source) ? (
                          <LiveDataBadge source="Security Hub" detail={`AWS ${extRisk.awsProduct || extRisk.source}`} />
                        ) : (
                          <LiveDataBadge source="Plan" />
                        )
                      ) : (
                        <MockDataBadge />
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900 max-w-[220px] truncate" title={risk.title}>
                        {risk.title}
                      </div>
                      {extRisk.goNoGo && (
                        <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                          extRisk.goNoGo === 'GO' ? 'bg-emerald-100 text-emerald-700' :
                          extRisk.goNoGo === 'NO GO' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {extRisk.goNoGo}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: cat?.color }}>
                        <span>{cat?.icon}</span>
                        <span>{cat?.name}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${inherentClass.bgColor}`}>
                        {risk.inherentScore}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${residualClass.bgColor}`}>
                        {risk.residualScore}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-sm ${
                        risk.trend === 'increasing' ? 'text-rose-600' :
                        risk.trend === 'decreasing' ? 'text-emerald-600' : 'text-slate-400'
                      }`}>
                        {risk.trend === 'increasing' ? '↑' : risk.trend === 'decreasing' ? '↓' : '→'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        risk.status === 'open' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                        risk.status === 'mitigated' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        risk.status === 'accepted' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                        'bg-slate-100 border-slate-200 text-slate-600'
                      }`}>
                        {risk.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-xs">{risk.owner}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Detail Panel */}
      {selectedRiskData && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-slate-400">{selectedRiskData.id}</span>
                {(selectedRiskData as ExtendedRisk).isLive ? (
                  (selectedRiskData as ExtendedRisk).source && ['security-hub', 'guardduty', 'macie', 'inspector', 'access-analyzer'].includes((selectedRiskData as ExtendedRisk).source!) ? (
                    <LiveDataBadge source="Security Hub" detail={`AWS ${(selectedRiskData as ExtendedRisk).awsProduct || (selectedRiskData as ExtendedRisk).source}`} />
                  ) : (
                    <LiveDataBadge source="Plan" />
                  )
                ) : (
                  <MockDataBadge />
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  selectedRiskData.status === 'open' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                  selectedRiskData.status === 'mitigated' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  selectedRiskData.status === 'accepted' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                  'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  {selectedRiskData.status}
                </span>
                {(selectedRiskData as ExtendedRisk).goNoGo && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    (selectedRiskData as ExtendedRisk).goNoGo === 'GO' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                    (selectedRiskData as ExtendedRisk).goNoGo === 'NO GO' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                    'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>
                    {(selectedRiskData as ExtendedRisk).goNoGo}
                  </span>
                )}
                {(selectedRiskData as ExtendedRisk).awsProduct && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    AWS {(selectedRiskData as ExtendedRisk).awsProduct}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mt-1">{selectedRiskData.title}</h3>
              <p className="text-sm text-slate-600 mt-2 max-w-3xl">{selectedRiskData.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {!(selectedRiskData as ExtendedRisk).isLive && (
                <>
                  <button
                    onClick={() => setEditingRisk(selectedRiskData)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteRisk(selectedRiskData.id)}
                    className="px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}
              {(selectedRiskData as ExtendedRisk).isLive && (
                <span className="text-[10px] text-slate-400 italic">
                  {(selectedRiskData as ExtendedRisk).source && ['security-hub', 'guardduty', 'macie', 'inspector', 'access-analyzer'].includes((selectedRiskData as ExtendedRisk).source!)
                    ? 'Live from AWS Security Hub'
                    : 'Edit in Plan → Prioritization'}
                </span>
              )}
              <button onClick={() => setSelectedRisk(null)} className="text-slate-400 hover:text-slate-600 ml-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Security Finding Details - shown for security-sourced risks */}
          {(selectedRiskData as ExtendedRisk).findingId && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="text-xs font-semibold text-emerald-700 mb-2">AWS Security Hub Finding</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[10px] text-emerald-600 uppercase">Finding ID</div>
                  <div className="font-mono text-xs text-slate-700 truncate" title={(selectedRiskData as ExtendedRisk).findingId}>
                    {(selectedRiskData as ExtendedRisk).findingId}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-600 uppercase">Product</div>
                  <div className="text-slate-700">{(selectedRiskData as ExtendedRisk).awsProduct || 'Security Hub'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Risk Scores */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500 uppercase mb-2">Inherent Risk</div>
              <div className="flex items-center gap-4">
                <div className={`text-3xl font-bold ${getRiskClass(selectedRiskData.inherentScore).bgColor} px-3 py-1 rounded`}>
                  {selectedRiskData.inherentScore}
                </div>
                <div className="text-xs text-slate-600">
                  <div>Likelihood: {selectedRiskData.inherentLikelihood} ({LIKELIHOOD_LABELS[selectedRiskData.inherentLikelihood]})</div>
                  <div>Severity: {selectedRiskData.inherentSeverity} ({SEVERITY_LABELS[selectedRiskData.inherentSeverity]})</div>
                </div>
              </div>
            </div>
            <div className="p-4 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500 uppercase mb-2">Residual Risk (After Controls)</div>
              <div className="flex items-center gap-4">
                <div className={`text-3xl font-bold ${getRiskClass(selectedRiskData.residualScore).bgColor} px-3 py-1 rounded`}>
                  {selectedRiskData.residualScore}
                </div>
                <div className="text-xs text-slate-600">
                  <div>Likelihood: {selectedRiskData.residualLikelihood} ({LIKELIHOOD_LABELS[selectedRiskData.residualLikelihood]})</div>
                  <div>Severity: {selectedRiskData.residualSeverity} ({SEVERITY_LABELS[selectedRiskData.residualSeverity]})</div>
                </div>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Owner</div>
              <div className="font-medium text-slate-900">{selectedRiskData.owner}</div>
              <div className="text-xs text-slate-500">{selectedRiskData.ownerRole}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Identified</div>
              <div className="text-slate-700">{selectedRiskData.dateIdentified}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Last Reviewed</div>
              <div className="text-slate-700">{selectedRiskData.lastReviewed}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Next Review</div>
              <div className="text-slate-700">{selectedRiskData.nextReview}</div>
            </div>
          </div>

          {/* Affected Assets */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-900 mb-2">Affected Assets</div>
            <div className="flex flex-wrap gap-2">
              {selectedRiskData.affectedAssets.map(asset => (
                <span key={asset} className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded">
                  {asset}
                </span>
              ))}
            </div>
          </div>

          {/* Mitigating Controls */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-3">Mitigating Controls ({selectedControls.length})</div>
            <div className="space-y-2">
              {selectedControls.map(control => (
                <div key={control.id} className="p-3 border border-slate-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{control.id}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          control.type === 'preventive' ? 'bg-blue-100 text-blue-700' :
                          control.type === 'detective' ? 'bg-purple-100 text-purple-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {control.type}
                        </span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          control.status === 'implemented' ? 'bg-emerald-100 text-emerald-700' :
                          control.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {control.status}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900 mt-1">{control.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{control.description}</div>
                    </div>
                    <div className="text-right ml-4">
                      <div className={`text-xs font-medium ${
                        control.effectiveness === 'high' ? 'text-emerald-600' :
                        control.effectiveness === 'medium' ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {control.effectiveness} effectiveness
                      </div>
                      {control.evidence && (
                        <div className="text-[10px] text-slate-400 mt-1">{control.evidence}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {selectedRiskData.notes && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="text-xs font-semibold text-amber-700 mb-1">Notes</div>
              <div className="text-sm text-amber-800">{selectedRiskData.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* Add Risk Drawer */}
      <RiskFormDrawer
        open={showAddDrawer}
        onClose={() => setShowAddDrawer(false)}
        onSave={handleAddRisk}
        existingIds={allRisks.map(r => r.id)}
      />

      {/* Edit Risk Drawer */}
      <RiskFormDrawer
        open={!!editingRisk}
        onClose={() => setEditingRisk(null)}
        onSave={handleEditRisk}
        existingIds={allRisks.map(r => r.id)}
        initialData={editingRisk}
      />
    </div>
  );
}

// ─────────────────────────── Risk Form Drawer ───────────────────────────

interface RiskFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSave: (risk: Risk) => void;
  existingIds: string[];
  initialData?: Risk | null;
}

function RiskFormDrawer({ open, onClose, onSave, existingIds, initialData }: RiskFormDrawerProps) {
  const isEditing = !!initialData;
  const today = new Date().toISOString().split('T')[0];
  const fid = useId();

  const [form, setForm] = useState<Partial<Risk>>(() => initialData || {
    title: '',
    description: '',
    category: 'operational' as RiskCategory,
    status: 'open' as RiskStatus,
    owner: '',
    ownerRole: '',
    inherentLikelihood: 3 as Likelihood,
    inherentSeverity: 3 as Severity,
    residualLikelihood: 2 as Likelihood,
    residualSeverity: 2 as Severity,
    trend: 'stable',
    controlIds: [],
    affectedAssets: [],
    dateIdentified: today,
    lastReviewed: today,
    nextReview: '',
    notes: '',
  });

  // Reset form when initialData changes
  useState(() => {
    if (initialData) {
      setForm(initialData);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nextId = isEditing
      ? initialData!.id
      : `RSK-${String(existingIds.length + 1).padStart(3, '0')}`;

    const inherentScore = (form.inherentLikelihood || 1) * (form.inherentSeverity || 1);
    const residualScore = (form.residualLikelihood || 1) * (form.residualSeverity || 1);

    const risk: Risk = {
      id: nextId,
      title: form.title || 'Untitled Risk',
      description: form.description || '',
      category: form.category as RiskCategory,
      status: form.status as RiskStatus,
      owner: form.owner || 'Unassigned',
      ownerRole: form.ownerRole || '',
      inherentLikelihood: form.inherentLikelihood as Likelihood,
      inherentSeverity: form.inherentSeverity as Severity,
      inherentScore,
      residualLikelihood: form.residualLikelihood as Likelihood,
      residualSeverity: form.residualSeverity as Severity,
      residualScore,
      trend: form.trend as Risk['trend'],
      controlIds: form.controlIds || [],
      affectedAssets: form.affectedAssets || [],
      dateIdentified: form.dateIdentified || today,
      lastReviewed: form.lastReviewed || today,
      nextReview: form.nextReview || '',
      notes: form.notes,
    };

    onSave(risk);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Risk' : 'Add New Risk'}
      subtitle={isEditing ? `Editing ${initialData?.id}` : 'Create a new risk entry in the register'}
      width="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label htmlFor={`${fid}-title`} className="block text-sm font-medium text-slate-700 mb-1">Risk Title *</label>
            <input
              id={`${fid}-title`}
              type="text"
              required
              value={form.title || ''}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Model produces biased credit decisions"
            />
          </div>

          <div>
            <label htmlFor={`${fid}-description`} className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              id={`${fid}-description`}
              rows={3}
              value={form.description || ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Detailed description of the risk..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${fid}-category`} className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <select
                id={`${fid}-category`}
                required
                value={form.category || 'operational'}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as RiskCategory }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {RISK_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fid}-status`} className="block text-sm font-medium text-slate-700 mb-1">Status *</label>
              <select
                id={`${fid}-status`}
                required
                value={form.status || 'open'}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as RiskStatus }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="open">Open</option>
                <option value="mitigated">Mitigated</option>
                <option value="accepted">Accepted</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ownership */}
        <div className="border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Ownership</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${fid}-owner`} className="block text-sm font-medium text-slate-700 mb-1">Owner Name *</label>
              <input
                id={`${fid}-owner`}
                type="text"
                required
                value={form.owner || ''}
                onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., J. Smith"
              />
            </div>
            <div>
              <label htmlFor={`${fid}-ownerRole`} className="block text-sm font-medium text-slate-700 mb-1">Owner Role</label>
              <input
                id={`${fid}-ownerRole`}
                type="text"
                value={form.ownerRole || ''}
                onChange={e => setForm(f => ({ ...f, ownerRole: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Risk Manager"
              />
            </div>
          </div>
        </div>

        {/* Risk Scoring */}
        <div className="border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Risk Scoring</h4>
          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-semibold text-slate-600 uppercase mb-3">Inherent Risk (Before Controls)</div>
              <div className="space-y-3">
                <div>
                  <label htmlFor={`${fid}-inherentLikelihood`} className="block text-xs text-slate-500 mb-1">Likelihood</label>
                  <select
                    id={`${fid}-inherentLikelihood`}
                    value={form.inherentLikelihood || 3}
                    onChange={e => setForm(f => ({ ...f, inherentLikelihood: Number(e.target.value) as Likelihood }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {([1, 2, 3, 4, 5] as Likelihood[]).map(l => (
                      <option key={l} value={l}>{l} - {LIKELIHOOD_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${fid}-inherentSeverity`} className="block text-xs text-slate-500 mb-1">Severity</label>
                  <select
                    id={`${fid}-inherentSeverity`}
                    value={form.inherentSeverity || 3}
                    onChange={e => setForm(f => ({ ...f, inherentSeverity: Number(e.target.value) as Severity }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {([1, 2, 3, 4, 5] as Severity[]).map(s => (
                      <option key={s} value={s}>{s} - {SEVERITY_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="text-center">
                  <span className={`inline-block px-3 py-1 rounded text-sm font-bold ${getRiskClass((form.inherentLikelihood || 3) * (form.inherentSeverity || 3)).bgColor}`}>
                    Score: {(form.inherentLikelihood || 3) * (form.inherentSeverity || 3)}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-semibold text-slate-600 uppercase mb-3">Residual Risk (After Controls)</div>
              <div className="space-y-3">
                <div>
                  <label htmlFor={`${fid}-residualLikelihood`} className="block text-xs text-slate-500 mb-1">Likelihood</label>
                  <select
                    id={`${fid}-residualLikelihood`}
                    value={form.residualLikelihood || 2}
                    onChange={e => setForm(f => ({ ...f, residualLikelihood: Number(e.target.value) as Likelihood }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {([1, 2, 3, 4, 5] as Likelihood[]).map(l => (
                      <option key={l} value={l}>{l} - {LIKELIHOOD_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${fid}-residualSeverity`} className="block text-xs text-slate-500 mb-1">Severity</label>
                  <select
                    id={`${fid}-residualSeverity`}
                    value={form.residualSeverity || 2}
                    onChange={e => setForm(f => ({ ...f, residualSeverity: Number(e.target.value) as Severity }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {([1, 2, 3, 4, 5] as Severity[]).map(s => (
                      <option key={s} value={s}>{s} - {SEVERITY_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="text-center">
                  <span className={`inline-block px-3 py-1 rounded text-sm font-bold ${getRiskClass((form.residualLikelihood || 2) * (form.residualSeverity || 2)).bgColor}`}>
                    Score: {(form.residualLikelihood || 2) * (form.residualSeverity || 2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trend */}
        <div className="border-t border-slate-200 pt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Risk Trend</label>
          <div className="flex gap-4">
            {[
              { value: 'increasing', label: '↑ Increasing', color: 'text-rose-600' },
              { value: 'stable', label: '→ Stable', color: 'text-slate-600' },
              { value: 'decreasing', label: '↓ Decreasing', color: 'text-emerald-600' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="trend"
                  value={opt.value}
                  checked={form.trend === opt.value}
                  onChange={e => setForm(f => ({ ...f, trend: e.target.value as Risk['trend'] }))}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className={`text-sm ${opt.color}`}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Review Dates</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor={`${fid}-dateIdentified`} className="block text-sm font-medium text-slate-700 mb-1">Date Identified</label>
              <input
                id={`${fid}-dateIdentified`}
                type="date"
                value={form.dateIdentified || ''}
                onChange={e => setForm(f => ({ ...f, dateIdentified: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor={`${fid}-lastReviewed`} className="block text-sm font-medium text-slate-700 mb-1">Last Reviewed</label>
              <input
                id={`${fid}-lastReviewed`}
                type="date"
                value={form.lastReviewed || ''}
                onChange={e => setForm(f => ({ ...f, lastReviewed: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor={`${fid}-nextReview`} className="block text-sm font-medium text-slate-700 mb-1">Next Review</label>
              <input
                id={`${fid}-nextReview`}
                type="date"
                value={form.nextReview || ''}
                onChange={e => setForm(f => ({ ...f, nextReview: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="border-t border-slate-200 pt-4">
          <label htmlFor={`${fid}-notes`} className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            id={`${fid}-notes`}
            rows={2}
            value={form.notes || ''}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Additional notes or context..."
          />
        </div>

        {/* Actions */}
        <div className="border-t border-slate-200 pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Add Risk'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
