import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OrganizationDesign, OrganizationDesignCreate } from './organization_design/types';
import { organizationDesignStore, NameTakenError, type Source } from './organization_design/store';
import { DIMENSIONS, DIM_ACCENTS, STATUSES } from './organization_design/types';
import { archetypeColor, gateColor } from './organization_design/scoring';
import OrganizationDesignDrawer from './organization_design/OrganizationDesignDrawer';
import OrgChartPyramid from './organization_design/views/OrgChartPyramid';
import AgentOrgTable from './organization_design/views/AgentOrgTable';
import PhaseRoadmapView from './organization_design/views/PhaseRoadmapView';
import ScenarioCompareTable from './organization_design/views/ScenarioCompareTable';
import ConfirmDialog from './ConfirmDialog';

type SortKey = 'composite' | 'agents' | 'updated' | 'name';
type DetailTab = 'org-chart' | 'agent-org' | 'roadmap' | 'scenarios';

export default function OrganizationDesignPage() {
  const [items, setItems] = useState<OrganizationDesign[]>([]);
  const [source, setSource] = useState<Source>('api');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationDesign | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationDesign | null>(null);

  const [detailOf, setDetailOf] = useState<OrganizationDesign | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('org-chart');

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterIndustry, setFilterIndustry] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDesc, setSortDesc] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await organizationDesignStore.list();
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
  const handleEdit = (m: OrganizationDesign) => { setEditing(m); setDrawerOpen(true); };

  const handleSubmit = async (req: OrganizationDesignCreate, id?: string) => {
    try {
      if (id) {
        const res = await organizationDesignStore.update(id, req);
        setSource(res.source);
      } else {
        const res = await organizationDesignStore.create(req);
        setSource(res.source);
      }
      await refresh();
    } catch (e) {
      if (e instanceof NameTakenError) throw e;
      throw e;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const res = await organizationDesignStore.delete(confirmDelete.organization_design_id);
    setSource(res.source);
    setConfirmDelete(null);
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
        || (m.profile.industry || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') xs = xs.filter((m) => m.status === filterStatus);
    if (filterIndustry !== 'all') xs = xs.filter((m) => m.profile.industry === filterIndustry);

    return [...xs].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'composite')   { av = a.computed?.composite ?? 0; bv = b.computed?.composite ?? 0; }
      else if (sortKey === 'agents') { av = a.computed?.total_ai_agents ?? 0; bv = b.computed?.total_ai_agents ?? 0; }
      else if (sortKey === 'updated'){ av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); }
      else if (sortKey === 'name')   { return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name); }
      return sortDesc ? bv - av : av - bv;
    });
  }, [items, search, filterStatus, filterIndustry, sortKey, sortDesc]);

  const counts = useMemo(() => {
    const total = items.length;
    const avg = total ? round(items.reduce((s, m) => s + (m.computed?.composite ?? 0), 0) / total) : 0;
    const totalAgents = items.reduce((s, m) => s + (m.computed?.total_ai_agents ?? 0), 0);
    const gatesPassed = items.filter((m) => m.computed?.all_gates_passed).length;
    return { total, avg, totalAgents, gatesPassed };
  }, [items]);

  const existingNames = useMemo(
    () => items.filter((m) => m.organization_design_id !== editing?.organization_design_id).map((m) => m.name.trim().toLowerCase()),
    [items, editing],
  );

  const industries = useMemo(() => Array.from(new Set(items.map((m) => m.profile.industry))).sort(), [items]);

  // Detail view
  if (detailOf) {
    const c = detailOf.computed;
    if (!c) {
      return <div className="text-sm text-slate-500 py-12 text-center">Loading detail…</div>;
    }
    return (
      <div className="min-h-[calc(100vh-4rem)] relative">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(221,214,254,0.55) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(245,208,254,0.4) 0%, transparent 55%)',
        }} />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <button onClick={() => setDetailOf(null)} className="text-sm text-slate-400 hover:text-slate-600 font-medium mb-4">← Back to designs</button>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{detailOf.name}</h1>
              <div className="text-sm text-slate-500 mt-1">
                {detailOf.profile.company_name} · {detailOf.profile.industry} · {detailOf.profile.company_size.toLocaleString()} employees · {detailOf.profile.scenario_pathway}
              </div>
            </div>
            <button onClick={() => { setDetailOf(null); handleEdit(detailOf); }}
              className="px-3.5 py-1.5 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50">
              Edit design
            </button>
          </div>

          <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
            {(['org-chart','agent-org','roadmap','scenarios'] as DetailTab[]).map((t) => (
              <button key={t} onClick={() => setDetailTab(t)}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${detailTab === t ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tabLabel(t)}
              </button>
            ))}
          </div>

          {detailTab === 'org-chart' && <OrgChartPyramid computed={c} targetPhase={detailOf.profile.target_phase} />}
          {detailTab === 'agent-org' && <AgentOrgTable computed={c} />}
          {detailTab === 'roadmap' && <PhaseRoadmapView computed={c} currentPhase={detailOf.profile.current_phase} targetPhase={detailOf.profile.target_phase} />}
          {detailTab === 'scenarios' && <ScenarioCompareTable computed={c} selected={detailOf.profile.scenario_pathway} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(221,214,254,0.7) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(245,208,254,0.55) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(251,207,232,0.55) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/plan" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Plan</Link>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Organization Design</h1>
            <p className="text-slate-500 mt-2 max-w-3xl">
              Assemble the future org where humans and AI agents deliver goals together. Strategy → operating model → maturity → per-function agent config → phased roadmap. Persists to DynamoDB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {source === 'local' && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Offline · localStorage
              </span>
            )}
            <button onClick={refresh} className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 transition-all">Refresh</button>
            <button onClick={handleCreate}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all hover:-translate-y-0.5 inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Design Organization
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Designs" value={String(counts.total)} accent="from-indigo-600 to-blue-600" />
          <StatCard label="Avg Composite" value={counts.avg.toFixed(2)} accent="from-blue-600 to-violet-600" />
          <StatCard label="Total AI agents" value={counts.totalAgents.toLocaleString()} accent="from-violet-600 to-fuchsia-600" />
          <StatCard label="Gates passed" value={`${counts.gatesPassed}/${counts.total}`} accent="from-fuchsia-600 to-rose-600" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <input type="text" placeholder="Search by name, industry, designer…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterIndustry} onChange={(e) => setFilterIndustry(e.target.value)}>
                <option value="all">All industries</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="md:col-span-3 flex items-center gap-2">
              <select className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="updated">Sort: Updated</option>
                <option value="composite">Sort: Composite</option>
                <option value="agents">Sort: Agents</option>
                <option value="name">Sort: Name</option>
              </select>
              <button onClick={() => setSortDesc((v) => !v)} title={sortDesc ? 'Descending' : 'Ascending'}
                className="px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                {sortDesc ? '↓' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {loading && <div className="text-sm text-slate-500 py-12 text-center">Loading designs…</div>}
        {!loading && error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && <EmptyState onCreate={handleCreate} hasItems={items.length > 0} />}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((m) => (
              <DesignCard key={m.organization_design_id} m={m}
                onOpen={() => { setDetailOf(m); setDetailTab('org-chart'); }}
                onEdit={() => handleEdit(m)}
                onDelete={() => setConfirmDelete(m)} />
            ))}
          </div>
        )}
      </div>

      <OrganizationDesignDrawer
        open={drawerOpen}
        initial={editing}
        existingNames={existingNames}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Design"
        message={`Are you sure you want to delete "${confirmDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(null)}
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

function DesignCard({ m, onOpen, onEdit, onDelete }: { m: OrganizationDesign; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const c = m.computed;
  const composite = c?.composite ?? 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-semibold text-slate-900 truncate flex-1 cursor-pointer" onClick={onOpen}>{m.name}</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${archetypeColor(c?.archetype ?? '')}`}>
            {c?.archetype ?? '—'}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mb-3">
          {m.profile.company_name} · {m.profile.industry}
          {' · '}
          <span className="text-slate-600 font-medium">{m.status}</span>
          {' · '}
          <span className="text-slate-600 font-medium">{m.profile.scenario_pathway}</span>
        </div>
        {m.description && <p className="text-xs text-slate-600 line-clamp-2 mb-3">{m.description}</p>}

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <Kpi label="Composite" value={composite.toFixed(2)} />
          <Kpi label="Agents"    value={String(c?.total_ai_agents ?? 0)} />
          <Kpi label="H:AI"      value={c?.effective_ratio ?? '—'} />
          <Kpi label="Layers"    value={c ? `${c.current_layers}→${c.target_layers}` : '—'} />
        </div>

        {/* Sub/peer split */}
        <div className="mb-2 flex items-center gap-2 text-[11px]">
          <span className="text-slate-400 font-bold uppercase tracking-wider">Agents</span>
          <span className="text-blue-700 font-semibold tabular-nums">{c?.total_agents_subordinate ?? 0} sub</span>
          <span className="text-slate-300">·</span>
          <span className="text-emerald-700 font-semibold tabular-nums">{c?.total_agents_peer ?? 0} peer</span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden mb-3">
          <div className="bg-blue-500" style={{ width: `${(c?.total_agents_subordinate ?? 0) / Math.max(1, c?.total_ai_agents ?? 1) * 100}%` }} />
          <div className="bg-emerald-500" style={{ width: `${(c?.total_agents_peer ?? 0) / Math.max(1, c?.total_ai_agents ?? 1) * 100}%` }} />
        </div>

        {/* Gate status pill */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${gateColor(c?.all_gates_passed ?? false)}`}>
            {c?.all_gates_passed ? '✓ All gates passed' : '✗ Gates not met'}
          </span>
          <span className="text-[11px] text-slate-500 italic truncate">{c?.recommended_structure ?? '—'}</span>
        </div>

        {/* Dimension mini bars */}
        <div className="space-y-1 mt-2">
          {DIMENSIONS.slice(0, 4).map((d) => {
            const dr = c?.dimensions?.[d.key];
            const avg = dr?.score ?? 0;
            const accent = DIM_ACCENTS[d.key];
            return (
              <div key={d.key} className="flex items-center gap-2 text-[10px]">
                <span className="w-32 truncate text-slate-500">{d.label}</span>
                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${accent.bar}`} style={{ width: `${(avg / 5) * 100}%` }} />
                </div>
                <span className="w-6 text-right tabular-nums text-slate-700 font-semibold">{avg}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between bg-slate-50/40">
        <span className="text-[10px] text-slate-400">Updated {new Date(m.updated_at).toLocaleDateString()}</span>
        <div className="flex gap-1">
          <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-md hover:bg-indigo-100">Detail</button>
          <button onClick={onEdit} className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-100">Edit</button>
          <button onClick={onDelete} className="text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-100">Delete</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
      <div className="text-sm font-bold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}

function EmptyState({ onCreate, hasItems }: { onCreate: () => void; hasItems: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center mb-3 shadow-md">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1">{hasItems ? 'No matches' : 'No designs yet'}</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
        {hasItems ? 'Try clearing filters, or design a new organization.' : 'Design your first blended organization where humans and AI agents work together across every function.'}
      </p>
      <button onClick={onCreate} className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg">
        + Design Organization
      </button>
    </div>
  );
}

function round(n: number) { return Math.round(n * 100) / 100; }
function tabLabel(t: DetailTab): string {
  switch (t) {
    case 'org-chart': return 'Org Chart';
    case 'agent-org': return 'Agent Org by Function';
    case 'roadmap':   return 'Phase Roadmap';
    case 'scenarios': return 'Scenario Compare';
  }
}
