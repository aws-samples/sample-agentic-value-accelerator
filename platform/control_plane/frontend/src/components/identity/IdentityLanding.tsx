import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { identityApi, type IdentityProvider, type ProviderTypeDef, type SystemProvider } from './api';

const PROVIDER_TYPE_TONE: Record<string, string> = {
  cognito:      'text-emerald-700 bg-emerald-50',
  entra_id:     'text-blue-700 bg-blue-50',
  okta:         'text-indigo-700 bg-indigo-50',
  auth0:        'text-orange-700 bg-orange-50',
  generic_oidc: 'text-slate-700 bg-slate-100',
};

type Mode =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; provider: IdentityProvider }
  | { kind: 'view-system'; provider: SystemProvider };

export default function IdentityLanding() {
  const [providers, setProviders] = useState<IdentityProvider[]>([]);
  const [types, setTypes] = useState<ProviderTypeDef[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [system, setSystem] = useState<SystemProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'none' });

  const load = () => {
    setLoading(true);
    Promise.allSettled([identityApi.list(), identityApi.reference(), identityApi.system()])
      .then(([providersRes, refRes, systemRes]) => {
        if (providersRes.status === 'fulfilled') setProviders(providersRes.value.providers || []);
        if (refRes.status === 'fulfilled') {
          setTypes(refRes.value.provider_types || []);
          setRoles(refRes.value.ava_roles || []);
        }
        if (systemRes.status === 'fulfilled') setSystem(systemRes.value);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => setMode({ kind: 'create' });
  const openEdit = (p: IdentityProvider) => setMode({ kind: 'edit', provider: p });
  const openSystem = () => system && setMode({ kind: 'view-system', provider: system });
  const closeDrawer = () => setMode({ kind: 'none' });

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/secure" className="hover:text-slate-700">Secure</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Identity</span>
      </div>

      {/* Hero */}
      <div className="rounded-2xl p-8 mb-6 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 60%, #0891b2 100%)' }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full inline-block mb-3">
              Secure · Identity
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Identity Providers</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Federate external identity providers into AVA. Register Microsoft Entra ID, Okta, Auth0, or any
              generic OIDC provider — then map their group claims to AVA roles so sign-in and authorization
              use your enterprise IdP without a Cognito rebuild.
            </p>
          </div>
          {mode.kind === 'none' && (
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 bg-white text-emerald-700 hover:bg-white/95 px-5 py-2.5 rounded-lg font-medium text-sm shadow-md shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Register provider
            </button>
          )}
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}

      {/* Drawer / editor pane */}
      {mode.kind === 'create' && (
        <ProviderForm
          types={types}
          roles={roles}
          onCancel={closeDrawer}
          onSaved={() => { closeDrawer(); load(); }}
          setErr={setErr}
        />
      )}
      {mode.kind === 'edit' && (
        <ProviderForm
          types={types}
          roles={roles}
          initial={mode.provider}
          onCancel={closeDrawer}
          onSaved={() => { closeDrawer(); load(); }}
          setErr={setErr}
        />
      )}
      {mode.kind === 'view-system' && (
        <SystemDetails provider={mode.provider} types={types} onClose={closeDrawer} />
      )}

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {!loading && providers.length === 0 && !system && mode.kind === 'none' && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm mb-4">No identity providers registered yet.</div>
          <button onClick={openCreate} className="text-xs bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg font-medium">
            Register your first provider
          </button>
        </div>
      )}

      {!loading && (system || providers.length > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Name</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Type</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Discovery URL</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Client</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Mappings</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Updated</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {system && (
                <tr className="border-b border-slate-100 bg-emerald-50/30">
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <span>{system.name}</span>
                      <span
                        className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                        title="Primary sign-in for AVA. Managed by Terraform — read-only in the UI."
                      >
                        System
                      </span>
                    </div>
                    {system.description && (
                      <div className="text-[11px] text-slate-500 mt-0.5 max-w-md">{system.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider text-emerald-700 bg-emerald-50">
                      Cognito
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600 truncate max-w-xs">
                    {system.discovery_url || <span className="text-slate-400 italic">unconfigured</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    Public (PKCE)
                    {system.mfa_configuration && system.mfa_configuration !== 'OFF' && (
                      <span className="ml-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        MFA: {system.mfa_configuration}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {Object.keys(system.claim_mappings || {}).length}
                    {system.groups && system.groups.length > 0 && (
                      <span className="text-slate-400"> / {system.groups.length} group(s)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 italic">managed by TF</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={openSystem}
                      className="text-xs text-emerald-700 hover:underline"
                      title="View Cognito details (read-only — managed by Terraform)"
                    >
                      View
                    </button>
                  </td>
                </tr>
              )}
              {providers.map((p) => {
                const tone = PROVIDER_TYPE_TONE[p.provider_type] || 'text-slate-700 bg-slate-100';
                const typeLabel = types.find((t) => t.id === p.provider_type)?.label || p.provider_type;
                return (
                  <tr key={p.provider_id} className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${tone}`}>{typeLabel}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 truncate max-w-xs">{p.discovery_url}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {p.is_confidential ? 'Confidential' : 'Public (PKCE)'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{Object.keys(p.claim_mappings || {}).length}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{(p.updated_at || '').replace('T', ' ').slice(0, 19)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-xs text-emerald-700 hover:underline"
                        title="Edit provider"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Form ────────────────────────────────────────────────────────────────
// Handles both Create and Edit. When `initial` is supplied, provider_type
// is locked and the submit calls PATCH. Discovery test works in both modes.

function ProviderForm({
  types, roles, initial, onCancel, onSaved, setErr,
}: {
  types: ProviderTypeDef[];
  roles: string[];
  initial?: IdentityProvider;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (v: string) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [ptype, setPtype] = useState(initial?.provider_type || 'entra_id');
  const [discoveryUrl, setDiscoveryUrl] = useState(initial?.discovery_url || '');
  const [clientId, setClientId] = useState(initial?.client_id || '');
  const [clientSecret, setClientSecret] = useState('');
  const [isConfidential, setIsConfidential] = useState(initial?.is_confidential || false);
  const [groupClaim, setGroupClaim] = useState(initial?.group_claim || 'groups');
  const [mappings, setMappings] = useState<Array<{ claim: string; role: string }>>(
    initial && Object.keys(initial.claim_mappings || {}).length > 0
      ? Object.entries(initial.claim_mappings).map(([claim, role]) => ({ claim, role }))
      : [{ claim: '', role: 'VIEWER' }]
  );
  const [description, setDescription] = useState(initial?.description || '');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isEdit) return;
    const t = types.find((x) => x.id === ptype);
    if (t) setGroupClaim(t.group_claim);
  }, [ptype, types, isEdit]);

  const test = async () => {
    if (!discoveryUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await identityApi.testDiscovery(discoveryUrl);
      setTestResult({ ok: r.ok, msg: `Verified issuer: ${(r.discovery.issuer as string) || r.resolved_url}` });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      const claim_mappings: Record<string, string> = {};
      for (const m of mappings) {
        if (m.claim.trim()) claim_mappings[m.claim.trim()] = m.role;
      }
      if (isEdit && initial) {
        await identityApi.update(initial.provider_id, {
          name: name.trim(),
          discovery_url: discoveryUrl.trim(),
          client_id: clientId.trim(),
          // Only send a new secret if the user typed one. Blank means keep existing.
          ...(isConfidential && clientSecret ? { client_secret: clientSecret } : {}),
          is_confidential: isConfidential,
          group_claim: groupClaim,
          claim_mappings,
          description: description.trim(),
        });
      } else {
        await identityApi.register({
          name: name.trim(),
          provider_type: ptype,
          discovery_url: discoveryUrl.trim(),
          client_id: clientId.trim(),
          client_secret: isConfidential && clientSecret ? clientSecret : undefined,
          is_confidential: isConfidential,
          group_claim: groupClaim,
          claim_mappings,
          description: description.trim() || undefined,
        });
      }
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = name.trim().length > 0 && discoveryUrl.trim().length > 0 && clientId.trim().length > 0 && !submitting;
  const hintFor = types.find((t) => t.id === ptype)?.hint || '';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm space-y-5 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {isEdit ? `Edit provider · ${initial?.name}` : 'Register identity provider'}
        </h2>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={isEdit ? 'Provider (immutable)' : 'Provider'}>
          <select
            value={ptype}
            onChange={(e) => !isEdit && setPtype(e.target.value)}
            disabled={isEdit}
            title={isEdit ? 'Provider type is fixed after registration.' : undefined}
            className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${
              isEdit ? 'bg-slate-50 text-slate-600 cursor-not-allowed border-slate-200' : 'border-slate-300'
            }`}
          >
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Display name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Corporate SSO"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
        </Field>
      </div>

      <Field label="Discovery URL (issuer)" hint={hintFor ? `Format: ${hintFor}` : undefined}>
        <div className="flex gap-2">
          <input value={discoveryUrl} onChange={(e) => setDiscoveryUrl(e.target.value)} placeholder={hintFor}
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
          <button onClick={test} disabled={!discoveryUrl || testing}
            className="text-xs bg-slate-600 hover:bg-slate-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg font-medium">
            {testing ? 'Testing…' : 'Test discovery'}
          </button>
        </div>
        {testResult && (
          <div className={`mt-1 text-[11px] rounded px-2 py-1 border ${testResult.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
            {testResult.msg}
          </div>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Client ID">
          <input value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
        </Field>
        <Field label="Client type">
          <select value={isConfidential ? 'confidential' : 'public'} onChange={(e) => setIsConfidential(e.target.value === 'confidential')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40">
            <option value="public">Public (PKCE)</option>
            <option value="confidential">Confidential (with secret)</option>
          </select>
        </Field>
      </div>

      {isConfidential && (
        <Field
          label={isEdit ? 'Client secret (leave blank to keep existing)' : 'Client secret'}
          hint="v1 stores in DDB; production should use Secrets Manager."
        >
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
            placeholder={isEdit ? '••••••••' : ''}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
        </Field>
      )}

      <Field label="Group claim" hint="Name of the OIDC claim that carries the user's group membership.">
        <input value={groupClaim} onChange={(e) => setGroupClaim(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
      </Field>

      <div>
        <div className="text-xs font-semibold text-slate-700 mb-2">Claim → AVA role mappings</div>
        <div className="space-y-2">
          {mappings.map((m, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input value={m.claim} onChange={(e) => setMappings((prev) => prev.map((x, i) => i === idx ? { ...x, claim: e.target.value } : x))}
                placeholder="IdP group value (e.g. admins)"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
              <span className="text-slate-400 text-sm">→</span>
              <select value={m.role} onChange={(e) => setMappings((prev) => prev.map((x, i) => i === idx ? { ...x, role: e.target.value } : x))}
                className="w-56 border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40">
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {mappings.length > 1 && (
                <button onClick={() => setMappings((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 text-sm">✕</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setMappings((prev) => [...prev, { claim: '', role: 'VIEWER' }])}
          className="text-xs text-emerald-700 hover:underline mt-2">+ add mapping</button>
      </div>

      <Field label="Description (optional)">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
      </Field>

      <div className="flex items-center justify-end border-t border-slate-100 pt-4">
        <button onClick={submit} disabled={!canSubmit}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg">
          {submitting
            ? (isEdit ? 'Saving…' : 'Registering…')
            : (isEdit ? 'Save changes' : 'Register provider')}
        </button>
      </div>
    </div>
  );
}

// ─── System (Cognito) details — READ-ONLY ─────────────────────────────────

function SystemDetails({
  provider, types, onClose,
}: {
  provider: SystemProvider;
  types: ProviderTypeDef[];
  onClose: () => void;
}) {
  void types;
  const rows: Array<[string, React.ReactNode]> = [
    ['Provider', 'Amazon Cognito'],
    ['Region', provider.region || '—'],
    ['User pool ID', provider.pool_id || '—'],
    ['Hosted UI domain', provider.hosted_ui_domain
      ? <a href={`https://${provider.hosted_ui_domain}/login`} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">{provider.hosted_ui_domain}</a>
      : '—'],
    ['MFA configuration', provider.mfa_configuration || 'OFF'],
    ['Estimated users', typeof provider.estimated_users === 'number' ? provider.estimated_users.toLocaleString() : '—'],
    ['Groups', provider.groups && provider.groups.length > 0 ? provider.groups.join(', ') : '—'],
    ['Discovery URL', provider.discovery_url || '—'],
    ['Client ID', provider.client_id || '—'],
    ['Group claim', provider.group_claim || 'cognito:groups'],
  ];

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm space-y-5 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{provider.name}</h2>
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              System · Read-only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Primary sign-in for AVA. Managed by Terraform — edit the <code className="bg-slate-100 px-1 rounded">cognito</code> module in <code className="bg-slate-100 px-1 rounded">platform/control_plane/infrastructure</code> and re-apply to change these values.
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800">Close</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start gap-3 border-b border-emerald-100/60 py-1.5 last:border-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[10rem]">{label}</div>
            <div className="text-sm text-slate-800 break-all">{value}</div>
          </div>
        ))}
      </div>

      {provider.claim_mappings && Object.keys(provider.claim_mappings).length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Cognito group → AVA role
          </div>
          <div className="rounded-lg border border-emerald-100/60 divide-y divide-emerald-100/60 bg-white/70 overflow-hidden">
            {Object.entries(provider.claim_mappings).map(([g, r]) => (
              <div key={g} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs text-slate-600 flex-1">{g}</span>
                <span className="text-slate-300">→</span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {r}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
