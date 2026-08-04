/**
 * GuardrailAlerting — Configure alerts for guardrail events
 */

import { useState } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  threshold: number;
  timeWindow: string;
  channels: AlertChannel[];
  severity: 'info' | 'warning' | 'critical';
  lastTriggered?: string;
  triggerCount: number;
}

interface AlertCondition {
  metric: 'block_rate' | 'block_count' | 'false_positive_rate' | 'latency' | 'attack_pattern' | 'coverage_drop';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
}

interface AlertChannel {
  type: 'email' | 'slack' | 'sns' | 'pagerduty' | 'webhook';
  target: string;
}

interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  triggeredAt: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

const MOCK_RULES: AlertRule[] = [
  {
    id: 'rule-001',
    name: 'High Block Rate',
    enabled: true,
    condition: { metric: 'block_rate', operator: 'gt' },
    threshold: 10,
    timeWindow: '5m',
    channels: [{ type: 'slack', target: '#security-alerts' }, { type: 'email', target: 'security@company.com' }],
    severity: 'warning',
    lastTriggered: '2024-06-08T14:30:00Z',
    triggerCount: 12,
  },
  {
    id: 'rule-002',
    name: 'Prompt Injection Spike',
    enabled: true,
    condition: { metric: 'attack_pattern', operator: 'gt' },
    threshold: 5,
    timeWindow: '1m',
    channels: [{ type: 'pagerduty', target: 'security-oncall' }],
    severity: 'critical',
    lastTriggered: '2024-06-08T12:15:00Z',
    triggerCount: 3,
  },
  {
    id: 'rule-003',
    name: 'High Latency',
    enabled: true,
    condition: { metric: 'latency', operator: 'gt' },
    threshold: 200,
    timeWindow: '5m',
    channels: [{ type: 'slack', target: '#platform-alerts' }],
    severity: 'warning',
    triggerCount: 0,
  },
  {
    id: 'rule-004',
    name: 'Coverage Drop',
    enabled: false,
    condition: { metric: 'coverage_drop', operator: 'gt' },
    threshold: 5,
    timeWindow: '1h',
    channels: [{ type: 'email', target: 'compliance@company.com' }],
    severity: 'critical',
    triggerCount: 0,
  },
  {
    id: 'rule-005',
    name: 'High False Positive Rate',
    enabled: true,
    condition: { metric: 'false_positive_rate', operator: 'gt' },
    threshold: 15,
    timeWindow: '1h',
    channels: [{ type: 'slack', target: '#ml-ops' }],
    severity: 'info',
    lastTriggered: '2024-06-07T09:00:00Z',
    triggerCount: 5,
  },
];

const MOCK_ACTIVE_ALERTS: ActiveAlert[] = [
  {
    id: 'alert-001',
    ruleId: 'rule-001',
    ruleName: 'High Block Rate',
    severity: 'warning',
    message: 'Block rate exceeded 10% in the last 5 minutes (current: 14.2%)',
    triggeredAt: '2024-06-08T14:30:00Z',
    acknowledged: false,
  },
  {
    id: 'alert-002',
    ruleId: 'rule-002',
    ruleName: 'Prompt Injection Spike',
    severity: 'critical',
    message: '8 prompt injection attempts detected in the last minute from Customer Service Bot',
    triggeredAt: '2024-06-08T14:28:00Z',
    acknowledged: true,
  },
];

export default function GuardrailAlerting() {
  const [rules, setRules] = useState<AlertRule[]>(MOCK_RULES);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>(MOCK_ACTIVE_ALERTS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  const toggleRule = (ruleId: string) => {
    setRules(prev =>
      prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r)
    );
  };

  const acknowledgeAlert = (alertId: string) => {
    setActiveAlerts(prev =>
      prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a)
    );
  };

  const resolveAlert = (alertId: string) => {
    setActiveAlerts(prev =>
      prev.map(a => a.id === alertId ? { ...a, resolvedAt: new Date().toISOString() } : a)
    );
  };

  const getSeverityStyle = (severity: string): { bg: string; text: string; border: string; icon: IconName } => {
    switch (severity) {
      case 'critical': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', icon: 'bell-alert' };
      case 'warning': return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: 'exclamation-triangle' };
      case 'info': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', icon: 'light-bulb' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', icon: 'exclamation-triangle' };
    }
  };

  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'block_rate': return 'Block Rate (%)';
      case 'block_count': return 'Block Count';
      case 'false_positive_rate': return 'False Positive Rate (%)';
      case 'latency': return 'Latency (ms)';
      case 'attack_pattern': return 'Attack Detections';
      case 'coverage_drop': return 'Coverage Drop (%)';
      default: return metric;
    }
  };

  const getChannelIcon = (type: string): IconName => {
    switch (type) {
      case 'email': return 'envelope';
      case 'slack': return 'chat-bubble';
      case 'sns': return 'megaphone';
      case 'pagerduty': return 'bell-alert';
      case 'webhook': return 'link';
      default: return 'bell-alert';
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const unresolvedAlerts = activeAlerts.filter(a => !a.resolvedAt);
  const criticalCount = unresolvedAlerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Alerting</h2>
          <p className="text-sm text-slate-500 mt-1">Configure notifications for guardrail events</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Alert Rule
        </button>
      </div>

      {/* Active Alerts Banner */}
      {unresolvedAlerts.length > 0 && (
        <div className={`p-4 rounded-xl border-2 ${criticalCount > 0 ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'} animate-pulse`} />
              <h3 className={`text-sm font-semibold ${criticalCount > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                {unresolvedAlerts.length} Active Alert{unresolvedAlerts.length !== 1 ? 's' : ''}
                {criticalCount > 0 && ` (${criticalCount} Critical)`}
              </h3>
            </div>
          </div>
          <div className="space-y-2">
            {unresolvedAlerts.map(alert => {
              const style = getSeverityStyle(alert.severity);
              return (
                <div key={alert.id} className={`p-3 rounded-lg border ${style.border} ${style.bg}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <Icon name={style.icon} className="w-5 h-5 flex-shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{alert.ruleName}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${style.bg} ${style.text}`}>
                            {alert.severity}
                          </span>
                          {alert.acknowledged && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">ACK</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Triggered {formatTime(alert.triggeredAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="px-2 py-1 text-[10px] font-medium bg-white border border-slate-200 rounded hover:bg-slate-50"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="px-2 py-1 text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-200"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert Rules */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Alert Rules ({rules.length})</h3>
        {rules.map(rule => {
          const style = getSeverityStyle(rule.severity);
          return (
            <div
              key={rule.id}
              className={`p-4 rounded-xl border transition-all ${
                rule.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        rule.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{rule.name}</h4>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${style.bg} ${style.text}`}>
                        {rule.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Alert when <span className="font-medium">{getMetricLabel(rule.condition.metric)}</span>
                      {' '}{rule.condition.operator === 'gt' ? '>' : rule.condition.operator === 'lt' ? '<' : '='}{' '}
                      <span className="font-medium">{rule.threshold}</span> over <span className="font-medium">{rule.timeWindow}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        {rule.channels.map((ch, i) => (
                          <span key={i} title={`${ch.type}: ${ch.target}`}>
                            <Icon name={getChannelIcon(ch.type)} className="w-3.5 h-3.5 text-slate-500" />
                          </span>
                        ))}
                      </div>
                      {rule.lastTriggered && (
                        <span className="text-[10px] text-slate-400">
                          Last triggered: {formatTime(rule.lastTriggered)}
                        </span>
                      )}
                      {rule.triggerCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                          {rule.triggerCount} triggers
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Setup Templates */}
      <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Quick Setup Templates</h3>
        <div className="grid grid-cols-3 gap-3">
          {([
            { name: 'Security Pack', desc: 'Prompt injection, high blocks, attack patterns', icon: 'lock-closed' as IconName },
            { name: 'Compliance Pack', desc: 'Coverage drops, PII leaks, audit failures', icon: 'clipboard-list' as IconName },
            { name: 'Performance Pack', desc: 'Latency spikes, error rates, throughput', icon: 'bolt' as IconName },
          ] as const).map(template => (
            <button
              key={template.name}
              className="p-3 bg-white rounded-lg border border-slate-200 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <Icon name={template.icon} className="w-5 h-5 mb-2 text-slate-500" />
              <h4 className="text-sm font-medium text-slate-900">{template.name}</h4>
              <p className="text-[10px] text-slate-500 mt-1">{template.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Create/Edit Modal Placeholder */}
      {(showCreateModal || editingRule) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Configure conditions, thresholds, and notification channels for this alert.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowCreateModal(false); setEditingRule(null); }}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowCreateModal(false); setEditingRule(null); }}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                {editingRule ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
