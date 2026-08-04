import { useState, useEffect, useMemo } from 'react';
import { guardrailsApi } from '../../api/client';
import type { GuardrailTemplate, GuardrailStatus } from '../../types';

interface Props {
  onCreateNew: () => void;
}

const statusStyles: Record<GuardrailStatus, { bg: string; text: string; dot: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  creating: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  updating: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
  deleting: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  deleted: { bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-300' },
};

type FilterStatus = 'all' | 'active' | 'draft' | 'failed';

export default function GuardrailTemplateList({ onCreateNew }: Props) {
  const [templates, setTemplates] = useState<GuardrailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await guardrailsApi.list();
      setTemplates(data.filter((t) => t.status !== 'deleted'));
    } catch {
      // API might not be deployed yet — show empty state
    } finally {
      setLoading(false);
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Delete this guardrail template? This will also remove the Bedrock resource.')) return;
    try {
      await guardrailsApi.delete(templateId);
      loadTemplates();
    } catch {}
  };

  const featureSummary = (t: GuardrailTemplate): string[] => {
    const features: string[] = [];
    if (t.content_filters?.length > 0) features.push('Content');
    if (t.pii_entities?.length > 0) features.push('PII');
    if (t.denied_topics?.length > 0) features.push('Topics');
    if (t.word_filter?.enable_profanity || (t.word_filter?.blocked_words?.length ?? 0) > 0) features.push('Words');
    if (t.contextual_grounding?.enabled) features.push('Grounding');
    return features;
  };

  const stats = useMemo(() => {
    const active = templates.filter(t => t.status === 'active').length;
    const draft = templates.filter(t => t.status === 'draft').length;
    const failed = templates.filter(t => t.status === 'failed').length;
    const totalFilters = templates.reduce((sum, t) => {
      let count = 0;
      if (t.content_filters?.length) count += t.content_filters.length;
      if (t.pii_entities?.length) count += t.pii_entities.length;
      if (t.denied_topics?.length) count += t.denied_topics.length;
      if (t.word_filter?.blocked_words?.length) count += t.word_filter.blocked_words.length;
      if (t.word_filter?.enable_profanity) count += 1;
      if (t.contextual_grounding?.enabled) count += 1;
      return sum + count;
    }, 0);
    return { active, draft, failed, totalFilters };
  }, [templates]);

  const filtered = filter === 'all' ? templates : templates.filter(t => t.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
        <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <h3 className="text-sm font-semibold text-slate-700 mb-1">No guardrails yet</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
          Create your first guardrail template to protect your AI agents with content filtering, PII detection, and more.
        </p>
        <button onClick={onCreateNew} className="btn-primary text-sm inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Guardrail
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-900">{templates.length}</p>
              <p className="text-xs text-blue-600 font-medium">Total Guardrails</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.active}</p>
              <p className="text-xs text-slate-500 font-medium">Active</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.totalFilters}</p>
              <p className="text-xs text-slate-500 font-medium">Total Filters</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.draft}</p>
              <p className="text-xs text-slate-500 font-medium">Draft</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter + Create */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
          {(['all', 'active', 'draft', 'failed'] as const).map((f) => (
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
          New Guardrail
        </button>
      </div>

      {/* Guardrail list */}
      {filtered.length === 0 && (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-sm text-slate-500">No {filter} guardrails found</p>
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((template) => {
          const style = statusStyles[template.status] || statusStyles.draft;
          const features = featureSummary(template);

          return (
            <div key={template.template_id} className="card hover:shadow-md transition-all group cursor-pointer relative overflow-hidden">
              {/* Left accent */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                template.status === 'active' ? 'bg-gradient-to-b from-green-400 to-emerald-600' :
                template.status === 'draft' ? 'bg-gradient-to-b from-slate-300 to-slate-400' :
                template.status === 'failed' ? 'bg-gradient-to-b from-red-300 to-red-500' :
                'bg-gradient-to-b from-blue-300 to-blue-500'
              }`} />

              <div className="flex items-start gap-4 pl-3">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">{template.name}</h3>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${style.bg} ${style.text}`}>
                      {template.status.toUpperCase()}
                    </span>
                  </div>
                  {template.description && (
                    <p className="text-xs text-slate-500 mb-2 line-clamp-1">{template.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      {features.map((f) => (
                        <span key={f} className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full">{f}</span>
                      ))}
                    </div>
                    {template.guardrail_id && (
                      <>
                        <span>·</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyId(template.guardrail_id!); }}
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                          {copiedId === template.guardrail_id ? 'Copied!' : template.guardrail_id}
                        </button>
                      </>
                    )}
                    <span>·</span>
                    <span>Created {new Date(template.created_at).toLocaleDateString()}</span>
                    {template.guardrail_version && (
                      <>
                        <span>·</span>
                        <span>v{template.guardrail_version}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className="text-right mr-4">
                    <p className="text-xl font-bold text-slate-900">{features.length}</p>
                    <p className="text-[10px] text-slate-400 font-medium">filters</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(template.template_id); }}
                    className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
