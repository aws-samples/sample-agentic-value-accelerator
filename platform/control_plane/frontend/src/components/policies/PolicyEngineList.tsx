import { useState, useEffect } from 'react';
import { policiesApi } from '../../api/client';

interface PolicyEngine {
  engine_id: string;
  name: string;
  status: string;
  gateway_id: string | null;
  gateway_name: string | null;
  mode: string | null;
  policy_count: number;
  created_at: string;
}

interface Gateway {
  gateway_id: string;
  name: string;
  status: string;
  use_case?: string;
}

interface Props {
  onSelectEngine: (engineId: string, engineName: string) => void;
  onCreateEngine: () => void;
}

export default function PolicyEngineList({ onSelectEngine, onCreateEngine }: Props) {
  const [engines, setEngines] = useState<PolicyEngine[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [attachingEngine, setAttachingEngine] = useState<string | null>(null);
  const [attachingGateway, setAttachingGateway] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [settingMode, setSettingMode] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [enginesData, gatewaysData] = await Promise.all([
        policiesApi.listEngines(),
        policiesApi.listGateways(),
      ]);
      setEngines(enginesData);
      setGateways(gatewaysData);
    } catch {
      // Fallback
      setEngines([{
        engine_id: 'default',
        name: 'FsiAgentKitPolicyEngine',
        status: 'ACTIVE',
        gateway_id: null,
        gateway_name: null,
        mode: null,
        policy_count: 0,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  const handleAttachGateway = async (engineId: string, gatewayId: string) => {
    // A gateway can point to only ONE policy engine. If it's already attached
    // to a different engine, attaching here silently moves it — warn first so
    // the user doesn't accidentally remove enforcement from the other engine.
    const currentOwner = engines.find(e => e.gateway_id === gatewayId && e.engine_id !== engineId);
    if (currentOwner) {
      const gwName = gateways.find(g => g.gateway_id === gatewayId)?.name || gatewayId;
      const ok = window.confirm(
        `"${gwName}" is currently attached to engine "${currentOwner.name}".\n\n` +
        `A gateway can only belong to one policy engine. Attaching it here will ` +
        `remove it from "${currentOwner.name}" — that engine's policies will no longer ` +
        `apply to this gateway.\n\nContinue?`
      );
      if (!ok) return;
    }
    setAttachingGateway(true);
    try {
      await policiesApi.attachGateway(engineId, gatewayId);
      // Optimistic update — attach to this engine AND clear the gateway from any
      // other engine it was on (a gateway belongs to exactly one engine).
      const gw = gateways.find(g => g.gateway_id === gatewayId);
      setEngines(prev => prev.map(e => {
        if (e.engine_id === engineId) {
          return { ...e, gateway_id: gatewayId, gateway_name: gw?.name || gatewayId, mode: 'ENFORCE' };
        }
        if (e.gateway_id === gatewayId) {
          return { ...e, gateway_id: null, gateway_name: null, mode: null };
        }
        return e;
      }));
      setAttachingEngine(null);
      loadData({ silent: true });  // background refresh to reconcile
    } catch (e) {
      console.error('Failed to attach gateway:', e);
    } finally {
      setAttachingGateway(false);
    }
  };

  const handleDetachGateway = async (engineId: string, gatewayId: string) => {
    setDetaching(true);
    try {
      await policiesApi.detachGateway(engineId, gatewayId);
      setEngines(prev => prev.map(e =>
        e.engine_id === engineId
          ? { ...e, gateway_id: null, gateway_name: null, mode: null }
          : e
      ));
      loadData({ silent: true });  // background refresh to reconcile
    } catch (e) {
      console.error('Failed to detach gateway:', e);
    } finally {
      setDetaching(false);
    }
  };

  const handleSetMode = async (engineId: string, gatewayId: string, mode: 'ENFORCE' | 'LOG_ONLY') => {
    setSettingMode(engineId);
    try {
      await policiesApi.setMode(engineId, gatewayId, mode);
      setEngines(prev => prev.map(e =>
        e.engine_id === engineId ? { ...e, mode } : e
      ));
      loadData({ silent: true });  // background refresh to reconcile
    } catch (e) {
      console.error('Failed to set mode:', e);
    } finally {
      setSettingMode(null);
    }
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    CREATING: 'bg-amber-100 text-amber-700',
    FAILED: 'bg-red-100 text-red-700',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading policy engines...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Policy Engines</h2>
          <p className="text-sm text-slate-500 mt-0.5">Create and manage Cedar policy engines — attach them to gateways for any use case</p>
        </div>
        <button onClick={onCreateEngine} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Engine
        </button>
      </div>

      {/* Available Gateways info */}
      {gateways.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Available Gateways ({gateways.length})</p>
          <div className="flex flex-wrap gap-2">
            {gateways.map(gw => (
              <div key={gw.gateway_id} className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-200">
                <div className={`w-2 h-2 rounded-full ${gw.status === 'READY' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-xs font-medium text-slate-700">{gw.name}</span>
                <span className="text-[10px] text-slate-400 font-mono">{gw.gateway_id.slice(-8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engine Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {engines.map((engine) => (
          <div
            key={engine.engine_id}
            className="card hover:border-indigo-200 hover:shadow-lg transition-all group relative overflow-hidden"
          >
            {/* Top accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-400 to-purple-500" />

            <div className="pt-2">
              {/* Engine name + status */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700">{engine.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">{engine.engine_id}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${statusColors[engine.status] || 'bg-slate-100 text-slate-600'}`}>
                  {engine.status}
                </span>
              </div>

              {/* Gateway attachment — 2-step: detach first, then attach new */}
              {engine.gateway_id && attachingEngine !== engine.engine_id ? (
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100 mb-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.344a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-emerald-700 truncate">{engine.gateway_name || engine.gateway_id}</p>
                      <p className="text-[10px] text-emerald-500">Gateway Attached</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDetachGateway(engine.engine_id, engine.gateway_id!); }}
                      disabled={detaching}
                      className="text-[10px] font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      title="Detach gateway from this engine"
                    >
                      {detaching ? 'Detaching...' : 'Detach'}
                    </button>
                  </div>

                  {/* Enforcement mode toggle */}
                  <div className="flex items-center gap-2 pt-2 border-t border-emerald-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Mode</span>
                    <div className="flex gap-1 flex-1">
                      {(['ENFORCE', 'LOG_ONLY'] as const).map((m) => {
                        const active = (engine.mode || 'ENFORCE') === m;
                        return (
                          <button
                            key={m}
                            onClick={(e) => { e.stopPropagation(); if (!active) handleSetMode(engine.engine_id, engine.gateway_id!, m); }}
                            disabled={settingMode === engine.engine_id}
                            className={`flex-1 px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                              active
                                ? m === 'ENFORCE' ? 'bg-red-500 text-white' : 'bg-slate-500 text-white'
                                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                            }`}
                            title={m === 'ENFORCE' ? 'Block violating requests' : 'Log violations only (do not block)'}
                          >
                            {settingMode === engine.engine_id && !active ? '...' : m === 'ENFORCE' ? 'ENFORCE' : 'LOG ONLY'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {(engine.mode || 'ENFORCE') === 'ENFORCE'
                      ? 'Violating requests are blocked at the gateway.'
                      : 'Violations are logged to CloudWatch but not blocked.'}
                  </p>
                </div>
              ) : attachingEngine === engine.engine_id ? (
                /* Gateway selector */
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 mb-3 space-y-2">
                  <p className="text-[10px] font-bold text-indigo-700 uppercase">Select Gateway to Attach</p>
                  {gateways.map(gw => (
                    <button
                      key={gw.gateway_id}
                      onClick={(e) => { e.stopPropagation(); handleAttachGateway(engine.engine_id, gw.gateway_id); }}
                      disabled={attachingGateway}
                      className="w-full flex items-center gap-2 p-2 bg-white rounded-lg border border-indigo-100 hover:border-indigo-300 text-left transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full ${gw.status === 'READY' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700">{gw.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{gw.gateway_id}</p>
                      </div>
                      {attachingGateway && (
                        <svg className="w-4 h-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); setAttachingEngine(null); }}
                    className="text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setAttachingEngine(engine.engine_id); }}
                  className="w-full flex items-center gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100 mb-3 hover:bg-amber-100 transition-colors text-left"
                >
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.344a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                  </svg>
                  <p className="text-[11px] text-amber-700 font-medium">Attach Gateway</p>
                </button>
              )}

              {/* Stats + View Policies button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <span>{engine.policy_count} policies</span>
                  </div>
                  <span className="text-slate-300">·</span>
                  <span>Created {new Date(engine.created_at).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={() => onSelectEngine(engine.engine_id, engine.name)}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  View Policies
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {engines.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No policy engines yet</h3>
          <p className="text-xs text-slate-500 mb-4">Create a policy engine and attach it to a gateway to start enforcing Cedar policies</p>
          <button onClick={onCreateEngine} className="btn-primary text-sm">
            Create Your First Engine
          </button>
        </div>
      )}
    </div>
  );
}
