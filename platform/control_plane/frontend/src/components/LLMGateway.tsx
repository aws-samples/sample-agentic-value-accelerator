import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { llmGatewayApi, type GatewayInstance } from '../api/llmGateway';
import { deploymentsApi } from '../api/client';
import { openFsiApp, withAvaToken } from '../lib/fsiAppLink';

// Cross-region inference profile IDs (us.*) — AWS auto-routes across
// us-east-1/us-east-2/us-west-2 for higher throughput + automatic failover.
// Strongly preferred over bare model IDs for production gateways.
//
// Claude haiku-4-5 listed first because it's the FSI Foundry foundations
// default — adding it here ensures Foundry use cases routed through the
// gateway resolve their model by name.
const DEFAULT_MODELS = [
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  'us.anthropic.claude-3-opus-20240229-v1:0',
  'us.amazon.nova-pro-v1:0',
  'us.amazon.nova-lite-v1:0',
];

// Full-replacement page: shows the LiteLLM admin UI (served at
// <cloudfront>/ui) inside an iframe, gated by the AVA SSO CloudFront
// Function. Mirrors Observability.tsx's Langfuse embed. The custom
// TypeScript tabs (Overview, Config, Models, Virtual Keys, Spend, Audit,
// Playground) were retired — LiteLLM's own admin UI covers all of that.

export default function LLMGateway(_props?: { initialTab?: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [instance, setInstance] = useState<GatewayInstance | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [iframeError, setIframeError] = useState(false);
  // Admin UI URL with AVA SSO handoff token appended. Null until minted
  // (or when auth isn't configured → falls back to the raw admin_ui_url).
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  // Deploy form state — restored from the historical GatewayOverview.tsx
  // (git b7f1362a rewrote LLMGateway.tsx into an iframe-only page and
  // dropped this form; ported back so the empty state can actually kick
  // off a deploy without dropping to CLI).
  const [showForm, setShowForm] = useState(false);
  const [masterKey, setMasterKey] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [guardrailId, setGuardrailId] = useState('');
  const [langfuseHost, setLangfuseHost] = useState('');
  const [models, setModels] = useState<string[]>(DEFAULT_MODELS);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const instances = await llmGatewayApi.listInstances();
        const active = instances.find((i) => i.status === 'deployed' && i.admin_ui_url) || instances[0] || null;
        setInstance(active);
      } catch {
        setInstance(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleModel = (m: string) =>
    setModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const generateKey = async () => {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = `sk-${hex}`;
    setMasterKey(key);
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      /* clipboard write not permitted — fine, the field is populated */
    }
  };

  const handleDeploy = async () => {
    if (!masterKey) {
      setDeployError('Master key is required');
      return;
    }
    setDeployError(null);
    setDeploying(true);
    try {
      const parameters: Record<string, unknown> = {
        project_name: 'llm-gateway',
        aws_region: region,
        environment: 'dev',
        master_key: masterKey,
        litellm_version: 'main-stable',
        enabled_models: models,
      };
      if (guardrailId) {
        parameters.attach_guardrail_id = guardrailId;
        parameters.attach_guardrail_version = 'DRAFT';
      }
      if (langfuseHost) parameters.langfuse_host = langfuseHost;

      const created = await deploymentsApi.create({
        deployment_name: 'llm-gateway',
        template_id: 'llm-gateway',
        iac_type: 'terraform',
        aws_region: region,
        parameters,
      });
      navigate(`/deployments/${created.deployment_id}`);
    } catch (err) {
      const anyErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setDeployError(anyErr?.response?.data?.detail || anyErr?.message || 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  };

  // Mint the AVA handoff token and append it as ?ava_token=... so the
  // CloudFront Function accepts the iframe load and drops the LiteLLM
  // session cookie. Falls back to the raw URL when auth is disabled.
  //
  // The trailing slash on /ui/ matters: LiteLLM's /ui handler emits a 307
  // to http://<domain>/ui/ (missing the trailing slash and downgrading
  // scheme because the ALB-→-ECS hop is HTTP). CloudFront then 301s the
  // HTTP URL back to HTTPS. That HTTP intermediate step trips mixed-
  // content blocking inside HTTPS iframes and leaves the frame blank.
  // Requesting /ui/ directly skips the whole redirect chain.
  useEffect(() => {
    const raw = instance?.admin_ui_url;
    if (!raw) { setIframeUrl(null); return; }
    const url = raw.endsWith('/') ? raw : raw + '/';
    let cancelled = false;
    withAvaToken(url).then((withToken) => {
      if (!cancelled) setIframeUrl(withToken ?? url);
    }).catch(() => {
      if (!cancelled) setIframeUrl(url);
    });
    return () => { cancelled = true; };
  }, [instance?.admin_ui_url]);

  // Reachability probe — if the CloudFront distribution is down or the ECS
  // service isn't up yet, don't render the iframe (it would just show a
  // spinner forever).
  useEffect(() => {
    const url = instance?.admin_ui_url;
    if (!url) { setServerReachable(null); return; }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    (async () => {
      try {
        await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
        if (!cancelled) setServerReachable(true);
      } catch {
        if (!cancelled) setServerReachable(false);
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [instance?.admin_ui_url]);

  const hasServer = !!instance?.admin_ui_url && serverReachable !== false;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-6 animate-fade-in">
          <Link to="/secure" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            &larr; Back to Secure
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">LLM Gateway</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            One chokepoint for every model call. LiteLLM proxy on ECS Fargate — virtual keys, budgets,
            Bedrock Guardrails, and full audit on every request.
          </p>
        </div>

        {loading ? (
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
              <p className="text-sm text-slate-500">Checking for LLM Gateway deployment…</p>
            </div>
          </div>
        ) : hasServer && instance?.admin_ui_url ? (
          <>
            {/* Deployment status card + Open-in-new-tab */}
            <div className="card border-slate-200 bg-slate-50/40 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-900">{instance.name || 'LLM Gateway'}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Active
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 truncate">{instance.admin_ui_url}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span>Region: {instance.region}</span>
                      <span>Env: {instance.environment}</span>
                    </div>
                  </div>
                </div>
                <a
                  href={instance.admin_ui_url}
                  onClick={(e) => {
                    e.preventDefault();
                    const raw = instance.admin_ui_url;
                    openFsiApp(raw.endsWith('/') ? raw : raw + '/');
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  Open in New Tab
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Embedded LiteLLM admin UI. Do NOT set iframe src until
                iframeUrl (with the ?ava_token=... handoff) is ready — the
                CF SSO gate 302s any request without a valid ava_session to
                the AVA login URL, and the browser follows the redirect
                inside the iframe, ending up displaying the AVA UI's own
                bootstrap HTML instead of the admin console. */}
            {!iframeError ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height: 'calc(100vh - 20rem)' }}>
                {iframeUrl ? (
                  <iframe
                    src={iframeUrl}
                    className="w-full h-full border-0"
                    title="LLM Gateway Admin UI"
                    onError={() => setIframeError(true)}
                    onLoad={(e) => {
                      try {
                        const iframe = e.target as HTMLIFrameElement;
                        if (iframe.contentWindow?.location.href === 'about:blank') {
                          setIframeError(true);
                        }
                      } catch {
                        // Cross-origin access denied = iframe loaded successfully
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                      Signing in to LLM Gateway…
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card border-amber-200 bg-amber-50/30">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-amber-900">Unable to embed the LLM Gateway admin UI</p>
                    <p className="text-sm text-amber-700/80 mt-1">
                      Use the "Open in New Tab" button above to access it directly.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card border-slate-200 bg-slate-50/50">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 mb-1">No LLM Gateway Detected</h3>
                <p className="text-sm text-slate-500">
                  Deploy LiteLLM in front of Bedrock so every agent request flows through one chokepoint — virtual keys,
                  budgets, guardrails, and audit. One gateway per account/region.
                </p>

                {!showForm ? (
                  <button
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Deploy Gateway
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : (
                  <div className="mt-4 p-4 bg-white border border-slate-200 rounded-xl max-w-xl space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Master key *</label>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={masterKey}
                          onChange={(e) => setMasterKey(e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                          placeholder="sk-…"
                        />
                        <button
                          type="button"
                          onClick={generateKey}
                          className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                          title="Generate strong random key + copy to clipboard"
                        >
                          Generate
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Stored in Secrets Manager. Save it now — never echoed back.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">AWS Region</label>
                      <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="us-east-1">us-east-1</option>
                        <option value="us-west-2">us-west-2</option>
                        <option value="eu-west-1">eu-west-1</option>
                        <option value="ap-southeast-1">ap-southeast-1</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Attach Bedrock Guardrail <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        value={guardrailId}
                        onChange={(e) => setGuardrailId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                        placeholder="g-… (leave empty to skip)"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Attach Langfuse host <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        value={langfuseHost}
                        onChange={(e) => setLangfuseHost(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                        placeholder="https://… (from Foundation Stack)"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Enabled models</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_MODELS.map((m) => {
                          const on = models.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => toggleModel(m)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition ${
                                on
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {m.replace('anthropic.', '').replace('amazon.', '')}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {deployError && <p className="text-xs text-red-600">{deployError}</p>}

                    <div className="flex gap-2 pt-1">
                      <button
                        disabled={deploying || !masterKey}
                        onClick={handleDeploy}
                        className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                      >
                        {deploying ? 'Submitting…' : 'Deploy Gateway'}
                      </button>
                      <button
                        onClick={() => { setShowForm(false); setDeployError(null); }}
                        className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
