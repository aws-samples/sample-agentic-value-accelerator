/**
 * GuardrailComparison — Side-by-side comparison of two guardrail configurations
 */

import { useState, useMemo } from 'react';

interface GuardrailConfig {
  id: string;
  name: string;
  version?: string;
  contentFilters: FilterConfig[];
  piiEntities: PIIConfig[];
  deniedTopics: TopicConfig[];
  wordFilters: { profanity: boolean; custom: string[] };
  grounding?: { enabled: boolean; threshold: number };
  reasoning?: { enabled: boolean };
}

interface FilterConfig {
  type: string;
  inputStrength: string;
  outputStrength: string;
}

interface PIIConfig {
  type: string;
  action: string;
}

interface TopicConfig {
  name: string;
  definition: string;
}

interface Props {
  leftGuardrail?: GuardrailConfig;
  rightGuardrail?: GuardrailConfig;
  availableGuardrails: { id: string; name: string; version?: string }[];
  onSelectLeft?: (id: string) => void;
  onSelectRight?: (id: string) => void;
  onClose?: () => void;
}

const MOCK_GUARDRAILS: GuardrailConfig[] = [
  {
    id: 'gr-001',
    name: 'FSI Standard',
    version: 'v3',
    contentFilters: [
      { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'INSULTS', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
      { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    ],
    piiEntities: [
      { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
      { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'ANONYMIZE' },
      { type: 'US_BANK_ACCOUNT_NUMBER', action: 'BLOCK' },
      { type: 'EMAIL', action: 'ANONYMIZE' },
    ],
    deniedTopics: [
      { name: 'Insider Trading', definition: 'Discussion of non-public information for trading decisions' },
      { name: 'Market Manipulation', definition: 'Strategies to artificially influence market prices' },
    ],
    wordFilters: { profanity: true, custom: ['competitor-name'] },
    grounding: { enabled: true, threshold: 0.8 },
    reasoning: { enabled: true },
  },
  {
    id: 'gr-002',
    name: 'AWS Best Practice',
    version: 'v1',
    contentFilters: [
      { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
    ],
    piiEntities: [
      { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'ANONYMIZE' },
      { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'ANONYMIZE' },
      { type: 'EMAIL', action: 'ANONYMIZE' },
      { type: 'PHONE', action: 'ANONYMIZE' },
      { type: 'NAME', action: 'ANONYMIZE' },
      { type: 'ADDRESS', action: 'ANONYMIZE' },
    ],
    deniedTopics: [],
    wordFilters: { profanity: true, custom: [] },
    grounding: { enabled: true, threshold: 0.7 },
    reasoning: { enabled: true },
  },
];

export default function GuardrailComparison({
  leftGuardrail,
  rightGuardrail,
  availableGuardrails,
  onSelectLeft,
  onSelectRight,
  onClose,
}: Props) {
  const [leftId, setLeftId] = useState<string>(leftGuardrail?.id || 'gr-001');
  const [rightId, setRightId] = useState<string>(rightGuardrail?.id || 'gr-002');

  const left = MOCK_GUARDRAILS.find(g => g.id === leftId) || MOCK_GUARDRAILS[0];
  const right = MOCK_GUARDRAILS.find(g => g.id === rightId) || MOCK_GUARDRAILS[1];

  const availableList = availableGuardrails.length > 0
    ? availableGuardrails
    : MOCK_GUARDRAILS.map(g => ({ id: g.id, name: g.name, version: g.version }));

  const differences = useMemo(() => {
    const diffs: { category: string; field: string; left: string; right: string; status: 'added' | 'removed' | 'changed' | 'same' }[] = [];

    // Compare content filters
    const allFilterTypes = new Set([...left.contentFilters.map(f => f.type), ...right.contentFilters.map(f => f.type)]);
    allFilterTypes.forEach(type => {
      const lf = left.contentFilters.find(f => f.type === type);
      const rf = right.contentFilters.find(f => f.type === type);

      if (!lf && rf) {
        diffs.push({ category: 'Content Filters', field: type, left: '—', right: `${rf.inputStrength}/${rf.outputStrength}`, status: 'added' });
      } else if (lf && !rf) {
        diffs.push({ category: 'Content Filters', field: type, left: `${lf.inputStrength}/${lf.outputStrength}`, right: '—', status: 'removed' });
      } else if (lf && rf && (lf.inputStrength !== rf.inputStrength || lf.outputStrength !== rf.outputStrength)) {
        diffs.push({ category: 'Content Filters', field: type, left: `${lf.inputStrength}/${lf.outputStrength}`, right: `${rf.inputStrength}/${rf.outputStrength}`, status: 'changed' });
      }
    });

    // Compare PII entities
    const allPIITypes = new Set([...left.piiEntities.map(p => p.type), ...right.piiEntities.map(p => p.type)]);
    allPIITypes.forEach(type => {
      const lp = left.piiEntities.find(p => p.type === type);
      const rp = right.piiEntities.find(p => p.type === type);

      if (!lp && rp) {
        diffs.push({ category: 'PII Detection', field: type, left: '—', right: rp.action, status: 'added' });
      } else if (lp && !rp) {
        diffs.push({ category: 'PII Detection', field: type, left: lp.action, right: '—', status: 'removed' });
      } else if (lp && rp && lp.action !== rp.action) {
        diffs.push({ category: 'PII Detection', field: type, left: lp.action, right: rp.action, status: 'changed' });
      }
    });

    // Compare denied topics
    const allTopics = new Set([...left.deniedTopics.map(t => t.name), ...right.deniedTopics.map(t => t.name)]);
    allTopics.forEach(name => {
      const lt = left.deniedTopics.find(t => t.name === name);
      const rt = right.deniedTopics.find(t => t.name === name);

      if (!lt && rt) {
        diffs.push({ category: 'Denied Topics', field: name, left: '—', right: 'Configured', status: 'added' });
      } else if (lt && !rt) {
        diffs.push({ category: 'Denied Topics', field: name, left: 'Configured', right: '—', status: 'removed' });
      }
    });

    // Compare grounding
    if (left.grounding?.enabled !== right.grounding?.enabled) {
      diffs.push({
        category: 'Grounding',
        field: 'Enabled',
        left: left.grounding?.enabled ? 'Yes' : 'No',
        right: right.grounding?.enabled ? 'Yes' : 'No',
        status: 'changed',
      });
    } else if (left.grounding?.enabled && right.grounding?.enabled && left.grounding.threshold !== right.grounding.threshold) {
      diffs.push({
        category: 'Grounding',
        field: 'Threshold',
        left: String(left.grounding.threshold),
        right: String(right.grounding.threshold),
        status: 'changed',
      });
    }

    // Compare reasoning
    if (left.reasoning?.enabled !== right.reasoning?.enabled) {
      diffs.push({
        category: 'Reasoning',
        field: 'Enabled',
        left: left.reasoning?.enabled ? 'Yes' : 'No',
        right: right.reasoning?.enabled ? 'Yes' : 'No',
        status: 'changed',
      });
    }

    return diffs;
  }, [left, right]);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'added': return { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '+' };
      case 'removed': return { bg: 'bg-red-50', text: 'text-red-700', icon: '−' };
      case 'changed': return { bg: 'bg-amber-50', text: 'text-amber-700', icon: '~' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-500', icon: '=' };
    }
  };

  const groupedDiffs = useMemo(() => {
    const groups: Record<string, typeof differences> = {};
    differences.forEach(d => {
      if (!groups[d.category]) groups[d.category] = [];
      groups[d.category].push(d);
    });
    return groups;
  }, [differences]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Compare Guardrails</h2>
          <p className="text-sm text-slate-500 mt-1">
            {differences.length} differences found
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Base Guardrail</label>
          <select
            value={leftId}
            onChange={e => {
              setLeftId(e.target.value);
              onSelectLeft?.(e.target.value);
            }}
            className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800"
          >
            {availableList.map(g => (
              <option key={g.id} value={g.id}>{g.name} {g.version && `(${g.version})`}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Compare To</label>
          <select
            value={rightId}
            onChange={e => {
              setRightId(e.target.value);
              onSelectRight?.(e.target.value);
            }}
            className="w-full px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm font-medium text-purple-800"
          >
            {availableList.map(g => (
              <option key={g.id} value={g.id}>{g.name} {g.version && `(${g.version})`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-slate-500">Legend:</span>
        <span className="flex items-center gap-1">
          <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">+</span>
          <span className="text-slate-600">Added in Compare</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-5 h-5 rounded bg-red-100 text-red-700 flex items-center justify-center font-bold">−</span>
          <span className="text-slate-600">Removed in Compare</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center font-bold">~</span>
          <span className="text-slate-600">Changed</span>
        </span>
      </div>

      {/* Differences Table */}
      {differences.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">No differences found</p>
          <p className="text-xs text-slate-500 mt-1">These guardrails have identical configurations</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedDiffs).map(([category, diffs]) => (
            <div key={category} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {diffs.map((diff, i) => {
                  const style = getStatusStyle(diff.status);
                  return (
                    <div key={i} className={`grid grid-cols-[40px_1fr_1fr_1fr] items-center ${style.bg}`}>
                      <div className="flex items-center justify-center py-3">
                        <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${style.bg} ${style.text}`}>
                          {style.icon}
                        </span>
                      </div>
                      <div className="py-3 px-2">
                        <span className="text-sm font-medium text-slate-700">{diff.field}</span>
                      </div>
                      <div className="py-3 px-2 border-l border-slate-200">
                        <span className={`text-sm ${diff.left === '—' ? 'text-slate-400' : 'text-blue-700 font-medium'}`}>
                          {diff.left}
                        </span>
                      </div>
                      <div className="py-3 px-2 border-l border-slate-200">
                        <span className={`text-sm ${diff.right === '—' ? 'text-slate-400' : 'text-purple-700 font-medium'}`}>
                          {diff.right}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
          <div className="text-2xl font-bold text-emerald-700">
            {differences.filter(d => d.status === 'added').length}
          </div>
          <div className="text-xs text-emerald-600 mt-1">Added</div>
        </div>
        <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
          <div className="text-2xl font-bold text-red-700">
            {differences.filter(d => d.status === 'removed').length}
          </div>
          <div className="text-xs text-red-600 mt-1">Removed</div>
        </div>
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
          <div className="text-2xl font-bold text-amber-700">
            {differences.filter(d => d.status === 'changed').length}
          </div>
          <div className="text-xs text-amber-600 mt-1">Changed</div>
        </div>
      </div>
    </div>
  );
}
