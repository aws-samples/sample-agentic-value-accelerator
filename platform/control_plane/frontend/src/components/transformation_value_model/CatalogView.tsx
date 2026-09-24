// Reference Catalog browser: entity-type nav, searchable/filterable list with
// selection, and a detail panel. Hosts the create/edit drawer and version
// history. Registry-driven so all nine types share one rendering pipeline.

import { useEffect, useMemo, useState } from 'react';
import { catalogStore } from './store';
import {
  ENTITY_TYPES, specFor, humanize,
  type CatalogEntity, type CatalogEntityType, type Source,
} from './types';
import EntityDetail from './EntityDetail';
import EntityDrawer from './EntityDrawer';
import VersionHistory from './VersionHistory';
import LifecycleBar from './LifecycleBar';
import SeedLibraryDrawer from './SeedLibraryDrawer';
import type { CatalogSeedStatus } from '../../api/client';

type Provenance = 'all' | 'examples' | 'mine';

// FK filter fields whose stored values are entity ids. The dropdown value stays
// the id (the API filters by equality on the id column), but options display the
// referenced entity's name and the filter is labeled with that entity's name.
const FK_FILTER_TYPES: Partial<Record<string, CatalogEntityType>> = {
  industry_id: 'industries',
  industry_segment_id: 'industry-segments',
  domain_id: 'business-domains',
};

export default function CatalogView() {
  const [type, setType] = useState<CatalogEntityType>('use-cases');
  const [items, setItems] = useState<CatalogEntity[]>([]);
  const [source, setSource] = useState<Source>('api');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  // Per-filter-field id -> name maps for FK filters (industry_id, industry_segment_id).
  const [fkNames, setFkNames] = useState<Record<string, Record<string, string>>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit'; entity?: CatalogEntity } | null>(null);
  const [history, setHistory] = useState<CatalogEntity | null>(null);

  // Catalog lifecycle: population status, provenance filter, and the example
  // library drawer for selective reuse.
  const [status, setStatus] = useState<CatalogSeedStatus | null>(null);
  const [provenance, setProvenance] = useState<Provenance>('all');
  const [libraryOpen, setLibraryOpen] = useState(false);

  const spec = specFor(type);
  // Bumped to force a reload after a create/edit without changing filters.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v && v !== 'all')
    );
    (async () => {
      setLoading(true);
      const res = await catalogStore.list(type, { q: search || undefined, filters: activeFilters });
      if (cancelled) return;
      setItems(res.items);
      setSource(res.source);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [type, search, filters, reloadKey]);

  // Load id -> name maps for any FK filter fields on the current entity type so
  // the industry / industry segment dropdowns show names instead of raw ids.
  useEffect(() => {
    const fkFields = spec.filterFields.filter((k) => FK_FILTER_TYPES[k]);
    if (fkFields.length === 0) { setFkNames({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(fkFields.map(async (key) => {
        const refType = FK_FILTER_TYPES[key]!;
        const res = await catalogStore.list(refType, { limit: 500 });
        const map: Record<string, string> = {};
        for (const it of res.items) map[it.id] = String(it.name ?? it.id);
        return [key, map] as const;
      }));
      if (cancelled) return;
      setFkNames(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [type, spec.filterFields]);

  // Refresh the catalog population status (mode + provenance counts) alongside
  // any list reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await catalogStore.seedStatus();
      if (!cancelled) setStatus(s);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // Selection-clearing reload after a delete or a catalog-wide data change.
  const handleDataChanged = () => {
    setSelectedId(null);
    reload();
  };

  const handleDeleted = (id: string) => {
    if (selectedId === id) setSelectedId(null);
    reload();
  };

  // Reset per-type state when switching entity types.
  const switchType = (t: CatalogEntityType) => {
    setType(t);
    setSelectedId(null);
    setSearch('');
    setFilters({});
  };

  // Distinct filter values derived from the current result set (attribute filters).
  const filterValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const key of spec.filterFields) {
      const vals = new Set<string>();
      for (const it of items) {
        const v = it[key];
        if (v !== null && v !== undefined && v !== '') vals.add(String(v));
      }
      out[key] = Array.from(vals).sort();
    }
    return out;
  }, [items, spec.filterFields]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  // Provenance filter (source_ref present = shipped example, absent = user data).
  const visibleItems = useMemo(() => {
    if (provenance === 'examples') return items.filter((i) => i.source_ref);
    if (provenance === 'mine') return items.filter((i) => !i.source_ref);
    return items;
  }, [items, provenance]);

  const handleNavigate = (t: CatalogEntityType, id: string) => {
    if (t !== type) {
      setType(t);
      setSearch('');
      setFilters({});
    }
    setSelectedId(id);
  };

  const handleSaved = (item: CatalogEntity) => {
    setDrawer(null);
    setSelectedId(item.id);
    reload();
  };

  return (
    <div>
      <LifecycleBar
        status={status}
        onOpenLibrary={() => setLibraryOpen(true)}
        onChanged={handleDataChanged}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5">
      {/* Entity-type nav */}
      <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
        {ENTITY_TYPES.map((e) => (
          <button
            key={e.type}
            onClick={() => switchType(e.type)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              type === e.type
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span aria-hidden>{e.icon}</span>
            <span>{e.labelPlural}</span>
          </button>
        ))}
      </nav>

      {/* List + detail */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5">
        {/* List column */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">{spec.labelPlural}</h2>
            <div className="flex items-center gap-2">
              {source === 'local' && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Offline</span>
              )}
              <button
                onClick={() => setDrawer({ mode: 'create' })}
                className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-md inline-flex items-center gap-1"
              >
                + New
              </button>
            </div>
          </div>

          {/* Search + filters */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${spec.labelPlural.toLowerCase()}…`}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none mb-2"
          />
          {/* Provenance filter: shipped examples vs user-created */}
          <div className="flex items-center gap-1 mb-2">
            {(['all', 'examples', 'mine'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvenance(p)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                  provenance === p
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {p === 'all' ? 'All' : p === 'examples' ? 'Examples' : 'Mine'}
              </button>
            ))}
          </div>
          {spec.filterFields.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {spec.filterFields.map((key) => (
                (filterValues[key]?.length ?? 0) > 0 && (
                  <select
                    key={key}
                    value={filters[key] ?? 'all'}
                    onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                    className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-600"
                  >
                    <option value="all">{FK_FILTER_TYPES[key] ? specFor(FK_FILTER_TYPES[key]!).label : humanize(key)}: all</option>
                    {filterValues[key].map((v) => (
                      <option key={v} value={v}>{fkNames[key]?.[v] ?? v}</option>
                    ))}
                  </select>
                )
              ))}
            </div>
          )}

          {/* List */}
          <div className="space-y-1.5 max-h-[calc(100vh-20rem)] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>
            ) : visibleItems.length === 0 ? (
              <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-xl">
                No {spec.labelPlural.toLowerCase()} match your search.
              </div>
            ) : (
              visibleItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setSelectedId(it.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    selectedId === it.id
                      ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200'
                      : 'border-slate-200 bg-white hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-800 truncate">{it.name}</span>
                    {it.source_ref && (
                      <span className="flex-shrink-0 text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded uppercase tracking-wider">Ex</span>
                    )}
                  </div>
                  {typeof it.description === 'string' && it.description && (
                    <div className="text-xs text-slate-400 truncate mt-0.5">{it.description}</div>
                  )}
                </button>
              ))
            )}
          </div>
          {!loading && visibleItems.length > 0 && (
            <div className="text-[11px] text-slate-400 mt-2">{visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'}</div>
          )}
        </div>

        {/* Detail column */}
        <div className="bg-slate-50/60 rounded-2xl border border-slate-200 min-h-[400px]">
          {selected ? (
            <EntityDetail
              key={`${type}:${selected.id}`}
              type={type}
              entityId={selected.id}
              onNavigate={handleNavigate}
              onEdit={(e) => setDrawer({ mode: 'edit', entity: e })}
              onHistory={(e) => setHistory(e)}
              onDeleted={handleDeleted}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-8">
              <span className="text-4xl mb-3" aria-hidden>{spec.icon}</span>
              <p className="text-slate-500 text-sm max-w-xs">Select a {spec.label.toLowerCase()} to view its attributes, relationships, and version history.</p>
            </div>
          )}
        </div>
      </div>

      {drawer && (
        <EntityDrawer
          type={type}
          entity={drawer.mode === 'edit' ? drawer.entity : null}
          onClose={() => setDrawer(null)}
          onSaved={handleSaved}
        />
      )}
      {history && (
        <VersionHistory type={type} entity={history} onClose={() => setHistory(null)} />
      )}
      </div>

      {libraryOpen && (
        <SeedLibraryDrawer
          initialType={type}
          onClose={() => setLibraryOpen(false)}
          onImported={() => { setLibraryOpen(false); handleDataChanged(); }}
        />
      )}
    </div>
  );
}
