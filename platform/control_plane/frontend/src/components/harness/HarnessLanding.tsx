import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { harnessApi, type HarnessSummary } from './api';

// Delete is destructive — AgentCore CANNOT recover a harness once deleted.
// Users get a native confirm() prompt with the harness name spelled out so
// they can't nuke the wrong one from muscle memory. The row swaps to a
// spinning indicator while the DELETE is in flight, then the parent list
// reloads to drop the row (or surface CREATE_FAILED / delete errors).

/**
 * Bedrock AgentCore Harness catalog.
 *
 * v1 surfaces: hero + Quick Start card + a grid of existing harnesses. Detail
 * pages own the Test / Versions / Configure tabs.
 */
export default function HarnessLanding() {
  const [rows, setRows] = useState<HarnessSummary[]>([]);
  const [warning, setWarning] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  // Track which harness is currently mid-DELETE so its row can show a
  // spinner and the button can't be clicked twice.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = () =>
    harnessApi
      .list()
      .then((r) => {
        setRows(r.harnesses || []);
        if (r.warning) setWarning(r.warning);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      harnessApi
        .list()
        .then((r) => {
          if (cancelled) return;
          setRows(r.harnesses || []);
          if (r.warning) setWarning(r.warning);
        })
        .catch((e) => {
          if (!cancelled) setErr(String(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    // Poll every 10s so a freshly-created harness transitions from CREATING
    // to READY without the user reloading. Cheap — one boto3 list call.
    const interval = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleDelete = async (h: HarnessSummary) => {
    // Native confirm() is intentional — this is destructive and we want the
    // OS-level prompt so users can't dismiss it by clicking outside a modal.
    const ok = window.confirm(
      `Delete harness "${h.harness_name}"?\n\n` +
        `This permanently removes the harness, all versions, and its default endpoint. ` +
        `Any FSI apps that call this harness will start failing.\n\n` +
        `This action cannot be undone.`,
    );
    if (!ok) return;
    setErr('');
    setDeletingId(h.harness_id);
    try {
      await harnessApi.remove(h.harness_id);
      // Optimistically drop the row so the UI feels instant; the next poll
      // will confirm it's gone (or show CREATE_FAILED if AgentCore rejected).
      setRows((prev) => prev.filter((r) => r.harness_id !== h.harness_id));
      // Fire an immediate reload so anything transitioning (DELETING → gone)
      // shows up quickly.
      reload();
    } catch (e) {
      setErr(`Failed to delete ${h.harness_name}: ${String(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      {/* Hero */}
      <div
        className="rounded-2xl p-8 mb-8 text-white shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 50%, #db2777 100%)',
        }}
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Build · Harness
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-400/25 px-2 py-0.5 rounded-full">
                GA
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">
              Bedrock AgentCore Harness
            </h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Managed agent-loop-as-a-service. Declare model, tools, skills, and memory as
              configuration — AWS runs the orchestration loop in an isolated microVM with
              filesystem, shell, observability, and versioning built in. No infrastructure
              to run.
            </p>
          </div>
          <Link
            to="/harness/create"
            className="inline-flex items-center gap-2 bg-white text-indigo-700 hover:bg-white/95 px-5 py-2.5 rounded-lg font-medium text-sm shadow-md shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Harness
          </Link>
        </div>
      </div>

      {/* Quick Start card + capability chips */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <QuickTile
          title="Quick Start"
          body="Pick a model, add a system prompt, one-click deploy. Sensible defaults for guardrails, memory, and observability."
          cta="Create harness"
          to="/harness/create"
        />
        <CapTile
          title="Tools & Skills"
          items={['Browser', 'Code Interpreter', 'MCP servers', 'AgentCore Gateway']}
        />
        <CapTile
          title="Built-in"
          items={['Managed memory', 'Guardrails', 'Session isolation', 'Versioning + endpoints']}
        />
      </div>

      {/* Catalog */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Your harnesses</h2>
        <div className="text-xs text-slate-500">Region: us-east-1</div>
      </div>

      {loading && (
        <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {warning && !err && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 mb-3">
          {warning}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm mb-4">
            No harnesses yet. Create your first one to get started.
          </div>
          <Link
            to="/harness/create"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium text-sm"
          >
            Create harness
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
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Model</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Tools</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-16">Version</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Updated</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <HarnessRow
                    key={h.harness_id || h.harness_arn}
                    h={h}
                    onDelete={handleDelete}
                    deleting={deletingId === h.harness_id}
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

function QuickTile({ title, body, cta, to }: { title: string; body: string; cta: string; to: string }) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 hover:bg-white transition-all p-5 shadow-sm hover:shadow-md min-h-[132px] flex flex-col"
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600/80 mb-1">
        {title}
      </div>
      <div className="text-sm text-slate-700 leading-relaxed flex-1">{body}</div>
      <div className="text-xs font-medium text-indigo-700 mt-3 group-hover:translate-x-1 transition-transform">
        {cta} →
      </div>
    </Link>
  );
}

function CapTile({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 min-h-[132px]">
      <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600/80 mb-2">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span key={i} className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

function HarnessRow({
  h,
  onDelete,
  deleting,
}: {
  h: HarnessSummary;
  onDelete: (h: HarnessSummary) => void;
  deleting: boolean;
}) {
  const statusColor =
    h.status === 'READY' ? 'text-emerald-700 bg-emerald-50'
      : h.status === 'CREATING' || h.status === 'UPDATING' ? 'text-amber-700 bg-amber-50'
      : h.status === 'DELETING' ? 'text-slate-600 bg-slate-100'
      : h.status === 'CREATE_FAILED' || h.status === 'UPDATE_FAILED' ? 'text-red-700 bg-red-50'
      : 'text-slate-700 bg-slate-100';
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 transition-colors">
      <td className="px-4 py-2.5 font-medium">
        <Link to={`/harness/${h.harness_id}`} className="text-indigo-700 hover:underline">
          {h.harness_name}
        </Link>
      </td>
      <td className="px-4 py-2.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${statusColor}`}>
          {h.status || 'unknown'}
        </span>
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 truncate max-w-xs">
        {h.model_id || 'default'}
      </td>
      <td className="px-4 py-2.5">
        {h.tools?.length ? (
          <div className="flex flex-wrap gap-1">
            {h.tools.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                {t}
              </span>
            ))}
            {h.tools.length > 3 && (
              <span className="text-[10px] text-slate-400">+{h.tools.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">v{h.version || '—'}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{(h.updated_at || '').replace('T', ' ').slice(0, 19) || '—'}</td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex items-center gap-2 justify-end">
          <Link
            to={`/harness/${h.harness_id}/edit`}
            className="text-xs text-indigo-700 hover:underline"
            title="Edit harness — creates a new immutable version"
          >
            Edit
          </Link>
          <span className="text-slate-200">·</span>
          <button
            onClick={() => onDelete(h)}
            disabled={deleting}
            className="text-xs text-red-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
            title="Permanently delete this harness and all versions"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}
