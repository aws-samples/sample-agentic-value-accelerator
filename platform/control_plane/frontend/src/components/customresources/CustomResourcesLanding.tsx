import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { customResourcesApi, type CustomResource, type CustomResourceCreate } from './api';

// Registry → Custom Resources landing. Lists all `recordType=CUSTOM`
// records in the AVA registry (the escape hatch for anything not modeled
// by MCP / A2A / AGENT / SKILL). Deployed applications are NOT here —
// they publish as AGENT records with tag Kind=agent + Source=foundry-deploy
// and surface under Registry → Agents.

const STATUS_TONE: Record<string, string> = {
  active:     'text-emerald-700 bg-emerald-50',
  pending:    'text-amber-700 bg-amber-50',
  rejected:   'text-red-700 bg-red-50',
  deprecated: 'text-slate-500 bg-slate-100 line-through',
  failed:     'text-red-700 bg-red-50',
  unknown:    'text-slate-500 bg-slate-100',
};

export default function CustomResourcesLanding() {
  const [rows, setRows] = useState<CustomResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    customResourcesApi
      .list()
      .then((r) => setRows(r.resources || []))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const del = async (r: CustomResource) => {
    if (!window.confirm(`Deprecate Custom Resource "${r.name}"?\n\nThe record is soft-deleted (kept in the registry as DEPRECATED for audit).`))
      return;
    setDeletingId(r.resource_id);
    setErr('');
    try {
      await customResourcesApi.remove(r.resource_id);
      setRows((prev) => prev.filter((x) => x.resource_id !== r.resource_id));
      load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const submit = async (payload: CustomResourceCreate) => {
    setSubmitting(true);
    setErr('');
    try {
      await customResourcesApi.register(payload);
      setShowForm(false);
      load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/registry" className="hover:text-slate-700">Registry</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Custom Resources</span>
      </div>

      <div className="rounded-2xl p-8 mb-6 text-white shadow-lg bg-gradient-to-br from-rose-500 to-pink-600">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Build · Registry · Custom Resources
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                AWS Agent Registry · CUSTOM
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Custom Resources</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              The escape hatch. Register anything worth cataloging that doesn't fit the four typed shapes —
              knowledge bases, prompt libraries, eval harnesses, agent-invokable Lambdas. Free-form metadata,
              same approval flow as typed records.
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-white text-rose-700 hover:bg-white/95 px-5 py-2.5 rounded-lg font-medium text-sm shadow-md shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Register custom resource
            </button>
          )}
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}

      {showForm && (
        <CustomResourceForm
          onCancel={() => setShowForm(false)}
          onSubmit={submit}
          submitting={submitting}
        />
      )}

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {!loading && rows.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm mb-4">No custom resources registered yet.</div>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs bg-rose-600 text-white hover:bg-rose-700 px-3 py-1.5 rounded-lg font-medium"
          >
            Register your first custom resource
          </button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Name</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Kind</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Tags</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Status</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Updated</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.resource_id} className="border-b border-slate-100 last:border-0 hover:bg-rose-50/40 transition-colors">
                  <td className="px-4 py-2.5 font-medium">
                    <div className="text-slate-800 truncate">{r.name}</div>
                    {r.description && <div className="text-[11px] text-slate-500 truncate max-w-md">{r.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{r.kind}</td>
                  <td className="px-4 py-2.5">
                    {r.tags?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                        {r.tags.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{r.tags.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_TONE[r.status] || STATUS_TONE.unknown}`}>
                      {r.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{(r.updated_at || '').replace('T', ' ').slice(0, 19) || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => del(r)}
                      disabled={deletingId === r.resource_id}
                      className="text-xs text-red-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                      title="Deprecate this Custom Resource"
                    >
                      {deletingId === r.resource_id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomResourceForm({
  onCancel,
  onSubmit,
  submitting,
}: {
  onCancel: () => void;
  onSubmit: (payload: CustomResourceCreate) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('generic');
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');

  const canSubmit = name.trim().length > 0 && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    onSubmit({
      name: name.trim(),
      kind: kind.trim() || 'generic',
      description: description.trim() || undefined,
      tags,
    });
  };

  return (
    <div className="rounded-2xl border border-rose-200 bg-white/90 shadow-sm p-6 mb-4">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">New custom resource</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AVA · KYC Rules KB"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Kind</label>
          <input
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="e.g. knowledge-base, prompt-lib, eval-suite"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tags (comma-separated)</label>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="e.g. kyc, sanctions, aml"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="text-sm bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-medium"
        >
          {submitting ? 'Registering…' : 'Register'}
        </button>
        <button onClick={onCancel} className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
