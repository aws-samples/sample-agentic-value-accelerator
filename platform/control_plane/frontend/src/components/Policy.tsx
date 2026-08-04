import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PolicyAuditLog from './policies/PolicyAuditLog';
import PolicyObservability from './policies/PolicyObservability';
import PolicyPlayground from './policies/PolicyPlayground';
import PolicyTools from './policies/PolicyTools';
import PolicyEngineList from './policies/PolicyEngineList';
import PolicyListForEngine from './policies/PolicyListForEngine';
import CreateEngineModal from './policies/CreateEngineModal';
import PolicyCreateFlow from './policies/PolicyCreateFlow';
import { Icon } from './govern/icons';

type Tab = 'engines' | 'observability' | 'playground' | 'tools' | 'audit';

export default function Policy({ initialTab }: { initialTab?: Tab }) {
  const navigate = useNavigate();
  const activeTab: Tab = initialTab || 'engines';

  // Engine-first navigation: engine list -> policies in engine -> create policy
  const [selectedEngine, setSelectedEngine] = useState<{ id: string; name: string } | null>(null);
  const [showCreateEngine, setShowCreateEngine] = useState(false);
  const [creatingPolicyForEngine, setCreatingPolicyForEngine] = useState<{ id: string; name: string } | null>(null);

  const tabs: { id: Tab; label: string; path: string; icon: React.ReactNode }[] = [
    {
      id: 'engines',
      label: 'Policy Engines',
      path: '/secure/policy',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      ),
    },
    {
      id: 'observability',
      label: 'Observability',
      path: '/secure/policy/observability',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
    {
      id: 'playground',
      label: 'Playground',
      path: '/secure/policy/playground',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
      ),
    },
    {
      id: 'tools',
      label: 'Tools',
      path: '/secure/policy/tools',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
        </svg>
      ),
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      path: '/secure/policy/audit',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.888L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <Link to="/secure" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            &larr; Back to Secure
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">AgentCore Policy</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Define resource-level operational policies for your agents — control what they can do, access, and execute.
          </p>
        </div>

        {/* Governance Context Links */}
        <div className="mb-6 flex items-center gap-4 text-sm animate-fade-in stagger-1">
          <span className="text-slate-400">Governance:</span>
          <Link
            to="/govern/compliance"
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-violet-600 transition-colors"
          >
            <Icon name="scale" className="w-4 h-4" />
            Framework Mapping
          </Link>
          <Link
            to="/govern/agents"
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-violet-600 transition-colors"
          >
            <Icon name="user-group" className="w-4 h-4" />
            Agent Authorization Matrix
          </Link>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-8 p-1 bg-slate-100/80 rounded-xl w-fit animate-fade-in stagger-2">
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
        <div className="animate-fade-in stagger-3">
          {activeTab === 'observability' && <PolicyObservability />}
          {activeTab === 'playground' && <PolicyPlayground />}
          {activeTab === 'tools' && <PolicyTools />}
          {activeTab === 'audit' && <PolicyAuditLog />}
          {activeTab === 'engines' && (
            <>
              {creatingPolicyForEngine ? (
                <PolicyCreateFlow
                  engineId={creatingPolicyForEngine.id}
                  engineName={creatingPolicyForEngine.name}
                  onComplete={() => setCreatingPolicyForEngine(null)}
                  onBack={() => setCreatingPolicyForEngine(null)}
                />
              ) : selectedEngine ? (
                <PolicyListForEngine
                  engineId={selectedEngine.id}
                  engineName={selectedEngine.name}
                  onCreatePolicy={() => setCreatingPolicyForEngine(selectedEngine)}
                  onBack={() => setSelectedEngine(null)}
                />
              ) : (
                <PolicyEngineList
                  onSelectEngine={(id, name) => setSelectedEngine({ id, name })}
                  onCreateEngine={() => setShowCreateEngine(true)}
                />
              )}
              {showCreateEngine && (
                <CreateEngineModal
                  onClose={() => setShowCreateEngine(false)}
                  onCreated={() => setShowCreateEngine(false)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
