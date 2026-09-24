/**
 * SecurityPolicyTemplates - Pre-built security policy templates for AI agents
 *
 * Provides reusable, FSI-focused security policy templates that define:
 * - Guardrail configurations (content filters, PII handling, denied topics)
 * - Logging requirements
 * - Human-in-the-loop (HITL) requirements
 * - Data access restrictions
 * - Allowed tool categories
 *
 * Similar to Microsoft Agent365's policy template functionality.
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from './icons';
import { MockDataBadge } from './DataSourceIndicator';
import Drawer from './Drawer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

interface ContentFilter {
  category: string;
  inputStrength: 'none' | 'low' | 'medium' | 'high';
  outputStrength: 'none' | 'low' | 'medium' | 'high';
}

interface GuardrailConfig {
  contentFilters: ContentFilter[];
  piiHandling: 'block' | 'anonymize' | 'allow';
  piiTypes: string[];
  deniedTopics: string[];
  wordFilters: string[];
  groundingEnabled: boolean;
}

interface LoggingConfig {
  inputLogging: boolean;
  outputLogging: boolean;
  toolCallLogging: boolean;
  retentionDays: number;
  sensitiveDataMasking: boolean;
}

interface HITLConfig {
  required: boolean;
  approvalThreshold: RiskLevel;
  criticalActions: string[];
  reviewFrequency: 'real-time' | 'daily' | 'weekly' | 'per-decision';
}

interface DataAccessConfig {
  allowedClassifications: string[];
  blockedDataSources: string[];
  piiAccess: boolean;
  pciAccess: boolean;
  requireEncryption: boolean;
}

interface ToolConfig {
  allowedCategories: string[];
  blockedTools: string[];
  requireApproval: string[];
  maxBlastRadius: 'critical' | 'high' | 'medium' | 'low';
}

interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'fsi-strict' | 'production' | 'development' | 'customer-facing' | 'internal' | 'custom';
  riskLevel: RiskLevel;
  icon: IconName;
  guardrails: GuardrailConfig;
  logging: LoggingConfig;
  hitl: HITLConfig;
  dataAccess: DataAccessConfig;
  tools: ToolConfig;
  agentsUsing: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isBuiltIn: boolean;
}

interface Agent {
  id: string;
  name: string;
  currentPolicy?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'tmpl-001',
    name: 'FSI Strict',
    description: 'Maximum guardrails for regulated financial services. All PII blocked, HITL required for all actions, comprehensive audit logging.',
    category: 'fsi-strict',
    riskLevel: 'critical',
    icon: 'shield-check',
    guardrails: {
      contentFilters: [
        { category: 'Hate', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Violence', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Sexual', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Insults', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Misconduct', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Prompt Attack', inputStrength: 'high', outputStrength: 'high' },
      ],
      piiHandling: 'block',
      piiTypes: ['SSN', 'Credit Card', 'Bank Account', 'Driver License', 'Passport', 'Email', 'Phone', 'Address', 'Date of Birth', 'IP Address'],
      deniedTopics: ['Investment advice without disclaimer', 'Loan approval without human review', 'Account closure', 'Regulatory circumvention', 'Competitor products'],
      wordFilters: ['guaranteed returns', 'risk-free', 'insider information'],
      groundingEnabled: true,
    },
    logging: {
      inputLogging: true,
      outputLogging: true,
      toolCallLogging: true,
      retentionDays: 2555, // 7 years for FSI compliance
      sensitiveDataMasking: true,
    },
    hitl: {
      required: true,
      approvalThreshold: 'low',
      criticalActions: ['All financial transactions', 'Customer data access', 'Account modifications', 'Regulatory filings'],
      reviewFrequency: 'real-time',
    },
    dataAccess: {
      allowedClassifications: ['public', 'internal'],
      blockedDataSources: ['production-customer-db', 'payment-systems'],
      piiAccess: false,
      pciAccess: false,
      requireEncryption: true,
    },
    tools: {
      allowedCategories: ['read-only', 'notification', 'search'],
      blockedTools: ['payment_processor', 'account_modifier', 'data_exporter'],
      requireApproval: ['database_query', 'external_api'],
      maxBlastRadius: 'low',
    },
    agentsUsing: ['Customer Service Agent', 'Compliance Assistant', 'Risk Analyzer'],
    createdAt: '2025-01-15',
    updatedAt: '2026-06-01',
    createdBy: 'System',
    isBuiltIn: true,
  },
  {
    id: 'tmpl-002',
    name: 'Production Standard',
    description: 'Balanced guardrails for production workloads. Logging required, moderate content filtering, HITL for high-risk actions.',
    category: 'production',
    riskLevel: 'high',
    icon: 'rocket-launch',
    guardrails: {
      contentFilters: [
        { category: 'Hate', inputStrength: 'medium', outputStrength: 'high' },
        { category: 'Violence', inputStrength: 'medium', outputStrength: 'high' },
        { category: 'Sexual', inputStrength: 'medium', outputStrength: 'high' },
        { category: 'Insults', inputStrength: 'medium', outputStrength: 'medium' },
        { category: 'Misconduct', inputStrength: 'medium', outputStrength: 'medium' },
        { category: 'Prompt Attack', inputStrength: 'high', outputStrength: 'high' },
      ],
      piiHandling: 'anonymize',
      piiTypes: ['SSN', 'Credit Card', 'Bank Account', 'Driver License', 'Passport'],
      deniedTopics: ['Medical advice', 'Legal advice', 'Investment recommendations'],
      wordFilters: [],
      groundingEnabled: true,
    },
    logging: {
      inputLogging: true,
      outputLogging: true,
      toolCallLogging: true,
      retentionDays: 365,
      sensitiveDataMasking: true,
    },
    hitl: {
      required: true,
      approvalThreshold: 'high',
      criticalActions: ['Financial transactions over $10k', 'Customer data exports', 'System configuration changes'],
      reviewFrequency: 'per-decision',
    },
    dataAccess: {
      allowedClassifications: ['public', 'internal', 'confidential'],
      blockedDataSources: ['payment-systems'],
      piiAccess: true,
      pciAccess: false,
      requireEncryption: true,
    },
    tools: {
      allowedCategories: ['read-only', 'notification', 'search', 'write-limited'],
      blockedTools: ['payment_processor', 'bulk_data_exporter'],
      requireApproval: ['account_modifier', 'external_api'],
      maxBlastRadius: 'medium',
    },
    agentsUsing: ['Order Processing Agent', 'Support Escalation Agent', 'Inventory Manager'],
    createdAt: '2025-02-01',
    updatedAt: '2026-05-15',
    createdBy: 'System',
    isBuiltIn: true,
  },
  {
    id: 'tmpl-003',
    name: 'Development Sandbox',
    description: 'Relaxed controls for development and testing. No customer data allowed, basic logging for debugging.',
    category: 'development',
    riskLevel: 'low',
    icon: 'code-bracket',
    guardrails: {
      contentFilters: [
        { category: 'Hate', inputStrength: 'low', outputStrength: 'low' },
        { category: 'Violence', inputStrength: 'low', outputStrength: 'low' },
        { category: 'Sexual', inputStrength: 'low', outputStrength: 'low' },
        { category: 'Insults', inputStrength: 'none', outputStrength: 'none' },
        { category: 'Misconduct', inputStrength: 'none', outputStrength: 'none' },
        { category: 'Prompt Attack', inputStrength: 'medium', outputStrength: 'medium' },
      ],
      piiHandling: 'block',
      piiTypes: ['SSN', 'Credit Card', 'Bank Account'],
      deniedTopics: [],
      wordFilters: [],
      groundingEnabled: false,
    },
    logging: {
      inputLogging: true,
      outputLogging: true,
      toolCallLogging: true,
      retentionDays: 30,
      sensitiveDataMasking: false,
    },
    hitl: {
      required: false,
      approvalThreshold: 'critical',
      criticalActions: [],
      reviewFrequency: 'weekly',
    },
    dataAccess: {
      allowedClassifications: ['public', 'internal', 'test-data'],
      blockedDataSources: ['production-customer-db', 'payment-systems', 'production-analytics'],
      piiAccess: false,
      pciAccess: false,
      requireEncryption: false,
    },
    tools: {
      allowedCategories: ['read-only', 'notification', 'search', 'write-limited', 'debug'],
      blockedTools: ['payment_processor'],
      requireApproval: [],
      maxBlastRadius: 'high',
    },
    agentsUsing: ['Dev Test Agent', 'QA Automation Agent'],
    createdAt: '2025-03-01',
    updatedAt: '2026-04-20',
    createdBy: 'System',
    isBuiltIn: true,
  },
  {
    id: 'tmpl-004',
    name: 'Customer-Facing',
    description: 'Content safety enforced for customer interactions. Response validation required, brand-safe outputs.',
    category: 'customer-facing',
    riskLevel: 'high',
    icon: 'users',
    guardrails: {
      contentFilters: [
        { category: 'Hate', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Violence', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Sexual', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Insults', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Misconduct', inputStrength: 'high', outputStrength: 'high' },
        { category: 'Prompt Attack', inputStrength: 'high', outputStrength: 'high' },
      ],
      piiHandling: 'anonymize',
      piiTypes: ['SSN', 'Credit Card', 'Bank Account', 'Driver License', 'Email', 'Phone'],
      deniedTopics: ['Competitor mentions', 'Pricing negotiations', 'Legal commitments', 'Off-brand humor'],
      wordFilters: ['competitor names', 'inappropriate slang'],
      groundingEnabled: true,
    },
    logging: {
      inputLogging: true,
      outputLogging: true,
      toolCallLogging: true,
      retentionDays: 365,
      sensitiveDataMasking: true,
    },
    hitl: {
      required: true,
      approvalThreshold: 'medium',
      criticalActions: ['Refund processing', 'Account changes', 'Complaint escalation'],
      reviewFrequency: 'daily',
    },
    dataAccess: {
      allowedClassifications: ['public', 'customer-facing'],
      blockedDataSources: ['internal-analytics', 'employee-data'],
      piiAccess: true,
      pciAccess: false,
      requireEncryption: true,
    },
    tools: {
      allowedCategories: ['read-only', 'notification', 'search', 'customer-service'],
      blockedTools: ['data_exporter', 'admin_functions'],
      requireApproval: ['refund_processor', 'account_modifier'],
      maxBlastRadius: 'medium',
    },
    agentsUsing: ['Chat Support Agent', 'Email Response Agent', 'FAQ Assistant'],
    createdAt: '2025-02-15',
    updatedAt: '2026-06-10',
    createdBy: 'System',
    isBuiltIn: true,
  },
  {
    id: 'tmpl-005',
    name: 'Internal Tools',
    description: 'Basic controls for internal employee-facing tools. Standard logging, internal data access allowed.',
    category: 'internal',
    riskLevel: 'medium',
    icon: 'building-office',
    guardrails: {
      contentFilters: [
        { category: 'Hate', inputStrength: 'medium', outputStrength: 'medium' },
        { category: 'Violence', inputStrength: 'medium', outputStrength: 'medium' },
        { category: 'Sexual', inputStrength: 'medium', outputStrength: 'medium' },
        { category: 'Insults', inputStrength: 'low', outputStrength: 'low' },
        { category: 'Misconduct', inputStrength: 'medium', outputStrength: 'medium' },
        { category: 'Prompt Attack', inputStrength: 'high', outputStrength: 'high' },
      ],
      piiHandling: 'allow',
      piiTypes: [],
      deniedTopics: ['HR confidential matters', 'Executive compensation'],
      wordFilters: [],
      groundingEnabled: false,
    },
    logging: {
      inputLogging: true,
      outputLogging: true,
      toolCallLogging: true,
      retentionDays: 90,
      sensitiveDataMasking: false,
    },
    hitl: {
      required: false,
      approvalThreshold: 'high',
      criticalActions: ['Bulk operations', 'System administration'],
      reviewFrequency: 'weekly',
    },
    dataAccess: {
      allowedClassifications: ['public', 'internal', 'confidential'],
      blockedDataSources: ['executive-compensation', 'hr-disciplinary'],
      piiAccess: true,
      pciAccess: false,
      requireEncryption: false,
    },
    tools: {
      allowedCategories: ['read-only', 'notification', 'search', 'write-limited', 'internal-admin'],
      blockedTools: ['customer_data_export', 'payment_processor'],
      requireApproval: ['bulk_operations'],
      maxBlastRadius: 'high',
    },
    agentsUsing: ['HR Assistant', 'IT Helpdesk Agent', 'Knowledge Base Agent', 'Meeting Scheduler'],
    createdAt: '2025-04-01',
    updatedAt: '2026-05-01',
    createdBy: 'System',
    isBuiltIn: true,
  },
];

const MOCK_AGENTS: Agent[] = [
  { id: 'agent-001', name: 'Customer Service Agent', currentPolicy: 'tmpl-001' },
  { id: 'agent-002', name: 'Compliance Assistant', currentPolicy: 'tmpl-001' },
  { id: 'agent-003', name: 'Risk Analyzer', currentPolicy: 'tmpl-001' },
  { id: 'agent-004', name: 'Order Processing Agent', currentPolicy: 'tmpl-002' },
  { id: 'agent-005', name: 'Support Escalation Agent', currentPolicy: 'tmpl-002' },
  { id: 'agent-006', name: 'Inventory Manager', currentPolicy: 'tmpl-002' },
  { id: 'agent-007', name: 'Dev Test Agent', currentPolicy: 'tmpl-003' },
  { id: 'agent-008', name: 'QA Automation Agent', currentPolicy: 'tmpl-003' },
  { id: 'agent-009', name: 'Chat Support Agent', currentPolicy: 'tmpl-004' },
  { id: 'agent-010', name: 'Email Response Agent', currentPolicy: 'tmpl-004' },
  { id: 'agent-011', name: 'FAQ Assistant', currentPolicy: 'tmpl-004' },
  { id: 'agent-012', name: 'HR Assistant', currentPolicy: 'tmpl-005' },
  { id: 'agent-013', name: 'IT Helpdesk Agent', currentPolicy: 'tmpl-005' },
  { id: 'agent-014', name: 'Knowledge Base Agent', currentPolicy: 'tmpl-005' },
  { id: 'agent-015', name: 'Meeting Scheduler', currentPolicy: 'tmpl-005' },
  { id: 'agent-016', name: 'New Agent (Unassigned)' },
  { id: 'agent-017', name: 'Prototype Agent (Unassigned)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Critical' },
  high: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'High' },
  medium: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Medium' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Low' },
};

const CATEGORY_STYLES: Record<PolicyTemplate['category'], { bg: string; text: string; label: string }> = {
  'fsi-strict': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'FSI Strict' },
  production: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Production' },
  development: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Development' },
  'customer-facing': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Customer-Facing' },
  internal: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Internal' },
  custom: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Custom' },
};

const STRENGTH_COLORS: Record<string, string> = {
  none: 'bg-slate-100 text-slate-500',
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SecurityPolicyTemplates() {
  const [templates] = useState<PolicyTemplate[]>(MOCK_TEMPLATES);
  const [agents] = useState<Agent[]>(MOCK_AGENTS);
  const [selectedTemplate, setSelectedTemplate] = useState<PolicyTemplate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<PolicyTemplate['category'] | 'all'>('all');
  const [applyDrawerOpen, setApplyDrawerOpen] = useState(false);
  const [customizeDrawerOpen, setCustomizeDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    if (filterCategory === 'all') return templates;
    return templates.filter(t => t.category === filterCategory);
  }, [templates, filterCategory]);

  const stats = useMemo(() => ({
    total: templates.length,
    builtIn: templates.filter(t => t.isBuiltIn).length,
    custom: templates.filter(t => !t.isBuiltIn).length,
    agentsCovered: agents.filter(a => a.currentPolicy).length,
    agentsUnassigned: agents.filter(a => !a.currentPolicy).length,
  }), [templates, agents]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleApplyToAgent = (template: PolicyTemplate, agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    showToast(`Applied "${template.name}" policy to ${agent?.name || 'agent'}`);
    setApplyDrawerOpen(false);
  };

  const handleCustomize = (template: PolicyTemplate) => {
    showToast(`Creating variant of "${template.name}" - Opening editor...`);
    setCustomizeDrawerOpen(false);
    setDrawerOpen(false);
  };

  const handleCreateCustom = () => {
    showToast('Opening custom policy template editor...');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Security Policy Templates</h1>
            <MockDataBadge integration="Policy template backend" />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Pre-built security policy templates for AI agents — enforce guardrails, logging, and access controls in one click.
          </p>
        </div>
        <button
          onClick={handleCreateCustom}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Icon name="plus" className="w-4 h-4" />
          Create Custom
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{stats.total}</div>
          <div className="text-xs text-slate-500">Total Templates</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-purple-600 tabular-nums">{stats.builtIn}</div>
          <div className="text-xs text-slate-500">Built-in</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-indigo-600 tabular-nums">{stats.custom}</div>
          <div className="text-xs text-slate-500">Custom</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">{stats.agentsCovered}</div>
          <div className="text-xs text-slate-500">Agents Covered</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-amber-600 tabular-nums">{stats.agentsUnassigned}</div>
          <div className="text-xs text-slate-500">Unassigned</div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            filterCategory === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Templates
        </button>
        {Object.entries(CATEGORY_STYLES).map(([key, style]) => (
          <button
            key={key}
            onClick={() => setFilterCategory(key as PolicyTemplate['category'])}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filterCategory === key
                ? `${style.bg} ${style.text}`
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {style.label}
          </button>
        ))}
      </div>

      {/* Template Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map(template => {
          const risk = RISK_STYLES[template.riskLevel];
          const category = CATEGORY_STYLES[template.category];
          return (
            <div
              key={template.id}
              className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 hover:border-slate-300 hover:shadow-md transition-all overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${risk.bg} ${risk.border} border flex items-center justify-center flex-shrink-0`}>
                      <Icon name={template.icon} className={`w-5 h-5 ${risk.text}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{template.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${category.bg} ${category.text}`}>
                          {category.label}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${risk.bg} ${risk.text}`}>
                          {risk.label} Risk
                        </span>
                      </div>
                    </div>
                  </div>
                  {template.isBuiltIn && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium flex-shrink-0">
                      Built-in
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-3 line-clamp-2">{template.description}</p>
              </div>

              {/* Quick Preview */}
              <div className="p-4 bg-slate-50/50 space-y-3">
                {/* Key Settings */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Icon name="lock-closed" className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-600">PII: </span>
                    <span className={`font-medium ${
                      template.guardrails.piiHandling === 'block' ? 'text-rose-600' :
                      template.guardrails.piiHandling === 'anonymize' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {template.guardrails.piiHandling === 'block' ? 'Blocked' :
                       template.guardrails.piiHandling === 'anonymize' ? 'Anonymized' : 'Allowed'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon name="user" className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-600">HITL: </span>
                    <span className={`font-medium ${template.hitl.required ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {template.hitl.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon name="clipboard-list" className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-600">Logging: </span>
                    <span className="font-medium text-emerald-600">
                      {template.logging.retentionDays}d
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon name="fire" className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-600">Blast: </span>
                    <span className={`font-medium ${
                      template.tools.maxBlastRadius === 'critical' ? 'text-rose-600' :
                      template.tools.maxBlastRadius === 'high' ? 'text-amber-600' :
                      template.tools.maxBlastRadius === 'medium' ? 'text-blue-600' : 'text-emerald-600'
                    }`}>
                      {template.tools.maxBlastRadius}
                    </span>
                  </div>
                </div>

                {/* Agents Using */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                  <Icon name="cpu-chip" className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] text-slate-500">
                    {template.agentsUsing.length} agent{template.agentsUsing.length !== 1 ? 's' : ''} using this template
                  </span>
                </div>
              </div>

              {/* Card Actions */}
              <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setSelectedTemplate(template);
                    setDrawerOpen(true);
                  }}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium transition-colors"
                >
                  View Details
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedTemplate(template);
                      setCustomizeDrawerOpen(true);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    Customize
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTemplate(template);
                      setApplyDrawerOpen(true);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Template Detail Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedTemplate?.name || 'Template Details'}
        subtitle={selectedTemplate?.description}
        width="xl"
      >
        {selectedTemplate && (
          <div className="space-y-6">
            {/* Header Info */}
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${RISK_STYLES[selectedTemplate.riskLevel].bg} ${RISK_STYLES[selectedTemplate.riskLevel].border} border flex items-center justify-center`}>
                <Icon name={selectedTemplate.icon} className={`w-6 h-6 ${RISK_STYLES[selectedTemplate.riskLevel].text}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${CATEGORY_STYLES[selectedTemplate.category].bg} ${CATEGORY_STYLES[selectedTemplate.category].text}`}>
                    {CATEGORY_STYLES[selectedTemplate.category].label}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${RISK_STYLES[selectedTemplate.riskLevel].bg} ${RISK_STYLES[selectedTemplate.riskLevel].text}`}>
                    {RISK_STYLES[selectedTemplate.riskLevel].label} Risk
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Last updated: {selectedTemplate.updatedAt} | Created by: {selectedTemplate.createdBy}
                </div>
              </div>
            </div>

            {/* Guardrails Section */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Icon name="shield-check" className="w-4 h-4 text-slate-500" />
                Guardrail Configuration
              </h4>

              {/* Content Filters */}
              <div className="mb-4">
                <div className="text-xs font-medium text-slate-700 mb-2">Content Filters</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {selectedTemplate.guardrails.contentFilters.map(filter => (
                    <div key={filter.category} className="bg-white rounded-lg p-2 border border-slate-100">
                      <div className="text-[10px] font-medium text-slate-700 mb-1">{filter.category}</div>
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className="text-slate-400">In:</span>
                        <span className={`px-1 py-0.5 rounded ${STRENGTH_COLORS[filter.inputStrength]}`}>
                          {filter.inputStrength}
                        </span>
                        <span className="text-slate-400 ml-1">Out:</span>
                        <span className={`px-1 py-0.5 rounded ${STRENGTH_COLORS[filter.outputStrength]}`}>
                          {filter.outputStrength}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* PII Handling */}
              <div className="mb-4">
                <div className="text-xs font-medium text-slate-700 mb-2">PII Handling</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    selectedTemplate.guardrails.piiHandling === 'block' ? 'bg-rose-100 text-rose-700' :
                    selectedTemplate.guardrails.piiHandling === 'anonymize' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {selectedTemplate.guardrails.piiHandling === 'block' ? 'Block All PII' :
                     selectedTemplate.guardrails.piiHandling === 'anonymize' ? 'Anonymize PII' : 'Allow PII'}
                  </span>
                </div>
                {selectedTemplate.guardrails.piiTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedTemplate.guardrails.piiTypes.map(type => (
                      <span key={type} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {type}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Denied Topics */}
              {selectedTemplate.guardrails.deniedTopics.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-slate-700 mb-2">Denied Topics</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTemplate.guardrails.deniedTopics.map(topic => (
                      <span key={topic} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Grounding */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">Grounding Check:</span>
                <span className={`font-medium ${selectedTemplate.guardrails.groundingEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {selectedTemplate.guardrails.groundingEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Logging Section */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Icon name="clipboard-list" className="w-4 h-4 text-slate-500" />
                Logging Requirements
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-2 bg-white rounded-lg border border-slate-100">
                  <Icon name={selectedTemplate.logging.inputLogging ? 'check-circle' : 'x-circle'}
                        className={`w-5 h-5 mx-auto mb-1 ${selectedTemplate.logging.inputLogging ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <div className="text-[10px] text-slate-600">Input Logging</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border border-slate-100">
                  <Icon name={selectedTemplate.logging.outputLogging ? 'check-circle' : 'x-circle'}
                        className={`w-5 h-5 mx-auto mb-1 ${selectedTemplate.logging.outputLogging ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <div className="text-[10px] text-slate-600">Output Logging</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border border-slate-100">
                  <Icon name={selectedTemplate.logging.toolCallLogging ? 'check-circle' : 'x-circle'}
                        className={`w-5 h-5 mx-auto mb-1 ${selectedTemplate.logging.toolCallLogging ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <div className="text-[10px] text-slate-600">Tool Call Logging</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border border-slate-100">
                  <Icon name={selectedTemplate.logging.sensitiveDataMasking ? 'check-circle' : 'x-circle'}
                        className={`w-5 h-5 mx-auto mb-1 ${selectedTemplate.logging.sensitiveDataMasking ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <div className="text-[10px] text-slate-600">Data Masking</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-slate-600">Retention Period:</span>
                <span className="font-semibold text-slate-900">{selectedTemplate.logging.retentionDays} days</span>
                {selectedTemplate.logging.retentionDays >= 2555 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">FSI Compliant</span>
                )}
              </div>
            </div>

            {/* HITL Section */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Icon name="user" className="w-4 h-4 text-slate-500" />
                Human-in-the-Loop (HITL)
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    selectedTemplate.hitl.required ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {selectedTemplate.hitl.required ? 'Required' : 'Optional'}
                  </span>
                  <span className="text-xs text-slate-600">
                    Review Frequency: <span className="font-medium text-slate-900">{selectedTemplate.hitl.reviewFrequency}</span>
                  </span>
                  <span className="text-xs text-slate-600">
                    Threshold: <span className="font-medium text-slate-900">{selectedTemplate.hitl.approvalThreshold}</span>
                  </span>
                </div>
                {selectedTemplate.hitl.criticalActions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium text-slate-700 mb-1">Critical Actions Requiring Approval</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.hitl.criticalActions.map(action => (
                        <span key={action} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Data Access Section */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Icon name="circle-stack" className="w-4 h-4 text-slate-500" />
                Data Access Restrictions
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-medium text-slate-700 mb-2">Allowed Classifications</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTemplate.dataAccess.allowedClassifications.map(c => (
                      <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-slate-700 mb-2">Blocked Data Sources</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTemplate.dataAccess.blockedDataSources.map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[10px]">
                <span className={`flex items-center gap-1 ${selectedTemplate.dataAccess.piiAccess ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <Icon name={selectedTemplate.dataAccess.piiAccess ? 'check' : 'x-mark'} className="w-3 h-3" />
                  PII Access
                </span>
                <span className={`flex items-center gap-1 ${selectedTemplate.dataAccess.pciAccess ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <Icon name={selectedTemplate.dataAccess.pciAccess ? 'check' : 'x-mark'} className="w-3 h-3" />
                  PCI Access
                </span>
                <span className={`flex items-center gap-1 ${selectedTemplate.dataAccess.requireEncryption ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <Icon name={selectedTemplate.dataAccess.requireEncryption ? 'check' : 'x-mark'} className="w-3 h-3" />
                  Encryption Required
                </span>
              </div>
            </div>

            {/* Tools Section */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Icon name="wrench" className="w-4 h-4 text-slate-500" />
                Tool Configuration
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Max Blast Radius:</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    selectedTemplate.tools.maxBlastRadius === 'critical' ? 'bg-rose-100 text-rose-700' :
                    selectedTemplate.tools.maxBlastRadius === 'high' ? 'bg-amber-100 text-amber-700' :
                    selectedTemplate.tools.maxBlastRadius === 'medium' ? 'bg-blue-100 text-blue-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {selectedTemplate.tools.maxBlastRadius}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-slate-700 mb-1">Allowed Categories</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTemplate.tools.allowedCategories.map(c => (
                      <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                {selectedTemplate.tools.blockedTools.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium text-slate-700 mb-1">Blocked Tools</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.tools.blockedTools.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedTemplate.tools.requireApproval.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium text-slate-700 mb-1">Require Approval</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.tools.requireApproval.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Agents Using */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Icon name="cpu-chip" className="w-4 h-4 text-slate-500" />
                Agents Using This Template ({selectedTemplate.agentsUsing.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.agentsUsing.map(agent => (
                  <span key={agent} className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                    {agent}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  handleCustomize(selectedTemplate);
                }}
                className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                Create Variant
              </button>
              <button
                onClick={() => {
                  setApplyDrawerOpen(true);
                }}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Apply to Agent
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Apply to Agent Drawer */}
      <Drawer
        open={applyDrawerOpen}
        onClose={() => setApplyDrawerOpen(false)}
        title="Apply Policy Template"
        subtitle={`Select an agent to apply the "${selectedTemplate?.name}" policy template`}
        width="md"
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600 mb-4">
            This will apply all guardrail, logging, HITL, data access, and tool configurations from the template to the selected agent.
          </div>

          {/* Unassigned Agents */}
          <div>
            <div className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-2">
              <Icon name="exclamation-triangle" className="w-3.5 h-3.5" />
              Unassigned Agents
            </div>
            <div className="space-y-2">
              {agents.filter(a => !a.currentPolicy).map(agent => (
                <button
                  key={agent.id}
                  onClick={() => selectedTemplate && handleApplyToAgent(selectedTemplate, agent.id)}
                  className="w-full flex items-center justify-between p-3 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Icon name="cpu-chip" className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-slate-900">{agent.name}</span>
                  </div>
                  <span className="text-xs text-amber-600 font-medium">No policy</span>
                </button>
              ))}
            </div>
          </div>

          {/* Assigned Agents */}
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Icon name="check-circle" className="w-3.5 h-3.5 text-emerald-500" />
              Agents with Existing Policy (will override)
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {agents.filter(a => a.currentPolicy).map(agent => {
                const currentTemplate = templates.find(t => t.id === agent.currentPolicy);
                return (
                  <button
                    key={agent.id}
                    onClick={() => selectedTemplate && handleApplyToAgent(selectedTemplate, agent.id)}
                    className="w-full flex items-center justify-between p-3 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Icon name="cpu-chip" className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-900">{agent.name}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {currentTemplate?.name || 'Unknown'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Drawer>

      {/* Customize Drawer */}
      <Drawer
        open={customizeDrawerOpen}
        onClose={() => setCustomizeDrawerOpen(false)}
        title="Customize Template"
        subtitle={`Create a variant based on "${selectedTemplate?.name}"`}
        width="md"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-800 mb-1">Creating a Custom Variant</div>
            <div className="text-xs text-blue-700">
              This will create a new custom policy template based on "{selectedTemplate?.name}" that you can modify to fit your specific requirements.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New Template Name</label>
            <input
              type="text"
              placeholder={`${selectedTemplate?.name} (Custom)`}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="Describe the purpose and modifications of this custom template..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              onClick={() => setCustomizeDrawerOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => selectedTemplate && handleCustomize(selectedTemplate)}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Create & Edit
            </button>
          </div>
        </div>
      </Drawer>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in flex items-center gap-2">
          <Icon name="check-circle" className="w-4 h-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
