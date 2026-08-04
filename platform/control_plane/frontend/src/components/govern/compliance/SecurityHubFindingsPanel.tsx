/**
 * SecurityHubFindingsPanel — AWS Security Hub AI findings integration for Compliance module
 *
 * Displays Security Hub findings aggregated for AI workloads (Bedrock, SageMaker):
 * - Finding counts by severity (Critical/High/Medium/Low)
 * - Compliance standard breakdown (CIS, NIST, AWS Foundational, etc.)
 * - Recent critical/high findings needing attention
 * - Remediation status tracking
 *
 * Part of the Govern module's compliance posture surface.
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import LiveHeader from '../LiveHeader';
import {
  useSecurityHubCompliance,
  type AISecurityFinding,
  type ComplianceStandard,
  type SeverityLevel,
} from './useSecurityHubCompliance';

// ─────────────────────────── Style Config ───────────────────────────

const SEVERITY_STYLES: Record<SeverityLevel, { bg: string; text: string; bar: string; badge: string }> = {
  CRITICAL: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    bar: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  HIGH: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    bar: 'bg-orange-500',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  MEDIUM: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    bar: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  LOW: {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    bar: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  INFORMATIONAL: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    bar: 'bg-blue-400',
    badge: 'bg-blue-100 text-blue-600 border-blue-200',
  },
};

const STANDARD_COLORS: Record<ComplianceStandard, string> = {
  CIS: '#3b82f6',
  NIST: '#8b5cf6',
  'AWS-Foundational': '#f59e0b',
  'PCI-DSS': '#ef4444',
  SOC2: '#10b981',
  HIPAA: '#ec4899',
  'AI-Governance': '#06b6d4',
  Unknown: '#64748b',
};

const AI_SERVICE_LABELS: Record<string, { label: string; color: string }> = {
  bedrock: { label: 'Bedrock', color: '#f97316' },
  sagemaker: { label: 'SageMaker', color: '#8b5cf6' },
  comprehend: { label: 'Comprehend', color: '#3b82f6' },
  rekognition: { label: 'Rekognition', color: '#10b981' },
  textract: { label: 'Textract', color: '#06b6d4' },
  other: { label: 'Other AI', color: '#64748b' },
};

// ─────────────────────────── Component ───────────────────────────

interface SecurityHubFindingsPanelProps {
  /** Show only AI-related findings */
  aiOnly?: boolean;
  /** Panel mode: full (default) or compact (embedded) */
  compact?: boolean;
  /** Maximum findings to fetch */
  maxFindings?: number;
  /** Poll interval in ms */
  pollIntervalMs?: number;
}

export default function SecurityHubFindingsPanel({
  aiOnly = false,
  compact = false,
  maxFindings = 200,
  pollIntervalMs = 60_000,
}: SecurityHubFindingsPanelProps) {
  const data = useSecurityHubCompliance(pollIntervalMs, { aiOnly, maxFindings });

  const [expandedStandard, setExpandedStandard] = useState<ComplianceStandard | null>(null);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel | 'all'>('all');

  // Filter findings based on severity selection
  const filteredFindings = useMemo(() => {
    if (filterSeverity === 'all') return data.recentCriticalHigh;
    return data.allFindings.filter(f => f.severity === filterSeverity).slice(0, 10);
  }, [data.allFindings, data.recentCriticalHigh, filterSeverity]);

  // Calculate posture score (higher = better)
  const postureScore = useMemo(() => {
    if (data.totalFindings === 0) return 100;
    const criticalWeight = data.criticalCount * 10;
    const highWeight = data.highCount * 5;
    const score = Math.max(0, 100 - criticalWeight - highWeight);
    return Math.round(score);
  }, [data.totalFindings, data.criticalCount, data.highCount]);

  const postureColor =
    postureScore >= 80 ? '#10b981' : postureScore >= 60 ? '#f59e0b' : postureScore >= 40 ? '#ea580c' : '#ef4444';

  const maxSeverityCount = Math.max(...data.bySeverity.map(s => s.count), 1);

  if (data.loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading Security Hub findings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Live Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <LiveHeader
            live={data.isLive}
            label={data.isLive ? 'Live - AWS Security Hub' : 'Security Hub Findings'}
            caption={
              data.isLive
                ? `${data.totalFindings} findings scanned (securityhub:GetFindings)`
                : data.error ?? 'Enable Security Hub to view compliance findings'
            }
            autoRefresh={data.isLive}
            right={
              data.isLive && data.lastUpdated ? (
                <span className="text-[10px] text-slate-400">
                  Updated {data.lastUpdated.toLocaleTimeString()}
                </span>
              ) : undefined
            }
          />
        </div>

        {/* Summary Stats */}
        {data.isLive ? (
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Posture Score */}
              <div className="rounded-lg p-3 border" style={{ backgroundColor: `${postureColor}10`, borderColor: `${postureColor}40` }}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: postureColor }}>
                  Posture Score
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold" style={{ color: postureColor }}>
                    {postureScore}
                  </div>
                  <div className="flex-1 h-2 bg-white/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${postureScore}%`, backgroundColor: postureColor }}
                    />
                  </div>
                </div>
              </div>

              {/* Total Findings */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Total Findings</div>
                <div className="text-2xl font-bold text-slate-800 tabular-nums">{data.totalFindings}</div>
                {data.aiRelatedFindings > 0 && (
                  <div className="text-[10px] text-cyan-600 font-medium">
                    {data.aiRelatedFindings} AI-related
                  </div>
                )}
              </div>

              {/* Critical */}
              <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
                <div className="text-[10px] text-rose-600 uppercase tracking-wide">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{data.criticalCount}</div>
                {data.criticalCount > 0 && (
                  <div className="text-[10px] text-rose-500">Immediate action needed</div>
                )}
              </div>

              {/* High */}
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                <div className="text-[10px] text-orange-600 uppercase tracking-wide">High</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{data.highCount}</div>
              </div>

              {/* Remediated */}
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <div className="text-[10px] text-emerald-600 uppercase tracking-wide">Remediated (30d)</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{data.remediatedLast30d}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <Icon name="shield-exclamation" className="w-12 h-12 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
            <div className="text-sm text-slate-500 mb-2">Security Hub findings unavailable</div>
            <div className="text-[11px] text-slate-400 max-w-md mx-auto">
              {data.error ?? 'Enable AWS Security Hub in your account to aggregate compliance findings from GuardDuty, Inspector, Macie, and other security services.'}
            </div>
            <a
              href="https://console.aws.amazon.com/securityhub"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Icon name="arrow-top-right-on-square" className="w-3.5 h-3.5" />
              Open Security Hub Console
            </a>
          </div>
        )}
      </div>

      {data.isLive && data.totalFindings > 0 && (
        <>
          {/* Severity Breakdown + Compliance Standards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Severity Distribution */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="chart-bar" className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">Findings by Severity</h3>
                <LiveDataBadge />
              </div>
              <div className="space-y-2">
                {data.bySeverity.map(s => {
                  const style = SEVERITY_STYLES[s.severity];
                  return (
                    <button
                      key={s.severity}
                      onClick={() => setFilterSeverity(filterSeverity === s.severity ? 'all' : s.severity)}
                      className={`w-full flex items-center gap-2 text-[11px] p-1.5 rounded-lg transition-all ${
                        filterSeverity === s.severity ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-20 font-medium px-1.5 py-0.5 rounded border ${style.badge}`}>
                        {s.severity}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${style.bar}`}
                          style={{ width: `${(s.count / maxSeverityCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right tabular-nums text-slate-700 font-semibold">{s.count}</span>
                      {s.aiRelatedCount > 0 && (
                        <span className="text-[9px] text-cyan-600 font-medium">({s.aiRelatedCount} AI)</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Compliance Standard Breakdown */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="clipboard-document-check" className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">By Compliance Standard</h3>
              </div>
              <div className="space-y-2">
                {data.byStandard.slice(0, 6).map(std => {
                  const color = STANDARD_COLORS[std.standard];
                  const isExpanded = expandedStandard === std.standard;
                  return (
                    <div key={std.standard} className="rounded-lg border border-slate-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedStandard(isExpanded ? null : std.standard)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="flex-1 text-xs font-medium text-slate-700 text-left truncate">
                          {std.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {std.critical > 0 && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                              {std.critical}C
                            </span>
                          )}
                          {std.high > 0 && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">
                              {std.high}H
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-800 tabular-nums w-8 text-right">
                            {std.total}
                          </span>
                          <Icon
                            name="chevron-down"
                            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-2 pb-2 border-t border-slate-100 bg-slate-50/50">
                          <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
                            {std.findings.slice(0, 5).map(f => (
                              <div
                                key={f.id}
                                className="flex items-start gap-2 text-[10px] p-1.5 bg-white rounded border border-slate-100"
                              >
                                <span className={`px-1 py-0.5 rounded font-semibold flex-shrink-0 ${SEVERITY_STYLES[f.severity as SeverityLevel]?.badge}`}>
                                  {f.severity.charAt(0)}
                                </span>
                                <span className="text-slate-600 leading-snug flex-1 truncate" title={f.title}>
                                  {f.title}
                                </span>
                                {f.isAIRelated && f.aiService && (
                                  <span
                                    className="text-[8px] px-1 py-0.5 rounded font-medium flex-shrink-0"
                                    style={{
                                      backgroundColor: `${AI_SERVICE_LABELS[f.aiService]?.color}20`,
                                      color: AI_SERVICE_LABELS[f.aiService]?.color,
                                    }}
                                  >
                                    {AI_SERVICE_LABELS[f.aiService]?.label}
                                  </span>
                                )}
                              </div>
                            ))}
                            {std.findings.length > 5 && (
                              <div className="text-[10px] text-slate-400 text-center py-1">
                                +{std.findings.length - 5} more findings
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent Critical/High Findings */}
          {!compact && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    {filterSeverity === 'all' ? 'Recent Critical/High Findings' : `${filterSeverity} Findings`}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                    {filteredFindings.length} shown
                  </span>
                </div>
                {filterSeverity !== 'all' && (
                  <button
                    onClick={() => setFilterSeverity('all')}
                    className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {filteredFindings.length > 0 ? (
                <div className="space-y-2">
                  {filteredFindings.map(finding => (
                    <FindingRow key={finding.id} finding={finding} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400">
                  <Icon name="check-circle" className="w-10 h-10 mx-auto mb-2 text-emerald-300" />
                  <div className="text-sm">No {filterSeverity === 'all' ? 'critical/high' : filterSeverity.toLowerCase()} findings</div>
                </div>
              )}
            </div>
          )}

          {/* Remediation Guidance Summary */}
          {!compact && data.criticalCount + data.highCount > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Icon name="light-bulb" className="w-5 h-5 text-amber-600" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-amber-900 mb-1">Remediation Guidance</h4>
                  <p className="text-xs text-amber-700 mb-3">
                    {data.criticalCount > 0 && `${data.criticalCount} critical findings require immediate attention. `}
                    {data.highCount > 0 && `${data.highCount} high-severity findings should be addressed within 30 days.`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="https://console.aws.amazon.com/securityhub/home#/findings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
                    >
                      <Icon name="arrow-top-right-on-square" className="w-3.5 h-3.5" />
                      View in Security Hub
                    </a>
                    <button className="px-3 py-1.5 bg-white text-amber-700 border border-amber-300 text-xs font-medium rounded-lg hover:bg-amber-50 transition-colors">
                      Export Remediation Plan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── Sub-Components ───────────────────────────

interface FindingRowProps {
  finding: AISecurityFinding;
}

function FindingRow({ finding }: FindingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[finding.severity as SeverityLevel] ?? SEVERITY_STYLES.MEDIUM;

  return (
    <div className={`rounded-lg border overflow-hidden ${style.bg} border-opacity-60`} style={{ borderColor: `${style.bar.replace('bg-', '')}` }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 p-3 text-left hover:bg-white/30 transition-colors"
      >
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 border ${style.badge}`}>
          {finding.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-800 leading-snug">{finding.title}</div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
            <span>{finding.product}</span>
            {finding.resource_type && (
              <>
                <span>-</span>
                <span>{finding.resource_type}</span>
              </>
            )}
            {finding.isAIRelated && finding.aiService && (
              <span
                className="px-1 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: `${AI_SERVICE_LABELS[finding.aiService]?.color}20`,
                  color: AI_SERVICE_LABELS[finding.aiService]?.color,
                }}
              >
                {AI_SERVICE_LABELS[finding.aiService]?.label}
              </span>
            )}
            {finding.ageInDays > 0 && (
              <span className={finding.ageInDays > 30 ? 'text-rose-500 font-medium' : ''}>
                {finding.ageInDays}d old
              </span>
            )}
          </div>
        </div>
        <Icon
          name="chevron-down"
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-200/50 bg-white/50">
          <div className="mt-3 space-y-3">
            {/* Remediation Guidance */}
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="light-bulb" className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[10px] font-semibold text-blue-800 uppercase">Remediation Guidance</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                  finding.remediation.effort === 'low' ? 'bg-emerald-100 text-emerald-700' :
                  finding.remediation.effort === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {finding.remediation.effort} effort
                </span>
                {finding.remediation.automatable && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                    Automatable
                  </span>
                )}
              </div>
              <p className="text-[11px] text-blue-700 leading-relaxed">{finding.remediation.guidance}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {finding.remediation.consoleLink && (
                <a
                  href={finding.remediation.consoleLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                >
                  <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                  View in Console
                </a>
              )}
              <button className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors">
                Mark Remediated
              </button>
              <button className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">
                Accept Risk
              </button>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-slate-200/50">
              <div>
                <span className="text-slate-400">Finding ID:</span>
                <span className="ml-1 text-slate-600 font-mono truncate" title={finding.id}>
                  {finding.id.slice(0, 40)}...
                </span>
              </div>
              <div>
                <span className="text-slate-400">Standard:</span>
                <span className="ml-1 text-slate-600">{finding.complianceStandard}</span>
              </div>
              {finding.compliance_status && (
                <div>
                  <span className="text-slate-400">Status:</span>
                  <span className={`ml-1 font-medium ${
                    finding.compliance_status === 'PASSED' ? 'text-emerald-600' :
                    finding.compliance_status === 'FAILED' ? 'text-rose-600' :
                    'text-slate-600'
                  }`}>
                    {finding.compliance_status}
                  </span>
                </div>
              )}
              {finding.updated_at && (
                <div>
                  <span className="text-slate-400">Last Updated:</span>
                  <span className="ml-1 text-slate-600">
                    {new Date(finding.updated_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Compact Export ───────────────────────────

/**
 * Compact version for embedding in other compliance views
 */
export function SecurityHubFindingsCompact({ aiOnly = true }: { aiOnly?: boolean }) {
  return <SecurityHubFindingsPanel aiOnly={aiOnly} compact maxFindings={100} />;
}
