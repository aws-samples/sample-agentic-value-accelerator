/**
 * EmptyState — Helpful empty state component for the Govern module.
 *
 * Shows a friendly message with icon, description, tips, and action button
 * when a section has no data yet.
 */

import { Link } from 'react-router-dom';
import { Icon, type IconName } from './icons';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  actionLink?: string;
  tips?: string[];
  compact?: boolean;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionLink,
  tips,
  compact = false,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 py-3 px-4">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Icon name={icon} className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-600">{title}</div>
          <div className="text-xs text-slate-400 truncate">{description}</div>
        </div>
        {actionLabel && actionLink && (
          <Link
            to={actionLink}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0"
          >
            {actionLabel} →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-6 px-4">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Icon name={icon} className="w-6 h-6 text-slate-400" />
      </div>
      <div className="text-sm font-medium text-slate-700 mb-1">{title}</div>
      <div className="text-xs text-slate-500 text-center max-w-xs mb-3">{description}</div>
      {tips && tips.length > 0 && (
        <div className="text-[10px] text-slate-400 mb-3">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-center gap-1.5 mb-1">
              <span className="text-blue-400">→</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      )}
      {actionLabel && actionLink && (
        <Link
          to={actionLink}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {actionLabel}
          <Icon name="arrow-right" className="w-3 h-3" strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}

// Common empty state configurations for reuse
export const EMPTY_STATES: Record<string, { icon: IconName; title: string; description: string; actionLabel?: string; actionLink?: string; tips?: string[] }> = {
  agents: {
    icon: 'cpu-chip',
    title: 'No agents registered',
    description: 'Register agents to track their capabilities, permissions, and activity across your organization.',
    actionLabel: 'Register Agent',
    actionLink: '/govern/agents',
  },
  deployments: {
    icon: 'rocket-launch',
    title: 'No deployments yet',
    description: 'When you deploy agents or applications, they\'ll appear here with real-time status tracking.',
    actionLabel: 'Browse Applications',
    actionLink: '/applications',
    tips: ['Deploy from Applications → FSI Foundry', 'Or create a custom agent in AaaS'],
  },
  guardrails: {
    icon: 'shield-check',
    title: 'No guardrails configured',
    description: 'Guardrails filter harmful content, detect PII, and enforce safety policies on your agents.',
    actionLabel: 'Create Guardrail',
    actionLink: '/secure/guardrails',
    tips: ['Start with a template for quick setup', 'Configure content filters and PII detection'],
  },
  policies: {
    icon: 'document-text',
    title: 'No policies defined',
    description: 'Cedar policies control fine-grained permissions for what agents can access and do.',
    actionLabel: 'Create Policy',
    actionLink: '/secure/policy',
    tips: ['Use deny-by-default for security', 'Define permissions per agent or role'],
  },
  useCases: {
    icon: 'clipboard',
    title: 'No use cases defined',
    description: 'Use cases help you track and prioritize AI initiatives with risk scoring and governance workflows.',
    actionLabel: 'Add Use Case',
    actionLink: '/use-cases',
  },
  incidents: {
    icon: 'exclamation-triangle',
    title: 'No incidents recorded',
    description: 'When guardrails block content or policies deny actions, incidents will appear here for review.',
    actionLabel: 'View Audit Log',
    actionLink: '/govern/audit',
  },
  activity: {
    icon: 'calendar',
    title: 'No activity yet',
    description: 'Once your agents and guardrails are active, you\'ll see real-time events here.',
    actionLabel: 'View Audit Log',
    actionLink: '/govern/audit',
    tips: ['Deploy an agent to start generating activity', 'Configure guardrails to monitor for violations'],
  },
  models: {
    icon: 'beaker',
    title: 'No models registered',
    description: 'Track foundation models and fine-tuned models with version history, risk assessments, and deployment status.',
    actionLabel: 'Register Model',
    actionLink: '/govern/models',
  },
  risks: {
    icon: 'chart-bar',
    title: 'No risk data available',
    description: 'Score your use cases to see risk distribution and identify where to focus governance efforts.',
    actionLabel: 'Score Use Cases',
    actionLink: '/use-cases',
  },
  data: {
    icon: 'circle-stack',
    title: 'No data sources connected',
    description: 'Connect data sources to track lineage, quality, and access controls for your AI systems.',
    actionLabel: 'Connect Data Source',
    actionLink: '/govern/data',
  },
  compliance: {
    icon: 'check-circle',
    title: 'No compliance frameworks',
    description: 'Track compliance against regulatory frameworks like SR 26-2, NIST AI RMF, and EU AI Act.',
    actionLabel: 'Add Framework',
    actionLink: '/govern/compliance',
  },
  tools: {
    icon: 'cog',
    title: 'No tools registered',
    description: 'Register the tools your agents can use to track permissions and monitor usage.',
    actionLabel: 'Register Tool',
    actionLink: '/govern/agents',
  },
};
