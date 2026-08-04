import { useState, useEffect, useCallback } from 'react';
import { policiesApi } from '../../api/client';
import type { PolicyRecord } from '../../api/client';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface Props {
  onCreateNew: () => void;
  refreshKey?: number;
}

interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  resource_type: 'agent' | 'gateway' | 'tool';
  resource_id?: string;
  status: 'active' | 'draft' | 'disabled';
  rules_count: number;
  blocking_rules: number;
  created_at: string;
  last_triggered?: string;
  triggered_count: number;
}


export default function PolicyTemplateList({ onCreateNew, refreshKey }: Props) {
  const [policies, setPolicies] = useState<PolicyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'disabled'>('all');

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const records: PolicyRecord[] = await policiesApi.list();
      const mapped: PolicyTemplate[] = records.map((r) => ({
        id: r.policy_id,
        name: r.name,
        description: r.description || '',
        resource_type: r.resource_type,
        resource_id: r.resource_id || undefined,
        status: r.status,
        rules_count: r.rules_count,
        blocking_rules: r.blocking_rules,
        created_at: r.created_at,
        last_triggered: r.last_triggered || undefined,
        triggered_count: r.triggered_count,
      }));
      setPolicies(mapped);
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies, refreshKey]);

  const filtered = filter === 'all' ? policies : policies.filter(p => p.status === filter);

  const statusColors = {
    active: 'bg-green-100 text-green-700',
    draft: 'bg-slate-100 text-slate-600',
    disabled: 'bg-red-100 text-red-600',
  };

  const resourceIcons: Record<string, IconName> = {
    agent: 'robot',
    gateway: 'arrow-right-on-rectangle',
    tool: 'wrench',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-500">Loading policies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-900">{policies.length}</p>
              <p className="text-xs text-indigo-600 font-medium">Total Policies</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{policies.filter(p => p.status === 'active').length}</p>
              <p className="text-xs text-slate-500 font-medium">Active</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{policies.reduce((sum, p) => sum + p.blocking_rules, 0)}</p>
              <p className="text-xs text-slate-500 font-medium">Blocking Rules</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{policies.reduce((sum, p) => sum + p.triggered_count, 0)}</p>
              <p className="text-xs text-slate-500 font-medium">Total Triggers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter + Create */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
          {(['all', 'active', 'draft', 'disabled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={onCreateNew} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Policy
        </button>
      </div>

      {/* Policy list */}
      {filtered.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No policies yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            Create your first Cedar policy to control what agents can do, access, and execute.
          </p>
          <button onClick={onCreateNew} className="btn-primary text-sm inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Policy
          </button>
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((policy) => (
          <div key={policy.id} className="card hover:shadow-md transition-all group cursor-pointer relative overflow-hidden">
            {/* Left accent */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              policy.status === 'active' ? 'bg-gradient-to-b from-green-400 to-emerald-600' :
              policy.status === 'draft' ? 'bg-gradient-to-b from-slate-300 to-slate-400' :
              'bg-gradient-to-b from-red-300 to-red-500'
            }`} />

            <div className="flex items-start gap-4 pl-3">
              {/* Resource icon */}
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Icon name={resourceIcons[policy.resource_type]} className="w-6 h-6 text-slate-500" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">{policy.name}</h3>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${statusColors[policy.status]}`}>
                    {policy.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-2">{policy.description}</p>
                <div className="flex items-center gap-4 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="capitalize">{policy.resource_type}</span>
                    {policy.resource_id && <span className="font-mono text-indigo-500">({policy.resource_id})</span>}
                  </span>
                  <span>·</span>
                  <span>{policy.rules_count} rules</span>
                  <span>·</span>
                  <span className="text-red-500 font-medium">{policy.blocking_rules} blocking</span>
                  {policy.last_triggered && (
                    <>
                      <span>·</span>
                      <span>Last triggered: {new Date(policy.last_triggered).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Trigger count */}
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-bold text-slate-900">{policy.triggered_count}</p>
                <p className="text-[10px] text-slate-400 font-medium">triggers</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
