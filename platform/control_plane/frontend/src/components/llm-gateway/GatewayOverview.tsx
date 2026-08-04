import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { llmGatewayApi, type GatewayInstance } from '../../api/llmGateway';
import { deploymentsApi } from '../../api/client';

interface Props {
  onSelect: (instance: GatewayInstance) => void;
}

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

/**
 * LLM Gateway is a shared platform service (like Langfuse) — one instance per
 * account/region. So the deploy UX matches the Langfuse "Deploy" panel:
 * compact inline form, only the things the user must decide. Everything else
 * (project name, environment, image tag, VPC reuse, etc.) uses Terraform
 * defaults set in the template module.
 */
export default function GatewayOverview({ onSelect }: Props) {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<GatewayInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ deployed: boolean; status: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [masterKey, setMasterKey] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [guardrailId, setGuardrailId] = useState('');
  const [langfuseHost, setLangfuseHost] = useState('');
  const [models, setModels] = useState<string[]>(DEFAULT_MODELS);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [list, h] = await Promise.all([llmGatewayApi.listInstances(), llmGatewayApi.health()]);
        setInstances(list);
        setHealth(h);
      } catch {
        setInstances([]);
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
    setMasterKey(`sk-${hex}`);
    try {
      await navigator.clipboard.writeText(`sk-${hex}`);
    } catch {
      /* noop */
    }
  };

  const deploy = async () => {
    if (!masterKey) {
      setError('Master key is required');
      return;
    }
    setDeploying(true);
    setError(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading gateway state…</div>;
  }

  if (instances.length === 0) {
    return (
      <div className="card border-slate-200 bg-slate-50/50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <div className="flex-1">
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

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    disabled={deploying || !masterKey}
                    onClick={deploy}
                    className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                  >
                    {deploying ? 'Submitting…' : 'Deploy Gateway'}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setError(null); }}
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
    );
  }

  return (
    <div className="space-y-4">
      {health && (
        <div className="flex items-center gap-3 bg-white/85 rounded-xl border border-slate-200/70 px-4 py-2.5 text-sm">
          <span className={`w-2 h-2 rounded-full ${health.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-slate-700">Gateway health: <span className="font-medium">{health.status}</span></span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {instances.map((inst, idx) => (
          <button
            key={inst.id}
            onClick={() => onSelect(inst)}
            className={`text-left bg-white/95 rounded-2xl border p-5 hover:border-indigo-300 hover:shadow-md transition ${
              idx === 0 ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200/70'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{inst.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{inst.environment} · {inst.region}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                {inst.status}
              </span>
            </div>
            <div className="mt-4 space-y-1.5 text-xs text-slate-600">
              <div><span className="text-slate-400">Endpoint:</span> <span className="font-mono">{inst.endpoint || '—'}</span></div>
              <div><span className="text-slate-400">Models:</span> {inst.enabled_models.length} enabled</div>
              <div><span className="text-slate-400">Guardrail:</span> {inst.attached_guardrail_id || 'none'}</div>
              <div><span className="text-slate-400">Langfuse:</span> {inst.langfuse_attached ? 'attached' : 'not attached'}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Hint banner */}
      <div className="mt-4 flex items-center gap-3 bg-indigo-50/80 rounded-xl border border-indigo-100 px-4 py-3 text-sm text-indigo-700">
        <svg className="w-5 h-5 flex-shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <span>Select a gateway above to manage models, virtual keys, spend, and audit.</span>
      </div>
    </div>
  );
}
