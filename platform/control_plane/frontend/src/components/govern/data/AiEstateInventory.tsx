/**
 * AiEstateInventory — Tagged AWS resources supporting the AI estate (LIVE)
 *
 * Source: Resource Groups Tagging API (`resourcegroupstaggingapi:GetResources`) via
 * `GET /api/v1/govern/governance/inventory`. Resources are flagged AI-related by the
 * backend from their service namespace or AI-oriented tags.
 *
 * History: this view previously lived as `InventoryTab` inside the unrouted
 * `govern/DataGovernance.tsx`, so it was unreachable in the app while the docs described
 * it as shipped. It is now a first-class route (`/govern/data/inventory`) and the only
 * consumer of `governInventoryApi`.
 */

import { useEffect, useState } from 'react';
import { governInventoryApi, type AwsResourceInventoryResponse } from '../../../api/client';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { Icon, type IconName } from '../icons';
import GovernPageLayout from '../GovernPageLayout';
import StatCard from '../StatCard';
import EmptyState from '../EmptyState';

/** Shorten an ARN to its resource tail for display — never render the full,
 * account-bearing ARN (the backend already masks the account id). */
function shortResource(arn?: string | null): string {
  if (!arn) return '—';
  const seg = arn.split(/[:/]/).filter(Boolean).pop();
  return seg || arn;
}

export default function AiEstateInventory() {
  const [data, setData] = useState<AwsResourceInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiOnly, setAiOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    governInventoryApi.resources(500)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Failed to load resource inventory'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const live = !!data?.live;
  const services = data ? Object.entries(data.by_service).sort((a, b) => b[1] - a[1]) : [];
  const maxCount = services.length ? services[0][1] : 0;
  const visible = data ? (aiOnly ? data.resources.filter(r => r.ai_related) : data.resources) : [];

  const summaryTiles: { label: string; value: number; icon: IconName }[] = data ? [
    { label: 'Total Resources', value: data.total, icon: 'server-stack' },
    { label: 'AI-Related', value: data.ai_related, icon: 'sparkles' },
    { label: 'Distinct Services', value: Object.keys(data.by_service).length, icon: 'squares-2x2' },
    { label: 'Distinct Tag Keys', value: data.tag_keys.length, icon: 'tag' },
  ] : [];

  return (
    <GovernPageLayout
      title="AI Estate Inventory"
      description="Every tagged AWS resource supporting the AI estate, discovered via Resource Groups Tagging. Resources are flagged AI-related from their service namespace or AI-oriented tags."
      badge={live
        ? <LiveDataBadge source="resourcegroupstaggingapi:GetResources" />
        : <MockDataBadge integration={data?.note || 'Resource Groups Tagging unavailable'} />}
      backPath="/govern/data"
      backLabel="Data Governance"
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-500">Loading resource inventory...</span>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-4">
          <p className="text-sm text-rose-700">Error: {error}</p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="text-xs px-2.5 py-1 rounded-lg font-medium bg-white text-rose-700 border border-rose-200 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : !data ? null : (
        <div className="space-y-6">
          {/* Honest banner when the tagging API could not answer */}
          {!live && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex items-start gap-2">
              <Icon name="tag" className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={2} />
              <span>{data.note || 'Tagged-resource inventory is unavailable for this account or region.'}</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summaryTiles.map(t => (
              <StatCard
                key={t.label}
                label={t.label}
                value={t.value}
                icon={<Icon name={t.icon} className="w-4 h-4 text-slate-400" strokeWidth={2} />}
              />
            ))}
          </div>

          {/* Live-and-empty is a real answer, not a failure */}
          {live && data.total === 0 && (
            <EmptyState
              icon="tag"
              title="No tagged resources found"
              description={data.note || 'No tagged resources found in this region — apply tags or enable resource tagging to populate the AI estate inventory.'}
            />
          )}

          {data.total > 0 && (
            <>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Icon name="squares-2x2" className="w-4 h-4 text-slate-500" strokeWidth={2} />
                  <h3 className="text-sm font-semibold text-slate-900">Resources by Service</h3>
                </div>
                <div className="space-y-2">
                  {services.map(([svc, count]) => (
                    <div key={svc} className="flex items-center gap-3">
                      <span className="w-44 text-xs font-mono text-slate-700 truncate" title={svc}>{svc}</span>
                      <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all"
                          style={{ width: `${maxCount ? (count / maxCount) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold text-slate-700">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon name="server-stack" className="w-4 h-4 text-slate-500" strokeWidth={2} />
                    <h3 className="text-sm font-semibold text-slate-900">Tagged Resources</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAiOnly(false)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        !aiOnly ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All ({data.total})
                    </button>
                    <button
                      onClick={() => setAiOnly(true)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                        aiOnly ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Icon name="sparkles" className="w-3 h-3" strokeWidth={2} />
                      AI-related ({data.ai_related})
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-600">
                        <th scope="col" className="px-4 py-3 font-medium">Service</th>
                        <th scope="col" className="px-4 py-3 font-medium">Resource Type</th>
                        <th scope="col" className="px-4 py-3 font-medium">Region</th>
                        <th scope="col" className="px-4 py-3 font-medium">Resource</th>
                        <th scope="col" className="px-4 py-3 font-medium">Tag Keys</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r, i) => {
                        const keys = Object.keys(r.tags);
                        return (
                          <tr key={`${r.arn || r.service}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <span className="text-[10px] px-2 py-1 rounded font-mono font-medium bg-blue-100 text-blue-700">{r.service}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{r.resource_type || '—'}</td>
                            <td className="px-4 py-3 text-slate-500">{r.region || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-slate-700 truncate max-w-[240px]" title={shortResource(r.arn)}>
                                  {shortResource(r.arn)}
                                </span>
                                {r.ai_related && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold flex-shrink-0">
                                    <Icon name="sparkles" className="w-2.5 h-2.5" strokeWidth={2} />
                                    AI
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {keys.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {keys.slice(0, 3).map(k => (
                                    <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{k}</span>
                                  ))}
                                  {keys.length > 3 && <span className="text-[9px] text-slate-400 self-center">+{keys.length - 3}</span>}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {visible.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">
                    No AI-related resources in the current inventory.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </GovernPageLayout>
  );
}
