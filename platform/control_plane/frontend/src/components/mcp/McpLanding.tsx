import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { mcpApi, type CuratedMcpServer, type McpServer } from './api';

type Tab = 'my' | 'curated';

const POSTURE_TONE: Record<string, string> = {
  official:  'text-emerald-700 bg-emerald-50',
  community: 'text-slate-700 bg-slate-100',
  experimental: 'text-amber-700 bg-amber-50',
};

const STATUS_TONE: Record<string, string> = {
  active:     'text-emerald-700 bg-emerald-50',
  pending:    'text-amber-700 bg-amber-50',
  rejected:   'text-red-700 bg-red-50',
  deprecated: 'text-slate-500 bg-slate-100 line-through',
  failed:     'text-red-700 bg-red-50',
  unknown:    'text-slate-500 bg-slate-100',
};

export default function McpLanding() {
  const [tab, setTab] = useState<Tab>('my');
  const [mine, setMine] = useState<McpServer[]>([]);
  const [curated, setCurated] = useState<CuratedMcpServer[]>([]);

  // Tab label reflects the count of curated servers *still available* to add
  // (those not already in the user's registry) — matches what the Browse tab
  // actually renders. Filter mirrors the logic in CuratedTab below.
  const curatedAvailableCount = useMemo(() => {
    const registeredIds = new Set(mine.map((s) => s.curated_id).filter(Boolean) as string[]);
    const registeredUrls = new Set(mine.map((s) => (s.url || '').trim()).filter(Boolean));
    return curated.filter((c) => !registeredIds.has(c.id) && !registeredUrls.has((c.url || '').trim())).length;
  }, [curated, mine]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState<string>('');

  const load = () => {
    setLoading(true);
    Promise.allSettled([mcpApi.list(), mcpApi.curated()])
      .then(([mine, curated]) => {
        if (mine.status === 'fulfilled') setMine(mine.value.servers || []);
        if (curated.status === 'fulfilled') setCurated(curated.value.servers || []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addCurated = async (c: CuratedMcpServer) => {
    setAdding(c.id);
    setErr('');
    try {
      await mcpApi.register({
        name: c.name,
        url: c.url,
        description: c.description,
        category: c.category,
        auth_hint: c.auth_hint,
        delegation_mode: c.delegation_mode,
        source: 'curated',
        curated_id: c.id,
      });
      load();
      setTab('my');
    } catch (e) {
      setErr(String(e));
    } finally {
      setAdding('');
    }
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      {/* Hero */}
      <div className="rounded-2xl p-8 mb-6 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 50%, #db2777 100%)' }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full inline-block mb-3">
              Build · MCP Servers
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">MCP Servers</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Register Model Context Protocol servers your agents can call. Browse well-known servers or
              add your own URL. Once registered, servers become picker options in the Harness Create wizard.
            </p>
          </div>
          <Link to="/mcp/create" className="inline-flex items-center gap-2 bg-white text-indigo-700 hover:bg-white/95 px-5 py-2.5 rounded-lg font-medium text-sm shadow-md shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Register custom
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {(['my', 'curated'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t === 'my' ? `My Servers (${mine.length})` : `Browse Curated (${curatedAvailableCount})`}
          </button>
        ))}
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}
      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {!loading && tab === 'my' && (
        mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
            <div className="text-slate-500 text-sm mb-4">No registered MCP servers yet.</div>
            <button onClick={() => setTab('curated')} className="text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-medium mr-2">Browse curated</button>
            <Link to="/mcp/create" className="text-xs bg-slate-600 text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg font-medium">Register custom</Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Name</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">URL</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Auth</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Status</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Source</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Updated</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((s) => (
                  <tr key={s.server_id} className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 truncate max-w-xs">{s.url}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{s.auth_hint}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_TONE[s.status] || STATUS_TONE.unknown}`}>
                        {s.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${s.source === 'curated' ? 'text-violet-700 bg-violet-50' : 'text-slate-700 bg-slate-100'}`}>
                        {s.source}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{(s.updated_at || '').replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && tab === 'curated' && (
        <CuratedTab
          curated={curated}
          mine={mine}
          adding={adding}
          onAdd={addCurated}
          postureTone={POSTURE_TONE}
        />
      )}
    </div>
  );
}

// Extracted so the parent stays readable; also lets us memoize the
// "already-registered" filter without cluttering the top-level component.
function CuratedTab({
  curated,
  mine,
  adding,
  onAdd,
  postureTone,
}: {
  curated: CuratedMcpServer[];
  mine: McpServer[];
  adding: string;
  onAdd: (c: CuratedMcpServer) => void;
  postureTone: Record<string, string>;
}) {
  // Consider a curated entry "already registered" if any registered server
  // matches either its curated_id (the strong signal — set when adding via
  // this UI) or its URL (fallback for hand-registered duplicates that share
  // the exact same endpoint).
  const registeredIds = useMemo(() => new Set(mine.map((s) => s.curated_id).filter(Boolean) as string[]), [mine]);
  const registeredUrls = useMemo(() => new Set(mine.map((s) => (s.url || '').trim()).filter(Boolean)), [mine]);
  const available = curated.filter(
    (c) => !registeredIds.has(c.id) && !registeredUrls.has((c.url || '').trim()),
  );
  const hiddenCount = curated.length - available.length;

  return (
    <div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-4">
        AVA does not audit third-party MCP servers. Review each server's terms and code before enabling.
      </div>
      {hiddenCount > 0 && (
        <div className="text-xs text-slate-500 mb-3">
          {hiddenCount} curated {hiddenCount === 1 ? 'server is' : 'servers are'} already in your registry and hidden here.
        </div>
      )}
      {available.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm">
            You've added every curated server. Register a custom one to keep going.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {available.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${postureTone[c.posture] || 'text-slate-700 bg-slate-100'}`}>
                  {c.posture}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mb-2">{c.publisher} · {c.category}</div>
              <div className="text-xs text-slate-700 mb-3 line-clamp-2">{c.description}</div>
              <div className="flex flex-wrap gap-1 mb-3">
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">auth: {c.auth_hint}</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c.delegation_mode}</span>
              </div>
              <div className="flex items-center justify-between">
                <a href={c.docs_url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-700 hover:underline">Docs →</a>
                <button
                  onClick={() => onAdd(c)}
                  disabled={adding === c.id}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-3 py-1 rounded-lg font-medium"
                >
                  {adding === c.id ? 'Adding…' : 'Add to registry'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
