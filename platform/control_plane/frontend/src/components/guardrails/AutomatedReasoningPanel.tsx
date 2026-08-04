/**
 * AutomatedReasoningPanel — Configure automated reasoning for guardrails
 */

import { useState } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface ReasoningPolicy {
  id: string;
  name: string;
  description: string;
  actions: ReasoningAction[];
}

interface ReasoningAction {
  action: 'BLOCK' | 'WARN' | 'LOG';
  condition: string;
}

interface Props {
  enabled: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  policies?: ReasoningPolicy[];
  onPoliciesChange?: (policies: ReasoningPolicy[]) => void;
  onClose?: () => void;
}

const DEFAULT_POLICIES: ReasoningPolicy[] = [
  {
    id: 'pol-001',
    name: 'Logical Consistency',
    description: 'Detect contradictory statements and logical fallacies in model outputs',
    actions: [{ action: 'WARN', condition: 'contradiction_score > 0.7' }],
  },
  {
    id: 'pol-002',
    name: 'Factual Accuracy',
    description: 'Flag statements that conflict with known facts or source documents',
    actions: [{ action: 'BLOCK', condition: 'grounding_score < 0.5' }],
  },
  {
    id: 'pol-003',
    name: 'Confidence Calibration',
    description: 'Require appropriate hedging for uncertain or speculative responses',
    actions: [{ action: 'WARN', condition: 'certainty_mismatch' }],
  },
];

export default function AutomatedReasoningPanel({
  enabled,
  onEnabledChange,
  policies: initialPolicies,
  onPoliciesChange,
  onClose,
}: Props) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [policies, setPolicies] = useState<ReasoningPolicy[]>(initialPolicies || DEFAULT_POLICIES);
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [newPolicy, setNewPolicy] = useState<{ name: string; description: string; action: 'BLOCK' | 'WARN' | 'LOG' }>({ name: '', description: '', action: 'WARN' });

  const handleToggle = () => {
    const newValue = !isEnabled;
    setIsEnabled(newValue);
    onEnabledChange?.(newValue);
  };

  const handleAddPolicy = () => {
    if (!newPolicy.name.trim()) return;
    const policy: ReasoningPolicy = {
      id: `pol-${Date.now()}`,
      name: newPolicy.name,
      description: newPolicy.description,
      actions: [{ action: newPolicy.action, condition: 'custom_condition' }],
    };
    const updated = [...policies, policy];
    setPolicies(updated);
    onPoliciesChange?.(updated);
    setNewPolicy({ name: '', description: '', action: 'WARN' });
    setShowAddPolicy(false);
  };

  const handleRemovePolicy = (id: string) => {
    const updated = policies.filter(p => p.id !== id);
    setPolicies(updated);
    onPoliciesChange?.(updated);
  };

  const getActionStyle = (action: string) => {
    switch (action) {
      case 'BLOCK': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      case 'WARN': return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
      case 'LOG': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Automated Reasoning</h2>
            <p className="text-sm text-slate-500">AI-powered content verification and logical analysis</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Enable Toggle */}
      <div className={`p-4 rounded-xl border-2 transition-all ${isEnabled ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isEnabled ? 'bg-purple-200' : 'bg-slate-200'}`}>
              {isEnabled ? (
                <svg className="w-4 h-4 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {isEnabled ? 'Reasoning Enabled' : 'Reasoning Disabled'}
              </h3>
              <p className="text-xs text-slate-500">
                {isEnabled
                  ? 'All configured policies are active'
                  : 'Enable to activate AI-powered content verification'
                }
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            className={`relative w-12 h-6 rounded-full transition-colors ${isEnabled ? 'bg-purple-600' : 'bg-slate-300'}`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                isEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-purple-900">About Automated Reasoning</h4>
            <p className="text-xs text-purple-700 mt-1">
              Automated Reasoning uses formal verification techniques to detect logical inconsistencies,
              factual errors, and ensure responses are properly grounded in source material. This AWS Bedrock
              feature provides an additional layer of protection beyond content filters.
            </p>
          </div>
        </div>
      </div>

      {/* Policies */}
      {isEnabled && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Reasoning Policies</h3>
            <button
              onClick={() => setShowAddPolicy(true)}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Policy
            </button>
          </div>

          <div className="space-y-3">
            {policies.map(policy => (
              <div
                key={policy.id}
                className="border border-slate-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedPolicy(expandedPolicy === policy.id ? null : policy.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-900">{policy.name}</h4>
                      <p className="text-xs text-slate-500">{policy.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {policy.actions.map((action, i) => {
                      const style = getActionStyle(action.action);
                      return (
                        <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                          {action.action}
                        </span>
                      );
                    })}
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform ${expandedPolicy === policy.id ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedPolicy === policy.id && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Actions & Conditions</label>
                        <div className="mt-2 space-y-2">
                          {policy.actions.map((action, i) => {
                            const style = getActionStyle(action.action);
                            return (
                              <div key={i} className={`p-2 rounded-lg border ${style.border} ${style.bg}`}>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-bold ${style.text}`}>{action.action}</span>
                                  <span className="text-xs text-slate-600">when</span>
                                  <code className="text-xs font-mono bg-white/50 px-1.5 py-0.5 rounded">
                                    {action.condition}
                                  </code>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleRemovePolicy(policy.id)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove Policy
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Policy Form */}
          {showAddPolicy && (
            <div className="p-4 border-2 border-dashed border-purple-200 rounded-xl bg-purple-50/50 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">New Reasoning Policy</h4>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newPolicy.name}
                  onChange={e => setNewPolicy({ ...newPolicy, name: e.target.value })}
                  placeholder="Policy name"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <textarea
                  value={newPolicy.description}
                  onChange={e => setNewPolicy({ ...newPolicy, description: e.target.value })}
                  placeholder="Description"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none h-16"
                />
                <select
                  value={newPolicy.action}
                  onChange={e => setNewPolicy({ ...newPolicy, action: e.target.value as 'BLOCK' | 'WARN' | 'LOG' })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                >
                  <option value="WARN">WARN - Flag for review</option>
                  <option value="BLOCK">BLOCK - Reject response</option>
                  <option value="LOG">LOG - Record only</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddPolicy(false)}
                  className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddPolicy}
                  disabled={!newPolicy.name.trim()}
                  className="flex-1 py-2 text-sm text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Add Policy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Capabilities List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Reasoning Capabilities</h3>
        <div className="grid grid-cols-2 gap-3">
          {([
            { icon: 'search' as IconName, title: 'Contradiction Detection', desc: 'Identifies conflicting statements' },
            { icon: 'viewfinder-circle' as IconName, title: 'Grounding Verification', desc: 'Validates claims against sources' },
            { icon: 'scale' as IconName, title: 'Confidence Calibration', desc: 'Ensures appropriate certainty' },
            { icon: 'calculator' as IconName, title: 'Logical Inference', desc: 'Validates reasoning chains' },
          ]).map((cap, i) => (
            <div key={i} className={`p-3 rounded-lg border ${isEnabled ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon name={cap.icon} className="w-4 h-4" />
                <span className={`text-xs font-semibold ${isEnabled ? 'text-purple-900' : 'text-slate-700'}`}>{cap.title}</span>
              </div>
              <p className={`text-[10px] ${isEnabled ? 'text-purple-600' : 'text-slate-500'}`}>{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
