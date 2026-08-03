import { useState } from 'react';

interface PolicyOption {
  id: string;
  name: string;
  description: string;
  resource_type: string;
  rules_count: number;
}

interface Props {
  value?: string;
  onChange: (policyId: string | undefined) => void;
  resourceType?: 'agent' | 'gateway' | 'tool';
}

// Demo policies for selector
const AVAILABLE_POLICIES: PolicyOption[] = [
  { id: 'pol-001', name: 'Production Restrictions', description: 'No shell, no egress, model limited', resource_type: 'agent', rules_count: 4 },
  { id: 'pol-002', name: 'Cost Control - Tier 1', description: '50K token cap, $500/day budget', resource_type: 'gateway', rules_count: 3 },
  { id: 'pol-003', name: 'Data Boundary - FSI', description: 'Approved buckets only, guardrail required', resource_type: 'agent', rules_count: 5 },
  { id: 'pol-004', name: 'Full Audit Mode', description: 'Log every tool call and LLM invocation', resource_type: 'tool', rules_count: 4 },
];

export default function PolicySelector({ value, onChange, resourceType }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const filtered = resourceType
    ? AVAILABLE_POLICIES.filter(p => p.resource_type === resourceType || p.resource_type === 'gateway')
    : AVAILABLE_POLICIES;

  const selected = filtered.find(p => p.id === value);

  return (
    <div className="relative">
      <label className="label">AgentCore Policy (optional)</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="input-field w-full text-left flex items-center justify-between"
      >
        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
          {selected ? selected.name : 'No policy attached'}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {/* No policy option */}
          <button
            onClick={() => { onChange(undefined); setIsOpen(false); }}
            className="w-full px-4 py-3 text-left text-xs text-slate-500 hover:bg-slate-50 border-b border-slate-100"
          >
            No policy
          </button>

          {filtered.map((policy) => (
            <button
              key={policy.id}
              onClick={() => { onChange(policy.id); setIsOpen(false); }}
              className={`w-full px-4 py-3 text-left hover:bg-indigo-50 transition-colors ${
                value === policy.id ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{policy.name}</span>
                <span className="text-[10px] font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                  {policy.rules_count} rules
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{policy.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
