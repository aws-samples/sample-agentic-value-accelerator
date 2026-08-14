import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { memoryApi, type StrategyDef } from './api';

// AgentCore memory name uses the same shape as harness: [a-zA-Z][a-zA-Z0-9_]{0,39}
const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

/**
 * Memory create / edit wizard.
 *
 * Edit mode is triggered by the /memory/:memoryId/edit route. AgentCore
 * UpdateMemory only accepts `description` and `eventExpiryDuration` — name
 * and strategies are fixed at create time (adding/removing strategies uses
 * dedicated Add/Modify/Delete calls that we don't wire in v1). In edit
 * mode we lock the immutable fields and disable the strategy checkboxes,
 * so users see the full config but can only save the mutable pieces.
 */
interface MemoryCreateProps {
  editMode?: boolean;
}

export default function MemoryCreate({ editMode = false }: MemoryCreateProps) {
  const nav = useNavigate();
  const { memoryId: routeMemoryId = '' } = useParams<{ memoryId?: string }>();
  const isEdit = editMode && !!routeMemoryId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expiry, setExpiry] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set(['SEMANTIC', 'SUMMARIZATION']));
  const [strategies, setStrategies] = useState<StrategyDef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState<boolean>(isEdit);
  const [err, setErr] = useState('');

  useEffect(() => {
    memoryApi.strategies().then((r) => setStrategies(r.strategies || [])).catch(() => setStrategies([]));
  }, []);

  // Prefill when editing.
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    memoryApi
      .get(routeMemoryId)
      .then((m) => {
        if (cancelled) return;
        setName(m.name || routeMemoryId);
        setDescription(m.description || '');
        if (typeof m.event_expiry_duration === 'number') setExpiry(m.event_expiry_duration);
        if (Array.isArray(m.strategies) && m.strategies.length > 0) setSelected(new Set(m.strategies));
      })
      .catch((e) => {
        if (!cancelled) setErr(`Failed to load memory for editing: ${String(e)}`);
      })
      .finally(() => {
        if (!cancelled) setPrefillLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, routeMemoryId]);

  const toggle = (id: string) => {
    if (isEdit) return; // strategies locked in edit mode
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const nameError = (() => {
    if (isEdit) return '';
    const n = name.trim();
    if (!n) return '';
    if (n.length > 40) return 'Name must be 40 characters or fewer.';
    if (!/^[a-zA-Z]/.test(n)) return 'Name must start with a letter.';
    if (!/^[a-zA-Z0-9_]+$/.test(n)) return 'Only letters, digits, and underscores (_) are allowed.';
    return '';
  })();
  const canSubmit = isEdit
    ? !submitting
    : NAME_REGEX.test(name.trim()) && selected.size > 0 && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      if (isEdit) {
        await memoryApi.update(routeMemoryId, {
          description: description.trim() || undefined,
          event_expiry_duration: expiry,
        });
      } else {
        await memoryApi.create({
          name: name.trim(),
          description: description.trim() || undefined,
          event_expiry_duration: expiry,
          strategies: Array.from(selected),
        });
      }
      nav('/memory');
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (prefillLoading) {
    return (
      <div className="relative z-10 max-w-3xl mx-auto px-6 py-8 text-sm text-slate-400 text-center">
        Loading memory…
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/memory" className="hover:text-slate-700">Memory</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">{isEdit ? 'Edit' : 'Create'}</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1">
        {isEdit ? `Edit memory · ${name || routeMemoryId}` : 'Create memory'}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {isEdit
          ? 'AgentCore only allows updating description and event retention. Name and strategies are fixed at create time.'
          : 'Persistent memory for agents — attach to any Harness or custom agent.'}
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm space-y-6">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
            Name
            {isEdit && (
              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                Immutable
              </span>
            )}
          </label>
          <input
            value={name}
            onChange={(e) => !isEdit && setName(e.target.value)}
            readOnly={isEdit}
            placeholder="researchAgentMemory"
            title={isEdit ? 'AgentCore does not allow renaming a memory. Delete and recreate to change the name.' : undefined}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              nameError ? 'border-red-300 focus:ring-red-400/40' :
              isEdit ? 'border-slate-200 bg-slate-50 text-slate-600 cursor-not-allowed' :
              'border-slate-300 focus:ring-indigo-400/40'
            }`}
          />
          {!isEdit && (
            <div className="text-[11px] text-slate-500 mt-1">
              Must start with a letter. Letters, digits, and underscores only. Max 40 characters.
            </div>
          )}
          {nameError && (
            <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1">
              {nameError}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Long-term memory for the research assistant."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-2">
            Strategies
            {isEdit && (
              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                Immutable
              </span>
            )}
          </label>
          <div className="space-y-2">
            {strategies.map((s) => {
              const on = selected.has(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isEdit
                      ? 'border-slate-200 bg-slate-50/60 cursor-not-allowed'
                      : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                  }`}
                  title={isEdit ? 'AgentCore locks the strategy set at create time.' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={isEdit}
                    onChange={() => toggle(s.id)}
                    className="mt-0.5 w-4 h-4 accent-indigo-600 disabled:opacity-60"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${isEdit && !on ? 'text-slate-400' : 'text-slate-800'}`}>
                      {s.label}
                    </div>
                    <div className={`text-[11px] ${isEdit && !on ? 'text-slate-400' : 'text-slate-500'}`}>
                      {s.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          {!isEdit && selected.size === 0 && (
            <div className="text-[11px] text-amber-700 mt-1">Select at least one strategy.</div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Event retention (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={expiry}
            onChange={(e) => setExpiry(Math.max(1, Math.min(365, parseInt(e.target.value || '30', 10))))}
            className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          />
          <div className="text-[11px] text-slate-500 mt-1">How long short-term events are retained. Default 30 days.</div>
        </div>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-5">
          <Link to="/memory" className="text-sm text-slate-500 hover:text-slate-800">← Cancel</Link>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg"
          >
            {submitting
              ? isEdit ? 'Saving…' : 'Creating…'
              : isEdit ? 'Save changes' : 'Create memory'}
          </button>
        </div>
      </div>
    </div>
  );
}
