import { useEffect, useState } from 'react';
import { llmGatewayApi, type GatewayInstance } from '../../api/llmGateway';

export default function GatewayConfig({ instance }: { instance: GatewayInstance }) {
  const [configYaml, setConfigYaml] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await llmGatewayApi.getConfig(instance.id);
        setConfigYaml(data.config_yaml);
        setVersion(data.version);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load config');
      } finally {
        setLoading(false);
      }
    })();
  }, [instance.id]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await llmGatewayApi.updateConfig(instance.id, configYaml);
      setMessage('Config saved. ECS service rolling out new tasks.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500">Loading config…</div>;

  return (
    <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Live config</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            SSM: <span className="font-mono">{instance.config_parameter_name || '—'}</span>
            {version != null && <span className="ml-2 text-slate-400">v{version}</span>}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & roll out'}
        </button>
      </div>

      <textarea
        value={configYaml}
        onChange={(e) => setConfigYaml(e.target.value)}
        className="w-full h-[480px] font-mono text-[12px] p-3 rounded-lg border border-slate-200 bg-slate-50 leading-relaxed"
        spellCheck={false}
      />

      {message && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
    </div>
  );
}
