/**
 * SecurityPostureCard — unified AWS security posture, live from four services.
 *
 * GuardDuty (threats) + Macie (sensitive data) + Inspector (vulnerabilities) +
 * IAM Access Analyzer (external access), each pulled from its own API and
 * normalized to a severity rollup. Real AWS telemetry — distinct from the
 * internal risk register. Honest per-source live badges + graceful empty states.
 */
import { useEffect, useState } from 'react';
import {
  governSecurityApi,
  type AwsSecurityPostureResponse,
  type AwsVulnerabilitiesResponse,
} from '../../../api/client';
import { LiveDataBadge } from '../DataSourceIndicator';
import { RegionCoverageBadge } from '../RegionCoverageBadge';
import LiveHeader from '../LiveHeader';
import { Icon } from '../icons';
import { usePollingKey } from '../usePollingKey';
import { useDataSources } from '../DataSourceContext';

const sevStyle: Record<string, { bar: string; badge: string }> = {
  CRITICAL: { bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
  HIGH: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  MEDIUM: { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  LOW: { bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
};

// Inspector2 finding-type / resource-type → concise, human labels for the table.
const VULN_TYPE_LABEL: Record<string, string> = {
  PACKAGE_VULNERABILITY: 'Package',
  NETWORK_REACHABILITY: 'Network',
  CODE_VULNERABILITY: 'Code',
};
const VULN_RESOURCE_LABEL: Record<string, string> = {
  AWS_EC2_INSTANCE: 'EC2',
  AWS_ECR_CONTAINER_IMAGE: 'ECR image',
  AWS_LAMBDA_FUNCTION: 'Lambda',
};
const prettyVulnType = (t: string) => VULN_TYPE_LABEL[t] ?? t.replace(/^AWS_/, '').replace(/_/g, ' ');
const prettyVulnResource = (r?: string | null) =>
  r ? (VULN_RESOURCE_LABEL[r] ?? r.replace(/^AWS_/, '').replace(/_/g, ' ')) : null;

// Severity summary tiles (critical/high/medium/low), in canonical order.
const VULN_TILES: { key: 'critical' | 'high' | 'medium' | 'low'; label: string; text: string; ring: string }[] = [
  { key: 'critical', label: 'Critical', text: 'text-rose-700', ring: 'border-rose-200 bg-rose-50/60' },
  { key: 'high', label: 'High', text: 'text-orange-700', ring: 'border-orange-200 bg-orange-50/60' },
  { key: 'medium', label: 'Medium', text: 'text-amber-700', ring: 'border-amber-200 bg-amber-50/60' },
  { key: 'low', label: 'Low', text: 'text-slate-600', ring: 'border-slate-200 bg-slate-50/60' },
];

function FixBadge({ fix }: { fix?: string | null }) {
  if (fix === 'YES') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <Icon name="wrench" className="w-3 h-3" strokeWidth={2} />Yes
      </span>
    );
  }
  if (fix === 'PARTIAL') return <span className="text-amber-600">Partial</span>;
  if (fix === 'NO') return <span className="text-slate-400">No</span>;
  return <span className="text-slate-300">—</span>;
}

export default function SecurityPostureCard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsSecurityPostureResponse | null>(null);
  const [vulns, setVulns] = useState<AwsVulnerabilitiesResponse | null>(null);
  const [vulnsLoading, setVulnsLoading] = useState(true);
  const pollKey = usePollingKey(60_000);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll — keep the current rollup on screen while refreshing.
    governSecurityApi.posture()
      .then(d => {
        if (!cancelled) {
          setData(d);
          if (d?.live) {
            updateSource('aws-security-hub', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          updateSource('aws-security-hub', { status: 'error', error: 'API unavailable' });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey, updateSource]);

  // Inspector2 vulnerability detail — its own fetch so a slow/unavailable Inspector2
  // never blocks the posture rollup above.
  useEffect(() => {
    let cancelled = false;
    governSecurityApi.vulnerabilities(100)
      .then(d => { if (!cancelled) setVulns(d); })
      .catch(() => { if (!cancelled) setVulns(null); })
      .finally(() => { if (!cancelled) setVulnsLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;
  const sources = data?.sources ?? [];
  const vulnsLive = !!vulns?.live;

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · AWS Security Posture"
        caption="GuardDuty · Macie · Inspector · Access Analyzer — each from its own API"
        autoRefresh
        right={live ? (
          <span className="flex items-center gap-2 text-[11px]">
            {data!.critical > 0 && <span className="font-semibold text-rose-600">{data!.critical} critical</span>}
            <span className="font-semibold text-orange-600">{data!.high} high</span>
            <span className="text-slate-500 tabular-nums">{data!.total_findings} findings · {data!.sources_live}/{data!.sources_total} services</span>
            <RegionCoverageBadge regions={data!.regions} noun="Finding counts" />
          </span>
        ) : undefined}
      />

      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {sources.map(s => {
            const maxCount = Math.max(...s.by_severity.map(x => x.count), 1);
            return (
              <div key={s.source} className={`bg-white/80 backdrop-blur-sm rounded-xl border p-4 ${s.live ? 'border-slate-200/60' : 'border-slate-200/60 opacity-75'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-900">{s.label}</span>
                  {s.live && <LiveDataBadge />}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">{s.dimension}</div>
                {s.live ? (
                  s.total > 0 ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-2">
                        <span className="text-2xl font-bold text-slate-900 tabular-nums">{s.total}</span>
                        <span className="text-[10px] text-slate-500">findings</span>
                        {s.critical > 0 && <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">{s.critical} crit</span>}
                      </div>
                      <div className="space-y-1">
                        {s.by_severity.map(x => (
                          <div key={x.severity} className="flex items-center gap-1.5 text-[10px]">
                            <span className={`w-14 shrink-0 font-medium px-1 py-0.5 rounded text-center ${sevStyle[x.severity]?.badge ?? 'bg-slate-100 text-slate-600'}`}>{x.severity}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${sevStyle[x.severity]?.bar ?? 'bg-slate-400'}`} style={{ width: `${(x.count / maxCount) * 100}%` }} />
                            </div>
                            <span className="w-6 text-right tabular-nums text-slate-600">{x.count}</span>
                          </div>
                        ))}
                      </div>
                      {s.top_types.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 truncate" title={s.top_types.join(', ')}>
                          {s.top_types.join(' · ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-600"><Icon name="check" className="w-3 h-3" strokeWidth={2.5} /> No active findings</div>
                  )
                ) : (
                  <div className="text-[11px] text-slate-500">{s.note ?? 'Not enabled'}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Inspector2 vulnerability detail — real CVEs on EC2/ECR/Lambda ── */}
      <div className="mt-4 pt-4 border-t border-emerald-200/50">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3 px-1">
          <div className="flex items-center gap-2">
            <Icon name="shield-exclamation" className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-semibold text-slate-900">Inspector2 Vulnerabilities</span>
            {vulnsLive && <LiveDataBadge source="Inspector2" />}
          </div>
          {vulnsLive && (
            <span className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="tabular-nums">{vulns!.total} findings</span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">{vulns!.covered_resources} covered resources</span>
              <RegionCoverageBadge regions={vulns!.regions} noun="Vulnerability counts" />
            </span>
          )}
        </div>

        {vulnsLoading ? (
          <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
        ) : !vulnsLive ? (
          <div className="rounded-xl border border-slate-200/60 bg-white/60 p-4 text-[11px] text-slate-500">
            {vulns?.note ?? 'Inspector2 not enabled or not permitted in this account.'}
          </div>
        ) : (
          <>
            {/* Severity summary tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {VULN_TILES.map(t => (
                <div key={t.key} className={`rounded-lg border p-2.5 text-center ${t.ring}`}>
                  <div className={`text-xl font-bold tabular-nums ${t.text}`}>{vulns![t.key]}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.label}</div>
                </div>
              ))}
            </div>

            {vulns!.total === 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 px-1">
                <Icon name="check-circle" className="w-4 h-4" strokeWidth={2} /> No active vulnerability findings.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white/60">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wide text-[9px]">
                      <tr>
                        <th className="px-2.5 py-2 font-medium">Severity</th>
                        <th className="px-2.5 py-2 font-medium">Finding</th>
                        <th className="px-2.5 py-2 font-medium">CVE</th>
                        <th className="px-2.5 py-2 font-medium">Type</th>
                        <th className="px-2.5 py-2 font-medium">Resource</th>
                        <th className="px-2.5 py-2 font-medium">Fix</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {vulns!.findings.slice(0, 50).map((f, i) => (
                        <tr key={f.finding_arn ?? `${f.cve ?? 'vuln'}-${i}`} className="hover:bg-slate-50/60">
                          <td className="px-2.5 py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${sevStyle[f.severity]?.badge ?? 'bg-slate-100 text-slate-600'}`}>
                              {f.severity}
                            </span>
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 max-w-[240px] truncate" title={f.title}>{f.title}</td>
                          <td className="px-2.5 py-2 font-mono text-slate-600">{f.cve ?? '—'}</td>
                          <td className="px-2.5 py-2 text-slate-500">{prettyVulnType(f.type)}</td>
                          <td className="px-2.5 py-2 text-slate-500" title={f.resource_id ?? undefined}>{prettyVulnResource(f.resource_type) ?? '—'}</td>
                          <td className="px-2.5 py-2"><FixBadge fix={f.fix_available} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {vulns!.findings.length > 50 && (
                  <div className="mt-2 text-[10px] text-slate-400 px-1">
                    Showing 50 of {vulns!.findings.length} findings · {vulns!.total} total active.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
