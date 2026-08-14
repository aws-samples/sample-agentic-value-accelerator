import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Local axios instance that mirrors the request interceptor in src/api/client.ts.
// Raw fetch() bypasses auth headers and returns 401 against the RBAC-protected
// backend. See harness/api.ts for the same fix.
const httpClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});
httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const devUserEmail = localStorage.getItem('dev_user_email');
  if (devUserEmail) config.headers['x-user-email'] = devUserEmail;
  return config;
});

interface CatalogItem {
  id: string;
  name: string;
  type: string;
  status: string;
  framework: string;
  guardrail_attached: boolean;
  updated_at: string;
  detail_href: string;
  model_id: string;
  aws_region: string;
  // AWS Agent Registry cross-reference. See catalog.py::CatalogItem for the
  // enum shape. Filter tabs and the Registry column depend on these.
  registry_status?: 'in_registry' | 'pending' | 'rejected' | 'deprecated' | 'not_in_registry' | 'not_applicable';
  registry_record_id?: string;
}

// Registry pill styling — mirrored to backend enum. Kept as a lookup so the
// per-section columns share one rendering rule.
const REG_PILL: Record<string, { label: string; cls: string }> = {
  in_registry:     { label: '✓ Active',       cls: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  pending:         { label: '⧗ Pending',      cls: 'text-amber-700 bg-amber-50 border-amber-100' },
  rejected:        { label: '✕ Rejected',     cls: 'text-red-700 bg-red-50 border-red-100' },
  deprecated:      { label: '· Deprecated',   cls: 'text-slate-500 bg-slate-100 border-slate-200 line-through' },
  not_in_registry: { label: '– Not in Registry', cls: 'text-slate-500 bg-slate-100 border-slate-200' },
  not_applicable:  { label: 'n/a',            cls: 'text-slate-400 bg-slate-50 border-slate-100' },
};

function RegistryPill({ item }: { item: CatalogItem }) {
  const key = item.registry_status || 'not_applicable';
  const spec = REG_PILL[key] || REG_PILL.not_applicable;
  return (
    <span
      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider border ${spec.cls}`}
      title={item.registry_record_id ? `AVA registry record ${item.registry_record_id}` : undefined}
    >
      {spec.label}
    </span>
  );
}

type RegistryFilter = 'all' | 'in_registry' | 'not_in_registry';

// Section metadata drives header order + labels + which columns render.
// Anything not listed is skipped entirely (empty sections are hidden too).
type SectionKey =
  | 'app'
  | 'frontier-agent'
  | 'custom-agent'
  | 'harness'
  | 'memory'
  | 'mcp-server'
  | 'agent'
  | 'a2a-agent'
  | 'agentcore-runtime'
  | 'template';

interface SectionSpec {
  key: SectionKey;
  label: string;
  columns: Array<{ header: string; render: (i: CatalogItem) => React.ReactNode; mono?: boolean; width?: string }>;
}

// Display order (locked by user): Applications → Harnesses → Memory →
// Agents → Frontier Agents → MCP Servers → A2A Agents → Custom Agents →
// Templates → AgentCore Runtimes. Groups the primary "what I build" surface
// first (Apps → Harnesses → Memory), then registered agent peers
// (Agents → Frontier → MCP → A2A → Custom), then Templates and low-level
// runtimes at the bottom.
const SECTIONS: SectionSpec[] = [
  {
    key: 'app',
    label: 'Applications',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Framework', render: (i) => i.framework || '—' },
      { header: 'Model', render: (i) => i.model_id || '—', mono: true },
      { header: 'Guardrail', render: (i) => (i.guardrail_attached ? 'Yes' : '—') },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'harness',
    label: 'Harnesses',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Model', render: (i) => i.model_id || 'default', mono: true },
      { header: 'Region', render: (i) => i.aws_region, mono: true, width: 'w-24' },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'memory',
    label: 'Memory',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'ID', render: (i) => i.id, mono: true },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    // Agents (recordType=AGENT + tag Kind=agent) — runtime-bound / MCP-callable
    // peers. Distinct from A2A Agents, which are A2A-protocol peers with
    // AgentCards. Same record type in AWS Agent Registry; different semantics.
    key: 'agent',
    label: 'Agents',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Source', render: (i) => i.framework },
      { header: 'Registry', render: (i) => <RegistryPill item={i} />, width: 'w-40' },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'frontier-agent',
    label: 'AaaS · Frontier Agents',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Framework', render: (i) => i.framework || '—' },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'mcp-server',
    label: 'MCP Servers',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Source', render: (i) => i.framework },
      { header: 'Registry', render: (i) => <RegistryPill item={i} />, width: 'w-40' },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'a2a-agent',
    label: 'A2A Agents',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Source', render: (i) => i.framework },
      { header: 'Registry', render: (i) => <RegistryPill item={i} />, width: 'w-40' },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'custom-agent',
    label: 'AaaS · Custom Agents',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Framework', render: (i) => i.framework || '—' },
      { header: 'Model', render: (i) => i.model_id || '—', mono: true },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'template',
    label: 'Templates',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Template ID', render: (i) => i.id, mono: true },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
  {
    key: 'agentcore-runtime',
    label: 'AgentCore Runtimes',
    columns: [
      { header: 'Name', render: (i) => i.name },
      { header: 'Region', render: (i) => i.aws_region, mono: true, width: 'w-24' },
      { header: 'ID', render: (i) => i.id, mono: true },
      { header: 'Updated', render: (i) => formatWhen(i.updated_at), width: 'w-28' },
    ],
  },
];

const EXPANDED_KEY = 'catalog.sections.expanded';

export default function CatalogLanding() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  // Registry filter: 'all' shows every row, 'in_registry' only registered,
  // 'not_in_registry' catches gaps (published-eligible resource with no
  // registry record + rejected/deprecated). Kinds whose registry_status is
  // 'not_applicable' (harness / memory / runtime / etc.) are only surfaced
  // when the filter is 'all', because they aren't part of the governance
  // story the filter helps operators inspect.
  const [regFilter, setRegFilter] = useState<RegistryFilter>('all');
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) return { app: true, 'frontier-agent': true, 'custom-agent': true, harness: true, memory: true, 'mcp-server': true, agent: true, 'a2a-agent': true, 'agentcore-runtime': true, template: true, ...JSON.parse(raw) };
    } catch { /* noop */ }
    return { app: true, 'frontier-agent': true, 'custom-agent': true, harness: true, memory: true, 'mcp-server': true, agent: true, 'a2a-agent': true, 'agentcore-runtime': true, template: true };
  });

  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded)); } catch { /* noop */ }
  }, [expanded]);

  useEffect(() => {
    httpClient
      .get<CatalogItem[]>('/api/v1/catalog')
      .then((r) => setItems(r.data || []))
      .catch((e) => {
        const detail = (e?.response?.data as { detail?: string })?.detail || e?.message || String(e);
        setErr(`${e?.response?.status ?? ''}: ${detail}`);
      })
      .finally(() => setLoading(false));
  }, []);

  // Search across everything (name, id, model, framework), then bucket by type.
  const bucketed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = q
      ? items.filter((it) => `${it.name} ${it.id} ${it.model_id} ${it.framework}`.toLowerCase().includes(q))
      : items;
    if (regFilter === 'in_registry') {
      // Only resources published + APPROVED. Excludes 'not_applicable' rows
      // (harness / memory / runtime) — those can't be "in registry".
      filtered = filtered.filter((it) => it.registry_status === 'in_registry');
    } else if (regFilter === 'not_in_registry') {
      // Governance-gap view: registry-eligible rows that aren't APPROVED.
      // 'pending' / 'rejected' / 'deprecated' / 'not_in_registry' are all
      // shown so operators can act on each. 'not_applicable' excluded.
      filtered = filtered.filter((it) =>
        it.registry_status && it.registry_status !== 'in_registry' && it.registry_status !== 'not_applicable'
      );
    }
    const buckets: Record<SectionKey, CatalogItem[]> = {
      'app': [],
      'frontier-agent': [],
      'custom-agent': [],
      'harness': [],
      'memory': [],
      'mcp-server': [],
      agent: [],
      'a2a-agent': [],
      'agentcore-runtime': [],
      'template': [],
    };
    for (const it of filtered) {
      if (it.type in buckets) buckets[it.type as SectionKey].push(it);
    }
    return buckets;
  }, [items, query, regFilter]);

  const totalVisible = useMemo(
    () => Object.values(bucketed).reduce((n, arr) => n + arr.length, 0),
    [bucketed],
  );

  const toggle = (k: SectionKey) => setExpanded((prev) => ({ ...prev, [k]: !prev[k] }));

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      {/* Hero */}
      <div
        className="rounded-2xl p-8 mb-6 text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 50%, #db2777 100%)' }}
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Build · Catalog
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Catalog</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Live inventory of every deployed resource — applications, frontier agents, custom agents,
              harnesses, and AgentCore runtimes. In-progress and failed items are hidden; only READY /
              deployed rows appear here.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-4xl font-semibold leading-none">{items.length}</div>
            <div className="text-white/80 text-xs uppercase tracking-widest">deployed resources</div>
          </div>
        </div>
      </div>

      {/* Search + registry filter + section quick-jump */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 mb-6 flex flex-wrap gap-3 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, id, model…"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm min-w-[240px] focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
        />
        {/* Registry filter tabs — surfaces the AWS Agent Registry cross-view.
            'In Registry' shows APPROVED records only; 'Not in Registry' surfaces
            governance gaps (pending / rejected / deprecated / never-published).
            Only MCP + A2A rows carry a meaningful registry_status today. */}
        <div className="flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 bg-white">
          {(['all', 'in_registry', 'not_in_registry'] as RegistryFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setRegFilter(f)}
              title={
                f === 'in_registry'
                  ? 'Show only resources published + approved in the AVA registry.'
                  : f === 'not_in_registry'
                    ? 'Show governance gaps — pending, rejected, deprecated, or never published.'
                    : 'Show every catalog row regardless of registry state.'
              }
              className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                regFilter === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f === 'all' ? 'All' : f === 'in_registry' ? 'In Registry' : 'Not in Registry'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {SECTIONS.map((s) => {
            const n = bucketed[s.key].length;
            if (n === 0) return null;
            return (
              <a
                key={s.key}
                href={`#section-${s.key}`}
                onClick={(e) => {
                  // Ensure the section is expanded when jumping to it.
                  if (!expanded[s.key]) {
                    e.preventDefault();
                    setExpanded((prev) => ({ ...prev, [s.key]: true }));
                    setTimeout(() => document.getElementById(`section-${s.key}`)?.scrollIntoView({ behavior: 'smooth' }), 0);
                  }
                }}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-full transition-colors"
              >
                {s.label} ({n})
              </a>
            );
          })}
        </div>
        <div className="ml-auto text-xs text-slate-500">Region: us-east-1</div>
      </div>

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {!loading && !err && totalVisible === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm mb-4">
            {items.length === 0
              ? "No deployed resources yet. Head to Applications, AaaS, or Harness to build something."
              : "No resources match the current search."}
          </div>
          {items.length === 0 && (
            <div className="flex gap-2 justify-center flex-wrap">
              <Link to="/applications" className="text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-medium">Applications</Link>
              <Link to="/aaas" className="text-xs bg-orange-600 text-white hover:bg-orange-700 px-3 py-1.5 rounded-lg font-medium">AaaS</Link>
              <Link to="/harness" className="text-xs bg-violet-600 text-white hover:bg-violet-700 px-3 py-1.5 rounded-lg font-medium">Harness</Link>
            </div>
          )}
        </div>
      )}

      {/* Sections */}
      {!loading && totalVisible > 0 && (
        <div className="space-y-5">
          {SECTIONS.map((section) => {
            const rows = bucketed[section.key];
            if (rows.length === 0) return null;
            const isOpen = expanded[section.key];
            return (
              <section
                key={section.key}
                id={`section-${section.key}`}
                className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden scroll-mt-6"
              >
                <button
                  onClick={() => toggle(section.key)}
                  className="w-full flex items-center gap-2 px-5 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <h2 className="text-sm font-semibold text-slate-900">{section.label}</h2>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    {rows.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          {section.columns.map((c) => (
                            <th
                              key={c.header}
                              className={`text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 ${c.width || ''}`}
                            >
                              {c.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((it) => (
                          <tr
                            key={`${it.type}:${it.id}`}
                            className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 transition-colors cursor-pointer"
                            onClick={() => {
                              if (it.detail_href && it.detail_href !== '#') {
                                window.location.href = it.detail_href;
                              }
                            }}
                          >
                            {section.columns.map((c, idx) => {
                              const content = c.render(it);
                              return (
                                <td
                                  key={c.header}
                                  className={`px-4 py-2.5 ${c.mono ? 'font-mono text-xs text-slate-600' : 'text-slate-800'} ${idx === 0 ? 'font-medium' : ''}`}
                                >
                                  {idx === 0 && it.detail_href && it.detail_href !== '#' ? (
                                    <Link
                                      to={it.detail_href}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-indigo-700 hover:underline"
                                    >
                                      {content}
                                    </Link>
                                  ) : (
                                    <span className="truncate block max-w-md">{content}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact "2h ago" / "3d ago" formatter. Falls back to ISO for anything past 30d.
function formatWhen(ts: string): string {
  if (!ts) return '—';
  const then = new Date(ts);
  if (isNaN(then.getTime())) return ts.slice(0, 10);
  const diffMs = Date.now() - then.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return then.toISOString().slice(0, 10);
}
