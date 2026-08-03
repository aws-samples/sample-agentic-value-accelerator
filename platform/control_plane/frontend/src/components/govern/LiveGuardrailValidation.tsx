/**
 * LiveGuardrailValidation — Guardrail test validation results from Secure module.
 *
 * Pulls from:
 * - guardrailValidationApi.getSummary() — Overall validation metrics
 * - guardrailValidationApi.listRuns() — Recent test runs
 *
 * Displays test suite coverage, pass rates, trends, and recent run details.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '@/lib/utils';
import { guardrailValidationApi } from '../../api/client';
import type { GuardrailValidationSummary, GuardrailTestRun, GuardrailTestCaseCategory } from '../../types';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import { Icon } from './icons';
import { usePollingKey } from './usePollingKey';
import LiveHeader from './LiveHeader';

// ─────────────────────────── Live Guardrail Validation ───────────────────────────

export function LiveGuardrailValidation() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GuardrailValidationSummary | null>(null);
  const [selectedRun, setSelectedRun] = useState<GuardrailTestRun | null>(null);
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    guardrailValidationApi.getSummary()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  // For now, API returns mock data, so we show MockDataBadge
  // When live API is connected, switch to checking data?.live
  const live = false;

  const categoryLabels: Record<GuardrailTestCaseCategory, { label: string; iconName: Parameters<typeof Icon>[0]['name']; color: string }> = {
    'pii': { label: 'PII Detection', iconName: 'user', color: 'bg-purple-100 text-purple-700' },
    'content-filter': { label: 'Content Filter', iconName: 'lock-closed', color: 'bg-rose-100 text-rose-700' },
    'denied-topics': { label: 'Denied Topics', iconName: 'no-symbol', color: 'bg-amber-100 text-amber-700' },
    'prompt-injection': { label: 'Injection Defense', iconName: 'syringe', color: 'bg-red-100 text-red-700' },
    'grounding': { label: 'Grounding', iconName: 'map-pin', color: 'bg-blue-100 text-blue-700' },
    'word-filter': { label: 'Word Filter', iconName: 'font', color: 'bg-slate-100 text-slate-700' },
    'regex': { label: 'Regex Patterns', iconName: 'magnifying-glass', color: 'bg-indigo-100 text-indigo-700' },
  };

  const runStatusConfig: Record<string, { color: string; iconName: Parameters<typeof Icon>[0]['name'] }> = {
    'success': { color: 'bg-emerald-100 text-emerald-700', iconName: 'check-circle' },
    'partial': { color: 'bg-amber-100 text-amber-700', iconName: 'exclamation-triangle' },
    'failed': { color: 'bg-rose-100 text-rose-700', iconName: 'x-circle' },
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 mb-6">
      <LiveHeader
        live={live}
        label={live ? 'Live · Guardrail Validation' : 'Guardrail Validation'}
        caption="test suite results from Secure module"
        autoRefresh
      />

      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading validation data...</div>
      ) : data ? (
        <div className="space-y-5">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatTile
              label="Test Suites"
              value={data.totalSuites}
              icon="clipboard-list"
              sub={`${data.enabledSuites} enabled`}
            />
            <StatTile
              label="Test Cases"
              value={data.totalTestCases}
              icon="beaker"
            />
            <StatTile
              label="Pass Rate (24h)"
              value={`${data.passRate24h.toFixed(1)}%`}
              icon="check-circle"
              color={data.passRate24h >= 95 ? 'text-emerald-600' : data.passRate24h >= 80 ? 'text-amber-600' : 'text-rose-600'}
            />
            <StatTile
              label="Failed (24h)"
              value={data.failedTests24h}
              icon="x-circle"
              color={data.failedTests24h > 0 ? 'text-amber-600' : 'text-slate-600'}
            />
            <StatTile
              label="Critical (24h)"
              value={data.criticalFailures24h}
              icon="exclamation-triangle"
              color={data.criticalFailures24h > 0 ? 'text-rose-600' : 'text-slate-600'}
            />
            <div className="col-span-2 bg-slate-50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Last Run</div>
                <div className="text-xs font-medium text-slate-800">
                  {data.lastRunTimestamp
                    ? formatRelativeTime(data.lastRunTimestamp)
                    : 'Never'
                  }
                </div>
              </div>
              <Link
                to="/secure/guardrails"
                className="text-[10px] text-blue-600 hover:text-blue-700 font-medium px-2 py-1 bg-blue-50 rounded"
              >
                Run Tests
              </Link>
            </div>
          </div>

          {/* Coverage by Category */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-700">Coverage by Category</span>
              {live ? <LiveDataBadge /> : <MockDataBadge />}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {(Object.entries(data.coverageByCategory) as [GuardrailTestCaseCategory, number][]).map(([cat, count]) => {
                const config = categoryLabels[cat];
                return (
                  <div key={cat} className={`rounded-lg p-2.5 ${config.color.split(' ')[0]}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon name={config.iconName} className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium truncate">{config.label}</span>
                    </div>
                    <div className={`text-lg font-bold ${config.color.split(' ')[1]}`}>{count}</div>
                    <div className="text-[9px] text-slate-500">test cases</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 7-Day Trend */}
          {data.trendData7d.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-2">7-Day Validation Trend</div>
              <div className="flex items-end gap-1 h-20">
                {data.trendData7d.map((d, i) => {
                  const total = d.passed + d.failed;
                  const maxTotal = Math.max(...data.trendData7d.map(t => t.passed + t.failed), 1);
                  const height = (total / maxTotal * 100);
                  const failedHeight = total > 0 ? (d.failed / total * height) : 0;
                  const passRate = total > 0 ? (d.passed / total * 100) : 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                      <div
                        className="w-full bg-emerald-200 rounded-t relative cursor-pointer"
                        style={{ height: `${height}%`, minHeight: '8px' }}
                      >
                        {failedHeight > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-rose-400 rounded-t"
                            style={{ height: `${failedHeight}%` }}
                          />
                        )}
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                          <div className="bg-slate-800 text-white text-[9px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                            <div className="font-medium">{new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                            <div>{d.passed} passed, {d.failed} failed</div>
                            <div className={passRate >= 95 ? 'text-emerald-300' : passRate >= 80 ? 'text-amber-300' : 'text-rose-300'}>
                              {passRate.toFixed(0)}% pass rate
                            </div>
                          </div>
                        </div>
                      </div>
                      {i % 2 === 0 && (
                        <div className="text-[8px] text-slate-400 mt-1">
                          {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[9px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-300" /> Passed</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-400" /> Failed</span>
              </div>
            </div>
          )}

          {/* Recent Runs */}
          {data.recentRuns.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-700">Recent Test Runs</span>
                <Link
                  to="/secure/guardrails"
                  className="text-[10px] text-blue-600 hover:text-blue-700"
                >
                  View All
                </Link>
              </div>
              <div className="space-y-2">
                {data.recentRuns.slice(0, 5).map(run => {
                  const statusCfg = runStatusConfig[run.status] || runStatusConfig['failed'];
                  const passRate = run.totalTests > 0 ? (run.passed / run.totalTests * 100) : 0;
                  return (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                      className="w-full text-left bg-slate-50 hover:bg-slate-100 rounded-lg px-3 py-2.5 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded flex items-center justify-center ${statusCfg.color}`}>
                            <Icon name={statusCfg.iconName} className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-800">{run.suiteName}</div>
                            <div className="text-[10px] text-slate-500">
                              {run.guardrailName} &middot; {formatRelativeTime(run.timestamp)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`text-sm font-semibold ${
                              passRate >= 95 ? 'text-emerald-600' : passRate >= 80 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {passRate.toFixed(0)}%
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {run.passed}/{run.totalTests} passed
                            </div>
                          </div>
                          <Icon
                            name={selectedRun?.id === run.id ? 'chevron-up' : 'chevron-down'}
                            className="w-4 h-4 text-slate-400"
                          />
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {selectedRun?.id === run.id && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            <div className="text-center">
                              <div className="text-lg font-bold text-slate-800">{run.totalTests}</div>
                              <div className="text-[9px] text-slate-500">Total</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-emerald-600">{run.passed}</div>
                              <div className="text-[9px] text-slate-500">Passed</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-rose-600">{run.failed}</div>
                              <div className="text-[9px] text-slate-500">Failed</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-slate-600">{run.duration}ms</div>
                              <div className="text-[9px] text-slate-500">Duration</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-500">
                              Triggered: {run.triggeredBy === 'scheduled' ? 'Scheduled' : 'Manual'}
                            </span>
                            <span className="text-slate-400 font-mono">{run.id}</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {data.totalSuites === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Icon name="beaker" className="w-10 h-10 mx-auto mb-3" />
              <div className="text-sm font-medium">No Test Suites Configured</div>
              <div className="text-xs mt-1">Create validation test suites to verify guardrail effectiveness</div>
              <Link
                to="/secure/guardrails"
                className="text-xs text-blue-600 hover:text-blue-700 mt-3 inline-block"
              >
                Configure Test Suites
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-400">
          <Icon name="exclamation-circle" className="w-10 h-10 mx-auto mb-3" />
          <div className="text-sm font-medium">Unable to load validation data</div>
          <div className="text-xs mt-1">Check connection to Secure module</div>
        </div>
      )}

      {/* Info Note */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-2">
          <Icon name="information-circle" className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] text-blue-700">
            <span className="font-semibold">Guardrail Validation</span> tests verify that your Bedrock guardrails
            correctly block or pass test inputs. Regular validation ensures guardrails remain effective as
            threats evolve and configurations change.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Utilities ───────────────────────────
// formatRelativeTime imported from @/lib/utils

function StatTile({
  label,
  value,
  icon,
  color,
  sub
}: {
  label: string;
  value: string | number;
  icon: Parameters<typeof Icon>[0]['name'];
  color?: string;
  sub?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <div className="flex justify-center mb-1">
        <Icon name={icon} className="w-4 h-4 text-slate-400" />
      </div>
      <div className={`text-lg font-bold ${color || 'text-slate-800'}`}>{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-[9px] text-slate-400">{sub}</div>}
    </div>
  );
}

export default LiveGuardrailValidation;
