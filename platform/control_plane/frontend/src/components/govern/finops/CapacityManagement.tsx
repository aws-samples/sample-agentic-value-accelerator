/**
 * CapacityManagement — AWS Service Quotas monitoring for AI capacity planning.
 *
 * Prevents service limit surprises by tracking AI-relevant quotas (Bedrock,
 * SageMaker, Lambda, CloudWatch, IAM) and alerting when approaching limits.
 *
 * Grounded, in priority order:
 *  1. LIVE   - Real AWS Service Quotas with CloudWatch usage metrics.
 *  2. MOCK   - Illustrative data when Service Quotas API is unavailable.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { Icon, type IconName } from '../icons';
import {
  governCapacityApi,
  type QuotasResponse,
  type AlertsResponse,
  type UsageHistoryResponse,
  type ServiceQuota,
  type QuotaIncreaseRequest,
} from '../../../api/client';
import { tooltipStyle } from '../mockData';

type ServiceFilter = 'all' | 'bedrock' | 'sagemaker' | 'lambda' | 'cloudwatch' | 'iam';
type SortField = 'usage_pct' | 'service_name' | 'quota_name';
type SortDirection = 'asc' | 'desc';

const SERVICE_ICONS: Record<string, IconName> = {
  bedrock: 'sparkles',
  sagemaker: 'cpu-chip',
  lambda: 'bolt',
  cloudwatch: 'chart-bar',
  iam: 'users',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  ok: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  attention: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' },
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500' },
};

const SERVICE_LABELS: Record<string, string> = {
  bedrock: 'Bedrock',
  sagemaker: 'SageMaker',
  lambda: 'Lambda',
  cloudwatch: 'CloudWatch',
  iam: 'IAM',
};

function getStatusFromPct(pct: number): string {
  if (pct >= 90) return 'critical';
  if (pct >= 80) return 'warning';
  if (pct >= 70) return 'attention';
  return 'ok';
}

export default function CapacityManagement() {
  const [quotasData, setQuotasData] = useState<QuotasResponse | null>(null);
  const [, setAlertsData] = useState<AlertsResponse | null>(null);
  const [historyData, setHistoryData] = useState<UsageHistoryResponse | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Filter and sort state
  const [filter, setFilter] = useState<ServiceFilter>('all');
  const [sortField, setSortField] = useState<SortField>('usage_pct');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Request increase modal
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
  const [selectedQuota, setSelectedQuota] = useState<ServiceQuota | null>(null);
  const [increaseValue, setIncreaseValue] = useState('');
  const [increaseReason, setIncreaseReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ status: string; message: string } | null>(null);

  // Fetch quotas and alerts
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      governCapacityApi.quotas(),
      governCapacityApi.alerts(),
    ])
      .then(([quotas, alerts]) => {
        if (!cancelled) {
          setQuotasData(quotas);
          setAlertsData(alerts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuotasData(null);
          setAlertsData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Fetch history when service selected
  useEffect(() => {
    if (!selectedService) {
      setHistoryData(null);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);

    governCapacityApi.history(selectedService, 7)
      .then((data) => {
        if (!cancelled) setHistoryData(data);
      })
      .catch(() => {
        if (!cancelled) setHistoryData(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedService]);

  // Filtered and sorted quotas
  const filteredQuotas = useMemo(() => {
    if (!quotasData?.quotas) return [];

    let result = [...quotasData.quotas];

    // Apply filter
    if (filter !== 'all') {
      result = result.filter((q) => q.service_code === filter);
    }

    // Apply sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'usage_pct':
          comparison = a.usage_pct - b.usage_pct;
          break;
        case 'service_name':
          comparison = a.service_name.localeCompare(b.service_name);
          break;
        case 'quota_name':
          comparison = a.quota_name.localeCompare(b.quota_name);
          break;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [quotasData, filter, sortField, sortDirection]);

  // Top 5 at-risk quotas for sidebar
  const atRiskQuotas = useMemo(() => {
    if (!quotasData?.quotas) return [];
    return quotasData.quotas
      .filter((q) => q.usage_pct >= 70)
      .sort((a, b) => b.usage_pct - a.usage_pct)
      .slice(0, 5);
  }, [quotasData]);

  // Pending increase requests (illustrative count)
  const pendingRequests = 0;

  // KPIs
  const totalQuotas = quotasData?.total_monitored ?? 0;
  const atRiskCount = quotasData?.at_risk_count ?? 0;
  const criticalCount = quotasData?.critical_count ?? 0;

  const live = quotasData?.live ?? false;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleRequestIncrease = (quota: ServiceQuota) => {
    setSelectedQuota(quota);
    setIncreaseValue(String(Math.ceil(quota.value * 1.5)));
    setIncreaseReason('');
    setSubmitResult(null);
    setShowIncreaseModal(true);
  };

  const submitIncreaseRequest = async () => {
    if (!selectedQuota || !increaseValue || !increaseReason) return;

    setSubmitting(true);
    try {
      const request: QuotaIncreaseRequest = {
        service_code: selectedQuota.service_code,
        quota_code: selectedQuota.quota_code,
        desired_value: parseFloat(increaseValue),
        reason: increaseReason,
      };
      const result = await governCapacityApi.requestIncrease(request);
      setSubmitResult({ status: result.status, message: result.message });
    } catch (err) {
      setSubmitResult({ status: 'error', message: 'Failed to submit request. Check permissions.' });
    } finally {
      setSubmitting(false);
    }
  };

  const trendChartData = useMemo(() => {
    if (!historyData?.data_points) return [];
    return historyData.data_points.map((dp) => ({
      date: new Date(dp.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      usage: Math.round(dp.value),
      limit: Math.round(dp.limit),
    }));
  }, [historyData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Capacity Management</h2>
            {live ? (
              <LiveDataBadge />
            ) : (
              <MockDataBadge integration="Grant servicequotas:* and cloudwatch:GetMetricStatistics to see real quotas" />
            )}
          </div>
          <p className="text-sm text-slate-500">
            Monitor AI service quotas to prevent limit surprises. Track usage trends and request increases proactively.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Quotas Monitored"
          value={totalQuotas}
          variant="info"
          icon={<Icon name="clipboard-document-list" className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          label="At Risk (>80%)"
          value={atRiskCount}
          variant={atRiskCount > 0 ? 'warning' : 'success'}
          icon={<Icon name="exclamation-triangle" className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          label="Critical (>90%)"
          value={criticalCount}
          variant={criticalCount > 0 ? 'danger' : 'success'}
          icon={<Icon name="exclamation-circle" className="w-5 h-5 text-rose-500" />}
        />
        <StatCard
          label="Requests Pending"
          value={pendingRequests}
          variant="muted"
          icon={<Icon name="clock" className="w-5 h-5 text-slate-400" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main Content: Quota Table */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          {/* Filter Bar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[11px]">
              {(['all', 'bedrock', 'sagemaker', 'lambda', 'cloudwatch', 'iam'] as const).map((svc) => (
                <button
                  key={svc}
                  onClick={() => setFilter(svc)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                    filter === svc ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {svc !== 'all' && <Icon name={SERVICE_ICONS[svc]} className="w-3.5 h-3.5" />}
                  {svc === 'all' ? 'All Services' : SERVICE_LABELS[svc]}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-400">
              {filteredQuotas.length} quota{filteredQuotas.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              Loading quotas...
            </div>
          ) : filteredQuotas.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              No quotas found for the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                    <th
                      scope="col"
                      className="font-medium pb-2 cursor-pointer hover:text-slate-600"
                      onClick={() => handleSort('service_name')}
                    >
                      Service {sortField === 'service_name' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      scope="col"
                      className="font-medium pb-2 cursor-pointer hover:text-slate-600"
                      onClick={() => handleSort('quota_name')}
                    >
                      Quota {sortField === 'quota_name' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th scope="col" className="font-medium pb-2 text-right">
                      Limit
                    </th>
                    <th scope="col" className="font-medium pb-2 text-right">
                      Usage
                    </th>
                    <th
                      scope="col"
                      className="font-medium pb-2 cursor-pointer hover:text-slate-600 min-w-[140px]"
                      onClick={() => handleSort('usage_pct')}
                    >
                      % Used {sortField === 'usage_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th scope="col" className="font-medium pb-2 text-center">
                      Status
                    </th>
                    <th scope="col" className="font-medium pb-2 text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotas.map((q) => {
                    const status = getStatusFromPct(q.usage_pct);
                    const colors = STATUS_COLORS[status];
                    return (
                      <tr
                        key={`${q.service_code}-${q.quota_code}`}
                        className="border-b border-slate-50 hover:bg-slate-50/50"
                      >
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <Icon
                              name={SERVICE_ICONS[q.service_code] ?? 'server-stack'}
                              className="w-4 h-4 text-slate-400"
                            />
                            <span className="font-medium text-slate-700">{q.service_name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-2 text-slate-600 max-w-[200px] truncate" title={q.quota_name}>
                          {q.quota_name}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-700">
                          {q.value.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-700">
                          {q.usage.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${colors.bar}`}
                                style={{ width: `${Math.min(q.usage_pct, 100)}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-semibold tabular-nums w-10 text-right ${colors.text}`}>
                              {q.usage_pct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${colors.bg} ${colors.text}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {q.adjustable ? (
                            <button
                              onClick={() => handleRequestIncrease(q)}
                              className="text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              Request Increase
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">Fixed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar: At-Risk Panel */}
        <div className="space-y-4">
          {/* At-Risk Quotas */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-900">At-Risk Quotas</div>
              <span className="text-[10px] font-semibold text-rose-600">
                {atRiskQuotas.length} quota{atRiskQuotas.length !== 1 ? 's' : ''}
              </span>
            </div>
            {atRiskQuotas.length === 0 ? (
              <div className="text-center py-6 text-sm text-emerald-600">
                <Icon name="check-circle" className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                All quotas within safe limits
              </div>
            ) : (
              <div className="space-y-2">
                {atRiskQuotas.map((q) => {
                  const status = getStatusFromPct(q.usage_pct);
                  const colors = STATUS_COLORS[status];
                  return (
                    <div
                      key={`${q.service_code}-${q.quota_code}`}
                      className={`p-2.5 rounded-lg border ${
                        status === 'critical' ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-medium text-slate-700 truncate max-w-[180px]" title={q.quota_name}>
                          {q.quota_name}
                        </span>
                        <span className={`text-[11px] font-bold tabular-nums ${colors.text}`}>
                          {q.usage_pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">{q.service_name}</span>
                        {q.adjustable && (
                          <button
                            onClick={() => handleRequestIncrease(q)}
                            className="text-[9px] font-medium text-blue-600 hover:text-blue-700"
                          >
                            Increase
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Usage Trend (select a service) */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-900">Usage Trend</div>
            </div>
            <select
              value={selectedService ?? ''}
              onChange={(e) => setSelectedService(e.target.value || null)}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-3"
            >
              <option value="">Select a service...</option>
              <option value="bedrock">Amazon Bedrock</option>
              <option value="sagemaker">Amazon SageMaker</option>
              <option value="lambda">AWS Lambda</option>
              <option value="cloudwatch">Amazon CloudWatch</option>
              <option value="iam">AWS IAM</option>
            </select>
            {!selectedService ? (
              <div className="h-32 flex items-center justify-center text-[11px] text-slate-400">
                Select a service to view usage trend
              </div>
            ) : historyLoading ? (
              <div className="h-32 flex items-center justify-center text-[11px] text-slate-400">
                Loading trend...
              </div>
            ) : historyData && trendChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={trendChartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} width={40} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="usage"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#usageGrad)"
                      name="Usage"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-between mt-2 text-[10px]">
                  <span className="text-slate-500">
                    Trend: <span className={`font-semibold ${
                      historyData.trend === 'increasing' ? 'text-rose-600' :
                      historyData.trend === 'decreasing' ? 'text-emerald-600' : 'text-slate-600'
                    }`}>{historyData.trend}</span>
                  </span>
                  <span className="text-slate-400">
                    {historyData.current_usage.toLocaleString()} / {historyData.current_limit.toLocaleString()}
                  </span>
                </div>
              </>
            ) : (
              <div className="h-32 flex items-center justify-center text-[11px] text-slate-400">
                No trend data available
              </div>
            )}
          </div>

          {/* AI Services Focus */}
          <div className="bg-slate-50/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-2">AI Services Monitored</div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <Icon name="sparkles" className="w-4 h-4 text-indigo-500" />
                <span className="text-slate-600">Bedrock: model invocations, throughput</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="cpu-chip" className="w-4 h-4 text-emerald-500" />
                <span className="text-slate-600">SageMaker: endpoints, training jobs</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="bolt" className="w-4 h-4 text-amber-500" />
                <span className="text-slate-600">Lambda: concurrent executions</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="chart-bar" className="w-4 h-4 text-blue-500" />
                <span className="text-slate-600">CloudWatch: metrics, alarms</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="users" className="w-4 h-4 text-purple-500" />
                <span className="text-slate-600">IAM: roles per account</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Request Increase Modal */}
      {showIncreaseModal && selectedQuota && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Request Quota Increase</h3>
              <button
                onClick={() => setShowIncreaseModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <Icon name="x-mark" className="w-5 h-5" />
              </button>
            </div>

            {submitResult ? (
              <div className={`p-4 rounded-lg ${
                submitResult.status === 'submitted' || submitResult.status === 'approved'
                  ? 'bg-emerald-50 text-emerald-700'
                  : submitResult.status === 'pending'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
              }`}>
                <div className="font-medium capitalize mb-1">{submitResult.status}</div>
                <div className="text-sm">{submitResult.message}</div>
                <button
                  onClick={() => setShowIncreaseModal(false)}
                  className="mt-4 w-full py-2 bg-white border border-current rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Service</div>
                    <div className="text-sm font-medium text-slate-900">{selectedQuota.service_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Quota</div>
                    <div className="text-sm font-medium text-slate-900">{selectedQuota.quota_name}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Current Limit</div>
                      <div className="text-sm font-medium text-slate-900">{selectedQuota.value.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Current Usage</div>
                      <div className="text-sm font-medium text-slate-900">
                        {selectedQuota.usage.toLocaleString()} ({selectedQuota.usage_pct.toFixed(0)}%)
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Requested Limit</label>
                    <input
                      type="number"
                      value={increaseValue}
                      onChange={(e) => setIncreaseValue(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min={selectedQuota.value}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Justification</label>
                    <textarea
                      value={increaseReason}
                      onChange={(e) => setIncreaseReason(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      rows={3}
                      placeholder="Explain why you need this increase..."
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowIncreaseModal(false)}
                    className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitIncreaseRequest}
                    disabled={submitting || !increaseValue || !increaseReason}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
