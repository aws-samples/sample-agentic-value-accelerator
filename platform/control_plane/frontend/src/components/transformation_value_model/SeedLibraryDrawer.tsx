// Example Library — browse the shipped seed and selectively import records.
// Backed by GET /catalog/seed/library (reads seed.json, not the DB) and
// POST /catalog/seed/import with a chosen set of source_refs. Required FK-parents
// are pulled in automatically (include_dependencies), so picking a use case also
// brings its domain/segment/industry chain.

import { useEffect, useState } from 'react';
import { catalogStore } from './store';
import { ENTITY_TYPES, specFor, type CatalogEntityType } from './types';
import type { CatalogLibrary } from '../../api/client';

interface Props {
  initialType: CatalogEntityType;
  onClose: () => void;
  onImported: () => void;
}

export default function SeedLibraryDrawer({ initialType, onClose, onImported }: Props) {
  const [library, setLibrary] = useState<CatalogLibrary>({});
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<CatalogEntityType>(initialType);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLibrary = async () => {
    setLibrary(await catalogStore.seedLibrary());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const lib = await catalogStore.seedLibrary();
      if (!cancelled) { setLibrary(lib); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const items = library[type] ?? [];
  const availableTypes = ENTITY_TYPES.filter((e) => (library[e.type]?.length ?? 0) > 0);

  const toggle = (ref: string | null) => {
    if (!ref) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  };

  const runImport = async (body: { source_refs?: string[] }) => {
    setBusy(true);
    setNotice(null);
    try {
      const report = await catalogStore.importSeed({ ...body, include_dependencies: true });
      setNotice(`Imported ${report.total_entities} record${report.total_entities === 1 ? '' : 's'}` +
        (report.total_relationships ? ` and ${report.total_relationships} link(s).` : '.'));
      setSelected(new Set());
      await loadLibrary();
      onImported();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              Example Library
            </span>
            <h3 className="text-lg font-semibold text-slate-900 mt-1">Reuse shipped examples</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-slate-500">
            Pick the examples you want. Records they depend on (parent industry,
            segment, domain) are imported automatically. Already-imported rows are
            marked and safely skipped.
          </p>

          {notice && (
            <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</div>
          )}

          {loading ? (
            <div className="text-sm text-slate-400 py-8 text-center">Loading library…</div>
          ) : availableTypes.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-xl">
              No shipped examples are available.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Type</label>
                <select
                  value={type}
                  onChange={(e) => { setType(e.target.value as CatalogEntityType); }}
                  className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
                >
                  {availableTypes.map((e) => (
                    <option key={e.type} value={e.type}>
                      {e.labelPlural} ({library[e.type]?.length ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[calc(100vh-22rem)] overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-400">No examples for {specFor(type).labelPlural.toLowerCase()}.</div>
                )}
                {items.map((it) => (
                  <label key={it.source_ref ?? it.name}
                    className="flex items-start gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={it.source_ref ? selected.has(it.source_ref) : false}
                      onChange={() => toggle(it.source_ref)}
                      disabled={!it.source_ref}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium truncate">{it.name}</span>
                        {it.imported && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">Imported</span>
                        )}
                      </span>
                      {it.description && (
                        <span className="block text-xs text-slate-400 truncate">{it.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {!loading && availableTypes.length > 0 && (
          <div className="sticky bottom-0 bg-white/90 backdrop-blur border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-2">
            <button
              onClick={() => runImport({})}
              disabled={busy}
              className="px-3 py-2 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
            >
              Import all examples
            </button>
            <button
              onClick={() => runImport({ source_refs: [...selected] })}
              disabled={busy || selected.size === 0}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-md disabled:opacity-50"
            >
              {busy ? 'Importing…' : `Import selected (${selected.size})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
