/**
 * RemediationPlaybooks - Step-by-step remediation guides for control findings
 *
 * Features:
 * - Pre-built playbooks for AI agent control failures
 * - Link playbooks to specific findings
 * - Step-by-step execution tracker
 * - Estimated vs actual time tracking
 * - Automation indicators
 * - Active remediation instances with progress
 * - Export playbook as PDF/Markdown
 */

import { useState, useMemo } from 'react';
import { Icon } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge } from '../DataSourceIndicator';
import CoreBadge from '../CoreBadge';
import Drawer from '../Drawer';

// ============================================================================
// Types
// ============================================================================

type PlaybookSeverity = 'critical' | 'high' | 'medium' | 'low';
type StepStatus = 'pending' | 'in-progress' | 'completed' | 'skipped' | 'blocked';
type InstanceStatus = 'active' | 'completed' | 'paused' | 'blocked' | 'cancelled';

interface PlaybookStep {
  order: number;
  title: string;
  description: string;
  owner: string;
  estimatedMinutes: number;
  automatable: boolean;
  automationScript?: string;
  verificationCriteria?: string;
}

interface RelatedDocument {
  name: string;
  url: string;
  type: 'runbook' | 'policy' | 'wiki' | 'ticket-template';
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  targetControlIds: string[];
  targetControlNames: string[];
  severity: PlaybookSeverity;
  estimatedEffort: number; // hours
  requiredRoles: string[];
  steps: PlaybookStep[];
  prerequisites: string[];
  verificationSteps: string[];
  rollbackProcedure: string;
  relatedDocuments: RelatedDocument[];
  lastUpdated: string;
  version: string;
  usageCount: number;
  avgCompletionTime: number; // hours
}

interface StepExecution {
  stepOrder: number;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  actualMinutes?: number;
  notes?: string;
  assignee?: string;
  blockerReason?: string;
}

interface PlaybookInstance {
  id: string;
  playbookId: string;
  playbookName: string;
  findingId: string;
  findingTitle: string;
  controlId: string;
  controlName: string;
  status: InstanceStatus;
  progress: number; // 0-100
  startedAt: string;
  completedAt?: string;
  dueDate: string;
  owner: string;
  stepExecutions: StepExecution[];
  blockerReason?: string;
  estimatedHours: number;
  actualHours?: number;
}

// ============================================================================
// Mock Data - AI Agent Control Playbooks
// ============================================================================

const MOCK_PLAYBOOKS: Playbook[] = [
  {
    id: 'pb-001',
    name: 'Remediate Guardrail Bypass',
    description: 'Step-by-step guide to address topic restriction bypass findings. Covers pattern analysis, threshold tuning, and validation testing.',
    targetControlIds: ['ctrl-gr-003'],
    targetControlNames: ['Topic Restriction'],
    severity: 'high',
    estimatedEffort: 4,
    requiredRoles: ['Compliance Team', 'ML Ops', 'Security'],
    steps: [
      { order: 1, title: 'Collect Bypass Evidence', description: 'Gather all logged bypass attempts from CloudWatch. Export prompts that evaded restrictions.', owner: 'Security Team', estimatedMinutes: 30, automatable: true, automationScript: 'scripts/collect-bypass-logs.py' },
      { order: 2, title: 'Analyze Bypass Patterns', description: 'Categorize bypass attempts by technique (indirect prompting, encoding, context manipulation).', owner: 'ML Ops', estimatedMinutes: 60, automatable: false },
      { order: 3, title: 'Update Guardrail Patterns', description: 'Add new detection patterns to Bedrock Guardrail configuration for identified techniques.', owner: 'ML Ops', estimatedMinutes: 45, automatable: false, verificationCriteria: 'New patterns block >95% of collected bypass samples' },
      { order: 4, title: 'Tune Detection Thresholds', description: 'Adjust sensitivity thresholds to balance false positives vs. bypasses.', owner: 'ML Ops', estimatedMinutes: 30, automatable: false },
      { order: 5, title: 'Run Regression Tests', description: 'Execute full guardrail test suite to ensure no regressions.', owner: 'QA Team', estimatedMinutes: 45, automatable: true, automationScript: 'scripts/guardrail-regression.sh' },
      { order: 6, title: 'Deploy to Production', description: 'Deploy updated guardrail configuration via CI/CD pipeline.', owner: 'Platform Team', estimatedMinutes: 20, automatable: true },
      { order: 7, title: 'Validate in Production', description: 'Monitor guardrail metrics for 24 hours post-deployment.', owner: 'SRE Team', estimatedMinutes: 30, automatable: false, verificationCriteria: 'No new bypass attempts succeed, false positive rate <5%' },
    ],
    prerequisites: ['Access to CloudWatch Logs', 'Bedrock Guardrail admin permissions', 'CI/CD pipeline access'],
    verificationSteps: ['Retest all collected bypass samples', 'Run automated test suite', 'Confirm metrics in CloudWatch dashboard'],
    rollbackProcedure: 'Revert guardrail configuration to previous version via: aws bedrock update-guardrail --guardrail-id $ID --version previous',
    relatedDocuments: [
      { name: 'Guardrail Configuration Guide', url: '/docs/guardrails', type: 'wiki' },
      { name: 'Topic Restriction Policy', url: '/policies/topic-restriction', type: 'policy' },
    ],
    lastUpdated: '2026-07-15',
    version: '2.1',
    usageCount: 12,
    avgCompletionTime: 3.5,
  },
  {
    id: 'pb-002',
    name: 'Fix Model Drift Alert',
    description: 'Remediation steps for model drift detection control failures. Addresses threshold calibration, baseline refresh, and monitoring gaps.',
    targetControlIds: ['ctrl-pol-002'],
    targetControlNames: ['Model Drift Detection'],
    severity: 'high',
    estimatedEffort: 6,
    requiredRoles: ['ML Ops', 'Data Science', 'Risk Management'],
    steps: [
      { order: 1, title: 'Assess Drift Severity', description: 'Quantify the drift using KL divergence and PSI metrics. Determine if drift is data or concept drift.', owner: 'Data Science', estimatedMinutes: 45, automatable: true, automationScript: 'scripts/drift-analysis.py' },
      { order: 2, title: 'Identify Drift Root Cause', description: 'Analyze input distribution changes, feature drift, and upstream data changes.', owner: 'Data Science', estimatedMinutes: 90, automatable: false },
      { order: 3, title: 'Calibrate Thresholds Per Risk Tier', description: 'Set different drift thresholds for critical/high/medium/low risk agents.', owner: 'ML Ops', estimatedMinutes: 60, automatable: false, verificationCriteria: 'Thresholds documented and approved by Risk' },
      { order: 4, title: 'Refresh Baseline Distribution', description: 'Update baseline with recent representative data if legitimate distribution shift.', owner: 'Data Science', estimatedMinutes: 45, automatable: true },
      { order: 5, title: 'Update Alert Rules', description: 'Configure CloudWatch alarms with new thresholds per agent risk tier.', owner: 'SRE Team', estimatedMinutes: 30, automatable: true, automationScript: 'terraform/drift-alarms.tf' },
      { order: 6, title: 'Test Alert Pipeline', description: 'Inject synthetic drift to validate alert fires correctly.', owner: 'ML Ops', estimatedMinutes: 30, automatable: true },
      { order: 7, title: 'Document Changes', description: 'Update runbook with new thresholds and escalation procedures.', owner: 'ML Ops', estimatedMinutes: 20, automatable: false },
    ],
    prerequisites: ['Access to model metrics', 'CloudWatch admin', 'Risk tier classification for all agents'],
    verificationSteps: ['Synthetic drift triggers alert within SLA', 'No false positives in 7-day monitoring', 'Thresholds approved by Risk'],
    rollbackProcedure: 'Revert CloudWatch alarms to previous thresholds via Terraform state rollback',
    relatedDocuments: [
      { name: 'Model Monitoring Runbook', url: '/runbooks/model-monitoring', type: 'runbook' },
      { name: 'Drift Detection Policy', url: '/policies/model-drift', type: 'policy' },
    ],
    lastUpdated: '2026-08-01',
    version: '1.3',
    usageCount: 8,
    avgCompletionTime: 5.2,
  },
  {
    id: 'pb-003',
    name: 'Resolve PII Exposure Finding',
    description: 'Emergency response playbook for PII detection control failures. Includes containment, assessment, and prevention steps.',
    targetControlIds: ['ctrl-gr-001'],
    targetControlNames: ['PII Detection and Masking'],
    severity: 'critical',
    estimatedEffort: 8,
    requiredRoles: ['Privacy Team', 'Security', 'Legal', 'ML Ops'],
    steps: [
      { order: 1, title: 'Immediate Containment', description: 'If active exposure, disable affected agent or enable stricter guardrail mode.', owner: 'SRE Team', estimatedMinutes: 5, automatable: true, automationScript: 'scripts/emergency-stop.sh' },
      { order: 2, title: 'Assess Exposure Scope', description: 'Identify all instances where PII may have been exposed. Query logs for unmasked patterns.', owner: 'Security Team', estimatedMinutes: 60, automatable: true },
      { order: 3, title: 'Notify Privacy Team', description: 'Escalate to Privacy Officer for breach assessment and regulatory notification determination.', owner: 'Security Team', estimatedMinutes: 15, automatable: false },
      { order: 4, title: 'Collect Evidence', description: 'Preserve all relevant logs and communications for investigation.', owner: 'Security Team', estimatedMinutes: 30, automatable: true },
      { order: 5, title: 'Root Cause Analysis', description: 'Determine why PII detection failed - new pattern, encoding bypass, or config issue.', owner: 'ML Ops', estimatedMinutes: 90, automatable: false },
      { order: 6, title: 'Update Detection Patterns', description: 'Add new PII patterns to guardrail configuration.', owner: 'ML Ops', estimatedMinutes: 45, automatable: false },
      { order: 7, title: 'Validate Fix', description: 'Test updated guardrail against all collected exposure samples.', owner: 'QA Team', estimatedMinutes: 30, automatable: true },
      { order: 8, title: 'Re-enable Agent', description: 'Restore agent to production with enhanced guardrails.', owner: 'SRE Team', estimatedMinutes: 15, automatable: false },
      { order: 9, title: 'Post-Incident Review', description: 'Conduct PIR and document lessons learned.', owner: 'Security Team', estimatedMinutes: 60, automatable: false },
    ],
    prerequisites: ['Emergency access to agent controls', 'Privacy team contact', 'Legal on-call'],
    verificationSteps: ['All exposure samples now blocked', 'No new exposures in 48-hour monitoring', 'PIR completed and filed'],
    rollbackProcedure: 'Keep agent disabled until fix is validated. Do not re-enable without Privacy approval.',
    relatedDocuments: [
      { name: 'PII Incident Response Plan', url: '/runbooks/pii-incident', type: 'runbook' },
      { name: 'Data Breach Notification Policy', url: '/policies/breach-notification', type: 'policy' },
      { name: 'Privacy Incident Ticket Template', url: '/templates/privacy-incident', type: 'ticket-template' },
    ],
    lastUpdated: '2026-07-20',
    version: '3.0',
    usageCount: 3,
    avgCompletionTime: 6.5,
  },
  {
    id: 'pb-004',
    name: 'Address Grounding Validation Gap',
    description: 'Remediation for output grounding validation failures causing hallucination concerns.',
    targetControlIds: ['ctrl-gr-005'],
    targetControlNames: ['Output Grounding Validation'],
    severity: 'medium',
    estimatedEffort: 5,
    requiredRoles: ['ML Ops', 'Content Team', 'QA'],
    steps: [
      { order: 1, title: 'Analyze Ungrounded Outputs', description: 'Collect samples of outputs flagged as ungrounded or that should have been flagged.', owner: 'ML Ops', estimatedMinutes: 45, automatable: true },
      { order: 2, title: 'Review Knowledge Base Coverage', description: 'Identify gaps in knowledge base that led to ungrounded responses.', owner: 'Content Team', estimatedMinutes: 60, automatable: false },
      { order: 3, title: 'Update Knowledge Base', description: 'Add missing content or correct outdated information.', owner: 'Content Team', estimatedMinutes: 90, automatable: false },
      { order: 4, title: 'Tune Grounding Thresholds', description: 'Adjust confidence thresholds for grounding validation.', owner: 'ML Ops', estimatedMinutes: 45, automatable: false },
      { order: 5, title: 'Optimize Retrieval', description: 'Improve RAG retrieval to better match queries to relevant KB content.', owner: 'ML Ops', estimatedMinutes: 60, automatable: false },
      { order: 6, title: 'Run Validation Suite', description: 'Execute grounding validation test suite with updated configuration.', owner: 'QA Team', estimatedMinutes: 45, automatable: true },
    ],
    prerequisites: ['Knowledge base admin access', 'RAG configuration access'],
    verificationSteps: ['Grounding precision >90%', 'False positive rate <10%', 'Latency within SLA'],
    rollbackProcedure: 'Revert knowledge base to previous version and restore original grounding thresholds',
    relatedDocuments: [
      { name: 'RAG Configuration Guide', url: '/docs/rag-config', type: 'wiki' },
      { name: 'Knowledge Base Standards', url: '/policies/kb-standards', type: 'policy' },
    ],
    lastUpdated: '2026-07-28',
    version: '1.5',
    usageCount: 6,
    avgCompletionTime: 4.8,
  },
  {
    id: 'pb-005',
    name: 'Implement Human-in-the-Loop',
    description: 'Guide to add human approval workflows for high-risk agent decisions.',
    targetControlIds: ['ctrl-pol-001'],
    targetControlNames: ['Human-in-the-Loop for High-Value Decisions'],
    severity: 'high',
    estimatedEffort: 12,
    requiredRoles: ['Platform Team', 'Business Owners', 'Risk Management'],
    steps: [
      { order: 1, title: 'Define Decision Thresholds', description: 'Work with business to define monetary/risk thresholds requiring human review.', owner: 'Risk Management', estimatedMinutes: 120, automatable: false },
      { order: 2, title: 'Design Approval Workflow', description: 'Map out approval chain, SLAs, and escalation paths.', owner: 'Platform Team', estimatedMinutes: 90, automatable: false },
      { order: 3, title: 'Implement Workflow Engine', description: 'Configure Step Functions or similar for approval orchestration.', owner: 'Platform Team', estimatedMinutes: 240, automatable: false },
      { order: 4, title: 'Build Approval UI', description: 'Create interface for reviewers to approve/reject with context.', owner: 'Frontend Team', estimatedMinutes: 180, automatable: false },
      { order: 5, title: 'Integrate with Agent', description: 'Add decision interception and workflow trigger to agent code.', owner: 'ML Ops', estimatedMinutes: 120, automatable: false },
      { order: 6, title: 'Configure Notifications', description: 'Set up Slack/email notifications for pending approvals.', owner: 'Platform Team', estimatedMinutes: 45, automatable: true },
      { order: 7, title: 'Test End-to-End', description: 'Run through complete approval scenarios including edge cases.', owner: 'QA Team', estimatedMinutes: 90, automatable: false },
      { order: 8, title: 'Train Reviewers', description: 'Conduct training session for approval queue users.', owner: 'Business Owners', estimatedMinutes: 60, automatable: false },
    ],
    prerequisites: ['Step Functions access', 'Agent codebase access', 'Approved threshold definitions'],
    verificationSteps: ['All decisions above threshold trigger workflow', 'Approvals complete within SLA', 'Audit trail captured'],
    rollbackProcedure: 'Disable workflow trigger in agent config to revert to autonomous mode',
    relatedDocuments: [
      { name: 'HITL Architecture Doc', url: '/docs/hitl-architecture', type: 'wiki' },
      { name: 'Decision Threshold Policy', url: '/policies/decision-thresholds', type: 'policy' },
    ],
    lastUpdated: '2026-06-15',
    version: '2.0',
    usageCount: 4,
    avgCompletionTime: 14.5,
  },
  {
    id: 'pb-006',
    name: 'Rotate Compromised Credentials',
    description: 'Emergency playbook for secrets management control failures.',
    targetControlIds: ['ctrl-plat-004'],
    targetControlNames: ['Secrets Management'],
    severity: 'critical',
    estimatedEffort: 2,
    requiredRoles: ['Security Team', 'SRE', 'Platform Team'],
    steps: [
      { order: 1, title: 'Identify Affected Secrets', description: 'Determine which credentials were potentially compromised.', owner: 'Security Team', estimatedMinutes: 15, automatable: true },
      { order: 2, title: 'Rotate Credentials', description: 'Generate new credentials and update Secrets Manager.', owner: 'Security Team', estimatedMinutes: 20, automatable: true, automationScript: 'scripts/rotate-secrets.sh' },
      { order: 3, title: 'Update Dependent Services', description: 'Trigger secret refresh in all dependent agents/services.', owner: 'SRE Team', estimatedMinutes: 15, automatable: true },
      { order: 4, title: 'Verify Service Health', description: 'Confirm all services reconnected with new credentials.', owner: 'SRE Team', estimatedMinutes: 20, automatable: true },
      { order: 5, title: 'Audit Access Logs', description: 'Review logs for unauthorized access using old credentials.', owner: 'Security Team', estimatedMinutes: 45, automatable: true },
      { order: 6, title: 'File Security Incident', description: 'Document incident and complete security incident report.', owner: 'Security Team', estimatedMinutes: 30, automatable: false },
    ],
    prerequisites: ['Secrets Manager admin access', 'Service deployment permissions'],
    verificationSteps: ['Old credentials invalidated', 'All services healthy with new credentials', 'No unauthorized access detected'],
    rollbackProcedure: 'If new credentials cause issues, restore from Secrets Manager version history',
    relatedDocuments: [
      { name: 'Secrets Rotation Runbook', url: '/runbooks/secrets-rotation', type: 'runbook' },
      { name: 'Security Incident Template', url: '/templates/security-incident', type: 'ticket-template' },
    ],
    lastUpdated: '2026-08-05',
    version: '1.8',
    usageCount: 2,
    avgCompletionTime: 1.5,
  },
  {
    id: 'pb-007',
    name: 'Update Bias Monitoring',
    description: 'Remediation for fairness control gaps in underwriting or decision agents.',
    targetControlIds: ['ctrl-cust-005-2'],
    targetControlNames: ['Bias Detection Monitoring'],
    severity: 'high',
    estimatedEffort: 10,
    requiredRoles: ['Data Science', 'Risk Management', 'Legal', 'ML Ops'],
    steps: [
      { order: 1, title: 'Assess Current Bias Metrics', description: 'Run comprehensive bias analysis across protected classes.', owner: 'Data Science', estimatedMinutes: 90, automatable: true, automationScript: 'scripts/bias-analysis.py' },
      { order: 2, title: 'Identify Bias Sources', description: 'Analyze features and training data for bias contributors.', owner: 'Data Science', estimatedMinutes: 120, automatable: false },
      { order: 3, title: 'Consult Legal/Compliance', description: 'Review findings with legal for fair lending/discrimination implications.', owner: 'Legal', estimatedMinutes: 60, automatable: false },
      { order: 4, title: 'Implement Mitigations', description: 'Apply debiasing techniques, feature adjustments, or threshold calibrations.', owner: 'Data Science', estimatedMinutes: 180, automatable: false },
      { order: 5, title: 'Update Monitoring Dashboard', description: 'Configure real-time bias metrics in monitoring dashboard.', owner: 'ML Ops', estimatedMinutes: 60, automatable: false },
      { order: 6, title: 'Set Alert Thresholds', description: 'Configure alerts for bias metric threshold breaches.', owner: 'ML Ops', estimatedMinutes: 30, automatable: true },
      { order: 7, title: 'Establish Review Cadence', description: 'Document required review frequency and responsible parties.', owner: 'Risk Management', estimatedMinutes: 30, automatable: false },
      { order: 8, title: 'Validate Improvements', description: 'Confirm bias metrics improved and within acceptable ranges.', owner: 'Data Science', estimatedMinutes: 60, automatable: true },
    ],
    prerequisites: ['Access to demographic data (with privacy controls)', 'Legal approval for analysis'],
    verificationSteps: ['Demographic parity within 5%', 'No adverse impact ratio below 0.8', 'Dashboard reviewed weekly'],
    rollbackProcedure: 'Revert model to previous version if new mitigations cause performance degradation',
    relatedDocuments: [
      { name: 'Fair Lending Compliance Guide', url: '/docs/fair-lending', type: 'wiki' },
      { name: 'Bias Testing Policy', url: '/policies/bias-testing', type: 'policy' },
    ],
    lastUpdated: '2026-07-25',
    version: '1.2',
    usageCount: 5,
    avgCompletionTime: 12.0,
  },
  {
    id: 'pb-008',
    name: 'Enhance Prompt Injection Defense',
    description: 'Strengthen prompt injection and jailbreak prevention controls.',
    targetControlIds: ['ctrl-gr-002'],
    targetControlNames: ['Prompt Injection Defense'],
    severity: 'critical',
    estimatedEffort: 6,
    requiredRoles: ['Security Team', 'ML Ops', 'Red Team'],
    steps: [
      { order: 1, title: 'Review Attack Logs', description: 'Analyze recent injection attempts and identify new attack vectors.', owner: 'Security Team', estimatedMinutes: 45, automatable: true },
      { order: 2, title: 'Run Red Team Exercise', description: 'Conduct targeted prompt injection testing against current defenses.', owner: 'Red Team', estimatedMinutes: 120, automatable: false },
      { order: 3, title: 'Update Detection Patterns', description: 'Add new injection patterns to guardrail based on findings.', owner: 'ML Ops', estimatedMinutes: 60, automatable: false },
      { order: 4, title: 'Enhance Input Sanitization', description: 'Strengthen pre-processing to neutralize injection techniques.', owner: 'ML Ops', estimatedMinutes: 45, automatable: false },
      { order: 5, title: 'Update ML Classifier', description: 'Retrain injection classifier with new attack samples.', owner: 'ML Ops', estimatedMinutes: 90, automatable: true },
      { order: 6, title: 'Deploy and Monitor', description: 'Deploy enhanced defenses and monitor for effectiveness.', owner: 'SRE Team', estimatedMinutes: 30, automatable: true },
    ],
    prerequisites: ['Red team availability', 'ML classifier training infrastructure'],
    verificationSteps: ['Block rate >99% on test suite', 'No successful injections in 7 days', 'False positive rate <2%'],
    rollbackProcedure: 'Revert guardrail to previous version if false positives spike',
    relatedDocuments: [
      { name: 'OWASP LLM Top 10', url: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/', type: 'wiki' },
      { name: 'Prompt Security Policy', url: '/policies/prompt-security', type: 'policy' },
    ],
    lastUpdated: '2026-08-04',
    version: '2.5',
    usageCount: 7,
    avgCompletionTime: 5.5,
  },
];

// Demo instance dates are seeded relative to "now" so active remediations render
// with realistic runways instead of being permanently OVERDUE against a fixed past date.
const NOW_MS = Date.now();
const relDate = (days: number) => new Date(NOW_MS + days * 86400000).toISOString();

const MOCK_INSTANCES: PlaybookInstance[] = [
  {
    id: 'inst-001',
    playbookId: 'pb-001',
    playbookName: 'Remediate Guardrail Bypass',
    findingId: 'find-gr-003',
    findingTitle: '3 edge cases where topic restrictions bypassed via indirect prompting',
    controlId: 'ctrl-gr-003',
    controlName: 'Topic Restriction',
    status: 'active',
    progress: 43,
    startedAt: relDate(-6),
    dueDate: relDate(1),
    owner: 'ML Ops Team',
    stepExecutions: [
      { stepOrder: 1, status: 'completed', startedAt: '2026-08-05T09:00:00Z', completedAt: '2026-08-05T09:35:00Z', actualMinutes: 35, assignee: 'John Smith' },
      { stepOrder: 2, status: 'completed', startedAt: '2026-08-05T10:00:00Z', completedAt: '2026-08-05T11:15:00Z', actualMinutes: 75, assignee: 'Sarah Chen', notes: 'Found 2 additional bypass patterns' },
      { stepOrder: 3, status: 'in-progress', startedAt: '2026-08-06T09:00:00Z', assignee: 'Sarah Chen' },
      { stepOrder: 4, status: 'pending' },
      { stepOrder: 5, status: 'pending' },
      { stepOrder: 6, status: 'pending' },
      { stepOrder: 7, status: 'pending' },
    ],
    estimatedHours: 4,
    actualHours: 2.5,
  },
  {
    id: 'inst-002',
    playbookId: 'pb-002',
    playbookName: 'Fix Model Drift Alert',
    findingId: 'find-pol-002',
    findingTitle: 'Alert threshold not calibrated per risk tier',
    controlId: 'ctrl-pol-002',
    controlName: 'Model Drift Detection',
    status: 'blocked',
    progress: 28,
    startedAt: relDate(-10),
    dueDate: relDate(3),
    owner: 'Data Science Team',
    stepExecutions: [
      { stepOrder: 1, status: 'completed', startedAt: '2026-08-01T10:00:00Z', completedAt: '2026-08-01T10:50:00Z', actualMinutes: 50, assignee: 'Mike Chen' },
      { stepOrder: 2, status: 'completed', startedAt: '2026-08-01T11:00:00Z', completedAt: '2026-08-01T12:45:00Z', actualMinutes: 105, assignee: 'Mike Chen' },
      { stepOrder: 3, status: 'blocked', startedAt: '2026-08-02T09:00:00Z', assignee: 'Risk Team', blockerReason: 'Awaiting risk tier classification approval from steering committee' },
      { stepOrder: 4, status: 'pending' },
      { stepOrder: 5, status: 'pending' },
      { stepOrder: 6, status: 'pending' },
      { stepOrder: 7, status: 'pending' },
    ],
    blockerReason: 'Awaiting risk tier classification approval from steering committee',
    estimatedHours: 6,
    actualHours: 3.2,
  },
  {
    id: 'inst-003',
    playbookId: 'pb-004',
    playbookName: 'Address Grounding Validation Gap',
    findingId: 'find-gr-005',
    findingTitle: 'Grounding validation latency exceeds SLA in 8% of cases',
    controlId: 'ctrl-gr-005',
    controlName: 'Output Grounding Validation',
    status: 'completed',
    progress: 100,
    startedAt: relDate(-20),
    completedAt: relDate(-15),
    dueDate: relDate(-13),
    owner: 'ML Ops Team',
    stepExecutions: [
      { stepOrder: 1, status: 'completed', startedAt: '2026-07-20T08:00:00Z', completedAt: '2026-07-20T09:00:00Z', actualMinutes: 60, assignee: 'Emily Zhang' },
      { stepOrder: 2, status: 'completed', startedAt: '2026-07-20T10:00:00Z', completedAt: '2026-07-20T11:30:00Z', actualMinutes: 90, assignee: 'Content Team' },
      { stepOrder: 3, status: 'completed', startedAt: '2026-07-21T09:00:00Z', completedAt: '2026-07-22T12:00:00Z', actualMinutes: 180, assignee: 'Content Team' },
      { stepOrder: 4, status: 'completed', startedAt: '2026-07-23T09:00:00Z', completedAt: '2026-07-23T10:00:00Z', actualMinutes: 60, assignee: 'Emily Zhang' },
      { stepOrder: 5, status: 'completed', startedAt: '2026-07-24T09:00:00Z', completedAt: '2026-07-24T10:30:00Z', actualMinutes: 90, assignee: 'Emily Zhang' },
      { stepOrder: 6, status: 'completed', startedAt: '2026-07-25T14:00:00Z', completedAt: '2026-07-25T15:00:00Z', actualMinutes: 60, assignee: 'QA Team' },
    ],
    estimatedHours: 5,
    actualHours: 9.0,
  },
];

// ============================================================================
// Styling Constants
// ============================================================================

const SEVERITY_CONFIG: Record<PlaybookSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
};

const STATUS_CONFIG: Record<InstanceStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Active' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  paused: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Paused' },
  blocked: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Blocked' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Cancelled' },
};

// ============================================================================
// Sub-Components
// ============================================================================

function PlaybookCard({
  playbook,
  onSelect,
}: {
  playbook: Playbook;
  onSelect: () => void;
}) {
  const sevConfig = SEVERITY_CONFIG[playbook.severity];

  return (
    <div
      onClick={onSelect}
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${sevConfig.bg} ${sevConfig.text}`}>
              {playbook.severity}
            </span>
            <span className="text-xs text-slate-400">v{playbook.version}</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{playbook.name}</h3>
        </div>
        <Icon name="book-open" className="w-5 h-5 text-slate-400" />
      </div>

      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{playbook.description}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {playbook.targetControlNames.map((name, i) => (
          <span key={i} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium">
            {name}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Icon name="clock" className="w-3 h-3" />
            {playbook.estimatedEffort}h est.
          </span>
          <span className="flex items-center gap-1">
            <Icon name="list-bullet" className="w-3 h-3" />
            {playbook.steps.length} steps
          </span>
        </div>
        <span>Used {playbook.usageCount}x</span>
      </div>
    </div>
  );
}

function PlaybookDetail({
  playbook,
}: {
  playbook: Playbook;
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const sevConfig = SEVERITY_CONFIG[playbook.severity];
  const automatableSteps = playbook.steps.filter(s => s.automatable).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${sevConfig.bg} ${sevConfig.text}`}>
              {playbook.severity}
            </span>
            <span className="text-xs text-slate-400">Version {playbook.version}</span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-400">Updated {playbook.lastUpdated}</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{playbook.name}</h2>
          <p className="text-sm text-slate-500 mt-1">{playbook.description}</p>
        </div>
        <button
          type="button"
          disabled
          title="Creating a remediation instance requires the ITSM integration"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
        >
          <Icon name="play" className="w-4 h-4" />
          Start Remediation
          <span className="text-[10px]">(ITSM integration required)</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{playbook.estimatedEffort}h</div>
          <div className="text-xs text-slate-500">Estimated</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{playbook.avgCompletionTime}h</div>
          <div className="text-xs text-slate-500">Avg Actual</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{playbook.steps.length}</div>
          <div className="text-xs text-slate-500">Steps</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-emerald-600">{automatableSteps}</div>
          <div className="text-xs text-slate-500">Automatable</div>
        </div>
      </div>

      {/* Target Controls */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-2">Target Controls</h4>
        <div className="flex flex-wrap gap-2">
          {playbook.targetControlNames.map((name, i) => (
            <span key={i} className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium">
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Prerequisites */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-2">Prerequisites</h4>
        <ul className="space-y-1">
          {playbook.prerequisites.map((prereq, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
              <Icon name="check-circle" className="w-4 h-4 text-slate-400" />
              {prereq}
            </li>
          ))}
        </ul>
      </div>

      {/* Steps */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Steps</h4>
        <div className="space-y-2">
          {playbook.steps.map((step) => (
            <div
              key={step.order}
              className="border border-slate-200 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedStep(expandedStep === step.order ? null : step.order)}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition"
              >
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">
                  {step.order}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-slate-900">{step.title}</div>
                  <div className="text-xs text-slate-500">{step.owner} • {step.estimatedMinutes} min</div>
                </div>
                {step.automatable && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                    Automatable
                  </span>
                )}
                <Icon
                  name={expandedStep === step.order ? 'chevron-up' : 'chevron-down'}
                  className="w-4 h-4 text-slate-400"
                />
              </button>
              {expandedStep === step.order && (
                <div className="px-3 pb-3 pt-0 border-t border-slate-100 bg-slate-50/50">
                  <p className="text-sm text-slate-600 mb-2">{step.description}</p>
                  {step.automationScript && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                      <Icon name="code-bracket" className="w-3 h-3" />
                      {step.automationScript}
                    </div>
                  )}
                  {step.verificationCriteria && (
                    <div className="mt-2 text-xs text-slate-500">
                      <strong>Verification:</strong> {step.verificationCriteria}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Verification Steps */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-2">Verification</h4>
        <ul className="space-y-1">
          {playbook.verificationSteps.map((step, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
              <Icon name="clipboard-document-check" className="w-4 h-4 text-slate-400" />
              {step}
            </li>
          ))}
        </ul>
      </div>

      {/* Rollback */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-amber-900 mb-1 flex items-center gap-2">
          <Icon name="arrow-uturn-left" className="w-4 h-4" />
          Rollback Procedure
        </h4>
        <p className="text-sm text-amber-800">{playbook.rollbackProcedure}</p>
      </div>

      {/* Related Documents */}
      {playbook.relatedDocuments.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Related Documents</h4>
          <div className="flex flex-wrap gap-2">
            {playbook.relatedDocuments.map((doc, i) => (
              <a
                key={i}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition"
              >
                <Icon name={doc.type === 'runbook' ? 'book-open' : doc.type === 'policy' ? 'document-text' : 'link'} className="w-3 h-3" />
                {doc.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveRemediationCard({ instance }: { instance: PlaybookInstance }) {
  const statusConfig = STATUS_CONFIG[instance.status];
  const completedSteps = instance.stepExecutions.filter(s => s.status === 'completed').length;
  const totalSteps = instance.stepExecutions.length;
  // Derive percentage from the same step counts shown in the label so the bar and
  // the "X of Y steps" text can't disagree.
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const dueDate = new Date(instance.dueDate);
  const now = new Date();
  const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysRemaining < 0;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
              {statusConfig.label}
            </span>
            {isOverdue && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                {Math.abs(daysRemaining)}d OVERDUE
              </span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-slate-900">{instance.playbookName}</h4>
          <p className="text-xs text-slate-500 mt-0.5">{instance.findingTitle}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>{completedSteps} of {totalSteps} steps</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              instance.status === 'blocked' ? 'bg-rose-500' :
              instance.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Blocker */}
      {instance.blockerReason && (
        <div className="mb-3 p-2 bg-rose-50 border border-rose-100 rounded text-xs text-rose-700">
          <strong>Blocked:</strong> {instance.blockerReason}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Owner: {instance.owner}</span>
        <span className={isOverdue ? 'text-rose-600 font-medium' : ''}>
          Due: {new Date(instance.dueDate).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function RemediationPlaybooks() {
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<PlaybookSeverity | 'all'>('all');
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);

  const filteredPlaybooks = useMemo(() => {
    return MOCK_PLAYBOOKS.filter(p => {
      if (severityFilter !== 'all' && p.severity !== severityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) ||
               p.description.toLowerCase().includes(q) ||
               p.targetControlNames.some(n => n.toLowerCase().includes(q));
      }
      return true;
    });
  }, [searchQuery, severityFilter]);

  const activeInstances = MOCK_INSTANCES.filter(i => i.status === 'active' || i.status === 'blocked');
  const completedInstances = MOCK_INSTANCES.filter(i => i.status === 'completed');

  const handleSelectPlaybook = (playbook: Playbook) => {
    setSelectedPlaybook(playbook);
    setShowDetailDrawer(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CoreBadge pillar="govern" compact />
          <MockDataBadge integration="Connect to ITSM for live remediation tracking" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Playbooks" value={MOCK_PLAYBOOKS.length.toString()} sub="available" />
        <StatCard
          label="Active Remediations"
          value={activeInstances.length.toString()}
          sub="in progress"
          variant={activeInstances.length > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Blocked"
          value={activeInstances.filter(i => i.status === 'blocked').length.toString()}
          sub="need attention"
          variant={activeInstances.filter(i => i.status === 'blocked').length > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Completed"
          value={completedInstances.length.toString()}
          sub="this month"
          variant="success"
        />
      </div>

      {/* Active Remediations */}
      {activeInstances.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Active Remediations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeInstances.map(instance => (
              <ActiveRemediationCard key={instance.id} instance={instance} />
            ))}
          </div>
        </div>
      )}

      {/* Playbook Library */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Playbook Library</h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search playbooks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as PlaybookSeverity | 'all')}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlaybooks.map(playbook => (
            <PlaybookCard
              key={playbook.id}
              playbook={playbook}
              onSelect={() => handleSelectPlaybook(playbook)}
            />
          ))}
        </div>
      </div>

      {/* Detail Drawer */}
      <Drawer
        open={showDetailDrawer}
        onClose={() => setShowDetailDrawer(false)}
        title={selectedPlaybook?.name || 'Playbook Details'}
        subtitle={`${selectedPlaybook?.steps.length || 0} steps • ${selectedPlaybook?.estimatedEffort || 0}h estimated`}
        width="xl"
      >
        {selectedPlaybook && (
          <PlaybookDetail playbook={selectedPlaybook} />
        )}
      </Drawer>
    </div>
  );
}
