import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { a2aApi } from './api';

export default function A2aCreate() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [description, setDescription] = useState('');
  const [authHint, setAuthHint] = useState('none');
  const [delegationMode, setDelegationMode] = useState('m2m');
  const [card, setCard] = useState<Record<string, unknown> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const canSubmit = name.trim().length > 0 && endpoint.trim().length > 0 && !submitting;

  const fetchCard = async () => {
    if (!endpoint.trim()) return;
    setFetching(true);
    setErr('');
    setCard(null);
    try {
      const r = await a2aApi.fetchCard(endpoint.trim());
      setCard(r.agent_card);
      // Auto-fill name/description from the card if fields empty
      const c = r.agent_card as Record<string, unknown>;
      if (!name && typeof c.name === 'string') setName(c.name);
      if (!description && typeof c.description === 'string') setDescription(c.description);
    } catch (e) {
      setErr(String(e));
    } finally {
      setFetching(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      await a2aApi.register({
        name: name.trim(),
        endpoint: endpoint.trim(),
        description: description.trim() || undefined,
        auth_hint: authHint,
        delegation_mode: delegationMode,
      });
      nav('/a2a');
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/a2a" className="hover:text-slate-700">A2A Agents</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Register</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1">Register A2A agent</h1>
      <p className="text-sm text-slate-500 mb-6">Peer agent addressable via the Agent-to-Agent protocol.</p>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm space-y-5">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Endpoint</label>
          <div className="flex gap-2">
            <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://agent.example.com"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
            <button onClick={fetchCard} disabled={!endpoint || fetching}
              className="text-xs bg-slate-600 hover:bg-slate-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg font-medium">
              {fetching ? 'Fetching…' : 'Fetch card'}
            </button>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Base URL of the peer agent. AgentCard is fetched from <code className="bg-slate-100 px-1 rounded">/.well-known/agent.json</code>.
          </div>
        </div>

        {card && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">AgentCard preview</div>
            <pre className="text-[11px] font-mono text-slate-700 max-h-40 overflow-auto">
              {JSON.stringify(card, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="research-peer-agent"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Auth</label>
            <select value={authHint} onChange={(e) => setAuthHint(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40">
              <option value="none">None</option>
              <option value="api_key">API Key</option>
              <option value="oauth2">OAuth2</option>
              <option value="bearer">Bearer Token</option>
              <option value="sigv4">AWS SigV4</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Delegation</label>
            <select value={delegationMode} onChange={(e) => setDelegationMode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40">
              <option value="m2m">M2M</option>
              <option value="obo">OBO (on-behalf-of user)</option>
            </select>
          </div>
        </div>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        <div className="flex items-center justify-between border-t border-slate-100 pt-5">
          <Link to="/a2a" className="text-sm text-slate-500 hover:text-slate-800">← Cancel</Link>
          <button onClick={submit} disabled={!canSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg">
            {submitting ? 'Registering…' : 'Register agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
