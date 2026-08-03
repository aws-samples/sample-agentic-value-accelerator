import { useState, useEffect, useMemo } from 'react';
import { guardrailsApi } from '../../api/client';
import type { GuardrailTemplate } from '../../types';
import { FSI_TEMPLATES } from './FSIGuardrailTemplates';

interface Props {
  value?: string;
  onChange: (guardrailId: string | undefined, guardrailVersion: string | undefined) => void;
  useCaseId?: string;
}

const USE_CASE_ID_TO_TEMPLATE: Record<string, string> = {
  'aml_transaction_monitoring': 'R01',
  'kyc_risk_assessment': 'B01',
  'claims_processing': 'I01',
  'wealth_management': 'B09',
  'customer_service_agent': 'B02',
  'market_surveillance': 'C01',
  'document_processing': 'O01',
  'back_office_automation': 'O02',
  'regulatory_reporting': 'R05',
};

export default function GuardrailSelector({ value, onChange, useCaseId }: Props) {
  const [templates, setTemplates] = useState<GuardrailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showFSITemplates, setShowFSITemplates] = useState(false);

  useEffect(() => {
    guardrailsApi.list('active')
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = templates.find((t) => t.guardrail_id === value);

  const recommendedFSITemplate = useMemo(() => {
    if (!useCaseId) return null;
    const templateUseCaseId = USE_CASE_ID_TO_TEMPLATE[useCaseId];
    if (!templateUseCaseId) return null;
    return FSI_TEMPLATES.find(t => t.useCaseId === templateUseCaseId) || null;
  }, [useCaseId]);

  const compatibleFSITemplates = useMemo(() => {
    return FSI_TEMPLATES.filter(t =>
      t.useCaseId === 'AWS' ||
      (recommendedFSITemplate && t.category === recommendedFSITemplate.category)
    ).slice(0, 5);
  }, [recommendedFSITemplate]);

  const featureTags = (t: GuardrailTemplate): string[] => {
    const tags: string[] = [];
    if (t.content_filters?.length > 0) tags.push('Content');
    if (t.pii_entities?.length > 0) tags.push('PII');
    if (t.denied_topics?.length > 0) tags.push('Topics');
    return tags;
  };

  if (loading) {
    return (
      <div className="p-4 border border-slate-200 rounded-xl">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          Loading guardrails...
        </div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50">
        <p className="text-sm text-slate-500">No active guardrails available. <a href="/secure/guardrails?tab=builder" className="text-blue-600 hover:underline">Create one</a></p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Guardrail {recommendedFSITemplate ? '(Recommended)' : '(Optional)'}</label>
        {value && (
          <button
            onClick={() => onChange(undefined, undefined)}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Recommended FSI Template Banner */}
      {recommendedFSITemplate && !value && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">{recommendedFSITemplate.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">
                  {recommendedFSITemplate.useCaseId}
                </span>
                <span className="text-xs font-bold text-emerald-800">Recommended Match</span>
              </div>
              <p className="text-sm font-medium text-emerald-900 mt-1">{recommendedFSITemplate.name}</p>
              <p className="text-xs text-emerald-700 mt-0.5">{recommendedFSITemplate.description}</p>
              <button
                onClick={() => {
                  onChange(recommendedFSITemplate.id, '1');
                }}
                className="mt-2 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700"
              >
                Apply This Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected display or selector */}
      {selected ? (
        <div className="p-3 border border-blue-200 bg-blue-50/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{selected.name}</p>
              <p className="text-[10px] text-slate-500 font-mono">{selected.guardrail_id}</p>
            </div>
          </div>
          <button onClick={() => setExpanded(true)} className="text-xs text-blue-600 hover:text-blue-800">Change</button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-3 border border-slate-200 rounded-xl text-left text-sm text-slate-500 hover:border-blue-200 hover:bg-blue-50/20 transition-colors"
        >
          Select a guardrail template...
        </button>
      )}

      {/* Dropdown list */}
      {expanded && (
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-lg max-h-80 overflow-y-auto">
          {/* Toggle between deployed and FSI templates */}
          <div className="sticky top-0 bg-white border-b border-slate-100 px-3 py-2 flex gap-2">
            <button
              onClick={() => setShowFSITemplates(false)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                !showFSITemplates ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              My Guardrails ({templates.length})
            </button>
            <button
              onClick={() => setShowFSITemplates(true)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                showFSITemplates ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              FSI Templates ({compatibleFSITemplates.length})
            </button>
          </div>

          {!showFSITemplates ? (
            templates.length > 0 ? templates.map((t) => (
              <button
                key={t.template_id}
                onClick={() => {
                  onChange(t.guardrail_id || undefined, t.guardrail_version || undefined);
                  setExpanded(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{t.name}</p>
                  <div className="flex gap-1">
                    {featureTags(t).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 text-[9px] bg-slate-100 text-slate-500 rounded">{tag}</span>
                    ))}
                  </div>
                </div>
                {t.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{t.description}</p>}
              </button>
            )) : (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No deployed guardrails yet
              </div>
            )
          ) : (
            compatibleFSITemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onChange(t.id, '1');
                  setExpanded(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${
                  recommendedFSITemplate?.id === t.id ? 'bg-emerald-50/50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{t.icon}</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {t.useCaseId}
                    </span>
                    <p className="text-sm font-medium text-slate-800">{t.shortName}</p>
                  </div>
                  {recommendedFSITemplate?.id === t.id && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                      MATCH
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate ml-7">{t.description}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
