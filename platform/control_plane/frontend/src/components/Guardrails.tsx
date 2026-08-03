import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GuardrailBuilder from './guardrails/GuardrailBuilder';
import GuardrailTemplateList from './guardrails/GuardrailTemplateList';
import FSIGuardrailTemplates, { type FSITemplate } from './guardrails/FSIGuardrailTemplates';
import GuardrailPlayground from './guardrails/GuardrailPlayground';
import GuardrailVersionHistory from './guardrails/GuardrailVersionHistory';
import GuardrailComparison from './guardrails/GuardrailComparison';
import GuardrailImportExport from './guardrails/GuardrailImportExport';
import AutomatedReasoningPanel from './guardrails/AutomatedReasoningPanel';
import RegexPatternBuilder from './guardrails/RegexPatternBuilder';
import GuardrailMetricsDashboard from './guardrails/GuardrailMetricsDashboard';
import GuardrailRealtimeFeed from './guardrails/GuardrailRealtimeFeed';
import GuardrailAlerting from './guardrails/GuardrailAlerting';
import GuardrailComplianceReports from './guardrails/GuardrailComplianceReports';
import GuardrailAuditTrail from './guardrails/GuardrailAuditTrail';
import GuardrailCoverageDashboard from './guardrails/GuardrailCoverageDashboard';
import GuardrailTestSuite from './guardrails/GuardrailTestSuite';
import DeniedTopicsBuilder from './guardrails/DeniedTopicsBuilder';
import GroundingThresholdTuner from './guardrails/GroundingThresholdTuner';
import { GuardrailsGuide } from './govern/ModuleGuide';
import { Icon } from './govern/icons';
import type { IconName } from './govern/icons';

type Tab = 'builder' | 'templates' | 'observability' | 'fsi-library' | 'playground' | 'tools';

export default function Guardrails({ initialTab }: { initialTab?: Tab }) {
  const navigate = useNavigate();
  const activeTab: Tab = initialTab || 'templates';
  const [selectedFSITemplate, setSelectedFSITemplate] = useState<FSITemplate | null>(null);
  const [activeToolPanel, setActiveToolPanel] = useState<'history' | 'compare' | 'import-export' | 'reasoning' | 'regex' | 'topics' | 'grounding' | null>(null);
  const [activeObservabilityPanel, setActiveObservabilityPanel] = useState<'metrics' | 'feed' | 'alerting' | 'coverage' | 'validation' | 'reports' | 'audit' | null>('metrics');

  const tabs: { id: Tab; label: string; path: string; icon: React.ReactNode }[] = [
    {
      id: 'templates',
      label: 'My Guardrails',
      path: '/secure/guardrails',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
        </svg>
      ),
    },
    {
      id: 'builder',
      label: 'Create Guardrail',
      path: '/secure/guardrails/create',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
    {
      id: 'observability',
      label: 'Observability',
      path: '/secure/guardrails/observability',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
    {
      id: 'fsi-library',
      label: 'Template Library',
      path: '/secure/guardrails/fsi-library',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
        </svg>
      ),
    },
    {
      id: 'playground',
      label: 'Playground',
      path: '/secure/guardrails/playground',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'tools',
      label: 'Tools',
      path: '/secure/guardrails/tools',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Guardrails</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Configure safety controls for your AI agents — content filtering, PII detection, prompt injection protection, and more.
          </p>
        </div>

        {/* Governance Context Links */}
        <div className="mb-6 flex items-center gap-4 text-sm animate-fade-in stagger-1">
          <span className="text-slate-400">Governance:</span>
          <Link
            to="/govern/audit"
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-violet-600 transition-colors"
          >
            <Icon name="clipboard-document-check" className="w-4 h-4" />
            Compliance Audit Trail
          </Link>
          <Link
            to="/govern/prompt-governance"
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-violet-600 transition-colors"
          >
            <Icon name="chart-bar" className="w-4 h-4" />
            Guardrail Analytics
          </Link>
        </div>

        {/* Getting Started Guide */}
        <div className="mb-6 animate-fade-in stagger-2">
          <GuardrailsGuide
            onNavigate={(nav) => {
              if (nav === 'fsi-library') navigate('/secure/guardrails/fsi-library');
              else if (nav === 'create') navigate('/secure/guardrails/create');
              else if (nav === 'templates') navigate('/secure/guardrails');
              else if (nav === 'observability') navigate('/secure/guardrails/observability');
            }}
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-8 p-1 bg-slate-100/80 rounded-xl w-fit animate-fade-in stagger-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in stagger-4">
          {activeTab === 'templates' && <GuardrailTemplateList onCreateNew={() => navigate('/secure/guardrails/create')} />}
          {activeTab === 'builder' && (
            <GuardrailBuilder
              onComplete={() => {
                setSelectedFSITemplate(null);
                navigate('/secure/guardrails');
              }}
              initialFSITemplate={selectedFSITemplate || undefined}
            />
          )}
          {activeTab === 'observability' && (
            <div className="space-y-6">
              {/* Observability Sub-tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                {([
                  { id: 'metrics', label: 'Metrics', icon: 'chart-bar' },
                  { id: 'feed', label: 'Live Feed', icon: 'signal' },
                  { id: 'alerting', label: 'Alerting', icon: 'bell-alert' },
                  { id: 'coverage', label: 'Coverage', icon: 'globe-alt' },
                  { id: 'validation', label: 'Validation', icon: 'check' },
                  { id: 'reports', label: 'Reports', icon: 'clipboard' },
                  { id: 'audit', label: 'Audit Trail', icon: 'document' },
                ] as { id: string; label: string; icon: IconName }[]).map(panel => (
                  <button
                    key={panel.id}
                    onClick={() => setActiveObservabilityPanel(panel.id as typeof activeObservabilityPanel)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      activeObservabilityPanel === panel.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon name={panel.icon} className="w-3.5 h-3.5" />
                    {panel.label}
                  </button>
                ))}
              </div>

              {/* Observability Content */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                {activeObservabilityPanel === 'metrics' && <GuardrailMetricsDashboard />}
                {activeObservabilityPanel === 'feed' && <GuardrailRealtimeFeed />}
                {activeObservabilityPanel === 'alerting' && <GuardrailAlerting />}
                {activeObservabilityPanel === 'coverage' && <GuardrailCoverageDashboard />}
                {activeObservabilityPanel === 'validation' && <GuardrailTestSuite />}
                {activeObservabilityPanel === 'reports' && <GuardrailComplianceReports />}
                {activeObservabilityPanel === 'audit' && <GuardrailAuditTrail />}
              </div>
            </div>
          )}
          {activeTab === 'fsi-library' && (
            <FSIGuardrailTemplates
              onApplyTemplate={(template) => {
                setSelectedFSITemplate(template);
                navigate('/secure/guardrails/create');
              }}
            />
          )}
          {activeTab === 'playground' && (
            <GuardrailPlayground guardrailName="Selected Guardrail" />
          )}
          {activeTab === 'tools' && (
            <div className="space-y-6">
              {/* Tool Selection Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {([
                  { id: 'history', label: 'Version History', icon: 'document', desc: 'Track changes across versions', color: 'blue' },
                  { id: 'compare', label: 'Compare', icon: 'scale', desc: 'Side-by-side comparison', color: 'violet' },
                  { id: 'import-export', label: 'Import/Export', icon: 'archive-box', desc: 'Share configs', color: 'emerald' },
                  { id: 'reasoning', label: 'Reasoning Panel', icon: 'brain', desc: 'Configure reasoning', color: 'purple' },
                  { id: 'regex', label: 'Regex Builder', icon: 'font', desc: 'Custom patterns', color: 'amber' },
                  { id: 'topics', label: 'Topics Builder', icon: 'no-symbol', desc: 'Visual topic builder', color: 'red' },
                  { id: 'grounding', label: 'Grounding Tuner', icon: 'map-pin', desc: 'Tune thresholds', color: 'teal' },
                ] as { id: string; label: string; icon: IconName; desc: string; color: string }[]).map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveToolPanel(activeToolPanel === tool.id ? null : tool.id as typeof activeToolPanel)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      activeToolPanel === tool.id
                        ? `border-${tool.color}-500 bg-${tool.color}-50`
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <Icon name={tool.icon} className="w-7 h-7 mb-2 text-slate-700" />
                    <h3 className="text-sm font-semibold text-slate-900">{tool.label}</h3>
                    <p className="text-xs text-slate-500 mt-1">{tool.desc}</p>
                  </button>
                ))}
              </div>

              {/* Active Tool Panel */}
              {activeToolPanel && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  {activeToolPanel === 'history' && (
                    <GuardrailVersionHistory
                      guardrailId="gr-001"
                      guardrailName="FSI Standard"
                      onClose={() => setActiveToolPanel(null)}
                    />
                  )}
                  {activeToolPanel === 'compare' && (
                    <GuardrailComparison
                      availableGuardrails={[]}
                      onClose={() => setActiveToolPanel(null)}
                    />
                  )}
                  {activeToolPanel === 'import-export' && (
                    <GuardrailImportExport onClose={() => setActiveToolPanel(null)} />
                  )}
                  {activeToolPanel === 'reasoning' && (
                    <AutomatedReasoningPanel
                      enabled={true}
                      onClose={() => setActiveToolPanel(null)}
                    />
                  )}
                  {activeToolPanel === 'regex' && (
                    <RegexPatternBuilder onClose={() => setActiveToolPanel(null)} />
                  )}
                  {activeToolPanel === 'topics' && (
                    <DeniedTopicsBuilder onClose={() => setActiveToolPanel(null)} />
                  )}
                  {activeToolPanel === 'grounding' && (
                    <GroundingThresholdTuner onClose={() => setActiveToolPanel(null)} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
