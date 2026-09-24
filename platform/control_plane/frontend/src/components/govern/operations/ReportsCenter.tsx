/**
 * ReportsCenter - Comprehensive GRC Report Generation Hub
 *
 * Multi-agent control assessment with:
 * - Multi-select agent filtering
 * - Control coverage matrix (agents × controls)
 * - Requirement mapping (SR 26-2, NIST AI RMF, EU AI Act)
 * - Evidence chain with artifact links
 * - Testing procedures and schedules
 * - Risk scoring and remediation tracking
 * - Exception management
 * - Attestation workflow
 * - Historical effectiveness trends
 * - Export to audit packages
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

type ControlCategory = 'platform' | 'policy' | 'guardrail' | 'custom';
type EffectivenessRating = 'effective' | 'partially-effective' | 'ineffective' | 'not-tested';
type RiskTier = 'critical' | 'high' | 'medium' | 'low';
type AttestationStatus = 'pending' | 'attested' | 'rejected' | 'expired';
type RemediationStatus = 'open' | 'in-progress' | 'blocked' | 'resolved' | 'accepted-risk';
type EvidenceType = 'log-query' | 'screenshot' | 'config-export' | 'test-script' | 'ticket' | 'report' | 'attestation' | 'video-recording' | 'api-response' | 'policy-document';
type CollectionMethod = 'automated' | 'manual' | 'api-pull';
type IntegrityStatus = 'verified' | 'pending' | 'failed';

interface CollectorIdentity {
  name: string;
  email: string;
  role: string;
}

interface ChainOfCustodyEntry {
  action: string;
  actor: string;
  timestamp: string;
  notes?: string;
}

interface RetentionPolicy {
  retainUntil: string;
  legalHold: boolean;
  deletionApprover?: string;
}

interface EnterpriseEvidenceArtifact {
  id: string;
  controlIds: string[];
  type: EvidenceType;
  name: string;
  description: string;
  location: string;
  collectedAt: string;
  expiresAt?: string;
  collectionMethod: CollectionMethod;
  collectorIdentity: CollectorIdentity;
  systemSource: string;
  integrityHash: string;
  hashVerifiedAt: string;
  integrityStatus: IntegrityStatus;
  chainOfCustody: ChainOfCustodyEntry[];
  retentionPolicy: RetentionPolicy;
  fileSize?: string;
  mimeType?: string;
}

interface Agent {
  id: string;
  name: string;
  useCase: string;
  owner: string;
  department: string;
  riskTier: RiskTier;
  classification: string;
  deployedAt: string;
  lastAssessed: string;
  framework: string;
  region: string;
  useCaseType: string;
}

interface RegulatoryRequirement {
  id: string;
  framework: string;
  section: string;
  title: string;
  description: string;
  controlIds: string[];
}

interface Control {
  id: string;
  name: string;
  description: string;
  category: ControlCategory;
  controlType: 'preventive' | 'detective' | 'corrective';
  applicability: 'all-agents' | 'risk-tier' | 'custom';
  frameworks: string[];
  requirementIds: string[];
  designEffectiveness: EffectivenessRating;
  operatingEffectiveness: EffectivenessRating;
  lastTested: string;
  nextTestDue: string;
  testFrequency: string;
  testProcedure: string;
  automatedTest: boolean;
  evidenceCount: number;
  findings: number;
  owner: string;
  ownerEmail: string;
  residualRisk: number; // 1-10 scale
  inherentRisk: number;
}

interface EvidenceRequest {
  id: string;
  evidenceType: EvidenceType;
  controlIds: string[];
  requestedBy: string;
  requestedAt: string;
  assignedTo: string;
  dueDate: string;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  notes?: string;
}

interface ControlException {
  id: string;
  controlId: string;
  agentIds: string[];
  reason: string;
  compensatingControls: string[];
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'revoked';
  reviewDate: string;
}

interface RemediationItem {
  id: string;
  controlId: string;
  agentIds: string[];
  finding: string;
  severity: RiskTier;
  status: RemediationStatus;
  owner: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  blockerReason?: string;
  resolution?: string;
}

interface Attestation {
  id: string;
  controlId: string;
  agentIds: string[];
  attestedBy: string;
  attestedAt: string;
  role: 'control-owner' | 'risk-manager' | 'audit-committee' | 'ciso';
  status: AttestationStatus;
  comments?: string;
  expiresAt: string;
  digitalSignature?: string;
}

// ============================================================================
// Mock Data - Comprehensive FSI Control Environment
// ============================================================================

// ---------------------------------------------------------------------------
// Mock date reseeding
//
// The mock records below were authored around a fixed "now" (2024-08-10). Left
// unchanged, every date sits well in the past, which forces universally FALSE
// runtime states: all control tests read as overdue, all evidence reads as
// "Stale", and expired exceptions still render as "active". To keep the demo
// honest, every mock date string is shifted forward by the time elapsed since
// that authoring anchor, preserving the carefully designed relative spread so
// overdue / stale / expiring / expired states form a realistic mix relative to
// the current date rather than being frozen in the past.
// ---------------------------------------------------------------------------
const MOCK_DATA_ANCHOR = Date.parse('2024-08-10T00:00:00Z');
const MOCK_DATE_SHIFT_MS = Date.now() - MOCK_DATA_ANCHOR;
const MOCK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;

function shiftMockDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  const shifted = new Date(parsed + MOCK_DATE_SHIFT_MS).toISOString();
  // Preserve the original granularity (date-only vs full timestamp).
  return value.includes('T') ? shifted : shifted.slice(0, 10);
}

function shiftMockDatesDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    return MOCK_DATE_PATTERN.test(value) ? shiftMockDate(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map(shiftMockDatesDeep);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = shiftMockDatesDeep(entry);
    }
    return out;
  }
  return value;
}

function reseedMockDates<T>(rows: T[]): T[] {
  return rows.map((row) => shiftMockDatesDeep(row) as T);
}

const MOCK_AGENTS: Agent[] = reseedMockDates<Agent>([
  {
    id: 'agent-001',
    name: 'Claims Processing Agent',
    useCase: 'Automated insurance claims adjudication and routing',
    owner: 'Sarah Chen',
    department: 'Claims Operations',
    riskTier: 'high',
    classification: 'PII Handler - Tier 1',
    deployedAt: '2024-03-15',
    lastAssessed: '2024-08-01',
    framework: 'Bedrock Agent',
    region: 'us-east-1',
    useCaseType: 'decision-automation',
  },
  {
    id: 'agent-002',
    name: 'Customer Service Bot',
    useCase: 'Customer inquiry handling and policy questions',
    owner: 'Mike Rodriguez',
    department: 'Customer Experience',
    riskTier: 'medium',
    classification: 'Customer Facing - Tier 2',
    deployedAt: '2024-01-20',
    lastAssessed: '2024-07-15',
    framework: 'Bedrock Agent',
    region: 'us-east-1',
    useCaseType: 'customer-facing',
  },
  {
    id: 'agent-003',
    name: 'Fraud Detection Agent',
    useCase: 'Real-time transaction fraud analysis and alerting',
    owner: 'James Wilson',
    department: 'Risk Management',
    riskTier: 'critical',
    classification: 'Financial Decision - Tier 1',
    deployedAt: '2024-02-10',
    lastAssessed: '2024-08-05',
    framework: 'Bedrock Agent',
    region: 'us-east-1',
    useCaseType: 'risk-detection',
  },
  {
    id: 'agent-004',
    name: 'Document Summarizer',
    useCase: 'Internal document summarization and knowledge extraction',
    owner: 'Lisa Park',
    department: 'Legal Operations',
    riskTier: 'medium',
    classification: 'Internal Use - Tier 3',
    deployedAt: '2024-04-05',
    lastAssessed: '2024-07-20',
    framework: 'Bedrock Agent',
    region: 'us-west-2',
    useCaseType: 'productivity',
  },
  {
    id: 'agent-005',
    name: 'Underwriting Assistant',
    useCase: 'Risk assessment support for underwriters',
    owner: 'David Kim',
    department: 'Underwriting',
    riskTier: 'high',
    classification: 'Financial Decision - Tier 1',
    deployedAt: '2024-05-01',
    lastAssessed: '2024-08-03',
    framework: 'Bedrock Agent',
    region: 'us-east-1',
    useCaseType: 'decision-support',
  },
  {
    id: 'agent-006',
    name: 'Compliance Checker',
    useCase: 'Automated regulatory compliance document review',
    owner: 'Emily Zhang',
    department: 'Compliance',
    riskTier: 'high',
    classification: 'Regulatory - Tier 1',
    deployedAt: '2024-06-01',
    lastAssessed: '2024-08-02',
    framework: 'Bedrock Agent',
    region: 'us-east-1',
    useCaseType: 'compliance',
  },
  {
    id: 'agent-007',
    name: 'HR Benefits Assistant',
    useCase: 'Employee benefits inquiries and enrollment support',
    owner: 'Tom Martinez',
    department: 'Human Resources',
    riskTier: 'low',
    classification: 'Internal Use - Tier 3',
    deployedAt: '2024-04-15',
    lastAssessed: '2024-07-10',
    framework: 'Bedrock Agent',
    region: 'us-east-1',
    useCaseType: 'employee-facing',
  },
  {
    id: 'agent-008',
    name: 'Investment Research Agent',
    useCase: 'Market analysis and investment research synthesis',
    owner: 'Rachel Adams',
    department: 'Investment Management',
    riskTier: 'critical',
    classification: 'Financial Advice - Tier 1',
    deployedAt: '2024-05-15',
    lastAssessed: '2024-08-04',
    framework: 'Bedrock Agent',
    region: 'us-east-1',
    useCaseType: 'research',
  },
]);

const MOCK_REQUIREMENTS: RegulatoryRequirement[] = [
  // SR 26-2 Requirements
  { id: 'sr26-1', framework: 'SR 26-2', section: '1.1', title: 'Model Risk Governance', description: 'Board-level oversight of AI/ML model risk', controlIds: ['ctrl-pol-001', 'ctrl-plat-001'] },
  { id: 'sr26-2', framework: 'SR 26-2', section: '1.2', title: 'Model Inventory', description: 'Comprehensive inventory of all AI models in use', controlIds: ['ctrl-plat-001', 'ctrl-plat-005'] },
  { id: 'sr26-3', framework: 'SR 26-2', section: '2.1', title: 'Model Development Standards', description: 'Documented development and validation standards', controlIds: ['ctrl-pol-002', 'ctrl-gr-005'] },
  { id: 'sr26-4', framework: 'SR 26-2', section: '2.2', title: 'Model Validation', description: 'Independent validation of model performance', controlIds: ['ctrl-pol-002', 'ctrl-gr-003'] },
  { id: 'sr26-5', framework: 'SR 26-2', section: '3.1', title: 'Ongoing Monitoring', description: 'Continuous monitoring of model performance', controlIds: ['ctrl-plat-001', 'ctrl-pol-002', 'ctrl-gr-005'] },
  { id: 'sr26-6', framework: 'SR 26-2', section: '3.2', title: 'Model Changes', description: 'Change management for model updates', controlIds: ['ctrl-pol-003', 'ctrl-plat-002'] },
  { id: 'sr26-7', framework: 'SR 26-2', section: '4.1', title: 'Third-Party Models', description: 'Due diligence for third-party AI models', controlIds: ['ctrl-pol-001', 'ctrl-gr-002'] },
  // NIST AI RMF Requirements
  { id: 'nist-gov-1', framework: 'NIST AI RMF', section: 'GOVERN 1.1', title: 'AI Policies', description: 'Organizational AI policies and procedures', controlIds: ['ctrl-pol-001', 'ctrl-pol-003'] },
  { id: 'nist-gov-2', framework: 'NIST AI RMF', section: 'GOVERN 1.2', title: 'Accountability', description: 'Clear roles and accountability for AI systems', controlIds: ['ctrl-plat-005', 'ctrl-pol-001'] },
  { id: 'nist-map-1', framework: 'NIST AI RMF', section: 'MAP 1.1', title: 'Context Mapping', description: 'AI system context and stakeholder identification', controlIds: ['ctrl-plat-001'] },
  { id: 'nist-map-2', framework: 'NIST AI RMF', section: 'MAP 2.1', title: 'Risk Identification', description: 'Identification of AI-specific risks', controlIds: ['ctrl-pol-002', 'ctrl-gr-005'] },
  { id: 'nist-meas-1', framework: 'NIST AI RMF', section: 'MEASURE 1.1', title: 'Performance Metrics', description: 'AI system performance measurement', controlIds: ['ctrl-plat-001', 'ctrl-pol-002'] },
  { id: 'nist-meas-2', framework: 'NIST AI RMF', section: 'MEASURE 2.1', title: 'Bias Assessment', description: 'Assessment of AI system bias', controlIds: ['ctrl-gr-005', 'ctrl-cust-005-2'] },
  { id: 'nist-man-1', framework: 'NIST AI RMF', section: 'MANAGE 1.1', title: 'Risk Treatment', description: 'AI risk treatment and mitigation', controlIds: ['ctrl-gr-001', 'ctrl-gr-002', 'ctrl-gr-003'] },
  { id: 'nist-man-2', framework: 'NIST AI RMF', section: 'MANAGE 2.1', title: 'Incident Response', description: 'AI incident response procedures', controlIds: ['ctrl-pol-004'] },
  // EU AI Act Requirements
  { id: 'euai-1', framework: 'EU AI Act', section: 'Art. 9', title: 'Risk Management System', description: 'Continuous risk management for high-risk AI', controlIds: ['ctrl-pol-001', 'ctrl-pol-002'] },
  { id: 'euai-2', framework: 'EU AI Act', section: 'Art. 10', title: 'Data Governance', description: 'Training data governance requirements', controlIds: ['ctrl-pol-003', 'ctrl-plat-004'] },
  { id: 'euai-3', framework: 'EU AI Act', section: 'Art. 11', title: 'Technical Documentation', description: 'Comprehensive technical documentation', controlIds: ['ctrl-plat-001', 'ctrl-plat-005'] },
  { id: 'euai-4', framework: 'EU AI Act', section: 'Art. 12', title: 'Record Keeping', description: 'Automatic logging of AI system operations', controlIds: ['ctrl-plat-001'] },
  { id: 'euai-5', framework: 'EU AI Act', section: 'Art. 13', title: 'Transparency', description: 'Transparency to users and deployers', controlIds: ['ctrl-gr-005', 'ctrl-cust-003-3'] },
  { id: 'euai-6', framework: 'EU AI Act', section: 'Art. 14', title: 'Human Oversight', description: 'Human oversight mechanisms', controlIds: ['ctrl-pol-001', 'ctrl-cust-001-1'] },
  { id: 'euai-7', framework: 'EU AI Act', section: 'Art. 15', title: 'Accuracy & Robustness', description: 'Accuracy, robustness, and cybersecurity', controlIds: ['ctrl-gr-002', 'ctrl-plat-002', 'ctrl-plat-003'] },
  { id: 'euai-8', framework: 'EU AI Act', section: 'Art. 73', title: 'Incident Reporting', description: 'Serious incident reporting obligations', controlIds: ['ctrl-pol-004'] },
];

const MOCK_CONTROLS: Control[] = reseedMockDates<Control>([
  // Platform Controls
  {
    id: 'ctrl-plat-001',
    name: 'Model Invocation Logging',
    description: 'All model invocations logged to CloudWatch with request/response capture, including token counts, latency, and error codes',
    category: 'platform',
    controlType: 'detective',
    applicability: 'all-agents',
    frameworks: ['SOC 2', 'NIST AI RMF', 'SR 26-2', 'EU AI Act'],
    requirementIds: ['sr26-1', 'sr26-2', 'sr26-5', 'nist-map-1', 'nist-meas-1', 'euai-3', 'euai-4'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-01',
    nextTestDue: '2024-09-01',
    testFrequency: 'Monthly',
    testProcedure: '1. Query CloudWatch for sample invocations\n2. Verify all required fields present\n3. Confirm retention policy compliance\n4. Test log query performance',
    automatedTest: true,
    evidenceCount: 12,
    findings: 0,
    owner: 'Platform Team',
    ownerEmail: 'platform-team@company.com',
    residualRisk: 2,
    inherentRisk: 7,
  },
  {
    id: 'ctrl-plat-002',
    name: 'IAM Role Boundary',
    description: 'Agents operate under least-privilege IAM roles with permission boundaries preventing privilege escalation',
    category: 'platform',
    controlType: 'preventive',
    applicability: 'all-agents',
    frameworks: ['SOC 2', 'NIST CSF', 'SR 26-2', 'EU AI Act'],
    requirementIds: ['sr26-6', 'euai-7'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-07-15',
    nextTestDue: '2024-10-15',
    testFrequency: 'Quarterly',
    testProcedure: '1. Review IAM policies for each agent role\n2. Attempt privilege escalation\n3. Verify permission boundary blocks\n4. Document any policy gaps',
    automatedTest: false,
    evidenceCount: 8,
    findings: 0,
    owner: 'Security Team',
    ownerEmail: 'security@company.com',
    residualRisk: 2,
    inherentRisk: 8,
  },
  {
    id: 'ctrl-plat-003',
    name: 'Network Isolation',
    description: 'Agents deployed in isolated VPC subnets with controlled egress via NAT Gateway and security groups',
    category: 'platform',
    controlType: 'preventive',
    applicability: 'all-agents',
    frameworks: ['SOC 2', 'PCI DSS', 'NIST CSF', 'EU AI Act'],
    requirementIds: ['euai-7'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-07-20',
    nextTestDue: '2024-10-20',
    testFrequency: 'Quarterly',
    testProcedure: '1. Review VPC configuration\n2. Test egress restrictions\n3. Verify security group rules\n4. Scan for open ports',
    automatedTest: true,
    evidenceCount: 6,
    findings: 0,
    owner: 'Infrastructure Team',
    ownerEmail: 'infra@company.com',
    residualRisk: 2,
    inherentRisk: 7,
  },
  {
    id: 'ctrl-plat-004',
    name: 'Secrets Management',
    description: 'All credentials stored in AWS Secrets Manager with automatic rotation every 30 days',
    category: 'platform',
    controlType: 'preventive',
    applicability: 'all-agents',
    frameworks: ['SOC 2', 'PCI DSS', 'NIST CSF', 'EU AI Act'],
    requirementIds: ['euai-2'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-05',
    nextTestDue: '2024-09-05',
    testFrequency: 'Monthly',
    testProcedure: '1. Verify rotation schedule active\n2. Confirm no hardcoded credentials\n3. Test secret retrieval audit trail\n4. Validate encryption at rest',
    automatedTest: true,
    evidenceCount: 10,
    findings: 0,
    owner: 'Security Team',
    ownerEmail: 'security@company.com',
    residualRisk: 1,
    inherentRisk: 9,
  },
  {
    id: 'ctrl-plat-005',
    name: 'Cost Allocation Tagging',
    description: 'All agent resources tagged with cost center, owner, environment, and project for FinOps tracking',
    category: 'platform',
    controlType: 'detective',
    applicability: 'all-agents',
    frameworks: ['Internal Policy', 'NIST AI RMF'],
    requirementIds: ['sr26-2', 'nist-gov-2', 'euai-3'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'partially-effective',
    lastTested: '2024-07-01',
    nextTestDue: '2024-08-01',
    testFrequency: 'Monthly',
    testProcedure: '1. Run tag compliance report\n2. Identify untagged resources\n3. Verify tag values are valid\n4. Generate cost allocation report',
    automatedTest: true,
    evidenceCount: 4,
    findings: 1,
    owner: 'FinOps Team',
    ownerEmail: 'finops@company.com',
    residualRisk: 3,
    inherentRisk: 4,
  },
  // Policy Controls
  {
    id: 'ctrl-pol-001',
    name: 'Human-in-the-Loop for High-Value Decisions',
    description: 'Decisions above monetary threshold or risk score require human approval via workflow before execution',
    category: 'policy',
    controlType: 'preventive',
    applicability: 'risk-tier',
    frameworks: ['SR 26-2', 'NIST AI RMF', 'EU AI Act'],
    requirementIds: ['sr26-1', 'sr26-7', 'nist-gov-1', 'nist-gov-2', 'euai-1', 'euai-6'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-02',
    nextTestDue: '2024-08-09',
    testFrequency: 'Weekly',
    testProcedure: '1. Submit test decision above threshold\n2. Verify workflow triggered\n3. Confirm blocking until approval\n4. Test rejection path',
    automatedTest: true,
    evidenceCount: 45,
    findings: 0,
    owner: 'Risk Management',
    ownerEmail: 'risk@company.com',
    residualRisk: 2,
    inherentRisk: 9,
  },
  {
    id: 'ctrl-pol-002',
    name: 'Model Drift Detection',
    description: 'Automated monitoring for output distribution drift with alerts when KL divergence exceeds threshold',
    category: 'policy',
    controlType: 'detective',
    applicability: 'all-agents',
    frameworks: ['NIST AI RMF', 'SR 26-2', 'EU AI Act'],
    requirementIds: ['sr26-3', 'sr26-4', 'sr26-5', 'nist-map-2', 'nist-meas-1', 'euai-1'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'partially-effective',
    lastTested: '2024-07-25',
    nextTestDue: '2024-08-25',
    testFrequency: 'Monthly',
    testProcedure: '1. Inject synthetic drift\n2. Verify alert triggered\n3. Confirm threshold calibration\n4. Test escalation path',
    automatedTest: true,
    evidenceCount: 8,
    findings: 2,
    owner: 'ML Ops Team',
    ownerEmail: 'mlops@company.com',
    residualRisk: 5,
    inherentRisk: 7,
  },
  {
    id: 'ctrl-pol-003',
    name: 'Data Retention Policy Enforcement',
    description: 'Conversation logs retained per policy schedule with automated purge after retention period',
    category: 'policy',
    controlType: 'corrective',
    applicability: 'all-agents',
    frameworks: ['GDPR', 'CCPA', 'SOC 2', 'EU AI Act'],
    requirementIds: ['sr26-6', 'nist-gov-1', 'euai-2'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-01',
    nextTestDue: '2024-09-01',
    testFrequency: 'Monthly',
    testProcedure: '1. Verify retention rules configured\n2. Check purge job execution\n3. Confirm no data beyond retention\n4. Test subject access request',
    automatedTest: true,
    evidenceCount: 6,
    findings: 0,
    owner: 'Privacy Team',
    ownerEmail: 'privacy@company.com',
    residualRisk: 2,
    inherentRisk: 6,
  },
  {
    id: 'ctrl-pol-004',
    name: 'Incident Response SLA',
    description: 'Agent incidents triaged within 15 minutes, escalated per severity matrix, resolved per SLA',
    category: 'policy',
    controlType: 'corrective',
    applicability: 'all-agents',
    frameworks: ['SOC 2', 'Internal Policy', 'EU AI Act', 'NIST AI RMF'],
    requirementIds: ['nist-man-2', 'euai-8'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-03',
    nextTestDue: '2024-08-10',
    testFrequency: 'Weekly',
    testProcedure: '1. Trigger test incident\n2. Measure response time\n3. Verify escalation path\n4. Confirm SLA tracking',
    automatedTest: false,
    evidenceCount: 22,
    findings: 0,
    owner: 'SRE Team',
    ownerEmail: 'sre@company.com',
    residualRisk: 3,
    inherentRisk: 8,
  },
  // Guardrail Controls
  {
    id: 'ctrl-gr-001',
    name: 'PII Detection and Masking',
    description: 'Bedrock Guardrail detects and masks PII (SSN, credit card, etc.) in inputs and outputs using regex and NER',
    category: 'guardrail',
    controlType: 'preventive',
    applicability: 'risk-tier',
    frameworks: ['GDPR', 'CCPA', 'SOC 2', 'SR 26-2'],
    requirementIds: ['nist-man-1'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-05',
    nextTestDue: '2024-08-12',
    testFrequency: 'Weekly',
    testProcedure: '1. Submit test PII patterns\n2. Verify detection rate\n3. Confirm masking applied\n4. Test edge cases',
    automatedTest: true,
    evidenceCount: 156,
    findings: 0,
    owner: 'Privacy Team',
    ownerEmail: 'privacy@company.com',
    residualRisk: 2,
    inherentRisk: 9,
  },
  {
    id: 'ctrl-gr-002',
    name: 'Prompt Injection Defense',
    description: 'Guardrail blocks prompt injection, jailbreak attempts, and adversarial inputs using pattern matching and ML classifier',
    category: 'guardrail',
    controlType: 'preventive',
    applicability: 'all-agents',
    frameworks: ['NIST AI RMF', 'OWASP LLM Top 10', 'SR 26-2', 'EU AI Act'],
    requirementIds: ['sr26-7', 'nist-man-1', 'euai-7'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-04',
    nextTestDue: '2024-08-05',
    testFrequency: 'Daily',
    testProcedure: '1. Run injection test suite\n2. Verify block rate\n3. Check false positive rate\n4. Update patterns if needed',
    automatedTest: true,
    evidenceCount: 89,
    findings: 0,
    owner: 'Security Team',
    ownerEmail: 'security@company.com',
    residualRisk: 3,
    inherentRisk: 9,
  },
  {
    id: 'ctrl-gr-003',
    name: 'Topic Restriction',
    description: 'Guardrail enforces allowed topic boundaries per use case, blocking off-topic or prohibited content',
    category: 'guardrail',
    controlType: 'preventive',
    applicability: 'custom',
    frameworks: ['Internal Policy', 'SR 26-2'],
    requirementIds: ['sr26-4', 'nist-man-1'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'partially-effective',
    lastTested: '2024-07-30',
    nextTestDue: '2024-08-06',
    testFrequency: 'Weekly',
    testProcedure: '1. Test boundary prompts\n2. Verify topic classification\n3. Check edge case handling\n4. Review bypass attempts',
    automatedTest: true,
    evidenceCount: 34,
    findings: 3,
    owner: 'Compliance Team',
    ownerEmail: 'compliance@company.com',
    residualRisk: 4,
    inherentRisk: 6,
  },
  {
    id: 'ctrl-gr-004',
    name: 'Toxicity and Harm Prevention',
    description: 'Guardrail blocks harmful, toxic, or inappropriate content using content safety classifier',
    category: 'guardrail',
    controlType: 'preventive',
    applicability: 'all-agents',
    frameworks: ['EU AI Act', 'NIST AI RMF'],
    requirementIds: ['nist-man-1'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-05',
    nextTestDue: '2024-08-06',
    testFrequency: 'Daily',
    testProcedure: '1. Run toxicity test suite\n2. Verify block rate\n3. Check cultural sensitivity\n4. Test edge cases',
    automatedTest: true,
    evidenceCount: 67,
    findings: 0,
    owner: 'Trust & Safety',
    ownerEmail: 'trust-safety@company.com',
    residualRisk: 2,
    inherentRisk: 7,
  },
  {
    id: 'ctrl-gr-005',
    name: 'Output Grounding Validation',
    description: 'Guardrail validates outputs against knowledge base sources, flagging ungrounded claims',
    category: 'guardrail',
    controlType: 'detective',
    applicability: 'risk-tier',
    frameworks: ['NIST AI RMF', 'SR 26-2', 'EU AI Act'],
    requirementIds: ['sr26-3', 'sr26-5', 'nist-map-2', 'nist-meas-2', 'euai-5'],
    designEffectiveness: 'partially-effective',
    operatingEffectiveness: 'partially-effective',
    lastTested: '2024-07-28',
    nextTestDue: '2024-08-04',
    testFrequency: 'Weekly',
    testProcedure: '1. Submit factual queries\n2. Verify grounding citations\n3. Test hallucination detection\n4. Measure precision/recall',
    automatedTest: true,
    evidenceCount: 23,
    findings: 5,
    owner: 'ML Ops Team',
    ownerEmail: 'mlops@company.com',
    residualRisk: 6,
    inherentRisk: 8,
  },
  // Custom Controls (agent-specific)
  {
    id: 'ctrl-cust-001-1',
    name: 'Claims Amount Threshold',
    description: 'Claims above $10,000 require supervisor review before auto-adjudication proceeds',
    category: 'custom',
    controlType: 'preventive',
    applicability: 'custom',
    frameworks: ['SR 26-2', 'Internal Policy'],
    requirementIds: ['euai-6'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-02',
    nextTestDue: '2024-08-09',
    testFrequency: 'Weekly',
    testProcedure: '1. Submit test claim >$10K\n2. Verify workflow trigger\n3. Confirm blocking behavior\n4. Test approval path',
    automatedTest: true,
    evidenceCount: 89,
    findings: 0,
    owner: 'Claims Operations',
    ownerEmail: 'claims-ops@company.com',
    residualRisk: 2,
    inherentRisk: 8,
  },
  {
    id: 'ctrl-cust-003-1',
    name: 'Real-Time Transaction Blocking',
    description: 'High-confidence fraud transactions blocked in real-time with sub-100ms latency',
    category: 'custom',
    controlType: 'preventive',
    applicability: 'custom',
    frameworks: ['PCI DSS', 'SR 26-2'],
    requirementIds: [],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-05',
    nextTestDue: '2024-08-06',
    testFrequency: 'Daily',
    testProcedure: '1. Run fraud simulation\n2. Measure block latency\n3. Verify false positive rate\n4. Test fallback path',
    automatedTest: true,
    evidenceCount: 567,
    findings: 0,
    owner: 'Fraud Operations',
    ownerEmail: 'fraud-ops@company.com',
    residualRisk: 3,
    inherentRisk: 10,
  },
  {
    id: 'ctrl-cust-003-3',
    name: 'Model Explainability Logging',
    description: 'All fraud decisions include explainability factors for audit and customer disputes',
    category: 'custom',
    controlType: 'detective',
    applicability: 'custom',
    frameworks: ['EU AI Act', 'SR 26-2', 'NIST AI RMF'],
    requirementIds: ['euai-5'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'effective',
    lastTested: '2024-08-01',
    nextTestDue: '2024-08-08',
    testFrequency: 'Weekly',
    testProcedure: '1. Review sample decisions\n2. Verify explainability fields\n3. Test human readability\n4. Check completeness',
    automatedTest: true,
    evidenceCount: 890,
    findings: 0,
    owner: 'ML Ops Team',
    ownerEmail: 'mlops@company.com',
    residualRisk: 2,
    inherentRisk: 7,
  },
  {
    id: 'ctrl-cust-005-2',
    name: 'Bias Detection Monitoring',
    description: 'Automated monitoring for demographic bias in underwriting risk assessments',
    category: 'custom',
    controlType: 'detective',
    applicability: 'custom',
    frameworks: ['EU AI Act', 'NIST AI RMF', 'Fair Lending'],
    requirementIds: ['nist-meas-2'],
    designEffectiveness: 'effective',
    operatingEffectiveness: 'partially-effective',
    lastTested: '2024-07-25',
    nextTestDue: '2024-08-25',
    testFrequency: 'Monthly',
    testProcedure: '1. Run bias analysis report\n2. Check demographic parity\n3. Review threshold alerts\n4. Document findings',
    automatedTest: true,
    evidenceCount: 12,
    findings: 1,
    owner: 'Risk Management',
    ownerEmail: 'risk@company.com',
    residualRisk: 5,
    inherentRisk: 8,
  },
]);

// Agent-to-Control mapping (which agents have which custom controls)
const AGENT_CONTROL_MAPPING: Record<string, string[]> = {
  'agent-001': ['ctrl-cust-001-1'],
  'agent-003': ['ctrl-cust-003-1', 'ctrl-cust-003-3'],
  'agent-005': ['ctrl-cust-005-2'],
  'agent-008': ['ctrl-cust-005-2'],
};

const MOCK_ENTERPRISE_EVIDENCE: EnterpriseEvidenceArtifact[] = reseedMockDates<EnterpriseEvidenceArtifact>([
  {
    id: 'eev-001',
    controlIds: ['ctrl-plat-001', 'ctrl-plat-005'],
    type: 'log-query',
    name: 'Model Invocation Audit Trail - Q3 2024',
    description: 'Complete CloudWatch Logs Insights query export showing all model invocations with request/response metadata, token counts, and latency metrics',
    location: 's3://audit-evidence-prod/2024/Q3/invocation-logs/audit-trail-20240801-20240810.json.gz',
    collectedAt: '2024-08-10T14:30:00Z',
    expiresAt: '2027-08-10',
    collectionMethod: 'automated',
    collectorIdentity: { name: 'AWS Lambda', email: 'automation@company.com', role: 'System Automation' },
    systemSource: 'AWS CloudWatch Logs Insights',
    integrityHash: 'sha256:a3f2c8d9e1b4567890abcdef1234567890abcdef1234567890abcdef12345678',
    hashVerifiedAt: '2024-08-10T14:35:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Created', actor: 'Lambda:EvidenceCollector', timestamp: '2024-08-10T14:30:00Z', notes: 'Automated daily collection' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-10T14:35:00Z' },
      { action: 'Archived', actor: 'S3 Lifecycle', timestamp: '2024-08-10T14:40:00Z', notes: 'Moved to Glacier Deep Archive' },
    ],
    retentionPolicy: { retainUntil: '2027-08-10', legalHold: false, deletionApprover: 'Chief Compliance Officer' },
    fileSize: '2.4 GB',
    mimeType: 'application/gzip',
  },
  {
    id: 'eev-002',
    controlIds: ['ctrl-gr-001'],
    type: 'screenshot',
    name: 'PII Masking Console Evidence',
    description: 'Screenshot showing Bedrock Guardrail PII detection configuration and test results in AWS Console',
    location: 's3://audit-evidence-prod/2024/Q3/screenshots/pii-guardrail-config-20240805.png',
    collectedAt: '2024-08-05T10:15:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'Sarah Chen', email: 'schen@company.com', role: 'Privacy Engineer' },
    systemSource: 'AWS Management Console',
    integrityHash: 'sha256:b4c5d6e7f8901234abcdef567890abcdef123456789012345678901234567890',
    hashVerifiedAt: '2024-08-05T10:20:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Captured', actor: 'Sarah Chen', timestamp: '2024-08-05T10:15:00Z', notes: 'Manual screenshot during quarterly review' },
      { action: 'Uploaded', actor: 'Sarah Chen', timestamp: '2024-08-05T10:18:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-05T10:20:00Z' },
      { action: 'Reviewed', actor: 'James Wilson', timestamp: '2024-08-06T09:00:00Z', notes: 'Approved for audit package' },
    ],
    retentionPolicy: { retainUntil: '2027-08-05', legalHold: false },
    fileSize: '1.2 MB',
    mimeType: 'image/png',
  },
  {
    id: 'eev-003',
    controlIds: ['ctrl-plat-002', 'ctrl-plat-003'],
    type: 'config-export',
    name: 'IAM Role Boundary Policy Export',
    description: 'Full IAM policy document export showing permission boundaries for all agent roles with attached policies',
    location: 's3://audit-evidence-prod/2024/Q3/iam-exports/agent-roles-boundaries-20240715.json',
    collectedAt: '2024-07-15T08:00:00Z',
    collectionMethod: 'api-pull',
    collectorIdentity: { name: 'Config Collector Service', email: 'config-svc@company.com', role: 'Service Account' },
    systemSource: 'AWS IAM API',
    integrityHash: 'sha256:c5d6e7f8901234567890abcdef1234567890abcdef12345678901234567890ab',
    hashVerifiedAt: '2024-07-15T08:05:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Extracted', actor: 'ConfigCollector:IAMExporter', timestamp: '2024-07-15T08:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-07-15T08:05:00Z' },
      { action: 'Reviewed', actor: 'Security Team', timestamp: '2024-07-16T14:00:00Z', notes: 'Quarterly IAM review complete' },
    ],
    retentionPolicy: { retainUntil: '2027-07-15', legalHold: false },
    fileSize: '456 KB',
    mimeType: 'application/json',
  },
  {
    id: 'eev-004',
    controlIds: ['ctrl-gr-002'],
    type: 'test-script',
    name: 'Prompt Injection Test Suite v2.3',
    description: 'Comprehensive prompt injection and jailbreak test suite with 1,847 test cases including OWASP LLM Top 10 vectors',
    location: 's3://audit-evidence-prod/2024/Q3/test-scripts/prompt-injection-suite-v2.3.py',
    collectedAt: '2024-08-04T16:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'Red Team', email: 'redteam@company.com', role: 'Security Testing' },
    systemSource: 'Internal Test Repository',
    integrityHash: 'sha256:d6e7f8901234567890abcdef1234567890abcdef123456789012345678901234',
    hashVerifiedAt: '2024-08-04T16:10:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Committed', actor: 'Red Team', timestamp: '2024-08-04T15:45:00Z', notes: 'Version 2.3 release' },
      { action: 'Exported', actor: 'Mike Rodriguez', timestamp: '2024-08-04T16:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-04T16:10:00Z' },
    ],
    retentionPolicy: { retainUntil: '2029-08-04', legalHold: true, deletionApprover: 'CISO' },
    fileSize: '2.1 MB',
    mimeType: 'text/x-python',
  },
  {
    id: 'eev-005',
    controlIds: ['ctrl-pol-001', 'ctrl-cust-001-1'],
    type: 'ticket',
    name: 'HITL Threshold Change Request - CHG0012345',
    description: 'ServiceNow change ticket documenting approval workflow for claims threshold adjustment from $10K to $15K',
    location: 'https://company.service-now.com/nav_to.do?uri=change_request.do?sys_id=abc123',
    collectedAt: '2024-08-02T11:30:00Z',
    collectionMethod: 'api-pull',
    collectorIdentity: { name: 'ServiceNow Connector', email: 'snow-sync@company.com', role: 'Integration Service' },
    systemSource: 'ServiceNow ITSM',
    integrityHash: 'sha256:e7f8901234567890abcdef1234567890abcdef1234567890123456789012345',
    hashVerifiedAt: '2024-08-02T11:35:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Ticket Created', actor: 'Risk Management', timestamp: '2024-07-28T09:00:00Z' },
      { action: 'Approved', actor: 'CAB', timestamp: '2024-08-01T14:00:00Z', notes: 'Change Advisory Board approval' },
      { action: 'Synced', actor: 'ServiceNow Connector', timestamp: '2024-08-02T11:30:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-02T11:35:00Z' },
    ],
    retentionPolicy: { retainUntil: '2027-08-02', legalHold: false },
    fileSize: '45 KB',
    mimeType: 'application/json',
  },
  {
    id: 'eev-006',
    controlIds: ['ctrl-pol-002', 'ctrl-gr-005'],
    type: 'report',
    name: 'Model Drift Analysis Report - July 2024',
    description: 'Monthly model drift analysis report with KL divergence metrics, baseline comparisons, and threshold alerts',
    location: 's3://audit-evidence-prod/2024/Q3/reports/drift-analysis-202407.pdf',
    collectedAt: '2024-08-01T09:00:00Z',
    collectionMethod: 'automated',
    collectorIdentity: { name: 'ML Ops Pipeline', email: 'mlops@company.com', role: 'System Automation' },
    systemSource: 'Amazon SageMaker Model Monitor',
    integrityHash: 'sha256:f8901234567890abcdef1234567890abcdef12345678901234567890123456',
    hashVerifiedAt: '2024-08-01T09:10:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Generated', actor: 'SageMaker Model Monitor', timestamp: '2024-08-01T08:55:00Z' },
      { action: 'Uploaded', actor: 'MLOps Pipeline', timestamp: '2024-08-01T09:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-01T09:10:00Z' },
      { action: 'Reviewed', actor: 'ML Ops Lead', timestamp: '2024-08-02T10:00:00Z', notes: 'No significant drift detected' },
    ],
    retentionPolicy: { retainUntil: '2027-08-01', legalHold: false },
    fileSize: '8.7 MB',
    mimeType: 'application/pdf',
  },
  {
    id: 'eev-007',
    controlIds: ['ctrl-pol-001'],
    type: 'attestation',
    name: 'HITL Control Owner Attestation - Q3 2024',
    description: 'Signed attestation from Risk Management confirming HITL control design and operating effectiveness',
    location: 's3://audit-evidence-prod/2024/Q3/attestations/hitl-attestation-q3-2024.pdf',
    collectedAt: '2024-08-02T15:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'Emily Zhang', email: 'ezhang@company.com', role: 'Risk Manager' },
    systemSource: 'DocuSign',
    integrityHash: 'sha256:01234567890abcdef1234567890abcdef123456789012345678901234567890',
    hashVerifiedAt: '2024-08-02T15:05:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Drafted', actor: 'Emily Zhang', timestamp: '2024-08-01T10:00:00Z' },
      { action: 'Signed', actor: 'Emily Zhang', timestamp: '2024-08-02T14:55:00Z', notes: 'Digital signature via DocuSign' },
      { action: 'Uploaded', actor: 'Emily Zhang', timestamp: '2024-08-02T15:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-02T15:05:00Z' },
    ],
    retentionPolicy: { retainUntil: '2031-08-02', legalHold: true, deletionApprover: 'General Counsel' },
    fileSize: '1.8 MB',
    mimeType: 'application/pdf',
  },
  {
    id: 'eev-008',
    controlIds: ['ctrl-cust-003-1', 'ctrl-cust-003-3'],
    type: 'video-recording',
    name: 'Fraud Detection Agent Walkthrough - August 2024',
    description: 'Screen recording demonstrating real-time fraud blocking and explainability logging in production environment',
    location: 's3://audit-evidence-prod/2024/Q3/videos/fraud-agent-walkthrough-20240805.mp4',
    collectedAt: '2024-08-05T14:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'James Wilson', email: 'jwilson@company.com', role: 'Fraud Operations Manager' },
    systemSource: 'OBS Studio Recording',
    integrityHash: 'sha256:1234567890abcdef1234567890abcdef1234567890123456789012345678901',
    hashVerifiedAt: '2024-08-05T14:30:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Recorded', actor: 'James Wilson', timestamp: '2024-08-05T13:30:00Z' },
      { action: 'Uploaded', actor: 'James Wilson', timestamp: '2024-08-05T14:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-05T14:30:00Z' },
      { action: 'Reviewed', actor: 'Internal Audit', timestamp: '2024-08-06T11:00:00Z', notes: 'Accepted as SOC 2 evidence' },
    ],
    retentionPolicy: { retainUntil: '2027-08-05', legalHold: false },
    fileSize: '245 MB',
    mimeType: 'video/mp4',
  },
  {
    id: 'eev-009',
    controlIds: ['ctrl-plat-001', 'ctrl-pol-004'],
    type: 'api-response',
    name: 'CloudWatch GetMetricData Response Sample',
    description: 'API response capture showing invocation metrics query returning expected telemetry fields',
    location: 's3://audit-evidence-prod/2024/Q3/api-responses/cloudwatch-metrics-sample-20240801.json',
    collectedAt: '2024-08-01T12:00:00Z',
    collectionMethod: 'api-pull',
    collectorIdentity: { name: 'Evidence Collector Lambda', email: 'automation@company.com', role: 'System Automation' },
    systemSource: 'AWS CloudWatch API',
    integrityHash: 'sha256:234567890abcdef1234567890abcdef12345678901234567890123456789012',
    hashVerifiedAt: '2024-08-01T12:05:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Captured', actor: 'Lambda:EvidenceCollector', timestamp: '2024-08-01T12:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-01T12:05:00Z' },
    ],
    retentionPolicy: { retainUntil: '2027-08-01', legalHold: false },
    fileSize: '128 KB',
    mimeType: 'application/json',
  },
  {
    id: 'eev-010',
    controlIds: ['ctrl-pol-003'],
    type: 'policy-document',
    name: 'AI Data Retention Policy v3.2',
    description: 'Corporate policy document defining retention schedules for AI conversation logs and model artifacts',
    location: 's3://audit-evidence-prod/2024/Q3/policies/ai-data-retention-policy-v3.2.pdf',
    collectedAt: '2024-07-01T09:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'Privacy Team', email: 'privacy@company.com', role: 'Policy Owner' },
    systemSource: 'SharePoint Policy Library',
    integrityHash: 'sha256:34567890abcdef1234567890abcdef123456789012345678901234567890123',
    hashVerifiedAt: '2024-07-01T09:10:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Published', actor: 'Privacy Team', timestamp: '2024-07-01T08:45:00Z' },
      { action: 'Uploaded', actor: 'Privacy Team', timestamp: '2024-07-01T09:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-07-01T09:10:00Z' },
      { action: 'Attested', actor: 'Chief Privacy Officer', timestamp: '2024-07-01T10:00:00Z', notes: 'Policy approved and effective' },
    ],
    retentionPolicy: { retainUntil: '2034-07-01', legalHold: true, deletionApprover: 'General Counsel' },
    fileSize: '2.3 MB',
    mimeType: 'application/pdf',
  },
  {
    id: 'eev-011',
    controlIds: ['ctrl-gr-003', 'ctrl-gr-004'],
    type: 'test-script',
    name: 'Topic Boundary Test Cases v1.5',
    description: 'Test script covering topic restriction bypass attempts and toxicity edge cases',
    location: 's3://audit-evidence-prod/2024/Q3/test-scripts/topic-boundary-tests-v1.5.py',
    collectedAt: '2024-07-30T11:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'QA Team', email: 'qa@company.com', role: 'Quality Assurance' },
    systemSource: 'GitLab Repository',
    integrityHash: 'sha256:4567890abcdef1234567890abcdef1234567890123456789012345678901234',
    hashVerifiedAt: '2024-07-30T11:05:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Committed', actor: 'QA Team', timestamp: '2024-07-30T10:45:00Z' },
      { action: 'Exported', actor: 'QA Team', timestamp: '2024-07-30T11:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-07-30T11:05:00Z' },
    ],
    retentionPolicy: { retainUntil: '2027-07-30', legalHold: false },
    fileSize: '890 KB',
    mimeType: 'text/x-python',
  },
  {
    id: 'eev-012',
    controlIds: ['ctrl-plat-004'],
    type: 'config-export',
    name: 'Secrets Manager Rotation Configuration',
    description: 'Export of all agent credential rotation schedules and encryption settings from AWS Secrets Manager',
    location: 's3://audit-evidence-prod/2024/Q3/config-exports/secrets-rotation-config-20240805.json',
    collectedAt: '2024-08-05T06:00:00Z',
    collectionMethod: 'automated',
    collectorIdentity: { name: 'Config Collector Service', email: 'config-svc@company.com', role: 'Service Account' },
    systemSource: 'AWS Secrets Manager',
    integrityHash: 'sha256:567890abcdef1234567890abcdef12345678901234567890123456789012345',
    hashVerifiedAt: '2024-08-05T06:05:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Extracted', actor: 'ConfigCollector:SecretsExporter', timestamp: '2024-08-05T06:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-05T06:05:00Z' },
    ],
    retentionPolicy: { retainUntil: '2027-08-05', legalHold: false },
    fileSize: '67 KB',
    mimeType: 'application/json',
  },
  {
    id: 'eev-013',
    controlIds: ['ctrl-cust-005-2'],
    type: 'report',
    name: 'Bias Detection Monthly Analysis - July 2024',
    description: 'Monthly report on demographic bias metrics for underwriting agent with statistical parity analysis',
    location: 's3://audit-evidence-prod/2024/Q3/reports/bias-analysis-202407.pdf',
    collectedAt: '2024-08-01T10:00:00Z',
    collectionMethod: 'automated',
    collectorIdentity: { name: 'Fairness Pipeline', email: 'mlops@company.com', role: 'System Automation' },
    systemSource: 'SageMaker Clarify',
    integrityHash: 'sha256:67890abcdef1234567890abcdef123456789012345678901234567890123456',
    hashVerifiedAt: '2024-08-01T10:10:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Generated', actor: 'SageMaker Clarify', timestamp: '2024-08-01T09:45:00Z' },
      { action: 'Uploaded', actor: 'Fairness Pipeline', timestamp: '2024-08-01T10:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-01T10:10:00Z' },
      { action: 'Reviewed', actor: 'Risk Management', timestamp: '2024-08-03T14:00:00Z', notes: 'Minor variance noted, within thresholds' },
    ],
    retentionPolicy: { retainUntil: '2031-08-01', legalHold: true, deletionApprover: 'Chief Risk Officer' },
    fileSize: '12.4 MB',
    mimeType: 'application/pdf',
  },
  {
    id: 'eev-014',
    controlIds: ['ctrl-pol-004'],
    type: 'ticket',
    name: 'Incident Response Test - INC0089234',
    description: 'Simulated incident ticket demonstrating 12-minute triage time and proper escalation path',
    location: 'https://company.service-now.com/nav_to.do?uri=incident.do?sys_id=def456',
    collectedAt: '2024-08-03T16:00:00Z',
    collectionMethod: 'api-pull',
    collectorIdentity: { name: 'ServiceNow Connector', email: 'snow-sync@company.com', role: 'Integration Service' },
    systemSource: 'ServiceNow ITSM',
    integrityHash: 'sha256:7890abcdef1234567890abcdef1234567890123456789012345678901234567',
    hashVerifiedAt: '2024-08-03T16:05:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Incident Simulated', actor: 'SRE Team', timestamp: '2024-08-03T15:30:00Z' },
      { action: 'Resolved', actor: 'SRE Team', timestamp: '2024-08-03T15:45:00Z', notes: 'Within SLA' },
      { action: 'Synced', actor: 'ServiceNow Connector', timestamp: '2024-08-03T16:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-03T16:05:00Z' },
    ],
    retentionPolicy: { retainUntil: '2027-08-03', legalHold: false },
    fileSize: '38 KB',
    mimeType: 'application/json',
  },
  {
    id: 'eev-015',
    controlIds: ['ctrl-gr-005'],
    type: 'api-response',
    name: 'Grounding Validation API Sample',
    description: 'Sample API response showing grounding citations and hallucination detection scores',
    location: 's3://audit-evidence-prod/2024/Q3/api-responses/grounding-validation-sample-20240728.json',
    collectedAt: '2024-07-28T14:00:00Z',
    collectionMethod: 'api-pull',
    collectorIdentity: { name: 'Evidence Collector Lambda', email: 'automation@company.com', role: 'System Automation' },
    systemSource: 'Amazon Bedrock Guardrails API',
    integrityHash: 'sha256:890abcdef1234567890abcdef12345678901234567890123456789012345678',
    hashVerifiedAt: '2024-07-28T14:05:00Z',
    integrityStatus: 'pending',
    chainOfCustody: [
      { action: 'Captured', actor: 'Lambda:EvidenceCollector', timestamp: '2024-07-28T14:00:00Z' },
      { action: 'Hash Verification Scheduled', actor: 'System', timestamp: '2024-07-28T14:05:00Z', notes: 'Awaiting nightly verification job' },
    ],
    retentionPolicy: { retainUntil: '2027-07-28', legalHold: false },
    fileSize: '256 KB',
    mimeType: 'application/json',
  },
  {
    id: 'eev-016',
    controlIds: ['ctrl-plat-003'],
    type: 'config-export',
    name: 'VPC Security Group Rules Export',
    description: 'Complete export of security group rules for agent VPC subnets showing controlled egress',
    location: 's3://audit-evidence-prod/2024/Q3/config-exports/vpc-sg-rules-20240720.json',
    collectedAt: '2024-04-18T07:00:00Z',
    collectionMethod: 'api-pull',
    collectorIdentity: { name: 'Config Collector Service', email: 'config-svc@company.com', role: 'Service Account' },
    systemSource: 'AWS EC2 API',
    integrityHash: 'sha256:90abcdef1234567890abcdef123456789012345678901234567890123456789',
    hashVerifiedAt: '2024-04-18T07:05:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Extracted', actor: 'ConfigCollector:VPCExporter', timestamp: '2024-04-18T07:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-04-18T07:05:00Z' },
      { action: 'Reviewed', actor: 'Infrastructure Team', timestamp: '2024-04-19T10:00:00Z' },
    ],
    retentionPolicy: { retainUntil: '2027-07-20', legalHold: false },
    fileSize: '234 KB',
    mimeType: 'application/json',
  },
  {
    id: 'eev-017',
    controlIds: ['ctrl-gr-001', 'ctrl-gr-002'],
    type: 'report',
    name: 'Weekly Guardrail Effectiveness Report - W32 2024',
    description: 'Weekly summary of guardrail block rates, false positive analysis, and pattern update recommendations',
    location: 's3://audit-evidence-prod/2024/Q3/reports/guardrail-weekly-w32-2024.pdf',
    collectedAt: '2024-08-05T08:00:00Z',
    expiresAt: '2024-11-05',
    collectionMethod: 'automated',
    collectorIdentity: { name: 'Reporting Pipeline', email: 'reporting@company.com', role: 'System Automation' },
    systemSource: 'Custom Analytics Pipeline',
    integrityHash: 'sha256:0abcdef1234567890abcdef1234567890123456789012345678901234567890',
    hashVerifiedAt: '2024-08-05T08:10:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Generated', actor: 'Reporting Pipeline', timestamp: '2024-08-05T07:45:00Z' },
      { action: 'Uploaded', actor: 'Reporting Pipeline', timestamp: '2024-08-05T08:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-05T08:10:00Z' },
    ],
    retentionPolicy: { retainUntil: '2024-11-05', legalHold: false },
    fileSize: '4.2 MB',
    mimeType: 'application/pdf',
  },
  {
    id: 'eev-018',
    controlIds: ['ctrl-pol-001', 'ctrl-pol-002'],
    type: 'policy-document',
    name: 'AI Model Risk Management Policy v2.1',
    description: 'Enterprise policy defining model risk governance, validation requirements, and ongoing monitoring standards',
    location: 's3://audit-evidence-prod/2024/Q3/policies/ai-model-risk-policy-v2.1.pdf',
    collectedAt: '2024-06-15T09:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'Risk Management', email: 'risk@company.com', role: 'Policy Owner' },
    systemSource: 'SharePoint Policy Library',
    integrityHash: 'sha256:abcdef1234567890abcdef12345678901234567890123456789012345678901',
    hashVerifiedAt: '2024-06-15T09:10:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Published', actor: 'Risk Management', timestamp: '2024-06-15T08:30:00Z' },
      { action: 'Uploaded', actor: 'Risk Management', timestamp: '2024-06-15T09:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-06-15T09:10:00Z' },
      { action: 'Board Approved', actor: 'Board Risk Committee', timestamp: '2024-06-20T14:00:00Z', notes: 'Approved in quarterly meeting' },
    ],
    retentionPolicy: { retainUntil: '2034-06-15', legalHold: true, deletionApprover: 'General Counsel' },
    fileSize: '3.8 MB',
    mimeType: 'application/pdf',
  },
  {
    id: 'eev-019',
    controlIds: ['ctrl-plat-001'],
    type: 'screenshot',
    name: 'CloudWatch Dashboard - Agent Metrics Overview',
    description: 'Screenshot of production CloudWatch dashboard showing real-time agent invocation metrics',
    location: 's3://audit-evidence-prod/2024/Q3/screenshots/cloudwatch-dashboard-20240810.png',
    collectedAt: '2024-08-10T10:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'Platform Team', email: 'platform-team@company.com', role: 'Platform Engineer' },
    systemSource: 'AWS CloudWatch Console',
    integrityHash: 'sha256:bcdef1234567890abcdef123456789012345678901234567890123456789012',
    hashVerifiedAt: '2024-08-10T10:05:00Z',
    integrityStatus: 'failed',
    chainOfCustody: [
      { action: 'Captured', actor: 'Platform Team', timestamp: '2024-08-10T10:00:00Z' },
      { action: 'Hash Verification Failed', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-10T10:05:00Z', notes: 'Hash mismatch - recollection required' },
    ],
    retentionPolicy: { retainUntil: '2027-08-10', legalHold: false },
    fileSize: '1.8 MB',
    mimeType: 'image/png',
  },
  {
    id: 'eev-020',
    controlIds: ['ctrl-cust-003-1'],
    type: 'video-recording',
    name: 'Real-Time Fraud Blocking Demo - August 2024',
    description: 'Demo recording showing sub-100ms fraud transaction blocking with latency measurements',
    location: 's3://audit-evidence-prod/2024/Q3/videos/fraud-blocking-demo-20240806.mp4',
    collectedAt: '2024-08-06T11:00:00Z',
    collectionMethod: 'manual',
    collectorIdentity: { name: 'Fraud Operations', email: 'fraud-ops@company.com', role: 'Fraud Analyst' },
    systemSource: 'Loom Recording',
    integrityHash: 'sha256:cdef1234567890abcdef1234567890123456789012345678901234567890123',
    hashVerifiedAt: '2024-08-06T11:30:00Z',
    integrityStatus: 'verified',
    chainOfCustody: [
      { action: 'Recorded', actor: 'Fraud Operations', timestamp: '2024-08-06T10:30:00Z' },
      { action: 'Uploaded', actor: 'Fraud Operations', timestamp: '2024-08-06T11:00:00Z' },
      { action: 'Hash Verified', actor: 'Lambda:IntegrityChecker', timestamp: '2024-08-06T11:30:00Z' },
    ],
    retentionPolicy: { retainUntil: '2027-08-06', legalHold: false },
    fileSize: '178 MB',
    mimeType: 'video/mp4',
  },
]);

const MOCK_EVIDENCE_REQUESTS: EvidenceRequest[] = reseedMockDates<EvidenceRequest>([
  {
    id: 'ereq-001',
    evidenceType: 'config-export',
    controlIds: ['ctrl-plat-002'],
    requestedBy: 'Internal Audit',
    requestedAt: '2024-08-08T09:00:00Z',
    assignedTo: 'Security Team',
    dueDate: '2024-08-15',
    status: 'in-progress',
    notes: 'Need updated IAM policy export for quarterly audit',
  },
  {
    id: 'ereq-002',
    evidenceType: 'attestation',
    controlIds: ['ctrl-gr-003'],
    requestedBy: 'Compliance Team',
    requestedAt: '2024-08-07T14:00:00Z',
    assignedTo: 'Compliance Team',
    dueDate: '2024-08-12',
    status: 'pending',
    notes: 'Topic restriction control owner attestation needed',
  },
  {
    id: 'ereq-003',
    evidenceType: 'test-script',
    controlIds: ['ctrl-gr-005'],
    requestedBy: 'External Auditor',
    requestedAt: '2024-08-01T10:00:00Z',
    assignedTo: 'ML Ops Team',
    dueDate: '2024-08-05',
    status: 'overdue',
    notes: 'Grounding validation test cases for SOC 2 examination',
  },
]);

const MOCK_EXCEPTIONS: ControlException[] = reseedMockDates<ControlException>([
  {
    id: 'exc-001',
    controlId: 'ctrl-pol-001',
    agentIds: ['agent-007'],
    reason: 'HR Benefits Assistant handles low-risk inquiries only - no financial decisions',
    compensatingControls: ['All responses reviewed in weekly sample audit', 'Escalation path to HR specialist for complex cases'],
    approvedBy: 'CISO',
    approvedAt: '2024-06-15',
    expiresAt: '2024-12-15',
    status: 'active',
    reviewDate: '2024-09-15',
  },
  {
    id: 'exc-002',
    controlId: 'ctrl-gr-005',
    agentIds: ['agent-004'],
    reason: 'Document Summarizer operates on internal docs only - grounding validation causes 40% latency increase',
    compensatingControls: ['Output sampling and human review', 'User feedback loop for accuracy'],
    approvedBy: 'Risk Committee',
    approvedAt: '2024-07-01',
    expiresAt: '2024-08-05',
    status: 'expired',
    reviewDate: '2024-07-20',
  },
]);

const MOCK_REMEDIATIONS: RemediationItem[] = reseedMockDates<RemediationItem>([
  {
    id: 'rem-001',
    controlId: 'ctrl-gr-005',
    agentIds: ['agent-001', 'agent-003', 'agent-005'],
    finding: 'Grounding validation latency exceeds SLA in 8% of cases',
    severity: 'medium',
    status: 'in-progress',
    owner: 'ML Ops Team',
    dueDate: '2024-08-31',
    createdAt: '2024-07-28',
    updatedAt: '2024-08-05',
  },
  {
    id: 'rem-002',
    controlId: 'ctrl-pol-002',
    agentIds: ['agent-001', 'agent-002', 'agent-003', 'agent-004', 'agent-005', 'agent-006', 'agent-007', 'agent-008'],
    finding: 'Alert threshold not calibrated per risk tier',
    severity: 'high',
    status: 'in-progress',
    owner: 'ML Ops Team',
    dueDate: '2024-08-15',
    createdAt: '2024-07-25',
    updatedAt: '2024-08-03',
  },
  {
    id: 'rem-003',
    controlId: 'ctrl-gr-003',
    agentIds: ['agent-002', 'agent-004'],
    finding: '3 edge cases where topic restrictions bypassed via indirect prompting',
    severity: 'medium',
    status: 'open',
    owner: 'Compliance Team',
    dueDate: '2024-08-20',
    createdAt: '2024-07-30',
    updatedAt: '2024-07-30',
  },
  {
    id: 'rem-004',
    controlId: 'ctrl-cust-005-2',
    agentIds: ['agent-005', 'agent-008'],
    finding: 'Bias monitoring dashboard not reviewed within required frequency',
    severity: 'medium',
    status: 'resolved',
    owner: 'Risk Management',
    dueDate: '2024-08-10',
    createdAt: '2024-07-20',
    updatedAt: '2024-08-08',
    resolution: 'Automated weekly review reminder and Slack integration implemented',
  },
]);

const MOCK_ATTESTATIONS: Attestation[] = reseedMockDates<Attestation>([
  { id: 'att-001', controlId: 'ctrl-plat-001', agentIds: [], attestedBy: 'Platform Team Lead', attestedAt: '2024-08-01', role: 'control-owner', status: 'attested', expiresAt: '2024-11-01' },
  { id: 'att-002', controlId: 'ctrl-plat-001', agentIds: [], attestedBy: 'Risk Manager', attestedAt: '2024-08-02', role: 'risk-manager', status: 'attested', expiresAt: '2024-11-02' },
  { id: 'att-003', controlId: 'ctrl-gr-001', agentIds: [], attestedBy: 'Privacy Officer', attestedAt: '2024-08-05', role: 'control-owner', status: 'attested', expiresAt: '2024-11-05' },
  { id: 'att-004', controlId: 'ctrl-pol-002', agentIds: [], attestedBy: 'ML Ops Lead', attestedAt: '2024-07-25', role: 'control-owner', status: 'attested', comments: 'Findings acknowledged, remediation in progress', expiresAt: '2024-10-25' },
]);

// ============================================================================
// Styling Constants
// ============================================================================

const RISK_TIER_CONFIG: Record<RiskTier, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', label: 'Critical' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', label: 'High' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Medium' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: 'Low' },
};

const EFFECTIVENESS_CONFIG: Record<EffectivenessRating, { bg: string; text: string; label: string; score: number }> = {
  'effective': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Effective', score: 3 },
  'partially-effective': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Partial', score: 2 },
  'ineffective': { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Ineffective', score: 1 },
  'not-tested': { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Not Tested', score: 0 },
};

const CATEGORY_CONFIG: Record<ControlCategory, { bg: string; text: string; label: string; icon: string }> = {
  platform: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Platform', icon: 'server-stack' },
  policy: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Policy', icon: 'document-text' },
  guardrail: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Guardrail', icon: 'shield-exclamation' },
  custom: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Custom', icon: 'puzzle-piece' },
};

const REMEDIATION_CONFIG: Record<RemediationStatus, { bg: string; text: string; label: string }> = {
  'open': { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Open' },
  'in-progress': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Progress' },
  'blocked': { bg: 'bg-red-100', text: 'text-red-700', label: 'Blocked' },
  'resolved': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Resolved' },
  'accepted-risk': { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Accepted Risk' },
};

const EVIDENCE_TYPE_CONFIG: Record<EvidenceType, { bg: string; text: string; label: string; icon: string }> = {
  'log-query': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Log Query', icon: 'command-line' },
  'screenshot': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Screenshot', icon: 'photo' },
  'config-export': { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Config Export', icon: 'cog-6-tooth' },
  'test-script': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Test Script', icon: 'code-bracket' },
  'ticket': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Ticket', icon: 'ticket' },
  'report': { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Report', icon: 'document-chart-bar' },
  'attestation': { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Attestation', icon: 'check-badge' },
  'video-recording': { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Video', icon: 'video-camera' },
  'api-response': { bg: 'bg-slate-100', text: 'text-slate-700', label: 'API Response', icon: 'arrow-path' },
  'policy-document': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Policy Doc', icon: 'document-text' },
};

const INTEGRITY_STATUS_CONFIG: Record<IntegrityStatus, { bg: string; text: string; label: string; icon: string }> = {
  'verified': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Verified', icon: 'shield-check' },
  'pending': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending', icon: 'clock' },
  'failed': { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Failed', icon: 'shield-exclamation' },
};

const COLLECTION_METHOD_CONFIG: Record<CollectionMethod, { bg: string; text: string; label: string }> = {
  'automated': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Auto-Collected' },
  'manual': { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Manual' },
  'api-pull': { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'API Pull' },
};

// ============================================================================
// Helper Functions
// ============================================================================

function getControlsForAgent(agentId: string): Control[] {
  const agent = MOCK_AGENTS.find(a => a.id === agentId);
  if (!agent) return [];

  const customControlIds = AGENT_CONTROL_MAPPING[agentId] || [];

  return MOCK_CONTROLS.filter(c => {
    if (c.applicability === 'all-agents') return true;
    if (c.applicability === 'risk-tier' && ['critical', 'high'].includes(agent.riskTier)) return true;
    if (c.applicability === 'custom' && customControlIds.includes(c.id)) return true;
    return false;
  });
}

function getRemediationsForAgents(agentIds: string[]): RemediationItem[] {
  return MOCK_REMEDIATIONS.filter(r =>
    r.agentIds.some(id => agentIds.includes(id))
  );
}

function getExceptionsForAgents(agentIds: string[]): ControlException[] {
  return MOCK_EXCEPTIONS.filter(e =>
    e.agentIds.some(id => agentIds.includes(id))
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function AgentMultiSelect({
  agents,
  selectedIds,
  onSelectionChange,
}: {
  agents: Agent[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const [filterRiskTier, setFilterRiskTier] = useState<RiskTier | 'all'>('all');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const departments = useMemo(() =>
    [...new Set(agents.map(a => a.department))].sort(),
    [agents]
  );

  const filteredAgents = useMemo(() => {
    return agents.filter(a => {
      if (filterRiskTier !== 'all' && a.riskTier !== filterRiskTier) return false;
      if (filterDept !== 'all' && a.department !== filterDept) return false;
      if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [agents, filterRiskTier, filterDept, searchQuery]);

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredAgents.map(a => a.id);
    const allSelected = allFilteredIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      onSelectionChange(selectedIds.filter(id => !allFilteredIds.includes(id)));
    } else {
      onSelectionChange([...new Set([...selectedIds, ...allFilteredIds])]);
    }
  };

  const handleSelectByRisk = (tier: RiskTier) => {
    const tierIds = agents.filter(a => a.riskTier === tier).map(a => a.id);
    onSelectionChange([...new Set([...selectedIds, ...tierIds])]);
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Select Agents</h3>
          <span className="text-xs text-slate-500">{selectedIds.length} of {agents.length} selected</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[150px] px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <select
            value={filterRiskTier}
            onChange={(e) => setFilterRiskTier(e.target.value as RiskTier | 'all')}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          >
            <option value="all">All Risk Tiers</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          >
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Quick Select Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSelectAll}
            className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition"
          >
            {filteredAgents.every(a => selectedIds.includes(a.id)) ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={() => handleSelectByRisk('critical')}
            className="px-2 py-1 text-xs font-medium bg-rose-50 text-rose-700 rounded hover:bg-rose-100 transition"
          >
            + Critical Risk
          </button>
          <button
            onClick={() => handleSelectByRisk('high')}
            className="px-2 py-1 text-xs font-medium bg-orange-50 text-orange-700 rounded hover:bg-orange-100 transition"
          >
            + High Risk
          </button>
          <button
            onClick={() => onSelectionChange([])}
            className="px-2 py-1 text-xs font-medium bg-slate-50 text-slate-500 rounded hover:bg-slate-100 transition"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Agent List */}
      <div className="max-h-[400px] overflow-y-auto">
        {filteredAgents.map((agent) => {
          const riskConfig = RISK_TIER_CONFIG[agent.riskTier];
          const isSelected = selectedIds.includes(agent.id);
          return (
            <div
              key={agent.id}
              onClick={() => handleToggle(agent.id)}
              className={`flex items-center gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer transition ${
                isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">{agent.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${riskConfig.bg} ${riskConfig.text}`}>
                    {riskConfig.label}
                  </span>
                </div>
                <div className="text-xs text-slate-500 truncate">{agent.department} • {agent.owner}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ControlCoverageMatrix({
  agents,
  controls,
}: {
  agents: Agent[];
  controls: Control[];
}) {
  const matrix = useMemo(() => {
    return controls.map(control => {
      const agentCoverage = agents.map(agent => {
        const agentControls = getControlsForAgent(agent.id);
        const hasControl = agentControls.some(c => c.id === control.id);
        return { agentId: agent.id, hasControl, effectiveness: hasControl ? control.operatingEffectiveness : null };
      });
      return { control, agentCoverage };
    });
  }, [agents, controls]);

  if (agents.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-8 text-center">
        <Icon name="table-cells" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Select agents to view control coverage matrix</p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Control Coverage Matrix</h3>
        <p className="text-xs text-slate-500 mt-0.5">Which controls apply to which agents and their effectiveness</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="text-left py-2 px-3 font-medium text-slate-600 sticky left-0 bg-slate-50/50 min-w-[200px]">Control</th>
              <th className="text-center py-2 px-3 font-medium text-slate-600 min-w-[60px]">Cat</th>
              {agents.map(a => (
                <th key={a.id} className="text-center py-2 px-2 font-medium text-slate-600 min-w-[80px]">
                  <div className="truncate max-w-[80px]" title={a.name}>{a.name.split(' ')[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map(({ control, agentCoverage }) => {
              const catConfig = CATEGORY_CONFIG[control.category];
              return (
                <tr key={control.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3 sticky left-0 bg-white">
                    <div className="font-medium text-slate-800 truncate max-w-[200px]" title={control.name}>{control.name}</div>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${catConfig.bg} ${catConfig.text}`}>
                      {catConfig.label.slice(0, 4)}
                    </span>
                  </td>
                  {agentCoverage.map(({ agentId, hasControl, effectiveness }) => (
                    <td key={agentId} className="py-2 px-2 text-center">
                      {hasControl ? (
                        <span className={`inline-block w-6 h-6 rounded-full ${EFFECTIVENESS_CONFIG[effectiveness!].bg} flex items-center justify-center`}>
                          <Icon
                            name={effectiveness === 'effective' ? 'check' : effectiveness === 'partially-effective' ? 'minus' : 'x-mark'}
                            className={`w-3 h-3 ${EFFECTIVENESS_CONFIG[effectiveness!].text}`}
                          />
                        </span>
                      ) : (
                        <span className="inline-block w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                          <Icon name="minus" className="w-3 h-3" />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-4 text-xs">
        <span className="text-slate-500">Legend:</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-emerald-100 inline-flex items-center justify-center"><Icon name="check" className="w-2.5 h-2.5 text-emerald-700" /></span> Effective</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-amber-100 inline-flex items-center justify-center"><Icon name="minus" className="w-2.5 h-2.5 text-amber-700" /></span> Partial</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-rose-100 inline-flex items-center justify-center"><Icon name="x-mark" className="w-2.5 h-2.5 text-rose-700" /></span> Ineffective</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-slate-100 inline-flex items-center justify-center"><Icon name="minus" className="w-2.5 h-2.5 text-slate-400" /></span> N/A</span>
      </div>
    </div>
  );
}

function RequirementMappingView({ controls }: { controls: Control[] }) {
  const [selectedFramework, setSelectedFramework] = useState<string>('all');

  const frameworks = ['SR 26-2', 'NIST AI RMF', 'EU AI Act'];

  const filteredRequirements = useMemo(() => {
    return MOCK_REQUIREMENTS.filter(r =>
      selectedFramework === 'all' || r.framework === selectedFramework
    );
  }, [selectedFramework]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Requirement Mapping</h3>
          <p className="text-xs text-slate-500 mt-0.5">Controls mapped to regulatory requirements</p>
        </div>
        <select
          value={selectedFramework}
          onChange={(e) => setSelectedFramework(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
        >
          <option value="all">All Frameworks</option>
          {frameworks.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
        {filteredRequirements.map((req) => {
          const mappedControls = controls.filter(c => req.controlIds.includes(c.id));
          const effectiveCount = mappedControls.filter(c => c.operatingEffectiveness === 'effective').length;
          const coverage = mappedControls.length > 0 ? Math.round((effectiveCount / mappedControls.length) * 100) : 0;

          return (
            <div key={req.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">{req.framework}</span>
                    <span className="text-xs font-mono text-slate-500">{req.section}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-900 mt-1">{req.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{req.description}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  coverage >= 80 ? 'bg-emerald-100 text-emerald-700' :
                  coverage >= 50 ? 'bg-amber-100 text-amber-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {coverage}%
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {mappedControls.map(c => {
                  const effConfig = EFFECTIVENESS_CONFIG[c.operatingEffectiveness];
                  return (
                    <span key={c.id} className={`px-2 py-0.5 rounded text-[10px] font-medium ${effConfig.bg} ${effConfig.text}`}>
                      {c.name.length > 25 ? c.name.slice(0, 25) + '...' : c.name}
                    </span>
                  );
                })}
                {mappedControls.length === 0 && (
                  <span className="text-xs text-rose-500 italic">No controls mapped</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RemediationTracker({ agentIds }: { agentIds: string[] }) {
  const remediations = getRemediationsForAgents(agentIds);

  const summary = useMemo(() => ({
    open: remediations.filter(r => r.status === 'open').length,
    inProgress: remediations.filter(r => r.status === 'in-progress').length,
    blocked: remediations.filter(r => r.status === 'blocked').length,
    resolved: remediations.filter(r => r.status === 'resolved').length,
    overdue: remediations.filter(r => r.status !== 'resolved' && new Date(r.dueDate) < new Date()).length,
  }), [remediations]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Remediation Tracker</h3>
        <p className="text-xs text-slate-500 mt-0.5">Open control findings and remediation status</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-2 p-4 bg-slate-50/50 border-b border-slate-100">
        <div className="text-center">
          <div className="text-lg font-bold text-rose-600">{summary.open}</div>
          <div className="text-[10px] text-slate-500">Open</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-600">{summary.inProgress}</div>
          <div className="text-[10px] text-slate-500">In Progress</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-red-600">{summary.blocked}</div>
          <div className="text-[10px] text-slate-500">Blocked</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-emerald-600">{summary.resolved}</div>
          <div className="text-[10px] text-slate-500">Resolved</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-rose-700">{summary.overdue}</div>
          <div className="text-[10px] text-slate-500">Overdue</div>
        </div>
      </div>

      {/* Remediation List */}
      <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
        {remediations.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No remediations for selected agents</div>
        ) : (
          remediations.map((rem) => {
            const statusConfig = REMEDIATION_CONFIG[rem.status];
            const control = MOCK_CONTROLS.find(c => c.id === rem.controlId);
            const isOverdue = rem.status !== 'resolved' && new Date(rem.dueDate) < new Date();

            return (
              <div key={rem.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
                        {statusConfig.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${RISK_TIER_CONFIG[rem.severity].bg} ${RISK_TIER_CONFIG[rem.severity].text}`}>
                        {rem.severity}
                      </span>
                      {isOverdue && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                          OVERDUE
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-900 mt-1">{rem.finding}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Control: {control?.name || rem.controlId} | Owner: {rem.owner}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Created: {rem.createdAt}</span>
                  <span className={isOverdue ? 'text-rose-600 font-medium' : ''}>Due: {rem.dueDate}</span>
                </div>
                {rem.resolution && (
                  <div className="mt-2 p-2 bg-emerald-50 rounded text-xs text-emerald-700">
                    <strong>Resolution:</strong> {rem.resolution}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ExceptionRegister({ agentIds }: { agentIds: string[] }) {
  const exceptions = getExceptionsForAgents(agentIds);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Exception Register</h3>
        <p className="text-xs text-slate-500 mt-0.5">Approved control exceptions with compensating controls</p>
      </div>
      <div className="divide-y divide-slate-100">
        {exceptions.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No exceptions for selected agents</div>
        ) : (
          exceptions.map((exc) => {
            const control = MOCK_CONTROLS.find(c => c.id === exc.controlId);
            const agents = MOCK_AGENTS.filter(a => exc.agentIds.includes(a.id));
            const isExpiringSoon = new Date(exc.expiresAt) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            return (
              <div key={exc.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        exc.status === 'active' ? 'bg-amber-100 text-amber-700' :
                        exc.status === 'expired' ? 'bg-slate-100 text-slate-500' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {exc.status.toUpperCase()}
                      </span>
                      {isExpiringSoon && exc.status === 'active' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">
                          Expiring Soon
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-900 mt-1">{control?.name || exc.controlId}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Agents: {agents.map(a => a.name).join(', ')}
                    </div>
                  </div>
                </div>
                <div className="mt-2 p-2 bg-slate-50 rounded">
                  <div className="text-xs text-slate-600"><strong>Reason:</strong> {exc.reason}</div>
                </div>
                <div className="mt-2 p-2 bg-blue-50 rounded">
                  <div className="text-xs text-blue-700">
                    <strong>Compensating Controls:</strong>
                    <ul className="mt-1 list-disc list-inside">
                      {exc.compensatingControls.map((cc, i) => <li key={i}>{cc}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                  <span>Approved by: {exc.approvedBy} on {exc.approvedAt}</span>
                  <span>Expires: {exc.expiresAt}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function AttestationStatus({ controls }: { controls: Control[] }) {
  const attestations = MOCK_ATTESTATIONS.filter(a =>
    controls.some(c => c.id === a.controlId)
  );

  const summary = useMemo(() => ({
    attested: attestations.filter(a => a.status === 'attested').length,
    pending: attestations.filter(a => a.status === 'pending').length,
    expired: attestations.filter(a => a.status === 'expired').length,
    controlsNeedingAttestation: controls.filter(c =>
      !attestations.some(a => a.controlId === c.id && a.status === 'attested')
    ).length,
  }), [attestations, controls]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Attestation Status</h3>
        <p className="text-xs text-slate-500 mt-0.5">Control owner and risk manager sign-offs</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 p-4 bg-slate-50/50 border-b border-slate-100">
        <div className="text-center">
          <div className="text-lg font-bold text-emerald-600">{summary.attested}</div>
          <div className="text-[10px] text-slate-500">Attested</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-600">{summary.pending}</div>
          <div className="text-[10px] text-slate-500">Pending</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-rose-600">{summary.expired}</div>
          <div className="text-[10px] text-slate-500">Expired</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-slate-600">{summary.controlsNeedingAttestation}</div>
          <div className="text-[10px] text-slate-500">Need Attestation</div>
        </div>
      </div>

      {/* Attestation List */}
      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
        {attestations.map((att) => {
          const control = controls.find(c => c.id === att.controlId);
          const roleLabel = {
            'control-owner': 'Control Owner',
            'risk-manager': 'Risk Manager',
            'audit-committee': 'Audit Committee',
            'ciso': 'CISO',
          }[att.role];

          return (
            <div key={att.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-900">{control?.name}</div>
                <div className="text-xs text-slate-500">{att.attestedBy} ({roleLabel})</div>
              </div>
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  att.status === 'attested' ? 'bg-emerald-100 text-emerald-700' :
                  att.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {att.status}
                </span>
                <div className="text-[10px] text-slate-400 mt-0.5">{att.attestedAt}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AggregateStats({
  agents,
  controls,
}: {
  agents: Agent[];
  controls: Control[];
}) {
  const stats = useMemo(() => {
    const effectiveControls = controls.filter(c => c.operatingEffectiveness === 'effective').length;
    const totalFindings = controls.reduce((sum, c) => sum + c.findings, 0);
    const avgResidualRisk = controls.reduce((sum, c) => sum + c.residualRisk, 0) / controls.length;
    const overdueTests = controls.filter(c => new Date(c.nextTestDue) < new Date()).length;
    const remediations = getRemediationsForAgents(agents.map(a => a.id));
    const openRemediations = remediations.filter(r => r.status !== 'resolved').length;

    return {
      totalAgents: agents.length,
      totalControls: controls.length,
      effectiveControls,
      effectivenessRate: Math.round((effectiveControls / controls.length) * 100),
      totalFindings,
      avgResidualRisk: avgResidualRisk.toFixed(1),
      overdueTests,
      openRemediations,
    };
  }, [agents, controls]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <StatCard label="Agents" value={stats.totalAgents.toString()} sub="selected" />
      <StatCard label="Controls" value={stats.totalControls.toString()} sub="applicable" />
      <StatCard
        label="Effectiveness"
        value={`${stats.effectivenessRate}%`}
        sub={`${stats.effectiveControls} effective`}
        variant={stats.effectivenessRate >= 80 ? 'success' : stats.effectivenessRate >= 60 ? 'warning' : 'danger'}
      />
      <StatCard
        label="Findings"
        value={stats.totalFindings.toString()}
        sub="open"
        variant={stats.totalFindings > 5 ? 'warning' : 'default'}
      />
      <StatCard
        label="Avg Risk"
        value={stats.avgResidualRisk}
        sub="residual (1-10)"
        variant={parseFloat(stats.avgResidualRisk) > 5 ? 'warning' : 'success'}
      />
      <StatCard
        label="Overdue Tests"
        value={stats.overdueTests.toString()}
        sub="need attention"
        variant={stats.overdueTests > 0 ? 'danger' : 'success'}
      />
      <StatCard
        label="Remediations"
        value={stats.openRemediations.toString()}
        sub="in progress"
        variant={stats.openRemediations > 3 ? 'warning' : 'default'}
      />
      <StatCard label="Frameworks" value="3" sub="mapped" />
    </div>
  );
}

// ============================================================================
// Evidence Management Component
// ============================================================================

function EvidenceManagement({ controls }: { controls: Control[] }) {
  const [filterType, setFilterType] = useState<EvidenceType | 'all'>('all');
  const [filterControl, setFilterControl] = useState<string>('all');
  const [filterIntegrity, setFilterIntegrity] = useState<IntegrityStatus | 'all'>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [selectedEvidence, setSelectedEvidence] = useState<Set<string>>(new Set());
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const [showRequestDrawer, setShowRequestDrawer] = useState(false);
  const [showCustodyDrawer, setShowCustodyDrawer] = useState<EnterpriseEvidenceArtifact | null>(null);

  const filteredEvidence = useMemo(() => {
    return MOCK_ENTERPRISE_EVIDENCE.filter(ev => {
      if (filterType !== 'all' && ev.type !== filterType) return false;
      if (filterControl !== 'all' && !ev.controlIds.includes(filterControl)) return false;
      if (filterIntegrity !== 'all' && ev.integrityStatus !== filterIntegrity) return false;
      if (filterDateRange !== 'all') {
        const collectedDate = new Date(ev.collectedAt);
        const now = new Date();
        const daysDiff = (now.getTime() - collectedDate.getTime()) / (1000 * 60 * 60 * 24);
        const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
        if (daysDiff > daysMap[filterDateRange]) return false;
      }
      return true;
    });
  }, [filterType, filterControl, filterIntegrity, filterDateRange]);

  const stats = useMemo(() => {
    const all = MOCK_ENTERPRISE_EVIDENCE;
    const now = new Date();
    return {
      total: all.length,
      verified: all.filter(e => e.integrityStatus === 'verified').length,
      pending: all.filter(e => e.integrityStatus === 'pending').length,
      failed: all.filter(e => e.integrityStatus === 'failed').length,
      autoCollected: all.filter(e => e.collectionMethod === 'automated').length,
      manual: all.filter(e => e.collectionMethod === 'manual').length,
      expiringSoon: all.filter(e => {
        if (!e.expiresAt) return false;
        const expiry = new Date(e.expiresAt);
        const daysToExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return daysToExpiry <= 90 && daysToExpiry > 0;
      }).length,
      legalHold: all.filter(e => e.retentionPolicy.legalHold).length,
    };
  }, []);

  const handleSelectEvidence = (id: string) => {
    const newSelected = new Set(selectedEvidence);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEvidence(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedEvidence.size === filteredEvidence.length) {
      setSelectedEvidence(new Set());
    } else {
      setSelectedEvidence(new Set(filteredEvidence.map(e => e.id)));
    }
  };

  const getCollectionStatusBadge = (evidence: EnterpriseEvidenceArtifact) => {
    const now = new Date();
    const collected = new Date(evidence.collectedAt);
    const daysSinceCollection = (now.getTime() - collected.getTime()) / (1000 * 60 * 60 * 24);

    if (evidence.expiresAt) {
      const expiry = new Date(evidence.expiresAt);
      const daysToExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysToExpiry <= 30 && daysToExpiry > 0) {
        return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Expiring Soon' };
      }
    }

    if (daysSinceCollection > 90) {
      return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Stale' };
    }

    return COLLECTION_METHOD_CONFIG[evidence.collectionMethod];
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{stats.total}</div>
          <div className="text-[10px] text-slate-500">Total Artifacts</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-emerald-600">{stats.verified}</div>
          <div className="text-[10px] text-slate-500">Verified</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-amber-600">{stats.pending}</div>
          <div className="text-[10px] text-slate-500">Pending</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-rose-600">{stats.failed}</div>
          <div className="text-[10px] text-slate-500">Failed</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-blue-600">{stats.autoCollected}</div>
          <div className="text-[10px] text-slate-500">Auto-Collected</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-slate-600">{stats.manual}</div>
          <div className="text-[10px] text-slate-500">Manual</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-orange-600">{stats.expiringSoon}</div>
          <div className="text-[10px] text-slate-500">Expiring Soon</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
          <div className="text-lg font-bold text-violet-600">{stats.legalHold}</div>
          <div className="text-[10px] text-slate-500">Legal Hold</div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as EvidenceType | 'all')}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          >
            <option value="all">All Types</option>
            {Object.entries(EVIDENCE_TYPE_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>

          <select
            value={filterControl}
            onChange={(e) => setFilterControl(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          >
            <option value="all">All Controls</option>
            {controls.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filterIntegrity}
            onChange={(e) => setFilterIntegrity(e.target.value as IntegrityStatus | 'all')}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          >
            <option value="all">All Integrity Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value as 'all' | '7d' | '30d' | '90d')}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          >
            <option value="all">All Dates</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          <div className="flex-1" />

          <button
            onClick={() => setShowRequestDrawer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
          >
            <Icon name="plus" className="w-4 h-4" />
            Request Evidence
          </button>

          {selectedEvidence.size > 0 && (
            <button
              type="button"
              disabled
              title="Bulk evidence download is planned and not available in this demo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg opacity-50 cursor-not-allowed"
            >
              <Icon name="arrow-down-tray" className="w-4 h-4" />
              Download ({selectedEvidence.size}) (demo)
            </button>
          )}
        </div>
      </div>

      {/* Evidence Requests Alert */}
      {MOCK_EVIDENCE_REQUESTS.filter(r => r.status === 'overdue' || r.status === 'pending').length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-amber-800">Outstanding Evidence Requests</h4>
              <div className="mt-2 space-y-1">
                {MOCK_EVIDENCE_REQUESTS.filter(r => r.status === 'overdue' || r.status === 'pending').map(req => {
                  const control = MOCK_CONTROLS.find(c => req.controlIds.includes(c.id));
                  return (
                    <div key={req.id} className="flex items-center justify-between text-xs">
                      <span className="text-amber-700">
                        <span className="font-medium">{EVIDENCE_TYPE_CONFIG[req.evidenceType].label}</span>
                        {' '}for {control?.name || req.controlIds[0]}
                      </span>
                      <span className={`px-2 py-0.5 rounded ${
                        req.status === 'overdue' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {req.status === 'overdue' ? 'OVERDUE' : 'Due ' + req.dueDate}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Gallery */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Evidence Gallery</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {filteredEvidence.length} artifact{filteredEvidence.length !== 1 ? 's' : ''} | Click to expand
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedEvidence.size === filteredEvidence.length && filteredEvidence.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300"
            />
            Select All
          </label>
        </div>

        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {filteredEvidence.map((evidence) => {
            const typeConfig = EVIDENCE_TYPE_CONFIG[evidence.type];
            const integrityConfig = INTEGRITY_STATUS_CONFIG[evidence.integrityStatus];
            const collectionBadge = getCollectionStatusBadge(evidence);
            const isExpanded = expandedEvidence === evidence.id;
            const linkedControls = MOCK_CONTROLS.filter(c => evidence.controlIds.includes(c.id));

            return (
              <div key={evidence.id} className="group">
                {/* Main Row */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                    isExpanded ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setExpandedEvidence(isExpanded ? null : evidence.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedEvidence.has(evidence.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectEvidence(evidence.id);
                    }}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                  />

                  <div className={`w-10 h-10 rounded-lg ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon name={typeConfig.icon as any} className={`w-5 h-5 ${typeConfig.text}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 truncate">{evidence.name}</span>
                      {evidence.retentionPolicy.legalHold && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">
                          LEGAL HOLD
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {linkedControls.map(c => c.name).join(', ') || 'No linked controls'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${typeConfig.bg} ${typeConfig.text}`}>
                      {typeConfig.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${collectionBadge.bg} ${collectionBadge.text}`}>
                      {collectionBadge.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${integrityConfig.bg} ${integrityConfig.text}`}>
                      <Icon name={integrityConfig.icon as any} className="w-3 h-3" />
                      {integrityConfig.label}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 w-24 text-right flex-shrink-0">
                    {formatDate(evidence.collectedAt)}
                  </div>

                  <Icon
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    className="w-4 h-4 text-slate-400 flex-shrink-0"
                  />
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-slate-50/50">
                    <div className="mt-2 p-4 bg-white rounded-lg border border-slate-200 space-y-4">
                      {/* Description */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-1">Description</h4>
                        <p className="text-sm text-slate-600">{evidence.description}</p>
                      </div>

                      {/* Metadata Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-slate-500">System Source</span>
                          <div className="font-medium text-slate-800">{evidence.systemSource}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">Collected By</span>
                          <div className="font-medium text-slate-800">{evidence.collectorIdentity.name}</div>
                          <div className="text-slate-500">{evidence.collectorIdentity.role}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">File Size</span>
                          <div className="font-medium text-slate-800">{evidence.fileSize || 'N/A'}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">Retention</span>
                          <div className="font-medium text-slate-800">Until {formatDate(evidence.retentionPolicy.retainUntil)}</div>
                        </div>
                      </div>

                      {/* Integrity Hash */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-1">Integrity Hash (SHA-256)</h4>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded truncate">
                            {evidence.integrityHash}
                          </code>
                          <span className="text-[10px] text-slate-500">
                            Verified: {formatDateTime(evidence.hashVerifiedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Location */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-1">Location</h4>
                        <code className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded block truncate">
                          {evidence.location}
                        </code>
                      </div>

                      {/* Linked Controls */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-1">Linked Controls</h4>
                        <div className="flex flex-wrap gap-1">
                          {linkedControls.map(c => (
                            <span key={c.id} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          disabled
                          title="Evidence download is planned and not available in this demo"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded opacity-50 cursor-not-allowed"
                        >
                          <Icon name="arrow-down-tray" className="w-3.5 h-3.5" />
                          Download (demo)
                        </button>
                        <button
                          onClick={() => setShowCustodyDrawer(evidence)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded hover:bg-slate-200 transition"
                        >
                          <Icon name="clock" className="w-3.5 h-3.5" />
                          View Chain of Custody
                        </button>
                        <button
                          type="button"
                          disabled
                          title="Linking evidence to controls is planned and not available in this demo"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded opacity-50 cursor-not-allowed"
                        >
                          <Icon name="link" className="w-3.5 h-3.5" />
                          Link to Control (demo)
                        </button>
                        <button
                          type="button"
                          disabled
                          title="Integrity verification is planned and not available in this demo"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded opacity-50 cursor-not-allowed"
                        >
                          <Icon name="shield-check" className="w-3.5 h-3.5" />
                          Verify Integrity (demo)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredEvidence.length === 0 && (
            <div className="p-8 text-center">
              <Icon name="document-magnifying-glass" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No evidence artifacts match your filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Chain of Custody Drawer */}
      <Drawer
        open={showCustodyDrawer !== null}
        onClose={() => setShowCustodyDrawer(null)}
        title="Chain of Custody"
        subtitle={showCustodyDrawer?.name || ''}
        width="md"
      >
        {showCustodyDrawer && (
          <div className="space-y-6">
            {/* Artifact Info */}
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg ${EVIDENCE_TYPE_CONFIG[showCustodyDrawer.type].bg} flex items-center justify-center`}>
                  <Icon
                    name={EVIDENCE_TYPE_CONFIG[showCustodyDrawer.type].icon as any}
                    className={`w-5 h-5 ${EVIDENCE_TYPE_CONFIG[showCustodyDrawer.type].text}`}
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{showCustodyDrawer.name}</div>
                  <div className="text-xs text-slate-500">{EVIDENCE_TYPE_CONFIG[showCustodyDrawer.type].label}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Collected</span>
                  <div className="font-medium text-slate-800">{formatDateTime(showCustodyDrawer.collectedAt)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Integrity Status</span>
                  <div className={`font-medium ${INTEGRITY_STATUS_CONFIG[showCustodyDrawer.integrityStatus].text}`}>
                    {INTEGRITY_STATUS_CONFIG[showCustodyDrawer.integrityStatus].label}
                  </div>
                </div>
              </div>
            </div>

            {/* Integrity Hash */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Integrity Hash</h4>
              <code className="text-[10px] font-mono text-slate-600 bg-slate-100 px-3 py-2 rounded block break-all">
                {showCustodyDrawer.integrityHash}
              </code>
              <div className="text-xs text-slate-500 mt-1">
                Last verified: {formatDateTime(showCustodyDrawer.hashVerifiedAt)}
              </div>
            </div>

            {/* Collector Identity */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Collector Identity</h4>
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                <div className="font-medium text-slate-800">{showCustodyDrawer.collectorIdentity.name}</div>
                <div className="text-xs text-slate-600">{showCustodyDrawer.collectorIdentity.email}</div>
                <div className="text-xs text-slate-500 mt-1">Role: {showCustodyDrawer.collectorIdentity.role}</div>
              </div>
            </div>

            {/* Retention Policy */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Retention Policy</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Retain Until</span>
                  <span className="font-medium text-slate-800">{formatDate(showCustodyDrawer.retentionPolicy.retainUntil)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Legal Hold</span>
                  <span className={`font-medium ${showCustodyDrawer.retentionPolicy.legalHold ? 'text-violet-700' : 'text-slate-800'}`}>
                    {showCustodyDrawer.retentionPolicy.legalHold ? 'Yes' : 'No'}
                  </span>
                </div>
                {showCustodyDrawer.retentionPolicy.deletionApprover && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Deletion Approver</span>
                    <span className="font-medium text-slate-800">{showCustodyDrawer.retentionPolicy.deletionApprover}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Chain of Custody Timeline */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Custody Timeline</h4>
              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />
                <div className="space-y-4">
                  {showCustodyDrawer.chainOfCustody.map((entry, index) => (
                    <div key={index} className="relative flex gap-3 pl-8">
                      <div className="absolute left-0 w-6 h-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-indigo-600" />
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">{entry.action}</span>
                          <span className="text-xs text-slate-500">{formatDateTime(entry.timestamp)}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">By: {entry.actor}</div>
                        {entry.notes && (
                          <div className="text-xs text-slate-500 mt-1 italic">{entry.notes}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Evidence Request Drawer */}
      <Drawer
        open={showRequestDrawer}
        onClose={() => setShowRequestDrawer(false)}
        title="Request Evidence"
        subtitle="Request missing evidence from owner"
        width="md"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Evidence Type</label>
            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              {Object.entries(EVIDENCE_TYPE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Linked Controls</label>
            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" multiple>
              {controls.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
            <input
              type="text"
              placeholder="e.g., Security Team"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              rows={3}
              placeholder="Describe what evidence is needed and why..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled
              title="Submitting evidence requests is planned and not available in this demo"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg opacity-50 cursor-not-allowed"
            >
              <Icon name="paper-airplane" className="w-4 h-4" />
              Send Request (demo)
            </button>
            <p className="text-xs text-slate-500 text-center mt-2">
              Request submission is planned; this form is not wired up in this demo.
            </p>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ReportsCenter() {
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<'coverage' | 'requirements' | 'remediation' | 'exceptions' | 'attestation' | 'evidence'>('coverage');
  const [showExportDrawer, setShowExportDrawer] = useState(false);

  const selectedAgents = useMemo(() =>
    MOCK_AGENTS.filter(a => selectedAgentIds.includes(a.id)),
    [selectedAgentIds]
  );

  const applicableControls = useMemo(() => {
    if (selectedAgentIds.length === 0) return MOCK_CONTROLS;

    const controlSet = new Set<string>();
    selectedAgentIds.forEach(agentId => {
      getControlsForAgent(agentId).forEach(c => controlSet.add(c.id));
    });
    return MOCK_CONTROLS.filter(c => controlSet.has(c.id));
  }, [selectedAgentIds]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CoreBadge pillar="show" compact />
          <MockDataBadge integration="Connect GRC, ITSM, and Audit systems for live data" />
        </div>
        <button
          onClick={() => setShowExportDrawer(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
        >
          <Icon name="document-arrow-down" className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Aggregate Stats */}
      {selectedAgentIds.length > 0 && (
        <AggregateStats agents={selectedAgents} controls={applicableControls} />
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Agent Selection */}
        <div className="lg:col-span-1">
          <AgentMultiSelect
            agents={MOCK_AGENTS}
            selectedIds={selectedAgentIds}
            onSelectionChange={setSelectedAgentIds}
          />
        </div>

        {/* Right: Analysis Views */}
        <div className="lg:col-span-3 space-y-6">
          {/* View Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit flex-wrap">
            {[
              { id: 'coverage', label: 'Coverage Matrix', icon: 'table-cells' },
              { id: 'requirements', label: 'Requirements', icon: 'clipboard-document-list' },
              { id: 'evidence', label: 'Evidence', icon: 'folder-open' },
              { id: 'remediation', label: 'Remediation', icon: 'wrench-screwdriver' },
              { id: 'exceptions', label: 'Exceptions', icon: 'shield-exclamation' },
              { id: 'attestation', label: 'Attestation', icon: 'check-badge' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as typeof activeView)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeView === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon name={tab.icon as any} className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* View Content */}
          {activeView === 'coverage' && (
            <ControlCoverageMatrix agents={selectedAgents} controls={applicableControls} />
          )}
          {activeView === 'requirements' && (
            <RequirementMappingView controls={applicableControls} />
          )}
          {activeView === 'evidence' && (
            <EvidenceManagement controls={applicableControls} />
          )}
          {activeView === 'remediation' && (
            <RemediationTracker agentIds={selectedAgentIds} />
          )}
          {activeView === 'exceptions' && (
            <ExceptionRegister agentIds={selectedAgentIds} />
          )}
          {activeView === 'attestation' && (
            <AttestationStatus controls={applicableControls} />
          )}
        </div>
      </div>

      {/* Export Drawer */}
      <Drawer
        open={showExportDrawer}
        onClose={() => setShowExportDrawer(false)}
        title="Export Report"
        subtitle="Generate audit package"
        width="md"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Report Contents</h4>
            <div className="space-y-2">
              {[
                { id: 'summary', label: 'Executive Summary', checked: true },
                { id: 'coverage', label: 'Control Coverage Matrix', checked: true },
                { id: 'requirements', label: 'Requirement Mapping', checked: true },
                { id: 'effectiveness', label: 'Effectiveness Analysis', checked: true },
                { id: 'evidence', label: 'Evidence Artifacts', checked: true },
                { id: 'remediations', label: 'Remediation Status', checked: true },
                { id: 'exceptions', label: 'Exception Register', checked: true },
                { id: 'attestations', label: 'Attestation Chain', checked: true },
                { id: 'trends', label: 'Historical Trends', checked: false },
              ].map((item) => (
                <label key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50">
                  <input type="checkbox" defaultChecked={item.checked} className="w-4 h-4 text-indigo-600 rounded" />
                  <span className="text-sm text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Export Format</h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'pdf', label: 'PDF', icon: 'document-text' },
                { id: 'excel', label: 'Excel', icon: 'table-cells' },
                { id: 'json', label: 'JSON', icon: 'code-bracket' },
              ].map((format) => (
                <button
                  key={format.id}
                  type="button"
                  disabled
                  title={`${format.label} export is planned and not available in this demo`}
                  className="flex flex-col items-center gap-2 p-4 border border-slate-200 rounded-lg opacity-50 cursor-not-allowed"
                >
                  <Icon name={format.icon as any} className="w-6 h-6 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{format.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Export generation is planned; format selection is not wired up in this demo.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Regulatory Format</h4>
            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              <option value="">Standard Format</option>
              <option value="sr26-2">SR 26-2 Examination Package</option>
              <option value="nist">NIST AI RMF Self-Assessment</option>
              <option value="euai">EU AI Act Art. 11 Documentation</option>
              <option value="soc2">SOC 2 Type II Evidence</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled
              title="Report generation is planned and not available in this demo"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg opacity-50 cursor-not-allowed"
            >
              <Icon name="document-arrow-down" className="w-4 h-4" />
              Generate Report (demo)
            </button>
            <p className="text-xs text-slate-500 text-center mt-2">
              Planned feature — {selectedAgentIds.length} agents, {applicableControls.length} controls would be included.
            </p>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
