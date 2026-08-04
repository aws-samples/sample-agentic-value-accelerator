import { useEffect, useState } from 'react';
import { llmGatewayApi, type GatewayInstance } from '../../api/llmGateway';

export default function ModelCatalog({ instance }: { instance: GatewayInstance }) {
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setModels(await llmGatewayApi.listModels(instance.id));
      } catch {
        setModels([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [instance.id]);

  if (loading) return <div className="text-sm text-slate-500">Loading models…</div>;

  return (
    <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Models exposed by this gateway</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Live from <span className="font-mono">/v1/models</span> — OpenAI-compatible discovery.
          </p>
        </div>
        <span className="text-xs text-slate-500">{models.length} models</span>
      </div>

      {models.length === 0 ? (
        <p className="text-sm text-slate-500">No models reachable. Check the deployment status.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {models.map((m) => (
            <div key={m.id} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700">
              {m.id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
