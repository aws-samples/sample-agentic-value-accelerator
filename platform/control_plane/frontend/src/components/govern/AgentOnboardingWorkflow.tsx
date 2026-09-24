/**
 * AgentOnboardingWorkflow - IT-Controlled Agent Onboarding Wizard
 *
 * Implements a structured, risk-based agent onboarding workflow similar to
 * Microsoft Agent365's IT-controlled onboarding pattern.
 *
 * Features:
 * - 8-step wizard: Registration, Classification, Security Review, Policy Assignment,
 *   Tool & Data Access, Testing, Approval, Deployment
 * - Risk-based approval routing (Tier 1-2: auto, Tier 3: team lead, Tier 4: security+compliance)
 * - Save draft and resume later
 * - Progress indicator with step completion tracking
 * - Validation at each step
 * - Pre-fill from existing agent (for re-onboarding)
 * - Audit trail of all decisions
 * - Onboarding queue dashboard with filtering
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Icon, type IconName } from './icons';

// ─────────────────────────── Types ───────────────────────────

type RiskTier = 1 | 2 | 3 | 4;
type DataSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
type OnboardingStatus = 'draft' | 'registration' | 'classification' | 'security-review' |
  'policy-assignment' | 'tool-access' | 'testing' | 'pending-approval' | 'approved' | 'deployed' | 'rejected';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto-approved';

interface SecurityChecklistItem {
  id: string;
  label: string;
  description: string;
  required: boolean;
  requiredForTiers: RiskTier[];
  checked: boolean;
  notes?: string;
}

interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  applicableTiers: RiskTier[];
  controls: string[];
  category: 'access' | 'data' | 'operational' | 'compliance';
}

interface ToolAccess {
  id: string;
  name: string;
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  approved: boolean;
  justification?: string;
}

interface DataSource {
  id: string;
  name: string;
  sensitivity: DataSensitivity;
  approved: boolean;
  justification?: string;
}

interface TestingRequirement {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'passed' | 'failed';
  requiredForTiers: RiskTier[];
  result?: string;
}

interface ApprovalRecord {
  id: string;
  approverRole: 'auto' | 'team-lead' | 'security' | 'compliance';
  approverName: string;
  status: ApprovalStatus;
  timestamp: string;
  comments?: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details: string;
  stepIndex?: number;
}

interface OnboardingRequest {
  id: string;
  // Step 1: Registration
  name: string;
  description: string;
  owner: string;
  team: string;
  purpose: string;
  // Step 2: Classification
  riskTier: RiskTier;
  dataSensitivity: DataSensitivity;
  customerFacing: boolean;
  // Step 3: Security Review
  securityChecklist: SecurityChecklistItem[];
  // Step 4: Policy Assignment
  assignedPolicies: string[];
  // Step 5: Tool & Data Access
  requestedTools: ToolAccess[];
  requestedDataSources: DataSource[];
  // Step 6: Testing
  testingRequirements: TestingRequirement[];
  sandboxValidated: boolean;
  // Step 7: Approval
  approvals: ApprovalRecord[];
  // Step 8: Deployment
  deploymentDate?: string;
  deploymentNotes?: string;
  // Meta
  status: OnboardingStatus;
  currentStep: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  auditTrail: AuditEntry[];
  existingAgentId?: string; // For re-onboarding
}

// ─────────────────────────── Constants ───────────────────────────

const STEPS: { index: number; id: string; name: string; icon: IconName; description: string }[] = [
  { index: 0, id: 'registration', name: 'Registration', icon: 'clipboard-list', description: 'Basic agent information' },
  { index: 1, id: 'classification', name: 'Classification', icon: 'tag', description: 'Risk and data classification' },
  { index: 2, id: 'security-review', name: 'Security Review', icon: 'shield-check', description: 'Security checklist' },
  { index: 3, id: 'policy-assignment', name: 'Policy Assignment', icon: 'document-check', description: 'Assign security policies' },
  { index: 4, id: 'tool-access', name: 'Tool & Data Access', icon: 'wrench-screwdriver', description: 'Request tools and data' },
  { index: 5, id: 'testing', name: 'Testing', icon: 'beaker', description: 'Sandbox validation' },
  { index: 6, id: 'approval', name: 'Approval', icon: 'check-badge', description: 'Risk-based approval' },
  { index: 7, id: 'deployment', name: 'Deployment', icon: 'rocket-launch', description: 'Final activation' },
];

const RISK_TIER_CONFIG: Record<RiskTier, { label: string; color: string; bgColor: string; description: string; approvalPath: string }> = {
  1: {
    label: 'Tier 1 - Minimal',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 border-emerald-200',
    description: 'Read-only, internal tools, no customer data',
    approvalPath: 'Auto-approve after checklist',
  },
  2: {
    label: 'Tier 2 - Low',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    description: 'Limited write access, internal data only',
    approvalPath: 'Auto-approve after checklist',
  },
  3: {
    label: 'Tier 3 - Moderate',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50 border-amber-200',
    description: 'External integrations, confidential data access',
    approvalPath: 'Team lead approval required',
  },
  4: {
    label: 'Tier 4 - High',
    color: 'text-rose-700',
    bgColor: 'bg-rose-50 border-rose-200',
    description: 'Customer-facing, restricted data, autonomous decisions',
    approvalPath: 'Security + Compliance approval required',
  },
};

const DATA_SENSITIVITY_OPTIONS: { value: DataSensitivity; label: string; description: string }[] = [
  { value: 'public', label: 'Public', description: 'Publicly available information' },
  { value: 'internal', label: 'Internal', description: 'Internal company data' },
  { value: 'confidential', label: 'Confidential', description: 'Business-sensitive information' },
  { value: 'restricted', label: 'Restricted', description: 'Highly sensitive / regulated data (PII, PHI, financial)' },
];

const DEFAULT_SECURITY_CHECKLIST: Omit<SecurityChecklistItem, 'checked' | 'notes'>[] = [
  { id: 'auth', label: 'Authentication configured', description: 'Agent has proper authentication mechanism', required: true, requiredForTiers: [1, 2, 3, 4] },
  { id: 'authz', label: 'Authorization scoped', description: 'Permissions follow least-privilege principle', required: true, requiredForTiers: [1, 2, 3, 4] },
  { id: 'logging', label: 'Audit logging enabled', description: 'All actions are logged for audit trail', required: true, requiredForTiers: [1, 2, 3, 4] },
  { id: 'encryption', label: 'Data encryption', description: 'Data at rest and in transit is encrypted', required: true, requiredForTiers: [2, 3, 4] },
  { id: 'dlp', label: 'DLP controls', description: 'Data loss prevention controls configured', required: true, requiredForTiers: [3, 4] },
  { id: 'guardrails', label: 'Guardrails configured', description: 'Input/output guardrails are in place', required: true, requiredForTiers: [2, 3, 4] },
  { id: 'rate-limit', label: 'Rate limiting', description: 'API rate limits configured', required: false, requiredForTiers: [3, 4] },
  { id: 'human-loop', label: 'Human-in-the-loop', description: 'Human approval for high-risk actions', required: true, requiredForTiers: [3, 4] },
  { id: 'emergency-stop', label: 'Emergency stop', description: 'Kill switch configured for immediate shutdown', required: true, requiredForTiers: [4] },
  { id: 'bias-testing', label: 'Bias testing complete', description: 'Agent tested for fairness and bias', required: true, requiredForTiers: [4] },
  { id: 'pen-test', label: 'Security assessment', description: 'Penetration testing or security review completed', required: false, requiredForTiers: [4] },
];

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'basic-access',
    name: 'Basic Access Control',
    description: 'Standard authentication and authorization requirements',
    applicableTiers: [1, 2, 3, 4],
    controls: ['OAuth 2.0 authentication', 'Role-based access control', 'Session timeout'],
    category: 'access',
  },
  {
    id: 'data-handling',
    name: 'Data Handling Policy',
    description: 'Requirements for data access and processing',
    applicableTiers: [2, 3, 4],
    controls: ['Encryption at rest', 'Encryption in transit', 'Data retention limits', 'Access logging'],
    category: 'data',
  },
  {
    id: 'pii-protection',
    name: 'PII Protection Policy',
    description: 'Enhanced controls for personally identifiable information',
    applicableTiers: [3, 4],
    controls: ['Data masking', 'Access audit trail', 'Consent verification', 'Right to deletion support'],
    category: 'compliance',
  },
  {
    id: 'financial-data',
    name: 'Financial Data Policy',
    description: 'Controls for financial and regulated data',
    applicableTiers: [4],
    controls: ['SOC 2 compliance', 'Transaction logging', 'Segregation of duties', 'Dual approval for changes'],
    category: 'compliance',
  },
  {
    id: 'operational-safety',
    name: 'Operational Safety Policy',
    description: 'Runtime safety and monitoring requirements',
    applicableTiers: [3, 4],
    controls: ['Real-time monitoring', 'Anomaly detection', 'Automatic throttling', 'Incident escalation'],
    category: 'operational',
  },
  {
    id: 'autonomous-ops',
    name: 'Autonomous Operations Policy',
    description: 'Enhanced controls for autonomous decision-making agents',
    applicableTiers: [4],
    controls: ['Human-in-the-loop checkpoints', 'Decision audit trail', 'Reversibility requirements', 'Blast radius limits'],
    category: 'operational',
  },
];

const AVAILABLE_TOOLS: Omit<ToolAccess, 'approved' | 'justification'>[] = [
  { id: 'web-search', name: 'Web Search', category: 'Information', riskLevel: 'low' },
  { id: 'file-read', name: 'File System (Read)', category: 'Data', riskLevel: 'low' },
  { id: 'file-write', name: 'File System (Write)', category: 'Data', riskLevel: 'medium' },
  { id: 'database-read', name: 'Database (Read)', category: 'Data', riskLevel: 'medium' },
  { id: 'database-write', name: 'Database (Write)', category: 'Data', riskLevel: 'high' },
  { id: 'api-internal', name: 'Internal APIs', category: 'Integration', riskLevel: 'medium' },
  { id: 'api-external', name: 'External APIs', category: 'Integration', riskLevel: 'high' },
  { id: 'email-send', name: 'Email (Send)', category: 'Communication', riskLevel: 'medium' },
  { id: 'slack-post', name: 'Slack (Post)', category: 'Communication', riskLevel: 'low' },
  { id: 'code-execute', name: 'Code Execution', category: 'Compute', riskLevel: 'high' },
];

const AVAILABLE_DATA_SOURCES: Omit<DataSource, 'approved' | 'justification'>[] = [
  { id: 'public-docs', name: 'Public Documentation', sensitivity: 'public' },
  { id: 'internal-wiki', name: 'Internal Wiki', sensitivity: 'internal' },
  { id: 'hr-data', name: 'HR Systems', sensitivity: 'confidential' },
  { id: 'customer-data', name: 'Customer Database', sensitivity: 'restricted' },
  { id: 'financial-data', name: 'Financial Systems', sensitivity: 'restricted' },
  { id: 'analytics-data', name: 'Analytics Platform', sensitivity: 'internal' },
  { id: 'crm-data', name: 'CRM Data', sensitivity: 'confidential' },
  { id: 'product-catalog', name: 'Product Catalog', sensitivity: 'public' },
];

const DEFAULT_TESTING_REQUIREMENTS: Omit<TestingRequirement, 'status' | 'result'>[] = [
  { id: 'functional', name: 'Functional Testing', description: 'Agent performs intended tasks correctly', requiredForTiers: [1, 2, 3, 4] },
  { id: 'security-scan', name: 'Security Scan', description: 'No critical vulnerabilities detected', requiredForTiers: [2, 3, 4] },
  { id: 'load-test', name: 'Load Testing', description: 'Handles expected traffic volume', requiredForTiers: [3, 4] },
  { id: 'guardrail-test', name: 'Guardrail Testing', description: 'Input/output filters work as expected', requiredForTiers: [2, 3, 4] },
  { id: 'failover-test', name: 'Failover Testing', description: 'Graceful degradation verified', requiredForTiers: [3, 4] },
  { id: 'bias-audit', name: 'Bias Audit', description: 'Outputs tested for fairness across groups', requiredForTiers: [4] },
  { id: 'red-team', name: 'Red Team Exercise', description: 'Adversarial testing completed', requiredForTiers: [4] },
];

const TEAMS = ['Platform Engineering', 'Data Science', 'Customer Success', 'Operations', 'Security', 'Finance', 'HR', 'Legal'];

const STORAGE_KEY = 'agent-onboarding-drafts';

// ─────────────────────────── Mock Data ───────────────────────────

const MOCK_ONBOARDING_QUEUE: OnboardingRequest[] = [
  {
    id: 'ONB-001',
    name: 'Customer Support Assistant',
    description: 'AI assistant for tier-1 customer support queries',
    owner: 'Sarah Chen',
    team: 'Customer Success',
    purpose: 'Automate common customer inquiries and reduce ticket volume',
    riskTier: 3,
    dataSensitivity: 'confidential',
    customerFacing: true,
    securityChecklist: [],
    assignedPolicies: ['basic-access', 'data-handling', 'pii-protection'],
    requestedTools: [],
    requestedDataSources: [],
    testingRequirements: [],
    sandboxValidated: true,
    approvals: [{ id: 'APR-001', approverRole: 'team-lead', approverName: 'Mike Johnson', status: 'pending', timestamp: '2024-01-15T10:30:00Z' }],
    status: 'pending-approval',
    currentStep: 6,
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    createdBy: 'sarah.chen@example.com',
    auditTrail: [],
  },
  {
    id: 'ONB-002',
    name: 'Document Summarizer',
    description: 'Internal tool for summarizing long documents',
    owner: 'Alex Rivera',
    team: 'Operations',
    purpose: 'Help employees quickly understand lengthy reports',
    riskTier: 1,
    dataSensitivity: 'internal',
    customerFacing: false,
    securityChecklist: [],
    assignedPolicies: ['basic-access'],
    requestedTools: [],
    requestedDataSources: [],
    testingRequirements: [],
    sandboxValidated: true,
    approvals: [{ id: 'APR-002', approverRole: 'auto', approverName: 'System', status: 'auto-approved', timestamp: '2024-01-14T14:00:00Z' }],
    status: 'approved',
    currentStep: 7,
    createdAt: '2024-01-12T11:00:00Z',
    updatedAt: '2024-01-14T14:00:00Z',
    createdBy: 'alex.rivera@example.com',
    auditTrail: [],
  },
  {
    id: 'ONB-003',
    name: 'Trading Analysis Agent',
    description: 'AI agent for market analysis and trade recommendations',
    owner: 'James Park',
    team: 'Finance',
    purpose: 'Provide real-time market insights to traders',
    riskTier: 4,
    dataSensitivity: 'restricted',
    customerFacing: false,
    securityChecklist: [],
    assignedPolicies: ['basic-access', 'data-handling', 'financial-data', 'autonomous-ops'],
    requestedTools: [],
    requestedDataSources: [],
    testingRequirements: [],
    sandboxValidated: false,
    approvals: [],
    status: 'testing',
    currentStep: 5,
    createdAt: '2024-01-08T08:00:00Z',
    updatedAt: '2024-01-13T16:00:00Z',
    createdBy: 'james.park@example.com',
    auditTrail: [],
  },
  {
    id: 'ONB-004',
    name: 'Code Review Assistant',
    description: 'AI assistant for automated code reviews',
    owner: 'Emily Zhang',
    team: 'Platform Engineering',
    purpose: 'Accelerate code review process with AI suggestions',
    riskTier: 2,
    dataSensitivity: 'internal',
    customerFacing: false,
    securityChecklist: [],
    assignedPolicies: ['basic-access', 'data-handling'],
    requestedTools: [],
    requestedDataSources: [],
    testingRequirements: [],
    sandboxValidated: true,
    approvals: [{ id: 'APR-003', approverRole: 'auto', approverName: 'System', status: 'auto-approved', timestamp: '2024-01-16T09:00:00Z' }],
    status: 'deployed',
    currentStep: 7,
    createdAt: '2024-01-05T10:00:00Z',
    updatedAt: '2024-01-16T11:00:00Z',
    createdBy: 'emily.zhang@example.com',
    auditTrail: [],
  },
  {
    id: 'ONB-005',
    name: 'Fraud Detection Agent',
    description: 'Real-time transaction fraud scoring',
    owner: 'David Kim',
    team: 'Security',
    purpose: 'Identify and flag potentially fraudulent transactions',
    riskTier: 4,
    dataSensitivity: 'restricted',
    customerFacing: true,
    securityChecklist: [],
    assignedPolicies: [],
    requestedTools: [],
    requestedDataSources: [],
    testingRequirements: [],
    sandboxValidated: false,
    approvals: [
      { id: 'APR-004', approverRole: 'security', approverName: 'Security Team', status: 'approved', timestamp: '2024-01-14T10:00:00Z' },
      { id: 'APR-005', approverRole: 'compliance', approverName: 'Compliance Team', status: 'rejected', timestamp: '2024-01-15T14:00:00Z', comments: 'Missing bias testing documentation' },
    ],
    status: 'rejected',
    currentStep: 6,
    createdAt: '2024-01-03T09:00:00Z',
    updatedAt: '2024-01-15T14:00:00Z',
    createdBy: 'david.kim@example.com',
    auditTrail: [],
  },
];

// ─────────────────────────── Utility Functions ───────────────────────────

function createDefaultRequest(createdBy: string): OnboardingRequest {
  return {
    id: `ONB-${Date.now().toString(36).toUpperCase()}`,
    name: '',
    description: '',
    owner: '',
    team: '',
    purpose: '',
    riskTier: 1,
    dataSensitivity: 'internal',
    customerFacing: false,
    securityChecklist: DEFAULT_SECURITY_CHECKLIST.map(item => ({ ...item, checked: false })),
    assignedPolicies: [],
    requestedTools: AVAILABLE_TOOLS.map(tool => ({ ...tool, approved: false })),
    requestedDataSources: AVAILABLE_DATA_SOURCES.map(ds => ({ ...ds, approved: false })),
    testingRequirements: DEFAULT_TESTING_REQUIREMENTS.map(req => ({ ...req, status: 'pending' as const })),
    sandboxValidated: false,
    approvals: [],
    status: 'draft',
    currentStep: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy,
    auditTrail: [{
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'Created',
      actor: createdBy,
      details: 'Onboarding request created',
    }],
  };
}

function loadDrafts(): OnboardingRequest[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveDrafts(drafts: OnboardingRequest[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Ignore storage errors
  }
}

function getRequiredApprovalsForTier(tier: RiskTier): ApprovalRecord['approverRole'][] {
  switch (tier) {
    case 1:
    case 2:
      return ['auto'];
    case 3:
      return ['team-lead'];
    case 4:
      return ['security', 'compliance'];
  }
}

function getStatusColor(status: OnboardingStatus): { bg: string; text: string } {
  switch (status) {
    case 'draft':
      return { bg: 'bg-slate-100', text: 'text-slate-600' };
    case 'registration':
    case 'classification':
    case 'security-review':
    case 'policy-assignment':
    case 'tool-access':
    case 'testing':
      return { bg: 'bg-blue-100', text: 'text-blue-700' };
    case 'pending-approval':
      return { bg: 'bg-amber-100', text: 'text-amber-700' };
    case 'approved':
      return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
    case 'deployed':
      return { bg: 'bg-violet-100', text: 'text-violet-700' };
    case 'rejected':
      return { bg: 'bg-rose-100', text: 'text-rose-700' };
  }
}

// ─────────────────────────── Sub-Components ───────────────────────────

interface ProgressStepperProps {
  currentStep: number;
  steps: typeof STEPS;
  completedSteps: Set<number>;
  onStepClick: (index: number) => void;
}

function ProgressStepper({ currentStep, steps, completedSteps, onStepClick }: ProgressStepperProps) {
  return (
    <div className="mb-8">
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-500">Step {currentStep + 1} of {steps.length}</span>
        <span className="text-xs font-medium text-slate-700">
          {Math.round(((currentStep + 1) / steps.length) * 100)}% complete
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-start justify-between">
        {steps.map((step, idx) => {
          const isActive = idx === currentStep;
          const isCompleted = completedSteps.has(idx);
          const isAccessible = idx <= currentStep || isCompleted;

          return (
            <button
              key={step.id}
              onClick={() => isAccessible && onStepClick(idx)}
              disabled={!isAccessible}
              className={`flex flex-col items-center w-20 ${isAccessible ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-blue-500 text-white ring-4 ring-blue-200'
                    : isCompleted
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isCompleted ? (
                  <Icon name="check" className="w-5 h-5" />
                ) : (
                  <Icon name={step.icon} className="w-5 h-5" />
                )}
              </div>
              <span className={`text-[10px] font-medium mt-2 text-center ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
                {step.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface StepCardProps {
  title: string;
  description: string;
  icon: IconName;
  children: React.ReactNode;
}

function StepCard({ title, description, icon, children }: StepCardProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Icon name={icon} className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─────────────────────────── Step Components ───────────────────────────

interface StepProps {
  request: OnboardingRequest;
  onUpdate: (updates: Partial<OnboardingRequest>) => void;
}

function RegistrationStep({ request, onUpdate }: StepProps) {
  return (
    <StepCard title="Agent Registration" description="Provide basic information about the agent" icon="clipboard-list">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Agent Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={request.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Customer Support Assistant"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Owner <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={request.owner}
              onChange={(e) => onUpdate({ owner: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., John Smith"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={request.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Describe what this agent does..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Team <span className="text-rose-500">*</span>
            </label>
            <select
              value={request.team}
              onChange={(e) => onUpdate({ team: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select team...</option>
              {TEAMS.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Existing Agent ID (for re-onboarding)
            </label>
            <input
              type="text"
              value={request.existingAgentId || ''}
              onChange={(e) => onUpdate({ existingAgentId: e.target.value || undefined })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="AGT-XXX (optional)"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Purpose / Business Justification <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={request.purpose}
            onChange={(e) => onUpdate({ purpose: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Why is this agent needed? What business problem does it solve?"
          />
        </div>
      </div>
    </StepCard>
  );
}

function ClassificationStep({ request, onUpdate }: StepProps) {
  return (
    <StepCard title="Risk Classification" description="Classify the agent's risk tier and data sensitivity" icon="tag">
      <div className="space-y-6">
        {/* Risk Tier Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Risk Tier <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {([1, 2, 3, 4] as RiskTier[]).map(tier => {
              const config = RISK_TIER_CONFIG[tier];
              const isSelected = request.riskTier === tier;
              return (
                <button
                  key={tier}
                  onClick={() => onUpdate({ riskTier: tier })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? `${config.bgColor} border-current ring-2 ring-offset-1`
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`text-sm font-semibold ${isSelected ? config.color : 'text-slate-700'}`}>
                    {config.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{config.description}</div>
                  <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                    <Icon name="arrow-right" className="w-3 h-3" />
                    {config.approvalPath}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Data Sensitivity */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Data Sensitivity <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {DATA_SENSITIVITY_OPTIONS.map(option => {
              const isSelected = request.dataSensitivity === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => onUpdate({ dataSensitivity: option.value })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{option.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer Facing */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Customer Facing? <span className="text-rose-500">*</span>
          </label>
          <div className="flex gap-4">
            <button
              onClick={() => onUpdate({ customerFacing: true })}
              className={`flex-1 p-4 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${
                request.customerFacing
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
              }`}
            >
              <Icon name="users" className="w-5 h-5" />
              <span className="font-medium">Yes - External Users</span>
            </button>
            <button
              onClick={() => onUpdate({ customerFacing: false })}
              className={`flex-1 p-4 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${
                !request.customerFacing
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
              }`}
            >
              <Icon name="building-office" className="w-5 h-5" />
              <span className="font-medium">No - Internal Only</span>
            </button>
          </div>
        </div>

        {/* Risk Assessment Preview */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="information-circle" className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-semibold text-slate-800">Classification Summary</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-500">Risk Tier:</span>
              <span className={`ml-2 font-semibold ${RISK_TIER_CONFIG[request.riskTier].color}`}>
                Tier {request.riskTier}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Data:</span>
              <span className="ml-2 font-semibold text-slate-700 capitalize">{request.dataSensitivity}</span>
            </div>
            <div>
              <span className="text-slate-500">Exposure:</span>
              <span className={`ml-2 font-semibold ${request.customerFacing ? 'text-amber-600' : 'text-emerald-600'}`}>
                {request.customerFacing ? 'Customer-Facing' : 'Internal'}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200">
            <span className="text-slate-500 text-xs">Approval Path: </span>
            <span className="text-xs font-medium text-slate-700">{RISK_TIER_CONFIG[request.riskTier].approvalPath}</span>
          </div>
        </div>
      </div>
    </StepCard>
  );
}

function SecurityReviewStep({ request, onUpdate }: StepProps) {
  const applicableChecks = request.securityChecklist.filter(
    item => item.requiredForTiers.includes(request.riskTier)
  );

  const toggleCheck = (id: string) => {
    const updated = request.securityChecklist.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    onUpdate({ securityChecklist: updated });
  };

  const completedCount = applicableChecks.filter(c => c.checked).length;
  const requiredCount = applicableChecks.filter(c => c.required).length;
  const completedRequired = applicableChecks.filter(c => c.required && c.checked).length;

  return (
    <StepCard title="Security Review" description="Complete the security checklist for your risk tier" icon="shield-check">
      <div className="space-y-6">
        {/* Progress */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div>
            <div className="text-sm font-medium text-slate-700">Checklist Progress</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {completedRequired}/{requiredCount} required items completed
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${completedRequired === requiredCount ? 'text-emerald-600' : 'text-slate-700'}`}>
              {completedCount}/{applicableChecks.length}
            </div>
            <div className="text-[10px] text-slate-400">total completed</div>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          {applicableChecks.map(item => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border-2 transition-all ${
                item.checked
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleCheck(item.id)}
                  className="mt-1 w-4 h-4 text-emerald-600 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${item.checked ? 'text-emerald-800' : 'text-slate-800'}`}>
                      {item.label}
                    </span>
                    {item.required && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                        Required
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                </div>
                {item.checked && (
                  <Icon name="check-circle" className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                )}
              </label>
            </div>
          ))}
        </div>

        {applicableChecks.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <Icon name="check-circle" className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
            <p className="text-sm">No additional security checks required for Tier {request.riskTier}</p>
          </div>
        )}
      </div>
    </StepCard>
  );
}

function PolicyAssignmentStep({ request, onUpdate }: StepProps) {
  const applicablePolicies = POLICY_TEMPLATES.filter(
    policy => policy.applicableTiers.includes(request.riskTier)
  );

  const togglePolicy = (policyId: string) => {
    const current = request.assignedPolicies;
    const updated = current.includes(policyId)
      ? current.filter(id => id !== policyId)
      : [...current, policyId];
    onUpdate({ assignedPolicies: updated });
  };

  const categoryGroups = useMemo(() => {
    const groups: Record<string, PolicyTemplate[]> = {};
    applicablePolicies.forEach(policy => {
      if (!groups[policy.category]) groups[policy.category] = [];
      groups[policy.category].push(policy);
    });
    return groups;
  }, [applicablePolicies]);

  const categoryLabels: Record<string, string> = {
    access: 'Access Control',
    data: 'Data Protection',
    operational: 'Operational Safety',
    compliance: 'Compliance',
  };

  return (
    <StepCard title="Policy Assignment" description="Select security policies to apply to this agent" icon="document-check">
      <div className="space-y-6">
        {/* Summary */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-3">
            <Icon name="shield-check" className="w-8 h-8 text-blue-600" />
            <div>
              <div className="text-sm font-medium text-blue-800">
                {request.assignedPolicies.length} policies selected
              </div>
              <div className="text-xs text-blue-600">
                {applicablePolicies.length} policies applicable for Tier {request.riskTier}
              </div>
            </div>
          </div>
        </div>

        {/* Policy Groups */}
        {Object.entries(categoryGroups).map(([category, policies]) => (
          <div key={category}>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {categoryLabels[category] || category}
            </h4>
            <div className="space-y-2">
              {policies.map(policy => {
                const isSelected = request.assignedPolicies.includes(policy.id);
                return (
                  <button
                    key={policy.id}
                    onClick={() => togglePolicy(policy.id)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${isSelected ? 'text-blue-800' : 'text-slate-800'}`}>
                          {policy.name}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{policy.description}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {policy.controls.map((control, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                            >
                              {control}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-500' : 'border-2 border-slate-300'
                      }`}>
                        {isSelected && <Icon name="check" className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </StepCard>
  );
}

function ToolAccessStep({ request, onUpdate }: StepProps) {
  const toggleTool = (toolId: string) => {
    const updated = request.requestedTools.map(tool =>
      tool.id === toolId ? { ...tool, approved: !tool.approved } : tool
    );
    onUpdate({ requestedTools: updated });
  };

  const toggleDataSource = (dsId: string) => {
    const updated = request.requestedDataSources.map(ds =>
      ds.id === dsId ? { ...ds, approved: !ds.approved } : ds
    );
    onUpdate({ requestedDataSources: updated });
  };

  const selectedTools = request.requestedTools.filter(t => t.approved);
  const selectedDataSources = request.requestedDataSources.filter(ds => ds.approved);
  const highRiskTools = selectedTools.filter(t => t.riskLevel === 'high');
  const restrictedData = selectedDataSources.filter(ds => ds.sensitivity === 'restricted');

  const toolsByCategory = useMemo(() => {
    const groups: Record<string, typeof request.requestedTools> = {};
    request.requestedTools.forEach(tool => {
      if (!groups[tool.category]) groups[tool.category] = [];
      groups[tool.category].push(tool);
    });
    return groups;
  }, [request.requestedTools]);

  return (
    <StepCard title="Tool & Data Access" description="Request tools and data sources the agent needs" icon="wrench-screwdriver">
      <div className="space-y-6">
        {/* Warning Banner */}
        {(highRiskTools.length > 0 || restrictedData.length > 0) && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-3">
              <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-amber-800">High-risk access requested</div>
                <div className="text-xs text-amber-700 mt-1">
                  {highRiskTools.length > 0 && (
                    <span>{highRiskTools.length} high-risk tool(s): {highRiskTools.map(t => t.name).join(', ')}</span>
                  )}
                  {highRiskTools.length > 0 && restrictedData.length > 0 && <br />}
                  {restrictedData.length > 0 && (
                    <span>{restrictedData.length} restricted data source(s): {restrictedData.map(ds => ds.name).join(', ')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tools Section */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Icon name="wrench" className="w-4 h-4" />
            Tools ({selectedTools.length} selected)
          </h4>
          {Object.entries(toolsByCategory).map(([category, tools]) => (
            <div key={category} className="mb-4">
              <div className="text-xs font-medium text-slate-500 mb-2">{category}</div>
              <div className="grid grid-cols-2 gap-2">
                {tools.map(tool => {
                  const isSelected = tool.approved;
                  const riskColors = {
                    low: 'bg-emerald-100 text-emerald-700',
                    medium: 'bg-amber-100 text-amber-700',
                    high: 'bg-rose-100 text-rose-700',
                  };
                  return (
                    <button
                      key={tool.id}
                      onClick={() => toggleTool(tool.id)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>
                          {tool.name}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${riskColors[tool.riskLevel]}`}>
                          {tool.riskLevel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Data Sources Section */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Icon name="circle-stack" className="w-4 h-4" />
            Data Sources ({selectedDataSources.length} selected)
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {request.requestedDataSources.map(ds => {
              const isSelected = ds.approved;
              const sensitivityColors: Record<DataSensitivity, string> = {
                public: 'bg-emerald-100 text-emerald-700',
                internal: 'bg-blue-100 text-blue-700',
                confidential: 'bg-amber-100 text-amber-700',
                restricted: 'bg-rose-100 text-rose-700',
              };
              return (
                <button
                  key={ds.id}
                  onClick={() => toggleDataSource(ds.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>
                      {ds.name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${sensitivityColors[ds.sensitivity]}`}>
                      {ds.sensitivity}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </StepCard>
  );
}

function TestingStep({ request, onUpdate }: StepProps) {
  const applicableTests = request.testingRequirements.filter(
    req => req.requiredForTiers.includes(request.riskTier)
  );

  const updateTestStatus = (testId: string, status: TestingRequirement['status']) => {
    const updated = request.testingRequirements.map(test =>
      test.id === testId ? { ...test, status } : test
    );
    onUpdate({ testingRequirements: updated });
  };

  const passedCount = applicableTests.filter(t => t.status === 'passed').length;
  const allPassed = passedCount === applicableTests.length && applicableTests.length > 0;

  return (
    <StepCard title="Testing & Validation" description="Complete sandbox testing before approval" icon="beaker">
      <div className="space-y-6">
        {/* Progress */}
        <div className={`p-4 rounded-xl border ${allPassed ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${allPassed ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                <Icon name={allPassed ? 'check-circle' : 'beaker'} className={`w-6 h-6 ${allPassed ? 'text-emerald-600' : 'text-slate-600'}`} />
              </div>
              <div>
                <div className={`text-sm font-medium ${allPassed ? 'text-emerald-800' : 'text-slate-700'}`}>
                  {allPassed ? 'All tests passed!' : 'Testing in progress'}
                </div>
                <div className="text-xs text-slate-500">
                  {passedCount}/{applicableTests.length} tests passed
                </div>
              </div>
            </div>
            {allPassed && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500 text-white">
                Ready for Approval
              </span>
            )}
          </div>
        </div>

        {/* Test Requirements */}
        <div className="space-y-3">
          {applicableTests.map(test => {
            const statusConfig = {
              pending: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Pending' },
              'in-progress': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
              passed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Passed' },
              failed: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Failed' },
            };
            const config = statusConfig[test.status];

            return (
              <div
                key={test.id}
                className={`p-4 rounded-xl border ${
                  test.status === 'passed' ? 'border-emerald-200 bg-emerald-50/50' :
                  test.status === 'failed' ? 'border-rose-200 bg-rose-50/50' :
                  'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{test.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${config.bg} ${config.text}`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{test.description}</div>
                  </div>
                  <div className="flex gap-1 ml-4">
                    {(['pending', 'in-progress', 'passed', 'failed'] as const).map(status => (
                      <button
                        key={status}
                        onClick={() => updateTestStatus(test.id, status)}
                        className={`p-1.5 rounded transition-colors ${
                          test.status === status
                            ? status === 'passed' ? 'bg-emerald-500 text-white' :
                              status === 'failed' ? 'bg-rose-500 text-white' :
                              status === 'in-progress' ? 'bg-blue-500 text-white' :
                              'bg-slate-500 text-white'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                        title={statusConfig[status].label}
                      >
                        <Icon
                          name={
                            status === 'passed' ? 'check' :
                            status === 'failed' ? 'x-mark' :
                            status === 'in-progress' ? 'arrow-path' :
                            'clock'
                          }
                          className="w-3 h-3"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sandbox Validation Toggle */}
        <div className="p-4 rounded-xl border border-slate-200">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={request.sandboxValidated}
              onChange={(e) => onUpdate({ sandboxValidated: e.target.checked })}
              className="w-5 h-5 text-emerald-600 rounded"
            />
            <div>
              <div className="text-sm font-medium text-slate-800">Sandbox Environment Validated</div>
              <div className="text-xs text-slate-500">Confirm the agent has been tested in a sandbox environment</div>
            </div>
          </label>
        </div>
      </div>
    </StepCard>
  );
}

function ApprovalStep({ request, onUpdate }: StepProps) {
  const requiredApprovers = getRequiredApprovalsForTier(request.riskTier);
  const isAutoApprove = requiredApprovers.includes('auto');

  // Mock approval simulation
  const simulateApproval = (role: ApprovalRecord['approverRole'], approved: boolean) => {
    const newApproval: ApprovalRecord = {
      id: `APR-${Date.now()}`,
      approverRole: role,
      approverName: role === 'auto' ? 'System' :
        role === 'team-lead' ? 'Mike Johnson (Team Lead)' :
        role === 'security' ? 'Security Review Board' :
        'Compliance Team',
      status: approved ? (role === 'auto' ? 'auto-approved' : 'approved') : 'rejected',
      timestamp: new Date().toISOString(),
      comments: approved ? undefined : 'Additional documentation required',
    };
    onUpdate({ approvals: [...request.approvals, newApproval] });
  };

  const allApproved = requiredApprovers.every(role => {
    const approval = request.approvals.find(a => a.approverRole === role);
    return approval && (approval.status === 'approved' || approval.status === 'auto-approved');
  });

  const anyRejected = request.approvals.some(a => a.status === 'rejected');

  return (
    <StepCard title="Approval Workflow" description="Risk-based approval routing" icon="check-badge">
      <div className="space-y-6">
        {/* Approval Path Info */}
        <div className={`p-4 rounded-xl ${RISK_TIER_CONFIG[request.riskTier].bgColor} border`}>
          <div className="flex items-center gap-3">
            <Icon name="information-circle" className="w-5 h-5 flex-shrink-0" />
            <div>
              <div className={`text-sm font-medium ${RISK_TIER_CONFIG[request.riskTier].color}`}>
                {RISK_TIER_CONFIG[request.riskTier].label}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {RISK_TIER_CONFIG[request.riskTier].approvalPath}
              </div>
            </div>
          </div>
        </div>

        {/* Approval Status */}
        {allApproved && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-3">
              <Icon name="check-circle" className="w-8 h-8 text-emerald-500" />
              <div>
                <div className="text-sm font-semibold text-emerald-800">All Approvals Complete</div>
                <div className="text-xs text-emerald-600">Agent is approved for deployment</div>
              </div>
            </div>
          </div>
        )}

        {anyRejected && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
            <div className="flex items-center gap-3">
              <Icon name="x-circle" className="w-8 h-8 text-rose-500" />
              <div>
                <div className="text-sm font-semibold text-rose-800">Approval Rejected</div>
                <div className="text-xs text-rose-600">
                  {request.approvals.find(a => a.status === 'rejected')?.comments || 'Review required'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Approval Slots */}
        <div className="space-y-3">
          {requiredApprovers.map(role => {
            const approval = request.approvals.find(a => a.approverRole === role);
            const roleLabels: Record<string, string> = {
              auto: 'Automatic Approval',
              'team-lead': 'Team Lead Approval',
              security: 'Security Team Approval',
              compliance: 'Compliance Team Approval',
            };

            return (
              <div
                key={role}
                className={`p-4 rounded-xl border ${
                  approval?.status === 'approved' || approval?.status === 'auto-approved'
                    ? 'border-emerald-200 bg-emerald-50'
                    : approval?.status === 'rejected'
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      approval?.status === 'approved' || approval?.status === 'auto-approved'
                        ? 'bg-emerald-500'
                        : approval?.status === 'rejected'
                        ? 'bg-rose-500'
                        : 'bg-slate-200'
                    }`}>
                      <Icon
                        name={
                          approval?.status === 'approved' || approval?.status === 'auto-approved'
                            ? 'check'
                            : approval?.status === 'rejected'
                            ? 'x-mark'
                            : 'clock'
                        }
                        className={`w-5 h-5 ${approval ? 'text-white' : 'text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{roleLabels[role]}</div>
                      {approval ? (
                        <div className="text-xs text-slate-500">
                          {approval.approverName} - {new Date(approval.timestamp).toLocaleString()}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">Pending</div>
                      )}
                    </div>
                  </div>

                  {!approval && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => simulateApproval(role, true)}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors"
                      >
                        Approve
                      </button>
                      {role !== 'auto' && (
                        <button
                          onClick={() => simulateApproval(role, false)}
                          className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-100 rounded-lg hover:bg-rose-200 transition-colors"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {approval?.comments && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <div className="text-xs text-slate-600">{approval.comments}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Auto-approve hint */}
        {isAutoApprove && request.approvals.length === 0 && (
          <div className="text-center">
            <button
              onClick={() => simulateApproval('auto', true)}
              className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Trigger Auto-Approval
            </button>
            <p className="text-xs text-slate-500 mt-2">
              Tier 1-2 agents are auto-approved once all checklist items are complete
            </p>
          </div>
        )}
      </div>
    </StepCard>
  );
}

function DeploymentStep({ request, onUpdate }: StepProps) {
  const allApproved = getRequiredApprovalsForTier(request.riskTier).every(role => {
    const approval = request.approvals.find(a => a.approverRole === role);
    return approval && (approval.status === 'approved' || approval.status === 'auto-approved');
  });

  return (
    <StepCard title="Deployment" description="Final activation of the agent" icon="rocket-launch">
      <div className="space-y-6">
        {!allApproved ? (
          <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 text-center">
            <Icon name="exclamation-triangle" className="w-12 h-12 mx-auto mb-3 text-amber-400" />
            <div className="text-sm font-medium text-amber-800">Approval Required</div>
            <div className="text-xs text-amber-600 mt-1">
              Complete the approval step before deploying the agent
            </div>
          </div>
        ) : (
          <>
            {/* Deployment Ready Banner */}
            <div className="p-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-center">
              <Icon name="rocket-launch" className="w-12 h-12 mx-auto mb-3 opacity-90" />
              <div className="text-lg font-semibold">Ready for Deployment</div>
              <div className="text-sm opacity-90 mt-1">
                All approvals complete. The agent can now be activated.
              </div>
            </div>

            {/* Deployment Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Deployment Notes (Optional)
              </label>
              <textarea
                value={request.deploymentNotes || ''}
                onChange={(e) => onUpdate({ deploymentNotes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Any notes for the deployment team..."
              />
            </div>

            {/* Pre-Deployment Checklist */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-sm font-medium text-slate-700 mb-3">Pre-Deployment Checklist</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <Icon name="check-circle" className="w-4 h-4" />
                  <span>All security checks passed</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <Icon name="check-circle" className="w-4 h-4" />
                  <span>Policies assigned and configured</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <Icon name="check-circle" className="w-4 h-4" />
                  <span>Tool and data access approved</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <Icon name="check-circle" className="w-4 h-4" />
                  <span>Testing completed in sandbox</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <Icon name="check-circle" className="w-4 h-4" />
                  <span>All required approvals obtained</span>
                </div>
              </div>
            </div>

            {/* Deploy Button */}
            <div className="text-center">
              <button
                onClick={() => onUpdate({
                  status: 'deployed',
                  deploymentDate: new Date().toISOString(),
                })}
                className="px-8 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl"
              >
                Deploy Agent to Production
              </button>
              <p className="text-xs text-slate-500 mt-2">
                This action will activate the agent in the production environment
              </p>
            </div>
          </>
        )}
      </div>
    </StepCard>
  );
}

// ─────────────────────────── Queue Dashboard ───────────────────────────

interface QueueDashboardProps {
  queue: OnboardingRequest[];
  onSelectRequest: (request: OnboardingRequest) => void;
  onNewRequest: () => void;
}

function QueueDashboard({ queue, onSelectRequest, onNewRequest }: QueueDashboardProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'my-approvals' | 'completed' | 'blocked'>('all');

  const filteredQueue = useMemo(() => {
    switch (filter) {
      case 'pending':
        return queue.filter(r => ['draft', 'registration', 'classification', 'security-review', 'policy-assignment', 'tool-access', 'testing'].includes(r.status));
      case 'my-approvals':
        return queue.filter(r => r.status === 'pending-approval');
      case 'completed':
        return queue.filter(r => r.status === 'approved' || r.status === 'deployed');
      case 'blocked':
        return queue.filter(r => r.status === 'rejected');
      default:
        return queue;
    }
  }, [queue, filter]);

  const stats = useMemo(() => ({
    pending: queue.filter(r => !['approved', 'deployed', 'rejected'].includes(r.status)).length,
    myApprovals: queue.filter(r => r.status === 'pending-approval').length,
    completed: queue.filter(r => r.status === 'approved' || r.status === 'deployed').length,
    blocked: queue.filter(r => r.status === 'rejected').length,
  }), [queue]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Agent Onboarding Queue</h1>
          <p className="text-sm text-slate-500">Onboard agents the governed way — intake, risk triage, owner verification, and approval tracking before an agent goes live.</p>
        </div>
        <button
          onClick={onNewRequest}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Icon name="plus" className="w-4 h-4" />
          New Onboarding
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => setFilter('pending')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'pending' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
          <div className="text-xs text-slate-500">In Progress</div>
        </button>
        <button
          onClick={() => setFilter('my-approvals')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'my-approvals' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-amber-600">{stats.myApprovals}</div>
          <div className="text-xs text-slate-500">Awaiting Approval</div>
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'completed' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
          <div className="text-xs text-slate-500">Completed</div>
        </button>
        <button
          onClick={() => setFilter('blocked')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filter === 'blocked' ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-rose-600">{stats.blocked}</div>
          <div className="text-xs text-slate-500">Blocked/Rejected</div>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(['all', 'pending', 'my-approvals', 'completed', 'blocked'] as const).map(f => {
          const labels = {
            all: 'All Requests',
            pending: 'In Progress',
            'my-approvals': 'My Approvals',
            completed: 'Completed',
            blocked: 'Blocked',
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === f
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Request List */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th className="py-3 px-4 text-left font-medium">Agent</th>
              <th className="py-3 px-3 text-left font-medium">Owner</th>
              <th className="py-3 px-3 text-center font-medium">Risk Tier</th>
              <th className="py-3 px-3 text-center font-medium">Status</th>
              <th className="py-3 px-3 text-center font-medium">Step</th>
              <th className="py-3 px-4 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredQueue.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No requests found
                </td>
              </tr>
            ) : (
              filteredQueue.map(request => {
                const statusStyle = getStatusColor(request.status);
                const tierConfig = RISK_TIER_CONFIG[request.riskTier];

                return (
                  <tr
                    key={request.id}
                    onClick={() => onSelectRequest(request)}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{request.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{request.id}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{request.owner}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${tierConfig.bgColor} ${tierConfig.color}`}>
                        Tier {request.riskTier}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                        {request.status.replace(/-/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-slate-500">
                      {request.currentStep + 1}/{STEPS.length}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(request.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

interface AgentOnboardingWorkflowProps {
  embedded?: boolean;
}

export default function AgentOnboardingWorkflow({ embedded = false }: AgentOnboardingWorkflowProps) {
  const [view, setView] = useState<'queue' | 'wizard'>('queue');
  const [currentRequest, setCurrentRequest] = useState<OnboardingRequest | null>(null);
  const [drafts, setDrafts] = useState<OnboardingRequest[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Load drafts on mount
  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  // Combine mock queue with saved drafts
  const fullQueue = useMemo(() => {
    return [...MOCK_ONBOARDING_QUEUE, ...drafts].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [drafts]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Compute completed steps
  const completedSteps = useMemo(() => {
    if (!currentRequest) return new Set<number>();
    const completed = new Set<number>();

    // Step 0: Registration - check required fields
    if (currentRequest.name && currentRequest.owner && currentRequest.description && currentRequest.team && currentRequest.purpose) {
      completed.add(0);
    }

    // Step 1: Classification - always considered complete once tier is set (default is 1)
    completed.add(1);

    // Step 2: Security Review - check if all required items are checked
    const applicableChecks = currentRequest.securityChecklist.filter(
      item => item.requiredForTiers.includes(currentRequest.riskTier)
    );
    const requiredChecks = applicableChecks.filter(item => item.required);
    if (requiredChecks.length === 0 || requiredChecks.every(item => item.checked)) {
      completed.add(2);
    }

    // Step 3: Policy Assignment - at least one policy selected
    if (currentRequest.assignedPolicies.length > 0) {
      completed.add(3);
    }

    // Step 4: Tool & Data Access - considered complete (optional selections)
    completed.add(4);

    // Step 5: Testing - all applicable tests passed and sandbox validated
    const applicableTests = currentRequest.testingRequirements.filter(
      req => req.requiredForTiers.includes(currentRequest.riskTier)
    );
    if (applicableTests.every(t => t.status === 'passed') && currentRequest.sandboxValidated) {
      completed.add(5);
    }

    // Step 6: Approval - all required approvals obtained
    const requiredApprovers = getRequiredApprovalsForTier(currentRequest.riskTier);
    if (requiredApprovers.every(role => {
      const approval = currentRequest.approvals.find(a => a.approverRole === role);
      return approval && (approval.status === 'approved' || approval.status === 'auto-approved');
    })) {
      completed.add(6);
    }

    // Step 7: Deployment - deployed status
    if (currentRequest.status === 'deployed') {
      completed.add(7);
    }

    return completed;
  }, [currentRequest]);

  const handleNewRequest = useCallback(() => {
    const newRequest = createDefaultRequest('current-user@example.com');
    setCurrentRequest(newRequest);
    setView('wizard');
  }, []);

  const handleSelectRequest = useCallback((request: OnboardingRequest) => {
    setCurrentRequest(request);
    setView('wizard');
  }, []);

  const handleUpdateRequest = useCallback((updates: Partial<OnboardingRequest>) => {
    if (!currentRequest) return;

    const updated = {
      ...currentRequest,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    setCurrentRequest(updated);

    // Auto-save drafts
    if (!MOCK_ONBOARDING_QUEUE.find(r => r.id === updated.id)) {
      const newDrafts = drafts.filter(d => d.id !== updated.id);
      newDrafts.push(updated);
      setDrafts(newDrafts);
      saveDrafts(newDrafts);
    }
  }, [currentRequest, drafts]);

  const handleStepChange = useCallback((stepIndex: number) => {
    if (!currentRequest) return;
    handleUpdateRequest({ currentStep: stepIndex });
  }, [currentRequest, handleUpdateRequest]);

  const handleSaveDraft = useCallback(() => {
    if (!currentRequest) return;
    handleUpdateRequest({ status: 'draft' });
    showToast('Draft saved successfully', 'success');
  }, [currentRequest, handleUpdateRequest, showToast]);

  const handleNext = useCallback(() => {
    if (!currentRequest) return;
    const nextStep = Math.min(currentRequest.currentStep + 1, STEPS.length - 1);
    handleUpdateRequest({
      currentStep: nextStep,
      status: STEPS[nextStep].id as OnboardingStatus,
    });
  }, [currentRequest, handleUpdateRequest]);

  const handlePrevious = useCallback(() => {
    if (!currentRequest) return;
    const prevStep = Math.max(currentRequest.currentStep - 1, 0);
    handleUpdateRequest({ currentStep: prevStep });
  }, [currentRequest, handleUpdateRequest]);

  const handleBackToQueue = useCallback(() => {
    setView('queue');
    setCurrentRequest(null);
  }, []);

  // Render step content
  const renderStep = () => {
    if (!currentRequest) return null;

    const stepProps = { request: currentRequest, onUpdate: handleUpdateRequest };

    switch (currentRequest.currentStep) {
      case 0:
        return <RegistrationStep {...stepProps} />;
      case 1:
        return <ClassificationStep {...stepProps} />;
      case 2:
        return <SecurityReviewStep {...stepProps} />;
      case 3:
        return <PolicyAssignmentStep {...stepProps} />;
      case 4:
        return <ToolAccessStep {...stepProps} />;
      case 5:
        return <TestingStep {...stepProps} />;
      case 6:
        return <ApprovalStep {...stepProps} />;
      case 7:
        return <DeploymentStep {...stepProps} />;
      default:
        return null;
    }
  };

  // Check if current step is valid to proceed
  const canProceed = useMemo(() => {
    if (!currentRequest) return false;
    return completedSteps.has(currentRequest.currentStep);
  }, [currentRequest, completedSteps]);

  // ─────────────────────────── Render ───────────────────────────

  return (
    <div className={embedded ? '' : 'p-6'}>
      {view === 'queue' ? (
        <QueueDashboard
          queue={fullQueue}
          onSelectRequest={handleSelectRequest}
          onNewRequest={handleNewRequest}
        />
      ) : currentRequest ? (
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={handleBackToQueue}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <Icon name="arrow-left" className="w-4 h-4" />
              Back to Queue
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">{currentRequest.id}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${getStatusColor(currentRequest.status).bg} ${getStatusColor(currentRequest.status).text}`}>
                {currentRequest.status.replace(/-/g, ' ')}
              </span>
            </div>
          </div>

          {/* Progress Stepper */}
          <ProgressStepper
            currentStep={currentRequest.currentStep}
            steps={STEPS}
            completedSteps={completedSteps}
            onStepClick={handleStepChange}
          />

          {/* Step Content */}
          {renderStep()}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentRequest.currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Icon name="arrow-left" className="w-4 h-4" />
                  Previous
                </button>
              )}
              <button
                onClick={handleSaveDraft}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-2"
              >
                <Icon name="document" className="w-4 h-4" />
                Save Draft
              </button>
            </div>

            {currentRequest.currentStep < STEPS.length - 1 && (
              <button
                onClick={handleNext}
                disabled={!canProceed}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  canProceed
                    ? 'text-white bg-blue-600 hover:bg-blue-700'
                    : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                }`}
              >
                Continue
                <Icon name="arrow-right" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' :
          toast.type === 'error' ? 'bg-rose-500 text-white' :
          'bg-slate-800 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
