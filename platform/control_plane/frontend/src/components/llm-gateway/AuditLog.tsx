import { useEffect, useState } from 'react';
import { llmGatewayApi, type GatewayInstance, type AuditResponse, type AuditRow } from '../../api/llmGateway';

export default function AuditLog({ instance }: { instance: GatewayInstance }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await llmGatewayApi.getAudit(instance.id, hours, 100);
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load audit data');
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [instance.id, hours]);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Request audit log</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {data?.source === 'cloudwatch' ? (
                <>CloudWatch log group <span className="font-mono">{data.log_group}</span></>
              ) : data?.source === 'litellm_api' ? (
                <>LiteLLM request database — per-request spend &amp; token logs</>
              ) : (
                <>Source: <span className="font-mono">{instance.audit_log_group || 'gateway API'}</span></>
              )}
            </p>
          </div>
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value, 10))}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
          >
            <option value={1}>1h</option>
            <option value={6}>6h</option>
            <option value={24}>24h</option>
            <option value={168}>7d</option>
          </select>
        </div>

        {/* Source badge */}
        {data?.source && data.source !== 'none' && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full mt-2 ${
            data.source === 'cloudwatch'
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {data.source === 'cloudwatch' ? 'CloudWatch Logs' : 'LiteLLM DB'}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-8 text-center">
          <div className="text-sm text-slate-500">Loading audit events…</div>
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl border border-red-200 p-5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-8 text-center">
          <p className="text-sm text-slate-500">No audit events in the last {hours}h.</p>
          <p className="text-xs text-slate-400 mt-1">
            Make a request through the Playground or via a virtual key to generate entries.
          </p>
        </div>
      ) : data.source === 'cloudwatch' ? (
        <CloudWatchRows rows={data.rows} />
      ) : (
        <StructuredRows rows={data.rows} />
      )}
    </div>
  );
}

/** Render CloudWatch raw log rows (legacy format) */
function CloudWatchRows({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5">
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate">
            <span className="text-slate-400 mr-2">{r['@timestamp']}</span>
            {r['@message']}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Render structured audit rows from LiteLLM API */
function StructuredRows({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="bg-white/95 rounded-2xl border border-slate-200/70 overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.6fr_0.7fr_0.5fr] gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        <span>Timestamp</span>
        <span>Model</span>
        <span>Key</span>
        <span>Status</span>
        <span>Tokens</span>
        <span className="text-right">Cost</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-100">
        {rows.map((row, i) => (
          <div key={row.request_id || i} className="grid grid-cols-[1fr_1.2fr_0.8fr_0.6fr_0.7fr_0.5fr] gap-2 px-4 py-2.5 text-xs hover:bg-slate-50/50 transition-colors">
            {/* Timestamp */}
            <span className="text-slate-500 font-mono text-[11px] truncate" title={row.timestamp}>
              {formatTimestamp(row.timestamp)}
            </span>

            {/* Model */}
            <span className="text-slate-700 font-mono text-[11px] truncate" title={row.model}>
              {row.model || '—'}
            </span>

            {/* Key */}
            <span className="text-slate-600 truncate" title={row.api_key}>
              {row.key_alias || (row.api_key ? row.api_key.slice(0, 12) + '…' : '—')}
            </span>

            {/* Status */}
            <span>
              <StatusBadge status={row.status} />
            </span>

            {/* Tokens */}
            <span className="text-slate-600 font-mono text-[11px]">
              {row.tokens.total > 0 ? (
                <span title={`In: ${row.tokens.prompt} / Out: ${row.tokens.completion}`}>
                  {row.tokens.total.toLocaleString()}
                </span>
              ) : '—'}
            </span>

            {/* Cost */}
            <span className="text-right text-slate-700 font-mono text-[11px]">
              {row.spend_usd > 0 ? `$${row.spend_usd.toFixed(4)}` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    unknown: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  const cls = styles[status] || styles.unknown;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {status}
    </span>
  );
}

function formatTimestamp(ts: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}
