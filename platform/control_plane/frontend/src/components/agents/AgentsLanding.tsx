import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { agentsApi, type CuratedAgent, type RegisteredAgent } from './api';

// Registry → Agents landing. Mirrors MCP Servers / A2A Agents UX:
//   * "My Agents" tab — records the user has published
//   * "Browse Curated" tab — hand-curated list (AWS frontier agents,
//     FSI samples) with a Deploy button that publishes to the registry
// Distinct from A2A Agents because those are A2A-protocol peers with
// AgentCards; these are runtime-bound / MCP-callable / auto-registered
// peers.

type Tab = 'my' | 'curated';

const POSTURE_TONE: Record<string, string> = {
  official:     'text-emerald-700 bg-emerald-50',
  community:    'text-slate-700 bg-slate-100',
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

export default function AgentsLanding() {
  const [tab, setTab] = useState<Tab>('my');
  const [mine, setMine] = useState<RegisteredAgent[]>([]);
  const [curated, setCurated] = useState<CuratedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // A curated card is considered "already added to registry" if ANY of
  // the following matches an entry in `mine`:
  //   * curated_id equal (set by Deploy-to-Registry on the record's data blob)
  //   * runtime_ref equal (normalized: trimmed + lowercased)
  //   * displayName equal (case-insensitive) — fallback for legacy records
  //     that pre-date the curated_id field or were hand-registered with
  //     the same title.
  // Deprecated records still count as "added" — the point is to hide the
  // curated tile so the user can't re-add a duplicate. If they want to
  // re-deploy, they should un-deprecate in Registry → Agents first.
  const isCuratedAdded = (c: CuratedAgent, minelist: RegisteredAgent[]) => {
    const cid = c.id?.trim();
    const cref = (c.runtime_ref || '').trim().toLowerCase();
    const cname = (c.name || '').trim().toLowerCase();
    return minelist.some((a) => {
      if (cid && a.curated_id && a.curated_id.trim() === cid) return true;
      if (cref && (a.runtime_ref || '').trim().toLowerCase() === cref) return true;
      if (cname && (a.name || '').trim().toLowerCase() === cname) return true;
      return false;
    });
  };

  const curatedAvailableCount = useMemo(
    () => curated.filter((c) => !isCuratedAdded(c, mine)).length,
    [curated, mine],
  );

  const load = () => {
    setLoading(true);
    Promise.allSettled([agentsApi.list(), agentsApi.curated()])
      .then(([m, c]) => {
        if (m.status === 'fulfilled') setMine(m.value.agents || []);
        if (c.status === 'fulfilled') setCurated(c.value.agents || []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const deployCurated = async (c: CuratedAgent) => {
    setAdding(c.id);
    setErr('');
    try {
      await agentsApi.register({
        name: c.name,
        runtime: c.runtime,
        runtime_ref: c.runtime_ref,
        description: c.description,
        capabilities: c.capabilities || [],
        auth_hint: c.auth_hint || 'none',
        category: c.category,
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

  const deleteAgent = async (a: RegisteredAgent) => {
    if (!window.confirm(`Deprecate Agent "${a.name}"?\n\nThe record is soft-deleted (kept in the registry as DEPRECATED for audit); it stops appearing in discovery results.`))
      return;
    setErr('');
    setDeletingId(a.agent_id);
    try {
      await agentsApi.remove(a.agent_id);
      setMine((prev) => prev.filter((r) => r.agent_id !== a.agent_id));
      load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/registry" className="hover:text-slate-700">Registry</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Agents</span>
      </div>

      {/* Hero */}
      <div className="rounded-2xl p-8 mb-6 text-white shadow-lg bg-gradient-to-br from-indigo-500 to-blue-600">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Build · Registry · Agents
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                AWS Agent Registry · AGENT
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Agents</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Autonomous peer agents catalogued in the AVA registry — runtime-bound (AgentCore Runtime, Bedrock
              Agents, custom) rather than A2A-protocol peers. Publish once; discoverable across teams once
              approved through the Approval Queue.
            </p>
          </div>
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {(['my', 'curated'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'text-indigo-700 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            {t === 'my' ? `My Agents (${mine.length})` : `Browse Curated (${curatedAvailableCount})`}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {!loading && tab === 'my' && (
        <>
          {mine.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
              <div className="text-slate-500 text-sm mb-4">No agents registered yet.</div>
              <button onClick={() => setTab('curated')} className="text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-medium">
                Browse curated agents
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Name</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Runtime</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Capabilities</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Status</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Source</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Updated</th>
                    <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((a) => (
                    <tr key={a.agent_id} className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium">
                        <div className="text-slate-800 truncate">{a.name}</div>
                        {a.description && <div className="text-[11px] text-slate-500 truncate max-w-md">{a.description}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-600 truncate max-w-xs">
                        <div>{a.runtime}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{a.runtime_ref}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {a.capabilities?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {a.capabilities.slice(0, 3).map((c) => (
                              <span key={c} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c}</span>
                            ))}
                            {a.capabilities.length > 3 && (
                              <span className="text-[10px] text-slate-400">+{a.capabilities.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_TONE[a.status] || STATUS_TONE.unknown}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${a.source === 'curated' ? 'text-violet-700 bg-violet-50' : 'text-slate-700 bg-slate-100'}`}>
                          {a.source}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{(a.updated_at || '').replace('T', ' ').slice(0, 19) || '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => deleteAgent(a)}
                          disabled={deletingId === a.agent_id}
                          className="text-xs text-red-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                          title="Deprecate this Agent (soft-delete; kept in registry as DEPRECATED)"
                        >
                          {deletingId === a.agent_id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'curated' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {curated
            .filter((c) => !isCuratedAdded(c, mine))
            .map((c) => (
              <div key={c.id} className="rounded-2xl border border-slate-200 bg-white/85 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-slate-900 truncate">{c.name}</h2>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${POSTURE_TONE[c.posture] || 'text-slate-700 bg-slate-100'}`}>
                        {c.posture}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">{c.publisher} · {c.category}</div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-3">{c.description}</p>

                <div className="text-[11px] text-slate-500 mb-2">
                  <span className="font-semibold text-slate-600">Runtime:</span>{' '}
                  <code className="font-mono bg-slate-100 px-1 rounded">{c.runtime}</code>
                </div>

                {c.capabilities && c.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {c.capabilities.map((cap) => (
                      <span key={cap} className="text-[9px] px-1.5 py-0.5 bg-indigo-50/60 text-indigo-700 rounded-full">{cap}</span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3">
                  {c.docs_url ? (
                    <a href={c.docs_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-700 hover:underline">
                      Docs →
                    </a>
                  ) : <span />}
                  <button
                    onClick={() => deployCurated(c)}
                    disabled={adding === c.id}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg font-medium"
                  >
                    {adding === c.id ? 'Deploying…' : 'Deploy to Registry'}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
