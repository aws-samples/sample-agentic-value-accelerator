import { useState, useEffect } from 'react';
import { policiesApi } from '../../api/client';
import type { PolicyRecord } from '../../api/client';

interface Props {
  engineId: string;
  engineName: string;
  onCreatePolicy: () => void;
  onBack: () => void;
}

// Mirrors backend rules_to_cedar — generates the Cedar statement from rules
function generateCedar(policy: PolicyRecord): string {
  const enforcing = policy.rules.filter(r => r.action === 'enforce');
  if (enforcing.length === 0) {
    return 'permit(principal, action, resource is AgentCore::Gateway);';
  }
  const conditions = enforcing.map((rule) => {
    const field = rule.target;
    if (rule.type === 'deny') {
      if (rule.value) return `context has ${field} && context.${field} like "*${rule.value}*"`;
      return `context has tool_name && context.tool_name == "${field}"`;
    }
    if (rule.type === 'require') return `!(context has ${field}) || context.${field} == false`;
    return `context has ${field}`;
  });
  const combined = conditions.map(c => `(${c})`).join('\n    || ');
  return `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n    ${combined}\n};`;
}

function ruleSummary(rule: PolicyRecord['rules'][0]): string {
  const verb = rule.type === 'deny' ? 'Deny' : 'Require';
  const target = rule.target.replace(/_/g, ' ');
  if (rule.value) return `${verb} when ${target} matches "${rule.value}"`;
  return `${verb} tool "${rule.target}"`;
}

export default function PolicyListForEngine({ engineId, engineName, onCreatePolicy, onBack }: Props) {
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadPolicies();
  }, [engineId]);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await policiesApi.list(undefined, undefined, engineId);
      setPolicies(data);
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (policyId: string) => {
    if (!confirm('Delete this policy? It will be removed from the AgentCore engine.')) return;
    setDeleting(policyId);
    try {
      await policiesApi.delete(policyId);
      setPolicies(policies.filter(p => p.policy_id !== policyId));
    } catch (e) {
      console.error('Failed to delete policy', e);
    } finally {
      setDeleting(null);
    }
  };

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    draft: 'bg-amber-100 text-amber-700',
    disabled: 'bg-slate-100 text-slate-600',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading policies...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-slate-900">Policies</h2>
          </div>
          <p className="text-sm text-slate-500">
            Engine: <span className="font-mono text-indigo-600">{engineName}</span> · {policies.length} Cedar policies deployed
          </p>
        </div>
        <button onClick={onCreatePolicy} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Policy
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <p className="text-2xl font-bold text-slate-900">{policies.length}</p>
          <p className="text-[11px] text-slate-500 uppercase font-medium">Total Policies</p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <p className="text-2xl font-bold text-emerald-600">{policies.filter(p => p.status === 'active').length}</p>
          <p className="text-[11px] text-slate-500 uppercase font-medium">Active</p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <p className="text-2xl font-bold text-red-600">{policies.reduce((sum, p) => sum + p.blocking_rules, 0)}</p>
          <p className="text-[11px] text-slate-500 uppercase font-medium">Enforce Rules</p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <p className="text-2xl font-bold text-slate-600">{policies.reduce((sum, p) => sum + p.triggered_count, 0)}</p>
          <p className="text-[11px] text-slate-500 uppercase font-medium">Total Triggers</p>
        </div>
      </div>

      {/* Policy list */}
      {policies.length > 0 ? (
        <div className="space-y-3">
          {policies.map((policy) => {
            const isOpen = expanded === policy.policy_id;
            return (
            <div key={policy.policy_id} className="card hover:shadow-md transition-all group">
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : policy.policy_id)}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Status indicator */}
                  <div className={`w-1 h-12 rounded-full ${
                    policy.status === 'active' ? 'bg-emerald-400' :
                    policy.status === 'draft' ? 'bg-amber-400' : 'bg-slate-300'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                      <h3 className="text-sm font-semibold text-slate-900 truncate">{policy.name}</h3>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${statusColors[policy.status]}`}>
                        {policy.status.toUpperCase()}
                      </span>
                    </div>
                    {policy.description && (
                      <p className="text-xs text-slate-500 truncate mb-2">{policy.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>{policy.rules_count} rules</span>
                      <span className="text-slate-200">·</span>
                      <span className="text-red-500 font-medium">{policy.blocking_rules} enforce</span>
                      {policy.triggered_count > 0 && (
                        <>
                          <span className="text-slate-200">·</span>
                          <span>{policy.triggered_count} triggers</span>
                        </>
                      )}
                      {policy.last_triggered && (
                        <>
                          <span className="text-slate-200">·</span>
                          <span>Last: {new Date(policy.last_triggered).toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(policy.policy_id); }}
                    disabled={deleting === policy.policy_id}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete policy"
                  >
                    {deleting === policy.policy_id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                  {/* Rules in plain language */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">What this policy does</p>
                    <div className="space-y-1.5">
                      {policy.rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                            rule.type === 'deny' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {rule.type.toUpperCase()}
                          </span>
                          <span className="text-slate-700">{ruleSummary(rule)}</span>
                          <span className={`ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded ${
                            rule.action === 'enforce' ? 'bg-red-500 text-white' : 'bg-slate-400 text-white'
                          }`}>
                            {rule.action.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cedar statement */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Cedar Statement (deployed to AgentCore)</p>
                    <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
                      <pre className="text-[11px] text-emerald-300 font-mono leading-relaxed whitespace-pre-wrap">{generateCedar(policy)}</pre>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                    <span>ID: {policy.policy_id}</span>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No policies yet</h3>
          <p className="text-xs text-slate-500 mb-4">Create your first Cedar policy to start enforcing authorization rules</p>
          <button onClick={onCreatePolicy} className="btn-primary text-sm">
            Create First Policy
          </button>
        </div>
      )}
    </div>
  );
}
