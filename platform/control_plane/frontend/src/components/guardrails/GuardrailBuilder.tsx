import { useState, useEffect } from 'react';
import { guardrailsApi } from '../../api/client';
import type { GuardrailTemplateCreate, ContentFilterConfig, PiiEntityConfig, DeniedTopic, WordFilterConfig, ContextualGroundingConfig, GuardrailFilterType } from '../../types';
import ContentFilterPanel from './ContentFilterPanel';
import PiiDetectionPanel from './PiiDetectionPanel';
import DeniedTopicsPanel from './DeniedTopicsPanel';
import WordFiltersPanel from './WordFiltersPanel';
import ContextualGroundingPanel from './ContextualGroundingPanel';
import DataFlowVisualizer from './DataFlowVisualizer';
import type { FSITemplate } from './FSIGuardrailTemplates';
import { FSI_TEMPLATES } from './FSIGuardrailTemplates';

interface Props {
  onComplete: () => void;
  initialFSITemplate?: FSITemplate;
}

type Step = 'preset' | 'configure' | 'review';

const SECTIONS = [
  { id: 'content', label: 'Content Filtering', icon: '🛡️', description: 'Block harmful content categories' },
  { id: 'pii', label: 'PII Detection', icon: '🔒', description: 'Detect and redact sensitive information' },
  { id: 'topics', label: 'Denied Topics', icon: '🚫', description: 'Block specific conversation topics' },
  { id: 'words', label: 'Word Filters', icon: '💬', description: 'Block profanity and custom words' },
  { id: 'grounding', label: 'Contextual Grounding', icon: '📌', description: 'Ensure factual accuracy' },
] as const;

export default function GuardrailBuilder({ onComplete, initialFSITemplate }: Props) {
  const [step, setStep] = useState<Step>(initialFSITemplate ? 'configure' : 'preset');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('content');
  const [fromFSITemplate, setFromFSITemplate] = useState<string | null>(initialFSITemplate?.name || null);

  // Form state
  const [name, setName] = useState(initialFSITemplate?.name || '');
  const [description, setDescription] = useState(initialFSITemplate?.detailedDescription || '');
  const [contentFilters, setContentFilters] = useState<ContentFilterConfig[]>(() => {
    if (!initialFSITemplate) return [];
    return initialFSITemplate.controls.contentFilters.map(f => ({
      type: f.type as GuardrailFilterType,
      input_strength: f.inputStrength,
      output_strength: f.outputStrength,
    }));
  });
  const [piiEntities, setPiiEntities] = useState<PiiEntityConfig[]>(() => {
    if (!initialFSITemplate) return [];
    return initialFSITemplate.controls.piiEntities.map(e => ({
      type: e.type,
      action: e.action,
    }));
  });
  const [deniedTopics, setDeniedTopics] = useState<DeniedTopic[]>(() => {
    if (!initialFSITemplate) return [];
    return initialFSITemplate.controls.deniedTopics.map(t => ({
      name: t.name,
      definition: t.definition,
      examples: t.examples,
    }));
  });
  const [wordFilter, setWordFilter] = useState<WordFilterConfig>(() => {
    if (!initialFSITemplate) return { enable_profanity: false, blocked_words: [] };
    return {
      enable_profanity: initialFSITemplate.controls.wordFilter.enableProfanity,
      blocked_words: initialFSITemplate.controls.wordFilter.blockedWords,
    };
  });
  const [contextualGrounding, setContextualGrounding] = useState<ContextualGroundingConfig>(() => {
    if (!initialFSITemplate) return { enabled: false, grounding_threshold: 0.7, relevance_threshold: 0.7 };
    return {
      enabled: initialFSITemplate.controls.contextualGrounding.enabled,
      grounding_threshold: initialFSITemplate.controls.contextualGrounding.groundingThreshold,
      relevance_threshold: initialFSITemplate.controls.contextualGrounding.relevanceThreshold,
    };
  });

  useEffect(() => {
    guardrailsApi.getPresets().catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please provide a name'); return; }
    // A Bedrock guardrail needs at least one policy configured.
    const hasWordFilter = wordFilter.enable_profanity || wordFilter.blocked_words.length > 0;
    if (
      contentFilters.length === 0 && deniedTopics.length === 0 && piiEntities.length === 0 &&
      !hasWordFilter && !contextualGrounding.enabled
    ) {
      setError('Add at least one policy — a content filter, denied topic, PII entity, word filter, or contextual grounding.');
      return;
    }
    // Denied topics require a definition (Bedrock rejects otherwise).
    const badTopic = deniedTopics.find(t => !t.definition || !t.definition.trim());
    if (badTopic) {
      setError(`Denied topic "${badTopic.name || 'unnamed'}" needs a definition — describe what it should block.`);
      return;
    }
    setCreating(true);
    setError('');
    try {
      const payload: GuardrailTemplateCreate = {
        name: name.trim(),
        description: description.trim() || undefined,
        content_filters: contentFilters,
        denied_topics: deniedTopics,
        pii_entities: piiEntities,
        sensitive_regexes: [],
        word_filter: wordFilter,
        contextual_grounding: contextualGrounding,
      };
      await guardrailsApi.create(payload);
      onComplete();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create guardrail');
    } finally {
      setCreating(false);
    }
  };

  const activeFeatureCount = [
    contentFilters.length > 0,
    piiEntities.length > 0,
    deniedTopics.length > 0,
    wordFilter.enable_profanity || wordFilter.blocked_words.length > 0,
    contextualGrounding.enabled,
  ].filter(Boolean).length;

  const applyFSITemplate = (template: FSITemplate) => {
    setName(template.name);
    setDescription(template.detailedDescription);
    setContentFilters(template.controls.contentFilters.map(f => ({
      type: f.type as GuardrailFilterType,
      input_strength: f.inputStrength,
      output_strength: f.outputStrength,
    })));
    setPiiEntities(template.controls.piiEntities.map(e => ({
      type: e.type,
      action: e.action,
    })));
    setDeniedTopics(template.controls.deniedTopics.map(t => ({
      name: t.name,
      definition: t.definition,
      examples: t.examples,
    })));
    setWordFilter({
      enable_profanity: template.controls.wordFilter.enableProfanity,
      blocked_words: template.controls.wordFilter.blockedWords,
    });
    setContextualGrounding({
      enabled: template.controls.contextualGrounding.enabled,
      grounding_threshold: template.controls.contextualGrounding.groundingThreshold,
      relevance_threshold: template.controls.contextualGrounding.relevanceThreshold,
    });
    setFromFSITemplate(template.name);
    setStep('configure');
  };

  const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'Critical': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    'High': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    'Medium': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    'Low': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  };

  const FSI_CATEGORY_META: Record<string, { label: string; bg: string; text: string }> = {
    'AWS': { label: 'AWS Best Practice', bg: 'bg-orange-50', text: 'text-orange-700' },
    'B': { label: 'Banking', bg: 'bg-blue-50', text: 'text-blue-700' },
    'P': { label: 'Payments', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    'R': { label: 'Risk & Compliance', bg: 'bg-red-50', text: 'text-red-700' },
    'C': { label: 'Capital Markets', bg: 'bg-violet-50', text: 'text-violet-700' },
    'I': { label: 'Insurance', bg: 'bg-amber-50', text: 'text-amber-700' },
    'O': { label: 'Operations', bg: 'bg-teal-50', text: 'text-teal-700' },
  };

  // --- Step: Preset selection ---
  const [presetChoice, setPresetChoice] = useState<'scratch' | 'template' | null>(null);

  if (step === 'preset') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Guardrail Template</h2>
            <p className="text-sm text-slate-500 mt-1">Choose how you want to get started</p>
          </div>
        </div>

        {/* Two Main Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start from scratch */}
          <button
            onClick={() => setPresetChoice('scratch')}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${
              presetChoice === 'scratch'
                ? 'border-blue-500 bg-blue-50 shadow-lg'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                presetChoice === 'scratch' ? 'bg-blue-100' : 'bg-slate-100'
              }`}>
                <svg className={`w-7 h-7 ${presetChoice === 'scratch' ? 'text-blue-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${presetChoice === 'scratch' ? 'text-blue-900' : 'text-slate-900'}`}>
                  Start from Scratch
                </h3>
                <p className="text-sm text-slate-500">Build a fully custom configuration</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Full control over every setting
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Add controls one at a time
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Best for unique requirements
              </li>
            </ul>
          </button>

          {/* Choose a template */}
          <button
            onClick={() => setPresetChoice('template')}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${
              presetChoice === 'template'
                ? 'border-blue-500 bg-blue-50 shadow-lg'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                presetChoice === 'template' ? 'bg-blue-100' : 'bg-slate-100'
              }`}>
                <svg className={`w-7 h-7 ${presetChoice === 'template' ? 'text-blue-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${presetChoice === 'template' ? 'text-blue-900' : 'text-slate-900'}`}>
                  Choose a Template
                </h3>
                <p className="text-sm text-slate-500">Start with a pre-built configuration</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {FSI_TEMPLATES.length} FSI best-practice templates
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Regulatory alignment included
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Customize after selecting
              </li>
            </ul>
          </button>
        </div>

        {/* Continue Button for Scratch */}
        {presetChoice === 'scratch' && (
          <div className="flex justify-end">
            <button
              onClick={() => setStep('configure')}
              className="btn-primary px-6 py-2.5 text-sm"
            >
              Continue with Empty Guardrail
            </button>
          </div>
        )}

        {/* Template Library (shown when template is selected) */}
        {presetChoice === 'template' && (
          <div className="mt-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Select a Template</h3>
              <span className="text-xs text-slate-500">{FSI_TEMPLATES.length} templates available</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-2">
              {FSI_TEMPLATES.map((template) => {
                const riskColors = RISK_COLORS[template.riskTier] || RISK_COLORS['Medium'];
                const categoryMeta = FSI_CATEGORY_META[template.category] || FSI_CATEGORY_META['O'];
                return (
                  <button
                    key={template.id}
                    onClick={() => applyFSITemplate(template)}
                    className="bg-white p-4 rounded-xl border border-slate-200 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-lg flex-shrink-0 group-hover:bg-blue-50">
                        {template.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${categoryMeta.bg} ${categoryMeta.text}`}>
                            {template.useCaseId}
                          </span>
                          <h4 className="text-xs font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                            {template.shortName}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${riskColors.bg} ${riskColors.text}`}>
                            {template.riskTier}
                          </span>
                          <span className="text-[9px] text-slate-400">
                            {template.controls.contentFilters.length} filters • {template.controls.piiEntities.length} PII
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-2">{template.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Step: Configure ---
  if (step === 'configure') {
    const sectionActive = (id: string) =>
      (id === 'content' && contentFilters.length > 0)
      || (id === 'pii' && piiEntities.length > 0)
      || (id === 'topics' && deniedTopics.length > 0)
      || (id === 'words' && (wordFilter.enable_profanity || wordFilter.blocked_words.length > 0))
      || (id === 'grounding' && contextualGrounding.enabled);

    const pipelineColors: Record<string, { active: string; glow: string; bg: string; border: string }> = {
      content: { active: 'bg-red-500', glow: 'shadow-red-400/50', bg: 'bg-red-50', border: 'border-red-200' },
      pii: { active: 'bg-amber-500', glow: 'shadow-amber-400/50', bg: 'bg-amber-50', border: 'border-amber-200' },
      topics: { active: 'bg-purple-500', glow: 'shadow-purple-400/50', bg: 'bg-purple-50', border: 'border-purple-200' },
      words: { active: 'bg-orange-500', glow: 'shadow-orange-400/50', bg: 'bg-orange-50', border: 'border-orange-200' },
      grounding: { active: 'bg-teal-500', glow: 'shadow-teal-400/50', bg: 'bg-teal-50', border: 'border-teal-200' },
    };

    const hasPii = (type: string) => piiEntities.some(e => e.type === type);

    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
        {/* FSI Template Banner */}
        {fromFSITemplate && (
          <div className="mb-4 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">Building from FSI Template</p>
              <p className="text-xs text-blue-600">{fromFSITemplate}</p>
            </div>
            <button
              onClick={() => {
                setFromFSITemplate(null);
                setStep('preset');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Change template
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-1 pb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Configure Guardrail</h2>
            <p className="text-sm text-slate-500 mt-0.5">{activeFeatureCount} of 5 protection layers active</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('preset')} className="btn-secondary text-sm">Back</button>
            <button onClick={() => setStep('review')} className="btn-primary text-sm">Review & Create</button>
          </div>
        </div>

        {/* Protection Pipeline - Hero Visualization */}
        <div className="flex-shrink-0 bg-gradient-to-r from-slate-50 via-white to-slate-50 border border-slate-200 rounded-xl p-5 mb-4 shadow-sm">
          <div className="flex items-center justify-between relative">
            {/* Connecting line behind nodes */}
            <div className="absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
            <div
              className="absolute top-1/2 left-[10%] h-0.5 -translate-y-1/2 z-0 bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
              style={{ width: `${activeFeatureCount > 0 ? (activeFeatureCount / 5) * 80 : 0}%` }}
            />

            {/* Data input indicator */}
            <div className="flex flex-col items-center z-10 w-16">
              <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-blue-300 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              <span className="text-[10px] text-slate-500 mt-1.5 font-medium">Input</span>
            </div>

            {/* Pipeline nodes */}
            {SECTIONS.map(({ id, label, icon }) => {
              const active = sectionActive(id);
              const colors = pipelineColors[id];
              return (
                <button
                  key={id}
                  onClick={() => setExpandedSection(expandedSection === id ? null : id)}
                  className="flex flex-col items-center z-10 group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all duration-300 ${
                    active
                      ? `${colors.bg} ${colors.border} shadow-lg ${colors.glow}`
                      : expandedSection === id
                        ? 'bg-white border-blue-300 shadow-md'
                        : 'bg-white border-slate-200 group-hover:border-slate-300 group-hover:shadow-sm'
                  }`}>
                    <span className={`text-lg transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-105'}`}>{icon}</span>
                  </div>
                  <span className={`text-[10px] mt-1.5 font-semibold whitespace-nowrap transition-colors ${
                    active ? 'text-slate-800' : 'text-slate-400 group-hover:text-slate-600'
                  }`}>
                    {label.split(' ')[0]}
                  </span>
                  {active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5 animate-pulse" />
                  )}
                </button>
              );
            })}

            {/* Data output indicator */}
            <div className="flex flex-col items-center z-10 w-16">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                activeFeatureCount > 0 ? 'bg-green-100 border-green-300' : 'bg-slate-100 border-slate-200'
              }`}>
                <svg className={`w-4 h-4 transition-colors ${activeFeatureCount > 0 ? 'text-green-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-[10px] text-slate-500 mt-1.5 font-medium">Safe</span>
            </div>
          </div>
        </div>

        {/* Two-column layout: Settings (left) + Live Preview (right) */}
        <div className="flex-1 grid grid-cols-5 gap-4 min-h-0">
          {/* Left column - Accordion Settings */}
          <div className="col-span-3 overflow-y-auto pr-1 space-y-2">
            {SECTIONS.map(({ id, label, icon, description: desc }) => {
              const active = sectionActive(id);
              const isExpanded = expandedSection === id;
              const colors = pipelineColors[id];

              return (
                <div key={id} className={`rounded-xl border transition-all duration-200 ${
                  isExpanded ? `${colors.bg} ${colors.border} shadow-sm` : 'bg-white border-slate-200 hover:border-slate-300'
                }`}>
                  {/* Accordion header */}
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-lg flex-shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{label}</span>
                        {active && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">ACTIVE</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                    </div>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Accordion content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-200/60">
                      {id === 'content' && <ContentFilterPanel filters={contentFilters} onChange={setContentFilters} />}
                      {id === 'pii' && <PiiDetectionPanel entities={piiEntities} onChange={setPiiEntities} />}
                      {id === 'topics' && <DeniedTopicsPanel topics={deniedTopics} onChange={setDeniedTopics} />}
                      {id === 'words' && <WordFiltersPanel config={wordFilter} onChange={setWordFilter} />}
                      {id === 'grounding' && <ContextualGroundingPanel config={contextualGrounding} onChange={setContextualGrounding} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right column - Sticky Live Preview */}
          <div className="col-span-2 overflow-y-auto">
            <div className="sticky top-0 bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col">
              {/* Preview header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${activeFeatureCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="text-xs font-semibold text-slate-700">Live Preview</span>
                <span className="ml-auto text-[10px] text-slate-400">{activeFeatureCount} layer{activeFeatureCount !== 1 ? 's' : ''} applied</span>
              </div>

              {/* Preview content */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto text-sm leading-relaxed">
                {activeFeatureCount === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
                    <svg className="w-12 h-12 text-slate-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-500">No protection layers active</p>
                    <p className="text-xs text-slate-400 mt-1">Enable guardrails to see live redaction preview</p>
                  </div>
                ) : (
                  <>
                    {/* Sample conversation */}
                    <div className="space-y-3">
                      {/* User message */}
                      <div className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-blue-600">U</span>
                        </div>
                        <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-xs text-slate-700 leading-relaxed">
                            Hi, my name is{' '}
                            <span className={`transition-all duration-300 ${hasPii('NAME') ? 'bg-amber-200 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] line-through decoration-amber-500' : ''}`}>
                              {hasPii('NAME') ? 'John Smith' : 'John Smith'}
                            </span>
                            . My credit card number is{' '}
                            <span className={`transition-all duration-300 ${hasPii('CREDIT_DEBIT_CARD_NUMBER') ? 'bg-amber-200 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] line-through decoration-amber-500' : ''}`}>
                              {hasPii('CREDIT_DEBIT_CARD_NUMBER') ? '4532-8901-2345-6789' : '4532-8901-2345-6789'}
                            </span>
                            {' '}and my SSN is{' '}
                            <span className={`transition-all duration-300 ${hasPii('US_SOCIAL_SECURITY_NUMBER') ? 'bg-amber-200 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] line-through decoration-amber-500' : ''}`}>
                              {hasPii('US_SOCIAL_SECURITY_NUMBER') ? '123-45-6789' : '123-45-6789'}
                            </span>
                            . You can reach me at{' '}
                            <span className={`transition-all duration-300 ${hasPii('EMAIL') ? 'bg-amber-200 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] line-through decoration-amber-500' : ''}`}>
                              {hasPii('EMAIL') ? 'john@bank.com' : 'john@bank.com'}
                            </span>
                            {' '}or{' '}
                            <span className={`transition-all duration-300 ${hasPii('PHONE') ? 'bg-amber-200 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] line-through decoration-amber-500' : ''}`}>
                              {hasPii('PHONE') ? '(555) 123-4567' : '(555) 123-4567'}
                            </span>.
                          </p>
                        </div>
                      </div>

                      {/* PII redaction output */}
                      {piiEntities.length > 0 && (
                        <div className="ml-8 bg-amber-50 rounded-lg p-3 border border-amber-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">PII Redacted Output</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            Hi, my name is{' '}
                            <span className="bg-amber-300/60 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] font-bold">
                              {hasPii('NAME') ? '[NAME]' : 'John Smith'}
                            </span>
                            . My credit card number is{' '}
                            <span className="bg-amber-300/60 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] font-bold">
                              {hasPii('CREDIT_DEBIT_CARD_NUMBER') ? '[CARD ████]' : '4532-8901-2345-6789'}
                            </span>
                            {' '}and my SSN is{' '}
                            <span className="bg-amber-300/60 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] font-bold">
                              {hasPii('US_SOCIAL_SECURITY_NUMBER') ? '[SSN ████]' : '123-45-6789'}
                            </span>
                            . You can reach me at{' '}
                            <span className="bg-amber-300/60 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] font-bold">
                              {hasPii('EMAIL') ? '[EMAIL]' : 'john@bank.com'}
                            </span>
                            {' '}or{' '}
                            <span className="bg-amber-300/60 text-amber-900 px-1 py-0.5 rounded font-mono text-[10px] font-bold">
                              {hasPii('PHONE') ? '[PHONE]' : '(555) 123-4567'}
                            </span>.
                          </p>
                        </div>
                      )}

                      {/* Content filter example */}
                      {contentFilters.length > 0 && (
                        <div className="ml-8 bg-red-50 rounded-lg p-3 border border-red-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wide">Content Blocked</span>
                          </div>
                          <p className="text-xs text-red-700 line-through decoration-red-400">
                            "How to manipulate stock prices and deceive investors..."
                          </p>
                          <p className="text-[10px] text-red-500 mt-1 italic">Content filter triggered - response blocked</p>
                        </div>
                      )}

                      {/* Denied topics example */}
                      {deniedTopics.length > 0 && (
                        <div className="ml-8 bg-purple-50 rounded-lg p-3 border border-purple-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <svg className="w-3 h-3 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Topic Denied</span>
                          </div>
                          <p className="text-xs text-purple-700 line-through decoration-purple-400">
                            "Here is some insider trading information about the merger..."
                          </p>
                          <p className="text-[10px] text-purple-500 mt-1 italic">
                            Blocked topic{deniedTopics.length > 1 ? 's' : ''}: {deniedTopics.slice(0, 3).map(t => t.name).join(', ')}{deniedTopics.length > 3 ? '...' : ''}
                          </p>
                        </div>
                      )}

                      {/* Word filter example */}
                      {(wordFilter.enable_profanity || wordFilter.blocked_words.length > 0) && (
                        <div className="ml-8 bg-orange-50 rounded-lg p-3 border border-orange-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <svg className="w-3 h-3 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                            </svg>
                            <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wide">Words Filtered</span>
                          </div>
                          <p className="text-xs text-orange-700">
                            {wordFilter.enable_profanity && <span className="line-through decoration-orange-400">Profanity detected</span>}
                            {wordFilter.blocked_words.length > 0 && (
                              <span className="block mt-1">
                                Blocked: {wordFilter.blocked_words.slice(0, 5).map((w, i) => (
                                  <span key={i} className="inline-block bg-orange-200 text-orange-800 px-1 py-0.5 rounded text-[10px] font-mono mr-1 line-through">{w}</span>
                                ))}
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Contextual grounding example */}
                      {contextualGrounding.enabled && (
                        <div className="ml-8 bg-teal-50 rounded-lg p-3 border border-teal-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <svg className="w-3 h-3 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Grounding Check</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-teal-700">Grounding score</span>
                              <span className="font-mono font-bold text-teal-800">{contextualGrounding.grounding_threshold}</span>
                            </div>
                            <div className="w-full bg-teal-200 rounded-full h-1.5">
                              <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${contextualGrounding.grounding_threshold * 100}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-teal-700">Relevance score</span>
                              <span className="font-mono font-bold text-teal-800">{contextualGrounding.relevance_threshold}</span>
                            </div>
                            <div className="w-full bg-teal-200 rounded-full h-1.5">
                              <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${contextualGrounding.relevance_threshold * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Step: Review & Create ---
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Review & Create</h2>
          <p className="text-sm text-slate-500 mt-1">Confirm your guardrail configuration</p>
        </div>
        <button onClick={() => setStep('configure')} className="btn-secondary text-sm">Back to Configure</button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Name and description */}
      <div className="card space-y-4">
        <div>
          <label className="label">Guardrail Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., FSI Production Guardrail"
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this guardrail for?"
            className="input-field w-full resize-none"
            rows={2}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Configuration Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-900">{contentFilters.length}</p>
            <p className="text-[10px] text-slate-500 uppercase">Content Filters</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-900">{piiEntities.length}</p>
            <p className="text-[10px] text-slate-500 uppercase">PII Entities</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-900">{deniedTopics.length}</p>
            <p className="text-[10px] text-slate-500 uppercase">Denied Topics</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-900">{wordFilter.blocked_words.length + (wordFilter.enable_profanity ? 1 : 0)}</p>
            <p className="text-[10px] text-slate-500 uppercase">Word Rules</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-900">{contextualGrounding.enabled ? '✓' : '—'}</p>
            <p className="text-[10px] text-slate-500 uppercase">Grounding</p>
          </div>
        </div>
      </div>

      {/* Data Flow */}
      <DataFlowVisualizer
        contentFilters={contentFilters}
        piiEntities={piiEntities}
        deniedTopics={deniedTopics}
        wordFilter={wordFilter}
        contextualGrounding={contextualGrounding}
      />

      {/* Create button */}
      <button
        onClick={handleCreate}
        disabled={creating || !name.trim()}
        className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating Guardrail...
          </span>
        ) : (
          'Create Guardrail Template'
        )}
      </button>
    </div>
  );
}
