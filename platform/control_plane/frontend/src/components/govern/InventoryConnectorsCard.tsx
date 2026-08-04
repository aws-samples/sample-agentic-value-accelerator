/**
 * InventoryConnectorsCard — agent-inventory connector status for the registry.
 *
 * The governance/inventory expansion, step 1: show which providers feed real
 * agent inventory into the one registry. AWS is live-discovered (count comes from
 * the live registry hook); Azure/GCP/SaaS are honest scaffolds declaring the
 * listing API each connector needs. Mirrors the cost ProviderConnectorsCard.
 */
import { useMemo } from 'react';
import { INVENTORY_CONNECTORS } from './inventoryConnectors';
import { AGENT_PROVIDER_CONFIG, type AgentRegistryEntry } from './mockData';
import { LiveDataBadge } from './DataSourceIndicator';

interface Props {
  /** All agents currently in the registry (live + illustrative). */
  agents: AgentRegistryEntry[];
  /** True when the AWS side is genuinely live-discovered (real deployments/frontier). */
  awsLive: boolean;
}

export default function InventoryConnectorsCard({ agents, awsLive }: Props) {
  // Count agents per provider so each connector can show what it's contributing.
  const countByProvider = useMemo(() => {
    const m: Partial<Record<string, number>> = {};
    for (const a of agents) {
      const p = a.provider ?? 'aws';
      m[p] = (m[p] ?? 0) + 1;
    }
    return m;
  }, [agents]);

  const rows = INVENTORY_CONNECTORS.map(c => {
    // AWS is "connected" only when the registry is genuinely live-discovered.
    const connected = c.provider === 'aws' ? awsLive : false;
    return { ...c, connected, count: countByProvider[c.provider] ?? 0 };
  });

  const connectedCount = rows.filter(r => r.connected).length;
  const governedAgents = rows.filter(r => r.connected).reduce((s, r) => s + r.count, 0);
  const totalAgents = agents.length;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 px-4 py-3 shadow-sm mb-6">
      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-900">Inventory Connectors</h3>
        {awsLive && <LiveDataBadge />}
        <span className="text-[11px] text-slate-400">one registry, every provider · {governedAgents}/{totalAgents} agents live-discovered</span>
        <span className="ml-auto text-[11px] font-medium text-slate-600 tabular-nums">{connectedCount}/{rows.length} connected</span>
      </div>

      {/* Compact one-row-per-provider: dot + label + status. Detail is on hover. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
        {rows.map(r => {
          const cfg = AGENT_PROVIDER_CONFIG[r.provider];
          return (
            <div key={r.provider} className="flex items-center gap-2 py-0.5" title={`${r.source} — ${r.detail}`}>
              <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                {r.connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${r.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </span>
              <span className="text-[11px] font-medium text-slate-700 truncate">{cfg?.label ?? r.provider}</span>
              <span className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                r.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {r.connected ? `${r.count} agents` : 'Connect'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
