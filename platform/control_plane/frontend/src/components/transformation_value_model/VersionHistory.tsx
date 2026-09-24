// Version history viewer for a catalog entity: an ordered version list, a
// two-version field-level diff, and a history search (by actor / date / field).

import { useEffect, useMemo, useState } from 'react';
import { catalogStore } from './store';
import type { CatalogEntity, CatalogEntityType, CatalogVersionRecord } from './types';

interface Props {
  type: CatalogEntityType;
  entity: CatalogEntity;
  onClose: () => void;
}

function fmt(ts: string): string {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function VersionHistory({ type, entity, onClose }: Props) {
  const [versions, setVersions] = useState<CatalogVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);

  // History search filters
  const [actor, setActor] = useState('');
  const [field, setField] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await catalogStore.versions(type, entity.id);
      if (!cancelled) {
        setVersions(res.items);
        if (res.items.length >= 2) {
          setFrom(res.items[res.items.length - 2].version_no);
          setTo(res.items[res.items.length - 1].version_no);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [type, entity.id]);

  const filtered = useMemo(() => {
    return versions.filter((v) => {
      if (actor && !v.actor.toLowerCase().includes(actor.toLowerCase())) return false;
      if (field && !(field in (v.changed_fields ?? {}))) return false;
      return true;
    });
  }, [versions, actor, field]);

  const diff = useMemo(() => {
    if (from == null || to == null) return null;
    const a = versions.find((v) => v.version_no === from);
    const b = versions.find((v) => v.version_no === to);
    if (!a || !b) return null;
    const out: Record<string, { from: unknown; to: unknown }> = {};
    const keys = new Set([...Object.keys(a.snapshot), ...Object.keys(b.snapshot)]);
    for (const k of keys) {
      if (['version_no', 'updated_at', 'updated_by'].includes(k)) continue;
      if (JSON.stringify(a.snapshot[k]) !== JSON.stringify(b.snapshot[k])) {
        out[k] = { from: a.snapshot[k], to: b.snapshot[k] };
      }
    }
    return out;
  }, [versions, from, to]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <span className="text-[9px] font-bold text-violet-600/80 bg-violet-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Version History</span>
            <h3 className="text-lg font-semibold text-slate-900 mt-1 truncate max-w-md">{entity.name}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5">
          {/* History search */}
          <div className="flex flex-wrap gap-2 mb-4">
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filter by actor"
              className="flex-1 min-w-[140px] px-3 py-1.5 text-sm rounded-lg border border-slate-200 outline-none focus:border-violet-400" />
            <input value={field} onChange={(e) => setField(e.target.value)} placeholder="Changed field (e.g. name)"
              className="flex-1 min-w-[140px] px-3 py-1.5 text-sm rounded-lg border border-slate-200 outline-none focus:border-violet-400" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-400 py-8 text-center">Loading history…</div>
          ) : (
            <>
              {/* Diff selector */}
              {versions.length >= 2 && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-5">
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-600">
                    <span>Compare</span>
                    <select value={from ?? ''} onChange={(e) => setFrom(Number(e.target.value))}
                      className="px-2 py-1 rounded border border-slate-200 bg-white">
                      {versions.map((v) => <option key={v.version_no} value={v.version_no}>v{v.version_no}</option>)}
                    </select>
                    <span>→</span>
                    <select value={to ?? ''} onChange={(e) => setTo(Number(e.target.value))}
                      className="px-2 py-1 rounded border border-slate-200 bg-white">
                      {versions.map((v) => <option key={v.version_no} value={v.version_no}>v{v.version_no}</option>)}
                    </select>
                  </div>
                  {diff && Object.keys(diff).length === 0 ? (
                    <div className="text-xs text-slate-400">No field differences between these versions.</div>
                  ) : (
                    <div className="space-y-2">
                      {diff && Object.entries(diff).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="font-semibold text-slate-700">{k}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 line-through truncate max-w-[45%]">{String(v.from ?? '∅')}</span>
                            <span className="text-slate-400">→</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 truncate max-w-[45%]">{String(v.to ?? '∅')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Version list */}
              <div className="space-y-2">
                {filtered.length === 0 && (
                  <div className="text-sm text-slate-400 py-6 text-center">No versions match the filters.</div>
                )}
                {filtered.slice().reverse().map((v) => (
                  <div key={v.version_no} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">v{v.version_no}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${v.operation === 'create' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{v.operation}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{fmt(v.changed_at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">by {v.actor}</div>
                    {Object.keys(v.changed_fields ?? {}).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {Object.keys(v.changed_fields).map((f) => (
                          <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
