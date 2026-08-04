import { useState, useMemo, useCallback, useId } from 'react';
import { Icon, type IconName } from './icons';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  MODELS, tooltipStyle,
  MODEL_DEPENDENCIES, getModelDependencies,
  MODEL_DETAILS,
  FINDINGS, type Finding,
  ACTIVITY_FEED,
  COMPARISON_METRICS, getModelComparisonData,
  getFleetTrendData, getTotalPotentialSavings,
  INTEGRATIONS, type Integration,
  REPORT_TEMPLATES, type ReportTemplate,
  DISCUSSION_THREADS, type DiscussionThread,
} from './mockData';
import { downloadFile, dateStamp } from './exportUtils';

// ─────────────────────────── Export Utilities ───────────────────────────

function generateCSV(headers: string[], rows: string[][]): string {
  const escape = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\n');
}

function generateReportData(reportId: string) {
  const timestamp = dateStamp();

  switch (reportId) {
    case 'rpt-1': { // SR 26-2 Model Inventory Report
      const sr262Data = {
        reportTitle: 'SR 26-2 Model Inventory Report',
        generatedDate: timestamp,
        framework: 'SR 26-2 (US Federal Reserve)',
        models: MODELS.map(m => {
          const detail = MODEL_DETAILS[m.id];
          return {
            modelId: m.id,
            modelName: m.name,
            provider: m.provider,
            owner: m.owner,
            riskTier: m.tier,
            status: m.status,
            evalScore: m.evalScore,
            lastValidated: m.lastValidated,
            sr262Attested: detail?.attestation?.sr26_2?.attested || false,
            attestationDate: detail?.attestation?.sr26_2?.date || 'N/A',
            inherentRisk: detail?.riskProfile?.inherentRisk || 'N/A',
            residualRisk: detail?.riskProfile?.residualRisk || 'N/A',
            useCases: m.useCases,
          };
        }),
        findings: FINDINGS.filter(f => f.framework?.includes('SR 26-2')).map(f => ({
          id: f.id,
          title: f.title,
          severity: f.severity,
          status: f.status,
          dueDate: f.dueDate,
        })),
        summary: {
          totalModels: MODELS.length,
          attestedModels: MODELS.filter(m => MODEL_DETAILS[m.id]?.attestation?.sr26_2?.attested).length,
          openFindings: FINDINGS.filter(f => f.framework?.includes('SR 26-2') && f.status !== 'closed').length,
        },
      };
      return sr262Data;
    }

    case 'rpt-2': { // OSFI E-23 Appendix 1 Export
      const osfiData = {
        reportTitle: 'OSFI E-23 Appendix 1 Model Inventory',
        generatedDate: timestamp,
        framework: 'OSFI E-23 (Canada)',
        models: MODELS.map(m => {
          const detail = MODEL_DETAILS[m.id];
          const inv = detail?.osfiInventory;
          return {
            modelId: inv?.modelId || m.id,
            modelName: inv?.modelName || m.name,
            modelPurpose: inv?.modelPurpose || 'N/A',
            modelOwner: inv?.modelOwner || m.owner,
            modelDeveloper: inv?.modelDeveloper || m.provider,
            developmentDate: inv?.developmentDate || 'N/A',
            implementationDate: inv?.implementationDate || 'N/A',
            lastValidationDate: inv?.lastValidationDate || m.lastValidated,
            nextValidationDate: inv?.nextValidationDate || 'N/A',
            riskRating: inv?.riskRating || 'N/A',
            materialityTier: inv?.materialityTier || m.tier,
            dataInputs: inv?.dataInputs?.join('; ') || 'N/A',
            modelOutputs: inv?.modelOutputs?.join('; ') || 'N/A',
            assumptions: inv?.assumptions?.join('; ') || 'N/A',
            limitations: inv?.limitations?.join('; ') || 'N/A',
            compensatingControls: inv?.compensatingControls?.join('; ') || 'N/A',
            regulatoryScope: inv?.regulatoryScope?.join('; ') || 'N/A',
          };
        }),
      };
      return osfiData;
    }

    case 'rpt-3': { // EU AI Act High-Risk Registry
      const euData = {
        reportTitle: 'EU AI Act High-Risk AI System Registry',
        generatedDate: timestamp,
        framework: 'EU AI Act (Regulation 2024/1689)',
        systems: MODELS.map(m => {
          const detail = MODEL_DETAILS[m.id];
          return {
            systemId: m.id,
            systemName: m.name,
            provider: m.provider,
            classification: detail?.attestation?.euAiAct?.classification || 'Not classified',
            documented: detail?.attestation?.euAiAct?.documented || false,
            riskCategory: detail?.riskProfile?.inherentRisk || 'N/A',
            humanOversight: true,
            transparencyMeasures: detail?.attestation?.euAiAct?.documented ? 'Compliant' : 'Pending',
            technicalDocumentation: detail?.attestation?.modelCard?.complete || false,
          };
        }),
      };
      return euData;
    }

    case 'rpt-4': { // NIST AI RMF Profile
      const nistData = {
        reportTitle: 'NIST AI RMF Implementation Profile',
        generatedDate: timestamp,
        framework: 'NIST AI Risk Management Framework 1.0',
        functions: ['Govern', 'Map', 'Measure', 'Manage'],
        modelCoverage: MODELS.map(m => {
          const detail = MODEL_DETAILS[m.id];
          const nistFramework = detail?.mrmFrameworks?.find(f => f.framework === 'NIST AI RMF (US)');
          return {
            modelId: m.id,
            modelName: m.name,
            complianceScore: nistFramework?.compliance || 0,
            controlsMet: nistFramework?.controlsMet || 0,
            totalControls: nistFramework?.totalControls || 0,
          };
        }),
        averageCompliance: Math.round(
          MODELS.reduce((sum, m) => {
            const detail = MODEL_DETAILS[m.id];
            const nist = detail?.mrmFrameworks?.find(f => f.framework === 'NIST AI RMF (US)');
            return sum + (nist?.compliance || 0);
          }, 0) / MODELS.length
        ),
      };
      return nistData;
    }

    case 'rpt-5': { // Quarterly MRM Dashboard
      const mrmData = {
        reportTitle: 'Quarterly MRM Executive Dashboard',
        generatedDate: timestamp,
        period: 'Q2 2026',
        kpis: {
          totalModels: MODELS.length,
          modelsInProduction: MODELS.filter(m => m.status === 'Production').length,
          avgEvalScore: Math.round(MODELS.reduce((s, m) => s + m.evalScore, 0) / MODELS.length),
          totalFindings: FINDINGS.length,
          openFindings: FINDINGS.filter(f => f.status !== 'closed').length,
          criticalFindings: FINDINGS.filter(f => f.severity === 'critical').length,
        },
        modelsByTier: {
          tier1: MODELS.filter(m => m.tier === 'Tier 1').length,
          tier2: MODELS.filter(m => m.tier === 'Tier 2').length,
          tier3: MODELS.filter(m => m.tier === 'Tier 3').length,
        },
        upcomingReviews: MODELS.filter(m => {
          const detail = MODEL_DETAILS[m.id];
          return detail?.revalidation?.status === 'due-soon';
        }).map(m => ({ model: m.name, nextDue: MODEL_DETAILS[m.id]?.revalidation?.nextDue })),
        costSummary: {
          totalMonthlyCost: MODELS.reduce((s, m) => s + m.monthlyCost, 0),
          potentialSavings: getTotalPotentialSavings(),
        },
      };
      return mrmData;
    }

    default:
      return { error: 'Unknown report type' };
  }
}

function exportReport(report: ReportTemplate, format: 'pdf' | 'xlsx' | 'json') {
  const data = generateReportData(report.id);
  const timestamp = dateStamp();
  const baseFilename = `${report.name.replace(/\s+/g, '_')}_${timestamp}`;

  if (format === 'json') {
    downloadFile(JSON.stringify(data, null, 2), `${baseFilename}.json`, 'application/json');
    return;
  }

  if (format === 'xlsx') {
    // Generate CSV (Excel-compatible)
    let csvContent = '';
    if (report.id === 'rpt-2' && 'models' in data) {
      // OSFI E-23 has structured model data
      const osfiData = data as { models: Record<string, string>[] };
      const headers = Object.keys(osfiData.models[0] || {});
      const rows = osfiData.models.map(m => headers.map(h => String(m[h] || '')));
      csvContent = generateCSV(headers, rows);
    } else if ('models' in data) {
      const modelData = data as { models: Record<string, unknown>[] };
      const headers = Object.keys(modelData.models[0] || {});
      const rows = modelData.models.map(m => headers.map(h => String(m[h as keyof typeof m] || '')));
      csvContent = generateCSV(headers, rows);
    } else {
      csvContent = JSON.stringify(data, null, 2);
    }
    downloadFile(csvContent, `${baseFilename}.csv`, 'text/csv');
    return;
  }

  // For PDF, generate a text report (in production, use a PDF library)
  let textContent = `${report.name}\n${'='.repeat(report.name.length)}\n\n`;
  textContent += `Generated: ${timestamp}\n`;
  textContent += `Framework: ${report.framework}\n\n`;
  textContent += `Report Sections: ${report.sections.join(', ')}\n\n`;
  textContent += `--- Data ---\n\n`;
  textContent += JSON.stringify(data, null, 2);

  downloadFile(textContent, `${baseFilename}.txt`, 'text/plain');
}

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-rose-100', text: 'text-rose-700' },
  'in-progress': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'remediation-pending': { bg: 'bg-amber-100', text: 'text-amber-700' },
  closed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  accepted: { bg: 'bg-slate-100', text: 'text-slate-600' },
};

type Tab = 'dependencies' | 'findings' | 'activity' | 'comparison' | 'trends' | 'integrations' | 'reports' | 'discussions';

interface Props {
  embedded?: boolean;
}

export default function ModelOperations({ embedded = false }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('findings');
  const [selectedModels, setSelectedModels] = useState<string[]>(['sonnet-4-5', 'opus-4-7']);
  const [findingFilter, setFindingFilter] = useState<'all' | 'open' | 'critical'>('all');
  const [activityFilter, setActivityFilter] = useState<string>('all');

  // Modal and detail states
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportTemplate | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [showAddIntegration, setShowAddIntegration] = useState(false);
  const [reportFormat, setReportFormat] = useState<'pdf' | 'xlsx' | 'json'>('pdf');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [threads, setThreads] = useState<DiscussionThread[]>(DISCUSSION_THREADS);
  const [newComment, setNewComment] = useState('');

  // Stable ids for form-control / label pairing (accessibility).
  const addIntTypeId = useId();
  const addIntProviderId = useId();
  const addIntNameId = useId();
  const newDiscModelId = useId();
  const newDiscSubjectId = useId();
  const newDiscMessageId = useId();
  const threadCommentId = useId();

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Live selected thread derived from state so comments/status updates reflect immediately.
  const selectedThread = threads.find(t => t.id === selectedThreadId) ?? null;

  const postComment = () => {
    const text = newComment.trim();
    if (!text || !selectedThread) return;
    const comment = { id: `c-${Date.now()}`, author: 'You', date: new Date().toISOString().slice(0, 10), text };
    setThreads(prev => prev.map(t =>
      t.id === selectedThread.id
        ? { ...t, comments: [...t.comments, comment], lastActivity: comment.date }
        : t,
    ));
    setNewComment('');
    showToast('Comment posted', 'success');
  };

  const toggleThreadStatus = () => {
    if (!selectedThread) return;
    const next = selectedThread.status === 'open' ? 'resolved' : 'open';
    setThreads(prev => prev.map(t => (t.id === selectedThread.id ? { ...t, status: next } : t)));
    showToast(`Thread ${next === 'resolved' ? 'resolved' : 'reopened'}`, 'success');
  };

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'findings', label: 'Issues & Findings', count: FINDINGS.filter(f => f.status !== 'closed').length },
    { id: 'dependencies', label: 'Dependencies' },
    { id: 'activity', label: 'Activity Feed' },
    { id: 'comparison', label: 'Model Comparison' },
    { id: 'trends', label: 'Trend Analytics' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'reports', label: 'Regulatory Reports' },
    { id: 'discussions', label: 'Discussions', count: threads.filter(d => d.status === 'open').length },
  ];

  const filteredFindings = useMemo(() => {
    let results = [...FINDINGS];
    if (findingFilter === 'open') results = results.filter(f => f.status !== 'closed');
    if (findingFilter === 'critical') results = results.filter(f => f.severity === 'critical' || f.severity === 'high');
    return results.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [findingFilter]);

  const comparisonData = useMemo(() => getModelComparisonData(selectedModels), [selectedModels]);
  const fleetTrends = useMemo(() => getFleetTrendData(30), []);

  return (
    <div className={embedded ? '' : 'min-h-[calc(100vh-4rem)] relative'}>
      <div className={embedded ? '' : 'relative max-w-7xl mx-auto px-6 py-6'}>
        {!embedded && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Model Operations</h1>
            <p className="text-slate-500 mt-1">Issue tracking, dependencies, analytics, and integrations</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 overflow-x-auto" role="tablist" aria-label="Model Operations sections">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════ FINDINGS TAB ═══════════════════ */}
        {activeTab === 'findings' && (
          <div className="space-y-4">
            {/* Summary Row */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Total Findings', value: FINDINGS.length, color: 'text-slate-700' },
                { label: 'Critical/High', value: FINDINGS.filter(f => f.severity === 'critical' || f.severity === 'high').length, color: 'text-rose-600' },
                { label: 'Open', value: FINDINGS.filter(f => f.status === 'open').length, color: 'text-amber-600' },
                { label: 'In Progress', value: FINDINGS.filter(f => f.status === 'in-progress').length, color: 'text-blue-600' },
                { label: 'Closed', value: FINDINGS.filter(f => f.status === 'closed').length, color: 'text-emerald-600' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-3 shadow-sm">
                  <div className="text-[10px] font-medium text-slate-500 uppercase">{stat.label}</div>
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter:</span>
              {(['all', 'open', 'critical'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFindingFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    findingFilter === f ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'open' ? 'Open Only' : 'Critical/High'}
                </button>
              ))}
            </div>

            {/* Findings List */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100">
                {filteredFindings.map(finding => (
                  <div key={finding.id} className={`p-4 hover:bg-slate-50/50 ${severityColors[finding.severity].bg}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${severityColors[finding.severity].bg} ${severityColors[finding.severity].text} border ${severityColors[finding.severity].border}`}>
                            {finding.severity.toUpperCase()}
                          </span>
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${statusColors[finding.status].bg} ${statusColors[finding.status].text}`}>
                            {finding.status}
                          </span>
                          <span className="text-[10px] text-slate-500">{finding.id}</span>
                          {finding.framework && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded">{finding.framework}</span>
                          )}
                        </div>
                        <div className="text-sm font-medium text-slate-900">{finding.title}</div>
                        <div className="text-xs text-slate-600 mt-1 line-clamp-2">{finding.description}</div>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                          <span>Model: <span className="font-medium text-slate-700">{MODELS.find(m => m.id === finding.modelId)?.name}</span></span>
                          <span>Owner: {finding.owner}</span>
                          <span>Due: <span className={new Date(finding.dueDate) < new Date() ? 'text-rose-600 font-medium' : ''}>{finding.dueDate}</span></span>
                          <span>Source: {finding.source}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedFinding(finding)}
                        className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                      >
                        View Details
                      </button>
                    </div>
                    {finding.comments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="text-[10px] text-slate-500 mb-1">{finding.comments.length} comment{finding.comments.length > 1 ? 's' : ''}</div>
                        <div className="text-xs text-slate-600 bg-white/60 rounded p-2">
                          <span className="font-medium">{finding.comments[finding.comments.length - 1].author}:</span> {finding.comments[finding.comments.length - 1].text}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ DEPENDENCIES TAB ═══════════════════ */}
        {activeTab === 'dependencies' && (
          <div className="space-y-4">
            {/* Dependency Summary */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Dependencies', value: MODEL_DEPENDENCIES.length, icon: 'link' as IconName },
                { label: 'Critical', value: MODEL_DEPENDENCIES.filter(d => d.criticality === 'critical').length, icon: 'exclamation-triangle' as IconName },
                { label: 'Applications', value: MODEL_DEPENDENCIES.filter(d => d.targetType === 'application').length, icon: 'phone' as IconName },
                { label: 'Data Sources', value: MODEL_DEPENDENCIES.filter(d => d.targetType === 'database' || d.targetType === 'api').length, icon: 'circle-stack' as IconName },
              ].map(stat => (
                <div key={stat.label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Icon name={stat.icon} className="w-5 h-5 text-slate-500" />
                    <div>
                      <div className="text-[10px] font-medium text-slate-500 uppercase">{stat.label}</div>
                      <div className="text-xl font-bold text-slate-700">{stat.value}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Dependencies by Model */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Dependency Map by Model</div>
              <div className="space-y-6">
                {MODELS.map(model => {
                  const deps = getModelDependencies(model.id);
                  if (deps.length === 0) return null;

                  return (
                    <div key={model.id} className="border border-slate-100 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-semibold text-slate-900">{model.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{deps.length} dependencies</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {deps.map(dep => (
                          <div key={dep.id} className={`p-3 rounded-lg border ${
                            dep.criticality === 'critical' ? 'bg-rose-50 border-rose-200' :
                            dep.criticality === 'high' ? 'bg-amber-50 border-amber-200' :
                            'bg-slate-50 border-slate-200'
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-slate-900">{dep.targetName}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                dep.criticality === 'critical' ? 'bg-rose-100 text-rose-700' :
                                dep.criticality === 'high' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {dep.criticality}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span className="px-1.5 py-0.5 bg-white rounded">{dep.targetType}</span>
                              <span>{dep.type}</span>
                              <span className="text-slate-300">|</span>
                              <span>{dep.dataFlow}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              Owner: {dep.owner} {dep.sla && `· SLA: ${dep.sla}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ ACTIVITY TAB ═══════════════════ */}
        {activeTab === 'activity' && (
          <div className="space-y-4">
            {/* Activity Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter by category:</span>
              {['all', 'model', 'finding', 'attestation', 'evaluation'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActivityFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    activityFilter === cat ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>

            {/* Activity Feed */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100">
                {ACTIVITY_FEED
                  .filter(e => activityFilter === 'all' || e.category === activityFilter)
                  .map(event => (
                  <div key={event.id} className="p-4 hover:bg-slate-50/50">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${
                        event.action === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                        event.action === 'rejected' ? 'bg-rose-100 text-rose-600' :
                        event.action === 'alert' ? 'bg-amber-100 text-amber-600' :
                        event.action === 'escalated' ? 'bg-orange-100 text-orange-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {event.action === 'approved' ? <Icon name="check" className="w-4 h-4" /> :
                         event.action === 'rejected' ? <Icon name="x-mark" className="w-4 h-4" /> :
                         event.action === 'alert' ? <Icon name="exclamation-triangle" className="w-4 h-4" /> :
                         event.action === 'escalated' ? '↑' :
                         event.action === 'commented' ? <Icon name="chat-bubble" className="w-4 h-4" /> :
                         event.action === 'uploaded' ? <Icon name="paper-clip" className="w-4 h-4" /> :
                         '•'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{event.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{event.category}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">{event.description}</div>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                          <span>{event.actor} ({event.actorRole})</span>
                          {event.modelName && <span>· {event.modelName}</span>}
                          <span>· {new Date(event.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ COMPARISON TAB ═══════════════════ */}
        {activeTab === 'comparison' && (
          <div className="space-y-4">
            {/* Model Selector */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="text-xs font-medium text-slate-700 mb-2">Select models to compare (2-4):</div>
              <div className="flex flex-wrap gap-2">
                {MODELS.map(model => (
                  <button
                    key={model.id}
                    onClick={() => {
                      if (selectedModels.includes(model.id)) {
                        setSelectedModels(selectedModels.filter(id => id !== model.id));
                      } else if (selectedModels.length < 4) {
                        setSelectedModels([...selectedModels, model.id]);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      selectedModels.includes(model.id)
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison Table */}
            {selectedModels.length >= 2 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th scope="col" className="text-left py-3 px-4 font-semibold text-slate-700">Metric</th>
                      {selectedModels.map(id => (
                        <th scope="col" key={id} className="text-center py-3 px-4 font-semibold text-slate-700">
                          {MODELS.find(m => m.id === id)?.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {COMPARISON_METRICS.map(metric => {
                      const values = selectedModels.map(id => comparisonData[id]?.[metric.metric] || 0);
                      const best = metric.higherIsBetter ? Math.max(...values) : Math.min(...values);

                      return (
                        <tr key={metric.metric} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-700">{metric.metric}</div>
                            <div className="text-[10px] text-slate-400">{metric.category}</div>
                          </td>
                          {selectedModels.map(id => {
                            const val = comparisonData[id]?.[metric.metric] || 0;
                            const isBest = val === best;
                            const formatted = metric.unit === '$' ? `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}` :
                                             metric.unit === '%' ? `${val.toFixed(1)}%` :
                                             metric.unit === 'ms' ? `${val.toFixed(0)}ms` :
                                             val.toFixed(1);
                            return (
                              <td key={id} className={`py-2.5 px-4 text-center font-medium ${isBest ? 'text-emerald-600 bg-emerald-50/50' : 'text-slate-700'}`}>
                                {formatted}
                                {isBest && <Icon name="check" className="w-3 h-3 ml-1 inline-block" />}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Radar Chart */}
            {selectedModels.length >= 2 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Performance Radar</div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={[
                      { metric: 'Safety', ...Object.fromEntries(selectedModels.map(id => [id, comparisonData[id]?.['Safety Score'] || 0])) },
                      { metric: 'Quality', ...Object.fromEntries(selectedModels.map(id => [id, comparisonData[id]?.['Quality Score'] || 0])) },
                      { metric: 'Compliance', ...Object.fromEntries(selectedModels.map(id => [id, (comparisonData[id]?.['SR 26-2 Compliance'] || 0)])) },
                      { metric: 'Uptime', ...Object.fromEntries(selectedModels.map(id => [id, comparisonData[id]?.['Uptime (30d)'] || 0])) },
                    ]}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                      {selectedModels.map((id, idx) => (
                        <Radar
                          key={id}
                          name={MODELS.find(m => m.id === id)?.name}
                          dataKey={id}
                          stroke={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][idx]}
                          fill={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][idx]}
                          fillOpacity={0.1}
                          strokeWidth={2}
                        />
                      ))}
                      <Tooltip contentStyle={tooltipStyle} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════ TRENDS TAB ═══════════════════ */}
        {activeTab === 'trends' && (
          <div className="space-y-4">
            {/* Fleet Trend Charts */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Fleet Safety & Quality Trends (30d)</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fleetTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis domain={[70, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="avgSafety" stroke="#10b981" strokeWidth={2} dot={false} name="Safety" />
                      <Line type="monotone" dataKey="avgQuality" stroke="#3b82f6" strokeWidth={2} dot={false} name="Quality" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="text-sm font-semibold text-slate-900 mb-4">Fleet Cost & Risk Trends (30d)</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fleetTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis yAxisId="cost" orientation="left" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="risk" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="avgCost" stroke="#f59e0b" strokeWidth={2} dot={false} name="Daily Cost ($)" yAxisId="cost" />
                      <Line type="monotone" dataKey="avgRisk" stroke="#ef4444" strokeWidth={2} dot={false} name="Risk Score" yAxisId="risk" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Compliance Trend */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Fleet Compliance Trend (30d)</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fleetTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis domain={[60, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="avgCompliance" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Compliance %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ INTEGRATIONS TAB ═══════════════════ */}
        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">{INTEGRATIONS.filter(i => i.status === 'active').length} active integrations</div>
              <button
                onClick={() => setShowAddIntegration(true)}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
              >
                + Add Integration
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {INTEGRATIONS.map(integration => (
                <div key={integration.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{integration.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{integration.type}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{integration.provider}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                      integration.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      integration.status === 'error' ? 'bg-rose-100 text-rose-700' :
                      integration.status === 'pending-setup' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {integration.status}
                    </span>
                  </div>
                  {integration.lastSync && (
                    <div className="text-[10px] text-slate-500">
                      Last sync: {new Date(integration.lastSync).toLocaleString()}
                      {integration.syncFrequency && ` · ${integration.syncFrequency}`}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setSelectedIntegration(integration)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      Configure
                    </button>
                    <button
                      onClick={() => {
                        showToast(`Testing ${integration.name} connection...`, 'info');
                        setTimeout(() => showToast(`${integration.name} test ${integration.status === 'active' ? 'successful' : 'failed'}`, integration.status === 'active' ? 'success' : 'error'), 1500);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      Test
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════ REPORTS TAB ═══════════════════ */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">Generate compliance reports for regulatory submissions</div>

            <div className="grid grid-cols-2 gap-4">
              {REPORT_TEMPLATES.map(report => (
                <div key={report.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{report.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{report.framework}</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded uppercase">{report.format}</span>
                  </div>
                  <div className="text-xs text-slate-600 mb-3">{report.description}</div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {report.sections.map(section => (
                      <span key={section} className="text-[9px] px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded">{section}</span>
                    ))}
                  </div>
                  {report.lastGenerated && (
                    <div className="text-[10px] text-slate-500 mb-3">Last generated: {report.lastGenerated}</div>
                  )}
                  <button
                    onClick={() => setSelectedReport(report)}
                    className="w-full px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                  >
                    Generate Report
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════ DISCUSSIONS TAB ═══════════════════ */}
        {activeTab === 'discussions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">{threads.filter(d => d.status === 'open').length} open discussions</div>
              <button
                onClick={() => setShowNewDiscussion(true)}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
              >
                + New Discussion
              </button>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100">
                {threads.map(thread => (
                  <div key={thread.id} className="p-4 hover:bg-slate-50/50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                            thread.status === 'open' ? 'bg-blue-100 text-blue-700' :
                            thread.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {thread.status}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {MODELS.find(m => m.id === thread.modelId)?.name}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-slate-900">{thread.subject}</div>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                          <span>Started by {thread.createdBy}</span>
                          <span>· {thread.comments.length} comments</span>
                          <span>· {thread.participants.length} participants</span>
                          <span>· Last activity {thread.lastActivity}</span>
                        </div>
                        {thread.comments.length > 0 && (
                          <div className="mt-3 p-2 bg-slate-50 rounded-lg">
                            <div className="text-[10px] text-slate-500 mb-1">Latest:</div>
                            <div className="text-xs text-slate-600">
                              <span className="font-medium">{thread.comments[thread.comments.length - 1].author}:</span>{' '}
                              {thread.comments[thread.comments.length - 1].text.slice(0, 100)}
                              {thread.comments[thread.comments.length - 1].text.length > 100 && '...'}
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedThreadId(thread.id)}
                        className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex-shrink-0"
                      >
                        View Thread
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════ TOAST NOTIFICATION ═══════════════════ */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' :
          toast.type === 'error' ? 'bg-rose-500 text-white' :
          'bg-slate-800 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ═══════════════════ FINDING DETAIL MODAL ═══════════════════ */}
      {selectedFinding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedFinding(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${severityColors[selectedFinding.severity].bg} ${severityColors[selectedFinding.severity].text}`}>
                      {selectedFinding.severity.toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded ${statusColors[selectedFinding.status].bg} ${statusColors[selectedFinding.status].text}`}>
                      {selectedFinding.status}
                    </span>
                    <span className="text-xs text-slate-500">{selectedFinding.id}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedFinding.title}</h3>
                </div>
                <button onClick={() => setSelectedFinding(null)} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Description</div>
                <div className="text-sm text-slate-700">{selectedFinding.description}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Model</div>
                  <div className="text-sm text-slate-700">{MODELS.find(m => m.id === selectedFinding.modelId)?.name}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Owner</div>
                  <div className="text-sm text-slate-700">{selectedFinding.owner}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Due Date</div>
                  <div className={`text-sm ${new Date(selectedFinding.dueDate) < new Date() ? 'text-rose-600' : 'text-slate-700'}`}>{selectedFinding.dueDate}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Source</div>
                  <div className="text-sm text-slate-700">{selectedFinding.source}</div>
                </div>
              </div>
              {selectedFinding.framework && (
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Framework</div>
                  <div className="text-sm text-slate-700">{selectedFinding.framework}</div>
                </div>
              )}
              {selectedFinding.comments.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-2">Comments ({selectedFinding.comments.length})</div>
                  <div className="space-y-2">
                    {selectedFinding.comments.map((comment, idx) => (
                      <div key={idx} className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-700">{comment.author}</span>
                          <span className="text-[10px] text-slate-500">{comment.date}</span>
                        </div>
                        <div className="text-sm text-slate-600">{comment.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { showToast('Status updated', 'success'); setSelectedFinding(null); }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Update Status
              </button>
              <button onClick={() => setSelectedFinding(null)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ INTEGRATION CONFIG MODAL ═══════════════════ */}
      {selectedIntegration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedIntegration(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Configure {selectedIntegration.name}</h3>
                <button onClick={() => setSelectedIntegration(null)} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-[10px] font-medium px-2 py-1 rounded ${
                  selectedIntegration.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  selectedIntegration.status === 'error' ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {selectedIntegration.status}
                </span>
                <span className="text-xs text-slate-500">{selectedIntegration.type} · {selectedIntegration.provider}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Configuration</div>
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  {Object.entries(selectedIntegration.config).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-24">{key}:</span>
                      <input
                        type="text"
                        aria-label={key}
                        defaultValue={value}
                        className="flex-1 text-xs p-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {selectedIntegration.syncFrequency && (
                <div>
                  <div className="text-xs font-medium text-slate-700 mb-2">Sync Settings</div>
                  <div className="text-sm text-slate-600">Frequency: {selectedIntegration.syncFrequency}</div>
                  {selectedIntegration.lastSync && (
                    <div className="text-xs text-slate-500 mt-1">Last sync: {new Date(selectedIntegration.lastSync).toLocaleString()}</div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { showToast('Configuration saved', 'success'); setSelectedIntegration(null); }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
              <button onClick={() => setSelectedIntegration(null)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ ADD INTEGRATION MODAL ═══════════════════ */}
      {showAddIntegration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddIntegration(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Add Integration</h3>
                <button onClick={() => setShowAddIntegration(false)} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor={addIntTypeId} className="text-xs font-medium text-slate-700 block mb-2">Integration Type</label>
                <select id={addIntTypeId} className="w-full text-sm p-2 border border-slate-200 rounded-lg">
                  <option>Ticketing (ServiceNow, Jira)</option>
                  <option>Notification (Slack, Email)</option>
                  <option>Reporting (Power BI, Tableau)</option>
                  <option>Data Sync (Splunk, Custom Webhook)</option>
                </select>
              </div>
              <div>
                <label htmlFor={addIntProviderId} className="text-xs font-medium text-slate-700 block mb-2">Provider</label>
                <select id={addIntProviderId} className="w-full text-sm p-2 border border-slate-200 rounded-lg">
                  <option>ServiceNow</option>
                  <option>Jira</option>
                  <option>Slack</option>
                  <option>Power BI</option>
                  <option>Custom Webhook</option>
                </select>
              </div>
              <div>
                <label htmlFor={addIntNameId} className="text-xs font-medium text-slate-700 block mb-2">Name</label>
                <input id={addIntNameId} type="text" placeholder="Integration name" className="w-full text-sm p-2 border border-slate-200 rounded-lg" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { showToast('Integration added (demo)', 'success'); setShowAddIntegration(false); }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Add Integration
              </button>
              <button onClick={() => setShowAddIntegration(false)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ REPORT GENERATION MODAL ═══════════════════ */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedReport(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Generate Report</h3>
                <button onClick={() => setSelectedReport(null)} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">{selectedReport.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{selectedReport.framework}</div>
              </div>
              <div className="text-sm text-slate-600">{selectedReport.description}</div>
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Sections Included</div>
                <div className="flex flex-wrap gap-1">
                  {selectedReport.sections.map(section => (
                    <span key={section} className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded">{section}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Export Format</div>
                <div className="flex gap-3">
                  {(['pdf', 'xlsx', 'json'] as const).map(fmt => (
                    <label key={fmt} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      reportFormat === fmt ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    }`}>
                      <input
                        type="radio"
                        name="format"
                        checked={reportFormat === fmt}
                        onChange={() => setReportFormat(fmt)}
                        className="text-blue-600"
                      />
                      <span className="text-xs text-slate-700 uppercase font-medium">{fmt}</span>
                    </label>
                  ))}
                </div>
                <div className="text-[10px] text-slate-500 mt-2">
                  {reportFormat === 'pdf' && 'Text report (PDF preview as .txt)'}
                  {reportFormat === 'xlsx' && 'CSV spreadsheet (Excel-compatible)'}
                  {reportFormat === 'json' && 'Structured JSON data'}
                </div>
              </div>
              {selectedReport.lastGenerated && (
                <div className="text-xs text-slate-500">Last generated: {selectedReport.lastGenerated}</div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  showToast(`Generating ${selectedReport.name}...`, 'info');
                  try {
                    exportReport(selectedReport, reportFormat);
                    setTimeout(() => showToast(`${selectedReport.name} exported as ${reportFormat.toUpperCase()}!`, 'success'), 500);
                  } catch {
                    showToast('Export failed', 'error');
                  }
                  setSelectedReport(null);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Export Report
              </button>
              <button onClick={() => setSelectedReport(null)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ DISCUSSION THREAD MODAL ═══════════════════ */}
      {selectedThread && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedThreadId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded ${
                      selectedThread.status === 'open' ? 'bg-blue-100 text-blue-700' :
                      selectedThread.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedThread.status}
                    </span>
                    <span className="text-xs text-slate-500">{MODELS.find(m => m.id === selectedThread.modelId)?.name}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedThread.subject}</h3>
                </div>
                <button onClick={() => setSelectedThreadId(null)} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-xs text-slate-500">
                Started by {selectedThread.createdBy} on {selectedThread.createdDate} · {selectedThread.participants.length} participants
              </div>
              <div className="space-y-3">
                {selectedThread.comments.map(comment => (
                  <div key={comment.id} className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">{comment.author}</span>
                      <span className="text-xs text-slate-500">{comment.date}</span>
                    </div>
                    <div className="text-sm text-slate-600">{comment.text}</div>
                    {comment.reactions && comment.reactions.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {comment.reactions.map((r, i) => (
                          <span key={i} className="text-xs bg-white px-2 py-1 rounded-full border border-slate-200">
                            {r.emoji} {r.users.length}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-4">
                <label htmlFor={threadCommentId} className="sr-only">Add a comment</label>
                <textarea
                  id={threadCommentId}
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="w-full text-sm p-3 border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-blue-500"
                  rows={3}
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-between">
              <button
                onClick={toggleThreadStatus}
                className={`px-4 py-2 text-xs font-medium rounded-lg ${
                  selectedThread.status === 'open'
                    ? 'text-emerald-600 border border-emerald-200 hover:bg-emerald-50'
                    : 'text-blue-600 border border-blue-200 hover:bg-blue-50'
                }`}
              >
                {selectedThread.status === 'open' ? 'Mark as Resolved' : 'Reopen Thread'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={postComment}
                  disabled={!newComment.trim()}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Post Comment
                </button>
                <button onClick={() => setSelectedThreadId(null)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ NEW DISCUSSION MODAL ═══════════════════ */}
      {showNewDiscussion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewDiscussion(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">New Discussion</h3>
                <button onClick={() => setShowNewDiscussion(false)} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor={newDiscModelId} className="text-xs font-medium text-slate-700 block mb-2">Model</label>
                <select id={newDiscModelId} className="w-full text-sm p-2 border border-slate-200 rounded-lg">
                  {MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={newDiscSubjectId} className="text-xs font-medium text-slate-700 block mb-2">Subject</label>
                <input id={newDiscSubjectId} type="text" placeholder="Discussion subject" className="w-full text-sm p-2 border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label htmlFor={newDiscMessageId} className="text-xs font-medium text-slate-700 block mb-2">Initial Message</label>
                <textarea
                  id={newDiscMessageId}
                  placeholder="Start the discussion..."
                  className="w-full text-sm p-3 border border-slate-200 rounded-lg resize-none"
                  rows={4}
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { showToast('Discussion created (demo)', 'success'); setShowNewDiscussion(false); }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Create Discussion
              </button>
              <button onClick={() => setShowNewDiscussion(false)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}