import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BusinessCase, BusinessCaseCreate } from '../api/client';
import { businessCaseStore, type Source } from './business_cases/store';
import { decisionColor, riskColor, fmtMoney, fmtPct } from './business_cases/scoring';
import { STATUSES } from './business_cases/types';
import BusinessCaseDrawer from './business_cases/BusinessCaseDrawer';
import ConfirmDialog from './ConfirmDialog';
import { Icon } from './govern/icons';

type SortKey = 'npv' | 'irr' | 'risk' | 'updated' | 'name';

export default function BusinessCases() {
  const [items, setItems] = useState<BusinessCase[]>([]);
  const [source, setSource] = useState<Source>('api');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessCase | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BusinessCase | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDecision, setFilterDecision] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('npv');
  const [sortDesc, setSortDesc] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await businessCaseStore.list();
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
  const handleEdit = (b: BusinessCase) => { setEditing(b); setDrawerOpen(true); };

  const handleSubmit = async (req: BusinessCaseCreate, id?: string) => {
    if (id) {
      const res = await businessCaseStore.update(id, req);
      setSource(res.source);
    } else {
      const res = await businessCaseStore.create(req);
      setSource(res.source);
    }
    await refresh();
  };

  const handleDeleteClick = (b: BusinessCase) => {
    setConfirmDelete(b);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const res = await businessCaseStore.delete(confirmDelete.business_case_id);
    setSource(res.source);
    setConfirmDelete(null);
    await refresh();
  };

  const filtered = useMemo(() => {
    let xs = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter(b =>
        b.name.toLowerCase().includes(q)
        || (b.description || '').toLowerCase().includes(q)
        || (b.inputs?.business_unit || '').toLowerCase().includes(q)
        || (b.inputs?.sponsor || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') xs = xs.filter(b => b.status === filterStatus);
    if (filterDecision !== 'all') xs = xs.filter(b => (b.computed?.financials.npv_decision || '').startsWith(filterDecision));

    return [...xs].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'npv') { av = a.computed?.financials.npv ?? 0; bv = b.computed?.financials.npv ?? 0; }
      else if (sortKey === 'irr') { av = a.computed?.financials.irr ?? -1; bv = b.computed?.financials.irr ?? -1; }
      else if (sortKey === 'risk') { av = a.computed?.risk.composite ?? 0; bv = b.computed?.risk.composite ?? 0; }
      else if (sortKey === 'updated') { av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); }
      else if (sortKey === 'name') { return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name); }
      return sortDesc ? bv - av : av - bv;
    });
  }, [items, search, filterStatus, filterDecision, sortKey, sortDesc]);

  const counts = useMemo(() => {
    const total = items.length;
    const totalNpv = items.reduce((s, b) => s + (b.computed?.financials.npv ?? 0), 0);
    const positive = items.filter(b => (b.computed?.financials.npv_decision || '').startsWith('POSITIVE')).length;
    const negative = items.filter(b => (b.computed?.financials.npv_decision || '').startsWith('NEGATIVE')).length;
    const passingHurdle = items.filter(b => b.computed?.financials.irr_passes_hurdle).length;
    return { total, totalNpv, positive, negative, passingHurdle };
  }, [items]);

  const existingNames = useMemo(
    () => items.filter(b => b.business_case_id !== editing?.business_case_id).map(b => b.name.trim().toLowerCase()),
    [items, editing]
  );

  const handlePrint = () => window.print();

  const activeFilters = useMemo(() => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    if (filterStatus !== 'all') parts.push(`Status: ${filterStatus}`);
    if (filterDecision !== 'all') parts.push(`Decision: ${filterDecision}`);
    return parts.length ? parts.join(' · ') : 'No filters applied';
  }, [search, filterStatus, filterDecision]);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none print:hidden" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in print:hidden">
          <Link to="/plan" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Plan</Link>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Business Cases — Summary</h1>
          <div className="text-xs text-slate-600 mt-1">
            Generated {new Date().toLocaleString()} · {filtered.length} of {items.length} cases · {activeFilters}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Total {counts.total} · Portfolio NPV {fmtMoney(counts.totalNpv)} · Positive {counts.positive} · Negative {counts.negative} · IRR ≥ Hurdle {counts.passingHurdle}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8 print:hidden">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Business Cases</h1>
            <p className="text-slate-500 mt-2 max-w-2xl">
              Build boardroom-ready business cases for AI investments — 3-year DCF (NPV/IRR/ROI/Payback), 8-category risk scorecard, and J-curve benefit ramps. Each case has a unique name and persists to DynamoDB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {source === 'local' && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Offline · localStorage
              </span>
            )}
            <button onClick={refresh} className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all">Refresh</button>
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
            <button onClick={handleCreate}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all hover:-translate-y-0.5 inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Business Case
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 print:hidden">
          <StatCard label="Cases" value={String(counts.total)} accent="from-blue-600 to-indigo-600" />
          <StatCard label="Portfolio NPV" value={fmtMoney(counts.totalNpv)} accent="from-indigo-600 to-violet-600" />
          <StatCard label="Positive NPV" value={String(counts.positive)} accent="from-emerald-500 to-teal-600" />
          <StatCard label="Negative NPV" value={String(counts.negative)} accent="from-red-500 to-pink-600" />
          <StatCard label="IRR ≥ Hurdle" value={String(counts.passingHurdle)} accent="from-violet-500 to-purple-600" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <input type="text" placeholder="Search by name, sponsor, business unit…"
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
              <select className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" value={filterDecision} onChange={(e) => setFilterDecision(e.target.value)}>
                <option value="all">All decisions</option>
                <option value="POSITIVE">Positive NPV</option>
                <option value="BREAKEVEN">Breakeven</option>
                <option value="NEGATIVE">Negative NPV</option>
              </select>
            </div>
            <div className="md:col-span-3 flex items-center gap-2">
              <select className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="npv">Sort: NPV</option>
                <option value="irr">Sort: IRR</option>
                <option value="risk">Sort: Risk</option>
                <option value="updated">Sort: Updated</option>
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
        {loading && <div className="text-sm text-slate-500 py-12 text-center">Loading business cases…</div>}
        {!loading && error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && <EmptyState onCreate={handleCreate} hasItems={items.length > 0} />}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((b) => <BCCard key={b.business_case_id} bc={b} onEdit={() => handleEdit(b)} onDelete={() => handleDeleteClick(b)} />)}
          </div>
        )}
      </div>

      <BusinessCaseDrawer
        open={drawerOpen}
        initial={editing}
        existingNames={existingNames}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Business Case"
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

function BCCard({ bc, onEdit, onDelete }: { bc: BusinessCase; onEdit: () => void; onDelete: () => void }) {
  const fin = bc.computed?.financials;
  const risk = bc.computed?.risk;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden print:break-inside-avoid print:shadow-none print:hover:translate-y-0">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-semibold text-slate-900 truncate flex-1">{bc.name}</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${decisionColor(fin?.npv_decision || '')}`}>
            {fin?.npv_decision?.split(' - ')[0] || '—'}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mb-3">
          {bc.inputs.business_unit || 'No business unit'}
          {bc.inputs.sponsor ? ` · ${bc.inputs.sponsor}` : ''}
          {' · '}<span className="text-slate-600 font-medium">{bc.status}</span>
          {' · '}<span className="text-slate-600 font-medium">{bc.inputs.industry}</span>
        </div>
        {bc.description && <p className="text-xs text-slate-600 line-clamp-2 mb-3">{bc.description}</p>}

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NPV</div>
            <div className="text-lg font-bold tabular-nums text-slate-800">{fmtMoney(fin?.npv ?? 0)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">IRR</div>
            <div className={`text-lg font-bold tabular-nums ${fin?.irr_passes_hurdle ? 'text-emerald-700' : 'text-slate-800'}`}>{fmtPct(fin?.irr ?? null)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payback</div>
            <div className="text-lg font-bold tabular-nums text-slate-800">{fin?.payback_years === null || fin?.payback_years === undefined ? '>3 yrs' : `${fin.payback_years.toFixed(1)} yr`}</div>
          </div>
        </div>

        {/* Secondary metrics + risk */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">ROI</span>
            <span className="font-bold tabular-nums text-slate-700">{fmtPct(fin?.roi ?? null)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">B/C</span>
            <span className="font-bold tabular-nums text-slate-700">{(fin?.benefit_cost_ratio ?? 0).toFixed(2)}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Risk</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskColor(risk?.level || '')}`}>
              {(risk?.composite ?? 0).toFixed(2)} · {(risk?.level || '').split(' ')[0]}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between bg-slate-50/40 print:hidden">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400">Updated {new Date(bc.updated_at).toLocaleDateString()}</span>
          <Link
            to="/govern/compliance"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-blue-600 transition-colors"
            title="View compliance framework status"
          >
            <Icon name="document-check" className="w-3.5 h-3.5" />
            <span>Compliance</span>
          </Link>
        </div>
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1">{hasItems ? 'No matches' : 'No business cases yet'}</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
        {hasItems ? 'Try clearing filters, or create a new business case.' : 'Build your first AI business case. Defaults are pre-populated from the AWS Enterprise model so you can adjust rather than start from scratch.'}
      </p>
      <button onClick={onCreate} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg">
        + New Business Case
      </button>
    </div>
  );
}
