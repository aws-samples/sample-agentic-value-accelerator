// Registry-driven create/edit drawer for any catalog entity type. Renders a
// form from the entity's FieldSpec list, supports editable relationships
// (selecting existing entities), and surfaces inline validation errors.

import { useEffect, useMemo, useState } from 'react';
import { catalogStore } from './store';
import { specFor, type CatalogEntity, type CatalogEntityType, type EntityTypeSpec } from './types';

interface Props {
  type: CatalogEntityType;
  entity?: CatalogEntity | null; // present => edit
  onClose: () => void;
  onSaved: (item: CatalogEntity) => void;
}

type RelOptions = Record<string, { id: string; name: string }[]>;

export default function EntityDrawer({ type, entity, onClose, onSaved }: Props) {
  const spec: EntityTypeSpec = specFor(type);
  const isEdit = !!entity;

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [rels, setRels] = useState<Record<string, string[]>>({});
  const [relOptions, setRelOptions] = useState<RelOptions>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editableRels = useMemo(() => spec.relationships.filter((r) => r.editable), [spec]);

  useEffect(() => {
    // Seed the form from the entity being edited (attributes only).
    const initial: Record<string, unknown> = {};
    for (const fld of spec.fields) {
      const v = entity?.[fld.key];
      initial[fld.key] = v ?? (fld.kind === 'boolean' ? false : '');
    }
    setForm(initial);

    // Pre-populate editable relationships from the entity's resolved rels.
    const initRels: Record<string, string[]> = {};
    for (const r of editableRels) {
      const linked = entity?.relationships?.[r.key] ?? [];
      initRels[r.key] = linked.map((l) => l.id);
    }
    setRels(initRels);
  }, [entity, spec, editableRels]);

  useEffect(() => {
    // Load option lists for editable relationships.
    let cancelled = false;
    (async () => {
      const opts: RelOptions = {};
      for (const r of editableRels) {
        const res = await catalogStore.list(r.targetType, { limit: 500 });
        opts[r.key] = res.items.map((i) => ({ id: i.id, name: i.name }));
      }
      if (!cancelled) setRelOptions(opts);
    })();
    return () => { cancelled = true; };
  }, [editableRels]);

  const setField = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const toggleRel = (key: string, id: string) => {
    setRels((prev) => {
      const cur = prev[key] ?? [];
      return { ...prev, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    for (const fld of spec.fields) {
      const v = form[fld.key];
      if (fld.kind === 'boolean') { payload[fld.key] = !!v; continue; }
      if (v === '' || v === null || v === undefined) continue;
      if (fld.kind === 'number') { payload[fld.key] = Number(v); continue; }
      if (fld.kind === 'tags') {
        payload[fld.key] = Array.isArray(v)
          ? v
          : String(v).split(',').map((s) => s.trim()).filter(Boolean);
        continue;
      }
      payload[fld.key] = v;
    }
    const relPayload: Record<string, string[]> = {};
    for (const r of editableRels) {
      if ((rels[r.key] ?? []).length) relPayload[r.key] = rels[r.key];
    }
    if (Object.keys(relPayload).length) payload.relationships = relPayload;
    return payload;
  };

  const handleSave = async () => {
    setError(null);
    const name = String(form.name ?? '').trim();
    if (!name) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = isEdit
        ? await catalogStore.update(type, entity!.id, payload)
        : await catalogStore.create(type, payload);
      onSaved(res.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <span className="text-[9px] font-bold text-indigo-600/80 bg-indigo-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              {isEdit ? 'Edit' : 'New'}
            </span>
            <h3 className="text-lg font-semibold text-slate-900 mt-1">{spec.label}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {spec.fields.map((fld) => (
            <div key={fld.key}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {fld.label}{fld.key === 'name' && <span className="text-red-500"> *</span>}
              </label>
              {fld.kind === 'textarea' ? (
                <textarea
                  value={String(form[fld.key] ?? '')}
                  onChange={(e) => setField(fld.key, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
              ) : fld.kind === 'boolean' ? (
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!form[fld.key]} onChange={(e) => setField(fld.key, e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-200" />
                  <span>{fld.label}</span>
                </label>
              ) : fld.kind === 'tags' ? (
                <input
                  type="text"
                  value={Array.isArray(form[fld.key]) ? (form[fld.key] as string[]).join(', ') : String(form[fld.key] ?? '')}
                  onChange={(e) => setField(fld.key, e.target.value)}
                  placeholder="comma, separated, tags"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
              ) : (
                <input
                  type={fld.kind === 'number' ? 'number' : 'text'}
                  value={String(form[fld.key] ?? '')}
                  onChange={(e) => setField(fld.key, e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
              )}
            </div>
          ))}

          {editableRels.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Relationships</h4>
              {editableRels.map((r) => (
                <div key={r.key} className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{r.label}</label>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {(relOptions[r.key] ?? []).length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400">No {r.label.toLowerCase()} available</div>
                    )}
                    {(relOptions[r.key] ?? []).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(rels[r.key] ?? []).includes(opt.id)}
                          onChange={() => toggleRel(r.key, opt.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
                        />
                        <span className="truncate">{opt.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : `Create ${spec.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
