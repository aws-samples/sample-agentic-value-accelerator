import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { operatingModelStore, NameTakenError, type Source } from './operating_model/store';
import { DIMENSIONS, DIM_ACCENTS, LEVEL_NAMES, STATUSES, PATTERNS } from './operating_model/types';
import type { OperatingModel, OperatingModelCreate } from './operating_model/types';
import { levelColor, patternColor } from './operating_model/scoring';
import OperatingModelDrawer from './operating_model/OperatingModelDrawer';

type SortKey = 'composite' | 'completion' | 'updated' | 'name' | 'investment';

export default function OperatingModelPage() {
  const [items, setItems] = useState<OperatingModel[]>([]);
  const [source, setSource] = useState<Source>('api');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<OperatingModel | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPattern, setFilterPattern] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDesc, setSortDesc] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await operatingModelStore.list();
      setItems(res.items);
      setSource(res.source);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = () => { setEditing(null); setDrawerOpen(true); };
  const handleEdit = (m: OperatingModel) => { setEditing(m); setDrawerOpen(true); };

  const handleSubmit = async (req: OperatingModelCreate, id?: string) => {
    try {
      if (id) {
        const res = await operatingModelStore.update(id, req);
        setSource(res.source);
      } else {
        const res = await operatingModelStore.create(req);
        setSource(res.source);
      }
      await refresh();
    } catch (e) {
      if (e instanceof NameTakenError) throw e;
      throw e;
    }
  };

  const handleDelete = async (m: OperatingModel) => {
    if (!confirm(`Delete operating model "${m.name}"? This cannot be undone.`)) return;
    const res = await operatingModelStore.delete(m.operating_model_id);
    setSource(res.source);
    await refresh();
  };

  const filtered = useMemo(() => {
    let xs = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((m) =>
        m.name.toLowerCase().includes(q)
        || (m.description || '').toLowerCase().includes(q)
        || (m.organization || '').toLowerCase().includes(q)
        || (m.designer || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') xs = xs.filter((m) => m.status === filterStatus);
    if (filterPattern !== 'all') xs = xs.filter((m) => m.pattern === filterPattern);

    return [...xs].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'composite')        { av = a.computed?.composite ?? 0; bv = b.computed?.composite ?? 0; }
      else if (sortKey === 'completion')  { av = a.computed?.completion ?? 0; bv = b.computed?.completion ?? 0; }
      else if (sortKey === 'investment')  { av = a.computed?.total_investment_m ?? 0; bv = b.computed?.total_investment_m ?? 0; }
      else if (sortKey === 'updated')     { av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); }
      else if (sortKey === 'name')        { return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name); }
      return sortDesc ? bv - av : av - bv;
    });
  }, [items, search, filterStatus, filterPattern, sortKey, sortDesc]);

  const counts = useMemo(() => {
    const total = items.length;
    const avg = total ? round(items.reduce((s, m) => s + (m.computed?.composite ?? 0), 0) / total) : 0;
    const investment = round(items.reduce((s, m) => s + (m.computed?.total_investment_m ?? 0), 0));
    const byPattern: Record<string, number> = {};
    items.forEach((m) => { byPattern[m.pattern] = (byPattern[m.pattern] ?? 0) + 1; });
    return { total, avg, investment, byPattern };
  }, [items]);

  const existingNames = useMemo(
    () => items.filter((m) => m.operating_model_id !== editing?.operating_model_id).map((m) => m.name.trim().toLowerCase()),
    [items, editing]
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <Link to="/plan" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Plan</Link>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Operating Model</h1>
            <p className="text-slate-500 mt-2 max-w-2xl">
              Design your AI operating model in six steps — assess 7 TOM dimensions, choose a pattern, place 20 capabilities, set the investment split, and lock the 36-month roadmap. Persists locally per browser.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {source === 'local' && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Offline · localStorage
              </span>
            )}
            <button onClick={refresh} className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">Refresh</button>
            <button onClick={handleCreate}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all hover:-translate-y-0.5 inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Design Operating Model
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Models" value={String(counts.total)} accent="from-blue-600 to-indigo-600" />
          <StatCard label="Avg Composite" value={counts.avg.toFixed(2)} accent="from-indigo-600 to-violet-600" />
          <StatCard label="Total Investment" value={`$${counts.investment.toFixed(1)}M`} accent="from-amber-500 to-orange-500" />
          <StatCard label="Hub-and-Spoke" value={String(counts.byPattern['Hub-and-Spoke'] ?? 0)} accent="from-violet-500 to-purple-600" />
          <StatCard label="Federated" value={String((counts.byPattern['Federated + Central Gov'] ?? 0) + (counts.byPattern['Fully Federated'] ?? 0))} accent="from-emerald-500 to-teal-600" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <input type="text" placeholder="Search by name, organization, designer…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterPattern} onChange={(e) => setFilterPattern(e.target.value)}>
                <option value="all">All patterns</option>
                {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="md:col-span-3 flex items-center gap-2">
              <select className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="updated">Sort: Updated</option>
                <option value="composite">Sort: Composite</option>
                <option value="completion">Sort: Completion</option>
                <option value="investment">Sort: Investment</option>
                <option value="name">Sort: Name</option>
              </select>
              <button onClick={() => setSortDesc((v) => !v)} title={sortDesc ? 'Descending' : 'Ascending'}
                className="px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                {sortDesc ? '↓' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        {loading && <div className="text-sm text-slate-500 py-12 text-center">Loading operating models…</div>}
        {!loading && error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && <EmptyState onCreate={handleCreate} hasItems={items.length > 0} />}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((m) => <OmCard key={m.operating_model_id} m={m} onEdit={() => handleEdit(m)} onDelete={() => handleDelete(m)} />)}
          </div>
        )}
      </div>

      <OperatingModelDrawer
        open={drawerOpen}
        initial={editing}
        existingNames={existingNames}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold bg-gradient-to-r ${accent} bg-clip-text text-transparent mt-1 tabular-nums`}>{value}</div>
    </div>
  );
}

function OmCard({ m, onEdit, onDelete }: { m: OperatingModel; onEdit: () => void; onDelete: () => void }) {
  const computed = m.computed;
  const composite = computed?.composite ?? 0;
  const level = computed?.maturity_level ?? 0;
  const completion = computed?.completion ?? 0;
  const investment = computed?.total_investment_m ?? 0;

  const centralized = m.capability_choices.filter((c) => c.placement === 'Centralized').length;
  const hub = m.capability_choices.filter((c) => c.placement === 'Hub-and-Spoke').length;
  const federated = m.capability_choices.filter((c) => c.placement === 'Federated').length;
  const totalCaps = centralized + hub + federated || 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-semibold text-slate-900 truncate flex-1">{m.name}</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${levelColor(level)}`}>
            {level ? `L${level}` : '—'}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mb-3">
          {m.organization || 'No organization'}
          {m.designer ? ` · ${m.designer}` : ''}
          {' · '}
          <span className="text-slate-600 font-medium">{m.status}</span>
        </div>
        {m.description && <p className="text-xs text-slate-600 line-clamp-2 mb-3">{m.description}</p>}

        {/* Pattern + governance */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${patternColor(m.pattern)}`}>{m.pattern}</span>
          <span className="text-[11px] text-slate-500 italic truncate">{m.governance}</span>
        </div>

        {/* Composite + completion + investment */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Composite</div>
            <div className="text-xl font-bold tabular-nums text-slate-800">{composite.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completion</div>
            <div className="text-xl font-bold tabular-nums text-slate-800">{Math.round(completion * 100)}%</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Investment</div>
            <div className="text-xl font-bold tabular-nums text-slate-800">${investment.toFixed(1)}M</div>
          </div>
        </div>

        {/* Per-dimension mini bars */}
        <div className="space-y-1.5 mt-3">
          {DIMENSIONS.map((d) => {
            const dr = computed?.dimensions?.[d.key];
            const avg = dr?.average ?? 0;
            const accent = DIM_ACCENTS[d.key];
            return (
              <div key={d.key} className="flex items-center gap-2 text-[11px]">
                <span className="w-32 truncate text-slate-600">{d.label}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${accent.bar}`} style={{ width: `${(avg / 5) * 100}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums text-slate-700 font-semibold">{avg.toFixed(2)}</span>
              </div>
            );
          })}
        </div>

        {/* Capability distribution */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-400 font-bold uppercase tracking-wider mr-1">Capabilities</span>
            <span className="text-blue-700 font-semibold">{centralized} central</span>
            <span className="text-slate-300">·</span>
            <span className="text-violet-700 font-semibold">{hub} hub</span>
            <span className="text-slate-300">·</span>
            <span className="text-emerald-700 font-semibold">{federated} federated</span>
          </div>
          <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500" style={{ width: `${(centralized / totalCaps) * 100}%` }} />
            <div className="bg-violet-500" style={{ width: `${(hub / totalCaps) * 100}%` }} />
            <div className="bg-emerald-500" style={{ width: `${(federated / totalCaps) * 100}%` }} />
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-500 italic">{LEVEL_NAMES[level]?.tagline}</div>
      </div>

      <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between bg-slate-50/40">
        <span className="text-[10px] text-slate-400">Updated {new Date(m.updated_at).toLocaleDateString()}</span>
        <div className="flex gap-1">
          <button onClick={onEdit} className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-100">Edit</button>
          <button onClick={onDelete} className="text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-100">Delete</button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate, hasItems }: { onCreate: () => void; hasItems: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 shadow-md">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1">{hasItems ? 'No matches' : 'No operating models yet'}</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
        {hasItems
          ? 'Try clearing filters, or design a new operating model.'
          : 'Walk through the 6-step wizard to design your first operating model — score 7 TOM dimensions, pick a pattern, place 20 capabilities, set investment, and lock a 36-month roadmap.'}
      </p>
      <button onClick={onCreate} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg">
        + Design Operating Model
      </button>
    </div>
  );
}

function round(n: number) { return Math.round(n * 100) / 100; }
