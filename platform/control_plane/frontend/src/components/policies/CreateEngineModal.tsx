import { useState, useEffect } from 'react';
import { policiesApi } from '../../api/client';

interface Gateway {
  gateway_id: string;
  name: string;
  status: string;
  use_case?: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateEngineModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [selectedGateway, setSelectedGateway] = useState('');
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGateways, setLoadingGateways] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGateways();
  }, []);

  const loadGateways = async () => {
    setLoadingGateways(true);
    try {
      const data = await policiesApi.listGateways();
      setGateways(data);
    } catch {
      // Fallback with known gateway
      setGateways([{
        gateway_id: 'fsi-agent-kit-gateway-XXXXXXXXXX',
        name: 'fsi-agent-kit-gateway',
        status: 'ACTIVE',
        use_case: 'Main Gateway',
      }]);
    } finally {
      setLoadingGateways(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please provide an engine name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await policiesApi.createEngine({ name, gateway_id: selectedGateway || undefined });
      onCreated();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to create policy engine');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Create Policy Engine</h2>
              <p className="text-xs text-slate-500">A Cedar policy engine evaluates authorization decisions for a gateway</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          {/* Name */}
          <div>
            <label className="label">Engine Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., ProductionPolicyEngine"
              className="input-field"
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1">Only A-Z, a-z, 0-9, and underscores. Max 48 characters.</p>
          </div>

          {/* Gateway selection */}
          <div>
            <label className="label">Attach to Gateway (optional)</label>
            {loadingGateways ? (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <svg className="w-4 h-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-slate-500">Loading gateways...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {gateways.map((gw) => (
                  <button
                    key={gw.gateway_id}
                    onClick={() => setSelectedGateway(selectedGateway === gw.gateway_id ? '' : gw.gateway_id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      selectedGateway === gw.gateway_id
                        ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedGateway === gw.gateway_id ? 'bg-indigo-100' : 'bg-slate-100'
                    }`}>
                      <svg className={`w-4 h-4 ${selectedGateway === gw.gateway_id ? 'text-indigo-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{gw.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{gw.gateway_id}</p>
                    </div>
                    {gw.use_case && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full">{gw.use_case}</span>
                    )}
                    {selectedGateway === gw.gateway_id && (
                      <svg className="w-5 h-5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
                {gateways.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No gateways found. Create a use case first to provision a gateway.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </span>
            ) : 'Create Engine'}
          </button>
        </div>
      </div>
    </div>
  );
}
