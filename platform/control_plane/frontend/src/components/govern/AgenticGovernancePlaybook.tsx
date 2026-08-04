/**
 * AgenticGovernancePlaybook — Interactive guide for agent governance decisions
 *
 * Walks customers through governance decisions for autonomous agents, HITL, and A2A:
 * - Section 1: Autonomous Agent Governance - Decision tree for autonomy levels
 * - Section 2: HITL Gate Design - When and how to require human approval
 * - Section 3: A2A Governance - Trust policy design for multi-agent systems
 *
 * AWS Integration:
 * - Amazon Bedrock Agents: RETURN_CONTROL, multi-agent collaboration
 * - Amazon A2I: Human review workflows
 * - AWS Step Functions: Approval patterns, agent orchestration
 * - Amazon EventBridge: Agent communication
 * - AWS IAM: Cross-agent authorization
 */

import { useId, useState } from 'react';
import { Icon, type IconName } from './icons';
import UnifiedGuide, { PLAYBOOK_GUIDE } from './UnifiedGuide';
import { rowButtonProps } from './a11y';
import { scopeColor } from './autonomyLadder';

// ─────────────────────────── Types ───────────────────────────

interface AutonomyLevel {
  level: number;
  name: string;
  description: string;
  controls: string[];
  hitlRequirement: string;
  examples: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  icon: IconName;
}

interface HITLTrigger {
  id: string;
  name: string;
  description: string;
  configExample: string;
  icon: IconName;
  color: string;
}

interface GateOption {
  name: string;
  description: string;
  options: string[];
}

interface AWSPattern {
  id: string;
  name: string;
  service: string;
  description: string;
  useCase: string;
  icon: IconName;
  color: string;
}

interface TrustLevel {
  level: string;
  description: string;
  accessType: string;
  rateLimit: string;
  dataAccess: string;
  color: string;
}

interface A2AProtocol {
  name: string;
  type: 'sync' | 'async' | 'orchestrated';
  service: string;
  description: string;
  bestFor: string;
}

// ─────────────────────────── Data ───────────────────────────

// The playbook's `level` (1-4) aligns 1:1 with the canonical autonomy ladder
// (autonomyLadder.ts / AGENT_SCOPE_META). Names here are the playbook's descriptive
// labels; colors are derived from canonical scopeColor(level) so the palette matches
// the rest of Govern (notably L3 is amber, not the old purple).
const AUTONOMY_LEVELS: AutonomyLevel[] = [
  {
    level: 1,
    name: 'Informational',
    description: 'Agent provides recommendations, human decides',
    controls: ['Output logging', 'No write access', 'Read-only data access'],
    hitlRequirement: 'Not required',
    examples: ['Research assistant', 'Document summarizer', 'FAQ responder', 'Data analyst'],
    riskLevel: 'low',
    color: scopeColor(1),
    icon: 'information-circle',
  },
  {
    level: 2,
    name: 'Assisted',
    description: 'Agent drafts actions, human approves before execution',
    controls: ['Draft queue', 'Approval workflow', 'Version control', 'Change preview'],
    hitlRequirement: 'Required for all actions',
    examples: ['Email drafter', 'Report generator', 'Code reviewer', 'Content creator'],
    riskLevel: 'medium',
    color: scopeColor(2),
    icon: 'hand-raised',
  },
  {
    level: 3,
    name: 'Supervised',
    description: 'Agent executes low-risk actions, escalates high-risk',
    controls: ['Risk-based gates', 'Threshold triggers', 'Anomaly detection', 'Audit trail'],
    hitlRequirement: 'Required above thresholds',
    examples: ['Customer service bot', 'Fraud triage', 'Ticket routing', 'Inventory management'],
    riskLevel: 'high',
    color: scopeColor(3),
    icon: 'eye',
  },
  {
    level: 4,
    name: 'Autonomous',
    description: 'Agent executes within policy bounds, reports exceptions',
    controls: ['Guardrails', 'Circuit breakers', 'Kill switches', 'Real-time monitoring'],
    hitlRequirement: 'Exception-based only',
    examples: ['Trading assistant (within limits)', 'Auto-remediation', 'Dynamic pricing', 'Infrastructure scaling'],
    riskLevel: 'critical',
    color: scopeColor(4),
    icon: 'bolt',
  },
];

const HITL_TRIGGERS: HITLTrigger[] = [
  {
    id: 'risk-threshold',
    name: 'Risk Threshold Exceeded',
    description: 'Trigger when calculated risk score exceeds configurable limit',
    configExample: 'action.risk_score > 70',
    icon: 'exclamation-triangle',
    color: '#EF4444',
  },
  {
    id: 'cost-threshold',
    name: 'Cost Above Limit',
    description: 'Require approval for decisions exceeding monetary threshold',
    configExample: 'transaction.amount > 100 OR decision.cost_impact > 10000',
    icon: 'banknotes',
    color: '#10B981',
  },
  {
    id: 'data-sensitivity',
    name: 'Data Sensitivity',
    description: 'Gate access to sensitive data classifications',
    configExample: 'data.classification IN ["PII", "PHI", "financial", "restricted"]',
    icon: 'lock-closed',
    color: '#8B5CF6',
  },
  {
    id: 'action-type',
    name: 'Action Type',
    description: 'Block specific action types pending approval',
    configExample: 'action.type IN ["delete", "transfer", "external_api", "data_export"]',
    icon: 'bolt',
    color: '#F59E0B',
  },
  {
    id: 'compliance',
    name: 'Compliance Requirement',
    description: 'Mandatory human oversight per regulatory mandate',
    configExample: 'system.hrais_classification == "high-risk" AND action.affects_natural_person',
    icon: 'clipboard-list',
    color: '#3B82F6',
  },
  {
    id: 'custom',
    name: 'Custom Business Rules',
    description: 'Organization-specific approval requirements',
    configExample: 'customer.tier == "enterprise" OR contract.value > 50000',
    icon: 'cog',
    color: '#6B7280',
  },
];

const GATE_OPTIONS: GateOption[] = [
  {
    name: 'Approvers',
    description: 'Who can approve the request',
    options: ['Role-based (e.g., risk-manager, compliance-officer)', 'Named individuals', 'Team/group assignment', 'Escalation hierarchy'],
  },
  {
    name: 'Escalation Path',
    description: 'How requests escalate on timeout',
    options: ['Level 1: Primary approver (15 min)', 'Level 2: Team lead (30 min)', 'Level 3: Director (60 min)', 'Level 4: Executive (120 min)'],
  },
  {
    name: 'Timeout Action',
    description: 'What happens when timeout expires',
    options: ['Auto-deny (safest)', 'Auto-approve (for low-risk only)', 'Escalate to next level', 'Hold until manual review'],
  },
  {
    name: 'SLA Tracking',
    description: 'Performance monitoring',
    options: ['Response time targets', 'Approval rate metrics', 'Escalation frequency', 'Decision audit trail'],
  },
];

const AWS_HITL_PATTERNS: AWSPattern[] = [
  {
    id: 'bedrock-return-control',
    name: 'Bedrock RETURN_CONTROL',
    service: 'Amazon Bedrock Agents',
    description: 'Synchronous pause - agent returns control to application for human confirmation before proceeding',
    useCase: 'Real-time decisions requiring immediate human input',
    icon: 'cpu-chip',
    color: '#FF9900',
  },
  {
    id: 'a2i-workflow',
    name: 'A2I Workflows',
    service: 'Amazon Augmented AI',
    description: 'Structured human review with custom worker templates and confidence-based routing',
    useCase: 'Batch review, content moderation, quality assurance',
    icon: 'users',
    color: '#8B5CF6',
  },
  {
    id: 'step-functions',
    name: 'Step Functions Callback',
    service: 'AWS Step Functions',
    description: 'Wait-for-callback pattern with timeout handling and retry logic',
    useCase: 'Long-running approval workflows with complex state management',
    icon: 'arrow-path',
    color: '#E91E63',
  },
  {
    id: 'sns-notifications',
    name: 'SNS Notifications',
    service: 'Amazon SNS',
    description: 'Multi-channel alerting (email, Slack, PagerDuty) with callback URLs',
    useCase: 'Urgent approvals requiring immediate attention',
    icon: 'bell',
    color: '#3B82F6',
  },
];

const TRUST_LEVELS: TrustLevel[] = [
  {
    level: 'High',
    description: 'Same application, same owner',
    accessType: 'Full access',
    rateLimit: 'Unlimited',
    dataAccess: 'All classifications including restricted',
    color: '#10B981',
  },
  {
    level: 'Medium',
    description: 'Same org, different owner',
    accessType: 'Limited access',
    rateLimit: '100 req/min',
    dataAccess: 'Internal and confidential',
    color: '#F59E0B',
  },
  {
    level: 'Low',
    description: 'External partner',
    accessType: 'Read-only',
    rateLimit: '10 req/min',
    dataAccess: 'Public only',
    color: '#F97316',
  },
  {
    level: 'Untrusted',
    description: 'Blocked by default',
    accessType: 'No access',
    rateLimit: 'Blocked',
    dataAccess: 'None',
    color: '#EF4444',
  },
];

const A2A_PROTOCOLS: A2AProtocol[] = [
  {
    name: 'Synchronous (API Gateway)',
    type: 'sync',
    service: 'API Gateway',
    description: 'Request/response pattern with real-time validation',
    bestFor: 'Low-latency decisions, real-time queries',
  },
  {
    name: 'Asynchronous (EventBridge)',
    type: 'async',
    service: 'EventBridge + SQS',
    description: 'Event-driven with schema validation and dead letter queues',
    bestFor: 'Decoupled workflows, event notifications',
  },
  {
    name: 'Orchestrated (Step Functions)',
    type: 'orchestrated',
    service: 'Step Functions',
    description: 'Explicit control flow with parallel execution and error handling',
    bestFor: 'Complex multi-agent workflows, deterministic sequences',
  },
];

const TRUST_POLICY_ELEMENTS = [
  { name: 'Source Agent', description: 'Which agent is making the request', example: 'agent-fraud, agent-orchestrator' },
  { name: 'Target Agent', description: 'Which agent is being invoked', example: 'agent-kyc, *-specialist' },
  { name: 'Allowed Actions', description: 'What operations are permitted', example: 'invoke, query, delegate, halt' },
  { name: 'Data Classifications', description: 'What data can be passed', example: 'public, internal, confidential' },
  { name: 'Max Chain Depth', description: 'How deep can agent chains go', example: '1-5 (prevent runaway chains)' },
  { name: 'Rate Limits', description: 'Requests per time window', example: '10-1000 req/min based on trust' },
];

// ─────────────────────────── Component ───────────────────────────

type SectionId = 'autonomy' | 'hitl' | 'a2a';

interface SectionConfig {
  id: SectionId;
  title: string;
  icon: IconName;
  description: string;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'autonomy',
    title: 'Autonomous Agent Governance',
    icon: 'cpu-chip',
    description: 'Decision tree for agent autonomy levels',
  },
  {
    id: 'hitl',
    title: 'HITL Gate Design',
    icon: 'hand-raised',
    description: 'When to require human approval',
  },
  {
    id: 'a2a',
    title: 'A2A Governance',
    icon: 'share',
    description: 'Trust policy design for multi-agent systems',
  },
];

const riskColors = {
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-violet-100 text-violet-700 border-violet-200',
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
};

export default function AgenticGovernancePlaybook() {
  const [activeSection, setActiveSection] = useState<SectionId>('autonomy');
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [selectedTrustLevel, setSelectedTrustLevel] = useState<string | null>(null);
  const hitlChecklistId = useId();
  const a2aChecklistId = useId();

  return (
    <div className="space-y-6">
      {/* Unified Guide */}
      <UnifiedGuide {...PLAYBOOK_GUIDE} />

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon name="clipboard-list" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Agentic Governance Playbook</h1>
            <p className="text-sm text-white/80">Decision framework for autonomous agents, HITL, and A2A</p>
          </div>
        </div>
        <p className="text-sm text-white/70">
          Use this playbook to make informed governance decisions about agent autonomy levels,
          human-in-the-loop gates, and agent-to-agent trust policies. Each section includes
          decision trees, checklists, and AWS integration patterns.
        </p>
      </div>

      {/* Section Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl">
        {SECTIONS.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeSection === section.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={section.icon} className="w-5 h-5" />
            <div className="text-left">
              <div className="font-semibold">{section.title}</div>
              <div className="text-[10px] text-slate-500">{section.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Section 1: Autonomous Agent Governance */}
      {activeSection === 'autonomy' && (
        <div className="space-y-6">
          {/* Decision Tree Visual */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Agent Autonomy Decision Tree</h3>
            <p className="text-sm text-slate-600 mb-6">
              Select the appropriate autonomy level based on your risk tolerance and operational requirements.
            </p>

            <div className="grid grid-cols-4 gap-4">
              {AUTONOMY_LEVELS.map(level => (
                <div
                  key={level.level}
                  {...rowButtonProps(
                    () => setSelectedLevel(selectedLevel === level.level ? null : level.level),
                    `Autonomy Level ${level.level}: ${level.name}`,
                  )}
                  aria-pressed={selectedLevel === level.level}
                  className={`relative rounded-xl border-2 p-5 cursor-pointer transition-all hover:shadow-lg focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                    selectedLevel === level.level
                      ? 'border-violet-500 shadow-md ring-2 ring-violet-200'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Level indicator */}
                  <div
                    className="absolute -top-3 left-4 px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: level.color }}
                  >
                    Level {level.level}
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${level.color}15` }}
                      >
                        <Icon name={level.icon} className="w-5 h-5" style={{ color: level.color }} />
                      </div>
                      <h4 className="text-base font-semibold text-slate-900">{level.name}</h4>
                    </div>

                    <p className="text-xs text-slate-600 mb-3">{level.description}</p>

                    <div className="space-y-2">
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Risk Level</div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${riskColors[level.riskLevel]}`}>
                          {level.riskLevel}
                        </span>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">HITL</div>
                        <span className="text-xs text-slate-700">{level.hitlRequirement}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {selectedLevel === level.level && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Required Controls</div>
                        <div className="space-y-1">
                          {level.controls.map((control, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                              <Icon name="check" className="w-3 h-3 text-emerald-500" />
                              {control}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Example Use Cases</div>
                        <div className="flex flex-wrap gap-1">
                          {level.examples.map((example, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                              {example}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Decision Checklist */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Autonomy Level Selection Checklist</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-700">Consider Level 1-2 (Informational/Assisted) if:</div>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Actions have significant financial, legal, or reputational impact</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Regulatory requirements mandate human oversight (EU AI Act HRAIS)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Agent decisions affect natural persons' rights</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Low confidence in model accuracy for the use case</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>New deployment without production track record</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-700">Consider Level 3-4 (Supervised/Autonomous) if:</div>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
                    <span>Actions are reversible or have low impact</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
                    <span>Clear guardrails can bound agent behavior</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
                    <span>Real-time monitoring and circuit breakers are in place</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
                    <span>High model accuracy demonstrated in production</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check-circle" className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
                    <span>Human review would create unacceptable latency</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progression Path */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Icon name="arrow-trending-up" className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-indigo-800 mb-1">Progressive Autonomy</h4>
                <p className="text-xs text-indigo-700">
                  Start at a lower autonomy level and progressively increase as the agent demonstrates reliability.
                  Track metrics like approval rates, override frequency, and incident counts to justify level increases.
                  This "trust but verify" approach balances operational efficiency with risk management.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: HITL Gate Design */}
      {activeSection === 'hitl' && (
        <div className="space-y-6">
          {/* When to Require Human Approval */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">When to Require Human Approval</h3>
            <p className="text-sm text-slate-600 mb-6">
              Configure HITL gates based on these trigger types. Combine multiple triggers for defense in depth.
            </p>

            <div className="grid grid-cols-3 gap-4">
              {HITL_TRIGGERS.map(trigger => (
                <div
                  key={trigger.id}
                  {...rowButtonProps(
                    () => setSelectedTrigger(selectedTrigger === trigger.id ? null : trigger.id),
                    `HITL trigger: ${trigger.name}`,
                  )}
                  aria-pressed={selectedTrigger === trigger.id}
                  className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                    selectedTrigger === trigger.id
                      ? 'border-violet-500 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${trigger.color}15` }}
                    >
                      <Icon name={trigger.icon} className="w-5 h-5" style={{ color: trigger.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900">{trigger.name}</h4>
                      <p className="text-xs text-slate-600 mt-0.5">{trigger.description}</p>
                    </div>
                  </div>

                  {selectedTrigger === trigger.id && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Example Condition</div>
                      <code className="block text-[10px] bg-slate-900 text-slate-100 p-2 rounded-lg overflow-x-auto">
                        {trigger.configExample}
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Gate Configuration Options */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Gate Configuration Options</h3>
            <div className="grid grid-cols-2 gap-6">
              {GATE_OPTIONS.map((option, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">{option.name}</h4>
                  <p className="text-xs text-slate-600 mb-3">{option.description}</p>
                  <div className="space-y-1.5">
                    {option.options.map((opt, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs text-slate-700">
                        <Icon name="chevron-right" className="w-3 h-3 text-violet-500" />
                        {opt}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AWS Integration Patterns */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">AWS Integration Patterns</h3>
            <p className="text-sm text-slate-600 mb-6">
              Choose the right AWS service pattern based on your approval workflow requirements.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {AWS_HITL_PATTERNS.map(pattern => (
                <div
                  key={pattern.id}
                  className="rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${pattern.color}15` }}
                    >
                      <Icon name={pattern.icon} className="w-5 h-5" style={{ color: pattern.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900">{pattern.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                          {pattern.service}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{pattern.description}</p>
                      <div className="mt-2 text-[10px] text-slate-500">
                        <strong>Best for:</strong> {pattern.useCase}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* HITL Design Checklist */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Icon name="clipboard-list" className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-800 mb-2">HITL Gate Design Checklist</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-amber-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-0`} className="rounded border-amber-400" />
                    <span>Define clear trigger conditions</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-1`} className="rounded border-amber-400" />
                    <span>Assign primary and backup approvers</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-2`} className="rounded border-amber-400" />
                    <span>Set timeout thresholds per risk level</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-3`} className="rounded border-amber-400" />
                    <span>Configure escalation paths</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-4`} className="rounded border-amber-400" />
                    <span>Define timeout actions (deny/escalate)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-5`} className="rounded border-amber-400" />
                    <span>Enable audit logging</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-6`} className="rounded border-amber-400" />
                    <span>Configure notification channels</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id={`${hitlChecklistId}-7`} className="rounded border-amber-400" />
                    <span>Set SLA targets and alerts</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: A2A Governance */}
      {activeSection === 'a2a' && (
        <div className="space-y-6">
          {/* Trust Policy Design */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Trust Policy Design</h3>
            <p className="text-sm text-slate-600 mb-6">
              Define which agents can communicate with which, and what they can do.
            </p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              {TRUST_POLICY_ELEMENTS.map((element, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">{element.name}</h4>
                  <p className="text-xs text-slate-600 mb-2">{element.description}</p>
                  <code className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                    {element.example}
                  </code>
                </div>
              ))}
            </div>

            {/* Trust Levels */}
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Trust Levels</h4>
            <div className="grid grid-cols-4 gap-4">
              {TRUST_LEVELS.map(level => (
                <div
                  key={level.level}
                  {...rowButtonProps(
                    () => setSelectedTrustLevel(selectedTrustLevel === level.level ? null : level.level),
                    `Trust level: ${level.level}`,
                  )}
                  aria-pressed={selectedTrustLevel === level.level}
                  className={`rounded-xl border-2 p-4 cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                    selectedTrustLevel === level.level
                      ? 'border-violet-500 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  style={{ backgroundColor: `${level.color}08` }}
                >
                  <div
                    className="text-sm font-bold mb-1"
                    style={{ color: level.color }}
                  >
                    {level.level}
                  </div>
                  <p className="text-xs text-slate-600 mb-3">{level.description}</p>

                  {selectedTrustLevel === level.level && (
                    <div className="space-y-2 pt-3 border-t border-slate-200">
                      <div className="text-[10px]">
                        <span className="font-semibold text-slate-500">Access:</span>
                        <span className="text-slate-700 ml-1">{level.accessType}</span>
                      </div>
                      <div className="text-[10px]">
                        <span className="font-semibold text-slate-500">Rate Limit:</span>
                        <span className="text-slate-700 ml-1">{level.rateLimit}</span>
                      </div>
                      <div className="text-[10px]">
                        <span className="font-semibold text-slate-500">Data:</span>
                        <span className="text-slate-700 ml-1">{level.dataAccess}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Communication Protocols */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Communication Protocols</h3>
            <div className="grid grid-cols-3 gap-4">
              {A2A_PROTOCOLS.map((protocol, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      protocol.type === 'sync' ? 'bg-blue-100 text-blue-700' :
                      protocol.type === 'async' ? 'bg-purple-100 text-purple-700' :
                      'bg-pink-100 text-pink-700'
                    }`}>
                      {protocol.type}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                      {protocol.service}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">{protocol.name}</h4>
                  <p className="text-xs text-slate-600 mb-2">{protocol.description}</p>
                  <div className="text-[10px] text-slate-500">
                    <strong>Best for:</strong> {protocol.bestFor}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* A2A Governance Checklist */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">A2A Governance Checklist</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-cyan-700 mb-3 flex items-center gap-2">
                  <Icon name="shield-check" className="w-4 h-4" />
                  Trust Policy
                </h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-trust-0`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Define explicit allowlists for agent-to-agent communication</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-trust-1`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Specify permitted actions per agent pair</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-trust-2`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Set data classification boundaries (no PII to external)</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-trust-3`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Configure rate limits per trust level</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-trust-4`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Set max chain depth to prevent runaway sequences</span>
                  </label>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-cyan-700 mb-3 flex items-center gap-2">
                  <Icon name="cloud" className="w-4 h-4" />
                  AWS Integration
                </h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-aws-0`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Configure IAM roles with cross-agent assume-role policies</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-aws-1`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Set up EventBridge schemas for message contracts</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-aws-2`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Deploy SQS dead letter queues for failed messages</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-aws-3`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Enable API Gateway request validation</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id={`${a2aChecklistId}-aws-4`} className="rounded border-cyan-400 mt-0.5" />
                    <span>Configure audit logging for all A2A communications</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Best Practices */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Icon name="check-circle" className="w-5 h-5 text-emerald-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-800 mb-2">A2A Best Practices</h4>
                <div className="grid grid-cols-2 gap-4 text-xs text-emerald-700">
                  <div className="flex items-start gap-2">
                    <Icon name="check" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Default deny: agents cannot communicate unless explicitly allowed</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Use supervisor patterns to maintain control over agent chains</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Implement circuit breakers to halt runaway agent chains</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Log all inter-agent communications for audit</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Validate message schemas at both sender and receiver</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name="check" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Monitor cascade risk: base_risk x 1.15^chain_depth</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
