import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UseCase, UseCaseCreate } from '../api/client';
import { useCaseStore, type Source } from './prioritization/store';
import { verdictColor } from './prioritization/scoring';
import { AI_TYPES, STATUSES } from './prioritization/types';
import UseCaseDrawer from './prioritization/UseCaseDrawer';
import ValueCostReport from './prioritization/ValueCostReport';
import ConfirmDialog from './ConfirmDialog';
import { Icon } from './govern/icons';

type SortKey = 'composite' | 'risk' | 'readiness' | 'updated' | 'name';

export default function Prioritization() {
  const [items, setItems] = useState<UseCase[]>([]);
  const [source, setSource] = useState<Source>('api');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<UseCase | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UseCase | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAi, setFilterAi] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterVerdict, setFilterVerdict] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [sortDesc, setSortDesc] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await useCaseStore.list();
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
  const handleEdit = (uc: UseCase) => { setEditing(uc); setDrawerOpen(true); };

  const handleSubmit = async (req: UseCaseCreate, id?: string) => {
    if (id) {
      const res = await useCaseStore.update(id, req);
      setSource(res.source);
    } else {
      const res = await useCaseStore.create(req);
      setSource(res.source);
    }
    await refresh();
  };

  const handleDeleteClick = (uc: UseCase) => {
    setConfirmDelete(uc);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const res = await useCaseStore.delete(confirmDelete.use_case_id);
    setSource(res.source);
    setConfirmDelete(null);
    await refresh();
  };

  const filtered = useMemo(() => {
    let xs = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter(u =>
        u.name.toLowerCase().includes(q)
        || (u.description || '').toLowerCase().includes(q)
        || (u.business_domain || '').toLowerCase().includes(q)
      );
    }
    if (filterAi !== 'all') xs = xs.filter(u => u.ai_type === filterAi);
    if (filterStatus !== 'all') xs = xs.filter(u => u.status === filterStatus);
    if (filterVerdict !== 'all') xs = xs.filter(u => (u.computed?.go_no_go || '') === filterVerdict);

    const sorted = [...xs].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'composite') { av = a.computed?.composite ?? 0; bv = b.computed?.composite ?? 0; }
      else if (sortKey === 'risk') { av = a.computed?.risk_score ?? 0; bv = b.computed?.risk_score ?? 0; }
      else if (sortKey === 'readiness') { av = a.computed?.readiness_score ?? 0; bv = b.computed?.readiness_score ?? 0; }
      else if (sortKey === 'updated') { av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); }
      else if (sortKey === 'name') { return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name); }
      return sortDesc ? bv - av : av - bv;
    });
    return sorted;
  }, [items, search, filterAi, filterStatus, filterVerdict, sortKey, sortDesc]);

  const counts = useMemo(() => ({
    total: items.length,
    go: items.filter(u => u.computed?.go_no_go === 'GO').length,
    cond: items.filter(u => u.computed?.go_no_go === 'CONDITIONAL GO').length,
    no: items.filter(u => u.computed?.go_no_go === 'NO GO').length,
    avg: items.length ? round(items.reduce((s, u) => s + (u.computed?.composite ?? 0), 0) / items.length) : 0,
  }), [items]);

  const handlePrint = () => window.print();

  const activeFilters = useMemo(() => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    if (filterAi !== 'all') parts.push(`AI type: ${filterAi}`);
    if (filterStatus !== 'all') parts.push(`Status: ${filterStatus}`);
    if (filterVerdict !== 'all') parts.push(`Verdict: ${filterVerdict}`);
    return parts.length ? parts.join(' · ') : 'No filters applied';
  }, [search, filterAi, filterStatus, filterVerdict]);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative print-root">
      <div className="absolute inset-0 pointer-events-none print:hidden" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />

      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in print:hidden">
          <Link to="/plan" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Plan</Link>
        </div>

        {/* Print-only header block (visible in print/PDF, hidden on screen) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Use Case Prioritization — Summary</h1>
          <div className="text-xs text-slate-600 mt-1">
            Generated {new Date().toLocaleString()} · {filtered.length} of {items.length} use cases · {activeFilters}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Total {counts.total} · Avg Composite {counts.avg.toFixed(2)} · GO {counts.go} · Conditional {counts.cond} · NO GO {counts.no}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8 print:hidden">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Use Case Prioritization</h1>
            <p className="text-slate-500 mt-2 max-w-2xl">
              Score, rank, and triage AI use cases against the AWS Enterprise AI Scoring Model. 25 weighted sub-criteria, Go/Conditional/No-Go gates, persisted to DynamoDB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {source === 'local' && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Offline · localStorage
              </span>
            )}
            <button
              onClick={refresh}
              className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all"
            >
              Refresh
            </button>
            <button
              onClick={() => setReportOpen(true)}
              title="Open Value vs. Cost quadrant report"
              className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-violet-300 hover:text-violet-600 transition-all inline-flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Report
            </button>
            <button
              onClick={handlePrint}
              title="Print summary as PDF"
              className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all inline-flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              Print
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all hover:-translate-y-0.5 inline-flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Use Case
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 print:hidden">
          <StatCard label="Use Cases" value={String(counts.total)} accent="from-blue-600 to-indigo-600" />
          <StatCard label="Avg Composite" value={counts.avg.toFixed(2)} accent="from-indigo-600 to-violet-600" />
          <StatCard label="GO" value={String(counts.go)} accent="from-emerald-500 to-teal-600" />
          <StatCard label="Conditional" value={String(counts.cond)} accent="from-amber-500 to-orange-500" />
          <StatCard label="NO GO" value={String(counts.no)} accent="from-red-500 to-pink-600" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <input
                type="text"
                placeholder="Search by name, description, domain…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterAi} onChange={(e) => setFilterAi(e.target.value)}>
                <option value="all">All AI types</option>
                {AI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterVerdict} onChange={(e) => setFilterVerdict(e.target.value)}>
                <option value="all">All verdicts</option>
                <option value="GO">GO</option>
                <option value="CONDITIONAL GO">CONDITIONAL GO</option>
                <option value="NO GO">NO GO</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <select className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="composite">Sort: Composite</option>
                <option value="risk">Sort: Risk</option>
                <option value="readiness">Sort: Readiness</option>
                <option value="updated">Sort: Updated</option>
                <option value="name">Sort: Name</option>
              </select>
              <button
                onClick={() => setSortDesc((v) => !v)}
                title={sortDesc ? 'Descending' : 'Ascending'}
                className="px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                {sortDesc ? '↓' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* List / Empty / Loading */}
        {loading && <div className="text-sm text-slate-500 py-12 text-center">Loading use cases…</div>}
        {!loading && error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState onCreate={handleCreate} hasItems={items.length > 0} />
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50/60 border-b border-slate-200">
                <tr className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Rank</th>
                  <th className="px-5 py-3">Use Case</th>
                  <th className="px-5 py-3">AI Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Composite</th>
                  <th className="px-5 py-3 text-right">Risk</th>
                  <th className="px-5 py-3 text-right">Readiness</th>
                  <th className="px-5 py-3">Verdict</th>
                  <th className="px-5 py-3 text-right print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u, i) => (
                  <tr key={u.use_case_id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">{i + 1}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-500 truncate max-w-md">
                        {u.business_domain ? <span className="text-slate-600 font-medium">{u.business_domain}</span> : null}
                        {u.business_domain && u.description ? ' · ' : ''}
                        {u.description}
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap"><AiTypeBadge type={u.ai_type} /></td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{u.status}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="font-bold tabular-nums text-slate-800">{(u.computed?.composite ?? 0).toFixed(2)}</div>
                      <div className="h-1 w-20 ml-auto bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                          style={{ width: `${Math.min(100, ((u.computed?.composite ?? 0) / 5) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      <Link
                        to="/govern/risk"
                        className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors"
                        title="View risk governance details"
                      >
                        {u.computed?.risk_score ?? '—'}
                        <Icon name="shield-check" className="w-3.5 h-3.5 text-slate-400 hover:text-blue-500" />
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{(u.computed?.readiness_score ?? 0).toFixed(2)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${verdictColor(u.computed?.go_no_go ?? 'CONDITIONAL GO')}`}>
                        {u.computed?.go_no_go ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 print:hidden">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(u)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-50">Edit</button>
                        <button onClick={() => handleDeleteClick(u)} className="text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UseCaseDrawer
        open={drawerOpen}
        initial={editing}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      <ValueCostReport
        open={reportOpen}
        items={filtered}
        onClose={() => setReportOpen(false)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Use Case"
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

function AiTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    'Traditional ML': 'bg-blue-50 text-blue-700 border-blue-200',
    'Generative AI': 'bg-violet-50 text-violet-700 border-violet-200',
    'Agentic AI': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  };
  return <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${map[type] || 'bg-slate-50 text-slate-600 border-slate-200'} uppercase tracking-wider`}>{type}</span>;
}

function EmptyState({ onCreate, hasItems }: { onCreate: () => void; hasItems: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 shadow-md">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1">
        {hasItems ? 'No matches' : 'No use cases yet'}
      </h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
        {hasItems
          ? 'Try clearing filters, or add a new candidate to score.'
          : 'Add your first candidate to start scoring it against the 25 weighted sub-criteria.'}
      </p>
      <button onClick={onCreate} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg">
        + New Use Case
      </button>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
