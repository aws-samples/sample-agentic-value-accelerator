/**
 * SLACenter - Full SLA management system for agent operations.
 *
 * Features:
 *   - KPI row with compliance stats, breach counts, and error budget
 *   - SLA Dashboard with cards showing status, metrics, and trends
 *   - SLA Definitions with create/edit capabilities and templates
 *   - Breach Management with timeline, root cause, and resolution tracking
 *   - Compliance Reports with export capabilities
 *   - Error Budget visualization with burn-down tracking
 *
 * Live Data Integration:
 *   - SLA compliance calculated from CloudWatch metrics
 *   - Availability from uptime checks
 *   - Latency from response time metrics
 *   - Error rate from error count metrics
 *   - Targets stored in DynamoDB
 */

import { useState, useMemo, useId } from 'react';
import { Icon, type IconName } from '../icons';
import { LiveDataBadge } from '../DataSourceIndicator';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import {
  useSLAs,
  useSLABreaches,
  useSLACompliance,
  type Breach,
  type SLAStatus,
  type MeasurementWindow,
  type BreachSeverity,
  type SLACreateRequest,
} from './useSLAData';

// ════════════════════════════════════════════════════════════════════════════
// Types - re-exported from useSLAData for convenience
// ════════════════════════════════════════════════════════════════════════════

// Types are imported from useSLAData hook

// ════════════════════════════════════════════════════════════════════════════
// SLA Templates (static config)
// ════════════════════════════════════════════════════════════════════════════

const SLA_TEMPLATES = [
  { id: 'tpl-1', name: 'Production Critical', availability: 99.99, latencyP99: 50, errorRate: 0.01, window: 'monthly' as MeasurementWindow },
  { id: 'tpl-2', name: 'Production Standard', availability: 99.9, latencyP99: 200, errorRate: 0.1, window: 'monthly' as MeasurementWindow },
  { id: 'tpl-3', name: 'Dev/Test', availability: 95.0, latencyP99: 1000, errorRate: 1.0, window: 'weekly' as MeasurementWindow },
  { id: 'tpl-4', name: 'Customer-Facing', availability: 99.5, latencyP99: 500, errorRate: 0.5, window: 'weekly' as MeasurementWindow },
];

const tooltipStyle = { fontSize: 11, backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 8 };

/** Render an optional percentage, or an em dash when there is no measured value. */
function pct(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' ? `${value.toFixed(digits)}%` : '—';
}

/** Render an optional minute count, or an em dash when it is not derivable. */
function minutes(value: number | null | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(1)} min` : '—';
}

/**
 * Whether a lower value is better for a metric. Prefers the explicit
 * `lowerIsBetter` flag on the metric; falls back to a unit/name heuristic only
 * when the flag is absent (e.g. live data). This avoids mis-classifying
 * rate-style metrics whose target is >= 1 (Error Rate 5.0%, False Positive 2.0%)
 * as "higher is better".
 */
function metricIsLowerBetter(metric: { name: string; unit: string; lowerIsBetter?: boolean }): boolean {
  if (typeof metric.lowerIsBetter === 'boolean') return metric.lowerIsBetter;
  if (metric.unit === 'ms' || metric.unit === 's') return true;
  return /rate|latency|time|error/i.test(metric.name);
}

// ════════════════════════════════════════════════════════════════════════════
// Loading Skeleton Component
// ════════════════════════════════════════════════════════════════════════════

function LoadingSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

function KPICardSkeleton() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
      <LoadingSkeleton className="h-3 w-20 mb-2" />
      <LoadingSkeleton className="h-7 w-16 mb-1" />
      <LoadingSkeleton className="h-2.5 w-24" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helper Components
// ════════════════════════════════════════════════════════════════════════════

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const denom = data.length > 1 ? data.length - 1 : 1;
  const points = data.map((v, i) => `${(i / denom) * 60},${20 - ((v - min) / range) * 16}`).join(' ');
  return (
    <svg width="60" height="20" className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusBadge({ status }: { status: SLAStatus }) {
  const config: Record<SLAStatus, { bg: string; text: string; label: string }> = {
    meeting: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Meeting' },
    'at-risk': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'At Risk' },
    breached: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Breached' },
    unknown: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Not Measured' },
  };
  const c = config[status] ?? config.unknown;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${c.bg} ${c.text}`}>{c.label}</span>;
}

/** Severity is optional on API-sourced breaches - show "unknown" rather than guessing. */
function SeverityBadge({ severity }: { severity?: BreachSeverity }) {
  const config: Record<BreachSeverity, { bg: string; text: string }> = {
    critical: { bg: 'bg-rose-100', text: 'text-rose-700' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700' },
    medium: { bg: 'bg-amber-100', text: 'text-amber-700' },
    low: { bg: 'bg-slate-100', text: 'text-slate-600' },
  };
  const c = severity ? config[severity] : { bg: 'bg-slate-100', text: 'text-slate-500' };
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${c.bg} ${c.text}`}>{severity ?? 'unknown'}</span>;
}

function DataSourceIndicator({ isLive, source }: { isLive: boolean; source: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <span className={isLive ? 'text-emerald-600' : 'text-amber-600'}>
        {isLive ? 'Live' : 'Demo'}
      </span>
      <span className="text-slate-400">({source})</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════════════════

type Tab = 'dashboard' | 'definitions' | 'breaches' | 'reports' | 'error-budget';

export default function SLACenter() {
  // Live data hooks
  const {
    slas,
    errorBudgets,
    loading: slasLoading,
    error: slasError,
    isLive: slasLive,
    source: slasSource,
    budgetsLive,
    budgetsSource,
    budgetsNote,
    createSLA,
  } = useSLAs();

  const {
    breaches,
    activeCount: activeBreachCount,
    loading: breachesLoading,
    // The hook already reports whether the breach rows are real; this component was not
    // reading it, so seeded breaches drove the counts and the "N active" caption.
    isLive: breachesLive,
    acknowledge: acknowledgeBreach,
    resolve: resolveBreach,
  } = useSLABreaches();

  const {
    reports: complianceReports,
    isLive: reportsLive,
    source: reportsSource,
  } = useSLACompliance();

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [expandedSla, setExpandedSla] = useState<string | null>(null);
  const [selectedBreach, setSelectedBreach] = useState<Breach | null>(null);
  const [showCreateSla, setShowCreateSla] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Form IDs for accessibility
  const slaNameId = useId();
  const slaDescId = useId();
  const slaTemplateId = useId();
  const slaWindowId = useId();

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Computed KPIs from live data
  const kpis = useMemo(() => {
    const meeting = slas.filter(s => s.status === 'meeting').length;
    const atRisk = slas.filter(s => s.status === 'at-risk').length;
    const breached = slas.filter(s => s.status === 'breached').length;
    // Average only over SLAs that actually report a measured compliance value.
    const measured = slas
      .map(s => s.overallCompliance)
      .filter((v): v is number => typeof v === 'number');
    const avgCompliance = measured.length > 0
      ? measured.reduce((sum, v) => sum + v, 0) / measured.length
      : null;
    // Count breaches whose start falls in the current calendar month (YYYY-MM),
    // computed at runtime rather than a hardcoded string.
    const currentMonth = new Date().toISOString().slice(0, 7);
    const breachesThisMonth = breaches.filter(b => b.startTime.startsWith(currentMonth)).length;
    // Averaged over EVERY budget, not just the positive ones. The previous version filtered
    // on `remainingPercent > 0`, which dropped exactly the SLAs in the worst state — an
    // exhausted or overspent budget is a real measurement (remainingPercent goes negative,
    // and the rest of this file treats `<= 0` as "budget exhausted - SLA breached" at 803 and
    // 899). Excluding them biased the headline upward: with budgets of 69.9 / 19.4 / -26.4 /
    // 81.9 the KPI read 57.1% where the true mean is 36.2%, and the label said only
    // "Remaining" with nothing to say a quarter of the fleet had been left out.
    // null, not 0, when there is nothing to average: "no error budgets" and "no budget
    // remaining" are opposite readings and 0 asserts the alarming one.
    const avgErrorBudget = errorBudgets.length > 0
      ? errorBudgets.reduce((sum, e) => sum + e.remainingPercent, 0) / errorBudgets.length
      : null;

    // Average resolution time derived from resolved breaches that have both a
    // start and end timestamp. Labeled N/A when none are resolved.
    const resolvedWithTimes = breaches.filter(b => b.status === 'resolved' && b.endTime);
    const avgResolutionLabel = resolvedWithTimes.length > 0
      ? (() => {
          const avgMin = resolvedWithTimes.reduce(
            (sum, b) => sum + (Date.parse(b.endTime as string) - Date.parse(b.startTime)) / 60000,
            0,
          ) / resolvedWithTimes.length;
          return `${Math.floor(avgMin / 60)}h ${Math.round(avgMin % 60)}m`;
        })()
      : 'N/A';

    return { meeting, atRisk, breached, avgCompliance, breachesThisMonth, avgErrorBudget, avgResolutionLabel };
  }, [slas, breaches, errorBudgets]);

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'dashboard', label: 'SLA Dashboard', icon: 'squares-2x2' },
    { id: 'definitions', label: 'SLA Definitions', icon: 'clipboard-document-list' },
    { id: 'breaches', label: 'Breach Management', icon: 'exclamation-triangle' },
    { id: 'reports', label: 'Compliance Reports', icon: 'document-check' },
    { id: 'error-budget', label: 'Error Budget', icon: 'chart-bar' },
  ];

  // Combined loading state
  const isLoading = slasLoading || breachesLoading;

  // Handle SLA creation
  const handleCreateSLA = async () => {
    const nameInput = document.getElementById(slaNameId) as HTMLInputElement;
    const descInput = document.getElementById(slaDescId) as HTMLTextAreaElement;
    const windowInput = document.getElementById(slaWindowId) as HTMLSelectElement;

    if (!nameInput?.value) {
      showToast('Please enter an SLA name', 'error');
      return;
    }

    const template = selectedTemplate ? SLA_TEMPLATES.find(t => t.id === selectedTemplate) : null;

    const request: SLACreateRequest = {
      name: nameInput.value,
      description: descInput?.value || '',
      templateId: selectedTemplate || undefined,
      measurementWindow: (windowInput?.value as MeasurementWindow) || 'monthly',
      agents: [],
      metrics: template ? [
        { name: 'Availability', target: template.availability, unit: '%' },
        { name: 'Latency P99', target: template.latencyP99, unit: 'ms' },
        { name: 'Error Rate', target: template.errorRate, unit: '%' },
      ] : [],
      notificationChannels: [],
    };

    try {
      await createSLA(request);
      showToast('SLA created successfully', 'success');
      setShowCreateSla(false);
      setSelectedTemplate(null);
    } catch (err) {
      showToast('Failed to create SLA', 'error');
    }
  };

  // Handle breach actions
  const handleAcknowledgeBreach = async (breachId: string) => {
    try {
      await acknowledgeBreach(breachId);
      showToast('Breach acknowledged', 'success');
      setSelectedBreach(null);
    } catch {
      showToast('Failed to acknowledge breach', 'error');
    }
  };

  const handleResolveBreach = async (breachId: string) => {
    try {
      await resolveBreach(breachId, 'Resolved via SLA Center');
      showToast('Breach marked as resolved', 'success');
      setSelectedBreach(null);
    } catch {
      showToast('Failed to resolve breach', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Source Indicator */}
      <div className="flex items-center justify-between">
        <DataSourceIndicator isLive={slasLive} source={slasSource} />
        {slasError && (
          <div className="text-[10px] text-amber-600 flex items-center gap-1">
            <Icon name="exclamation-triangle" className="w-3 h-3" />
            {slasError}
          </div>
        )}
      </div>

      {/* KPI Row */}
      {isLoading ? (
        <div className="grid grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <KPICardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="text-[10px] font-medium text-slate-500 uppercase">Overall Compliance</div>
            <div className={`text-2xl font-bold ${kpis.avgCompliance === null ? 'text-slate-400' : 'text-slate-900'}`}>
              {pct(kpis.avgCompliance)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {kpis.avgCompliance === null ? 'not measured yet' : 'Fleet average'}
            </div>
          </div>
          <div className="bg-emerald-50/80 backdrop-blur-sm rounded-xl border border-emerald-200/60 p-4 shadow-sm">
            <div className="text-[10px] font-medium text-emerald-600 uppercase">SLAs Meeting</div>
            <div className="text-2xl font-bold text-emerald-700">{kpis.meeting}</div>
            <div className="text-[10px] text-emerald-500 mt-1">of {slas.length} total</div>
          </div>
          <div className="bg-amber-50/80 backdrop-blur-sm rounded-xl border border-amber-200/60 p-4 shadow-sm">
            <div className="text-[10px] font-medium text-amber-600 uppercase">SLAs At Risk</div>
            <div className="text-2xl font-bold text-amber-700">{kpis.atRisk}</div>
            <div className="text-[10px] text-amber-500 mt-1">Approaching threshold</div>
          </div>
          <div className="bg-rose-50/80 backdrop-blur-sm rounded-xl border border-rose-200/60 p-4 shadow-sm">
            <div className="text-[10px] font-medium text-rose-600 uppercase">SLAs Breached</div>
            <div className="text-2xl font-bold text-rose-700">{kpis.breached}</div>
            <div className="text-[10px] text-rose-500 mt-1">Requires action</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="text-[10px] font-medium text-slate-500 uppercase">Breaches This Month</div>
            <div className={`text-2xl font-bold ${breachesLive ? 'text-slate-900' : 'text-slate-400'}`}>
              {breachesLive ? kpis.breachesThisMonth : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {breachesLive ? `${activeBreachCount} active` : 'breach records not connected'}
            </div>
          </div>
          <div className="bg-blue-50/80 backdrop-blur-sm rounded-xl border border-blue-200/60 p-4 shadow-sm">
            <div className="text-[10px] font-medium text-blue-600 uppercase">Avg Error Budget</div>
            <div
              className={`text-2xl font-bold ${
                budgetsLive && kpis.avgErrorBudget !== null ? 'text-blue-700' : 'text-slate-400'
              }`}
            >
              {budgetsLive && kpis.avgErrorBudget !== null
                ? `${kpis.avgErrorBudget.toFixed(1)}%`
                : '—'}
            </div>
            <div className="text-[10px] text-blue-500 mt-1">
              {!budgetsLive
                ? 'not measured'
                : kpis.avgErrorBudget === null
                  ? 'no error budgets defined'
                  : 'Remaining, all SLAs'}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl overflow-x-auto" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ DASHBOARD TAB ═══════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-2 gap-4">
          {slas.map(sla => {
            const isExpanded = expandedSla === sla.id;
            const statusColor = sla.status === 'meeting' ? 'border-emerald-200'
              : sla.status === 'at-risk' ? 'border-amber-200'
              : sla.status === 'breached' ? 'border-rose-200'
              : 'border-slate-200';
            const trendColor = sla.status === 'meeting' ? '#10b981'
              : sla.status === 'at-risk' ? '#f59e0b'
              : sla.status === 'breached' ? '#ef4444'
              : '#94a3b8';

            return (
              <div
                key={sla.id}
                className={`bg-white/80 backdrop-blur-sm rounded-xl border-2 ${statusColor} shadow-sm transition-all ${isExpanded ? 'col-span-2' : ''}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900">{sla.name}</span>
                        <StatusBadge status={sla.status} />
                      </div>
                      <div className="text-[10px] text-slate-500">{sla.agents.length} agents assigned</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${sla.overallCompliance === null ? 'text-slate-400' : 'text-slate-900'}`}>
                        {pct(sla.overallCompliance)}
                      </div>
                      <MiniSparkline data={sla.metrics[0]?.trend ?? []} color={trendColor} />
                    </div>
                  </div>

                  {/* Key Metrics */}
                  {sla.metrics.length === 0 && (
                    <div className="mb-3 p-2 rounded-lg bg-slate-50 text-[10px] text-slate-500">
                      No metric measurements available yet
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {sla.metrics.slice(0, isExpanded ? sla.metrics.length : 2).map(metric => {
                      const isMet = metricIsLowerBetter(metric)
                        ? metric.current <= metric.target
                        : metric.current >= metric.target;
                      return (
                        <div key={metric.name} className={`p-2 rounded-lg ${isMet ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500">{metric.name}</span>
                            <span className={`text-[9px] font-medium ${isMet ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isMet ? 'Met' : 'Miss'}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className={`text-sm font-semibold ${isMet ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {metric.current}{metric.unit}
                            </span>
                            <span className="text-[10px] text-slate-400">/ {metric.target}{metric.unit}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span>Window: {sla.measurementWindow}</span>
                      <span className="text-slate-300">|</span>
                      <span>{sla.windowRemaining} remaining</span>
                    </div>
                    <button
                      onClick={() => setExpandedSla(isExpanded ? null : sla.id)}
                      className="text-[10px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                      <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                      <div>
                        <div className="text-xs font-medium text-slate-700 mb-1">Description</div>
                        <p className="text-xs text-slate-600">{sla.description || 'No description recorded'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-slate-700 mb-2">Assigned Agents</div>
                          <div className="flex flex-wrap gap-1">
                            {sla.agents.length === 0
                              ? <span className="text-[10px] text-slate-400">None assigned</span>
                              : sla.agents.map(agent => (
                                  <span key={agent} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{agent}</span>
                                ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-700 mb-2">Notification Channels</div>
                          <div className="flex flex-wrap gap-1">
                            {sla.notificationChannels.length === 0
                              ? <span className="text-[10px] text-slate-400">None configured</span>
                              : sla.notificationChannels.map(ch => (
                                  <span key={ch} className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{ch}</span>
                                ))}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <span className="text-slate-500">Template:</span>
                          <span className="ml-1 font-medium text-slate-700">{sla.template || 'Custom'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Breach Threshold:</span>
                          <span className="ml-1 font-medium text-slate-700">{pct(sla.breachThreshold, 1)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Last Updated:</span>
                          <span className="ml-1 font-medium text-slate-700">{sla.lastUpdated || '—'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════ DEFINITIONS TAB ═══════════════════ */}
      {activeTab === 'definitions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">{slas.length} SLAs defined</div>
            <button
              onClick={() => setShowCreateSla(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
            >
              <Icon name="plus" className="w-4 h-4" />
              Create SLA
            </button>
          </div>

          {/* Templates */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-900 mb-3">SLA Templates</div>
            <div className="grid grid-cols-4 gap-3">
              {SLA_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => { setSelectedTemplate(tpl.id); setShowCreateSla(true); }}
                  className="p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-left transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900">{tpl.name}</div>
                  <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                    <div>Availability: {tpl.availability}%</div>
                    <div>Latency P99: {tpl.latencyP99}ms</div>
                    <div>Error Rate: {tpl.errorRate}%</div>
                    <div>Window: {tpl.window}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SLA Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-slate-700">SLA Name</th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold text-slate-700">Template</th>
                  <th scope="col" className="text-center py-3 px-4 font-semibold text-slate-700">Agents</th>
                  <th scope="col" className="text-center py-3 px-4 font-semibold text-slate-700">Window</th>
                  <th scope="col" className="text-center py-3 px-4 font-semibold text-slate-700">Threshold</th>
                  <th scope="col" className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th scope="col" className="text-center py-3 px-4 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slas.map(sla => (
                  <tr key={sla.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{sla.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {sla.description ? `${sla.description.slice(0, 50)}...` : 'No description recorded'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{sla.template || 'Custom'}</td>
                    <td className="py-3 px-4 text-center text-slate-600">{sla.agents.length}</td>
                    <td className="py-3 px-4 text-center text-slate-600 capitalize">{sla.measurementWindow}</td>
                    <td className="py-3 px-4 text-center text-slate-600">{pct(sla.breachThreshold, 1)}</td>
                    <td className="py-3 px-4 text-center"><StatusBadge status={sla.status} /></td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => showToast('Edit SLA (demo)', 'info')}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════ BREACHES TAB ═══════════════════ */}
      {activeTab === 'breaches' && (
        <div className="space-y-4">
          {/* Active Breaches Summary */}
          <div className="grid grid-cols-4 gap-4">
            {/* When the breach store is not live these are counts of seeded example rows,
                so they render as em-dashes rather than as an alarm ("1 Active Breach"). */}
            {[
              { label: 'Active Breaches', value: breachesLive ? breaches.filter(b => b.status === 'active').length : '—', color: breachesLive ? 'text-rose-600' : 'text-slate-400', bg: 'bg-rose-50' },
              { label: 'Acknowledged', value: breachesLive ? breaches.filter(b => b.status === 'acknowledged').length : '—', color: breachesLive ? 'text-amber-600' : 'text-slate-400', bg: 'bg-amber-50' },
              { label: 'Resolved', value: breachesLive ? breaches.filter(b => b.status === 'resolved').length : '—', color: breachesLive ? 'text-emerald-600' : 'text-slate-400', bg: 'bg-emerald-50' },
              { label: 'Avg Resolution', value: breachesLive ? kpis.avgResolutionLabel : '—', color: 'text-slate-700', bg: 'bg-slate-50' },
            ].map(stat => (
              <div key={stat.label} className={`${stat.bg}/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm`}>
                <div className="text-[10px] font-medium text-slate-500 uppercase">{stat.label}</div>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Active Breaches */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-900">Active and Recent Breaches</div>
            </div>
            <div className="divide-y divide-slate-100">
              {breaches.map(breach => (
                <div key={breach.id} className={`p-4 hover:bg-slate-50/50 ${breach.status === 'active' ? 'bg-rose-50/30' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={breach.severity} />
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                          breach.status === 'active' ? 'bg-rose-100 text-rose-700' :
                          breach.status === 'acknowledged' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {breach.status}
                        </span>
                        {breach.incidentId && (
                          <span className="text-[10px] text-blue-600">{breach.incidentId}</span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        {breach.metricName ? `${breach.slaName} - ${breach.metricName}` : breach.slaName}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                        <span>Started: {new Date(breach.startTime).toLocaleString()}</span>
                        <span className="text-slate-300">|</span>
                        <span>Duration: {breach.duration}</span>
                        {breach.impactedAgents.length > 0 && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>Impacted: {breach.impactedAgents.join(', ')}</span>
                          </>
                        )}
                      </div>
                      {breach.rootCause && (
                        <div className="mt-2 text-xs text-slate-600">
                          <span className="font-medium">Root Cause:</span> {breach.rootCause}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedBreach(breach)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ REPORTS TAB ═══════════════════ */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Compliance reports for auditors and stakeholders</div>
            <div className="flex items-center gap-2">
              <LiveDataBadge live={reportsLive} source={reportsSource} />
              <button
                disabled
                title="Demo — export not wired"
                className="px-3 py-2 text-xs font-medium text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed"
              >
                Export CSV
              </button>
              <button
                disabled
                title="Demo — export not wired"
                className="px-3 py-2 text-xs font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
              >
                Export PDF
              </button>
            </div>
          </div>

          {/* Report Cards */}
          <div className="grid grid-cols-2 gap-4">
            {complianceReports.map(report => (
              <div key={report.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{report.period}</div>
                    <div className="text-[10px] text-slate-500">Generated {report.generatedDate || '—'}</div>
                  </div>
                  <div className={`text-xl font-bold ${
                    report.overallCompliance === null ? 'text-slate-400'
                      : report.overallCompliance >= 99.5 ? 'text-emerald-600'
                      : report.overallCompliance >= 99.0 ? 'text-amber-600'
                      : 'text-rose-600'
                  }`}>
                    {pct(report.overallCompliance)}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center p-2 rounded-lg bg-emerald-50">
                    <div className="text-lg font-bold text-emerald-700">{report.slasMet ?? '—'}</div>
                    <div className="text-[9px] text-emerald-600">SLAs Met</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-slate-50">
                    <div className="text-lg font-bold text-slate-700">{report.slasTotal}</div>
                    <div className="text-[9px] text-slate-500">Total SLAs</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-rose-50">
                    <div className="text-lg font-bold text-rose-700">{report.breachCount}</div>
                    <div className="text-[9px] text-rose-600">Breaches</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-blue-50">
                    <div className="text-lg font-bold text-blue-700">{report.avgResolutionTime}</div>
                    <div className="text-[9px] text-blue-600">Avg Resolution</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* By-Agent Breakdown */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-900 mb-4">Compliance by SLA (Current Period)</div>
            <div className="space-y-3">
              {slas.map(sla => (
                <div key={sla.id} className="flex items-center gap-4">
                  <div className="w-48 text-xs text-slate-700 truncate">{sla.name}</div>
                  <div className="flex-1">
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                      {sla.overallCompliance !== null && (
                        <div
                          className={`h-full rounded-full ${sla.overallCompliance >= 99.5 ? 'bg-emerald-500' : sla.overallCompliance >= 99.0 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(sla.overallCompliance, 100)}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <div className={`w-16 text-right text-xs font-medium ${sla.overallCompliance === null ? 'text-slate-400' : 'text-slate-700'}`}>
                    {pct(sla.overallCompliance)}
                  </div>
                  <StatusBadge status={sla.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ ERROR BUDGET TAB ═══════════════════ */}
      {activeTab === 'error-budget' && (
        <div className="space-y-4">
          {/* Provenance for the error-budget data. The API reports live=false while
              measured values are simulated, so this renders Demo rather than Live. */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Error budget consumption per SLA</div>
            <div className="flex items-center gap-2">
              <LiveDataBadge live={budgetsLive} source={budgetsSource} detail={budgetsNote} />
            </div>
          </div>
          {budgetsNote && (
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <Icon name="information-circle" className="w-3 h-3" />
              {budgetsNote}
            </div>
          )}

          {/* Budget Overview Cards */}
          <div className="grid grid-cols-2 gap-4">
            {errorBudgets.map(budget => {
              const isExhausted = budget.remainingPercent <= 0;
              const isCritical = budget.remainingPercent > 0 && budget.remainingPercent <= 20;
              const borderColor = isExhausted ? 'border-rose-300' : isCritical ? 'border-amber-300' : 'border-slate-200/60';
              const bgColor = isExhausted ? 'bg-rose-50/80' : isCritical ? 'bg-amber-50/80' : 'bg-white/80';

              return (
                <div key={budget.slaId} className={`${bgColor} backdrop-blur-sm rounded-xl border ${borderColor} shadow-sm p-4`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{budget.slaName}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          isExhausted ? 'bg-rose-100 text-rose-700' :
                          isCritical ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isExhausted ? 'EXHAUSTED' : isCritical ? 'CRITICAL' : 'HEALTHY'}
                        </span>
                        {budget.burnRateTrend && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            budget.burnRateTrend === 'increasing' ? 'bg-rose-50 text-rose-600' :
                            budget.burnRateTrend === 'decreasing' ? 'bg-emerald-50 text-emerald-600' :
                            'bg-slate-50 text-slate-600'
                          }`}>
                            Burn rate: {budget.burnRateTrend}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${isExhausted ? 'text-rose-600' : isCritical ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {budget.remainingPercent.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-500">remaining</div>
                    </div>
                  </div>

                  {/* Budget Bar */}
                  <div className="mb-3">
                    <div className="h-4 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isExhausted ? 'bg-rose-500' : isCritical ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.max(0, Math.min(budget.remainingPercent, 100))}%` }}
                      />
                    </div>
                    {/* Budget minutes are only derivable for availability SLAs. */}
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                      <span>Used: {minutes(budget.usedBudgetMinutes)}</span>
                      <span>Total: {minutes(budget.totalBudgetMinutes)}</span>
                    </div>
                  </div>

                  {/* Burn-down Chart - needs stored history, so hidden when absent */}
                  {budget.history.length > 0 ? (
                    <div className="h-24">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={budget.history}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                          <YAxis domain={[-50, 100]} tick={{ fontSize: 9 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Area
                            type="monotone"
                            dataKey="remaining"
                            stroke={isExhausted ? '#ef4444' : isCritical ? '#f59e0b' : '#10b981'}
                            fill={isExhausted ? '#fecaca' : isCritical ? '#fef3c7' : '#d1fae5'}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-24 flex items-center justify-center rounded-lg bg-slate-50 text-[10px] text-slate-400">
                      No burn-down history recorded
                    </div>
                  )}

                  {budget.projectedExhaustion && (
                    <div className="mt-2 text-[10px] text-rose-600 font-medium">
                      Projected exhaustion: {budget.projectedExhaustion}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Budget Alerts */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-900 mb-3">Error Budget Alerts</div>
            <div className="space-y-2">
              {errorBudgets.filter(b => b.remainingPercent <= 30).map(budget => (
                <div key={budget.slaId} className={`p-3 rounded-lg ${budget.remainingPercent <= 0 ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-center gap-2">
                    <Icon name="exclamation-triangle" className={`w-4 h-4 ${budget.remainingPercent <= 0 ? 'text-rose-600' : 'text-amber-600'}`} />
                    <span className="text-xs font-medium text-slate-900">{budget.slaName}</span>
                    <span className={`text-[10px] ml-auto ${budget.remainingPercent <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                      {budget.remainingPercent <= 0 ? 'Budget exhausted - SLA breached' : `${budget.remainingPercent.toFixed(1)}% remaining - take action`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ CREATE SLA MODAL ═══════════════════ */}
      {showCreateSla && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowCreateSla(false); setSelectedTemplate(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Create SLA</h3>
                <button onClick={() => { setShowCreateSla(false); setSelectedTemplate(null); }} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor={slaTemplateId} className="text-xs font-medium text-slate-700 block mb-2">Template</label>
                <select
                  id={slaTemplateId}
                  value={selectedTemplate || ''}
                  onChange={e => setSelectedTemplate(e.target.value || null)}
                  className="w-full text-sm p-2 border border-slate-200 rounded-lg"
                >
                  <option value="">Custom (No Template)</option>
                  {SLA_TEMPLATES.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={slaNameId} className="text-xs font-medium text-slate-700 block mb-2">Name</label>
                <input id={slaNameId} type="text" placeholder="SLA Name" className="w-full text-sm p-2 border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label htmlFor={slaDescId} className="text-xs font-medium text-slate-700 block mb-2">Description</label>
                <textarea id={slaDescId} placeholder="Describe this SLA..." className="w-full text-sm p-3 border border-slate-200 rounded-lg resize-none" rows={3} />
              </div>
              <div>
                <label htmlFor={slaWindowId} className="text-xs font-medium text-slate-700 block mb-2">Measurement Window</label>
                <select id={slaWindowId} className="w-full text-sm p-2 border border-slate-200 rounded-lg">
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {selectedTemplate && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-blue-900 mb-2">Template Defaults</div>
                  {(() => {
                    const tpl = SLA_TEMPLATES.find(t => t.id === selectedTemplate);
                    return tpl ? (
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-blue-700">
                        <div>Availability: {tpl.availability}%</div>
                        <div>Latency P99: {tpl.latencyP99}ms</div>
                        <div>Error Rate: {tpl.errorRate}%</div>
                        <div>Window: {tpl.window}</div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={handleCreateSLA}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Create SLA
              </button>
              <button onClick={() => { setShowCreateSla(false); setSelectedTemplate(null); }} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ BREACH DETAIL MODAL ═══════════════════ */}
      {selectedBreach && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedBreach(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <SeverityBadge severity={selectedBreach.severity} />
                    <span className={`text-[10px] font-medium px-2 py-1 rounded ${
                      selectedBreach.status === 'active' ? 'bg-rose-100 text-rose-700' :
                      selectedBreach.status === 'acknowledged' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {selectedBreach.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedBreach.slaName}</h3>
                  <div className="text-sm text-slate-600 mt-1">Metric: {selectedBreach.metricName ?? 'not recorded'}</div>
                </div>
                <button onClick={() => setSelectedBreach(null)} className="text-slate-400 hover:text-slate-600 text-xl" aria-label="Close">&times;</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Start Time</div>
                  <div className="text-sm text-slate-700">{new Date(selectedBreach.startTime).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Duration</div>
                  <div className="text-sm text-slate-700">{selectedBreach.duration}</div>
                </div>
                {selectedBreach.endTime && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">End Time</div>
                    <div className="text-sm text-slate-700">{new Date(selectedBreach.endTime).toLocaleString()}</div>
                  </div>
                )}
                {selectedBreach.incidentId && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">Linked Incident</div>
                    <div className="text-sm text-blue-600 font-medium">{selectedBreach.incidentId}</div>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Impacted Agents</div>
                <div className="flex flex-wrap gap-1">
                  {selectedBreach.impactedAgents.length === 0
                    ? <span className="text-xs text-slate-400">Not recorded</span>
                    : selectedBreach.impactedAgents.map(agent => (
                        <span key={agent} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">{agent}</span>
                      ))}
                </div>
              </div>
              {selectedBreach.rootCause && (
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Root Cause</div>
                  <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{selectedBreach.rootCause}</div>
                </div>
              )}
              {selectedBreach.resolutionNotes && (
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Resolution Notes</div>
                  <div className="text-sm text-slate-700 bg-emerald-50 p-3 rounded-lg">{selectedBreach.resolutionNotes}</div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              {selectedBreach.status === 'active' && (
                <button
                  onClick={() => handleAcknowledgeBreach(selectedBreach.id)}
                  className="px-4 py-2 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200"
                >
                  Acknowledge
                </button>
              )}
              {selectedBreach.status !== 'resolved' && (
                <button
                  onClick={() => handleResolveBreach(selectedBreach.id)}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  Mark Resolved
                </button>
              )}
              <button onClick={() => setSelectedBreach(null)} className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ TOAST ═══════════════════ */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' :
          toast.type === 'error' ? 'bg-rose-500 text-white' :
          'bg-slate-800 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
