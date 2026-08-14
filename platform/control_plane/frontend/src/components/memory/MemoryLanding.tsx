import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { memoryApi, type MemorySummary } from './api';

export default function MemoryLanding() {
  const [rows, setRows] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [warning, setWarning] = useState('');
  // Row-scoped delete busy state — the row shows a spinner + disabled
  // button while the DELETE is in flight. Only one at a time is
  // supported (native confirm() blocks the event loop anyway).
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    memoryApi
      .list()
      .then((r) => {
        setRows(r.memories || []);
        if (r.warning) setWarning(r.warning);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (m: MemorySummary) => {
    const ok = window.confirm(
      `Delete memory "${m.name || m.memory_id}"?\n\n` +
        `This permanently removes the memory instance and every event / summary stored in it. ` +
        `Any harness or agent that references this memory will start returning empty context on invoke.\n\n` +
        `This action cannot be undone.`,
    );
    if (!ok) return;
    setErr('');
    setDeletingId(m.memory_id);
    try {
      await memoryApi.remove(m.memory_id);
      // Optimistic UI drop — the next `load()` confirms the server side
      // caught up.
      setRows((prev) => prev.filter((r) => r.memory_id !== m.memory_id));
      load();
    } catch (e) {
      setErr(`Failed to delete ${m.name || m.memory_id}: ${String(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      {/* Hero */}
      <div
        className="rounded-2xl p-8 mb-8 text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 50%, #db2777 100%)' }}
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Build · Memory
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Memory</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              AgentCore Memory instances agents use to remember what happened across sessions. Pick a
              strategy set — semantic, summarization, user preference, episodic — and attach the memory
              to any Harness or custom agent.
            </p>
          </div>
          <Link
            to="/memory/create"
            className="inline-flex items-center gap-2 bg-white text-indigo-700 hover:bg-white/95 px-5 py-2.5 rounded-lg font-medium text-sm shadow-md shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create memory
          </Link>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      {warning && !err && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 mb-3">{warning}</div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm mb-4">No memory instances yet.</div>
          <Link to="/memory/create" className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium text-sm">
            Create your first memory
          </Link>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Name</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Status</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Strategies</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Retention</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Updated</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-16">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <MemoryRow
                    key={m.memory_id}
                    m={m}
                    onDelete={handleDelete}
                    deleting={deletingId === m.memory_id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryRow({
  m, onDelete, deleting,
}: {
  m: MemorySummary;
  onDelete: (m: MemorySummary) => void;
  deleting: boolean;
}) {
  const statusColor =
    m.status === 'ACTIVE' || m.status === 'READY' ? 'text-emerald-700 bg-emerald-50'
      : m.status?.includes('CREAT') || m.status?.includes('UPDAT') ? 'text-amber-700 bg-amber-50'
      : m.status?.includes('FAIL') ? 'text-red-700 bg-red-50'
      : 'text-slate-700 bg-slate-100';
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 transition-colors">
      <td className="px-4 py-2.5 font-medium">
        <div className="text-slate-800 truncate">
          {m.name || <span className="font-mono text-xs text-slate-500">{m.memory_id}</span>}
        </div>
        {m.description && (
          <div className="text-[11px] text-slate-500 truncate max-w-md">{m.description}</div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${statusColor}`}>
          {m.status || 'unknown'}
        </span>
      </td>
      <td className="px-4 py-2.5">
        {m.strategies?.length ? (
          <div className="flex flex-wrap gap-1">
            {m.strategies.slice(0, 3).map((s) => (
              <span key={s} className="text-[10px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                {s}
              </span>
            ))}
            {m.strategies.length > 3 && (
              <span className="text-[10px] text-slate-400">+{m.strategies.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-600">
        {m.event_expiry_duration ? `${m.event_expiry_duration}d` : '—'}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">
        {(m.updated_at || '').replace('T', ' ').slice(0, 19) || '—'}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex items-center gap-2 justify-end">
          <Link
            to={`/memory/${m.memory_id}/edit`}
            className="text-xs text-indigo-700 hover:underline"
            title="Edit memory — description and event retention only (AgentCore limitation)"
          >
            Edit
          </Link>
          <span className="text-slate-200">·</span>
          <button
            onClick={() => onDelete(m)}
            disabled={deleting}
            className="text-xs text-red-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
            title="Permanently delete this memory instance and all stored events"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}
