import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mcpApi } from './api';

export default function McpCreate() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [authHint, setAuthHint] = useState('none');
  const [delegationMode, setDelegationMode] = useState('m2m');
  const [headerName, setHeaderName] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const canSubmit = name.trim().length > 0 && url.trim().length > 0 && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      await mcpApi.register({
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        auth_hint: authHint,
        delegation_mode: delegationMode,
        header_name: headerName.trim() || undefined,
        header_value: headerValue.trim() || undefined,
      });
      nav('/mcp');
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/mcp" className="hover:text-slate-700">MCP Servers</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Register</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1">Register MCP server</h1>
      <p className="text-sm text-slate-500 mb-6">Custom MCP endpoint. Registered servers appear in the Harness Create picker.</p>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm space-y-5">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-mcp-server"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
        </Field>

        <Field label="MCP endpoint URL" hint="The full URL the agent will POST JSON-RPC requests to.">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
        </Field>

        <Field label="Description (optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Auth">
            <select value={authHint} onChange={(e) => setAuthHint(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40">
              <option value="none">None</option>
              <option value="api_key">API Key</option>
              <option value="oauth2">OAuth2</option>
              <option value="bearer">Bearer Token</option>
              <option value="sigv4">AWS SigV4</option>
            </select>
          </Field>
          <Field label="Delegation">
            <select value={delegationMode} onChange={(e) => setDelegationMode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40">
              <option value="m2m">M2M (service credentials)</option>
              <option value="obo">OBO (on-behalf-of user)</option>
            </select>
          </Field>
        </div>

        {(authHint === 'api_key' || authHint === 'bearer') && (
          <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <Field label="Header name">
              <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder={authHint === 'bearer' ? 'Authorization' : 'x-api-key'}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
            </Field>
            <Field label="Header value">
              <input value={headerValue} onChange={(e) => setHeaderValue(e.target.value)} placeholder="sk-…"
                type="password"
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/40" />
            </Field>
          </div>
        )}

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        <div className="flex items-center justify-between border-t border-slate-100 pt-5">
          <Link to="/mcp" className="text-sm text-slate-500 hover:text-slate-800">← Cancel</Link>
          <button onClick={submit} disabled={!canSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg">
            {submitting ? 'Registering…' : 'Register server'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 mb-1 block">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
