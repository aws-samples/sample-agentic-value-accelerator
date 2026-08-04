/**
 * FailingConfigRules — which specific AWS Config rules are non-compliant.
 *
 * Drills the Config compliance % into the actual failing rules + a sample of the
 * resources failing each, live from AWS Config. Collapsed by default (it can be a
 * long list); expands on click. Honest live badge + graceful states.
 */
import { useEffect, useState } from 'react';
import { governPostureApi, type AwsConfigRuleDetail } from '../../api/client';
import { LiveDataBadge } from './DataSourceIndicator';

export default function FailingConfigRules() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AwsConfigRuleDetail | null>(null);

  // Lazy-load only when expanded (the detail pull is heavier than the count).
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    governPostureApi.configRuleDetail()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, data]);

  const rules = data?.failing_rules ?? [];

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-5 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <h3 className="text-sm font-semibold text-slate-900">Failing Config Rules</h3>
        {data?.live && <LiveDataBadge />}
        <span className="text-[11px] text-slate-400">which AWS Config rules are non-compliant</span>
        {data && <span className="ml-auto text-[11px] font-semibold text-rose-600 tabular-nums">{data.total_failing} failing</span>}
        {!data && !loading && <span className="ml-auto text-[11px] text-slate-400">show detail →</span>}
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-slate-100">
          {loading ? (
            <div className="h-16 flex items-center justify-center text-xs text-slate-400">Loading from AWS Config…</div>
          ) : data?.live && rules.length > 0 ? (
            <>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                      <th scope="col" className="font-medium pb-2">Rule</th>
                      <th scope="col" className="font-medium pb-2">Failing resources</th>
                      <th scope="col" className="font-medium pb-2 text-right">Managed rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.rule_name} className="border-t border-slate-100">
                        <td className="py-2 pr-2">
                          <div className="font-medium text-slate-800 truncate max-w-[280px]" title={r.rule_name}>{r.rule_name}</div>
                          {r.description && <div className="text-[10px] text-slate-500 truncate max-w-[280px]" title={r.description}>{r.description}</div>}
                        </td>
                        <td className="py-2 pr-2 text-slate-600">
                          <span className="font-semibold text-rose-600 tabular-nums">{r.failing_resource_count}</span>
                          {r.resource_types.length > 0 && <span className="text-[10px] text-slate-400 ml-1.5">{r.resource_types.join(', ')}</span>}
                        </td>
                        <td className="py-2 text-right text-[10px] text-slate-400 font-mono">{r.managed_rule ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.note && <div className="text-[11px] text-slate-400 mt-2">{data.note}</div>}
            </>
          ) : (
            <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3 mt-3">
              <span className="text-amber-500 mt-0.5">●</span>
              <div>
                <div className="font-medium text-slate-600">{data?.live ? 'No failing Config rules' : 'Config detail unavailable'}</div>
                <div className="text-[11px] mt-0.5">{data?.note ?? 'Every evaluated AWS Config rule is compliant, or the detail API is not permitted.'}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
