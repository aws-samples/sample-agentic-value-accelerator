import { useEffect, useState } from 'react';
import { llmGatewayApi, type GatewayInstance } from '../../api/llmGateway';

export default function Playground({ instance }: { instance: GatewayInstance }) {
  const [models, setModels] = useState<string[]>(instance.enabled_models);
  const [model, setModel] = useState(instance.enabled_models[0] || '');
  const [virtualKey, setVirtualKey] = useState('');
  const [prompt, setPrompt] = useState('Summarize the role of an LLM gateway in three bullets.');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch live model list from gateway — these are the model_name aliases LiteLLM expects
  useEffect(() => {
    (async () => {
      try {
        const liveModels = await llmGatewayApi.listModels(instance.id);
        if (liveModels.length > 0) {
          const names = liveModels.map((m) => m.id);
          setModels(names);
          if (!names.includes(model)) {
            setModel(names[0]);
          }
        }
      } catch {
        // Fall back to instance.enabled_models
      }
    })();
  }, [instance.id]);

  const run = async () => {
    setError(null);
    setLoading(true);
    setResponse('');
    try {
      const data = await llmGatewayApi.playground(instance.id, {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        virtual_key: virtualKey || undefined,
      });
      const text = data?.choices?.[0]?.message?.content;
      setResponse(typeof text === 'string' ? text : JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'response' in e) {
        const axiosErr = e as { response?: { data?: { detail?: string } } };
        setError(axiosErr.response?.data?.detail || 'Request failed');
      } else {
        setError(e instanceof Error ? e.message : 'Request failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5 space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">Send a test request</h3>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Model</label>
        <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono bg-white">
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Virtual key <span className="font-normal normal-case">(uses master key if empty)</span></label>
        <input
          type="password"
          value={virtualKey}
          onChange={(e) => setVirtualKey(e.target.value)}
          placeholder="sk-…"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
        />

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full h-32 p-3 rounded-lg border border-slate-200 text-sm"
        />

        <button
          onClick={run}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
        >
          {loading ? 'Calling gateway…' : 'Send'}
        </button>
        {error && <div className="text-sm text-rose-600">{error}</div>}
      </div>

      <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Response</h3>
        <pre className="whitespace-pre-wrap text-sm font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 min-h-[260px]">
          {response || '— no response yet —'}
        </pre>
      </div>
    </div>
  );
}
