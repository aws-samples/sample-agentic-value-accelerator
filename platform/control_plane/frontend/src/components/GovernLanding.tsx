/**
 * GovernLanding — Hub page for Governance module
 *
 * Displays cards for each governance capability, linking to dedicated pages.
 * Pattern mirrors PlanLanding.tsx — simple hub with hero illustrations per card.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProgramProgress from './govern/ProgramProgress';
import ConnectionWizard from './govern/ConnectionWizard';
import { governDeveloperAiApi } from '../api/client';
import CoreBadge, { CorePillarLegend, CORE_MODULES, getModulePillar } from './govern/CoreBadge';

// Shadow AI Alert Banner — shows when there are critical/high issues
function ShadowAIAlertBanner() {
  const [shadowData, setShadowData] = useState<{ critical: number; high: number; total: number } | null>(null);
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem('shadow-ai-banner-dismissed') === 'true'
  );

  useEffect(() => {
    if (dismissed) return;
    governDeveloperAiApi.shadowAi()
      .then(d => {
        const critical = d.unapproved_users?.length || 0;
        const high = d.unknown_tools?.length || 0;
        const models = d.unapproved_models?.length || 0;
        setShadowData({ critical, high, total: critical + high + models });
      })
      .catch(() => {
        // Use mock data for illustration
        setShadowData({ critical: 2, high: 3, total: 7 });
      });
  }, [dismissed]);

  if (dismissed || !shadowData || shadowData.total === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('shadow-ai-banner-dismissed', 'true');
  };

  return (
    <div className="mb-4 bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200 rounded-xl p-4 shadow-sm animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-rose-800">Shadow AI Detected</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">
                {shadowData.total} issues
              </span>
              {shadowData.critical > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-semibold">
                  {shadowData.critical} critical
                </span>
              )}
            </div>
            <p className="text-xs text-rose-700 mt-0.5">
              Unapproved users, unknown tools, or unauthorized models accessing your AI infrastructure.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/govern/shadow-ai"
            className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
          >
            Review & Remediate
          </Link>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-rose-400 hover:text-rose-600 rounded transition-colors"
            title="Dismiss for this session"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

type Illustration =
  | 'command-center'
  | 'trust-stack'
  | 'fleet'
  | 'agents'
  | 'risk'
  | 'models'
  | 'shadow-ai'
  | 'developer-ai'
  | 'compliance'
  | 'finops'
  | 'audit'
  | 'data'
  | 'playbook'
  | 'multi-cloud'
  | 'dev-tools'
  | 'vendors'
  | 'safety';

interface GovItem {
  id: string;
  path: string;
  name: string;
  tagline: string;
  description: string;
  iconBg: string;
  iconPath: string;
  illustration?: Illustration;
  tags: string[];
  stats?: { label: string; value: string }[];
  isCore?: boolean;
  pillar?: 'see' | 'govern' | 'show';
}

const GOV_ITEMS: GovItem[] = [
  {
    id: 'command-center',
    path: '/govern/command-center',
    name: 'Command Center',
    tagline: 'AI governance across AVA.',
    description: 'See how governance integrates across Plan → Build → Secure → Operate. Real-time trust scores, compliance posture, risk exposure, and alerts.',
    iconBg: 'from-indigo-500 to-blue-600',
    iconPath: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6',
    illustration: 'command-center',
    tags: ['Platform view', 'Trust scores', 'Alerts'],
    stats: [
      { label: 'Modules', value: '15' },
      { label: 'Updates', value: 'Live' },
    ],
    isCore: true,
    pillar: 'see',
  },
  {
    id: 'trust-stack',
    path: '/govern/trust-stack',
    name: 'Trust Stack',
    tagline: 'Foundation → Production → Scale.',
    description: 'Deep dive into the 3-layer model: AWS services, key controls, 3 Lines of Defense activities. Build out your governance maturity.',
    iconBg: 'from-blue-500 to-indigo-600',
    iconPath: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    illustration: 'trust-stack',
    tags: ['3 layers', 'AWS services', '3LoD'],
    stats: [
      { label: 'Layers', value: '3' },
      { label: 'Controls', value: '45+' },
    ],
  },
  {
    id: 'data',
    path: '/govern/data',
    name: 'Data Governance',
    tagline: 'AI-ready data.',
    description: 'Data quality, lineage, provenance, domains, and access control. Ensure your AI models consume trusted, governed data.',
    iconBg: 'from-cyan-500 to-blue-600',
    iconPath: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
    illustration: 'data',
    tags: ['Readiness', 'Lineage', 'Quality', 'Domains'],
    stats: [
      { label: 'Score', value: '69/100' },
      { label: 'Domains', value: '6' },
    ],
    isCore: true,
    pillar: 'show',
  },
  {
    id: 'models',
    path: '/govern/models',
    name: 'Model Management',
    tagline: 'Govern your models.',
    description: 'Model registry, lifecycle management, evaluations, and monitoring. Track risk tiers, validation status, and cost per model.',
    iconBg: 'from-violet-500 to-purple-600',
    iconPath: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
    illustration: 'models',
    tags: ['Registry', 'Lifecycle', 'Evaluations'],
    stats: [
      { label: 'Models', value: '5' },
      { label: 'Use cases', value: '33' },
    ],
    isCore: true,
    pillar: 'see',
  },
  {
    id: 'risk',
    path: '/govern/risk',
    name: 'Risk Management',
    tagline: 'Identify, assess, mitigate.',
    description: 'Complete risk register with heatmaps, assessments, controls library, issue tracking, and outcome monitoring. Aligned to NIST AI RMF, SR 26-2, CRI FS AI RMF.',
    iconBg: 'from-violet-500 to-purple-600',
    iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    illustration: 'risk',
    tags: ['Risk register', 'Heatmaps', 'Outcomes', 'Controls'],
    stats: [
      { label: 'Categories', value: '10' },
      { label: 'Controls', value: '25+' },
    ],
  },
  {
    id: 'safety',
    path: '/govern/safety',
    name: 'AI Safety',
    tagline: 'Capability safety & assurance.',
    description: 'Frontier capability thresholds, MAESTRO threat modeling, safety cases, incident management, and red-team evals — organized on AWS\'s 8 Responsible-AI dimensions.',
    iconBg: 'from-indigo-500 to-blue-600',
    iconPath: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    illustration: 'safety',
    tags: ['RAI 8-dim', 'MAESTRO', 'Frontier', 'Incidents'],
    stats: [
      { label: 'Surfaces', value: '6' },
      { label: 'Frameworks', value: 'FMSF+' },
    ],
  },
  {
    id: 'fleet',
    path: '/govern/fleet',
    name: 'Agentic Fleet',
    tagline: 'Fleet-wide governance.',
    description: 'Fleet-wide governance and KPIs across your entire agent ecosystem. Monitor health, performance, and compliance status for all deployed agents.',
    iconBg: 'from-emerald-500 to-teal-600',
    iconPath: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
    illustration: 'fleet',
    tags: ['Fleet KPIs', 'Health', 'Performance'],
    stats: [
      { label: 'Agents', value: '18' },
      { label: 'Health', value: '94%' },
    ],
    isCore: true,
    pillar: 'see',
  },
  {
    id: 'agents',
    path: '/govern/agents',
    name: 'Agent Registry',
    tagline: 'Centralized inventory.',
    description: 'Centralized registry of all AI agents, tools, MCP servers, capabilities, and permissions. Complete inventory across AWS, Azure, GCP, and SaaS platforms.',
    iconBg: 'from-violet-500 to-indigo-600',
    iconPath: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    illustration: 'agents',
    tags: ['Inventory', 'Multi-cloud', 'Permissions'],
    stats: [
      { label: 'Registered', value: '24' },
      { label: 'Providers', value: '4' },
    ],
    isCore: true,
    pillar: 'see',
  },
  {
    id: 'shadow-ai',
    path: '/govern/shadow-ai',
    name: 'Shadow AI',
    tagline: 'Find the ungoverned.',
    description: 'Discover unapproved agents, models, tools, and API keys before they become incidents. Track governed-vs-shadow coverage and route discovered assets onto the governed path.',
    iconBg: 'from-rose-500 to-orange-600',
    iconPath: 'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88',
    illustration: 'shadow-ai',
    tags: ['Detection', 'Coverage', 'Onboarding'],
    stats: [
      { label: 'Detected', value: '7' },
      { label: 'Critical', value: '2' },
    ],
  },
  {
    id: 'prompt-governance',
    path: '/govern/prompt-governance',
    name: 'Prompt Governance',
    tagline: 'Compliance at invocation.',
    description: 'Full prompt compliance pipeline: pre-invocation analysis, guardrail enforcement, grounding verification, reasoning trace analysis, and policy violation mapping.',
    iconBg: 'from-violet-500 to-purple-600',
    iconPath: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
    illustration: 'compliance',
    tags: ['PII', 'Guardrails', 'Grounding', 'Policy'],
    stats: [
      { label: 'Flagged', value: '3' },
      { label: 'Blocked', value: '1' },
    ],
    isCore: true,
    pillar: 'govern',
  },
  {
    id: 'developer-ai',
    path: '/govern/developer-ai',
    name: 'Developer AI Usage',
    tagline: 'Track coding tool spend.',
    description: 'Monitor developer AI tool consumption (tokens, cost), detect spend anomalies and runaway loops, and identify shadow AI usage from unapproved users, tools, or models.',
    iconBg: 'from-indigo-500 to-purple-600',
    iconPath: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
    illustration: 'developer-ai',
    tags: ['Usage', 'Anomalies', 'Shadow AI'],
    stats: [
      { label: 'Active Users', value: '89' },
      { label: 'Alerts', value: '4' },
    ],
  },
  {
    id: 'compliance',
    path: '/govern/compliance',
    name: 'Compliance Center',
    tagline: 'Stay audit-ready.',
    description: 'Interactive checklists for SR 26-2, NIST AI RMF, EU AI Act, CRI FS AI RMF, OSFI E-23, ISO 42001, OWASP LLM, MITRE ATLAS, and NAIC. Track control status, evidence, and gaps.',
    iconBg: 'from-purple-500 to-fuchsia-600',
    iconPath: 'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
    illustration: 'compliance',
    tags: ['SR 26-2', 'NIST AI RMF', 'EU AI Act', 'CRI FS'],
    stats: [
      { label: 'Frameworks', value: '13' },
      { label: 'Controls', value: '200+' },
    ],
    isCore: true,
    pillar: 'govern',
  },
  {
    id: 'finops',
    path: '/govern/finops',
    name: 'Cost & FinOps',
    tagline: 'Control AI spend.',
    description: 'Budget tracking, spend velocity, cost by model and BU, anomaly detection, and optimization recommendations.',
    iconBg: 'from-fuchsia-500 to-pink-600',
    iconPath: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
    illustration: 'finops',
    tags: ['Budgets', 'Anomalies', 'Optimizations'],
    stats: [
      { label: 'Health', value: '72' },
      { label: 'Savings', value: '$4.8k' },
    ],
    isCore: true,
    pillar: 'see',
  },
  {
    id: 'audit',
    path: '/govern/audit',
    name: 'Audit & Incidents',
    tagline: 'Track every event.',
    description: 'Guardrail activity feed, incident management, audit logs, and compliance evidence. Full traceability for regulators.',
    iconBg: 'from-pink-500 to-rose-600',
    iconPath: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    illustration: 'audit',
    tags: ['Activity feed', 'Incidents', 'Audit trail'],
    stats: [
      { label: 'Events', value: '156' },
      { label: 'Open', value: '3' },
    ],
    isCore: true,
    pillar: 'show',
  },
  {
    id: 'playbook',
    path: '/govern/playbook',
    name: 'Governance Playbook',
    tagline: 'Autonomy, HITL, and A2A.',
    description: 'Decision framework for autonomous agents. Configure autonomy levels, design HITL gates, and establish A2A trust policies with AWS integration patterns.',
    iconBg: 'from-violet-500 to-indigo-600',
    iconPath: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
    illustration: 'playbook',
    tags: ['Autonomy', 'HITL Gates', 'A2A Trust'],
    stats: [
      { label: 'Levels', value: '4' },
      { label: 'Patterns', value: '12' },
    ],
  },
  {
    id: 'multi-cloud',
    path: '/govern/multi-cloud',
    name: 'Multi-Cloud',
    tagline: 'Cross-provider governance.',
    description: 'Unified governance across AWS Bedrock, Azure AI Foundry, Google Vertex AI, and SaaS platforms. Compare capabilities, plan migrations, and enforce consistent policies.',
    iconBg: 'from-cyan-500 to-blue-600',
    iconPath: 'M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z',
    illustration: 'multi-cloud',
    tags: ['AWS', 'Azure', 'GCP', 'SaaS'],
    stats: [
      { label: 'Providers', value: '6' },
      { label: 'Coverage', value: '92%' },
    ],
  },
  {
    id: 'agentic-coding',
    path: '/govern/dev-tools',
    name: 'Agentic Coding',
    tagline: 'AI coding tool governance.',
    description: 'Govern AI-powered coding assistants — Claude Code, Kiro, Copilot, Cursor. Track API routing compliance, code context exposure, shadow usage, and enforce policies.',
    iconBg: 'from-violet-500 to-purple-600',
    iconPath: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
    illustration: 'dev-tools',
    tags: ['Claude Code', 'Kiro', 'Copilot', 'Cursor'],
    stats: [
      { label: 'Tools', value: '7' },
      { label: 'API Compliance', value: '78%' },
    ],
  },
  {
    id: 'vendors',
    path: '/govern/risk?tab=third-party',
    name: 'Third-Party Risk',
    tagline: 'Vendor AI governance.',
    description: 'Manage AI vendor risk with due diligence questionnaires, contract tracking, concentration analysis, and exit strategies for Anthropic, OpenAI, AWS Bedrock, and more.',
    iconBg: 'from-amber-500 to-orange-600',
    iconPath: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
    illustration: 'vendors',
    tags: ['TPRM', 'DDQ', 'Contracts', 'Exit Plans'],
    stats: [
      { label: 'Vendors', value: '6' },
      { label: 'DDQ Avg', value: '88%' },
    ],
  },
];

export default function GovernLanding() {
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(() => {
    // Show wizard by default unless dismissed in this session
    return sessionStorage.getItem('govern-wizard-dismissed') !== 'true';
  });
  const [showCoreOnly, setShowCoreOnly] = useState(false);

  const filteredItems = useMemo(() => {
    if (!showCoreOnly) return GOV_ITEMS;
    return GOV_ITEMS.filter(item => item.isCore);
  }, [showCoreOnly]);

  const handleDismissWizard = () => {
    setShowWizard(false);
    sessionStorage.setItem('govern-wizard-dismissed', 'true');
  };

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      {/* Ambient gradient */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(221,214,254,0.7) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(245,208,254,0.55) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(251,207,232,0.55) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />

      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="mb-3 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Home</Link>
        </div>

        {/* Hero */}
        <div className="mb-6 animate-fade-in stagger-1">
          <h1 className="text-5xl font-semibold tracking-tight leading-tight" style={{ backgroundImage: 'linear-gradient(135deg, #4338ca 0%, #8b5cf6 50%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            AI Governance, Risk, Compliance — one view.
          </h1>
          <p className="text-slate-500 mt-4 max-w-2xl">
            The AI GRC hub your executives, auditors, and engineers share. Monitor trust, track compliance, manage risk, and control cost across every agent in your fleet.
          </p>
          <div className="text-xs text-slate-400 mt-2">
            Updated {new Date().toLocaleTimeString()} · <span className="text-emerald-600 font-medium">● Live</span>
          </div>
        </div>

        {/* Shadow AI Alert Banner — shows when issues detected */}
        <ShadowAIAlertBanner />

        {/* Connection Wizard — compact status bar, expands for details */}
        {showWizard && (
          <div className="mb-4 animate-fade-in stagger-1">
            <ConnectionWizard onDismiss={handleDismissWizard} />
          </div>
        )}

        {/* Getting Started — role entry points + live program spine, unified */}
        <ProgramProgress />

        {/* Core filter toggle + pillar legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 animate-fade-in stagger-2">
          <CorePillarLegend />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">View:</span>
            <button
              onClick={() => setShowCoreOnly(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                !showCoreOnly
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Modules
            </button>
            <button
              onClick={() => setShowCoreOnly(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                showCoreOnly
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
              Core Only
            </button>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in stagger-2">
          {filteredItems.map((item) => (
            <GovCard key={item.id} item={item} onClick={() => navigate(item.path)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GovCard({ item, onClick }: { item: GovItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/70 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300/60 transition-all duration-300 flex flex-col"
    >
      {/* Hero illustration */}
      <div className="relative h-20 overflow-hidden flex-shrink-0">
        {item.illustration === 'command-center' && <CommandCenterArt />}
        {item.illustration === 'trust-stack'    && <TrustStackArt />}
        {item.illustration === 'fleet'          && <FleetArt />}
        {item.illustration === 'agents'         && <AgentsArt />}
        {item.illustration === 'risk'           && <RiskArt />}
        {item.illustration === 'safety'         && <SafetyArt />}
        {item.illustration === 'models'         && <ModelsArt />}
        {item.illustration === 'shadow-ai'      && <ShadowAIArt />}
        {item.illustration === 'developer-ai'   && <DeveloperAIArt />}
        {item.illustration === 'compliance'     && <ComplianceArt />}
        {item.illustration === 'finops'         && <FinOpsArt />}
        {item.illustration === 'audit'          && <AuditArt />}
        {item.illustration === 'data'           && <DataArt />}
        {item.illustration === 'playbook'       && <PlaybookArt />}
        {item.illustration === 'multi-cloud'    && <MultiCloudArt />}
        {item.illustration === 'dev-tools'      && <DevToolsArt />}
        {item.illustration === 'vendors'        && <VendorsArt />}

        {/* Stats floated top-right */}
        {item.stats && (
          <div className="absolute top-2 right-2 flex gap-1">
            {item.stats.map((s) => (
              <div key={s.label} className="bg-white/20 backdrop-blur-sm rounded px-2 py-0.5 border border-white/25 text-center">
                <div className="text-xs font-bold text-white leading-none">{s.value}</div>
                <div className="text-[8px] uppercase tracking-wider text-white/80 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Icon badge */}
        <div className="absolute bottom-2 left-3">
          <div className="w-9 h-9 rounded-lg bg-white/25 backdrop-blur-sm flex items-center justify-center shadow-sm ring-1 ring-white/30 group-hover:scale-110 transition-transform">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
            </svg>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{item.name}</h3>
          {item.isCore && <CoreBadge pillar={item.pillar} compact />}
        </div>
        <p className="text-xs font-medium text-slate-500 mb-2">{item.tagline}</p>
        <p className="text-xs text-slate-600 leading-relaxed mb-3 flex-1">{item.description}</p>

        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{t}</span>
          ))}
        </div>

        <div className="flex items-center text-xs font-semibold text-indigo-600 group-hover:text-indigo-700 transition-colors">
          Open
          <svg className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ───────── Hero illustrations (one per card) ───────── */

function ArtBackdrop({ from, via, to }: { from: string; via?: string; to: string }) {
  return (
    <>
      <div className={`absolute inset-0 bg-gradient-to-br ${from} ${via ?? ''} ${to}`} />
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/15" />
      <div className="absolute -top-10 -left-6 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-8 right-6 w-24 h-24 rounded-full bg-white/15 blur-2xl" />
    </>
  );
}

/* Command Center — radar pulse + KPI tiles */
function CommandCenterArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-indigo-500" via="via-blue-500" to="to-blue-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* concentric rings */}
        <g stroke="white" fill="none" strokeOpacity="0.4">
          <circle cx="80" cy="64" r="18" strokeWidth="1" />
          <circle cx="80" cy="64" r="32" strokeWidth="1" strokeOpacity="0.28" />
          <circle cx="80" cy="64" r="46" strokeWidth="1" strokeOpacity="0.18" />
        </g>
        {/* sweep */}
        <path d="M80 64 L80 18 A46 46 0 0 1 124 50 Z" fill="white" fillOpacity="0.18" />
        {/* center dot */}
        <circle cx="80" cy="64" r="4" fill="white" />
        {/* mini KPI tiles on right */}
        <g>
          <rect x="160" y="26" width="56" height="28" rx="5" fill="white" fillOpacity="0.22" />
          <rect x="222" y="26" width="56" height="28" rx="5" fill="white" fillOpacity="0.32" />
          <rect x="160" y="62" width="56" height="28" rx="5" fill="white" fillOpacity="0.32" />
          <rect x="222" y="62" width="56" height="28" rx="5" fill="white" fillOpacity="0.22" />
          {/* sparklines inside tiles */}
          <polyline points="166,46 178,40 188,44 198,36 210,38" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
          <polyline points="228,46 238,42 248,46 260,38 272,42" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
          <polyline points="166,82 178,76 188,80 198,72 210,76" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
          <polyline points="228,82 238,78 248,82 260,74 272,78" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

/* Trust Stack — three stacked layers */
function TrustStackArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-blue-500" via="via-indigo-500" to="to-indigo-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* three perspective slabs */}
        <g>
          <polygon points="80,28 240,28 268,42 52,42" fill="white" fillOpacity="0.85" />
          <polygon points="52,42 268,42 268,52 52,52" fill="white" fillOpacity="0.55" />

          <polygon points="80,58 240,58 268,72 52,72" fill="white" fillOpacity="0.65" />
          <polygon points="52,72 268,72 268,82 52,82" fill="white" fillOpacity="0.4" />

          <polygon points="80,88 240,88 268,102 52,102" fill="white" fillOpacity="0.45" />
          <polygon points="52,102 268,102 268,112 52,112" fill="white" fillOpacity="0.28" />
        </g>
        {/* layer labels */}
        <text x="160" y="38" textAnchor="middle" fill="#4338ca" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">SCALE</text>
        <text x="160" y="68" textAnchor="middle" fill="#4338ca" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">PRODUCTION</text>
        <text x="160" y="98" textAnchor="middle" fill="#4338ca" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">FOUNDATION</text>
      </svg>
    </div>
  );
}

/* Risk — 4×4 heatmap */
function RiskArt() {
  // intensity drives opacity; simulates risk severity
  const cells: { x: number; y: number; op: number }[] = [];
  const intensities = [
    [0.25, 0.35, 0.55, 0.85],
    [0.3,  0.5,  0.7,  0.95],
    [0.4,  0.55, 0.45, 0.7],
    [0.5,  0.4,  0.35, 0.55],
  ];
  const startX = 100;
  const startY = 16;
  const size = 22;
  const gap = 4;
  intensities.forEach((row, ri) => {
    row.forEach((op, ci) => {
      cells.push({ x: startX + ci * (size + gap), y: startY + ri * (size + gap), op });
    });
  });
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-violet-500" via="via-purple-500" to="to-purple-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* axis labels */}
        <text x="86" y="29" textAnchor="end" fill="white" fillOpacity="0.7" fontSize="8" fontFamily="Inter, sans-serif">High</text>
        <text x="86" y="55" textAnchor="end" fill="white" fillOpacity="0.7" fontSize="8" fontFamily="Inter, sans-serif">Med</text>
        <text x="86" y="81" textAnchor="end" fill="white" fillOpacity="0.7" fontSize="8" fontFamily="Inter, sans-serif">Low</text>
        <text x="86" y="107" textAnchor="end" fill="white" fillOpacity="0.7" fontSize="8" fontFamily="Inter, sans-serif">Min</text>
        {cells.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={size} height={size} rx="3" fill="white" fillOpacity={c.op} />
        ))}
        {/* impact axis */}
        <text x="111" y="122" fill="white" fillOpacity="0.7" fontSize="8" fontFamily="Inter, sans-serif">Likelihood →</text>
      </svg>
    </div>
  );
}

/* Safety — assurance shield with the ring of 8 Responsible-AI dimensions */
function SafetyArt() {
  // 8 RAI dimensions as a ring of dots around the shield; two show as "gaps"
  const dims = Array.from({ length: 8 }).map((_, i) => {
    const angle = (i * 45 - 90) * Math.PI / 180;
    return { x: 232 + Math.cos(angle) * 30, y: 64 + Math.sin(angle) * 30, gap: i === 3 || i === 6 };
  });
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-indigo-500" via="via-blue-500" to="to-blue-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* assurance shield with check */}
        <path d="M96 20 L128 30 L128 66 C128 84 114 98 96 106 C78 98 64 84 64 66 L64 30 Z"
          fill="white" fillOpacity="0.9" />
        <path d="M82 62 L92 73 L112 49" fill="none" stroke="#2563eb" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {/* RAI 8-dimension coverage ring */}
        <circle cx="232" cy="64" r="30" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="1" />
        {dims.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="5" fill="white" fillOpacity={d.gap ? 0.35 : 0.9} />
        ))}
        <text x="232" y="68" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">RAI</text>
      </svg>
    </div>
  );
}

/* Models — registry cards stacked diagonally */
function ModelsArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-purple-500" via="via-fuchsia-500" to="to-fuchsia-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* back card */}
        <g transform="translate(70, 30) rotate(-6 80 30)">
          <rect width="180" height="60" rx="8" fill="white" fillOpacity="0.35" />
        </g>
        {/* mid card */}
        <g transform="translate(70, 30) rotate(-2 80 30)">
          <rect width="180" height="60" rx="8" fill="white" fillOpacity="0.55" />
        </g>
        {/* front card */}
        <g transform="translate(70, 30)">
          <rect width="180" height="60" rx="8" fill="white" fillOpacity="0.95" />
          {/* inside */}
          <rect x="14" y="12" width="44" height="6" rx="3" fill="#a21caf" fillOpacity="0.85" />
          <rect x="14" y="22" width="80" height="4" rx="2" fill="#a21caf" fillOpacity="0.4" />
          {/* badge */}
          <rect x="130" y="10" width="38" height="14" rx="7" fill="#a21caf" fillOpacity="0.18" stroke="#a21caf" strokeOpacity="0.6" strokeWidth="0.8" />
          <text x="149" y="20" textAnchor="middle" fill="#a21caf" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif">PROD</text>
          {/* lifecycle bar */}
          <rect x="14" y="36" width="152" height="6" rx="3" fill="#fae8ff" />
          <rect x="14" y="36" width="100" height="6" rx="3" fill="#a21caf" />
          {/* dots */}
          <circle cx="32" cy="50" r="3" fill="#a21caf" />
          <circle cx="62" cy="50" r="3" fill="#a21caf" />
          <circle cx="92" cy="50" r="3" fill="#a21caf" />
          <circle cx="122" cy="50" r="3" fill="#f0abfc" />
          <circle cx="152" cy="50" r="3" fill="#fae8ff" />
        </g>
      </svg>
    </div>
  );
}

/* Fleet — dashboard showing fleet-wide KPIs and health metrics */
function FleetArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-emerald-500" via="via-teal-500" to="to-teal-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* KPI tiles */}
        <g>
          <rect x="40" y="20" width="70" height="40" rx="6" fill="white" fillOpacity="0.9" />
          <text x="75" y="38" textAnchor="middle" fill="#0d9488" fontSize="16" fontWeight="700" fontFamily="Inter, sans-serif">18</text>
          <text x="75" y="52" textAnchor="middle" fill="#0d9488" fontSize="8" fontWeight="600" fontFamily="Inter, sans-serif">AGENTS</text>

          <rect x="125" y="20" width="70" height="40" rx="6" fill="white" fillOpacity="0.9" />
          <text x="160" y="38" textAnchor="middle" fill="#10b981" fontSize="16" fontWeight="700" fontFamily="Inter, sans-serif">94%</text>
          <text x="160" y="52" textAnchor="middle" fill="#0d9488" fontSize="8" fontWeight="600" fontFamily="Inter, sans-serif">HEALTHY</text>

          <rect x="210" y="20" width="70" height="40" rx="6" fill="white" fillOpacity="0.9" />
          <text x="245" y="38" textAnchor="middle" fill="#f59e0b" fontSize="16" fontWeight="700" fontFamily="Inter, sans-serif">3</text>
          <text x="245" y="52" textAnchor="middle" fill="#0d9488" fontSize="8" fontWeight="600" fontFamily="Inter, sans-serif">ALERTS</text>
        </g>
        {/* Health bar chart */}
        <g>
          <rect x="48" y="72" width="12" height="36" rx="2" fill="white" fillOpacity="0.4" />
          <rect x="48" y="76" width="12" height="32" rx="2" fill="#10b981" />

          <rect x="68" y="72" width="12" height="36" rx="2" fill="white" fillOpacity="0.4" />
          <rect x="68" y="80" width="12" height="28" rx="2" fill="#10b981" />

          <rect x="88" y="72" width="12" height="36" rx="2" fill="white" fillOpacity="0.4" />
          <rect x="88" y="84" width="12" height="24" rx="2" fill="#10b981" />

          <rect x="108" y="72" width="12" height="36" rx="2" fill="white" fillOpacity="0.4" />
          <rect x="108" y="78" width="12" height="30" rx="2" fill="#10b981" />

          <rect x="128" y="72" width="12" height="36" rx="2" fill="white" fillOpacity="0.4" />
          <rect x="128" y="88" width="12" height="20" rx="2" fill="#f59e0b" />
        </g>
        {/* Agent status dots */}
        <g>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={180 + i * 20} cy="80" r="8" fill="white" fillOpacity="0.9" />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={180 + i * 20} cy="80" r="5" fill="#10b981" />
          ))}
          <circle cx={180 + 5 * 20} cy="80" r="5" fill="#f59e0b" />

          {[0, 1, 2].map((i) => (
            <circle key={i} cx={180 + i * 20} cy="100" r="8" fill="white" fillOpacity="0.9" />
          ))}
          {[0, 1].map((i) => (
            <circle key={i} cx={180 + i * 20} cy="100" r="5" fill="#10b981" />
          ))}
          <circle cx={180 + 2 * 20} cy="100" r="5" fill="#ef4444" />
        </g>
      </svg>
    </div>
  );
}

/* Agents — registry cards showing agent inventory */
function AgentsArt() {
  const agents = [
    { x: 40, y: 20, name: 'Agent-01', status: '#10b981' },
    { x: 140, y: 20, name: 'Agent-02', status: '#10b981' },
    { x: 240, y: 20, name: 'Agent-03', status: '#f59e0b' },
    { x: 40, y: 70, name: 'Agent-04', status: '#10b981' },
    { x: 140, y: 70, name: 'Agent-05', status: '#10b981' },
    { x: 240, y: 70, name: 'Agent-06', status: '#10b981' },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-violet-500" via="via-indigo-500" to="to-indigo-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {agents.map((a, i) => (
          <g key={i}>
            <rect x={a.x} y={a.y} width="60" height="40" rx="6" fill="white" fillOpacity="0.9" />
            {/* Avatar circle */}
            <circle cx={a.x + 18} cy={a.y + 16} r="10" fill="#6366f1" fillOpacity="0.2" />
            <circle cx={a.x + 18} cy={a.y + 12} r="4" fill="#6366f1" fillOpacity="0.6" />
            <ellipse cx={a.x + 18} cy={a.y + 22} rx="6" ry="4" fill="#6366f1" fillOpacity="0.6" />
            {/* Name bar */}
            <rect x={a.x + 32} y={a.y + 10} width="22" height="4" rx="2" fill="#6366f1" fillOpacity="0.6" />
            <rect x={a.x + 32} y={a.y + 18} width="16" height="3" rx="1.5" fill="#6366f1" fillOpacity="0.3" />
            {/* Status dot */}
            <circle cx={a.x + 52} cy={a.y + 32} r="4" fill={a.status} />
            {/* Provider badge */}
            <rect x={a.x + 6} y={a.y + 30} width="20" height="6" rx="3" fill="#6366f1" fillOpacity="0.2" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* Shadow AI — radar sweep catching a rogue blip */
function ShadowAIArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-rose-500" via="via-orange-500" to="to-orange-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        <g stroke="white" fill="none" strokeOpacity="0.35">
          <circle cx="160" cy="64" r="20" strokeWidth="1" />
          <circle cx="160" cy="64" r="38" strokeWidth="1" strokeOpacity="0.25" />
          <circle cx="160" cy="64" r="54" strokeWidth="1" strokeOpacity="0.18" />
        </g>
        {/* sweep wedge */}
        <path d="M160 64 L160 12 A52 52 0 0 1 206 40 Z" fill="white" fillOpacity="0.18" />
        <circle cx="160" cy="64" r="3.5" fill="white" />
        {/* governed blips */}
        <circle cx="120" cy="48" r="3" fill="white" fillOpacity="0.7" />
        <circle cx="196" cy="84" r="3" fill="white" fillOpacity="0.7" />
        <circle cx="140" cy="92" r="3" fill="white" fillOpacity="0.7" />
        {/* rogue blip — highlighted */}
        <circle cx="198" cy="44" r="5" fill="#fde047" stroke="white" strokeWidth="1.5" />
        <text x="198" y="32" textAnchor="middle" fill="#fde047" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">!</text>
      </svg>
    </div>
  );
}

/* Developer AI Usage — code brackets with usage meter */
function DeveloperAIArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-indigo-500" via="via-purple-500" to="to-purple-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* code brackets */}
        <path d="M100 30 L80 64 L100 98" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
        <path d="M220 30 L240 64 L220 98" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
        {/* code lines */}
        <rect x="115" y="38" width="90" height="6" rx="2" fill="white" fillOpacity="0.4" />
        <rect x="125" y="52" width="70" height="6" rx="2" fill="white" fillOpacity="0.35" />
        <rect x="120" y="66" width="80" height="6" rx="2" fill="white" fillOpacity="0.4" />
        <rect x="130" y="80" width="60" height="6" rx="2" fill="white" fillOpacity="0.35" />
        {/* usage meter bar */}
        <rect x="55" y="105" width="210" height="10" rx="5" fill="white" fillOpacity="0.2" />
        <rect x="55" y="105" width="145" height="10" rx="5" fill="white" fillOpacity="0.7" />
        {/* alert icon for anomaly */}
        <circle cx="270" cy="32" r="12" fill="#fde047" fillOpacity="0.9" />
        <text x="270" y="37" textAnchor="middle" fill="#713f12" fontSize="14" fontWeight="700" fontFamily="Inter, sans-serif">!</text>
      </svg>
    </div>
  );
}

/* Compliance — checklist */
function ComplianceArt() {
  const rows = [
    { y: 22, w: 180, done: true },
    { y: 44, w: 150, done: true },
    { y: 66, w: 200, done: true },
    { y: 88, w: 130, done: false },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-fuchsia-500" via="via-pink-500" to="to-pink-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {rows.map((r, i) => (
          <g key={i}>
            {/* checkbox */}
            <rect x="48" y={r.y} width="14" height="14" rx="3" fill={r.done ? 'white' : 'white'} fillOpacity={r.done ? 0.95 : 0.25} stroke="white" strokeOpacity="0.7" strokeWidth="1" />
            {r.done && (
              <path d={`M${50.5} ${r.y + 7} l${3} ${3} l${5} -${5}`} fill="none" stroke="#db2777" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {/* label bar */}
            <rect x="70" y={r.y + 3} width={r.w} height="8" rx="3" fill="white" fillOpacity={r.done ? 0.7 : 0.35} />
            {/* framework chip */}
            <rect x={70 + r.w + 6} y={r.y + 1} width="32" height="12" rx="6" fill="white" fillOpacity="0.25" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* Data Governance — stacked cylinders with tag labels */
function DataArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-cyan-500" via="via-teal-500" to="to-blue-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* cylinder 1 — top */}
        <ellipse cx="120" cy="30" rx="44" ry="10" fill="white" fillOpacity="0.85" />
        <rect x="76" y="30" width="88" height="18" fill="white" fillOpacity="0.6" />
        <ellipse cx="120" cy="48" rx="44" ry="10" fill="white" fillOpacity="0.45" />
        {/* cylinder 2 — mid */}
        <ellipse cx="120" cy="62" rx="44" ry="10" fill="white" fillOpacity="0.7" />
        <rect x="76" y="62" width="88" height="18" fill="white" fillOpacity="0.45" />
        <ellipse cx="120" cy="80" rx="44" ry="10" fill="white" fillOpacity="0.35" />
        {/* cylinder 3 — bottom */}
        <ellipse cx="120" cy="94" rx="44" ry="10" fill="white" fillOpacity="0.55" />
        <rect x="76" y="94" width="88" height="18" fill="white" fillOpacity="0.3" />
        <ellipse cx="120" cy="112" rx="44" ry="10" fill="white" fillOpacity="0.22" />
        {/* labels */}
        <text x="120" y="41" textAnchor="middle" fill="#0e7490" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif">QUALITY</text>
        <text x="120" y="73" textAnchor="middle" fill="#0e7490" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif">LINEAGE</text>
        <text x="120" y="105" textAnchor="middle" fill="#0e7490" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif">DOMAINS</text>
        {/* tags on right */}
        <rect x="196" y="22" width="48" height="14" rx="7" fill="white" fillOpacity="0.28" stroke="white" strokeOpacity="0.5" strokeWidth="0.8" />
        <rect x="196" y="44" width="56" height="14" rx="7" fill="white" fillOpacity="0.28" stroke="white" strokeOpacity="0.5" strokeWidth="0.8" />
        <rect x="196" y="66" width="52" height="14" rx="7" fill="white" fillOpacity="0.28" stroke="white" strokeOpacity="0.5" strokeWidth="0.8" />
        <text x="220" y="32" textAnchor="middle" fill="white" fillOpacity="0.9" fontSize="7" fontWeight="600" fontFamily="Inter, sans-serif">PII/PHI</text>
        <text x="224" y="54" textAnchor="middle" fill="white" fillOpacity="0.9" fontSize="7" fontWeight="600" fontFamily="Inter, sans-serif">Provenance</text>
        <text x="222" y="76" textAnchor="middle" fill="white" fillOpacity="0.9" fontSize="7" fontWeight="600" fontFamily="Inter, sans-serif">Access ctrl</text>
      </svg>
    </div>
  );
}

/* FinOps — area chart with budget line */
function FinOpsArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-pink-500" via="via-rose-500" to="to-rose-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="finops-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.5" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid lines */}
        <g stroke="white" strokeOpacity="0.18" strokeWidth="0.8">
          <line x1="40" y1="36" x2="296" y2="36" />
          <line x1="40" y1="64" x2="296" y2="64" />
          <line x1="40" y1="92" x2="296" y2="92" />
        </g>
        {/* budget reference */}
        <line x1="40" y1="48" x2="296" y2="48" stroke="white" strokeOpacity="0.6" strokeWidth="1" strokeDasharray="3 3" />
        <text x="296" y="44" textAnchor="end" fill="white" fillOpacity="0.85" fontSize="8" fontWeight="600" fontFamily="Inter, sans-serif">Budget</text>
        {/* spend area */}
        <path d="M40 96 L72 86 L104 78 L136 70 L168 64 L200 58 L232 52 L264 44 L296 40 L296 112 L40 112 Z" fill="url(#finops-area)" />
        <path d="M40 96 L72 86 L104 78 L136 70 L168 64 L200 58 L232 52 L264 44 L296 40" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
        {/* anomaly dot */}
        <circle cx="232" cy="52" r="4" fill="#fbbf24" stroke="white" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/* Audit — timeline log */
function AuditArt() {
  const rows = [
    { y: 22, level: 'info' },
    { y: 44, level: 'warn' },
    { y: 66, level: 'info' },
    { y: 88, level: 'error' },
  ];
  const colorFor = (l: string) => l === 'error' ? '#fca5a5' : l === 'warn' ? '#fcd34d' : '#a7f3d0';
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-rose-500" via="via-pink-500" to="to-pink-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* timeline rail */}
        <line x1="56" y1="20" x2="56" y2="104" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" />
        {rows.map((r, i) => (
          <g key={i}>
            <circle cx="56" cy={r.y + 5} r="4" fill={colorFor(r.level)} />
            <rect x="70" y={r.y} width="12" height="14" rx="3" fill="white" fillOpacity="0.22" />
            <rect x="88" y={r.y + 2} width="80" height="4" rx="2" fill="white" fillOpacity="0.85" />
            <rect x="88" y={r.y + 9} width="120" height="3" rx="1.5" fill="white" fillOpacity="0.45" />
            <rect x="218" y={r.y + 2} width="44" height="10" rx="5" fill="white" fillOpacity="0.18" stroke="white" strokeOpacity="0.4" strokeWidth="0.6" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* HRAIS — EU AI Act badge with warning indicator (reserved for future use, exported for potential reuse) */
export function HRAISArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-amber-500" via="via-orange-500" to="to-orange-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* EU stars circle */}
        <g transform="translate(80, 64)">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 - 90) * Math.PI / 180;
            const x = Math.cos(angle) * 32;
            const y = Math.sin(angle) * 32;
            return <polygon key={i} points={`${x},${y - 4} ${x + 2.5},${y + 2} ${x - 2.5},${y + 2}`} fill="white" fillOpacity="0.8" />;
          })}
          <circle cx="0" cy="0" r="24" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="1" />
        </g>
        {/* Risk tier badges */}
        <g>
          <rect x="160" y="24" width="80" height="20" rx="4" fill="white" fillOpacity="0.85" />
          <text x="200" y="38" textAnchor="middle" fill="#c2410c" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">HIGH RISK</text>
          <rect x="160" y="52" width="80" height="20" rx="4" fill="white" fillOpacity="0.55" />
          <text x="200" y="66" textAnchor="middle" fill="#c2410c" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">LIMITED</text>
          <rect x="160" y="80" width="80" height="20" rx="4" fill="white" fillOpacity="0.35" />
          <text x="200" y="94" textAnchor="middle" fill="#c2410c" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">MINIMAL</text>
        </g>
        {/* Warning indicator */}
        <circle cx="252" cy="34" r="6" fill="#fbbf24" stroke="white" strokeWidth="1.5" />
        <text x="252" y="37" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">!</text>
      </svg>
    </div>
  );
}

/* Playbook — decision tree with branching paths and level indicators */
function PlaybookArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-violet-500" via="via-indigo-500" to="to-indigo-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* Decision tree lines */}
        <g stroke="white" strokeOpacity="0.5" strokeWidth="1.5">
          <line x1="60" y1="64" x2="100" y2="32" />
          <line x1="60" y1="64" x2="100" y2="64" />
          <line x1="60" y1="64" x2="100" y2="96" />
          <line x1="130" y1="32" x2="170" y2="32" />
          <line x1="130" y1="64" x2="170" y2="64" />
          <line x1="130" y1="96" x2="170" y2="96" />
          <line x1="200" y1="32" x2="240" y2="48" />
          <line x1="200" y1="64" x2="240" y2="64" />
          <line x1="200" y1="96" x2="240" y2="80" />
        </g>
        {/* Root node (question) */}
        <circle cx="60" cy="64" r="14" fill="white" fillOpacity="0.9" />
        <text x="60" y="68" textAnchor="middle" fill="#6366f1" fontSize="12" fontWeight="700" fontFamily="Inter, sans-serif">?</text>
        {/* Level nodes */}
        <g>
          {/* Level 1 - Green */}
          <rect x="100" y="22" width="30" height="20" rx="4" fill="#10b981" fillOpacity="0.85" />
          <text x="115" y="36" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">L1</text>
          {/* Level 2 - Amber */}
          <rect x="100" y="54" width="30" height="20" rx="4" fill="#f59e0b" fillOpacity="0.85" />
          <text x="115" y="68" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">L2</text>
          {/* Level 3 - Violet */}
          <rect x="100" y="86" width="30" height="20" rx="4" fill="#8b5cf6" fillOpacity="0.85" />
          <text x="115" y="100" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">L3</text>
        </g>
        {/* Gate icons */}
        <g>
          <rect x="170" y="22" width="30" height="20" rx="4" fill="white" fillOpacity="0.7" />
          <rect x="170" y="54" width="30" height="20" rx="4" fill="white" fillOpacity="0.7" />
          <rect x="170" y="86" width="30" height="20" rx="4" fill="white" fillOpacity="0.7" />
          {/* HITL hand icon representations */}
          <circle cx="185" cy="32" r="5" fill="#6366f1" fillOpacity="0.5" />
          <circle cx="185" cy="64" r="5" fill="#6366f1" fillOpacity="0.8" />
          <circle cx="185" cy="96" r="5" fill="#6366f1" fillOpacity="0.6" />
        </g>
        {/* AWS integration node */}
        <rect x="240" y="44" width="44" height="40" rx="6" fill="white" fillOpacity="0.85" />
        <text x="262" y="60" textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif">AWS</text>
        <text x="262" y="72" textAnchor="middle" fill="#6366f1" fontSize="7" fontWeight="600" fontFamily="Inter, sans-serif">Bedrock</text>
        {/* Connection dots */}
        <circle cx="240" cy="48" r="3" fill="#ff9900" />
        <circle cx="240" cy="64" r="3" fill="#ff9900" />
        <circle cx="240" cy="80" r="3" fill="#ff9900" />
      </svg>
    </div>
  );
}

/* Multi-Cloud — three cloud providers unified with connecting lines */
function MultiCloudArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-cyan-500" via="via-blue-500" to="to-blue-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* Connection lines between clouds */}
        <g stroke="white" strokeOpacity="0.4" strokeWidth="1.5">
          <line x1="80" y1="64" x2="160" y2="64" />
          <line x1="160" y1="64" x2="240" y2="64" />
          <line x1="80" y1="64" x2="160" y2="40" strokeDasharray="4 2" />
          <line x1="160" y1="40" x2="240" y2="64" strokeDasharray="4 2" />
          <line x1="80" y1="64" x2="160" y2="88" strokeDasharray="4 2" />
          <line x1="160" y1="88" x2="240" y2="64" strokeDasharray="4 2" />
        </g>
        {/* AWS Cloud */}
        <g>
          <rect x="48" y="44" width="64" height="40" rx="8" fill="white" fillOpacity="0.9" />
          <rect x="56" y="52" width="48" height="24" rx="4" fill="#FF9900" fillOpacity="0.9" />
          <text x="80" y="68" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">AWS</text>
          <circle cx="100" cy="52" r="6" fill="#10b981" />
          <text x="100" y="55" textAnchor="middle" fill="white" fontSize="6" fontWeight="700">4</text>
        </g>
        {/* Azure Cloud */}
        <g>
          <rect x="128" y="24" width="64" height="40" rx="8" fill="white" fillOpacity="0.9" />
          <rect x="136" y="32" width="48" height="24" rx="4" fill="#0078D4" fillOpacity="0.9" />
          <text x="160" y="48" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">Azure</text>
          <circle cx="180" cy="32" r="6" fill="#f59e0b" />
          <text x="180" y="35" textAnchor="middle" fill="white" fontSize="6" fontWeight="700">2</text>
        </g>
        {/* GCP Cloud */}
        <g>
          <rect x="128" y="72" width="64" height="40" rx="8" fill="white" fillOpacity="0.9" />
          <rect x="136" y="80" width="48" height="24" rx="4" fill="#4285F4" fillOpacity="0.9" />
          <text x="160" y="96" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">GCP</text>
          <circle cx="180" cy="80" r="6" fill="#64748b" />
          <text x="180" y="83" textAnchor="middle" fill="white" fontSize="6" fontWeight="700">1</text>
        </g>
        {/* Central governance hub */}
        <g>
          <circle cx="240" cy="64" r="24" fill="white" fillOpacity="0.95" />
          <circle cx="240" cy="64" r="18" fill="#6366f1" fillOpacity="0.2" />
          <text x="240" y="60" textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif">UNIFIED</text>
          <text x="240" y="72" textAnchor="middle" fill="#6366f1" fontSize="7" fontWeight="600" fontFamily="Inter, sans-serif">GOVERN</text>
        </g>
      </svg>
    </div>
  );
}

/* Dev Tools — coding assistant tools with routing indicators */
function DevToolsArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-violet-500" via="via-purple-500" to="to-purple-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* Code brackets background */}
        <text x="40" y="80" fill="white" fillOpacity="0.15" fontSize="60" fontFamily="monospace" fontWeight="bold">&lt;/&gt;</text>
        <text x="220" y="100" fill="white" fillOpacity="0.1" fontSize="40" fontFamily="monospace" fontWeight="bold">{`{}`}</text>

        {/* Tool cards */}
        <g>
          {/* Claude Code - Governed */}
          <rect x="40" y="36" width="56" height="56" rx="8" fill="white" fillOpacity="0.95" />
          <rect x="48" y="44" width="40" height="24" rx="4" fill="#D97706" />
          <text x="68" y="60" textAnchor="middle" fill="white" fontSize="8" fontWeight="700">Claude</text>
          <text x="68" y="82" textAnchor="middle" fill="#7c3aed" fontSize="7" fontWeight="600">Bedrock</text>
          <circle cx="84" cy="44" r="6" fill="#10b981" />
          <path d="M81 44l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" />
        </g>
        <g>
          {/* Kiro - Governed */}
          <rect x="108" y="44" width="48" height="48" rx="8" fill="white" fillOpacity="0.95" />
          <rect x="116" y="52" width="32" height="20" rx="4" fill="#FF9900" />
          <text x="132" y="66" textAnchor="middle" fill="white" fontSize="8" fontWeight="700">Kiro</text>
          <text x="132" y="84" textAnchor="middle" fill="#7c3aed" fontSize="7" fontWeight="600">AWS</text>
          <circle cx="148" cy="52" r="6" fill="#10b981" />
          <path d="M145 52l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" />
        </g>
        <g>
          {/* Copilot - Warning */}
          <rect x="168" y="40" width="52" height="52" rx="8" fill="white" fillOpacity="0.95" />
          <rect x="176" y="48" width="36" height="22" rx="4" fill="#6366F1" />
          <text x="194" y="62" textAnchor="middle" fill="white" fontSize="7" fontWeight="700">Copilot</text>
          <text x="194" y="82" textAnchor="middle" fill="#f59e0b" fontSize="7" fontWeight="600">Direct</text>
          <circle cx="208" cy="48" r="6" fill="#f59e0b" />
          <text x="208" y="51" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">!</text>
        </g>
        <g>
          {/* Cursor - Risk */}
          <rect x="232" y="48" width="48" height="48" rx="8" fill="white" fillOpacity="0.95" />
          <rect x="240" y="56" width="32" height="20" rx="4" fill="#10B981" />
          <text x="256" y="70" textAnchor="middle" fill="white" fontSize="8" fontWeight="700">Cursor</text>
          <text x="256" y="88" textAnchor="middle" fill="#ef4444" fontSize="7" fontWeight="600">No Route</text>
          <circle cx="268" cy="56" r="6" fill="#ef4444" />
          <text x="268" y="59" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">X</text>
        </g>

        {/* API Compliance bar */}
        <rect x="40" y="108" width="240" height="10" rx="5" fill="white" fillOpacity="0.3" />
        <rect x="40" y="108" width="187" height="10" rx="5" fill="white" fillOpacity="0.9" />
        <text x="160" y="116" textAnchor="middle" fill="#7c3aed" fontSize="7" fontWeight="700">78% API Compliant</text>
      </svg>
    </div>
  );
}

/* Vendors — building blocks representing third-party vendors with risk indicators */
function VendorsArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ArtBackdrop from="from-amber-500" via="via-orange-500" to="to-orange-600" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* Vendor buildings */}
        <g>
          {/* Vendor 1 - Critical */}
          <rect x="40" y="48" width="50" height="56" rx="4" fill="white" fillOpacity="0.9" />
          <rect x="48" y="56" width="14" height="10" rx="2" fill="#ef4444" fillOpacity="0.8" />
          <rect x="68" y="56" width="14" height="10" rx="2" fill="#ef4444" fillOpacity="0.8" />
          <rect x="48" y="72" width="14" height="10" rx="2" fill="#ef4444" fillOpacity="0.6" />
          <rect x="68" y="72" width="14" height="10" rx="2" fill="#ef4444" fillOpacity="0.6" />
          <circle cx="78" cy="36" r="10" fill="#ef4444" />
          <text x="78" y="40" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">!</text>
          <text x="65" y="98" textAnchor="middle" fill="#9a3412" fontSize="7" fontWeight="600">Critical</text>
        </g>
        {/* Vendor 2 - High */}
        <g>
          <rect x="110" y="56" width="45" height="48" rx="4" fill="white" fillOpacity="0.9" />
          <rect x="117" y="64" width="12" height="8" rx="2" fill="#f97316" fillOpacity="0.8" />
          <rect x="135" y="64" width="12" height="8" rx="2" fill="#f97316" fillOpacity="0.8" />
          <rect x="117" y="78" width="12" height="8" rx="2" fill="#f97316" fillOpacity="0.6" />
          <rect x="135" y="78" width="12" height="8" rx="2" fill="#f97316" fillOpacity="0.6" />
          <circle cx="145" cy="46" r="8" fill="#f97316" />
          <text x="132" y="98" textAnchor="middle" fill="#9a3412" fontSize="7" fontWeight="600">High</text>
        </g>
        {/* Vendor 3 - Medium */}
        <g>
          <rect x="175" y="60" width="40" height="44" rx="4" fill="white" fillOpacity="0.9" />
          <rect x="182" y="68" width="10" height="8" rx="2" fill="#f59e0b" fillOpacity="0.8" />
          <rect x="198" y="68" width="10" height="8" rx="2" fill="#f59e0b" fillOpacity="0.8" />
          <rect x="182" y="82" width="10" height="8" rx="2" fill="#f59e0b" fillOpacity="0.6" />
          <rect x="198" y="82" width="10" height="8" rx="2" fill="#f59e0b" fillOpacity="0.6" />
          <text x="195" y="98" textAnchor="middle" fill="#9a3412" fontSize="7" fontWeight="600">Med</text>
        </g>
        {/* Vendor 4 - Low */}
        <g>
          <rect x="235" y="64" width="36" height="40" rx="4" fill="white" fillOpacity="0.9" />
          <rect x="242" y="72" width="8" height="6" rx="1" fill="#10b981" fillOpacity="0.8" />
          <rect x="256" y="72" width="8" height="6" rx="1" fill="#10b981" fillOpacity="0.8" />
          <rect x="242" y="84" width="8" height="6" rx="1" fill="#10b981" fillOpacity="0.6" />
          <rect x="256" y="84" width="8" height="6" rx="1" fill="#10b981" fillOpacity="0.6" />
          <circle cx="263" cy="54" r="6" fill="#10b981" />
          <text x="253" y="98" textAnchor="middle" fill="#9a3412" fontSize="7" fontWeight="600">Low</text>
        </g>
        {/* DDQ progress bar at bottom */}
        <rect x="40" y="112" width="232" height="8" rx="4" fill="white" fillOpacity="0.4" />
        <rect x="40" y="112" width="200" height="8" rx="4" fill="white" fillOpacity="0.9" />
        <text x="160" y="119" textAnchor="middle" fill="#9a3412" fontSize="6" fontWeight="700">DDQ 88%</text>
      </svg>
    </div>
  );
}
