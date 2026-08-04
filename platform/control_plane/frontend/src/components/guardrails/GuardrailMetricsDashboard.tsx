/**
 * GuardrailMetricsDashboard — Analytics dashboard for guardrail effectiveness
 */

import { useState, useMemo } from 'react';

interface MetricCard {
  label: string;
  value: string | number;
  change: number;
  changeLabel: string;
  color: string;
}

interface RuleMetric {
  ruleId: string;
  ruleName: string;
  ruleType: 'content_filter' | 'pii' | 'denied_topic' | 'word_filter' | 'grounding' | 'prompt_attack';
  triggerCount: number;
  blockCount: number;
  anonymizeCount: number;
  falsePositiveRate: number;
  avgLatencyMs: number;
}

interface TimeSeriesPoint {
  timestamp: string;
  blocks: number;
  anonymizations: number;
  allowed: number;
}

interface Props {
  guardrailId?: string;
  timeRange?: '1h' | '24h' | '7d' | '30d';
}

const MOCK_METRICS: MetricCard[] = [
  { label: 'Total Invocations', value: '124,892', change: 12.4, changeLabel: 'vs last period', color: 'blue' },
  { label: 'Blocks', value: '3,421', change: -8.2, changeLabel: 'vs last period', color: 'red' },
  { label: 'Anonymizations', value: '8,934', change: 5.1, changeLabel: 'vs last period', color: 'amber' },
  { label: 'Avg Latency', value: '42ms', change: -3.5, changeLabel: 'vs last period', color: 'emerald' },
];

const MOCK_RULE_METRICS: RuleMetric[] = [
  { ruleId: 'cf-hate', ruleName: 'HATE Content Filter', ruleType: 'content_filter', triggerCount: 892, blockCount: 890, anonymizeCount: 0, falsePositiveRate: 0.02, avgLatencyMs: 12 },
  { ruleId: 'cf-misconduct', ruleName: 'MISCONDUCT Filter', ruleType: 'content_filter', triggerCount: 1243, blockCount: 1198, anonymizeCount: 0, falsePositiveRate: 0.04, avgLatencyMs: 14 },
  { ruleId: 'pii-ssn', ruleName: 'US Social Security Number', ruleType: 'pii', triggerCount: 2341, blockCount: 2341, anonymizeCount: 0, falsePositiveRate: 0.01, avgLatencyMs: 8 },
  { ruleId: 'pii-cc', ruleName: 'Credit Card Number', ruleType: 'pii', triggerCount: 1876, blockCount: 0, anonymizeCount: 1876, falsePositiveRate: 0.02, avgLatencyMs: 6 },
  { ruleId: 'dt-insider', ruleName: 'Insider Trading', ruleType: 'denied_topic', triggerCount: 456, blockCount: 456, anonymizeCount: 0, falsePositiveRate: 0.12, avgLatencyMs: 45 },
  { ruleId: 'pa-inject', ruleName: 'Prompt Injection', ruleType: 'prompt_attack', triggerCount: 234, blockCount: 234, anonymizeCount: 0, falsePositiveRate: 0.08, avgLatencyMs: 18 },
  { ruleId: 'gr-check', ruleName: 'Grounding Check', ruleType: 'grounding', triggerCount: 1892, blockCount: 312, anonymizeCount: 0, falsePositiveRate: 0.15, avgLatencyMs: 85 },
];

const MOCK_TIME_SERIES: TimeSeriesPoint[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp: `${String(i).padStart(2, '0')}:00`,
  blocks: Math.floor(80 + Math.random() * 120),
  anonymizations: Math.floor(200 + Math.random() * 200),
  allowed: Math.floor(4000 + Math.random() * 1500),
}));

export default function GuardrailMetricsDashboard({ timeRange: initialTimeRange }: Props) {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>(initialTimeRange || '24h');
  const [selectedMetricType, setSelectedMetricType] = useState<string>('all');

  const filteredRuleMetrics = useMemo(() => {
    if (selectedMetricType === 'all') return MOCK_RULE_METRICS;
    return MOCK_RULE_METRICS.filter(r => r.ruleType === selectedMetricType);
  }, [selectedMetricType]);

  const sortedByTriggers = useMemo(() => {
    return [...filteredRuleMetrics].sort((a, b) => b.triggerCount - a.triggerCount);
  }, [filteredRuleMetrics]);

  const sortedByFalsePositive = useMemo(() => {
    return [...MOCK_RULE_METRICS].sort((a, b) => b.falsePositiveRate - a.falsePositiveRate).slice(0, 5);
  }, []);

  const maxTriggers = Math.max(...sortedByTriggers.map(r => r.triggerCount));

  const getRuleTypeIcon = (type: string) => {
    switch (type) {
      case 'content_filter': return '🛡️';
      case 'pii': return '🔒';
      case 'denied_topic': return '🚫';
      case 'word_filter': return '💬';
      case 'grounding': return '📌';
      case 'prompt_attack': return '⚠️';
      default: return '•';
    }
  };

  const getRuleTypeLabel = (type: string) => {
    switch (type) {
      case 'content_filter': return 'Content';
      case 'pii': return 'PII';
      case 'denied_topic': return 'Topic';
      case 'word_filter': return 'Word';
      case 'grounding': return 'Ground';
      case 'prompt_attack': return 'Attack';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Guardrail Metrics</h2>
          <p className="text-sm text-slate-500 mt-1">Real-time analytics and effectiveness tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {(['1h', '24h', '7d', '30d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-4 gap-4">
        {MOCK_METRICS.map((metric, i) => (
          <div key={i} className="p-4 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{metric.label}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                metric.change > 0
                  ? metric.label === 'Blocks' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  : metric.label === 'Blocks' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {metric.change > 0 ? '+' : ''}{metric.change}%
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{metric.value}</div>
            <div className="text-[10px] text-slate-400 mt-1">{metric.changeLabel}</div>
          </div>
        ))}
      </div>

      {/* Time Series Chart */}
      <div className="p-5 bg-white rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Invocations Over Time</h3>
        <div className="h-48 flex items-end gap-1">
          {MOCK_TIME_SERIES.map((point, i) => {
            const total = point.blocks + point.anonymizations + point.allowed;
            const blockPct = (point.blocks / total) * 100;
            const anonPct = (point.anonymizations / total) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center group">
                <div className="w-full h-40 flex flex-col justify-end rounded-t overflow-hidden">
                  <div
                    className="w-full bg-red-400 transition-all group-hover:bg-red-500"
                    style={{ height: `${blockPct}%` }}
                    title={`Blocks: ${point.blocks}`}
                  />
                  <div
                    className="w-full bg-amber-400 transition-all group-hover:bg-amber-500"
                    style={{ height: `${anonPct}%` }}
                    title={`Anonymizations: ${point.anonymizations}`}
                  />
                  <div
                    className="w-full bg-emerald-400 transition-all group-hover:bg-emerald-500"
                    style={{ height: `${100 - blockPct - anonPct}%` }}
                    title={`Allowed: ${point.allowed}`}
                  />
                </div>
                {i % 4 === 0 && (
                  <span className="text-[9px] text-slate-400 mt-1">{point.timestamp}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-6 mt-4">
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-3 h-3 rounded bg-emerald-400" /> Allowed
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-3 h-3 rounded bg-amber-400" /> Anonymized
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-3 h-3 rounded bg-red-400" /> Blocked
          </span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Top Triggered Rules */}
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Top Triggered Rules</h3>
            <select
              value={selectedMetricType}
              onChange={e => setSelectedMetricType(e.target.value)}
              className="text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="all">All Types</option>
              <option value="content_filter">Content Filters</option>
              <option value="pii">PII Detection</option>
              <option value="denied_topic">Denied Topics</option>
              <option value="prompt_attack">Prompt Attacks</option>
              <option value="grounding">Grounding</option>
            </select>
          </div>
          <div className="space-y-3">
            {sortedByTriggers.slice(0, 6).map(rule => (
              <div key={rule.ruleId} className="flex items-center gap-3">
                <span className="text-base w-6">{getRuleTypeIcon(rule.ruleType)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700 truncate">{rule.ruleName}</span>
                    <span className="text-xs text-slate-500">{rule.triggerCount.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(rule.triggerCount / maxTriggers) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* False Positive Leaders */}
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">High False Positive Rates</h3>
            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
              Needs Tuning
            </span>
          </div>
          <div className="space-y-3">
            {sortedByFalsePositive.map(rule => (
              <div key={rule.ruleId} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{getRuleTypeIcon(rule.ruleType)}</span>
                    <span className="text-xs font-medium text-slate-700">{rule.ruleName}</span>
                  </div>
                  <span className={`text-xs font-bold ${
                    rule.falsePositiveRate > 0.1 ? 'text-red-600' : rule.falsePositiveRate > 0.05 ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {(rule.falsePositiveRate * 100).toFixed(1)}% FP
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-slate-500">
                  <span>{rule.triggerCount.toLocaleString()} triggers</span>
                  <span>{rule.avgLatencyMs}ms avg</span>
                  <span className={`px-1.5 py-0.5 rounded ${
                    rule.falsePositiveRate > 0.1 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {getRuleTypeLabel(rule.ruleType)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Consider reducing filter strength or refining topic definitions for rules with &gt;10% false positive rate.
          </p>
        </div>
      </div>

      {/* Latency Impact */}
      <div className="p-5 bg-white rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Latency Impact by Rule Type</h3>
        <div className="grid grid-cols-6 gap-4">
          {[
            { type: 'content_filter', label: 'Content Filters', latency: 13, color: 'bg-blue-500' },
            { type: 'pii', label: 'PII Detection', latency: 7, color: 'bg-emerald-500' },
            { type: 'denied_topic', label: 'Denied Topics', latency: 45, color: 'bg-violet-500' },
            { type: 'word_filter', label: 'Word Filters', latency: 3, color: 'bg-slate-500' },
            { type: 'grounding', label: 'Grounding', latency: 85, color: 'bg-amber-500' },
            { type: 'prompt_attack', label: 'Prompt Attack', latency: 18, color: 'bg-red-500' },
          ].map(item => (
            <div key={item.type} className="text-center">
              <div className="relative h-24 flex items-end justify-center mb-2">
                <div
                  className={`w-10 ${item.color} rounded-t transition-all`}
                  style={{ height: `${(item.latency / 100) * 100}%` }}
                />
              </div>
              <div className="text-lg font-bold text-slate-900">{item.latency}ms</div>
              <div className="text-[10px] text-slate-500">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
