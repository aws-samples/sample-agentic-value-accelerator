/**
 * DDQManagement - Due Diligence Questionnaire management for Third-Party Risk
 *
 * Supports:
 * - DDQ overview with status counts
 * - DDQ list with filtering and actions
 * - DDQ detail view with questionnaire sections
 * - DDQ builder for generating new questionnaires
 * - Response tracking timeline
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import { rowButtonProps } from '../a11y';

type DDQStatus = 'draft' | 'sent' | 'in-progress' | 'complete' | 'overdue';
type RiskTier = 'lower' | 'moderate' | 'higher';
type QuestionStatus = 'pending' | 'answered' | 'flagged';

interface DDQQuestion {
  id: string;
  sectionId: string;
  text: string;
  status: QuestionStatus;
  response?: string;
  flagReason?: string;
}

interface DDQSection {
  id: string;
  name: string;
  questionCount: number;
  answeredCount: number;
}

interface DDQTimelineEvent {
  id: string;
  type: 'created' | 'sent' | 'reminder' | 'response' | 'completed' | 'flagged';
  date: string;
  description: string;
  user?: string;
}

interface DDQ {
  id: string;
  vendorId: string;
  vendorName: string;
  riskTier: RiskTier;
  templateUsed: 'basic' | 'standard' | 'comprehensive';
  status: DDQStatus;
  completionPercent: number;
  dueDate: string;
  lastUpdated: string;
  createdDate: string;
  sections: DDQSection[];
  timeline: DDQTimelineEvent[];
}

interface DDQManagementProps {
  vendorId?: string;
}

// Template definitions by risk tier
const DDQ_TEMPLATES = {
  basic: {
    name: 'Basic (20 Questions)',
    questionCount: 20,
    description: 'Company info, basic security, compliance attestation',
    sections: [
      { id: 'company', name: 'Company Information', questions: 5 },
      { id: 'basic-security', name: 'Basic Security', questions: 8 },
      { id: 'compliance', name: 'Compliance Attestation', questions: 7 },
    ],
  },
  standard: {
    name: 'Standard (50 Questions)',
    questionCount: 50,
    description: 'Above + detailed security, incident response, data handling',
    sections: [
      { id: 'company', name: 'Company Information', questions: 5 },
      { id: 'basic-security', name: 'Basic Security', questions: 8 },
      { id: 'compliance', name: 'Compliance Attestation', questions: 7 },
      { id: 'detailed-security', name: 'Detailed Security Controls', questions: 12 },
      { id: 'incident-response', name: 'Incident Response', questions: 8 },
      { id: 'data-handling', name: 'Data Handling', questions: 10 },
    ],
  },
  comprehensive: {
    name: 'Comprehensive (100+ Questions)',
    questionCount: 105,
    description: 'Above + on-site audit rights, penetration test results, BCP/DR plans',
    sections: [
      { id: 'company', name: 'Company Information', questions: 5 },
      { id: 'basic-security', name: 'Basic Security', questions: 8 },
      { id: 'compliance', name: 'Compliance Attestation', questions: 7 },
      { id: 'detailed-security', name: 'Detailed Security Controls', questions: 12 },
      { id: 'incident-response', name: 'Incident Response', questions: 8 },
      { id: 'data-handling', name: 'Data Handling', questions: 10 },
      { id: 'audit-rights', name: 'Audit Rights & Access', questions: 15 },
      { id: 'pentest', name: 'Penetration Testing', questions: 12 },
      { id: 'bcp-dr', name: 'BCP/DR Plans', questions: 18 },
      { id: 'subcontractors', name: 'Subcontractor Management', questions: 10 },
    ],
  },
};

// Mock DDQ data
const MOCK_DDQS: DDQ[] = [
  {
    id: 'DDQ-001',
    vendorId: 'anthropic',
    vendorName: 'Anthropic',
    riskTier: 'higher',
    templateUsed: 'comprehensive',
    status: 'complete',
    completionPercent: 100,
    dueDate: '2026-03-01',
    lastUpdated: '2026-02-28',
    createdDate: '2026-01-15',
    sections: [
      { id: 'company', name: 'Company Information', questionCount: 5, answeredCount: 5 },
      { id: 'basic-security', name: 'Basic Security', questionCount: 8, answeredCount: 8 },
      { id: 'compliance', name: 'Compliance Attestation', questionCount: 7, answeredCount: 7 },
      { id: 'detailed-security', name: 'Detailed Security Controls', questionCount: 12, answeredCount: 12 },
      { id: 'incident-response', name: 'Incident Response', questionCount: 8, answeredCount: 8 },
      { id: 'data-handling', name: 'Data Handling', questionCount: 10, answeredCount: 10 },
      { id: 'audit-rights', name: 'Audit Rights & Access', questionCount: 15, answeredCount: 15 },
      { id: 'pentest', name: 'Penetration Testing', questionCount: 12, answeredCount: 12 },
      { id: 'bcp-dr', name: 'BCP/DR Plans', questionCount: 18, answeredCount: 18 },
      { id: 'subcontractors', name: 'Subcontractor Management', questionCount: 10, answeredCount: 10 },
    ],
    timeline: [
      { id: 't1', type: 'created', date: '2026-01-15', description: 'DDQ created', user: 'Risk Team' },
      { id: 't2', type: 'sent', date: '2026-01-16', description: 'DDQ sent to vendor', user: 'Risk Team' },
      { id: 't3', type: 'response', date: '2026-02-10', description: 'Partial response received (60%)', user: 'Anthropic' },
      { id: 't4', type: 'reminder', date: '2026-02-20', description: 'Reminder sent', user: 'Risk Team' },
      { id: 't5', type: 'response', date: '2026-02-28', description: 'Final response received', user: 'Anthropic' },
      { id: 't6', type: 'completed', date: '2026-02-28', description: 'DDQ marked complete', user: 'Risk Team' },
    ],
  },
  {
    id: 'DDQ-002',
    vendorId: 'aws-bedrock',
    vendorName: 'AWS Bedrock',
    riskTier: 'higher',
    templateUsed: 'comprehensive',
    status: 'complete',
    completionPercent: 100,
    dueDate: '2026-03-15',
    lastUpdated: '2026-03-10',
    createdDate: '2026-02-01',
    sections: [
      { id: 'company', name: 'Company Information', questionCount: 5, answeredCount: 5 },
      { id: 'basic-security', name: 'Basic Security', questionCount: 8, answeredCount: 8 },
      { id: 'compliance', name: 'Compliance Attestation', questionCount: 7, answeredCount: 7 },
      { id: 'detailed-security', name: 'Detailed Security Controls', questionCount: 12, answeredCount: 12 },
      { id: 'incident-response', name: 'Incident Response', questionCount: 8, answeredCount: 8 },
      { id: 'data-handling', name: 'Data Handling', questionCount: 10, answeredCount: 10 },
      { id: 'audit-rights', name: 'Audit Rights & Access', questionCount: 15, answeredCount: 15 },
      { id: 'pentest', name: 'Penetration Testing', questionCount: 12, answeredCount: 12 },
      { id: 'bcp-dr', name: 'BCP/DR Plans', questionCount: 18, answeredCount: 18 },
      { id: 'subcontractors', name: 'Subcontractor Management', questionCount: 10, answeredCount: 10 },
    ],
    timeline: [
      { id: 't1', type: 'created', date: '2026-02-01', description: 'DDQ created', user: 'Risk Team' },
      { id: 't2', type: 'sent', date: '2026-02-02', description: 'DDQ sent to vendor', user: 'Risk Team' },
      { id: 't3', type: 'response', date: '2026-03-08', description: 'Full response received', user: 'AWS' },
      { id: 't4', type: 'completed', date: '2026-03-10', description: 'DDQ marked complete', user: 'Risk Team' },
    ],
  },
  {
    id: 'DDQ-003',
    vendorId: 'openai',
    vendorName: 'OpenAI',
    riskTier: 'moderate',
    templateUsed: 'standard',
    status: 'in-progress',
    completionPercent: 68,
    dueDate: '2026-08-15',
    lastUpdated: '2026-07-28',
    createdDate: '2026-07-01',
    sections: [
      { id: 'company', name: 'Company Information', questionCount: 5, answeredCount: 5 },
      { id: 'basic-security', name: 'Basic Security', questionCount: 8, answeredCount: 8 },
      { id: 'compliance', name: 'Compliance Attestation', questionCount: 7, answeredCount: 7 },
      { id: 'detailed-security', name: 'Detailed Security Controls', questionCount: 12, answeredCount: 8 },
      { id: 'incident-response', name: 'Incident Response', questionCount: 8, answeredCount: 4 },
      { id: 'data-handling', name: 'Data Handling', questionCount: 10, answeredCount: 2 },
    ],
    timeline: [
      { id: 't1', type: 'created', date: '2026-07-01', description: 'DDQ created', user: 'Risk Team' },
      { id: 't2', type: 'sent', date: '2026-07-02', description: 'DDQ sent to vendor', user: 'Risk Team' },
      { id: 't3', type: 'response', date: '2026-07-20', description: 'Partial response received (40%)', user: 'OpenAI' },
      { id: 't4', type: 'flagged', date: '2026-07-22', description: 'Response flagged: Data retention unclear', user: 'Risk Team' },
      { id: 't5', type: 'response', date: '2026-07-28', description: 'Additional responses received (68%)', user: 'OpenAI' },
    ],
  },
  {
    id: 'DDQ-004',
    vendorId: 'cursor',
    vendorName: 'Cursor AI',
    riskTier: 'moderate',
    templateUsed: 'standard',
    status: 'overdue',
    completionPercent: 32,
    dueDate: '2026-07-01',
    lastUpdated: '2026-06-15',
    createdDate: '2026-05-01',
    sections: [
      { id: 'company', name: 'Company Information', questionCount: 5, answeredCount: 5 },
      { id: 'basic-security', name: 'Basic Security', questionCount: 8, answeredCount: 6 },
      { id: 'compliance', name: 'Compliance Attestation', questionCount: 7, answeredCount: 5 },
      { id: 'detailed-security', name: 'Detailed Security Controls', questionCount: 12, answeredCount: 0 },
      { id: 'incident-response', name: 'Incident Response', questionCount: 8, answeredCount: 0 },
      { id: 'data-handling', name: 'Data Handling', questionCount: 10, answeredCount: 0 },
    ],
    timeline: [
      { id: 't1', type: 'created', date: '2026-05-01', description: 'DDQ created', user: 'Risk Team' },
      { id: 't2', type: 'sent', date: '2026-05-02', description: 'DDQ sent to vendor', user: 'Risk Team' },
      { id: 't3', type: 'response', date: '2026-05-20', description: 'Partial response received (20%)', user: 'Cursor AI' },
      { id: 't4', type: 'reminder', date: '2026-06-01', description: 'Reminder sent', user: 'Risk Team' },
      { id: 't5', type: 'response', date: '2026-06-15', description: 'Additional responses (32%)', user: 'Cursor AI' },
      { id: 't6', type: 'reminder', date: '2026-06-25', description: 'Final reminder sent', user: 'Risk Team' },
    ],
  },
  {
    id: 'DDQ-005',
    vendorId: 'github-copilot',
    vendorName: 'GitHub Copilot',
    riskTier: 'moderate',
    templateUsed: 'standard',
    status: 'complete',
    completionPercent: 100,
    dueDate: '2026-02-28',
    lastUpdated: '2026-02-25',
    createdDate: '2026-01-20',
    sections: [
      { id: 'company', name: 'Company Information', questionCount: 5, answeredCount: 5 },
      { id: 'basic-security', name: 'Basic Security', questionCount: 8, answeredCount: 8 },
      { id: 'compliance', name: 'Compliance Attestation', questionCount: 7, answeredCount: 7 },
      { id: 'detailed-security', name: 'Detailed Security Controls', questionCount: 12, answeredCount: 12 },
      { id: 'incident-response', name: 'Incident Response', questionCount: 8, answeredCount: 8 },
      { id: 'data-handling', name: 'Data Handling', questionCount: 10, answeredCount: 10 },
    ],
    timeline: [
      { id: 't1', type: 'created', date: '2026-01-20', description: 'DDQ created', user: 'Risk Team' },
      { id: 't2', type: 'sent', date: '2026-01-21', description: 'DDQ sent to vendor', user: 'Risk Team' },
      { id: 't3', type: 'response', date: '2026-02-20', description: 'Full response received', user: 'GitHub' },
      { id: 't4', type: 'completed', date: '2026-02-25', description: 'DDQ marked complete', user: 'Risk Team' },
    ],
  },
  {
    id: 'DDQ-006',
    vendorId: 'cohere',
    vendorName: 'Cohere',
    riskTier: 'lower',
    templateUsed: 'basic',
    status: 'overdue',
    completionPercent: 15,
    dueDate: '2026-05-01',
    lastUpdated: '2026-04-10',
    createdDate: '2026-03-15',
    sections: [
      { id: 'company', name: 'Company Information', questionCount: 5, answeredCount: 3 },
      { id: 'basic-security', name: 'Basic Security', questionCount: 8, answeredCount: 0 },
      { id: 'compliance', name: 'Compliance Attestation', questionCount: 7, answeredCount: 0 },
    ],
    timeline: [
      { id: 't1', type: 'created', date: '2026-03-15', description: 'DDQ created', user: 'Risk Team' },
      { id: 't2', type: 'sent', date: '2026-03-16', description: 'DDQ sent to vendor', user: 'Risk Team' },
      { id: 't3', type: 'response', date: '2026-04-10', description: 'Minimal response received (15%)', user: 'Cohere' },
      { id: 't4', type: 'reminder', date: '2026-04-20', description: 'Reminder sent', user: 'Risk Team' },
      { id: 't5', type: 'reminder', date: '2026-04-28', description: 'Final reminder sent', user: 'Risk Team' },
    ],
  },
];

// Mock vendor list for DDQ builder
const AVAILABLE_VENDORS = [
  { id: 'anthropic', name: 'Anthropic', inherentRisk: 'higher' as RiskTier },
  { id: 'aws-bedrock', name: 'AWS Bedrock', inherentRisk: 'higher' as RiskTier },
  { id: 'openai', name: 'OpenAI', inherentRisk: 'moderate' as RiskTier },
  { id: 'cursor', name: 'Cursor AI', inherentRisk: 'moderate' as RiskTier },
  { id: 'github-copilot', name: 'GitHub Copilot', inherentRisk: 'moderate' as RiskTier },
  { id: 'cohere', name: 'Cohere', inherentRisk: 'lower' as RiskTier },
];

// Sample questions for detail view
const SAMPLE_QUESTIONS: Record<string, DDQQuestion[]> = {
  company: [
    { id: 'q1', sectionId: 'company', text: 'What is your company legal name and jurisdiction of incorporation?', status: 'answered', response: 'Anthropic, PBC. Incorporated in Delaware, USA.' },
    { id: 'q2', sectionId: 'company', text: 'How long has your company been in operation?', status: 'answered', response: 'Founded in 2021, 5 years of operation.' },
    { id: 'q3', sectionId: 'company', text: 'What is your primary business focus?', status: 'answered', response: 'AI safety research and development of AI systems.' },
    { id: 'q4', sectionId: 'company', text: 'Do you have any subsidiaries or parent companies?', status: 'answered', response: 'No subsidiaries. Independent company.' },
    { id: 'q5', sectionId: 'company', text: 'What is your current employee count?', status: 'answered', response: 'Approximately 500 employees globally.' },
  ],
  'basic-security': [
    { id: 'q6', sectionId: 'basic-security', text: 'Do you have a documented information security policy?', status: 'answered', response: 'Yes, comprehensive InfoSec policy reviewed annually.' },
    { id: 'q7', sectionId: 'basic-security', text: 'Is multi-factor authentication required for all system access?', status: 'answered', response: 'Yes, MFA required for all employees and contractors.' },
    { id: 'q8', sectionId: 'basic-security', text: 'Do you encrypt data at rest?', status: 'answered', response: 'Yes, AES-256 encryption for all data at rest.' },
    { id: 'q9', sectionId: 'basic-security', text: 'Do you encrypt data in transit?', status: 'answered', response: 'Yes, TLS 1.3 for all data in transit.' },
    { id: 'q10', sectionId: 'basic-security', text: 'Do you maintain security certifications (SOC 2, ISO 27001)?', status: 'flagged', response: 'SOC 2 Type II in progress, expected completion Q3 2026.', flagReason: 'Certification not yet complete - follow up required' },
  ],
  compliance: [
    { id: 'q11', sectionId: 'compliance', text: 'Are you compliant with GDPR requirements?', status: 'answered', response: 'Yes, full GDPR compliance maintained.' },
    { id: 'q12', sectionId: 'compliance', text: 'Do you have a designated Data Protection Officer?', status: 'answered', response: 'Yes, dedicated DPO on staff.' },
    { id: 'q13', sectionId: 'compliance', text: 'How do you handle data subject access requests?', status: 'pending' },
  ],
};

const statusColors: Record<DDQStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft' },
  sent: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Sent' },
  'in-progress': { bg: 'bg-amber-50', text: 'text-amber-700', label: 'In Progress' },
  complete: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Complete' },
  overdue: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Overdue' },
};

const riskTierColors: Record<RiskTier, { bg: string; text: string }> = {
  lower: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  moderate: { bg: 'bg-amber-50', text: 'text-amber-700' },
  higher: { bg: 'bg-rose-50', text: 'text-rose-700' },
};

const questionStatusColors: Record<QuestionStatus, { bg: string; text: string; icon: IconName }> = {
  pending: { bg: 'bg-slate-100', text: 'text-slate-600', icon: 'circle' },
  answered: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'check-circle' },
  flagged: { bg: 'bg-rose-50', text: 'text-rose-700', icon: 'flag' },
};

const timelineIcons: Record<DDQTimelineEvent['type'], { icon: IconName; bg: string }> = {
  created: { icon: 'document', bg: 'bg-slate-100' },
  sent: { icon: 'envelope', bg: 'bg-blue-100' },
  reminder: { icon: 'bell', bg: 'bg-amber-100' },
  response: { icon: 'chat-bubble', bg: 'bg-emerald-100' },
  completed: { icon: 'check-circle', bg: 'bg-emerald-100' },
  flagged: { icon: 'flag', bg: 'bg-rose-100' },
};

export default function DDQManagement({ vendorId }: DDQManagementProps) {
  const [selectedDDQ, setSelectedDDQ] = useState<DDQ | null>(null);
  const [filterStatus, setFilterStatus] = useState<DDQStatus | 'all'>('all');
  const [showBuilder, setShowBuilder] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // DDQ Builder state
  const [builderVendor, setBuilderVendor] = useState<string>('');
  const [builderTemplate, setBuilderTemplate] = useState<'basic' | 'standard' | 'comprehensive'>('standard');
  const [builderDueDate, setBuilderDueDate] = useState('');
  const [builderSections, setBuilderSections] = useState<string[]>([]);

  // Filter DDQs
  const filteredDDQs = useMemo(() => {
    let ddqs = MOCK_DDQS;
    if (vendorId) {
      ddqs = ddqs.filter(d => d.vendorId === vendorId);
    }
    if (filterStatus !== 'all') {
      ddqs = ddqs.filter(d => d.status === filterStatus);
    }
    return ddqs.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
  }, [vendorId, filterStatus]);

  // KPIs
  const allDDQs = vendorId ? MOCK_DDQS.filter(d => d.vendorId === vendorId) : MOCK_DDQS;
  const pendingCount = allDDQs.filter(d => d.status === 'sent' || d.status === 'in-progress' || d.status === 'draft').length;
  const completeCount = allDDQs.filter(d => d.status === 'complete').length;
  const overdueCount = allDDQs.filter(d => d.status === 'overdue').length;

  // Get suggested template based on vendor risk
  const getSuggestedTemplate = (vId: string): 'basic' | 'standard' | 'comprehensive' => {
    const vendor = AVAILABLE_VENDORS.find(v => v.id === vId);
    if (!vendor) return 'standard';
    switch (vendor.inherentRisk) {
      case 'lower': return 'basic';
      case 'moderate': return 'standard';
      case 'higher': return 'comprehensive';
    }
  };

  // Handle vendor selection in builder
  const handleVendorSelect = (vId: string) => {
    setBuilderVendor(vId);
    const template = getSuggestedTemplate(vId);
    setBuilderTemplate(template);
    setBuilderSections(DDQ_TEMPLATES[template].sections.map(s => s.id));
  };

  // Toggle section in builder
  const toggleBuilderSection = (sectionId: string) => {
    setBuilderSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(s => s !== sectionId)
        : [...prev, sectionId]
    );
  };

  // Create DDQ
  const handleCreateDDQ = () => {
    const vendor = AVAILABLE_VENDORS.find(v => v.id === builderVendor);
    if (!vendor || !builderDueDate) {
      setToast('Please select a vendor and due date');
      setTimeout(() => setToast(null), 2800);
      return;
    }
    setToast(`DDQ created for ${vendor.name} using ${DDQ_TEMPLATES[builderTemplate].name} template`);
    setShowBuilder(false);
    setBuilderVendor('');
    setBuilderDueDate('');
    setTimeout(() => setToast(null), 2800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">DDQ Management</h3>
          <p className="text-xs text-slate-500 mt-1">Due Diligence Questionnaires for vendor risk assessment</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setToast('Exporting all DDQ responses to ZIP archive...');
              setTimeout(() => setToast(null), 2800);
            }}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <Icon name="document-arrow-down" className="w-3.5 h-3.5" />
            Export All
          </button>
          <button
            onClick={() => setShowBuilder(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Generate DDQ
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Total DDQs</div>
          <div className="text-2xl font-bold text-slate-900">{allDDQs.length}</div>
          <div className="text-xs text-slate-500 mt-1">{vendorId ? 'for this vendor' : 'across all vendors'}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Pending / Complete</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600">{pendingCount}</span>
            <span className="text-slate-400">/</span>
            <span className="text-2xl font-bold text-emerald-600">{completeCount}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">in progress / finished</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Overdue</div>
          <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {overdueCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">past due date</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Filter:</span>
        <select
          aria-label="Filter DDQs by status"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as DDQStatus | 'all')}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="in-progress">In Progress</option>
          <option value="complete">Complete</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* DDQ List Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h4 className="text-sm font-semibold text-slate-800">DDQ List</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Vendor</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Risk Tier</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Template</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Completion</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Due Date</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Last Updated</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDDQs.map(ddq => (
                <tr
                  key={ddq.id}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{ddq.vendorName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{ddq.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${riskTierColors[ddq.riskTier].bg} ${riskTierColors[ddq.riskTier].text}`}>
                      {ddq.riskTier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{ddq.templateUsed}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[ddq.status].bg} ${statusColors[ddq.status].text}`}>
                      {statusColors[ddq.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            ddq.completionPercent >= 100 ? 'bg-emerald-500' :
                            ddq.completionPercent >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${ddq.completionPercent}%` }}
                        />
                      </div>
                      <span className="text-slate-600">{ddq.completionPercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ddq.dueDate}</td>
                  <td className="px-4 py-3 text-slate-600">{ddq.lastUpdated}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedDDQ(ddq)}
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                        title="View DDQ"
                      >
                        <Icon name="eye" className="w-4 h-4 text-slate-500" />
                      </button>
                      {(ddq.status === 'sent' || ddq.status === 'in-progress' || ddq.status === 'overdue') && (
                        <button
                          onClick={() => {
                            setToast(`Reminder sent to ${ddq.vendorName}`);
                            setTimeout(() => setToast(null), 2800);
                          }}
                          className="p-1 hover:bg-slate-100 rounded transition-colors"
                          title="Send Reminder"
                        >
                          <Icon name="bell" className="w-4 h-4 text-amber-500" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setToast(`Exporting ${ddq.id} to PDF...`);
                          setTimeout(() => setToast(null), 2800);
                        }}
                        className="p-1 hover:bg-slate-100 rounded transition-colors"
                        title="Export PDF"
                      >
                        <Icon name="document-arrow-down" className="w-4 h-4 text-slate-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredDDQs.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No DDQs found matching the current filters.
          </div>
        )}
      </div>

      {/* DDQ Detail Modal */}
      {selectedDDQ && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedDDQ(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-indigo-700 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">{selectedDDQ.vendorName}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[selectedDDQ.status].bg} ${statusColors[selectedDDQ.status].text}`}>
                    {statusColors[selectedDDQ.status].label}
                  </span>
                </div>
                <p className="text-xs text-indigo-200 mt-0.5">
                  {selectedDDQ.id} - {DDQ_TEMPLATES[selectedDDQ.templateUsed].name}
                </p>
              </div>
              <button
                onClick={() => setSelectedDDQ(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Icon name="x-mark" className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Summary Row */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Risk Tier</div>
                  <div className={`text-sm font-medium capitalize ${riskTierColors[selectedDDQ.riskTier].text}`}>
                    {selectedDDQ.riskTier}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Due Date</div>
                  <div className="text-sm font-medium text-slate-900">{selectedDDQ.dueDate}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Completion</div>
                  <div className={`text-sm font-medium ${
                    selectedDDQ.completionPercent >= 100 ? 'text-emerald-600' :
                    selectedDDQ.completionPercent >= 50 ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {selectedDDQ.completionPercent}%
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase">Last Updated</div>
                  <div className="text-sm font-medium text-slate-900">{selectedDDQ.lastUpdated}</div>
                </div>
              </div>

              {/* Sections */}
              <div>
                <div className="text-sm font-semibold text-slate-900 mb-3">Questionnaire Sections</div>
                <div className="space-y-2">
                  {selectedDDQ.sections.map(section => {
                    const progress = (section.answeredCount / section.questionCount) * 100;
                    const isExpanded = expandedSection === section.id;
                    const questions = SAMPLE_QUESTIONS[section.id] || [];

                    return (
                      <div key={section.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div
                          {...rowButtonProps(
                            () => setExpandedSection(isExpanded ? null : section.id),
                            `Toggle ${section.name} section`
                          )}
                          className="px-4 py-3 bg-slate-50/50 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Icon
                              name={isExpanded ? 'chevron-down' : 'chevron-right'}
                              className="w-4 h-4 text-slate-400"
                            />
                            <div>
                              <div className="text-sm font-medium text-slate-900">{section.name}</div>
                              <div className="text-[10px] text-slate-500">
                                {section.answeredCount} of {section.questionCount} questions answered
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  progress >= 100 ? 'bg-emerald-500' :
                                  progress >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-600 w-10 text-right">{Math.round(progress)}%</span>
                          </div>
                        </div>

                        {/* Expanded Questions */}
                        {isExpanded && questions.length > 0 && (
                          <div className="border-t border-slate-200 divide-y divide-slate-100">
                            {questions.map(q => (
                              <div key={q.id} className="px-4 py-3">
                                <div className="flex items-start gap-3">
                                  <div className={`p-1 rounded ${questionStatusColors[q.status].bg}`}>
                                    <Icon
                                      name={questionStatusColors[q.status].icon}
                                      className={`w-3.5 h-3.5 ${questionStatusColors[q.status].text}`}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-slate-900">{q.text}</div>
                                    {q.response && (
                                      <div className="mt-2 p-2 bg-slate-50 rounded text-xs text-slate-600">
                                        {q.response}
                                      </div>
                                    )}
                                    {q.flagReason && (
                                      <div className="mt-2 p-2 bg-rose-50 rounded text-xs text-rose-700 flex items-start gap-2">
                                        <Icon name="flag" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                        {q.flagReason}
                                      </div>
                                    )}
                                    {q.status === 'pending' && (
                                      <div className="mt-2 text-[10px] text-slate-400 italic">
                                        Awaiting vendor response
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {isExpanded && questions.length === 0 && (
                          <div className="px-4 py-6 text-center text-sm text-slate-500">
                            Question details not available in demo mode.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Response Timeline */}
              <div>
                <div className="text-sm font-semibold text-slate-900 mb-3">Response Timeline</div>
                <div className="relative">
                  <div className="absolute left-4 top-3 bottom-3 w-px bg-slate-200" />
                  <div className="space-y-4">
                    {selectedDDQ.timeline.map((event) => (
                      <div key={event.id} className="relative flex items-start gap-4 pl-9">
                        <div className={`absolute left-2 w-5 h-5 rounded-full ${timelineIcons[event.type].bg} flex items-center justify-center`}>
                          <Icon name={timelineIcons[event.type].icon} className="w-3 h-3 text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-900">{event.description}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500">{event.date}</span>
                            {event.user && (
                              <span className="text-[10px] text-slate-400">by {event.user}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <button
                onClick={() => {
                  setToast(`Flagging concerning responses for ${selectedDDQ.vendorName}`);
                  setTimeout(() => setToast(null), 2800);
                }}
                className="px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1.5"
              >
                <Icon name="flag" className="w-3.5 h-3.5" />
                Flag for Follow-up
              </button>
              <div className="flex items-center gap-2">
                {selectedDDQ.status !== 'complete' && (
                  <button
                    onClick={() => {
                      setToast(`Reminder sent to ${selectedDDQ.vendorName}`);
                      setTimeout(() => setToast(null), 2800);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-1.5"
                  >
                    <Icon name="bell" className="w-3.5 h-3.5" />
                    Send Reminder
                  </button>
                )}
                <button
                  onClick={() => {
                    setToast(`Exporting ${selectedDDQ.id} to PDF...`);
                    setTimeout(() => setToast(null), 2800);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                >
                  <Icon name="document-arrow-down" className="w-3.5 h-3.5" />
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DDQ Builder Modal */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowBuilder(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Builder Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-indigo-700 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-white">Generate New DDQ</h3>
                <p className="text-xs text-indigo-200 mt-0.5">Create a Due Diligence Questionnaire for a vendor</p>
              </div>
              <button
                onClick={() => setShowBuilder(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Icon name="x-mark" className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Builder Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Vendor Selection */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Select Vendor</label>
                <select
                  value={builderVendor}
                  onChange={e => handleVendorSelect(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                >
                  <option value="">Choose a vendor...</option>
                  {AVAILABLE_VENDORS.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.inherentRisk} risk)
                    </option>
                  ))}
                </select>
              </div>

              {/* Template Selection */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Template
                  {builderVendor && (
                    <span className="text-xs text-slate-400 ml-2">
                      (Auto-suggested based on TPIA inherent risk)
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['basic', 'standard', 'comprehensive'] as const).map(template => (
                    <div
                      key={template}
                      {...rowButtonProps(() => {
                        setBuilderTemplate(template);
                        setBuilderSections(DDQ_TEMPLATES[template].sections.map(s => s.id));
                      }, `Select ${template} template`)}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        builderTemplate === template
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-medium text-slate-900 capitalize">{template}</div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {DDQ_TEMPLATES[template].questionCount} questions
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                        {DDQ_TEMPLATES[template].description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section Customization */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Customize Sections
                  <span className="text-xs text-slate-400 ml-2">
                    ({builderSections.length} selected)
                  </span>
                </label>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {DDQ_TEMPLATES[builderTemplate].sections.map(section => (
                    <label
                      key={section.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={builderSections.includes(section.id)}
                        onChange={() => toggleBuilderSection(section.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs text-slate-900">{section.name}</div>
                        <div className="text-[10px] text-slate-500">{section.questions} questions</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Due Date</label>
                <input
                  type="date"
                  value={builderDueDate}
                  onChange={e => setBuilderDueDate(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Preview */}
              {builderVendor && builderDueDate && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-medium text-slate-700 mb-2">Preview</div>
                  <div className="text-sm text-slate-900">
                    DDQ for <span className="font-semibold">{AVAILABLE_VENDORS.find(v => v.id === builderVendor)?.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {DDQ_TEMPLATES[builderTemplate].name} with {builderSections.length} sections
                  </div>
                  <div className="text-xs text-slate-500">
                    Due: {builderDueDate}
                  </div>
                </div>
              )}
            </div>

            {/* Builder Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setShowBuilder(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDDQ}
                disabled={!builderVendor || !builderDueDate || builderSections.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Icon name="document-check" className="w-4 h-4" />
                Create DDQ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-[60] animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
