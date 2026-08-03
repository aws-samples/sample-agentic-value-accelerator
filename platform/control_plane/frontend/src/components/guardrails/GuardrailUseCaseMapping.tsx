/**
 * GuardrailUseCaseMapping — Map guardrail templates to FSI Foundry use cases
 *
 * Shows recommended guardrails for each use case category and allows
 * automatic assignment when deploying from Foundry.
 */

import { useState, useMemo } from 'react';

interface UseCaseMapping {
  useCaseId: string;
  useCaseName: string;
  category: string;
  recommendedGuardrails: {
    id: string;
    name: string;
    useCaseId: string;
    matchScore: 'exact' | 'recommended' | 'compatible';
    reason: string;
  }[];
  activeGuardrailId?: string;
}

interface Props {
  onSelectGuardrail?: (useCaseId: string, guardrailId: string) => void;
  onApplyToUseCase?: (guardrailId: string, useCaseId: string) => void;
}

const USE_CASE_GUARDRAIL_MAPPINGS: UseCaseMapping[] = [
  {
    useCaseId: 'R01',
    useCaseName: 'AML Transaction Monitoring',
    category: 'Risk & Compliance',
    recommendedGuardrails: [
      { id: 'aml-kyc-screening', name: 'AML/KYC Compliance Guardrail', useCaseId: 'R01', matchScore: 'exact', reason: 'Exact match - designed for AML/KYC workflows' },
      { id: 'aws-best-practice', name: 'AWS Best Practice Guardrail', useCaseId: 'AWS', matchScore: 'compatible', reason: 'General baseline protection' },
    ],
    activeGuardrailId: 'aml-kyc-screening',
  },
  {
    useCaseId: 'B01',
    useCaseName: 'KYC Risk Assessment',
    category: 'Banking',
    recommendedGuardrails: [
      { id: 'credit-decisioning', name: 'Fair Lending & Credit Guardrail', useCaseId: 'B01', matchScore: 'exact', reason: 'Exact match - fair lending and credit compliance' },
      { id: 'aml-kyc-screening', name: 'AML/KYC Compliance Guardrail', useCaseId: 'R01', matchScore: 'recommended', reason: 'Strong KYC protection overlap' },
    ],
  },
  {
    useCaseId: 'I01',
    useCaseName: 'Claims Processing',
    category: 'Insurance',
    recommendedGuardrails: [
      { id: 'claims-processing', name: 'Insurance Claims Guardrail', useCaseId: 'I01', matchScore: 'exact', reason: 'Exact match - claims processing and fraud prevention' },
    ],
  },
  {
    useCaseId: 'B09',
    useCaseName: 'Wealth Management',
    category: 'Banking',
    recommendedGuardrails: [
      { id: 'wealth-advisory', name: 'Wealth & Investment Advisory Guardrail', useCaseId: 'B09', matchScore: 'exact', reason: 'Exact match - suitability and fiduciary compliance' },
    ],
  },
  {
    useCaseId: 'B02',
    useCaseName: 'Customer Service Agent',
    category: 'Banking',
    recommendedGuardrails: [
      { id: 'customer-service-enhanced', name: 'Customer Service Excellence Guardrail', useCaseId: 'B02', matchScore: 'exact', reason: 'Exact match - balanced customer service protection' },
      { id: 'aws-best-practice', name: 'AWS Best Practice Guardrail', useCaseId: 'AWS', matchScore: 'compatible', reason: 'Good baseline for customer interactions' },
    ],
  },
  {
    useCaseId: 'C01',
    useCaseName: 'Market Surveillance',
    category: 'Capital Markets',
    recommendedGuardrails: [
      { id: 'trading-surveillance', name: 'Trading & Market Surveillance Guardrail', useCaseId: 'C01', matchScore: 'exact', reason: 'Exact match - insider trading and manipulation prevention' },
    ],
  },
  {
    useCaseId: 'O01',
    useCaseName: 'Document Processing',
    category: 'Operations',
    recommendedGuardrails: [
      { id: 'document-intelligence', name: 'Document Intelligence Guardrail', useCaseId: 'O01', matchScore: 'exact', reason: 'Exact match - high-accuracy document extraction' },
    ],
  },
  {
    useCaseId: 'O02',
    useCaseName: 'Back Office Automation',
    category: 'Operations',
    recommendedGuardrails: [
      { id: 'internal-operations', name: 'Internal Operations Guardrail', useCaseId: 'O02', matchScore: 'exact', reason: 'Exact match - internal employee-facing automation' },
    ],
  },
  {
    useCaseId: 'R05',
    useCaseName: 'Regulatory Reporting',
    category: 'Risk & Compliance',
    recommendedGuardrails: [
      { id: 'regulatory-reporting', name: 'Regulatory Reporting Guardrail', useCaseId: 'R05', matchScore: 'exact', reason: 'Exact match - compliance filing accuracy' },
    ],
  },
];

const CATEGORY_META: Record<string, { color: string; bg: string }> = {
  'Risk & Compliance': { color: 'text-red-700', bg: 'bg-red-50' },
  'Banking': { color: 'text-blue-700', bg: 'bg-blue-50' },
  'Insurance': { color: 'text-amber-700', bg: 'bg-amber-50' },
  'Capital Markets': { color: 'text-violet-700', bg: 'bg-violet-50' },
  'Operations': { color: 'text-teal-700', bg: 'bg-teal-50' },
};

export default function GuardrailUseCaseMapping({ onSelectGuardrail, onApplyToUseCase }: Props) {
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [mappings, setMappings] = useState(USE_CASE_GUARDRAIL_MAPPINGS);

  const filteredMappings = useMemo(() => {
    if (categoryFilter === 'all') return mappings;
    return mappings.filter(m => m.category === categoryFilter);
  }, [mappings, categoryFilter]);

  const categories = Array.from(new Set(mappings.map(m => m.category)));

  const getMatchBadge = (score: string) => {
    switch (score) {
      case 'exact':
        return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Exact Match' };
      case 'recommended':
        return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Recommended' };
      case 'compatible':
        return { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Compatible' };
      default:
        return { bg: 'bg-slate-100', text: 'text-slate-500', label: score };
    }
  };

  const handleAssignGuardrail = (useCaseId: string, guardrailId: string) => {
    setMappings(prev =>
      prev.map(m =>
        m.useCaseId === useCaseId
          ? { ...m, activeGuardrailId: guardrailId }
          : m
      )
    );
    onSelectGuardrail?.(useCaseId, guardrailId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Use Case → Guardrail Mapping</h2>
        <p className="text-sm text-slate-500 mt-1">
          Recommended guardrails for FSI Foundry use cases. Select a guardrail to automatically apply when deploying.
        </p>
      </div>

      {/* How it works */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-blue-900 font-semibold">Automatic guardrail assignment</p>
            <p className="text-sm text-blue-700/80 mt-1">
              Templates are mapped to use cases by their <code className="bg-blue-100 px-1 rounded">useCaseId</code> (e.g., R01, B01).
              When you deploy from FSI Foundry, the matching guardrail is automatically assigned.
              You can also override with any compatible guardrail.
            </p>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            categoryFilter === 'all'
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
          }`}
        >
          All ({mappings.length})
        </button>
        {categories.map(cat => {
          const meta = CATEGORY_META[cat] || { color: 'text-slate-700', bg: 'bg-slate-100' };
          const count = mappings.filter(m => m.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                categoryFilter === cat
                  ? 'bg-slate-800 text-white'
                  : `bg-white ${meta.color} border border-slate-200 hover:border-slate-300`
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Mapping Cards */}
      <div className="space-y-4">
        {filteredMappings.map(mapping => {
          const catMeta = CATEGORY_META[mapping.category] || { color: 'text-slate-700', bg: 'bg-slate-100' };
          const isExpanded = selectedUseCase === mapping.useCaseId;

          return (
            <div
              key={mapping.useCaseId}
              className={`border rounded-xl overflow-hidden transition-all ${
                isExpanded ? 'border-blue-300 shadow-md' : 'border-slate-200'
              }`}
            >
              {/* Use Case Header */}
              <button
                onClick={() => setSelectedUseCase(isExpanded ? null : mapping.useCaseId)}
                className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
                  isExpanded ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${catMeta.bg} ${catMeta.color}`}>
                    {mapping.useCaseId}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{mapping.useCaseName}</h3>
                    <p className="text-xs text-slate-500">{mapping.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {mapping.activeGuardrailId ? (
                    <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Guardrail Active
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">No guardrail assigned</span>
                  )}
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Recommended Guardrails */}
              {isExpanded && (
                <div className="px-4 py-4 bg-slate-50 border-t border-slate-200 space-y-3">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                    Recommended Guardrails
                  </p>
                  {mapping.recommendedGuardrails.map(gr => {
                    const badge = getMatchBadge(gr.matchScore);
                    const isActive = mapping.activeGuardrailId === gr.id;

                    return (
                      <div
                        key={gr.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isActive
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono font-bold text-slate-500">{gr.useCaseId}</span>
                              <h4 className="text-sm font-medium text-slate-900">{gr.name}</h4>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                                {badge.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">{gr.reason}</p>
                          </div>
                          <button
                            onClick={() => handleAssignGuardrail(mapping.useCaseId, gr.id)}
                            disabled={isActive}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              isActive
                                ? 'bg-emerald-200 text-emerald-800 cursor-default'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            {isActive ? 'Active' : 'Assign'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Apply to running deployments */}
                  {mapping.activeGuardrailId && (
                    <div className="pt-3 border-t border-slate-200">
                      <button
                        onClick={() => onApplyToUseCase?.(mapping.activeGuardrailId!, mapping.useCaseId)}
                        className="w-full py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                      >
                        Apply to Running Deployments
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-slate-500 pt-4 border-t border-slate-200">
        <span className="font-medium">Match Scores:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Exact Match — same useCaseId
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Recommended — strong overlap
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-400" /> Compatible — baseline protection
        </span>
      </div>
    </div>
  );
}

export { USE_CASE_GUARDRAIL_MAPPINGS };
