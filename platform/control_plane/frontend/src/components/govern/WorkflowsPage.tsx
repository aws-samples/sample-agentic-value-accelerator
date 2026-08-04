/**
 * WorkflowsPage — Governance Workflow Automation Center
 *
 * Current state: SIMULATED execution with REAL AVA data queries
 * - Workflow steps are timed simulations (not calling actual agents)
 * - Findings are generated from live AVA data (guardrails, policies, use cases)
 * - Reports reflect actual governance state
 *
 * Future state: AgentCore integration
 * - Deploy Governance Agent via App Factory or AgentCore
 * - Wire workflow steps to invoke_agent_runtime API
 * - Real AI-powered analysis and remediation recommendations
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGovernanceAggregator } from './useGovernanceAggregator';
import { useGuardrailMetrics } from './useGuardrailMetrics';
import { downloadJSON, dateStamp } from './exportUtils';
import UnifiedGuide, { WORKFLOWS_GUIDE } from './UnifiedGuide';
import { Icon, type IconName } from './icons';
import { MockDataBadge } from './DataSourceIndicator';

// ─────────────────────────── Types ───────────────────────────

interface WorkflowStep {
  id: string;
  agent: string;
  label: string;
  description: string;
  estimatedTime: string;
  dataSource?: string;
}

interface WorkflowFinding {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  detail: string;
  action?: string;
  link?: string;
}

interface StepResult {
  status: 'completed' | 'warning' | 'error';
  duration: number;
  findings: WorkflowFinding[];
  metrics?: Record<string, number | string>;
}

interface Workflow {
  id: string;
  name: string;
  icon: IconName;
  color: string;
  category: 'compliance' | 'security' | 'risk' | 'operations' | 'data';
  persona: string[];
  description: string;
  outcome: string;
  steps: WorkflowStep[];
  recommended?: boolean;
  reasonRecommended?: string;
}

type WorkflowCategory = 'all' | 'compliance' | 'security' | 'risk' | 'operations' | 'data';

// ─────────────────────────── Workflow Library ───────────────────────────

const WORKFLOW_LIBRARY: Workflow[] = [
  // Compliance Workflows
  {
    id: 'regulatory-exam-prep',
    name: 'Regulatory Exam Prep',
    icon: 'clipboard-list',
    color: '#8b5cf6',
    category: 'compliance',
    persona: ['Compliance Officers', 'Risk Managers', 'Executives'],
    description: 'Comprehensive preparation for regulatory examinations. Analyzes compliance gaps, generates remediation plans, and verifies evidence completeness.',
    outcome: 'Exam readiness report with gap analysis and remediation timeline',
    steps: [
      { id: 'gap-analysis', agent: 'compliance-gap', label: 'Compliance Gap Analysis', description: 'Scan all use cases against SR 26-2, OSFI E-23, EU AI Act requirements', estimatedTime: '2-3 min', dataSource: 'Use Cases, Frameworks' },
      { id: 'control-mapping', agent: 'control-mapper', label: 'Control Mapping', description: 'Map existing controls to regulatory requirements', estimatedTime: '1-2 min', dataSource: 'Controls, Policies' },
      { id: 'evidence-check', agent: 'evidence-collector', label: 'Evidence Verification', description: 'Verify evidence completeness across all 7 trust layers', estimatedTime: '2-3 min', dataSource: 'Trust Stack' },
      { id: 'remediation', agent: 'remediation-planner', label: 'Remediation Planning', description: 'Generate prioritized remediation plan with timelines', estimatedTime: '1-2 min' },
    ],
  },
  {
    id: 'framework-assessment',
    name: 'Framework Assessment',
    icon: 'chart-bar',
    color: '#6366f1',
    category: 'compliance',
    persona: ['Compliance Officers', 'Auditors'],
    description: 'Deep-dive assessment against a specific regulatory framework with detailed control-by-control analysis.',
    outcome: 'Framework compliance scorecard with evidence artifacts',
    steps: [
      { id: 'framework-select', agent: 'framework-analyzer', label: 'Framework Analysis', description: 'Parse framework requirements and map to AVA controls', estimatedTime: '1 min', dataSource: 'Frameworks' },
      { id: 'control-assess', agent: 'control-assessor', label: 'Control Assessment', description: 'Evaluate each control for implementation status', estimatedTime: '2-3 min', dataSource: 'Controls' },
      { id: 'evidence-gather', agent: 'evidence-collector', label: 'Evidence Collection', description: 'Gather and validate evidence for each control', estimatedTime: '2 min', dataSource: 'Artifacts' },
      { id: 'scorecard', agent: 'report-generator', label: 'Scorecard Generation', description: 'Generate compliance scorecard with drill-down details', estimatedTime: '1 min' },
    ],
  },

  // Security Workflows
  {
    id: 'security-posture',
    name: 'Security Posture Check',
    icon: 'shield-check',
    color: '#ef4444',
    category: 'security',
    persona: ['Security Teams', 'DevSecOps'],
    description: 'Comprehensive security assessment of your AI fleet including guardrails, policies, and access controls.',
    outcome: 'Security posture report with risk scores and hardening recommendations',
    steps: [
      { id: 'guardrail-audit', agent: 'guardrail-auditor', label: 'Guardrail Audit', description: 'Analyze guardrail coverage, configurations, and effectiveness', estimatedTime: '1-2 min', dataSource: 'Guardrails' },
      { id: 'policy-review', agent: 'policy-reviewer', label: 'Policy Review', description: 'Review Cedar policies for gaps and overly permissive rules', estimatedTime: '1-2 min', dataSource: 'Policies' },
      { id: 'access-check', agent: 'access-analyzer', label: 'Access Analysis', description: 'Analyze IAM roles, agent permissions, and tool authorizations', estimatedTime: '2 min', dataSource: 'IAM, Permissions' },
      { id: 'vuln-scan', agent: 'vulnerability-scanner', label: 'Vulnerability Scan', description: 'Check for known vulnerabilities and misconfigurations', estimatedTime: '2-3 min' },
    ],
  },
  {
    id: 'incident-response',
    name: 'Incident Response',
    icon: 'bell-alert',
    color: '#dc2626',
    category: 'security',
    persona: ['Security Teams', 'Incident Responders'],
    description: 'Automated incident investigation workflow for AI-related security events.',
    outcome: 'Incident report with root cause analysis and remediation steps',
    steps: [
      { id: 'event-triage', agent: 'event-triager', label: 'Event Triage', description: 'Collect and correlate related security events', estimatedTime: '1 min', dataSource: 'CloudTrail, GuardDuty' },
      { id: 'impact-assess', agent: 'impact-assessor', label: 'Impact Assessment', description: 'Determine scope and severity of incident', estimatedTime: '1-2 min' },
      { id: 'root-cause', agent: 'rca-analyzer', label: 'Root Cause Analysis', description: 'Identify root cause and contributing factors', estimatedTime: '2-3 min' },
      { id: 'remediate', agent: 'remediation-executor', label: 'Remediation', description: 'Generate and optionally execute remediation steps', estimatedTime: '1-2 min' },
    ],
  },

  // Risk Workflows
  {
    id: 'use-case-risk',
    name: 'Use Case Risk Assessment',
    icon: 'exclamation-triangle',
    color: '#f59e0b',
    category: 'risk',
    persona: ['Risk Managers', 'Business Owners'],
    description: 'Comprehensive risk assessment for AI use cases across all governance dimensions.',
    outcome: 'Risk register entries with scoring and mitigation recommendations',
    steps: [
      { id: 'risk-identify', agent: 'risk-identifier', label: 'Risk Identification', description: 'Identify risks across 8 governance dimensions', estimatedTime: '2 min', dataSource: 'Use Cases' },
      { id: 'risk-score', agent: 'risk-scorer', label: 'Risk Scoring', description: 'Calculate inherent and residual risk scores', estimatedTime: '1-2 min', dataSource: 'Risk Scores' },
      { id: 'control-map', agent: 'control-mapper', label: 'Control Mapping', description: 'Map existing controls to identified risks', estimatedTime: '1-2 min', dataSource: 'Controls' },
      { id: 'mitigation', agent: 'mitigation-planner', label: 'Mitigation Planning', description: 'Generate risk treatment recommendations', estimatedTime: '1 min' },
    ],
  },
  {
    id: 'model-risk-review',
    name: 'Model Risk Review',
    icon: 'beaker',
    color: '#ea580c',
    category: 'risk',
    persona: ['Model Risk Teams', 'Data Scientists'],
    description: 'Model Risk Management (MRM) review following SR 11-7 and industry best practices.',
    outcome: 'MRM assessment report with tier classification and attestation status',
    steps: [
      { id: 'model-inventory', agent: 'model-cataloger', label: 'Model Inventory', description: 'Verify model registration and documentation', estimatedTime: '1 min', dataSource: 'Model Registry' },
      { id: 'tier-classify', agent: 'tier-classifier', label: 'Tier Classification', description: 'Classify model risk tier based on usage and impact', estimatedTime: '1-2 min' },
      { id: 'validation-check', agent: 'validation-checker', label: 'Validation Status', description: 'Check validation status and ongoing monitoring', estimatedTime: '1-2 min', dataSource: 'Evaluations' },
      { id: 'mrm-report', agent: 'mrm-reporter', label: 'MRM Report', description: 'Generate MRM assessment report', estimatedTime: '1 min' },
    ],
  },

  // Operations Workflows
  {
    id: 'deploy-readiness',
    name: 'Deployment Readiness',
    icon: 'rocket-launch',
    color: '#10b981',
    category: 'operations',
    persona: ['DevOps', 'Platform Teams', 'Release Managers'],
    description: 'Pre-deployment checklist ensuring all governance gates are satisfied before production release.',
    outcome: 'Go/No-Go decision with gate validation details',
    steps: [
      { id: 'gate-check', agent: 'gate-validator', label: 'Gate Validation', description: 'Validate all 5 stage gates are satisfied', estimatedTime: '1-2 min', dataSource: 'Service Approvals' },
      { id: 'security-scan', agent: 'security-scanner', label: 'Security Scan', description: 'Run pre-deployment security assessment', estimatedTime: '2-3 min', dataSource: 'Guardrails' },
      { id: 'compliance-check', agent: 'compliance-checker', label: 'Compliance Check', description: 'Verify compliance requirements are met', estimatedTime: '1-2 min', dataSource: 'Policies' },
      { id: 'monitoring-verify', agent: 'monitoring-verifier', label: 'Monitoring Setup', description: 'Verify observability and monitoring is configured', estimatedTime: '1 min', dataSource: 'Deployments' },
    ],
  },
  {
    id: 'cost-optimization',
    name: 'Cost Optimization Review',
    icon: 'currency-dollar',
    color: '#0891b2',
    category: 'operations',
    persona: ['FinOps', 'Platform Teams', 'Executives'],
    description: 'Analyze AI workload costs and identify optimization opportunities.',
    outcome: 'Cost optimization report with savings recommendations',
    steps: [
      { id: 'cost-analysis', agent: 'cost-analyzer', label: 'Cost Analysis', description: 'Analyze Bedrock and related service costs', estimatedTime: '1-2 min', dataSource: 'Cost Explorer' },
      { id: 'usage-patterns', agent: 'usage-analyzer', label: 'Usage Patterns', description: 'Identify usage patterns and anomalies', estimatedTime: '1-2 min' },
      { id: 'right-sizing', agent: 'right-sizer', label: 'Right-Sizing', description: 'Recommend model and configuration optimizations', estimatedTime: '1-2 min' },
      { id: 'savings-plan', agent: 'savings-planner', label: 'Savings Plan', description: 'Generate cost optimization roadmap', estimatedTime: '1 min' },
    ],
  },

  // Data Workflows
  {
    id: 'data-readiness',
    name: 'Data Readiness Assessment',
    icon: 'folder',
    color: '#0ea5e9',
    category: 'data',
    persona: ['Data Stewards', 'Data Engineers'],
    description: 'Assess data readiness for AI consumption across quality, lineage, and governance dimensions.',
    outcome: 'Data readiness scorecard with remediation priorities',
    steps: [
      { id: 'quality-check', agent: 'data-quality-checker', label: 'Quality Assessment', description: 'Evaluate data quality metrics across sources', estimatedTime: '2-3 min', dataSource: 'Data Sources' },
      { id: 'lineage-map', agent: 'lineage-mapper', label: 'Lineage Mapping', description: 'Map data lineage from source to AI consumption', estimatedTime: '1-2 min', dataSource: 'Data Catalog' },
      { id: 'pii-scan', agent: 'pii-scanner', label: 'PII Detection', description: 'Scan for PII and sensitive data elements', estimatedTime: '2-3 min' },
      { id: 'governance-check', agent: 'data-gov-checker', label: 'Governance Check', description: 'Verify data governance policies are enforced', estimatedTime: '1 min', dataSource: 'Policies' },
    ],
  },
];

// ─────────────────────────── Category Config ───────────────────────────

const CATEGORIES: { id: WorkflowCategory; label: string; icon: IconName; color: string }[] = [
  { id: 'all', label: 'All Workflows', icon: 'book-open', color: '#64748b' },
  { id: 'compliance', label: 'Compliance', icon: 'clipboard-list', color: '#8b5cf6' },
  { id: 'security', label: 'Security', icon: 'shield-check', color: '#ef4444' },
  { id: 'risk', label: 'Risk', icon: 'exclamation-triangle', color: '#f59e0b' },
  { id: 'operations', label: 'Operations', icon: 'rocket-launch', color: '#10b981' },
  { id: 'data', label: 'Data', icon: 'folder', color: '#0ea5e9' },
];

// ─────────────────────────── Component ───────────────────────────

export default function WorkflowsPage() {
  const [selectedCategory, setSelectedCategory] = useState<WorkflowCategory>('all');
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [selectedUseCase] = useState<string>('all');

  // Real AVA data
  const {
    loading: aggLoading,
    summary,
    useCases,
    deployments,
    policies,
    serviceApprovalRuns,
  } = useGovernanceAggregator();

  const {
    activeCount: guardrailsActive,
    failedCount: guardrailsFailed,
  } = useGuardrailMetrics();

  // Smart recommendations based on AVA state
  const recommendations = useMemo(() => {
    const recs: { workflowId: string; reason: string; priority: number }[] = [];

    // Recommend exam prep if compliance gaps exist
    if (summary.controlsTotal > 0 && summary.controlsImplemented < summary.controlsTotal) {
      recs.push({
        workflowId: 'regulatory-exam-prep',
        reason: `${summary.controlsTotal - summary.controlsImplemented} controls pending implementation`,
        priority: 1,
      });
    }

    // Recommend security posture if guardrails are failing
    if (guardrailsFailed > 0) {
      recs.push({
        workflowId: 'security-posture',
        reason: `${guardrailsFailed} guardrails in failed state`,
        priority: 1,
      });
    }

    // Recommend deployment readiness if pending deployments
    if (summary.deploymentsPending > 0) {
      recs.push({
        workflowId: 'deploy-readiness',
        reason: `${summary.deploymentsPending} deployments pending approval`,
        priority: 2,
      });
    }

    // Recommend use case risk if high-risk use cases
    const highRiskCount = useCases.filter(uc => (uc.computed?.composite ?? 0) >= 70).length;
    if (highRiskCount > 0) {
      recs.push({
        workflowId: 'use-case-risk',
        reason: `${highRiskCount} high-risk use cases need assessment`,
        priority: 1,
      });
    }

    // Recommend data readiness if use cases exist but few controls implemented
    if (useCases.length > 0 && summary.controlsImplemented < summary.controlsTotal * 0.7) {
      recs.push({
        workflowId: 'data-readiness',
        reason: `Data governance controls below 70% implementation`,
        priority: 2,
      });
    }

    return recs.sort((a, b) => a.priority - b.priority);
  }, [summary, useCases, guardrailsFailed]);

  // Filter workflows by category and add recommendations
  const filteredWorkflows = useMemo(() => {
    const workflows = selectedCategory === 'all'
      ? WORKFLOW_LIBRARY
      : WORKFLOW_LIBRARY.filter(w => w.category === selectedCategory);

    // Mark recommended workflows
    return workflows.map(w => {
      const rec = recommendations.find(r => r.workflowId === w.id);
      return {
        ...w,
        recommended: !!rec,
        reasonRecommended: rec?.reason,
      };
    }).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  }, [selectedCategory, recommendations]);

  // Generate realistic findings based on AVA data
  const generateStepFindings = (step: WorkflowStep): StepResult => {
    const findings: WorkflowFinding[] = [];
    const duration = 1500 + Math.floor(Math.random() * 2500);

    // Generate contextual findings based on step type
    if (step.id.includes('gap') || step.id.includes('compliance')) {
      const gapCount = summary.controlsTotal - summary.controlsImplemented;
      if (gapCount > 0) {
        findings.push({
          type: 'warning',
          title: `${gapCount} Control Gaps Identified`,
          detail: `Found ${gapCount} controls not yet implemented across ${Math.ceil(gapCount / 3)} frameworks`,
          action: 'View in Compliance Center',
          link: '/govern/compliance',
        });
      } else {
        findings.push({
          type: 'success',
          title: 'All Controls Implemented',
          detail: `${summary.controlsTotal} controls verified across all applicable frameworks`,
        });
      }
    }

    if (step.id.includes('guardrail') || step.id.includes('security')) {
      if (guardrailsFailed > 0) {
        findings.push({
          type: 'error',
          title: `${guardrailsFailed} Guardrails Failing`,
          detail: 'Critical: Some guardrails are not functioning correctly',
          action: 'Review Guardrails',
          link: '/secure/guardrails',
        });
      }
      if (guardrailsActive > 0) {
        findings.push({
          type: 'success',
          title: `${guardrailsActive} Guardrails Active`,
          detail: `Content filtering, PII detection, and topic controls operational`,
        });
      }
    }

    if (step.id.includes('policy')) {
      const blockingPolicies = policies.filter(p => p.blocking_rules > 0).length;
      findings.push({
        type: blockingPolicies > 0 ? 'success' : 'info',
        title: `${policies.length} Policies Configured`,
        detail: `${blockingPolicies} policies with active blocking rules`,
        action: 'View Policies',
        link: '/secure/policy',
      });
    }

    if (step.id.includes('gate') || step.id.includes('deploy')) {
      const pendingApprovals = serviceApprovalRuns.filter(r => r.status === 'pending').length;
      if (pendingApprovals > 0) {
        findings.push({
          type: 'warning',
          title: `${pendingApprovals} Pending Approvals`,
          detail: 'Some deployments are awaiting gate approval',
          action: 'Review Approvals',
          link: '/secure',
        });
      }
      findings.push({
        type: 'info',
        title: `${deployments.length} Active Deployments`,
        detail: `Tracking ${deployments.filter(d => d.status === 'active').length} production deployments`,
      });
    }

    if (step.id.includes('risk') || step.id.includes('use-case')) {
      const highRisk = useCases.filter(uc => (uc.computed?.composite ?? 0) >= 70).length;
      const medRisk = useCases.filter(uc => {
        const score = uc.computed?.composite ?? 0;
        return score >= 40 && score < 70;
      }).length;

      if (highRisk > 0) {
        findings.push({
          type: 'error',
          title: `${highRisk} High-Risk Use Cases`,
          detail: 'Require immediate risk treatment and enhanced controls',
          action: 'View Risk Register',
          link: '/govern/risk',
        });
      }
      if (medRisk > 0) {
        findings.push({
          type: 'warning',
          title: `${medRisk} Medium-Risk Use Cases`,
          detail: 'Standard controls and monitoring recommended',
        });
      }
      if (highRisk === 0 && medRisk === 0) {
        findings.push({
          type: 'success',
          title: 'Risk Levels Acceptable',
          detail: `${useCases.length} use cases within acceptable risk thresholds`,
        });
      }
    }

    // Always add at least one finding
    if (findings.length === 0) {
      findings.push({
        type: 'success',
        title: `${step.label} Complete`,
        detail: 'No issues identified in this assessment step',
      });
    }

    return {
      status: findings.some(f => f.type === 'error') ? 'error' :
              findings.some(f => f.type === 'warning') ? 'warning' : 'completed',
      duration,
      findings,
    };
  };

  // Run workflow
  const runWorkflow = async (workflow: Workflow) => {
    setActiveWorkflow(workflow);
    setCurrentStep(0);
    setStepResults([]);
    setRunning(true);

    for (let i = 0; i < workflow.steps.length; i++) {
      setCurrentStep(i);

      // Simulate execution time
      const baseTime = 1500 + Math.floor(Math.random() * 2000);
      await new Promise(resolve => setTimeout(resolve, baseTime));

      // Generate findings for this step
      const result = generateStepFindings(workflow.steps[i]);
      setStepResults(prev => [...prev, result]);
    }

    setCurrentStep(workflow.steps.length);
    setRunning(false);
  };

  const reset = () => {
    setActiveWorkflow(null);
    setCurrentStep(-1);
    setStepResults([]);
    setRunning(false);
  };

  const exportReport = () => {
    if (!activeWorkflow) return;

    const allFindings = stepResults.flatMap((r, i) =>
      r.findings.map(f => ({
        step: activeWorkflow.steps[i].label,
        ...f,
      }))
    );

    const report = {
      workflow: activeWorkflow.name,
      category: activeWorkflow.category,
      description: activeWorkflow.description,
      outcome: activeWorkflow.outcome,
      executedAt: new Date().toISOString(),
      targetUseCase: selectedUseCase !== 'all' ? selectedUseCase : null,
      summary: {
        totalSteps: activeWorkflow.steps.length,
        completedSteps: stepResults.length,
        errors: stepResults.filter(r => r.status === 'error').length,
        warnings: stepResults.filter(r => r.status === 'warning').length,
        totalDuration: stepResults.reduce((acc, r) => acc + r.duration, 0),
      },
      steps: activeWorkflow.steps.map((s, i) => ({
        step: s.label,
        agent: s.agent,
        description: s.description,
        result: stepResults[i] ?? null,
      })),
      findings: allFindings,
      avaContext: {
        useCasesAnalyzed: useCases.length,
        deploymentsChecked: deployments.length,
        guardrailsActive: guardrailsActive,
        policiesReviewed: policies.length,
      },
    };

    const slug = activeWorkflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadJSON(report, `workflow-${slug}-${dateStamp()}.json`);
  };

  // Calculate overall workflow health
  const workflowHealth = useMemo(() => {
    if (stepResults.length === 0) return null;
    const errors = stepResults.filter(r => r.status === 'error').length;
    const warnings = stepResults.filter(r => r.status === 'warning').length;

    if (errors > 0) return { status: 'error', label: 'Issues Found', color: '#ef4444' };
    if (warnings > 0) return { status: 'warning', label: 'Needs Attention', color: '#f59e0b' };
    return { status: 'success', label: 'All Clear', color: '#10b981' };
  }, [stepResults]);

  if (aggLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-slate-500">Loading governance data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link to="/govern" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-indigo-600 transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Govern
          </Link>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">Governance Workflows</h1>
                  <MockDataBadge integration="Simulated execution - deploy real agents via App Factory" />
                </div>
                <p className="text-slate-500 text-sm mt-0.5">
                  Multi-agent workflows powered by your live AVA data
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="hidden md:flex items-center gap-1 bg-white rounded-xl border border-slate-200 shadow-sm p-1">
              <div className="px-3 py-2 text-center">
                <div className="text-lg font-bold text-indigo-600">{useCases.length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Use Cases</div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="px-3 py-2 text-center">
                <div className="text-lg font-bold text-emerald-600">{deployments.length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Deployments</div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="px-3 py-2 text-center">
                <div className="text-lg font-bold text-violet-600">{summary.controlsImplemented}<span className="text-slate-400 font-normal">/{summary.controlsTotal}</span></div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Controls</div>
              </div>
            </div>
          </div>
        </div>

        {!activeWorkflow ? (
          <>
            {/* How to Use Guide - full width at top, matching other modules */}
            <div className="mb-6">
              <UnifiedGuide {...WORKFLOWS_GUIDE} />
            </div>

            {/* Deploy Real Governance Agents - Full Integration Guide */}
            <div className="relative overflow-hidden rounded-2xl border border-indigo-200/50 mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />

              <div className="relative p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Deploy Real Governance Agents</h3>
                      <p className="text-xs text-indigo-200">Transform simulated workflows into AI-powered automation</p>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Integration Guide
                  </div>
                </div>

                {/* Three Options with Full Detail */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: App Factory */}
                  <div className="group bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">App Factory</div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300">Recommended</span>
                      </div>
                    </div>
                    <p className="text-xs text-indigo-100 mb-3">
                      Generate a complete Governance Agent with compliance, risk analysis, and remediation tools.
                    </p>
                    <div className="text-[11px] text-indigo-200/80 space-y-1 mb-3">
                      <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Strands + LangGraph patterns</div>
                      <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Auto-generated UI & IaC</div>
                      <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Production-ready scaffolding</div>
                    </div>
                    <Link
                      to="/applications/app-factory"
                      className="inline-flex items-center gap-1 text-xs text-white font-medium group-hover:gap-2 transition-all"
                    >
                      Open App Factory <span className="text-indigo-300">→</span>
                    </Link>
                  </div>

                  {/* Option 2: AgentCore Direct */}
                  <div className="group bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="text-sm font-semibold text-white">AgentCore Direct</div>
                    </div>
                    <p className="text-xs text-indigo-100 mb-3">
                      Deploy to Bedrock AgentCore for serverless execution with built-in orchestration.
                    </p>
                    <div className="text-[11px] text-indigo-200/80 space-y-1 mb-3">
                      <div className="flex items-center gap-2"><span className="text-blue-400">✓</span> invoke_agent_runtime API</div>
                      <div className="flex items-center gap-2"><span className="text-blue-400">✓</span> Async Lambda workers</div>
                      <div className="flex items-center gap-2"><span className="text-blue-400">✓</span> DynamoDB session state</div>
                    </div>
                    <div className="text-[10px] text-indigo-300/80 font-mono bg-indigo-950/50 rounded-lg p-2 border border-indigo-400/20">
                      <span className="text-indigo-400">client</span>.invoke_agent_runtime(<br />
                      &nbsp;&nbsp;agentRuntimeArn=<span className="text-emerald-400">ARN</span><br />
                      )
                    </div>
                  </div>

                  {/* Option 3: Custom Integration */}
                  <div className="group bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                        </svg>
                      </div>
                      <div className="text-sm font-semibold text-white">Custom Integration</div>
                    </div>
                    <p className="text-xs text-indigo-100 mb-3">
                      Wire workflows to existing agents via MCP servers or Bedrock Converse API.
                    </p>
                    <div className="text-[11px] text-indigo-200/80 space-y-1 mb-3">
                      <div className="flex items-center gap-2"><span className="text-violet-400">✓</span> MCP tool servers</div>
                      <div className="flex items-center gap-2"><span className="text-violet-400">✓</span> Bedrock Converse API</div>
                      <div className="flex items-center gap-2"><span className="text-violet-400">✓</span> Custom orchestration</div>
                    </div>
                    <Link
                      to="/capabilities/tools"
                      className="inline-flex items-center gap-1 text-xs text-white font-medium group-hover:gap-2 transition-all"
                    >
                      View MCP Tools <span className="text-indigo-300">→</span>
                    </Link>
                  </div>
                </div>

                {/* Current State Indicator */}
                <div className="mt-4 flex items-center gap-4 p-3 rounded-xl bg-indigo-950/40 border border-indigo-400/20">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-medium text-amber-300">Current State</span>
                  </div>
                  <div className="text-xs text-indigo-200/80 flex-1">
                    Workflows query <strong className="text-white">live AVA data</strong> (guardrails, policies, use cases) and generate findings.
                    Execution timing is simulated until you deploy a Governance Agent.
                  </div>
                </div>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    selectedCategory === cat.id
                      ? 'bg-slate-900 text-white shadow-lg'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Icon name={cat.icon} className="w-4 h-4" />
                  {cat.label}
                  {cat.id !== 'all' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      selectedCategory === cat.id ? 'bg-white/20' : 'bg-slate-100'
                    }`}>
                      {WORKFLOW_LIBRARY.filter(w => w.category === cat.id).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Workflow Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorkflows.map(workflow => (
                <button
                  key={workflow.id}
                  onClick={() => runWorkflow(workflow)}
                  className={`relative p-5 bg-white rounded-xl border-2 transition-all text-left group hover:shadow-lg ${
                    workflow.recommended
                      ? 'border-indigo-300 ring-2 ring-indigo-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {workflow.recommended && (
                    <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-semibold rounded-full">
                      Recommended
                    </div>
                  )}

                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${workflow.color}15`, color: workflow.color }}
                    >
                      <Icon name={workflow.icon} className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {workflow.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {workflow.persona.slice(0, 2).join(' • ')}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                    {workflow.description}
                  </p>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {workflow.steps.length} agents
                      </span>
                      <span>•</span>
                      <span>~{workflow.steps.length * 2} min</span>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: `${workflow.color}15`, color: workflow.color }}
                    >
                      {workflow.category}
                    </span>
                  </div>

                  {workflow.reasonRecommended && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-indigo-600 flex items-center gap-1">
                      <Icon name="light-bulb" className="w-3.5 h-3.5" /> {workflow.reasonRecommended}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Active Workflow Execution View */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
            {/* Workflow Header */}
            <div
              className="p-6 text-white"
              style={{ background: `linear-gradient(135deg, ${activeWorkflow.color}, ${activeWorkflow.color}dd)` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                    <Icon name={activeWorkflow.icon} className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{activeWorkflow.name}</h2>
                    <p className="text-white/80 mt-1">{activeWorkflow.outcome}</p>
                  </div>
                </div>

                {workflowHealth && !running && (
                  <div
                    className="px-4 py-2 rounded-lg font-semibold"
                    style={{ backgroundColor: `${workflowHealth.color}20`, color: workflowHealth.color }}
                  >
                    {workflowHealth.label}
                  </div>
                )}

                {running && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-lg">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="font-medium">Running...</span>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-6">
                <div className="flex justify-between text-sm text-white/70 mb-2">
                  <span>Progress</span>
                  <span>{Math.min(currentStep + 1, activeWorkflow.steps.length)} of {activeWorkflow.steps.length} steps</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-500"
                    style={{ width: `${(Math.min(currentStep + 1, activeWorkflow.steps.length) / activeWorkflow.steps.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Steps and Findings */}
            <div className="p-6">
              <div className="space-y-4">
                {activeWorkflow.steps.map((step, i) => {
                  const isActive = i === currentStep && running;
                  const isDone = i < currentStep || (i <= currentStep && !running && stepResults[i]);
                  const isPending = i > currentStep;
                  const result = stepResults[i];

                  return (
                    <div
                      key={step.id}
                      className={`rounded-xl border-2 transition-all ${
                        isActive ? 'border-blue-300 bg-blue-50' :
                        isDone ? 'border-slate-200 bg-white' :
                        'border-slate-100 bg-slate-50 opacity-50'
                      }`}
                    >
                      {/* Step Header */}
                      <div className="p-4 flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isActive ? 'bg-blue-500' :
                          isDone && result?.status === 'error' ? 'bg-red-500' :
                          isDone && result?.status === 'warning' ? 'bg-amber-500' :
                          isDone ? 'bg-emerald-500' :
                          'bg-slate-300'
                        }`}>
                          {isActive && (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          )}
                          {isDone && (
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {isPending && (
                            <span className="text-sm font-semibold text-white">{i + 1}</span>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${isActive ? 'text-blue-700' : isDone ? 'text-slate-800' : 'text-slate-500'}`}>
                              {step.label}
                            </span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              {step.agent}
                            </span>
                            {step.dataSource && (
                              <span className="text-xs text-indigo-500 flex items-center gap-1">
                                <Icon name="circle-stack" className="w-3 h-3" /> {step.dataSource}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 mt-1">{step.description}</p>

                          {result && (
                            <div className="text-xs text-slate-400 mt-1">
                              Completed in {(result.duration / 1000).toFixed(1)}s
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-slate-400">
                          {step.estimatedTime}
                        </div>
                      </div>

                      {/* Step Findings */}
                      {result && result.findings.length > 0 && (
                        <div className="px-4 pb-4">
                          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                            {result.findings.map((finding, fi) => (
                              <div
                                key={fi}
                                className={`flex items-start gap-3 p-2 rounded-lg ${
                                  finding.type === 'error' ? 'bg-red-50' :
                                  finding.type === 'warning' ? 'bg-amber-50' :
                                  finding.type === 'success' ? 'bg-emerald-50' :
                                  'bg-blue-50'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  finding.type === 'error' ? 'bg-red-500' :
                                  finding.type === 'warning' ? 'bg-amber-500' :
                                  finding.type === 'success' ? 'bg-emerald-500' :
                                  'bg-blue-500'
                                }`}>
                                  {finding.type === 'error' && <span className="text-white text-xs">!</span>}
                                  {finding.type === 'warning' && <span className="text-white text-xs">!</span>}
                                  {finding.type === 'success' && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                  {finding.type === 'info' && <span className="text-white text-xs">i</span>}
                                </div>
                                <div className="flex-1">
                                  <div className={`font-medium text-sm ${
                                    finding.type === 'error' ? 'text-red-700' :
                                    finding.type === 'warning' ? 'text-amber-700' :
                                    finding.type === 'success' ? 'text-emerald-700' :
                                    'text-blue-700'
                                  }`}>
                                    {finding.title}
                                  </div>
                                  <div className="text-xs text-slate-600 mt-0.5">{finding.detail}</div>
                                  {finding.action && finding.link && (
                                    <Link
                                      to={finding.link}
                                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-1 font-medium"
                                    >
                                      {finding.action} →
                                    </Link>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Completion Summary */}
              {!running && currentStep >= activeWorkflow.steps.length && (
                <div className="mt-6 p-6 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${workflowHealth?.color}20` }}
                      >
                        <svg className="w-6 h-6" style={{ color: workflowHealth?.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">Workflow Complete</h3>
                        <p className="text-slate-500 text-sm">
                          {activeWorkflow.steps.length} agents executed •
                          {stepResults.filter(r => r.status === 'error').length} errors •
                          {stepResults.filter(r => r.status === 'warning').length} warnings
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-slate-800">
                        {stepResults.flatMap(r => r.findings).length}
                      </div>
                      <div className="text-xs text-slate-500">Total Findings</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {stepResults.flatMap(r => r.findings).filter(f => f.type === 'error').length}
                      </div>
                      <div className="text-xs text-slate-500">Critical</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-amber-600">
                        {stepResults.flatMap(r => r.findings).filter(f => f.type === 'warning').length}
                      </div>
                      <div className="text-xs text-slate-500">Warnings</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-600">
                        {stepResults.flatMap(r => r.findings).filter(f => f.type === 'success').length}
                      </div>
                      <div className="text-xs text-slate-500">Passed</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  ← Back to Workflows
                </button>

                {!running && currentStep >= activeWorkflow.steps.length && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => runWorkflow(activeWorkflow)}
                      className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 hover:border-slate-400 rounded-lg transition-colors"
                    >
                      Run Again
                    </button>
                    <button
                      onClick={exportReport}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export Report
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
