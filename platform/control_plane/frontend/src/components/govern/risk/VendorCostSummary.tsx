/**
 * VendorCostSummary - Displays FinOps cost data for a TPRM vendor
 *
 * Maps vendor names to AWS cost sources:
 * - Anthropic / Cohere -> Bedrock model costs (via Cost Explorer)
 * - AWS Bedrock -> Amazon Bedrock service costs
 * - OpenAI / GitHub Copilot / Cursor AI -> External SaaS (not tracked in AWS)
 *
 * Vendor-scoped spend comes from the REAL Cost Explorer `vendor` cost-allocation
 * tag (governCostApi.byTag('vendor')), not synthesized from a model total. MTD is
 * the current calendar month-to-date; Last Month and the prior month are derived
 * by differencing successive real CE windows (byTag sums whole months), so the
 * MoM trend is a real completed-month-over-completed-month change. When the vendor
 * carries no tagged spend the widget falls back to an honestly badged demo view.
 *
 * Designed to be compact for display in the vendor drawer.
 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { governCostApi, type AwsCostTagBreakdown } from '../../../api/client';

interface VendorCostSummaryProps {
  vendorName: string;
}

type CostSourceType = 'bedrock-claude' | 'bedrock-service' | 'bedrock-cohere' | 'external';

interface VendorCostMapping {
  sourceType: CostSourceType;
  label: string;
}

// Map vendor names to their cost sources. Non-external vendors are attributed via
// the `vendor` cost-allocation tag in Cost Explorer.
const vendorCostMappings: Record<string, VendorCostMapping> = {
  Anthropic: { sourceType: 'bedrock-claude', label: 'Cost Explorer · vendor tag (Claude models)' },
  'AWS Bedrock': { sourceType: 'bedrock-service', label: 'Cost Explorer · vendor tag (Amazon Bedrock)' },
  OpenAI: { sourceType: 'external', label: 'External SaaS' },
  'GitHub Copilot': { sourceType: 'external', label: 'External SaaS' },
  'Cursor AI': { sourceType: 'external', label: 'External SaaS' },
  Cohere: { sourceType: 'bedrock-cohere', label: 'Cost Explorer · vendor tag (Cohere models)' },
};

interface CostData {
  mtdSpend: number;
  lastMonthSpend: number;
  trendPct: number;
  projected: number | null;
  isLive: boolean;
}

// Illustrative demo figures for the drawer when no real vendor-tagged spend exists.
// Always rendered under a MockDataBadge — never presented as measured.
function getMockCostData(vendorName: string): CostData {
  const mockData: Record<string, CostData> = {
    Anthropic: { mtdSpend: 12847.32, lastMonthSpend: 11234.56, trendPct: 14.3, projected: 18500, isLive: false },
    'AWS Bedrock': { mtdSpend: 15234.78, lastMonthSpend: 14123.45, trendPct: 7.9, projected: 22000, isLive: false },
    Cohere: { mtdSpend: 1234.56, lastMonthSpend: 1456.78, trendPct: -15.2, projected: 1800, isLive: false },
  };

  return mockData[vendorName] || { mtdSpend: 0, lastMonthSpend: 0, trendPct: 0, projected: null, isLive: false };
}

function formatCurrency(amount: number): string {
  if (amount >= 10000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Normalize vendor names / tag values for tolerant matching (case + punctuation).
const normVendor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export default function VendorCostSummary({ vendorName }: VendorCostSummaryProps) {
  const mapping = vendorCostMappings[vendorName];
  const isExternal = !mapping || mapping.sourceType === 'external';

  const [loading, setLoading] = useState(!isExternal);
  const [windows, setWindows] = useState<{
    w1: AwsCostTagBreakdown | null;
    w2: AwsCostTagBreakdown | null;
    w3: AwsCostTagBreakdown | null;
  }>({ w1: null, w2: null, w3: null });

  useEffect(() => {
    if (isExternal) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Three real CE windows: MTD (1mo), MTD+prev (2mo), MTD+prev+prev-1 (3mo).
    // Differencing yields real per-month vendor spend without synthesizing.
    Promise.allSettled([
      governCostApi.byTag('vendor', 1),
      governCostApi.byTag('vendor', 2),
      governCostApi.byTag('vendor', 3),
    ])
      .then(([r1, r2, r3]) => {
        if (cancelled) return;
        setWindows({
          w1: r1.status === 'fulfilled' ? r1.value : null,
          w2: r2.status === 'fulfilled' ? r2.value : null,
          w3: r3.status === 'fulfilled' ? r3.value : null,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorName, isExternal]);

  const costData = useMemo<CostData>(() => {
    if (isExternal) {
      return { mtdSpend: 0, lastMonthSpend: 0, trendPct: 0, projected: null, isLive: false };
    }

    const target = normVendor(vendorName);
    const matchVendor = (d: AwsCostTagBreakdown | null) => {
      if (!d?.live || !target) return undefined;
      return d.by_value.find(v => {
        const a = normVendor(v.value);
        return a === target || (a && (a.includes(target) || target.includes(a)));
      });
    };

    const m1 = matchVendor(windows.w1); // MTD only
    if (windows.w1?.live && m1 && m1.amount > 0) {
      const mtd = m1.amount;
      const m2 = matchVendor(windows.w2); // MTD + previous full month
      const m3 = matchVendor(windows.w3); // MTD + previous + prior full month
      const lastMonth = m2 ? Math.max(0, m2.amount - mtd) : 0;
      const priorMonth = m2 && m3 ? Math.max(0, m3.amount - m2.amount) : 0;
      // Real completed-month-over-completed-month change (excludes the partial current month).
      const trendPct = priorMonth > 0 ? ((lastMonth - priorMonth) / priorMonth) * 100 : 0;

      // Run-rate projection for the current month from real MTD (clearly a projection,
      // not a measured figure — labeled as run-rate in the UI, not under the Live badge).
      const now = new Date();
      const dayOfMonth = now.getUTCDate();
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      const projected = dayOfMonth > 0 ? (mtd / dayOfMonth) * daysInMonth : mtd;

      return { mtdSpend: mtd, lastMonthSpend: lastMonth, trendPct, projected, isLive: true };
    }

    // No real vendor-tagged spend found — honest demo fallback.
    return getMockCostData(vendorName);
  }, [isExternal, windows, vendorName]);

  // External SaaS vendors
  if (isExternal) {
    return (
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="banknotes" className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium text-slate-700">FinOps Cost Data</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Icon name="arrow-top-right-on-square" className="w-3.5 h-3.5" />
          <span>External SaaS - not tracked in AWS Cost Explorer</span>
        </div>
        <div className="mt-2 text-[10px] text-slate-400">
          Track this vendor's costs in your external SaaS management tool or procurement system.
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="banknotes" className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium text-slate-700">FinOps Cost Data</span>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-slate-200 rounded w-1/2" />
          <div className="h-4 bg-slate-200 rounded w-3/4" />
        </div>
      </div>
    );
  }

  const trendUp = costData.trendPct > 0;
  const trendColor = trendUp ? 'text-rose-600' : 'text-emerald-600';
  const trendBg = trendUp ? 'bg-rose-50' : 'bg-emerald-50';

  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="banknotes" className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium text-slate-700">FinOps Cost Data</span>
        </div>
        <div className="flex items-center gap-1.5">
          {costData.isLive ? (
            <LiveDataBadge source="Cost Explorer" detail="Vendor-scoped spend from the 'vendor' cost-allocation tag" />
          ) : (
            <MockDataBadge integration="Tag AI spend with a 'vendor' cost-allocation tag in Cost Explorer" />
          )}
        </div>
      </div>

      {/* Source label */}
      <div className="text-[10px] text-slate-500 mb-3">
        Source: {mapping.label}
      </div>

      {/* Cost metrics */}
      <div className="grid grid-cols-2 gap-3">
        {/* MTD Spend */}
        <div className="bg-white rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">MTD Spend</div>
          <div className="text-lg font-semibold text-slate-900">
            {formatCurrency(costData.mtdSpend)}
          </div>
        </div>

        {/* Last Month */}
        <div className="bg-white rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">Last Month</div>
          <div className="text-lg font-semibold text-slate-700">
            {formatCurrency(costData.lastMonthSpend)}
          </div>
        </div>

        {/* Trend */}
        <div className="bg-white rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">MoM Trend <span className="text-slate-400">· completed months</span></div>
          <div className={`flex items-center gap-1 text-sm font-semibold ${trendColor}`}>
            <Icon
              name={trendUp ? 'arrow-trending-up' : 'arrow-trending-down'}
              className="w-4 h-4"
            />
            <span className={`px-1.5 py-0.5 rounded ${trendBg}`}>
              {trendUp ? '+' : ''}{costData.trendPct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Projected (run-rate) */}
        <div className="bg-white rounded-lg p-2.5 border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">Projected <span className="text-slate-400">· run-rate</span></div>
          <div className="text-sm font-semibold text-indigo-600">
            {costData.projected ? formatCurrency(costData.projected) : '-'}
          </div>
        </div>
      </div>

      {/* Link to FinOps */}
      <div className="mt-3 pt-3 border-t border-slate-200">
        <button className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 transition-colors">
          <Icon name="chart-bar" className="w-3.5 h-3.5" />
          View in FinOps Dashboard
        </button>
      </div>
    </div>
  );
}
