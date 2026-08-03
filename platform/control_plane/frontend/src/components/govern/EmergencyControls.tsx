/**
 * FleetControls — Fleet-wide controls for the Agent Control Plane.
 *
 * Based on AWS Bedrock AgentCore Cedar policy patterns:
 * https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html
 *
 * Provides controls across categories:
 *   - Emergency: Kill, Throttle, LOG_ONLY, Restart
 *   - Access: Role-based, Account-based, Scope-based restrictions
 *   - Input Validation: Field checks, Pattern matching
 *   - Federation: Multi-agent policies
 *
 * All actions are logged to CloudTrail and require confirmation for critical operations.
 */

import { useState } from 'react';
import { Icon, type IconName } from './icons';

type ControlCategory = 'emergency' | 'access' | 'validation' | 'federation';

interface FleetAction {
  id: string;
  label: string;
  icon: IconName;
  intent: 'danger' | 'warning' | 'primary' | 'success' | 'info';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  category: ControlCategory;
  requiresApproval: boolean;
  description: string;
  cedarPattern?: string;
  // Educational content
  howItWorks: string;
  whereItApplies: string[];
  useCases: string[];
  learnMoreUrl?: string;
}

const FLEET_ACTIONS: FleetAction[] = [
  // Emergency Controls
  {
    id: 'kill',
    label: 'Kill All Agents',
    icon: 'stop-circle',
    intent: 'danger',
    severity: 'Critical',
    category: 'emergency',
    requiresApproval: true,
    description: 'Apply forbid-all Cedar policy. Stop all sessions. Block new invocations.',
    cedarPattern: 'forbid (principal, action, resource);',
    howItWorks: 'Deploys a Cedar policy that explicitly forbids all principals from taking any action on any resource. Because Cedar uses "forbid-wins" semantics, this policy overrides all permit policies, immediately halting all agent activity.',
    whereItApplies: [
      'All agents in your AgentCore runtime',
      'All tool invocations and API calls',
      'Both IAM and OAuth authenticated sessions',
    ],
    useCases: [
      'Security incident requiring immediate containment',
      'Detected data exfiltration or unauthorized access',
      'Compliance violation requiring full stop',
      'Pre-maintenance system lockdown',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html',
  },
  {
    id: 'throttle',
    label: 'Throttle Fleet (10%)',
    icon: 'pause-circle',
    intent: 'warning',
    severity: 'High',
    category: 'emergency',
    requiresApproval: true,
    description: 'Limit all agents to 10% invocation rate. Monitoring agent unaffected.',
    howItWorks: 'Applies rate limiting at the AgentCore gateway level, allowing only 10% of normal request volume through. Requests exceeding the limit receive a 429 (Too Many Requests) response. Monitoring and observability agents are excluded to maintain visibility.',
    whereItApplies: [
      'All production agent invocations',
      'Tool calls and external API requests',
      'Does NOT affect monitoring/logging agents',
    ],
    useCases: [
      'Suspected runaway agent behavior',
      'Cost spike mitigation',
      'Gradual incident response (before full kill)',
      'Load shedding during downstream outages',
    ],
  },
  {
    id: 'logonly',
    label: 'LOG_ONLY Mode',
    icon: 'lock-closed',
    intent: 'primary',
    severity: 'High',
    category: 'emergency',
    requiresApproval: false,
    description: 'Agents observe and log but execute no actions. Tools disabled.',
    howItWorks: 'Switches all agents to observation mode. Agents continue to receive requests and generate responses, but all tool executions are intercepted and logged without being performed. This allows you to see what agents would do without any real-world impact.',
    whereItApplies: [
      'All tool executions (MCP, function calls)',
      'External API integrations',
      'Database writes and mutations',
    ],
    useCases: [
      'Testing new agent behaviors safely',
      'Auditing agent decision-making',
      'Investigating suspicious patterns',
      'Pre-production validation',
    ],
  },
  {
    id: 'restart',
    label: 'Restart Sessions',
    icon: 'arrow-path',
    intent: 'success',
    severity: 'Medium',
    category: 'emergency',
    requiresApproval: false,
    description: 'Clear sessions, reset short-term memory, reload Cedar policies.',
    howItWorks: 'Gracefully terminates all active agent sessions, clears conversation context and short-term memory, then reloads the latest Cedar policies from your policy store. Agents restart fresh with updated authorization rules.',
    whereItApplies: [
      'All active agent sessions',
      'Short-term/conversation memory',
      'Cached Cedar policy evaluations',
    ],
    useCases: [
      'After deploying new Cedar policies',
      'Clearing corrupted conversation state',
      'Recovering from agent confusion/loops',
      'Routine maintenance refresh',
    ],
  },
  // Access Controls (Cedar-based)
  {
    id: 'block-account',
    label: 'Block AWS Account',
    icon: 'no-symbol',
    intent: 'danger',
    severity: 'High',
    category: 'access',
    requiresApproval: true,
    description: 'Forbid all requests from a specific AWS account. Forbid-wins semantics.',
    cedarPattern: 'forbid (principal, action, resource)\nwhen { principal.id like "*:<account-id>:*" };',
    howItWorks: 'Creates a Cedar forbid policy that matches any principal whose IAM ARN contains the specified account ID. Due to Cedar\'s "forbid-wins" semantics, this blocks all access even if other permit policies exist for that account.',
    whereItApplies: [
      'All IAM principals from the blocked account',
      'Cross-account assumed roles',
      'Federated users from that account',
    ],
    useCases: [
      'Revoking access from compromised account',
      'Blocking untrusted third-party accounts',
      'Enforcing account boundary isolation',
      'Emergency response to credential leak',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html#forbid-specific-accounts',
  },
  {
    id: 'restrict-role',
    label: 'Restrict IAM Role',
    icon: 'user',
    intent: 'warning',
    severity: 'Medium',
    category: 'access',
    requiresApproval: false,
    description: 'Limit specific IAM role to read-only operations. Block write actions.',
    cedarPattern: 'forbid (principal, action, resource)\nwhen {\n  principal.id like "*:role/ReadOnly*" &&\n  action in [Action::"write", Action::"delete"]\n};',
    howItWorks: 'Matches IAM roles by ARN pattern and forbids them from executing write or delete actions. The role can still perform read operations. Uses Cedar\'s pattern matching with wildcards for flexible role targeting.',
    whereItApplies: [
      'IAM roles matching the specified pattern',
      'Write and delete tool operations',
      'Database mutations, file writes, API POSTs',
    ],
    useCases: [
      'Enforcing least-privilege for service roles',
      'Creating read-only analyst access',
      'Preventing accidental mutations in prod',
      'Compliance with separation of duties',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html#forbid-specific-roles',
  },
  {
    id: 'scope-auth',
    label: 'OAuth Scope Check',
    icon: 'shield-check',
    intent: 'info',
    severity: 'Low',
    category: 'access',
    requiresApproval: false,
    description: 'Enforce OAuth scope requirements for tool access. Scope-based authorization.',
    cedarPattern: 'permit (principal, action, resource)\nwhen {\n  principal.hasTag("scope") &&\n  principal.getTag("scope") like "*:read"\n};',
    howItWorks: 'Checks the OAuth token\'s scope claims before permitting access. Uses Cedar\'s tag functions to read scope values from the authenticated principal and pattern-match against required permissions.',
    whereItApplies: [
      'OAuth/OIDC authenticated users',
      'Third-party application integrations',
      'User-facing agent interfaces',
    ],
    useCases: [
      'Fine-grained API access control',
      'Third-party app permission boundaries',
      'User consent-based access',
      'GDPR/privacy compliance scoping',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html#scope-based-authorization',
  },
  // Input Validation Controls
  {
    id: 'require-fields',
    label: 'Require Input Fields',
    icon: 'clipboard-document-check',
    intent: 'primary',
    severity: 'Medium',
    category: 'validation',
    requiresApproval: false,
    description: 'Forbid requests missing required input fields. Field existence validation.',
    cedarPattern: 'forbid (principal, action, resource)\nunless { context.input has "required_field" };',
    howItWorks: 'Uses Cedar\'s "unless" clause to forbid requests that don\'t include specified fields in their input context. This enforces that agents must provide certain information before an action is permitted.',
    whereItApplies: [
      'Tool input parameters',
      'API request payloads',
      'Agent function call arguments',
    ],
    useCases: [
      'Ensuring audit trail completeness',
      'Requiring justification for sensitive ops',
      'Enforcing data quality standards',
      'Compliance documentation requirements',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html#field-existence-check',
  },
  {
    id: 'pattern-match',
    label: 'Input Pattern Filter',
    icon: 'funnel',
    intent: 'info',
    severity: 'Low',
    category: 'validation',
    requiresApproval: false,
    description: 'Filter requests based on input value patterns. Wildcard matching.',
    cedarPattern: 'permit (principal, action, resource)\nwhen {\n  context.input.category like "*approved*"\n};',
    howItWorks: 'Uses Cedar\'s "like" operator with wildcard patterns to match input values. Only requests where the input matches the specified pattern are permitted, allowing flexible content-based filtering.',
    whereItApplies: [
      'Input field values (strings, categories)',
      'Request metadata and tags',
      'User-provided parameters',
    ],
    useCases: [
      'Restricting to approved categories only',
      'Filtering by department or team codes',
      'Blocking sensitive data patterns',
      'Enforcing naming conventions',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html#pattern-matching',
  },
  // Federation Controls
  {
    id: 'agent-federation',
    label: 'Multi-Agent Policy',
    icon: 'users',
    intent: 'success',
    severity: 'Medium',
    category: 'federation',
    requiresApproval: false,
    description: 'Configure different tool access per agent role. Multi-agent federation.',
    cedarPattern: '// Agent A: read-only tools\npermit (\n  principal == AgentCore::IamEntity::"arn:...agent-a",\n  action in [Action::"read", Action::"list"],\n  resource\n);\n\n// Agent B: full access\npermit (\n  principal == AgentCore::IamEntity::"arn:...agent-b",\n  action,\n  resource\n);',
    howItWorks: 'Creates separate Cedar policies for each agent identity, granting different action sets to each. This enables a fleet of specialized agents with different capabilities — some read-only, some with full access, some limited to specific tools.',
    whereItApplies: [
      'Individual agent IAM roles',
      'Tool/action permissions per agent',
      'Resource access boundaries',
    ],
    useCases: [
      'Analyst agent (read) vs. Operator agent (write)',
      'Customer-facing vs. internal agents',
      'Tiered agent privilege levels',
      'Domain-specific agent boundaries',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html#multi-agent-federation',
  },
  {
    id: 'cross-account',
    label: 'Cross-Account Access',
    icon: 'arrows-right-left',
    intent: 'warning',
    severity: 'High',
    category: 'federation',
    requiresApproval: true,
    description: 'Allow trusted cross-account agent invocations. Account-based permits.',
    cedarPattern: 'permit (principal, action, resource)\nwhen {\n  principal.id like "*:111122223333:*" ||\n  principal.id like "*:444455556666:*"\n};',
    howItWorks: 'Explicitly permits access from specific trusted AWS accounts by matching their account ID in the principal ARN. Multiple accounts can be allowed using OR logic. Combined with a default-deny baseline, this creates a secure cross-account trust boundary.',
    whereItApplies: [
      'Cross-account IAM role assumptions',
      'Partner/vendor integrations',
      'Multi-account organization setups',
    ],
    useCases: [
      'Shared services across business units',
      'Partner ecosystem integrations',
      'Central governance with distributed agents',
      'Disaster recovery cross-region access',
    ],
    learnMoreUrl: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html#account-based-restriction',
  },
];

const intentStyles: Record<string, { button: string; badge: string; border: string; bg: string }> = {
  danger: {
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
    badge: 'bg-rose-100 text-rose-700',
    border: 'border-rose-300',
    bg: 'bg-rose-50',
  },
  warning: {
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-300',
    bg: 'bg-amber-50',
  },
  primary: {
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-300',
    bg: 'bg-blue-50',
  },
  success: {
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-300',
    bg: 'bg-emerald-50',
  },
  info: {
    button: 'bg-slate-600 hover:bg-slate-700 text-white',
    badge: 'bg-slate-100 text-slate-700',
    border: 'border-slate-300',
    bg: 'bg-slate-50',
  },
};

const categoryConfig: Record<ControlCategory, { label: string; icon: IconName; color: string }> = {
  emergency: {
    label: 'Emergency',
    icon: 'exclamation-triangle',
    color: 'text-rose-600',
  },
  access: {
    label: 'Access Control',
    icon: 'lock-closed',
    color: 'text-amber-600',
  },
  validation: {
    label: 'Input Validation',
    icon: 'clipboard',
    color: 'text-blue-600',
  },
  federation: {
    label: 'Federation',
    icon: 'users',
    color: 'text-emerald-600',
  },
};

interface Props {
  compact?: boolean;
}

export default function EmergencyControls({ compact = false }: Props) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; label: string; output: string; ts: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<ControlCategory | 'all'>('all');

  const executeAction = async (action: FleetAction) => {
    setConfirmAction(null);
    setBusy(action.id);

    // Simulate API call - in production this would hit /api/agents/security-operations
    await new Promise(resolve => setTimeout(resolve, 1500));

    setResult({
      id: action.id,
      label: action.label,
      output: `${action.label} executed successfully. All affected agents notified.`,
      ts: new Date().toISOString(),
    });
    setBusy(null);
  };

  const selected = selectedAction ? FLEET_ACTIONS.find(a => a.id === selectedAction) : null;
  const action = confirmAction ? FLEET_ACTIONS.find(a => a.id === confirmAction) : null;
  const filteredActions = activeCategory === 'all'
    ? FLEET_ACTIONS
    : FLEET_ACTIONS.filter(a => a.category === activeCategory);

  if (compact) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border-2 border-violet-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Icon name="cog" className="w-4 h-4 text-violet-600" strokeWidth={2} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Fleet Controls</div>
            <div className="text-[10px] text-slate-500">Cedar policy actions</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FLEET_ACTIONS.filter(a => a.category === 'emergency').slice(0, 4).map(a => (
            <button
              key={a.id}
              onClick={() => a.requiresApproval ? setConfirmAction(a.id) : executeAction(a)}
              disabled={busy === a.id}
              className={`p-2 rounded-lg text-left transition-all text-xs font-medium ${intentStyles[a.intent].button} disabled:opacity-50`}
            >
              <div className="flex items-center gap-1.5">
                <Icon name={a.icon} className="w-4 h-4" strokeWidth={2} />
                <span className="truncate">{a.label.split(' ')[0]}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
            <Icon name="cog" className="w-4.5 h-4.5 text-violet-600" strokeWidth={2} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Fleet Controls</div>
            <div className="text-[10px] text-slate-500">Cedar policy-based fleet management</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
            {FLEET_ACTIONS.length} controls
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
            deny-by-default
          </span>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 bg-slate-50/50">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
            activeCategory === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          All
        </button>
        {(['emergency', 'access', 'validation', 'federation'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${
              activeCategory === cat ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon name={categoryConfig[cat].icon} className={`w-3.5 h-3.5 ${categoryConfig[cat].color}`} strokeWidth={2} />
            {categoryConfig[cat].label}
          </button>
        ))}
      </div>

      {/* Confirmation Dialog */}
      {action && (
        <div className={`mx-4 mt-3 p-3 rounded-lg border ${intentStyles[action.intent].border} ${intentStyles[action.intent].bg}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${intentStyles[action.intent].badge}`}>
                {action.severity}
              </span>
              <span className="text-xs font-semibold text-slate-900">{action.label}</span>
            </div>
            <button onClick={() => setConfirmAction(null)} className="p-0.5 hover:bg-white/50 rounded">
              <Icon name="x-mark" className="w-3.5 h-3.5 text-slate-500" strokeWidth={2} />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mb-2">{action.description}</p>
          {action.cedarPattern && (
            <div className="text-[9px] font-mono bg-slate-800 text-emerald-400 px-2 py-1 rounded mb-2 overflow-x-auto">
              {action.cedarPattern}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmAction(null)}
              className="px-2 py-1 text-[10px] text-slate-600 hover:bg-white/50 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => executeAction(action)}
              disabled={busy === action.id}
              className={`px-2 py-1 text-[10px] rounded transition-colors flex items-center gap-1 ${intentStyles[action.intent].button} disabled:opacity-50`}
            >
              {busy === action.id ? (
                <Icon name="spinner" className="w-3 h-3 animate-spin" />
              ) : <Icon name={action.icon} className="w-3 h-3" strokeWidth={2} />}
              {action.requiresApproval ? 'Approve' : 'Execute'}
            </button>
          </div>
        </div>
      )}

      {/* Result Banner */}
      {result && (
        <div className="mx-4 mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />
            <span className="text-[10px] font-medium text-emerald-800">{result.label}</span>
            <span className="text-[9px] text-emerald-600 ml-auto">{new Date(result.ts).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Main Content: Grid + Detail Panel */}
      {!confirmAction && (
        <div className="p-3">
          <div className={`grid gap-3 ${selected ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            {/* Action Grid */}
            <div className={`grid gap-2 ${selected ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'}`}>
              {filteredActions.map(a => {
                const catConfig = categoryConfig[a.category];
                const isSelected = selectedAction === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAction(isSelected ? null : a.id)}
                    disabled={busy === a.id}
                    className={`group p-2.5 rounded-lg border text-left transition-all hover:shadow-sm disabled:opacity-50 ${
                      isSelected ? `${intentStyles[a.intent].border} ${intentStyles[a.intent].bg} ring-2 ring-offset-1 ring-${a.intent === 'danger' ? 'rose' : a.intent === 'warning' ? 'amber' : a.intent === 'success' ? 'emerald' : a.intent === 'primary' ? 'blue' : 'slate'}-300` :
                      `${intentStyles[a.intent].border} hover:${intentStyles[a.intent].bg} bg-white`
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon
                        name={a.icon}
                        className={`w-4 h-4 mt-0.5 ${
                          a.intent === 'danger' ? 'text-rose-500' :
                          a.intent === 'warning' ? 'text-amber-500' :
                          a.intent === 'primary' ? 'text-blue-500' :
                          a.intent === 'success' ? 'text-emerald-500' :
                          'text-slate-500'
                        }`}
                        strokeWidth={2}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-800 leading-tight">{a.label}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5 line-clamp-2">{a.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${intentStyles[a.intent].badge}`}>
                        {a.severity}
                      </span>
                      <span className={`text-[8px] ${catConfig.color}`}>{catConfig.label}</span>
                      {a.requiresApproval && (
                        <Icon name="lock-closed" className="w-2.5 h-2.5 text-amber-500 ml-auto" strokeWidth={2} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail Panel */}
            {selected && (
              <div className={`rounded-lg border p-4 ${intentStyles[selected.intent].border} ${intentStyles[selected.intent].bg}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon
                      name={selected.icon}
                      className={`w-4 h-4 ${
                        selected.intent === 'danger' ? 'text-rose-600' :
                        selected.intent === 'warning' ? 'text-amber-600' :
                        selected.intent === 'primary' ? 'text-blue-600' :
                        selected.intent === 'success' ? 'text-emerald-600' :
                        'text-slate-600'
                      }`}
                      strokeWidth={2}
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{selected.label}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${intentStyles[selected.intent].badge}`}>
                          {selected.severity}
                        </span>
                        <span className={`text-[9px] ${categoryConfig[selected.category].color}`}>
                          {categoryConfig[selected.category].label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedAction(null)}
                    className="p-1 hover:bg-white/50 rounded transition-colors"
                  >
                    <Icon name="x-mark" className="w-4 h-4 text-slate-400" strokeWidth={2} />
                  </button>
                </div>

                {/* How It Works */}
                <div className="mb-3">
                  <div className="text-[10px] font-semibold text-slate-700 uppercase mb-1">How It Works</div>
                  <p className="text-xs text-slate-600 leading-relaxed">{selected.howItWorks}</p>
                </div>

                {/* Cedar Policy */}
                {selected.cedarPattern && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold text-slate-700 uppercase mb-1">Cedar Policy</div>
                    <pre className="text-[10px] font-mono bg-slate-800 text-emerald-400 px-3 py-2 rounded overflow-x-auto whitespace-pre-wrap">
                      {selected.cedarPattern}
                    </pre>
                  </div>
                )}

                {/* Where It Applies */}
                <div className="mb-3">
                  <div className="text-[10px] font-semibold text-slate-700 uppercase mb-1">Where It Applies</div>
                  <ul className="space-y-1">
                    {selected.whereItApplies.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                        <Icon name="chevron-right" className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" strokeWidth={2} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Use Cases */}
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-slate-700 uppercase mb-1">Common Use Cases</div>
                  <ul className="space-y-1">
                    {selected.useCases.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                        <Icon name="check" className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" strokeWidth={2} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-200/50">
                  {selected.learnMoreUrl && (
                    <a
                      href={selected.learnMoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Learn More →
                    </a>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => selected.requiresApproval ? setConfirmAction(selected.id) : executeAction(selected)}
                    disabled={busy === selected.id}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1.5 ${intentStyles[selected.intent].button} disabled:opacity-50`}
                  >
                    {busy === selected.id ? (
                      <Icon name="spinner" className="w-3 h-3 animate-spin" />
                    ) : selected.requiresApproval ? (
                      <Icon name="lock-closed" className="w-3 h-3" strokeWidth={2} />
                    ) : (
                      <Icon name="play-circle" className="w-3 h-3" strokeWidth={2} />
                    )}
                    {selected.requiresApproval ? 'Request Approval' : 'Apply Control'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="text-[9px] text-slate-500">
          All actions logged to CloudTrail
        </div>
        <a
          href="https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-blue-600 hover:text-blue-700 font-medium"
        >
          Cedar Policy Docs →
        </a>
      </div>
    </div>
  );
}
