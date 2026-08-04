import { useEffect, useState } from 'react';
import { llmGatewayApi, type GatewayInstance, type VirtualKeyCreate } from '../../api/llmGateway';

export default function VirtualKeys({ instance }: { instance: GatewayInstance }) {
  const [keys, setKeys] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<VirtualKeyCreate>({ name: '', max_budget: 100, budget_duration: '30d', models: [], tpm_limit: undefined, rpm_limit: undefined });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setKeys(await llmGatewayApi.listVirtualKeys(instance.id));
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // Fetch available models for the selector
    (async () => {
      try {
        const models = await llmGatewayApi.listModels(instance.id);
        setAvailableModels(models.map((m) => m.id || ''));
      } catch {
        // Fall back to instance's configured models
        setAvailableModels(instance.enabled_models);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  const toggleModel = (model: string) => {
    const current = newKey.models || [];
    if (current.includes(model)) {
      setNewKey({ ...newKey, models: current.filter((m) => m !== model) });
    } else {
      setNewKey({ ...newKey, models: [...current, model] });
    }
  };

  const create = async () => {
    setError(null);
    if (!newKey.name) {
      setError('Name is required');
      return;
    }
    try {
      const payload = { ...newKey };
      // Don't send empty models array (means "all models allowed")
      if (!payload.models || payload.models.length === 0) {
        delete payload.models;
      }
      const result = await llmGatewayApi.createVirtualKey(instance.id, payload);
      setIssued((result as { key?: string }).key || JSON.stringify(result));
      setShowCreate(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Virtual keys</h3>
            <p className="text-xs text-slate-500 mt-0.5">One key per agent or team. Set budget, rate limits, and model access per key.</p>
          </div>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            {showCreate ? 'Close' : 'New key'}
          </button>
        </div>

        {showCreate && (
          <div className="space-y-3 bg-slate-50 rounded-xl p-4 mb-4">
            {/* Row 1: Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Key name *</label>
              <input
                placeholder="e.g. fraud-detection-agent"
                value={newKey.name}
                onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            {/* Row 2: Budget + Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Max budget (USD)</label>
                <input
                  type="number"
                  placeholder="100"
                  value={newKey.max_budget ?? ''}
                  onChange={(e) => setNewKey({ ...newKey, max_budget: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Budget resets</label>
                <select
                  value={newKey.budget_duration ?? '30d'}
                  onChange={(e) => setNewKey({ ...newKey, budget_duration: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  <option value="1d">Daily</option>
                  <option value="7d">Weekly</option>
                  <option value="30d">Monthly</option>
                  <option value="90d">Quarterly</option>
                </select>
              </div>
            </div>

            {/* Row 3: Rate limits */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">TPM limit <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="number"
                  placeholder="100000"
                  value={newKey.tpm_limit ?? ''}
                  onChange={(e) => setNewKey({ ...newKey, tpm_limit: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">RPM limit <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="number"
                  placeholder="60"
                  value={newKey.rpm_limit ?? ''}
                  onChange={(e) => setNewKey({ ...newKey, rpm_limit: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
            </div>

            {/* Row 4: Model selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Allowed models <span className="font-normal text-slate-400">(empty = all models)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableModels.map((m) => {
                  const selected = (newKey.models || []).includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleModel(m)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition ${
                        selected
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {m.replace('bedrock/', '').replace('us.anthropic.', '').replace('us.amazon.', '')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={create}
              className="w-full px-3 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
            >
              Generate key
            </button>
          </div>
        )}

        {issued && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700">One-time secret — copy now</div>
            <div className="font-mono text-sm text-amber-900 break-all mt-1">{issued}</div>
          </div>
        )}

        {error && <div className="text-sm text-rose-600 mb-3">{error}</div>}

        {loading ? (
          <div className="text-sm text-slate-500">Loading keys…</div>
        ) : keys.length === 0 ? (
          <div className="text-sm text-slate-500">No virtual keys yet.</div>
        ) : (
          <div className="space-y-1.5">
            {keys.map((k, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                <span className="font-mono text-slate-700">{String(k.key_alias || k.token || 'key-' + i)}</span>
                <span className="text-xs text-slate-500">{String(k.max_budget ?? '∞')} USD · {String(k.spend ?? 0)} spent</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
