/**
 * RealTimeMonitoring — Real-time risk monitoring dashboard for agentic AI systems
 *
 * Features:
 * - Five-tier alert framework (CRITICAL/HIGH/MEDIUM/LOW/INFO)
 * - Runtime signal feed with risk score calculation
 * - Cascade risk and blast radius visualization
 * - AWS integration indicators (CloudWatch, Security Hub, EventBridge)
 * - Circuit breaker status monitoring
 */

import { useState, useMemo } from 'react';
import {
  RUNTIME_SIGNALS, AGENTIC_RISKS, ALERT_THRESHOLDS, getAlertSeverity,
  getRuntimeSignalStats, type RuntimeSignal, type AlertSeverity,
} from './riskData';
import { Icon, type IconName } from '../icons';
import LiveSecurityPosture from './LiveSecurityPosture';
import SecurityPostureCard from './SecurityPostureCard';

const SEVERITY_ICONS: Record<AlertSeverity, IconName> = {
  CRITICAL: 'exclamation-circle',
  HIGH: 'exclamation-triangle',
  MEDIUM: 'bell-alert',
  LOW: 'information-circle',
  INFO: 'check-circle',
};

const SIGNAL_TYPE_ICONS: Record<RuntimeSignal['signalType'], IconName> = {
  anomaly: 'chart-bar',
  threshold: 'arrow-trending-up',
  pattern: 'magnifying-glass',
  circuit_breaker: 'bolt',
  trust_violation: 'shield-exclamation',
};

const STATUS_STYLES: Record<RuntimeSignal['status'], { bg: string; text: string }> = {
  active: { bg: 'bg-red-100', text: 'text-red-700' },
  acknowledged: { bg: 'bg-amber-100', text: 'text-amber-700' },
  resolved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  suppressed: { bg: 'bg-slate-100', text: 'text-slate-600' },
};

function RiskScoreGauge({ score, label }: { score: number; label: string }) {
  const severity = getAlertSeverity(score);
  const threshold = ALERT_THRESHOLDS[severity];
  const percentage = score;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-slate-200"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            stroke={threshold.color}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${percentage}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color: threshold.color }}>{score}</span>
        </div>
      </div>
      <span className="text-[10px] text-slate-500 mt-1">{label}</span>
    </div>
  );
}

function SignalCard({ signal, onAcknowledge }: { signal: RuntimeSignal; onAcknowledge: (id: string) => void }) {
  const severity = getAlertSeverity(signal.riskScore);
  const threshold = ALERT_THRESHOLDS[severity];
  const statusStyle = STATUS_STYLES[signal.status];

  return (
    <div className={`p-4 rounded-lg border ${threshold.bgColor} border-opacity-60`} style={{ borderColor: `${threshold.color}40` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white/60" style={{ color: threshold.color }}>
            <Icon name={SEVERITY_ICONS[severity]} className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-slate-900">{signal.agentName}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                {signal.status.toUpperCase()}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                <Icon name={SIGNAL_TYPE_ICONS[signal.signalType]} className="w-3 h-3 inline mr-1" />
                {signal.signalType.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-slate-700 mb-2">{signal.description}</p>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span>{new Date(signal.timestamp).toLocaleString()}</span>
              {signal.awsIntegration?.cloudwatchAlarmArn && (
                <span className="flex items-center gap-1">
                  <Icon name="cloud" className="w-3 h-3" /> CloudWatch
                </span>
              )}
              {signal.awsIntegration?.securityHubFindingId && (
                <span className="flex items-center gap-1">
                  <Icon name="shield-check" className="w-3 h-3" /> Security Hub
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-2xl font-bold" style={{ color: threshold.color }}>{signal.riskScore}</div>
          {signal.status === 'active' && (
            <button
              onClick={() => onAcknowledge(signal.id)}
              className="text-[10px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Acknowledge
            </button>
          )}
        </div>
      </div>

      {signal.chainContext && (
        <div className="mt-3 pt-3 border-t border-slate-200/50 grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-700">{signal.chainContext.cascadeScore}</div>
            <div className="text-[9px] text-slate-500">Cascade</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-700">{signal.chainContext.blastRadius}</div>
            <div className="text-[9px] text-slate-500">Blast Radius</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-700">{signal.chainContext.chainDepth}</div>
            <div className="text-[9px] text-slate-500">Chain Depth</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-700">{signal.chainContext.humanGates}</div>
            <div className="text-[9px] text-slate-500">Human Gates</div>
          </div>
        </div>
      )}

      {signal.metrics && (
        <div className="mt-3 pt-3 border-t border-slate-200/50">
          <div className="text-[10px] text-slate-500 mb-2">Risk Score Components</div>
          <div className="flex justify-between gap-2">
            <RiskScoreGauge score={signal.metrics.capability || 0} label="Capability" />
            <RiskScoreGauge score={signal.metrics.autonomy || 0} label="Autonomy" />
            <RiskScoreGauge score={signal.metrics.behavior || 0} label="Behavior" />
            <RiskScoreGauge score={signal.metrics.context || 0} label="Context" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function RealTimeMonitoring() {
  const [signals, setSignals] = useState<RuntimeSignal[]>(RUNTIME_SIGNALS);
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<RuntimeSignal['status'] | 'all'>('all');

  const stats = useMemo(() => getRuntimeSignalStats(), []);

  const filteredSignals = useMemo(() => {
    return signals.filter(s => {
      if (severityFilter !== 'all' && s.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [signals, severityFilter, statusFilter]);

  const handleAcknowledge = (id: string) => {
    setSignals(prev => prev.map(s => s.id === id ? { ...s, status: 'acknowledged' } : s));
  };

  return (
    <div className="space-y-6">

      {/* Live AWS Security Hub posture — real findings (illustrative runtime feed below) */}
      <LiveSecurityPosture />

      {/* Unified security posture — GuardDuty/Macie/Inspector/Access Analyzer, each own API */}
      <SecurityPostureCard />

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="bell-alert" className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Active Signals</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.active}</div>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="exclamation-circle" className="w-4 h-4 text-red-500" />
            <span className="text-xs text-red-600">Critical</span>
          </div>
          <div className="text-2xl font-bold text-red-700">{stats.bySeverity.CRITICAL}</div>
        </div>
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="exclamation-triangle" className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-orange-600">High</span>
          </div>
          <div className="text-2xl font-bold text-orange-700">{stats.bySeverity.HIGH}</div>
        </div>
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="bell-alert" className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-amber-600">Medium</span>
          </div>
          <div className="text-2xl font-bold text-amber-700">{stats.bySeverity.MEDIUM}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="chart-bar" className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Avg Risk Score</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.avgRiskScore}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="cloud" className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">AWS Integrated</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.withAwsIntegration}</div>
        </div>
      </div>

      {/* Alert Threshold Reference */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">Alert Threshold Framework</div>
        <div className="grid grid-cols-5 gap-2">
          {([
            { sev: 'CRITICAL' as const, iconClass: 'text-red-800', textClass: 'text-red-800' },
            { sev: 'HIGH' as const, iconClass: 'text-orange-700', textClass: 'text-orange-700' },
            { sev: 'MEDIUM' as const, iconClass: 'text-amber-700', textClass: 'text-amber-700' },
            { sev: 'LOW' as const, iconClass: 'text-emerald-700', textClass: 'text-emerald-700' },
            { sev: 'INFO' as const, iconClass: 'text-slate-600', textClass: 'text-slate-600' },
          ]).map(({ sev, iconClass, textClass }) => {
            const config = ALERT_THRESHOLDS[sev];
            return (
              <div key={sev} className={`p-3 rounded-lg ${config.bgColor}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={SEVERITY_ICONS[sev]} className={`w-4 h-4 ${iconClass}`} />
                  <span className={`text-xs font-semibold ${textClass}`}>{sev}</span>
                </div>
                <div className="text-[10px] text-slate-600 mb-1">Score: {config.min}-{config.max}</div>
                <div className="text-[9px] text-slate-500">{config.action}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Severity:</span>
          <select
            aria-label="Filter signals by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | 'all')}
            className="text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="all">All</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="INFO">Info</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status:</span>
          <select
            aria-label="Filter signals by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RuntimeSignal['status'] | 'all')}
            className="text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="suppressed">Suppressed</option>
          </select>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">{filteredSignals.length} signals</span>
      </div>

      {/* Signal Feed */}
      <div className="space-y-4">
        {filteredSignals.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Icon name="check-circle" className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
            <div className="text-sm font-medium">No signals match your filters</div>
            <div className="text-xs">Try adjusting your filter criteria</div>
          </div>
        ) : (
          filteredSignals.map(signal => (
            <SignalCard key={signal.id} signal={signal} onAcknowledge={handleAcknowledge} />
          ))
        )}
      </div>

      {/* Agentic Risk Summary */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">OWASP Agentic AI Threats — Coverage</div>
        <div className="grid grid-cols-2 gap-3">
          {AGENTIC_RISKS.slice(0, 6).map(risk => {
            const severity = getAlertSeverity(risk.residualScore * 4);
            const threshold = ALERT_THRESHOLDS[severity];
            return (
              <div key={risk.id} className="flex items-center justify-between p-2 rounded bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: threshold.color }} />
                  <span className="text-xs text-slate-700 truncate max-w-[200px]">{risk.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">{risk.category}</span>
                  {risk.chainRisk && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                      BR: {risk.chainRisk.blastRadius}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
