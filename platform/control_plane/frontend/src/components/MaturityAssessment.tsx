import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MaturityAssessment, MaturityAssessmentCreate } from '../api/client';
import { assessmentStore, NameTakenError, type Source } from './maturity/store';
import { DIMENSIONS, DIM_ACCENTS, MATURITY_LEVELS, STATUSES } from './maturity/types';
import { levelColor } from './maturity/scoring';
import AssessmentDrawer from './maturity/AssessmentDrawer';
import ConfirmDialog from './ConfirmDialog';

type SortKey = 'composite' | 'completion' | 'updated' | 'name';

export default function MaturityAssessmentPage() {
  const [items, setItems] = useState<MaturityAssessment[]>([]);
  const [source, setSource] = useState<Source>('api');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MaturityAssessment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MaturityAssessment | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDesc, setSortDesc] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await assessmentStore.list();
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
  const handleEdit = (a: MaturityAssessment) => { setEditing(a); setDrawerOpen(true); };

  const handleSubmit = async (req: MaturityAssessmentCreate, id?: string) => {
    try {
      if (id) {
        const res = await assessmentStore.update(id, req);
        setSource(res.source);
      } else {
        const res = await assessmentStore.create(req);
        setSource(res.source);
      }
      await refresh();
    } catch (e) {
      if (e instanceof NameTakenError) throw e;
      throw e;
    }
  };

  const handleDeleteClick = (a: MaturityAssessment) => {
    setConfirmDelete(a);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const res = await assessmentStore.delete(confirmDelete.assessment_id);
    setSource(res.source);
    setConfirmDelete(null);
    await refresh();
  };

  const filtered = useMemo(() => {
    let xs = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter(a =>
        a.name.toLowerCase().includes(q)
        || (a.description || '').toLowerCase().includes(q)
        || (a.organization || '').toLowerCase().includes(q)
        || (a.assessor || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') xs = xs.filter(a => a.status === filterStatus);
    if (filterLevel !== 'all') xs = xs.filter(a => String(a.computed?.maturity_level ?? 0) === filterLevel);

    const sorted = [...xs].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'composite') { av = a.computed?.composite ?? 0; bv = b.computed?.composite ?? 0; }
      else if (sortKey === 'completion') { av = a.computed?.completion ?? 0; bv = b.computed?.completion ?? 0; }
      else if (sortKey === 'updated') { av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); }
      else if (sortKey === 'name') { return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name); }
      return sortDesc ? bv - av : av - bv;
    });
    return sorted;
  }, [items, search, filterStatus, filterLevel, sortKey, sortDesc]);

  const counts = useMemo(() => {
    const total = items.length;
    const avg = total ? round(items.reduce((s, a) => s + (a.computed?.composite ?? 0), 0) / total) : 0;
    const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    items.forEach(a => { const l = a.computed?.maturity_level ?? 0; if (l >= 1 && l <= 5) byLevel[l] += 1; });
    return { total, avg, byLevel };
  }, [items]);

  const existingNames = useMemo(
    () => items.filter(a => a.assessment_id !== editing?.assessment_id).map(a => a.name.trim().toLowerCase()),
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
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Maturity Assessment</h1>
            <p className="text-slate-500 mt-2 max-w-2xl">
              Diagnose AI maturity across 6 dimensions and 167 parameters using AWS&rsquo;s V3.1 model. Each assessment has a unique name and persists to DynamoDB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {source === 'local' && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Offline · localStorage
              </span>
            )}
            <button onClick={refresh} className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">
              Refresh
            </button>
            <button onClick={handleCreate}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all hover:-translate-y-0.5 inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Assessment
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-6">
          <StatCard label="Assessments" value={String(counts.total)} accent="from-blue-600 to-indigo-600" />
          <StatCard label="Avg Composite" value={counts.avg.toFixed(2)} accent="from-indigo-600 to-violet-600" />
          {[1, 2, 3, 4, 5].map((l) => (
            <StatCard key={l} label={`L${l}`} value={String(counts.byLevel[l])} accent={
              l === 5 ? 'from-emerald-500 to-teal-600'
              : l === 4 ? 'from-blue-500 to-indigo-500'
              : l === 3 ? 'from-violet-500 to-purple-500'
              : l === 2 ? 'from-amber-500 to-orange-500'
              : 'from-red-500 to-pink-600'
            } />
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <input type="text" placeholder="Search by name, organization, assessor…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
                <option value="all">All maturity levels</option>
                <option value="0">Not yet assessed</option>
                <option value="1">L1</option>
                <option value="2">L2</option>
                <option value="3">L3</option>
                <option value="4">L4</option>
                <option value="5">L5</option>
              </select>
            </div>
            <div className="md:col-span-3 flex items-center gap-2">
              <select className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="updated">Sort: Updated</option>
                <option value="composite">Sort: Composite</option>
                <option value="completion">Sort: Completion</option>
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
        {loading && <div className="text-sm text-slate-500 py-12 text-center">Loading assessments…</div>}
        {!loading && error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && <EmptyState onCreate={handleCreate} hasItems={items.length > 0} />}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => <AssessmentCard key={a.assessment_id} a={a} onEdit={() => handleEdit(a)} onDelete={() => handleDeleteClick(a)} />)}
          </div>
        )}
      </div>

      <AssessmentDrawer
        open={drawerOpen}
        initial={editing}
        existingNames={existingNames}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Assessment"
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

function AssessmentCard({ a, onEdit, onDelete }: { a: MaturityAssessment; onEdit: () => void; onDelete: () => void }) {
  const computed = a.computed;
  const composite = computed?.composite ?? 0;
  const level = computed?.maturity_level ?? 0;
  const completion = computed?.completion ?? 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-semibold text-slate-900 truncate flex-1">{a.name}</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${levelColor(level)}`}>
            {level ? `L${level}` : '—'}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mb-3">
          {a.organization || 'No organization'}
          {a.assessor ? ` · ${a.assessor}` : ''}
          {' · '}
          <span className="text-slate-600 font-medium">{a.status}</span>
        </div>
        {a.description && <p className="text-xs text-slate-600 line-clamp-2 mb-3">{a.description}</p>}

        {/* Composite + completion */}
        <div className="flex items-baseline gap-3 mb-3">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Composite</div>
            <div className="text-2xl font-bold tabular-nums text-slate-800">{composite.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completion</div>
            <div className="text-sm font-semibold tabular-nums text-slate-700">{Math.round(completion * 100)}%</div>
          </div>
          <div className="ml-auto text-[11px] text-slate-500 italic">{MATURITY_LEVELS[level]?.tagline}</div>
        </div>

        {/* Per-dimension mini bars */}
        <div className="space-y-1.5 mt-3">
          {DIMENSIONS.map((d) => {
            const dr = computed?.dimensions?.[d.key];
            const avg = dr?.average ?? 0;
            const accent = DIM_ACCENTS[d.key];
            return (
              <div key={d.key} className="flex items-center gap-2 text-[11px]">
                <span className="w-28 truncate text-slate-600">{d.label}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${accent.bar}`} style={{ width: `${(avg / 5) * 100}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums text-slate-700 font-semibold">{avg.toFixed(2)}</span>
                <span className="w-12 text-right tabular-nums text-slate-400">{dr?.answered ?? 0}/{dr?.total ?? 0}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between bg-slate-50/40">
        <span className="text-[10px] text-slate-400">Updated {new Date(a.updated_at).toLocaleDateString()}</span>
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1">{hasItems ? 'No matches' : 'No assessments yet'}</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
        {hasItems ? 'Try clearing filters, or create a new assessment.' : 'Create your first AI maturity baseline. Score 167 parameters across 6 dimensions to see where you are on the journey.'}
      </p>
      <button onClick={onCreate} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg">
        + New Assessment
      </button>
    </div>
  );
}

function round(n: number) { return Math.round(n * 100) / 100; }
