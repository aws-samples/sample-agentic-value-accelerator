/**
 * AI-DLC v2 (AI-Driven Development Life Cycle) Data
 *
 * Reference: https://github.com/awslabs/aidlc-workflows/tree/v2
 *
 * AI-DLC provides adaptive workflow steering rules for AI coding agents,
 * transforming them into verifiable, self-correcting engineering workflows.
 *
 * v2 features:
 * - 5 phases (Initialization → Ideation → Inception → Construction → Operation)
 * - 32 stages total
 * - Multi-harness: Claude Code, Kiro IDE, Kiro CLI, Codex CLI, opencode
 * - 14 agents (11 domain + 2 quality-gate reviewers + 1 composer)
 * - 74-event audit trail for enterprise traceability
 */

// Phase definitions (AI-DLC v2: 5 phases)
export type AidlcPhase = 'initialization' | 'ideation' | 'inception' | 'construction' | 'operation' | 'operations';

export interface AidlcStage {
  id: string;
  name: string;
  phase: AidlcPhase;
  execution: 'always' | 'conditional';
  description: string;
}

export const AIDLC_STAGES: AidlcStage[] = [
  // Inception Phase - What to build and Why
  { id: 'workspace-detection', name: 'Workspace Detection', phase: 'inception', execution: 'always', description: 'Detect greenfield/brownfield, check for existing state' },
  { id: 'reverse-engineering', name: 'Reverse Engineering', phase: 'inception', execution: 'conditional', description: 'Document existing architecture, APIs, components' },
  { id: 'requirements-analysis', name: 'Requirements Analysis', phase: 'inception', execution: 'always', description: 'Gather functional/non-functional requirements' },
  { id: 'user-stories', name: 'User Stories', phase: 'inception', execution: 'conditional', description: 'Create personas, acceptance criteria' },
  { id: 'workflow-planning', name: 'Workflow Planning', phase: 'inception', execution: 'always', description: 'Determine phases to execute, create execution plan' },
  { id: 'application-design', name: 'Application Design', phase: 'inception', execution: 'conditional', description: 'Define component methods, business rules' },
  { id: 'units-generation', name: 'Units Generation', phase: 'inception', execution: 'conditional', description: 'Break system into parallel development units' },
  // Construction Phase - How to build it
  { id: 'functional-design', name: 'Functional Design', phase: 'construction', execution: 'conditional', description: 'Per-unit: data models, business logic' },
  { id: 'nfr-requirements', name: 'NFR Requirements', phase: 'construction', execution: 'conditional', description: 'Per-unit: performance, security, scalability' },
  { id: 'nfr-design', name: 'NFR Design', phase: 'construction', execution: 'conditional', description: 'Per-unit: applying NFR patterns' },
  { id: 'infrastructure-design', name: 'Infrastructure Design', phase: 'construction', execution: 'conditional', description: 'Per-unit: cloud resource mapping' },
  { id: 'code-generation', name: 'Code Generation', phase: 'construction', execution: 'always', description: 'Per-unit: two-part planning + generation' },
  { id: 'build-and-test', name: 'Build and Test', phase: 'construction', execution: 'always', description: 'All units: unified testing' },
  // Operations Phase - How to deploy and run it
  { id: 'deployment', name: 'Deployment', phase: 'operations', execution: 'conditional', description: 'Deployment planning and automation' },
  { id: 'monitoring', name: 'Monitoring', phase: 'operations', execution: 'conditional', description: 'Observability and alerting setup' },
];

// Extension rule definitions
export interface AidlcExtension {
  id: string;
  name: string;
  category: 'security' | 'testing' | 'resiliency' | 'custom';
  ruleCount: number;
  description: string;
  optIn: boolean;
  blocking: boolean;
}

export const AIDLC_EXTENSIONS: AidlcExtension[] = [
  { id: 'security-baseline', name: 'Security Baseline', category: 'security', ruleCount: 15, description: 'Encryption, logging, access control, headers, validation', optIn: true, blocking: true },
  { id: 'property-based-testing', name: 'Property-Based Testing', category: 'testing', ruleCount: 10, description: 'Round-trip, invariant, idempotence, generators', optIn: true, blocking: true },
  { id: 'resiliency-baseline', name: 'Resiliency Baseline', category: 'resiliency', ruleCount: 15, description: 'HA, DR, monitoring, change management', optIn: true, blocking: true },
];

// Extension rules
export interface AidlcRule {
  id: string;
  extensionId: string;
  title: string;
  statement: string;
  verificationCriteria: string[];
}

export const AIDLC_RULES: AidlcRule[] = [
  // Security rules
  { id: 'SECURITY-01', extensionId: 'security-baseline', title: 'Encryption at Rest', statement: 'All data stores MUST enable encryption at rest', verificationCriteria: ['S3 buckets have SSE enabled', 'RDS instances use encrypted storage', 'DynamoDB tables enable encryption'] },
  { id: 'SECURITY-02', extensionId: 'security-baseline', title: 'Encryption in Transit', statement: 'All network communication MUST use TLS 1.2+', verificationCriteria: ['API endpoints enforce HTTPS', 'Internal services use TLS', 'No HTTP fallbacks'] },
  { id: 'SECURITY-03', extensionId: 'security-baseline', title: 'Secret Management', statement: 'Secrets MUST NOT be hardcoded or committed', verificationCriteria: ['No secrets in source code', 'Using Secrets Manager or Parameter Store', 'Environment variables for local dev only'] },
  { id: 'SECURITY-04', extensionId: 'security-baseline', title: 'Input Validation', statement: 'All external inputs MUST be validated', verificationCriteria: ['Request schemas defined', 'Path/query params validated', 'File uploads sanitized'] },
  { id: 'SECURITY-05', extensionId: 'security-baseline', title: 'Authentication', statement: 'All endpoints MUST require authentication', verificationCriteria: ['Auth middleware applied', 'Public routes explicitly marked', 'Token validation implemented'] },
  // Testing rules
  { id: 'PBT-01', extensionId: 'property-based-testing', title: 'Round-Trip Property', statement: 'Serialization/deserialization MUST be reversible', verificationCriteria: ['encode(decode(x)) == x', 'parse(stringify(obj)) == obj'] },
  { id: 'PBT-02', extensionId: 'property-based-testing', title: 'Invariant Preservation', statement: 'Operations MUST preserve invariants', verificationCriteria: ['State invariants checked post-operation', 'Constraint violations caught'] },
  { id: 'PBT-03', extensionId: 'property-based-testing', title: 'Idempotence', statement: 'Idempotent operations MUST produce same result', verificationCriteria: ['PUT/DELETE returns same state', 'Retry-safe operations verified'] },
  // Resiliency rules
  { id: 'RESILIENCY-01', extensionId: 'resiliency-baseline', title: 'Health Checks', statement: 'All services MUST expose health endpoints', verificationCriteria: ['/health returns 200', 'Dependency health reported', 'Metrics exposed'] },
  { id: 'RESILIENCY-02', extensionId: 'resiliency-baseline', title: 'Graceful Degradation', statement: 'Services MUST degrade gracefully', verificationCriteria: ['Circuit breakers implemented', 'Fallbacks defined', 'Timeouts configured'] },
  { id: 'RESILIENCY-03', extensionId: 'resiliency-baseline', title: 'Retry Logic', statement: 'External calls MUST implement retries', verificationCriteria: ['Exponential backoff', 'Max retry limits', 'Jitter applied'] },
];

// Project state tracking
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'blocked';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes-requested';

export interface AidlcProject {
  id: string;
  name: string;
  repository: string;
  currentPhase: AidlcPhase;
  currentStage: string;
  status: ProjectStatus;
  lastActivity: string;
  enabledExtensions: string[];
  progress: {
    inception: number;
    construction: number;
    operations: number;
  };
  violations: number;
  pendingApprovals: number;
  teamMembers: string[];
}

// Sample projects for demo
export const AIDLC_PROJECTS: AidlcProject[] = [
  {
    id: 'proj-001',
    name: 'Payment Service Refactor',
    repository: 'fsi-platform/payment-service',
    currentPhase: 'construction',
    currentStage: 'code-generation',
    status: 'active',
    lastActivity: '2 hours ago',
    enabledExtensions: ['security-baseline', 'property-based-testing'],
    progress: { inception: 100, construction: 65, operations: 0 },
    violations: 2,
    pendingApprovals: 1,
    teamMembers: ['jsmith', 'mlee', 'akumar'],
  },
  {
    id: 'proj-002',
    name: 'KYC Automation Agent',
    repository: 'fsi-platform/kyc-agent',
    currentPhase: 'inception',
    currentStage: 'application-design',
    status: 'active',
    lastActivity: '30 minutes ago',
    enabledExtensions: ['security-baseline', 'resiliency-baseline'],
    progress: { inception: 70, construction: 0, operations: 0 },
    violations: 0,
    pendingApprovals: 2,
    teamMembers: ['tchen', 'rgarcia'],
  },
  {
    id: 'proj-003',
    name: 'Fraud Detection Pipeline',
    repository: 'fsi-platform/fraud-detection',
    currentPhase: 'construction',
    currentStage: 'build-and-test',
    status: 'blocked',
    lastActivity: '1 day ago',
    enabledExtensions: ['security-baseline', 'property-based-testing', 'resiliency-baseline'],
    progress: { inception: 100, construction: 90, operations: 0 },
    violations: 5,
    pendingApprovals: 0,
    teamMembers: ['jsmith', 'tchen'],
  },
  {
    id: 'proj-004',
    name: 'Customer Portal Upgrade',
    repository: 'fsi-platform/customer-portal',
    currentPhase: 'operations',
    currentStage: 'monitoring',
    status: 'active',
    lastActivity: '4 hours ago',
    enabledExtensions: ['security-baseline'],
    progress: { inception: 100, construction: 100, operations: 40 },
    violations: 0,
    pendingApprovals: 0,
    teamMembers: ['mlee', 'akumar', 'rgarcia'],
  },
];

// Findings/violations
export interface AidlcFinding {
  id: string;
  projectId: string;
  ruleId: string;
  stage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'resolved' | 'waived';
  message: string;
  file?: string;
  line?: number;
  detectedAt: string;
  resolvedAt?: string;
}

export const AIDLC_FINDINGS: AidlcFinding[] = [
  { id: 'find-001', projectId: 'proj-001', ruleId: 'SECURITY-03', stage: 'code-generation', severity: 'high', status: 'open', message: 'Hardcoded API key detected in config.ts', file: 'src/config.ts', line: 42, detectedAt: '2 hours ago' },
  { id: 'find-002', projectId: 'proj-001', ruleId: 'SECURITY-04', stage: 'code-generation', severity: 'medium', status: 'open', message: 'Missing input validation on payment amount', file: 'src/handlers/payment.ts', line: 78, detectedAt: '2 hours ago' },
  { id: 'find-003', projectId: 'proj-003', ruleId: 'SECURITY-01', stage: 'infrastructure-design', severity: 'critical', status: 'open', message: 'S3 bucket encryption not enabled', file: 'infra/storage.tf', line: 15, detectedAt: '1 day ago' },
  { id: 'find-004', projectId: 'proj-003', ruleId: 'RESILIENCY-02', stage: 'functional-design', severity: 'high', status: 'open', message: 'No circuit breaker for ML inference calls', file: 'src/ml/predictor.ts', line: 112, detectedAt: '1 day ago' },
  { id: 'find-005', projectId: 'proj-003', ruleId: 'PBT-01', stage: 'build-and-test', severity: 'medium', status: 'open', message: 'Round-trip test failing for FraudScore serialization', file: 'tests/fraud-score.test.ts', line: 45, detectedAt: '1 day ago' },
  { id: 'find-006', projectId: 'proj-003', ruleId: 'SECURITY-05', stage: 'code-generation', severity: 'high', status: 'open', message: 'Unauthenticated endpoint exposed', file: 'src/routes/webhook.ts', line: 23, detectedAt: '1 day ago' },
  { id: 'find-007', projectId: 'proj-003', ruleId: 'RESILIENCY-03', stage: 'code-generation', severity: 'medium', status: 'open', message: 'External API call missing retry logic', file: 'src/services/external.ts', line: 67, detectedAt: '1 day ago' },
];

// Audit log entries
export interface AidlcAuditEntry {
  id: string;
  projectId: string;
  timestamp: string;
  stage: string;
  action: 'stage-started' | 'stage-completed' | 'approval-requested' | 'approval-granted' | 'approval-rejected' | 'finding-detected' | 'finding-resolved';
  user?: string;
  details: string;
}

export const AIDLC_AUDIT_LOG: AidlcAuditEntry[] = [
  { id: 'audit-001', projectId: 'proj-001', timestamp: '2024-07-29T11:30:00Z', stage: 'code-generation', action: 'finding-detected', details: 'SECURITY-03: Hardcoded API key detected' },
  { id: 'audit-002', projectId: 'proj-001', timestamp: '2024-07-29T11:00:00Z', stage: 'code-generation', action: 'stage-started', user: 'jsmith', details: 'Starting code generation for payment-handler unit' },
  { id: 'audit-003', projectId: 'proj-001', timestamp: '2024-07-29T10:45:00Z', stage: 'nfr-design', action: 'approval-granted', user: 'mlee', details: 'NFR design approved for payment-handler unit' },
  { id: 'audit-004', projectId: 'proj-002', timestamp: '2024-07-29T13:00:00Z', stage: 'application-design', action: 'approval-requested', user: 'tchen', details: 'Requesting approval for application architecture' },
  { id: 'audit-005', projectId: 'proj-003', timestamp: '2024-07-28T16:00:00Z', stage: 'build-and-test', action: 'finding-detected', details: 'SECURITY-01: S3 bucket encryption not enabled' },
  { id: 'audit-006', projectId: 'proj-004', timestamp: '2024-07-29T09:00:00Z', stage: 'monitoring', action: 'stage-started', user: 'rgarcia', details: 'Starting monitoring and observability setup' },
];

// Evaluator metrics
export interface AidlcEvaluatorMetrics {
  projectId: string;
  timestamp: string;
  codeQuality: {
    lintingScore: number;
    securityScore: number;
    duplicationPct: number;
  };
  testResults: {
    passRate: number;
    coveragePct: number;
    totalTests: number;
  };
  nfrCompliance: {
    tokenConsumption: number;
    executionTimeMs: number;
    crossModelConsistency: number;
  };
  semanticScore: number;
  overallScore: number;
}

export const AIDLC_METRICS: AidlcEvaluatorMetrics[] = [
  {
    projectId: 'proj-001',
    timestamp: '2024-07-29T12:00:00Z',
    codeQuality: { lintingScore: 92, securityScore: 78, duplicationPct: 3.2 },
    testResults: { passRate: 94, coveragePct: 82, totalTests: 156 },
    nfrCompliance: { tokenConsumption: 145000, executionTimeMs: 2340, crossModelConsistency: 89 },
    semanticScore: 87,
    overallScore: 85,
  },
  {
    projectId: 'proj-002',
    timestamp: '2024-07-29T12:00:00Z',
    codeQuality: { lintingScore: 96, securityScore: 95, duplicationPct: 1.1 },
    testResults: { passRate: 100, coveragePct: 78, totalTests: 42 },
    nfrCompliance: { tokenConsumption: 52000, executionTimeMs: 890, crossModelConsistency: 94 },
    semanticScore: 92,
    overallScore: 91,
  },
  {
    projectId: 'proj-003',
    timestamp: '2024-07-28T16:00:00Z',
    codeQuality: { lintingScore: 84, securityScore: 62, duplicationPct: 5.8 },
    testResults: { passRate: 78, coveragePct: 65, totalTests: 203 },
    nfrCompliance: { tokenConsumption: 312000, executionTimeMs: 4560, crossModelConsistency: 76 },
    semanticScore: 71,
    overallScore: 68,
  },
  {
    projectId: 'proj-004',
    timestamp: '2024-07-29T09:00:00Z',
    codeQuality: { lintingScore: 98, securityScore: 94, duplicationPct: 0.8 },
    testResults: { passRate: 99, coveragePct: 91, totalTests: 287 },
    nfrCompliance: { tokenConsumption: 98000, executionTimeMs: 1120, crossModelConsistency: 97 },
    semanticScore: 95,
    overallScore: 94,
  },
];

// AI-DLC v2 Phase colors and labels (5 phases)
export const PHASE_CONFIG: Record<AidlcPhase | string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  initialization: { label: 'Initialization', color: 'text-slate-700', bgColor: 'bg-slate-100', borderColor: 'border-slate-300' },
  ideation: { label: 'Ideation', color: 'text-purple-700', bgColor: 'bg-purple-100', borderColor: 'border-purple-300' },
  inception: { label: 'Inception', color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-300' },
  construction: { label: 'Construction', color: 'text-emerald-700', bgColor: 'bg-emerald-100', borderColor: 'border-emerald-300' },
  operation: { label: 'Operation', color: 'text-amber-700', bgColor: 'bg-amber-100', borderColor: 'border-amber-300' },
  // Keep old 'operations' for backwards compat with mock data
  operations: { label: 'Operations', color: 'text-amber-700', bgColor: 'bg-amber-100', borderColor: 'border-amber-300' },
};

// Extension category colors
export const EXTENSION_CATEGORY_CONFIG: Record<string, { color: string; bgColor: string }> = {
  security: { color: 'text-rose-700', bgColor: 'bg-rose-100' },
  testing: { color: 'text-violet-700', bgColor: 'bg-violet-100' },
  resiliency: { color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  custom: { color: 'text-slate-700', bgColor: 'bg-slate-100' },
};
