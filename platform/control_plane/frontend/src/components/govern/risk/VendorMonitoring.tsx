/**
 * VendorMonitoring — Ongoing monitoring for third-party AI vendors
 *
 * Provides:
 * - Monitoring dashboard with KPIs (active monitors, alerts, attention needed)
 * - Alert feed with severity levels and acknowledge/dismiss actions
 * - Risk trend visualization with mini sparklines
 * - Monitoring configuration table per vendor
 * - Incident log with expandable details
 */

import { useState, useMemo, Fragment } from 'react';
import { Icon, type IconName } from '../icons';
import { rowButtonProps } from '../a11y';
import { getRiskScoreTextColor } from '../riskScoring';

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
type AlertType = 'credit-downgrade' | 'negative-news' | 'cyber-score-drop' | 'contract-expiring' | 'assessment-overdue';
type MonitoringStatus = 'active' | 'paused';
type IncidentStatus = 'open' | 'investigating' | 'resolved';
type FilterMode = 'all' | 'alerting' | 'paused';

interface MonitorAlert {
  id: string;
  vendorId: string;
  vendorName: string;
  severity: AlertSeverity;
  type: AlertType;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface VendorRiskTrend {
  vendorId: string;
  vendorName: string;
  currentScore: number;
  monthsAgo6Score: number;
  trend: number[]; // 6 data points for 6 months
}

interface MonitoringConfig {
  vendorId: string;
  vendorName: string;
  status: MonitoringStatus;
  categories: string[];
  alertFrequency: 'real-time' | 'daily' | 'weekly';
  lastCheck: string;
  nextCheck: string;
}

interface Incident {
  id: string;
  vendorId: string;
  vendorName: string;
  date: string;
  type: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  assignedTo: string;
  description: string;
  resolution?: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Seed demo timestamps relative to load time so the "last 24h" / "last 7 days"
// windows and the "next check" dates render plausibly regardless of today's
// date. A negative offset yields a future timestamp (used for next-check dates).
function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

// Mock alert data — timestamps seeded relative to now
const MOCK_ALERTS: MonitorAlert[] = [
  {
    id: 'ALT-001',
    vendorId: 'openai',
    vendorName: 'OpenAI',
    severity: 'high',
    type: 'cyber-score-drop',
    message: 'Cyber security score dropped from 85 to 72 in latest assessment',
    timestamp: isoAgo(3 * HOUR_MS),
    acknowledged: false,
  },
  {
    id: 'ALT-002',
    vendorId: 'cursor',
    vendorName: 'Cursor AI',
    severity: 'critical',
    type: 'assessment-overdue',
    message: 'DDQ assessment is 27 days overdue',
    timestamp: isoAgo(8 * HOUR_MS),
    acknowledged: false,
  },
  {
    id: 'ALT-003',
    vendorId: 'cohere',
    vendorName: 'Cohere',
    severity: 'medium',
    type: 'contract-expiring',
    message: 'Contract expires in 45 days (2026-09-20)',
    timestamp: isoAgo(2 * DAY_MS),
    acknowledged: true,
  },
  {
    id: 'ALT-004',
    vendorId: 'openai',
    vendorName: 'OpenAI',
    severity: 'high',
    type: 'negative-news',
    message: 'Negative press coverage detected regarding data handling practices',
    timestamp: isoAgo(20 * HOUR_MS),
    acknowledged: false,
  },
  {
    id: 'ALT-005',
    vendorId: 'anthropic',
    vendorName: 'Anthropic',
    severity: 'low',
    type: 'credit-downgrade',
    message: 'Credit rating outlook changed from Stable to Developing',
    timestamp: isoAgo(5 * DAY_MS),
    acknowledged: true,
  },
];

// Mock risk trend data
const MOCK_RISK_TRENDS: VendorRiskTrend[] = [
  { vendorId: 'anthropic', vendorName: 'Anthropic', currentScore: 32, monthsAgo6Score: 35, trend: [35, 34, 33, 32, 32, 32] },
  { vendorId: 'aws-bedrock', vendorName: 'AWS Bedrock', currentScore: 25, monthsAgo6Score: 28, trend: [28, 27, 26, 26, 25, 25] },
  { vendorId: 'openai', vendorName: 'OpenAI', currentScore: 48, monthsAgo6Score: 42, trend: [42, 43, 44, 45, 47, 48] },
  { vendorId: 'cursor', vendorName: 'Cursor AI', currentScore: 55, monthsAgo6Score: 50, trend: [50, 51, 52, 53, 54, 55] },
  { vendorId: 'github-copilot', vendorName: 'GitHub Copilot', currentScore: 38, monthsAgo6Score: 40, trend: [40, 39, 39, 38, 38, 38] },
  { vendorId: 'cohere', vendorName: 'Cohere', currentScore: 72, monthsAgo6Score: 65, trend: [65, 67, 68, 70, 71, 72] },
];

// Mock monitoring config data — check timestamps seeded relative to now
const MOCK_MONITORING_CONFIGS: MonitoringConfig[] = [
  { vendorId: 'anthropic', vendorName: 'Anthropic', status: 'active', categories: ['Financial', 'Cyber', 'Compliance', 'News'], alertFrequency: 'real-time', lastCheck: isoAgo(2 * HOUR_MS), nextCheck: isoAgo(-2 * HOUR_MS) },
  { vendorId: 'aws-bedrock', vendorName: 'AWS Bedrock', status: 'active', categories: ['Financial', 'Cyber', 'Compliance'], alertFrequency: 'real-time', lastCheck: isoAgo(1 * HOUR_MS), nextCheck: isoAgo(-3 * HOUR_MS) },
  { vendorId: 'openai', vendorName: 'OpenAI', status: 'active', categories: ['Financial', 'Cyber', 'Compliance', 'News', 'Regulatory'], alertFrequency: 'real-time', lastCheck: isoAgo(3 * HOUR_MS), nextCheck: isoAgo(-1 * HOUR_MS) },
  { vendorId: 'cursor', vendorName: 'Cursor AI', status: 'paused', categories: ['Financial', 'Cyber'], alertFrequency: 'daily', lastCheck: isoAgo(1 * DAY_MS), nextCheck: isoAgo(-1 * DAY_MS) },
  { vendorId: 'github-copilot', vendorName: 'GitHub Copilot', status: 'active', categories: ['Financial', 'Cyber', 'News'], alertFrequency: 'daily', lastCheck: isoAgo(6 * HOUR_MS), nextCheck: isoAgo(-18 * HOUR_MS) },
  { vendorId: 'cohere', vendorName: 'Cohere', status: 'paused', categories: ['Financial'], alertFrequency: 'weekly', lastCheck: isoAgo(3 * DAY_MS), nextCheck: isoAgo(-4 * DAY_MS) },
];

// Mock incident data
const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'INC-001',
    vendorId: 'openai',
    vendorName: 'OpenAI',
    date: '2026-08-03',
    type: 'Service Degradation',
    severity: 'high',
    status: 'investigating',
    assignedTo: 'Sarah Chen',
    description: 'API response times exceeded SLA thresholds for 2 hours. Impact: 15% of requests affected.',
    resolution: undefined,
  },
  {
    id: 'INC-002',
    vendorId: 'cursor',
    vendorName: 'Cursor AI',
    date: '2026-07-28',
    type: 'Compliance Gap',
    severity: 'medium',
    status: 'open',
    assignedTo: 'Mike Johnson',
    description: 'Vendor failed to provide updated SOC 2 Type II report within contractual deadline.',
  },
  {
    id: 'INC-003',
    vendorId: 'cohere',
    vendorName: 'Cohere',
    date: '2026-07-15',
    type: 'Security Alert',
    severity: 'critical',
    status: 'resolved',
    assignedTo: 'Alex Rivera',
    description: 'Potential data exposure identified in vendor system. Immediate assessment initiated.',
    resolution: 'False positive confirmed. Vendor provided evidence of proper data isolation.',
  },
  {
    id: 'INC-004',
    vendorId: 'anthropic',
    vendorName: 'Anthropic',
    date: '2026-07-01',
    type: 'Contract Issue',
    severity: 'low',
    status: 'resolved',
    assignedTo: 'Jordan Lee',
    description: 'Pricing discrepancy identified in monthly invoice.',
    resolution: 'Vendor issued credit for overbilling. New invoice validated.',
  },
  {
    id: 'INC-005',
    vendorId: 'openai',
    vendorName: 'OpenAI',
    date: '2026-06-20',
    type: 'Negative Press',
    severity: 'medium',
    status: 'resolved',
    assignedTo: 'Sarah Chen',
    description: 'Media coverage regarding employee departures raised continuity concerns.',
    resolution: 'Risk assessment completed. No material impact to service delivery expected.',
  },
];

const severityColors: Record<AlertSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
};

const alertTypeLabels: Record<AlertType, { label: string; icon: IconName }> = {
  'credit-downgrade': { label: 'Credit Downgrade', icon: 'credit-card' },
  'negative-news': { label: 'Negative News', icon: 'megaphone' },
  'cyber-score-drop': { label: 'Cyber Score Drop', icon: 'shield-exclamation' },
  'contract-expiring': { label: 'Contract Expiring', icon: 'calendar' },
  'assessment-overdue': { label: 'Assessment Overdue', icon: 'clock' },
};

const incidentStatusColors: Record<IncidentStatus, { bg: string; text: string }> = {
  open: { bg: 'bg-rose-50', text: 'text-rose-700' },
  investigating: { bg: 'bg-amber-50', text: 'text-amber-700' },
  resolved: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const hours = Math.floor(absMs / HOUR_MS);
  const days = Math.floor(absMs / DAY_MS);

  if (future) {
    if (hours < 1) return 'in <1h';
    if (hours < 24) return `in ${hours}h`;
    if (days < 7) return `in ${days}d`;
    return date.toLocaleDateString();
  }

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-0.5 h-6">
      {data.map((value, i) => {
        const height = ((value - min) / range) * 100;
        const heightPct = Math.max(10, Math.min(100, height));
        return (
          <div
            key={i}
            className={`w-2 rounded-sm ${color}`}
            style={{ height: `${heightPct}%` }}
            title={`Month ${i + 1}: ${value}`}
          />
        );
      })}
    </div>
  );
}

export default function VendorMonitoring() {
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [monitoringConfigs, setMonitoringConfigs] = useState(MOCK_MONITORING_CONFIGS);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // KPIs
  const activeMonitors = monitoringConfigs.filter(c => c.status === 'active').length;
  const alertsLast24h = alerts.filter(a => {
    const ts = new Date(a.timestamp);
    const now = new Date();
    return (now.getTime() - ts.getTime()) < 24 * 60 * 60 * 1000;
  }).length;
  const alertsLast7d = alerts.filter(a => {
    const ts = new Date(a.timestamp);
    return (Date.now() - ts.getTime()) < 7 * DAY_MS;
  }).length;
  const vendorsNeedingAttention = new Set(
    alerts.filter(a => !a.acknowledged && (a.severity === 'critical' || a.severity === 'high')).map(a => a.vendorId)
  ).size;

  // Filtered configs
  const filteredConfigs = useMemo(() => {
    if (filterMode === 'all') return monitoringConfigs;
    if (filterMode === 'alerting') {
      const alertingVendorIds = new Set(alerts.filter(a => !a.acknowledged).map(a => a.vendorId));
      return monitoringConfigs.filter(c => alertingVendorIds.has(c.vendorId));
    }
    return monitoringConfigs.filter(c => c.status === 'paused');
  }, [filterMode, monitoringConfigs, alerts]);

  const handleAcknowledge = (alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    setToast('Alert acknowledged');
    setTimeout(() => setToast(null), 2000);
  };

  const handleDismiss = (alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setToast('Alert dismissed');
    setTimeout(() => setToast(null), 2000);
  };

  const handleToggleMonitoring = (vendorId: string) => {
    setMonitoringConfigs(prev => prev.map(c =>
      c.vendorId === vendorId ? { ...c, status: c.status === 'active' ? 'paused' : 'active' } : c
    ));
    const config = monitoringConfigs.find(c => c.vendorId === vendorId);
    const newStatus = config?.status === 'active' ? 'paused' : 'resumed';
    setToast(`Monitoring ${newStatus} for ${config?.vendorName}`);
    setTimeout(() => setToast(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Monitoring Dashboard Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Monitoring Dashboard</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Real-time vendor risk surveillance</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Filter:</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['all', 'alerting', 'paused'] as FilterMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    filterMode === mode
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {mode === 'all' ? 'All' : mode === 'alerting' ? 'Alerting' : 'Paused'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Icon name="signal" className="w-4 h-4 text-indigo-600" />
              <span className="text-xs text-slate-500">Active Monitors</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{activeMonitors}</div>
            <div className="text-[10px] text-slate-500">of {monitoringConfigs.length} vendors</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Icon name="bell-alert" className="w-4 h-4 text-orange-600" />
              <span className="text-xs text-slate-500">Alerts (24h)</span>
            </div>
            <div className="text-2xl font-bold text-orange-600 mt-1">{alertsLast24h}</div>
            <div className="text-[10px] text-slate-500">{alertsLast7d} in last 7 days</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-600" />
              <span className="text-xs text-slate-500">Need Attention</span>
            </div>
            <div className={`text-2xl font-bold mt-1 ${vendorsNeedingAttention > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {vendorsNeedingAttention}
            </div>
            <div className="text-[10px] text-slate-500">vendors with critical/high alerts</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Icon name="check-circle" className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-slate-500">Acknowledged</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {alerts.filter(a => a.acknowledged).length}
            </div>
            <div className="text-[10px] text-slate-500">of {alerts.length} alerts</div>
          </div>
        </div>
      </div>

      {/* Two-column: Alert Feed & Risk Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alert Feed */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-800">Alert Feed</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Recent monitoring alerts</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No active alerts
              </div>
            ) : (
              alerts.map(alert => {
                const typeInfo = alertTypeLabels[alert.type];
                const colors = severityColors[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className={`px-4 py-3 ${alert.acknowledged ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                          <Icon name={typeInfo.icon} className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${colors.bg} ${colors.text}`}>
                              {alert.severity}
                            </span>
                            <span className="text-xs font-medium text-slate-900">{alert.vendorName}</span>
                            <span className="text-[10px] text-slate-400">{formatTimestamp(alert.timestamp)}</span>
                          </div>
                          <div className="text-xs text-slate-600 mt-1">{typeInfo.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{alert.message}</div>
                        </div>
                      </div>
                      {!alert.acknowledged && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Acknowledge"
                          >
                            <Icon name="check" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDismiss(alert.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Dismiss"
                          >
                            <Icon name="x-mark" className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {alert.acknowledged && (
                        <span className="text-[10px] text-emerald-600 font-medium shrink-0">Acknowledged</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Risk Trend Section */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-800">Risk Trends</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">6-month risk score progression</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {MOCK_RISK_TRENDS.map(trend => {
              const delta = trend.currentScore - trend.monthsAgo6Score;
              const improving = delta < 0;
              const color = trend.currentScore <= 30 ? 'bg-emerald-400'
                : trend.currentScore <= 50 ? 'bg-amber-400'
                : trend.currentScore <= 70 ? 'bg-orange-400'
                : 'bg-rose-400';

              return (
                <div key={trend.vendorId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-900">{trend.vendorName}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <MiniSparkline data={trend.trend} color={color} />
                        <div className="text-[10px] text-slate-400">6 months</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${getRiskScoreTextColor(trend.currentScore)}`}>
                          {trend.currentScore}
                        </span>
                        <div className={`flex items-center gap-0.5 text-[10px] font-medium ${improving ? 'text-emerald-600' : delta > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                          {improving ? (
                            <Icon name="arrow-trending-up" className="w-3 h-3 rotate-180" />
                          ) : delta > 0 ? (
                            <Icon name="arrow-trending-up" className="w-3 h-3" />
                          ) : (
                            <span>-</span>
                          )}
                          <span>{improving ? delta : delta > 0 ? `+${delta}` : '0'}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        vs {trend.monthsAgo6Score} (6mo ago)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monitoring Configuration Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Monitoring Configuration</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Per-vendor monitoring settings</p>
            </div>
            <button
              type="button"
              disabled
              title="Demo — adding vendors is not wired to a backend in this build"
              className="text-xs px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed flex items-center gap-1.5"
            >
              + Add Vendor
              <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-medium">Demo</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Vendor</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Categories</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Frequency</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Last Check</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Next Check</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredConfigs.map(config => (
                <tr
                  key={config.vendorId}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{config.vendorName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      config.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {config.status === 'active' ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {config.categories.slice(0, 3).map(cat => (
                        <span key={cat} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                          {cat}
                        </span>
                      ))}
                      {config.categories.length > 3 && (
                        <span className="text-[10px] text-slate-400">+{config.categories.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{config.alertFrequency}</td>
                  <td className="px-4 py-3 text-slate-600">{formatTimestamp(config.lastCheck)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatTimestamp(config.nextCheck)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleMonitoring(config.vendorId)}
                        className={`p-1.5 rounded transition-colors ${
                          config.status === 'active'
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={config.status === 'active' ? 'Pause monitoring' : 'Resume monitoring'}
                      >
                        <Icon name={config.status === 'active' ? 'pause-circle' : 'play-circle'} className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Demo — editing monitoring configuration is not available in this build"
                        className="p-1.5 text-slate-300 rounded cursor-not-allowed flex items-center gap-1"
                      >
                        <Icon name="cog" className="w-4 h-4" />
                        <span className="text-[9px] text-slate-400 font-medium">Demo</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Log */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Incident Log</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Historical vendor incidents and resolutions</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{MOCK_INCIDENTS.filter(i => i.status !== 'resolved').length} open</span>
              <span>/</span>
              <span>{MOCK_INCIDENTS.length} total</span>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600 w-6"></th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">ID</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Date</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Vendor</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Type</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Severity</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INCIDENTS.map(incident => {
                const isExpanded = expandedIncident === incident.id;
                const sevColors = severityColors[incident.severity];
                const statusColors = incidentStatusColors[incident.status];

                return (
                  <Fragment key={incident.id}>
                    <tr
                      {...rowButtonProps(() => setExpandedIncident(isExpanded ? null : incident.id), `Toggle incident ${incident.id} details`)}
                      className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50"
                    >
                      <td className="px-4 py-3">
                        <Icon
                          name={isExpanded ? 'chevron-down' : 'chevron-right'}
                          className="w-4 h-4 text-slate-400"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{incident.id}</td>
                      <td className="px-4 py-3 text-slate-600">{incident.date}</td>
                      <td className="px-4 py-3 text-slate-900">{incident.vendorName}</td>
                      <td className="px-4 py-3 text-slate-600">{incident.type}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${sevColors.bg} ${sevColors.text}`}>
                          {incident.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${statusColors.bg} ${statusColors.text}`}>
                          {incident.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{incident.assignedTo}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${incident.id}-details`} className="bg-slate-50/50">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="pl-10 space-y-3">
                            <div>
                              <div className="text-[10px] font-medium text-slate-500 uppercase mb-1">Description</div>
                              <div className="text-xs text-slate-700">{incident.description}</div>
                            </div>
                            {incident.resolution && (
                              <div>
                                <div className="text-[10px] font-medium text-slate-500 uppercase mb-1">Resolution</div>
                                <div className="text-xs text-slate-700">{incident.resolution}</div>
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-2">
                              {incident.status !== 'resolved' && (
                                <button
                                  type="button"
                                  disabled
                                  title="Demo — incident updates are not wired to a backend in this build"
                                  className="px-3 py-1.5 bg-slate-100 text-slate-400 text-xs rounded cursor-not-allowed flex items-center gap-1.5"
                                >
                                  Update Incident
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-medium">Demo</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled
                                title="Demo — full incident history is not available in this build"
                                className="px-3 py-1.5 border border-slate-200 text-slate-400 text-xs rounded cursor-not-allowed flex items-center gap-1.5"
                              >
                                View Full History
                                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-medium">Demo</span>
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
