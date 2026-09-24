/**
 * DataSensitivity — Live Amazon Macie sensitive-data discovery card.
 *
 * Consumes governMacieApi.dataSensitivity() (GET /govern/macie/data-sensitivity):
 * PII/PCI/PHI-style classification counts by finding type + severity, plus the
 * affected S3 bucket count. Replaces the mock PII/sensitive-data classification
 * that previously lived only in the compact catalog overview.
 *
 * Honesty gate: the Live badge is driven by the payload's real `.live`. When
 * Macie is not enabled (live === false) we render the Demo badge, the payload's
 * `note`, and the setup guidance — never a green Live pill over non-live data.
 */

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { governMacieApi, type MacieDataSensitivity } from '../../../api/client';
import { LiveDataBadge } from '../DataSourceIndicator';
import { SetupGuidanceCard } from '../SetupGuidanceCard';
import { Icon, type IconName } from '../icons';
import { tooltipStyle } from './dataGovernanceData';

const CARD = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm';

// Severity colors + ordering for a stable, high-to-low presentation.
const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#b91c1c',
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#10b981',
};
const SEVERITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

// Category → badge style for the finding-type table.
const CATEGORY_STYLE: Record<string, { badge: string; label: string }> = {
  CLASSIFICATION: { badge: 'bg-violet-100 text-violet-700', label: 'Sensitive Data' },
  POLICY: { badge: 'bg-blue-100 text-blue-700', label: 'S3 Policy' },
};

function categoryStyle(category: string) {
  return CATEGORY_STYLE[category] ?? { badge: 'bg-slate-100 text-slate-600', label: category };
}

export default function DataSensitivity() {
  const [data, setData] = useState<MacieDataSensitivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governMacieApi.dataSensitivity()
      .then(resp => { if (!cancelled) { setData(resp); setError(null); } })
      .catch(err => { if (!cancelled) setError(err?.message || 'Failed to load Macie data-sensitivity'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const header = (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
          <Icon name="document-magnifying-glass" className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Sensitive Data Discovery</h3>
            {data && <LiveDataBadge live={data.live} source="Amazon Macie" />}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            PII / PCI / PHI classification and S3 policy findings from Amazon Macie.
          </p>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className={`${CARD} p-5`}>
        {header}
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`${CARD} p-5`}>
        {header}
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
          {error || 'No data-sensitivity data available.'}
        </div>
      </div>
    );
  }

  // Not live: honest empty state — show the payload note + setup guidance, no Live pill.
  if (!data.live) {
    return (
      <div className={`${CARD} p-5`}>
        {header}
        {data.note && (
          <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg mb-3">
            <Icon name="information-circle" className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-600">{data.note}</p>
          </div>
        )}
        {data.setup_guidance ? (
          <SetupGuidanceCard guidance={data.setup_guidance} />
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Icon name="magnifying-glass" className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">Amazon Macie is not returning sensitivity findings.</p>
            <a
              href="https://docs.aws.amazon.com/macie/latest/user/getting-started.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-700 mt-1"
            >
              Enable Amazon Macie →
            </a>
          </div>
        )}
      </div>
    );
  }

  // Live: build presentation slices.
  const classification = data.classification_breakdown.filter(c => c.count > 0);
  const severities = [...data.by_severity]
    .filter(s => s.count > 0)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
  const maxSeverity = Math.max(1, ...severities.map(s => s.count));
  const findingTypes = [...data.by_finding_type].sort((a, b) => b.count - a.count);

  const kpis: { label: string; value: number; icon: IconName; tone: string; sub: string }[] = [
    { label: 'Total Findings', value: data.total_findings, icon: 'magnifying-glass', tone: 'text-slate-900', sub: 'Macie findings' },
    { label: 'Sensitive Data', value: data.classification_findings, icon: 'finger-print', tone: data.classification_findings > 0 ? 'text-violet-600' : 'text-slate-400', sub: 'classification findings' },
    { label: 'S3 Policy', value: data.policy_findings, icon: 'shield-exclamation', tone: data.policy_findings > 0 ? 'text-amber-600' : 'text-slate-400', sub: 'policy findings' },
    { label: 'Affected Buckets', value: data.affected_bucket_count, icon: 'archive-box', tone: data.affected_bucket_count > 0 ? 'text-rose-600' : 'text-slate-400', sub: 'S3 buckets' },
  ];

  return (
    <div className={`${CARD} p-5`}>
      {header}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {kpis.map(k => (
          <div key={k.label} className="border border-slate-100 rounded-lg p-3">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Icon name={k.icon} className="w-3.5 h-3.5 text-slate-400" />{k.label}
            </div>
            <div className={`text-2xl font-semibold mt-1 ${k.tone}`}>{k.value}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Classification by category */}
        <div className="border border-slate-100 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-slate-700 mb-2">Classification by Category</h4>
          {classification.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={classification} dataKey="count" nameKey="category" cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2}>
                    {classification.map(c => <Cell key={c.category} fill={c.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {classification.map(c => (
                  <div key={c.category} className="flex items-center justify-between text-[11px]" title={c.examples.join(', ')}>
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                      {c.category}
                    </span>
                    <span className="font-semibold text-slate-800">{c.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[160px] text-center">
              <Icon name="shield-check" className="w-7 h-7 text-emerald-300 mb-1.5" />
              <p className="text-[11px] text-slate-500">No sensitive-data classifications detected.</p>
              {data.policy_findings > 0 && (
                <p className="text-[10px] text-slate-400 mt-0.5">Only S3 policy findings are present.</p>
              )}
            </div>
          )}
        </div>

        {/* Severity breakdown */}
        <div className="border border-slate-100 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-slate-700 mb-3">Findings by Severity</h4>
          {severities.length > 0 ? (
            <div className="space-y-2.5">
              {severities.map(s => {
                const color = SEVERITY_COLORS[s.severity] ?? '#94a3b8';
                const pct = Math.round((s.count / maxSeverity) * 100);
                return (
                  <div key={s.severity}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-medium text-slate-700">{s.severity}</span>
                      <span className="font-semibold text-slate-800">{s.count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">No severity data.</p>
          )}

          {data.top_sensitive_types.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Top Sensitive Types</div>
              <div className="flex flex-wrap gap-1.5">
                {data.top_sensitive_types.slice(0, 6).map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Findings by type */}
        <div className="border border-slate-100 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-slate-700 mb-2">Findings by Type</h4>
          {findingTypes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th scope="col" className="pb-2 font-medium">Finding Type</th>
                    <th scope="col" className="pb-2 font-medium">Category</th>
                    <th scope="col" className="pb-2 font-medium text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {findingTypes.map(ft => {
                    const style = categoryStyle(ft.category);
                    return (
                      <tr key={ft.finding_type}>
                        <td className="py-2 pr-2">
                          <span className="font-mono text-[10px] text-slate-700 break-all">{ft.finding_type}</span>
                        </td>
                        <td className="py-2 pr-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${style.badge}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className="py-2 text-right font-semibold text-slate-800">{ft.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">No findings by type.</p>
          )}
        </div>
      </div>

      {/* Transparency note */}
      {data.note && (
        <p className="text-[10px] text-slate-400 mt-3">
          {data.macie_status ? `Macie: ${data.macie_status}` : null}
          {data.macie_status && data.finding_publishing_frequency ? ' · ' : null}
          {data.finding_publishing_frequency ? `Publishing: ${data.finding_publishing_frequency}` : null}
          {(data.macie_status || data.finding_publishing_frequency) ? ' · ' : null}
          {data.note}
        </p>
      )}
    </div>
  );
}
