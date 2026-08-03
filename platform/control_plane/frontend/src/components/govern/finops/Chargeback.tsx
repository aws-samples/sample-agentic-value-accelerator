/**
 * Chargeback - attribute agent/AI spend back to the business units that incur it.
 *
 * Grounded, in priority order:
 *  1. LIVE   - AWS Cost-by-Tag (CE GroupBy=TAG on a business-dimension tag). This
 *              is the REAL chargeback source: spend that carries the Plan taxonomy
 *              tag, split by value. Untagged spend is shown honestly as unallocated.
 *  2. COMPUTED - real per-use-case metered spend (Build→FinOps loop) rolled up by
 *              the use case's business domain when no tagged infra spend exists yet.
 *  3. MOCK   - illustrative CHARGEBACK_STATEMENT when neither is available.
 *
 * Chargeback vs showback: until finance signs off, this is a showback preview.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGovernanceAggregator } from '../useGovernanceAggregator';
import { useAwsUseCaseSpend } from '../useAwsCost';
import { governCostApi, type AwsCostTagBreakdown, type AwsTagKeysResponse } from '../../../api/client';
import { CHARGEBACK_STATEMENT } from '../mockData';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

type Source = 'live' | 'computed' | 'mock';

interface ChargebackLine { label: string; cost: number; }
interface ChargebackGroup { bu: string; total: number; items: ChargebackLine[]; }

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

const BAR_COLORS = ['#6366f1', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];

// Default tag key for chargeback attribution (can be changed via selector)
const DEFAULT_TAG_KEY = 'business-unit';

export default function Chargeback() {
  const { useCases } = useGovernanceAggregator();
  const { data: spend } = useAwsUseCaseSpend(30);

  // Available tag keys from Cost Explorer
  const [tagKeys, setTagKeys] = useState<AwsTagKeysResponse | null>(null);
  const [selectedTagKey, setSelectedTagKey] = useState(DEFAULT_TAG_KEY);

  useEffect(() => {
    let cancelled = false;
    governCostApi.tagKeys()
      .then(d => { if (!cancelled) setTagKeys(d); })
      .catch(() => { if (!cancelled) setTagKeys(null); });
    return () => { cancelled = true; };
  }, []);

  // Live Cost-by-Tag on the selected tag dimension (the real chargeback feed).
  const [tagData, setTagData] = useState<AwsCostTagBreakdown | null>(null);
  const [tagLoading, setTagLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTagLoading(true);
    governCostApi.byTag(selectedTagKey, 3)
      .then(d => { if (!cancelled) { setTagData(d); setTagLoading(false); } })
      .catch(() => { if (!cancelled) { setTagData(null); setTagLoading(false); } });
    return () => { cancelled = true; };
  }, [selectedTagKey]);

  const { groups, source, unallocated } = useMemo<{ groups: ChargebackGroup[]; source: Source; unallocated: number }>(() => {
    // 1) LIVE - tagged infra spend, split by business-unit tag value.
    if (tagData?.live && tagData.tagged_total > 0) {
      const g = tagData.by_value.map((v): ChargebackGroup => ({
        bu: v.value, total: v.amount, items: [{ label: 'Tagged AWS spend', cost: v.amount }],
      })).sort((a, b) => b.total - a.total);
      return { groups: g, source: 'live', unallocated: tagData.untagged_total };
    }

    // 2) COMPUTED - real per-use-case metered spend rolled up by business domain.
    if (spend?.live && spend.by_use_case.length > 0) {
      const domainOf = new Map(useCases.map(uc => [uc.use_case_id, uc.business_domain || 'Unattributed']));
      const byBu = new Map<string, ChargebackLine[]>();
      for (const u of spend.by_use_case) {
        const bu = domainOf.get(u.use_case_id) ?? 'Unattributed';
        if (!byBu.has(bu)) byBu.set(bu, []);
        byBu.get(bu)!.push({ label: u.use_case_id, cost: u.total_cost_usd });
      }
      const g = [...byBu.entries()].map(([bu, items]): ChargebackGroup => ({
        bu, items: items.sort((a, b) => b.cost - a.cost), total: items.reduce((s, it) => s + it.cost, 0),
      })).sort((a, b) => b.total - a.total);
      return { groups: g, source: 'computed', unallocated: 0 };
    }

    // 3) MOCK.
    const g = CHARGEBACK_STATEMENT.map((c): ChargebackGroup => ({
      bu: c.bu, total: c.total, items: c.items.map(it => ({ label: it.useCase, cost: it.cost })),
    }));
    return { groups: g, source: 'mock', unallocated: 0 };
  }, [tagData, spend, useCases]);

  const total = useMemo(() => groups.reduce((s, g) => s + g.total, 0), [groups]);
  const grandTotal = total + unallocated;

  // Available active tag keys for the selector
  const activeTagKeys = useMemo(() => {
    if (!tagKeys?.keys) return [];
    return tagKeys.keys.filter(k => k.active).map(k => k.key);
  }, [tagKeys]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Chargeback</h2>
            {source === 'live' && <LiveDataBadge />}
            {source === 'computed' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wide">Computed</span>}
            {source === 'mock' && <MockDataBadge integration="Activate a cost-allocation tag (or deploy metered agents) to populate real chargeback" />}
          </div>
          <p className="text-sm text-slate-500">
            {source === 'live'
              ? `Real AWS spend attributed by the ${selectedTagKey} cost-allocation tag, trailing 3 months.`
              : source === 'computed'
              ? 'Real metered agent spend rolled up by each use case business domain, trailing 30 days.'
              : 'Showback preview - illustrative attribution pending cost-allocation tags & finance sign-off.'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Tag key selector - only show when we have live tag keys or live data */}
          {(tagKeys?.discovered || source === 'live') && activeTagKeys.length > 0 && (
            <select
              value={selectedTagKey}
              onChange={e => setSelectedTagKey(e.target.value)}
              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={tagLoading}
            >
              {activeTagKeys.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
              {!activeTagKeys.includes(selectedTagKey) && (
                <option value={selectedTagKey}>{selectedTagKey}</option>
              )}
            </select>
          )}
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-900 tabular-nums">Total: {usd(total)}</div>
            {source === 'live' && <div className="text-[11px] text-slate-400">{Math.round((total / (grandTotal || 1)) * 100)}% of spend allocated</div>}
          </div>
        </div>
      </div>

      {/* Allocation share bar */}
      {grandTotal > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
            {groups.map((g, i) => (
              <div key={g.bu} style={{ width: `${(g.total / grandTotal) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} title={`${g.bu}: ${usd(g.total)}`} />
            ))}
            {unallocated > 0 && <div style={{ width: `${(unallocated / grandTotal) * 100}%` }} className="bg-slate-200" title={`Unallocated: ${usd(unallocated)}`} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px]">
            {groups.map((g, i) => (
              <span key={g.bu} className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2 h-2 rounded-full" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />{g.bu} <span className="text-slate-400 tabular-nums">{usd0(g.total)}</span>
              </span>
            ))}
            {unallocated > 0 && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-slate-300" />Unallocated <span className="text-slate-400 tabular-nums">{usd0(unallocated)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Per-BU statement */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="space-y-3">
          {groups.map((g, i) => (
            <div key={g.bu} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                  <div className="text-sm font-semibold text-slate-900">{g.bu}</div>
                </div>
                <div className="text-sm font-semibold text-slate-900 tabular-nums">{usd(g.total)}</div>
              </div>
              <div className="space-y-1">
                {g.items.map(it => (
                  <div key={it.label} className="flex items-center justify-between text-xs pl-2">
                    <span className="text-slate-500">· {it.label}</span>
                    <span className="text-slate-700 tabular-nums">{usd(it.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {unallocated > 0 && (
            <div className="border border-dashed border-slate-200 rounded-lg p-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-600">Unallocated (untagged spend)</div>
                <div className="text-sm font-semibold text-slate-600 tabular-nums">{usd(unallocated)}</div>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Spend not carrying the {selectedTagKey} tag yet. Tag resources at deploy time (Build) so it attributes here.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
