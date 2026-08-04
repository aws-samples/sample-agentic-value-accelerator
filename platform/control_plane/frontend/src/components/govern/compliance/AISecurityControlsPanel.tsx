/**
 * AISecurityControlsPanel — AI-specific security controls and compliance standards mapping
 *
 * Displays:
 * - AWS AI Security Best Practices checklist (model access logging, guardrail enforcement, VPC endpoints, encryption)
 * - Control status: Compliant/Non-Compliant/Not Evaluated
 * - Auto-detect status from Security Hub findings
 * - AI-specific compliance standards mapping (NIST AI RMF, EU AI Act, SR 26-2)
 * - Remediation guidance for non-compliant controls
 *
 * Part of the Govern module's compliance posture surface, integrated with Security Hub tab.
 */
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import {
  useSecurityHubCompliance,
  type AISecurityFinding,
  type SeverityLevel,
} from './useSecurityHubCompliance';

// ─────────────────────────── Types ───────────────────────────

type ControlStatus = 'compliant' | 'non-compliant' | 'not-evaluated' | 'partial';

interface AISecurityControl {
  id: string;
  name: string;
  description: string;
  category: 'access' | 'data' | 'network' | 'monitoring' | 'guardrails';
  /** Keywords to match in Security Hub findings for auto-detection */
  detectionKeywords: string[];
  /** AWS console link for remediation */
  consoleLink?: string;
  /** Remediation guidance */
  remediation: {
    steps: string[];
    effort: 'low' | 'medium' | 'high';
    automatable: boolean;
  };
  /** Framework mappings */
  frameworkMappings: {
    framework: string;
    controls: string[];
    section?: string;
  }[];
}

interface FrameworkComplianceMapping {
  framework: string;
  shortName: string;
  color: string;
  totalControls: number;
  mappedControls: number;
  compliantControls: number;
  categories: {
    name: string;
    controls: {
      id: string;
      name: string;
      status: ControlStatus;
      linkedSecurityControl?: string;
    }[];
  }[];
}

// ─────────────────────────── Constants ───────────────────────────

const CONTROL_STATUS_STYLES: Record<ControlStatus, { label: string; bg: string; text: string; border: string; icon: string }> = {
  compliant: {
    label: 'Compliant',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: 'check-circle',
  },
  'non-compliant': {
    label: 'Non-Compliant',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: 'x-circle',
  },
  'not-evaluated': {
    label: 'Not Evaluated',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    border: 'border-slate-200',
    icon: 'information-circle',
  },
  partial: {
    label: 'Partial',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: 'exclamation-circle',
  },
};

const CATEGORY_STYLES: Record<string, { label: string; icon: string; color: string }> = {
  access: { label: 'Access Control', icon: 'key', color: '#8b5cf6' },
  data: { label: 'Data Protection', icon: 'shield-check', color: '#3b82f6' },
  network: { label: 'Network Security', icon: 'globe-alt', color: '#06b6d4' },
  monitoring: { label: 'Monitoring & Logging', icon: 'chart-bar', color: '#10b981' },
  guardrails: { label: 'Guardrails & Safety', icon: 'shield-exclamation', color: '#f59e0b' },
};

/**
 * AWS AI Security Best Practices - checklist items
 */
const AI_SECURITY_CONTROLS: AISecurityControl[] = [
  // Access Control
  {
    id: 'ai-sec-001',
    name: 'Model Access Logging',
    description: 'Enable CloudWatch logging for all Bedrock model invocations to track usage and detect anomalies.',
    category: 'monitoring',
    detectionKeywords: ['cloudwatch', 'logging', 'bedrock', 'log', 'audit', 'trail'],
    consoleLink: 'https://console.aws.amazon.com/bedrock/home#/settings',
    remediation: {
      steps: [
        'Navigate to Amazon Bedrock console > Settings',
        'Enable model invocation logging',
        'Configure CloudWatch log group retention',
        'Set up CloudWatch alarms for anomaly detection',
      ],
      effort: 'low',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 5.1', 'MEASURE 2.4'], section: 'GOVERN / MEASURE' },
      { framework: 'SR 26-2', controls: ['GOV-1', 'USE-2'], section: 'IV.C' },
      { framework: 'EU AI Act', controls: ['EU-MON-1'], section: 'Art. 72' },
    ],
  },
  {
    id: 'ai-sec-002',
    name: 'Guardrail Enforcement',
    description: 'Deploy Bedrock Guardrails to enforce content policies, denied topics, and PII filtering on model invocations.',
    category: 'guardrails',
    detectionKeywords: ['guardrail', 'content', 'filter', 'pii', 'topic', 'policy'],
    consoleLink: 'https://console.aws.amazon.com/bedrock/home#/guardrails',
    remediation: {
      steps: [
        'Create guardrail in Bedrock console',
        'Configure content filters (hate, violence, sexual, etc.)',
        'Add denied topics for your organization',
        'Enable PII detection and redaction',
        'Attach guardrail to model invocations',
      ],
      effort: 'medium',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'NIST AI RMF', controls: ['MANAGE 1.3', 'MEASURE 2.7'], section: 'MANAGE / MEASURE' },
      { framework: 'EU AI Act', controls: ['EU-ROB-1', 'EU-DATA-3'], section: 'Art. 15' },
      { framework: 'OWASP LLM', controls: ['LLM01', 'LLM02', 'LLM06'], section: 'Top 10' },
    ],
  },
  {
    id: 'ai-sec-003',
    name: 'VPC Endpoints for AI Services',
    description: 'Configure VPC endpoints for Bedrock and SageMaker to keep traffic within AWS network and avoid public internet exposure.',
    category: 'network',
    detectionKeywords: ['vpc', 'endpoint', 'private', 'network', 'security group'],
    consoleLink: 'https://console.aws.amazon.com/vpc/home#Endpoints',
    remediation: {
      steps: [
        'Navigate to VPC console > Endpoints',
        'Create endpoint for com.amazonaws.region.bedrock-runtime',
        'Create endpoint for com.amazonaws.region.bedrock',
        'Configure security groups to restrict access',
        'Update application to use VPC endpoint',
      ],
      effort: 'medium',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'NIST AI RMF', controls: ['MANAGE 2.2'], section: 'MANAGE' },
      { framework: 'SR 26-2', controls: ['DEV-3'], section: 'IV.A' },
      { framework: 'CIS AWS', controls: ['CIS 5.1', 'CIS 5.4'], section: 'Networking' },
    ],
  },
  {
    id: 'ai-sec-004',
    name: 'Encryption at Rest',
    description: 'Ensure all AI model artifacts, training data, and inference logs are encrypted using AWS KMS customer-managed keys.',
    category: 'data',
    detectionKeywords: ['encrypt', 'kms', 'key', 'encryption', 'cmk'],
    consoleLink: 'https://console.aws.amazon.com/kms/home',
    remediation: {
      steps: [
        'Create KMS customer-managed key for AI workloads',
        'Configure Bedrock to use CMK for model customization',
        'Encrypt S3 buckets containing training data',
        'Enable CloudWatch Logs encryption',
      ],
      effort: 'low',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 6.1'], section: 'GOVERN' },
      { framework: 'SR 26-2', controls: ['DEV-2'], section: 'IV.A' },
      { framework: 'PCI DSS', controls: ['3.4', '3.5'], section: 'Requirement 3' },
    ],
  },
  {
    id: 'ai-sec-005',
    name: 'Encryption in Transit',
    description: 'Enforce TLS 1.2+ for all API calls to AI services. Validate certificates and use secure cipher suites.',
    category: 'data',
    detectionKeywords: ['tls', 'ssl', 'transit', 'https', 'certificate'],
    consoleLink: 'https://console.aws.amazon.com/acm/home',
    remediation: {
      steps: [
        'Verify SDK/API calls use HTTPS endpoints',
        'Configure minimum TLS version in application',
        'Review API Gateway TLS policy if applicable',
        'Enable certificate validation in clients',
      ],
      effort: 'low',
      automatable: false,
    },
    frameworkMappings: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 6.1'], section: 'GOVERN' },
      { framework: 'CIS AWS', controls: ['CIS 2.1.2'], section: 'S3' },
      { framework: 'PCI DSS', controls: ['4.1'], section: 'Requirement 4' },
    ],
  },
  {
    id: 'ai-sec-006',
    name: 'IAM Least Privilege for AI Services',
    description: 'Apply least-privilege IAM policies for Bedrock and SageMaker access. Use resource-based policies and conditions.',
    category: 'access',
    detectionKeywords: ['iam', 'policy', 'role', 'permission', 'access', 'privilege'],
    consoleLink: 'https://console.aws.amazon.com/iam/home#/policies',
    remediation: {
      steps: [
        'Audit existing IAM policies using Access Analyzer',
        'Create dedicated IAM roles for AI workloads',
        'Apply resource-level permissions (specific models)',
        'Use conditions (e.g., aws:SourceVpc, aws:RequestTag)',
        'Enable IAM Access Analyzer for continuous monitoring',
      ],
      effort: 'medium',
      automatable: false,
    },
    frameworkMappings: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 1.5', 'MANAGE 2.1'], section: 'GOVERN / MANAGE' },
      { framework: 'SR 26-2', controls: ['GOV-2'], section: 'VI' },
      { framework: 'CIS AWS', controls: ['CIS 1.16', 'CIS 1.22'], section: 'IAM' },
    ],
  },
  {
    id: 'ai-sec-007',
    name: 'Model Inventory & Tagging',
    description: 'Maintain comprehensive inventory of all AI models with consistent tagging for cost allocation, compliance, and access control.',
    category: 'access',
    detectionKeywords: ['tag', 'inventory', 'model', 'catalog', 'registry'],
    consoleLink: 'https://console.aws.amazon.com/bedrock/home#/models',
    remediation: {
      steps: [
        'Define tagging strategy (Environment, Owner, Classification)',
        'Tag all custom models and fine-tuned models',
        'Use tag-based access control in IAM policies',
        'Set up AWS Config rules for tag compliance',
      ],
      effort: 'low',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 5.1', 'MAP 1.1'], section: 'GOVERN / MAP' },
      { framework: 'SR 26-2', controls: ['GOV-1'], section: 'V' },
      { framework: 'EU AI Act', controls: ['EU-REG-1'], section: 'Art. 49' },
    ],
  },
  {
    id: 'ai-sec-008',
    name: 'Prompt Injection Defense',
    description: 'Implement input validation and sanitization to prevent prompt injection attacks on LLM-based applications.',
    category: 'guardrails',
    detectionKeywords: ['prompt', 'injection', 'input', 'validation', 'sanitize'],
    consoleLink: 'https://console.aws.amazon.com/bedrock/home#/guardrails',
    remediation: {
      steps: [
        'Enable Bedrock Guardrails with contextual grounding',
        'Implement input validation in application layer',
        'Use system prompts with clear boundaries',
        'Monitor for unusual prompt patterns',
        'Consider using Amazon Bedrock Agent guardrails',
      ],
      effort: 'medium',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'OWASP LLM', controls: ['LLM01'], section: 'Prompt Injection' },
      { framework: 'MITRE ATLAS', controls: ['AML.T0043'], section: 'Prompt Injection' },
      { framework: 'NIST AI RMF', controls: ['MEASURE 2.7'], section: 'MEASURE' },
    ],
  },
  {
    id: 'ai-sec-009',
    name: 'Output Filtering & Validation',
    description: 'Filter and validate model outputs before returning to users. Implement content moderation and PII redaction.',
    category: 'guardrails',
    detectionKeywords: ['output', 'filter', 'moderation', 'content', 'redact'],
    consoleLink: 'https://console.aws.amazon.com/bedrock/home#/guardrails',
    remediation: {
      steps: [
        'Configure Bedrock Guardrails output filters',
        'Enable PII entity detection and masking',
        'Implement application-level output validation',
        'Set up alerts for blocked content',
      ],
      effort: 'medium',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'OWASP LLM', controls: ['LLM02', 'LLM06'], section: 'Data Leakage' },
      { framework: 'EU AI Act', controls: ['EU-DATA-3'], section: 'Art. 10' },
      { framework: 'NIST AI RMF', controls: ['MEASURE 2.7'], section: 'MEASURE' },
    ],
  },
  {
    id: 'ai-sec-010',
    name: 'Rate Limiting & Throttling',
    description: 'Implement rate limiting for AI service invocations to prevent abuse and control costs.',
    category: 'access',
    detectionKeywords: ['rate', 'limit', 'throttle', 'quota', 'abuse'],
    consoleLink: 'https://console.aws.amazon.com/servicequotas/home',
    remediation: {
      steps: [
        'Review Bedrock service quotas',
        'Implement API Gateway throttling if applicable',
        'Set up CloudWatch alarms for usage spikes',
        'Configure budget alerts for AI spend',
      ],
      effort: 'low',
      automatable: true,
    },
    frameworkMappings: [
      { framework: 'OWASP LLM', controls: ['LLM04'], section: 'DoS' },
      { framework: 'NIST AI RMF', controls: ['MANAGE 2.4'], section: 'MANAGE' },
    ],
  },
];

/**
 * AI-specific compliance standards mapping
 */
const AI_COMPLIANCE_FRAMEWORKS: Omit<FrameworkComplianceMapping, 'compliantControls'>[] = [
  {
    framework: 'NIST AI RMF',
    shortName: 'NIST AI RMF',
    color: '#3b82f6',
    totalControls: 62,
    mappedControls: 12,
    categories: [
      {
        name: 'GOVERN - AI Risk Management',
        controls: [
          { id: 'GOVERN 1.1', name: 'AI risk policies established', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-001' },
          { id: 'GOVERN 1.5', name: 'Access controls for AI systems', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-006' },
          { id: 'GOVERN 5.1', name: 'AI system inventory maintained', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-007' },
          { id: 'GOVERN 6.1', name: 'Data protection controls', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-004' },
        ],
      },
      {
        name: 'MEASURE - AI Performance & Safety',
        controls: [
          { id: 'MEASURE 2.4', name: 'Monitoring and logging active', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-001' },
          { id: 'MEASURE 2.7', name: 'Security controls validated', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-002' },
        ],
      },
      {
        name: 'MANAGE - AI Operations',
        controls: [
          { id: 'MANAGE 1.3', name: 'Content filtering deployed', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-002' },
          { id: 'MANAGE 2.1', name: 'Least privilege enforced', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-006' },
          { id: 'MANAGE 2.2', name: 'Network isolation configured', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-003' },
          { id: 'MANAGE 2.4', name: 'Rate limiting active', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-010' },
        ],
      },
    ],
  },
  {
    framework: 'EU AI Act',
    shortName: 'EU AI Act',
    color: '#f59e0b',
    totalControls: 65,
    mappedControls: 8,
    categories: [
      {
        name: 'Art. 10 - Data Governance',
        controls: [
          { id: 'EU-DATA-1', name: 'Data quality measures', status: 'not-evaluated' },
          { id: 'EU-DATA-3', name: 'PII protection controls', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-009' },
        ],
      },
      {
        name: 'Art. 15 - Robustness & Security',
        controls: [
          { id: 'EU-ROB-1', name: 'Security measures against attacks', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-002' },
          { id: 'EU-ROB-2', name: 'Resilience against manipulation', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-008' },
        ],
      },
      {
        name: 'Art. 49 - Registration',
        controls: [
          { id: 'EU-REG-1', name: 'AI system registration', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-007' },
        ],
      },
      {
        name: 'Art. 72 - Monitoring',
        controls: [
          { id: 'EU-MON-1', name: 'Post-market monitoring', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-001' },
        ],
      },
    ],
  },
  {
    framework: 'SR 26-2 Model Risk',
    shortName: 'SR 26-2',
    color: '#8b5cf6',
    totalControls: 36,
    mappedControls: 6,
    categories: [
      {
        name: 'V - Model Inventory',
        controls: [
          { id: 'GOV-1', name: 'Comprehensive model inventory', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-007' },
        ],
      },
      {
        name: 'VI - Governance',
        controls: [
          { id: 'GOV-2', name: 'Clear roles and responsibilities', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-006' },
        ],
      },
      {
        name: 'IV.A - Development',
        controls: [
          { id: 'DEV-2', name: 'Data security controls', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-004' },
          { id: 'DEV-3', name: 'Secure development environment', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-003' },
        ],
      },
      {
        name: 'IV.C - Use',
        controls: [
          { id: 'USE-2', name: 'Ongoing monitoring', status: 'not-evaluated', linkedSecurityControl: 'ai-sec-001' },
        ],
      },
    ],
  },
];

// ─────────────────────────── Component ───────────────────────────

interface AISecurityControlsPanelProps {
  /** Compact mode for embedding */
  compact?: boolean;
  /** Findings data from Security Hub (optional - will fetch if not provided) */
  findings?: AISecurityFinding[];
  /** Whether data is live */
  isLive?: boolean;
}

export default function AISecurityControlsPanel({
  compact = false,
  findings: externalFindings,
  isLive: externalIsLive,
}: AISecurityControlsPanelProps) {
  // If no external findings provided, use the hook
  const hookData = useSecurityHubCompliance(60_000, { aiOnly: false, maxFindings: 200 });
  const findings = externalFindings ?? hookData.allFindings;
  const isLive = externalIsLive ?? hookData.isLive;

  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [expandedFramework, setExpandedFramework] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'controls' | 'frameworks'>('controls');

  /**
   * Auto-detect control status from Security Hub findings
   */
  const controlStatuses = useMemo(() => {
    const statuses: Record<string, { status: ControlStatus; findingCount: number; criticalHigh: number }> = {};

    AI_SECURITY_CONTROLS.forEach(control => {
      // Find related findings by matching keywords
      const relatedFindings = findings.filter(f => {
        const searchText = `${f.title} ${f.product} ${f.resource_type ?? ''}`.toLowerCase();
        return control.detectionKeywords.some(kw => searchText.includes(kw.toLowerCase()));
      });

      const criticalHigh = relatedFindings.filter(
        f => f.severity === 'CRITICAL' || f.severity === 'HIGH'
      ).length;

      let status: ControlStatus = 'not-evaluated';
      if (relatedFindings.length > 0) {
        if (criticalHigh > 0) {
          status = 'non-compliant';
        } else if (relatedFindings.some(f => f.compliance_status === 'FAILED')) {
          status = 'partial';
        } else if (relatedFindings.every(f => f.compliance_status === 'PASSED')) {
          status = 'compliant';
        } else {
          status = 'partial';
        }
      }

      statuses[control.id] = {
        status,
        findingCount: relatedFindings.length,
        criticalHigh,
      };
    });

    return statuses;
  }, [findings]);

  /**
   * Calculate framework compliance based on linked security controls
   */
  const frameworkCompliance = useMemo((): FrameworkComplianceMapping[] => {
    return AI_COMPLIANCE_FRAMEWORKS.map(fw => {
      let compliantCount = 0;
      const updatedCategories = fw.categories.map(cat => ({
        ...cat,
        controls: cat.controls.map(ctrl => {
          let status: ControlStatus = 'not-evaluated';
          if (ctrl.linkedSecurityControl && controlStatuses[ctrl.linkedSecurityControl]) {
            status = controlStatuses[ctrl.linkedSecurityControl].status;
            if (status === 'compliant') compliantCount++;
          }
          return { ...ctrl, status };
        }),
      }));

      return {
        ...fw,
        compliantControls: compliantCount,
        categories: updatedCategories,
      };
    });
  }, [controlStatuses]);

  // Summary stats
  const summary = useMemo(() => {
    const total = AI_SECURITY_CONTROLS.length;
    const compliant = Object.values(controlStatuses).filter(s => s.status === 'compliant').length;
    const nonCompliant = Object.values(controlStatuses).filter(s => s.status === 'non-compliant').length;
    const partial = Object.values(controlStatuses).filter(s => s.status === 'partial').length;
    const notEvaluated = Object.values(controlStatuses).filter(s => s.status === 'not-evaluated').length;
    const criticalHighTotal = Object.values(controlStatuses).reduce((sum, s) => sum + s.criticalHigh, 0);

    return { total, compliant, nonCompliant, partial, notEvaluated, criticalHighTotal };
  }, [controlStatuses]);

  const complianceScore = summary.total > 0
    ? Math.round((summary.compliant / (summary.total - summary.notEvaluated)) * 100) || 0
    : 0;

  const scoreColor = complianceScore >= 80 ? '#10b981' : complianceScore >= 60 ? '#f59e0b' : '#ef4444';

  // Group controls by category
  const controlsByCategory = useMemo(() => {
    const groups: Record<string, AISecurityControl[]> = {};
    AI_SECURITY_CONTROLS.forEach(ctrl => {
      if (!groups[ctrl.category]) groups[ctrl.category] = [];
      groups[ctrl.category].push(ctrl);
    });
    return groups;
  }, []);

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="cpu-chip" className="w-4 h-4 text-cyan-600" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-900">AI Security Controls</span>
            {isLive ? <LiveDataBadge source="Security Hub" /> : <MockDataBadge integration="Security Hub (Not Connected)" />}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
              <button
                onClick={() => setViewMode('controls')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  viewMode === 'controls' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Best Practices
              </button>
              <button
                onClick={() => setViewMode('frameworks')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  viewMode === 'frameworks' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Framework Mapping
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {/* Compliance Score */}
            <div className="rounded-lg p-3 border" style={{ backgroundColor: `${scoreColor}10`, borderColor: `${scoreColor}40` }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: scoreColor }}>
                Compliance Score
              </div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>
                  {complianceScore}%
                </div>
              </div>
            </div>

            {/* Total Controls */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Total Controls</div>
              <div className="text-2xl font-bold text-slate-800 tabular-nums">{summary.total}</div>
            </div>

            {/* Compliant */}
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <div className="text-[10px] text-emerald-600 uppercase tracking-wide">Compliant</div>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.compliant}</div>
            </div>

            {/* Partial */}
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <div className="text-[10px] text-amber-600 uppercase tracking-wide">Partial</div>
              <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.partial}</div>
            </div>

            {/* Non-Compliant */}
            <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
              <div className="text-[10px] text-rose-600 uppercase tracking-wide">Non-Compliant</div>
              <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.nonCompliant}</div>
              {summary.criticalHighTotal > 0 && (
                <div className="text-[9px] text-rose-500 font-medium">{summary.criticalHighTotal} critical/high findings</div>
              )}
            </div>

            {/* Not Evaluated */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Not Evaluated</div>
              <div className="text-2xl font-bold text-slate-600 tabular-nums">{summary.notEvaluated}</div>
              {!isLive && <div className="text-[9px] text-slate-400">Connect Security Hub</div>}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'controls' ? (
        /* AWS AI Security Best Practices Checklist */
        <div className="space-y-3">
          {Object.entries(controlsByCategory).map(([category, controls]) => {
            const catStyle = CATEGORY_STYLES[category];
            return (
              <div key={category} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2" style={{ backgroundColor: `${catStyle.color}08` }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${catStyle.color}20` }}>
                    <Icon name={catStyle.icon as any} className="w-3.5 h-3.5" style={{ color: catStyle.color }} strokeWidth={2} />
                  </div>
                  <span className="text-sm font-semibold text-slate-800">{catStyle.label}</span>
                  <span className="text-[10px] text-slate-500">({controls.length} controls)</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {controls.map(control => {
                    const status = controlStatuses[control.id] || { status: 'not-evaluated', findingCount: 0, criticalHigh: 0 };
                    const statusStyle = CONTROL_STATUS_STYLES[status.status];
                    const isExpanded = expandedControl === control.id;

                    return (
                      <div key={control.id} className={`${status.status === 'non-compliant' ? 'bg-rose-50/30' : ''}`}>
                        <button
                          onClick={() => setExpandedControl(isExpanded ? null : control.id)}
                          className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-50/50 transition-colors"
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${statusStyle.bg} border ${statusStyle.border}`}>
                            <Icon name={statusStyle.icon as any} className={`w-3.5 h-3.5 ${statusStyle.text}`} strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800">{control.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                                {statusStyle.label}
                              </span>
                              {status.findingCount > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {status.findingCount} finding{status.findingCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{control.description}</p>
                          </div>
                          <Icon
                            name="chevron-down"
                            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                            <div className="mt-3 space-y-3">
                              {/* Remediation Guidance */}
                              {(status.status === 'non-compliant' || status.status === 'partial' || status.status === 'not-evaluated') && (
                                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Icon name="light-bulb" className="w-4 h-4 text-blue-600" strokeWidth={2} />
                                    <span className="text-xs font-semibold text-blue-800">Remediation Steps</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                      control.remediation.effort === 'low' ? 'bg-emerald-100 text-emerald-700' :
                                      control.remediation.effort === 'medium' ? 'bg-amber-100 text-amber-700' :
                                      'bg-rose-100 text-rose-700'
                                    }`}>
                                      {control.remediation.effort} effort
                                    </span>
                                    {control.remediation.automatable && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                                        Automatable
                                      </span>
                                    )}
                                  </div>
                                  <ol className="list-decimal list-inside space-y-1 text-xs text-blue-700">
                                    {control.remediation.steps.map((step, idx) => (
                                      <li key={idx}>{step}</li>
                                    ))}
                                  </ol>
                                  {control.consoleLink && (
                                    <a
                                      href={control.consoleLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                      <Icon name="arrow-top-right-on-square" className="w-3.5 h-3.5" />
                                      Open AWS Console
                                    </a>
                                  )}
                                </div>
                              )}

                              {/* Framework Mappings */}
                              {control.frameworkMappings.length > 0 && (
                                <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Icon name="clipboard-document-check" className="w-4 h-4 text-violet-600" strokeWidth={2} />
                                    <span className="text-xs font-semibold text-violet-800">Framework Mappings</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {control.frameworkMappings.map((mapping, idx) => (
                                      <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-white rounded border border-violet-200">
                                        <span className="text-[10px] font-semibold text-violet-700">{mapping.framework}</span>
                                        <span className="text-[9px] text-violet-500">
                                          {mapping.controls.join(', ')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Framework Compliance Mapping View */
        <div className="space-y-4">
          {frameworkCompliance.map(fw => {
            const isExpanded = expandedFramework === fw.framework;
            const fwCompliancePct = fw.mappedControls > 0
              ? Math.round((fw.compliantControls / fw.mappedControls) * 100)
              : 0;

            return (
              <div key={fw.framework} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedFramework(isExpanded ? null : fw.framework)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: fw.color }} />
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{fw.framework}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {fw.mappedControls}/{fw.totalControls} controls mapped
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-xs">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${fwCompliancePct}%`, backgroundColor: fw.color }}
                        />
                      </div>
                      <span className="text-xs font-medium" style={{ color: fw.color }}>
                        {fwCompliancePct}% compliant
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-600 font-medium">{fw.compliantControls} pass</span>
                    <span className="text-xs text-slate-400">/</span>
                    <span className="text-xs text-slate-600">{fw.mappedControls} mapped</span>
                    <Icon
                      name="chevron-down"
                      className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    <div className="mt-3 space-y-3">
                      {fw.categories.map(cat => (
                        <div key={cat.name} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="text-xs font-semibold text-slate-700 mb-2">{cat.name}</div>
                          <div className="space-y-1.5">
                            {cat.controls.map(ctrl => {
                              const statusStyle = CONTROL_STATUS_STYLES[ctrl.status];
                              return (
                                <div key={ctrl.id} className="flex items-center gap-2 text-xs">
                                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${statusStyle.bg} border ${statusStyle.border}`}>
                                    <Icon name={statusStyle.icon as any} className={`w-3 h-3 ${statusStyle.text}`} strokeWidth={2} />
                                  </div>
                                  <span className="font-mono text-slate-600">{ctrl.id}</span>
                                  <span className="text-slate-700">{ctrl.name}</span>
                                  {ctrl.linkedSecurityControl && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewMode('controls');
                                        setExpandedControl(ctrl.linkedSecurityControl!);
                                      }}
                                      className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200 transition-colors"
                                    >
                                      View Control
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Link to full framework views */}
          <div className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-xl border border-violet-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <Icon name="document-magnifying-glass" className="w-5 h-5 text-violet-600" strokeWidth={2} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-violet-900 mb-1">Explore Full Framework Coverage</h4>
                <p className="text-xs text-violet-700 mb-3">
                  This panel shows AI security controls mapped to compliance frameworks.
                  For complete framework coverage including all controls, visit the dedicated framework views.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/govern/compliance?tab=frameworks"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    <Icon name="clipboard-document-list" className="w-3.5 h-3.5" />
                    All Frameworks
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
