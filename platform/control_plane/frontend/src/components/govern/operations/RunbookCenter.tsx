/**
 * RunbookCenter - Operational Runbook Management and Execution System
 *
 * Provides:
 * - KPI dashboard for runbook metrics
 * - Runbook library with grid/list views
 * - Step-by-step runbook detail view with flowchart
 * - Real-time execution tracking with approval gates
 * - Execution history with filtering
 * - Create/Edit runbook builder
 *
 * Pre-built runbooks cover: Incident Response, Scaling, Recovery,
 * Maintenance, Diagnostics, and Security operations.
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import {
  useRunbooks,
  useRunbookExecutions,
  useManagedInstances,
  useCommandHistory,
  type SsmManagedInstance,
  type SsmRunbookDoc,
  type SsmCommandRecord,
} from './useOpsLiveData';

// ─────────────────────────── Types ───────────────────────────

type RunbookCategory =
  | 'incident-response'
  | 'scaling'
  | 'recovery'
  | 'maintenance'
  | 'diagnostics'
  | 'security';

type StepType = 'check' | 'action' | 'decision' | 'notify' | 'wait' | 'escalate';

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'waiting-approval';
type TriggerType = 'manual' | 'auto' | 'incident';

interface RunbookStep {
  id: string;
  name: string;
  type: StepType;
  description: string;
  command?: string;
  expectedOutcome: string;
  rollback?: string;
  timeout?: number; // seconds
  retries?: number;
  approvalRequired?: boolean;
  nextOnSuccess?: string;
  nextOnFailure?: string;
}

interface Runbook {
  id: string;
  name: string;
  description: string;
  category: RunbookCategory;
  steps: RunbookStep[];
  lastRun?: string;
  successRate: number;
  totalRuns: number;
  avgDuration: number; // seconds
  autoTriggerRules?: string[];
  variables?: { name: string; description: string; default?: string }[];
  createdBy: string;
  createdDate: string;
  updatedDate: string;
}

interface ExecutionRecord {
  id: string;
  runbookId: string;
  runbookName: string;
  trigger: TriggerType;
  status: ExecutionStatus;
  duration: number; // seconds
  executor: string;
  startTime: string;
  endTime?: string;
  currentStep?: number;
  totalSteps: number;
  logs: { timestamp: string; step: string; message: string; level: 'info' | 'warn' | 'error' | 'success' }[];
  linkedIncident?: string;
}

// ─────────────────────────── Mock Data ───────────────────────────

const RUNBOOK_STEPS: Record<string, RunbookStep[]> = {
  'high-latency': [
    { id: 's1', name: 'Check Current Latency', type: 'check', description: 'Query CloudWatch for current P99 latency metrics', command: 'aws cloudwatch get-metric-statistics --namespace AgentCore --metric-name P99Latency', expectedOutcome: 'Latency metrics retrieved', nextOnSuccess: 's2' },
    { id: 's2', name: 'Identify Slow Agents', type: 'check', description: 'List agents with response time > 2s', command: 'aws bedrock-agentcore list-agents --filter "avgLatency>2000"', expectedOutcome: 'List of slow agents identified', nextOnSuccess: 's3' },
    { id: 's3', name: 'Check Agent Resource Usage', type: 'check', description: 'Review CPU/memory for slow agents', expectedOutcome: 'Resource bottlenecks identified', nextOnSuccess: 's4' },
    { id: 's4', name: 'Decision: Scale or Optimize?', type: 'decision', description: 'If resource constrained, scale. Otherwise, investigate code.', expectedOutcome: 'Decision made on remediation path', nextOnSuccess: 's5', nextOnFailure: 's6' },
    { id: 's5', name: 'Scale Agent Instances', type: 'action', description: 'Increase agent replica count', command: 'aws bedrock-agentcore update-agent --replicas 3', expectedOutcome: 'Agent scaled successfully', approvalRequired: true, rollback: 'aws bedrock-agentcore update-agent --replicas 1', nextOnSuccess: 's7' },
    { id: 's6', name: 'Enable Debug Logging', type: 'action', description: 'Temporarily enable verbose logging', command: 'aws bedrock-agentcore update-agent --log-level DEBUG', expectedOutcome: 'Debug logging enabled', nextOnSuccess: 's7' },
    { id: 's7', name: 'Notify Team', type: 'notify', description: 'Send Slack notification about remediation', expectedOutcome: 'Team notified via Slack', nextOnSuccess: 's8' },
    { id: 's8', name: 'Wait for Metrics', type: 'wait', description: 'Wait 5 minutes for metrics to stabilize', timeout: 300, expectedOutcome: 'Metrics collection period complete', nextOnSuccess: 's9' },
    { id: 's9', name: 'Verify Resolution', type: 'check', description: 'Confirm latency returned to normal', expectedOutcome: 'P99 latency < 500ms' },
  ],
  'error-spike': [
    { id: 's1', name: 'Query Error Metrics', type: 'check', description: 'Get error rate from CloudWatch', expectedOutcome: 'Error metrics retrieved', nextOnSuccess: 's2' },
    { id: 's2', name: 'Identify Error Patterns', type: 'check', description: 'Analyze error types and affected agents', expectedOutcome: 'Error patterns identified', nextOnSuccess: 's3' },
    { id: 's3', name: 'Check Recent Deployments', type: 'check', description: 'List deployments in last 24h', expectedOutcome: 'Deployment timeline established', nextOnSuccess: 's4' },
    { id: 's4', name: 'Decision: Rollback Required?', type: 'decision', description: 'Determine if deployment rollback needed', expectedOutcome: 'Rollback decision made', nextOnSuccess: 's5', nextOnFailure: 's6' },
    { id: 's5', name: 'Initiate Rollback', type: 'action', description: 'Rollback to previous stable version', approvalRequired: true, expectedOutcome: 'Rollback completed', nextOnSuccess: 's7' },
    { id: 's6', name: 'Enable Circuit Breaker', type: 'action', description: 'Activate circuit breaker for failing agents', expectedOutcome: 'Circuit breaker active', nextOnSuccess: 's7' },
    { id: 's7', name: 'Escalate to On-Call', type: 'escalate', description: 'Page on-call engineer if errors persist', expectedOutcome: 'On-call engineer engaged', nextOnSuccess: 's8' },
    { id: 's8', name: 'Monitor Error Rate', type: 'check', description: 'Verify error rate returning to baseline', expectedOutcome: 'Error rate < 1%' },
  ],
  'agent-recovery': [
    { id: 's1', name: 'Identify Failed Agent', type: 'check', description: 'Get agent status and failure details', expectedOutcome: 'Agent failure details retrieved', nextOnSuccess: 's2' },
    { id: 's2', name: 'Check Health Endpoints', type: 'check', description: 'Verify agent health check responses', expectedOutcome: 'Health status determined', nextOnSuccess: 's3' },
    { id: 's3', name: 'Restart Agent', type: 'action', description: 'Restart the failed agent instance', command: 'aws bedrock-agentcore restart-agent --agent-id {agent_id}', expectedOutcome: 'Agent restart initiated', approvalRequired: false, nextOnSuccess: 's4' },
    { id: 's4', name: 'Wait for Startup', type: 'wait', description: 'Wait for agent to complete startup', timeout: 60, expectedOutcome: 'Agent startup complete', nextOnSuccess: 's5' },
    { id: 's5', name: 'Verify Agent Health', type: 'check', description: 'Confirm agent is responding', expectedOutcome: 'Agent health check passing', nextOnSuccess: 's6' },
    { id: 's6', name: 'Notify Operations', type: 'notify', description: 'Send recovery notification', expectedOutcome: 'Team notified of recovery' },
  ],
  'cost-overrun': [
    { id: 's1', name: 'Query Cost Metrics', type: 'check', description: 'Get current spend vs budget', expectedOutcome: 'Cost metrics retrieved', nextOnSuccess: 's2' },
    { id: 's2', name: 'Identify Cost Drivers', type: 'check', description: 'Find agents/models with highest spend', expectedOutcome: 'Top cost drivers identified', nextOnSuccess: 's3' },
    { id: 's3', name: 'Review Token Usage', type: 'check', description: 'Analyze token consumption patterns', expectedOutcome: 'Token usage patterns analyzed', nextOnSuccess: 's4' },
    { id: 's4', name: 'Enable Cost Controls', type: 'action', description: 'Activate spending limits on high-cost agents', approvalRequired: true, expectedOutcome: 'Cost controls enabled', nextOnSuccess: 's5' },
    { id: 's5', name: 'Optimize Model Selection', type: 'action', description: 'Switch non-critical workloads to cheaper models', expectedOutcome: 'Model optimization applied', nextOnSuccess: 's6' },
    { id: 's6', name: 'Notify Finance', type: 'notify', description: 'Alert finance team of cost actions taken', expectedOutcome: 'Finance team notified', nextOnSuccess: 's7' },
    { id: 's7', name: 'Schedule Review', type: 'notify', description: 'Schedule cost optimization review', expectedOutcome: 'Review meeting scheduled' },
  ],
  'security-incident': [
    { id: 's1', name: 'Assess Threat Severity', type: 'check', description: 'Determine incident severity level', expectedOutcome: 'Severity assessed', nextOnSuccess: 's2' },
    { id: 's2', name: 'Isolate Affected Agents', type: 'action', description: 'Quarantine compromised agents', command: 'aws bedrock-agentcore update-agent --status ISOLATED', approvalRequired: true, expectedOutcome: 'Agents isolated', rollback: 'aws bedrock-agentcore update-agent --status ACTIVE', nextOnSuccess: 's3' },
    { id: 's3', name: 'Capture Evidence', type: 'action', description: 'Export logs and state for forensics', expectedOutcome: 'Evidence captured', nextOnSuccess: 's4' },
    { id: 's4', name: 'Rotate Credentials', type: 'action', description: 'Rotate all affected API keys and tokens', approvalRequired: true, expectedOutcome: 'Credentials rotated', nextOnSuccess: 's5' },
    { id: 's5', name: 'Escalate to Security', type: 'escalate', description: 'Engage security incident response team', expectedOutcome: 'Security team engaged', nextOnSuccess: 's6' },
    { id: 's6', name: 'Apply Security Patches', type: 'action', description: 'Deploy security fixes', approvalRequired: true, expectedOutcome: 'Patches applied', nextOnSuccess: 's7' },
    { id: 's7', name: 'Verify Containment', type: 'check', description: 'Confirm threat is contained', expectedOutcome: 'Threat contained', nextOnSuccess: 's8' },
    { id: 's8', name: 'Document Incident', type: 'notify', description: 'Create incident report', expectedOutcome: 'Incident documented' },
  ],
  'capacity-scale': [
    { id: 's1', name: 'Check Capacity Metrics', type: 'check', description: 'Review current utilization levels', expectedOutcome: 'Utilization metrics retrieved', nextOnSuccess: 's2' },
    { id: 's2', name: 'Forecast Demand', type: 'check', description: 'Analyze traffic patterns and predict needs', expectedOutcome: 'Demand forecast generated', nextOnSuccess: 's3' },
    { id: 's3', name: 'Scale Compute', type: 'action', description: 'Increase agent instance count', command: 'aws bedrock-agentcore scale --replicas +2', approvalRequired: true, expectedOutcome: 'Compute scaled', rollback: 'aws bedrock-agentcore scale --replicas -2', nextOnSuccess: 's4' },
    { id: 's4', name: 'Update Load Balancer', type: 'action', description: 'Configure LB for new instances', expectedOutcome: 'Load balancer updated', nextOnSuccess: 's5' },
    { id: 's5', name: 'Wait for Warm-up', type: 'wait', description: 'Allow instances to warm up', timeout: 120, expectedOutcome: 'Warm-up complete', nextOnSuccess: 's6' },
    { id: 's6', name: 'Verify Scaling', type: 'check', description: 'Confirm all instances healthy', expectedOutcome: 'All instances healthy', nextOnSuccess: 's7' },
    { id: 's7', name: 'Notify Ops Team', type: 'notify', description: 'Send scaling completion notification', expectedOutcome: 'Team notified' },
  ],
  'model-rollback': [
    { id: 's1', name: 'Identify Problem Model', type: 'check', description: 'Determine which model version is causing issues', expectedOutcome: 'Problem model identified', nextOnSuccess: 's2' },
    { id: 's2', name: 'Get Previous Version', type: 'check', description: 'Find last known good model version', expectedOutcome: 'Previous version identified', nextOnSuccess: 's3' },
    { id: 's3', name: 'Initiate Rollback', type: 'action', description: 'Roll back to previous model version', command: 'aws bedrock-agentcore rollback-model --version {previous_version}', approvalRequired: true, expectedOutcome: 'Rollback initiated', nextOnSuccess: 's4' },
    { id: 's4', name: 'Wait for Propagation', type: 'wait', description: 'Wait for rollback to propagate', timeout: 180, expectedOutcome: 'Rollback propagated', nextOnSuccess: 's5' },
    { id: 's5', name: 'Verify Model Behavior', type: 'check', description: 'Run validation tests on rolled-back model', expectedOutcome: 'Model behavior validated', nextOnSuccess: 's6' },
    { id: 's6', name: 'Update Model Registry', type: 'action', description: 'Mark new version as deprecated', expectedOutcome: 'Registry updated', nextOnSuccess: 's7' },
    { id: 's7', name: 'Notify Stakeholders', type: 'notify', description: 'Alert teams of rollback', expectedOutcome: 'Stakeholders notified' },
  ],
  'guardrail-disable': [
    { id: 's1', name: 'Document Reason', type: 'check', description: 'Record business justification for disabling', expectedOutcome: 'Justification documented', nextOnSuccess: 's2' },
    { id: 's2', name: 'Get Approval Chain', type: 'escalate', description: 'Obtain required approvals', expectedOutcome: 'Approvals obtained', nextOnSuccess: 's3' },
    { id: 's3', name: 'Backup Current Config', type: 'action', description: 'Save current guardrail configuration', expectedOutcome: 'Config backed up', nextOnSuccess: 's4' },
    { id: 's4', name: 'Disable Guardrail', type: 'action', description: 'Temporarily disable specified guardrail', command: 'aws bedrock-agentcore update-guardrail --status DISABLED', approvalRequired: true, expectedOutcome: 'Guardrail disabled', rollback: 'aws bedrock-agentcore update-guardrail --status ENABLED', nextOnSuccess: 's5' },
    { id: 's5', name: 'Enable Enhanced Monitoring', type: 'action', description: 'Increase monitoring while guardrail disabled', expectedOutcome: 'Monitoring enhanced', nextOnSuccess: 's6' },
    { id: 's6', name: 'Set Re-enable Timer', type: 'action', description: 'Schedule automatic re-enable', expectedOutcome: 'Timer set', nextOnSuccess: 's7' },
    { id: 's7', name: 'Notify Compliance', type: 'notify', description: 'Alert compliance team of temporary change', expectedOutcome: 'Compliance notified' },
  ],
};

const RUNBOOKS: Runbook[] = [
  {
    id: 'rb-001',
    name: 'High Latency Response',
    description: 'Diagnose and remediate high latency issues in agent responses. Includes scaling, optimization, and verification steps.',
    category: 'incident-response',
    steps: RUNBOOK_STEPS['high-latency'],
    lastRun: '2026-08-10T14:30:00Z',
    successRate: 94,
    totalRuns: 47,
    avgDuration: 420,
    autoTriggerRules: ['P99 latency > 2000ms for 5 minutes'],
    variables: [{ name: 'agent_id', description: 'Target agent ID', default: 'auto-detect' }],
    createdBy: 'Platform Team',
    createdDate: '2026-01-15',
    updatedDate: '2026-07-20',
  },
  {
    id: 'rb-002',
    name: 'Error Spike Investigation',
    description: 'Investigate sudden increases in error rates. Covers deployment rollback, circuit breakers, and root cause analysis.',
    category: 'incident-response',
    steps: RUNBOOK_STEPS['error-spike'],
    lastRun: '2026-08-09T08:15:00Z',
    successRate: 88,
    totalRuns: 32,
    avgDuration: 540,
    autoTriggerRules: ['Error rate > 5% for 3 minutes'],
    createdBy: 'SRE Team',
    createdDate: '2026-02-10',
    updatedDate: '2026-08-01',
  },
  {
    id: 'rb-003',
    name: 'Agent Recovery',
    description: 'Recover failed or unresponsive agents. Simple restart procedure with health verification.',
    category: 'recovery',
    steps: RUNBOOK_STEPS['agent-recovery'],
    lastRun: '2026-08-11T02:45:00Z',
    successRate: 98,
    totalRuns: 156,
    avgDuration: 180,
    autoTriggerRules: ['Agent health check failed 3 times'],
    variables: [{ name: 'agent_id', description: 'Agent to recover' }],
    createdBy: 'Ops Team',
    createdDate: '2026-01-05',
    updatedDate: '2026-06-15',
  },
  {
    id: 'rb-004',
    name: 'Cost Overrun Response',
    description: 'Address unexpected cost spikes by identifying drivers, enabling controls, and optimizing model usage.',
    category: 'maintenance',
    steps: RUNBOOK_STEPS['cost-overrun'],
    lastRun: '2026-08-05T16:00:00Z',
    successRate: 100,
    totalRuns: 8,
    avgDuration: 600,
    autoTriggerRules: ['Daily spend > 120% of budget'],
    createdBy: 'FinOps Team',
    createdDate: '2026-03-20',
    updatedDate: '2026-07-28',
  },
  {
    id: 'rb-005',
    name: 'Security Incident Response',
    description: 'Respond to security incidents with isolation, evidence capture, credential rotation, and escalation.',
    category: 'security',
    steps: RUNBOOK_STEPS['security-incident'],
    lastRun: '2026-07-28T11:30:00Z',
    successRate: 100,
    totalRuns: 3,
    avgDuration: 1800,
    createdBy: 'Security Team',
    createdDate: '2026-01-20',
    updatedDate: '2026-08-05',
  },
  {
    id: 'rb-006',
    name: 'Capacity Scale-Up',
    description: 'Scale agent capacity to handle increased demand. Includes compute scaling, LB configuration, and verification.',
    category: 'scaling',
    steps: RUNBOOK_STEPS['capacity-scale'],
    lastRun: '2026-08-08T09:00:00Z',
    successRate: 96,
    totalRuns: 24,
    avgDuration: 360,
    autoTriggerRules: ['CPU utilization > 80% for 10 minutes'],
    createdBy: 'Platform Team',
    createdDate: '2026-02-01',
    updatedDate: '2026-07-15',
  },
  {
    id: 'rb-007',
    name: 'Model Rollback',
    description: 'Roll back to a previous model version when issues are detected with a new deployment.',
    category: 'recovery',
    steps: RUNBOOK_STEPS['model-rollback'],
    lastRun: '2026-07-15T14:20:00Z',
    successRate: 92,
    totalRuns: 12,
    avgDuration: 480,
    variables: [
      { name: 'model_id', description: 'Model to rollback' },
      { name: 'previous_version', description: 'Target version' },
    ],
    createdBy: 'ML Platform Team',
    createdDate: '2026-03-01',
    updatedDate: '2026-06-30',
  },
  {
    id: 'rb-008',
    name: 'Guardrail Emergency Disable',
    description: 'Temporarily disable a guardrail in emergency situations with proper documentation and monitoring.',
    category: 'security',
    steps: RUNBOOK_STEPS['guardrail-disable'],
    lastRun: '2026-06-20T18:45:00Z',
    successRate: 100,
    totalRuns: 2,
    avgDuration: 900,
    variables: [
      { name: 'guardrail_id', description: 'Guardrail to disable' },
      { name: 'duration', description: 'Disable duration (minutes)', default: '30' },
    ],
    createdBy: 'Security Team',
    createdDate: '2026-04-10',
    updatedDate: '2026-06-20',
  },
  {
    id: 'rb-009',
    name: 'Database Connectivity Check',
    description: 'Diagnose and resolve database connectivity issues affecting agent data access.',
    category: 'diagnostics',
    steps: [
      { id: 's1', name: 'Check DB Status', type: 'check', description: 'Verify database cluster health', expectedOutcome: 'DB status retrieved', nextOnSuccess: 's2' },
      { id: 's2', name: 'Test Connectivity', type: 'check', description: 'Run connectivity tests from agents', expectedOutcome: 'Connectivity verified', nextOnSuccess: 's3' },
      { id: 's3', name: 'Check Connection Pool', type: 'check', description: 'Review connection pool utilization', expectedOutcome: 'Pool status analyzed', nextOnSuccess: 's4' },
      { id: 's4', name: 'Restart Connection Pool', type: 'action', description: 'Reset connection pool if needed', expectedOutcome: 'Pool restarted', nextOnSuccess: 's5' },
      { id: 's5', name: 'Verify Resolution', type: 'check', description: 'Confirm connectivity restored', expectedOutcome: 'Connectivity confirmed' },
    ],
    lastRun: '2026-08-07T22:10:00Z',
    successRate: 90,
    totalRuns: 20,
    avgDuration: 240,
    createdBy: 'DBA Team',
    createdDate: '2026-02-15',
    updatedDate: '2026-05-20',
  },
  {
    id: 'rb-010',
    name: 'Memory Leak Investigation',
    description: 'Identify and address memory leaks in agent processes.',
    category: 'diagnostics',
    steps: [
      { id: 's1', name: 'Capture Memory Metrics', type: 'check', description: 'Get current memory usage trends', expectedOutcome: 'Memory metrics captured', nextOnSuccess: 's2' },
      { id: 's2', name: 'Generate Heap Dump', type: 'action', description: 'Create heap dump for analysis', expectedOutcome: 'Heap dump generated', nextOnSuccess: 's3' },
      { id: 's3', name: 'Analyze Allocation', type: 'check', description: 'Identify memory allocation patterns', expectedOutcome: 'Allocation patterns identified', nextOnSuccess: 's4' },
      { id: 's4', name: 'Restart Affected Agents', type: 'action', description: 'Rolling restart to reclaim memory', approvalRequired: true, expectedOutcome: 'Agents restarted', nextOnSuccess: 's5' },
      { id: 's5', name: 'Create Bug Ticket', type: 'notify', description: 'Document findings for engineering', expectedOutcome: 'Ticket created' },
    ],
    lastRun: '2026-08-02T10:30:00Z',
    successRate: 85,
    totalRuns: 14,
    avgDuration: 720,
    createdBy: 'Engineering',
    createdDate: '2026-04-01',
    updatedDate: '2026-07-10',
  },
];

const EXECUTION_HISTORY: ExecutionRecord[] = [
  {
    id: 'exec-001',
    runbookId: 'rb-003',
    runbookName: 'Agent Recovery',
    trigger: 'auto',
    status: 'completed',
    duration: 165,
    executor: 'System',
    startTime: '2026-08-11T02:45:00Z',
    endTime: '2026-08-11T02:47:45Z',
    totalSteps: 6,
    logs: [
      { timestamp: '2026-08-11T02:45:00Z', step: 'Identify Failed Agent', message: 'Agent fraud-detector-v3 health check failed', level: 'info' },
      { timestamp: '2026-08-11T02:45:15Z', step: 'Check Health Endpoints', message: 'Endpoint /health returning 503', level: 'warn' },
      { timestamp: '2026-08-11T02:45:30Z', step: 'Restart Agent', message: 'Restart command issued', level: 'info' },
      { timestamp: '2026-08-11T02:46:30Z', step: 'Wait for Startup', message: 'Agent starting...', level: 'info' },
      { timestamp: '2026-08-11T02:47:30Z', step: 'Verify Agent Health', message: 'Health check passing', level: 'success' },
      { timestamp: '2026-08-11T02:47:45Z', step: 'Notify Operations', message: 'Slack notification sent', level: 'success' },
    ],
  },
  {
    id: 'exec-002',
    runbookId: 'rb-001',
    runbookName: 'High Latency Response',
    trigger: 'auto',
    status: 'completed',
    duration: 485,
    executor: 'System',
    startTime: '2026-08-10T14:30:00Z',
    endTime: '2026-08-10T14:38:05Z',
    totalSteps: 9,
    logs: [
      { timestamp: '2026-08-10T14:30:00Z', step: 'Check Current Latency', message: 'P99 latency at 2450ms', level: 'warn' },
      { timestamp: '2026-08-10T14:30:30Z', step: 'Identify Slow Agents', message: '3 agents identified with high latency', level: 'info' },
      { timestamp: '2026-08-10T14:31:00Z', step: 'Scale Agent Instances', message: 'Scaling from 1 to 3 replicas', level: 'info' },
      { timestamp: '2026-08-10T14:38:05Z', step: 'Verify Resolution', message: 'P99 latency now 380ms', level: 'success' },
    ],
    linkedIncident: 'INC-2026-0815',
  },
  {
    id: 'exec-003',
    runbookId: 'rb-002',
    runbookName: 'Error Spike Investigation',
    trigger: 'incident',
    status: 'completed',
    duration: 612,
    executor: 'Sarah Chen',
    startTime: '2026-08-09T08:15:00Z',
    endTime: '2026-08-09T08:25:12Z',
    totalSteps: 8,
    logs: [
      { timestamp: '2026-08-09T08:15:00Z', step: 'Query Error Metrics', message: 'Error rate at 8.2%', level: 'error' },
      { timestamp: '2026-08-09T08:16:00Z', step: 'Check Recent Deployments', message: 'Deployment at 07:45 identified', level: 'info' },
      { timestamp: '2026-08-09T08:18:00Z', step: 'Initiate Rollback', message: 'Rolling back to v2.3.1', level: 'warn' },
      { timestamp: '2026-08-09T08:25:12Z', step: 'Monitor Error Rate', message: 'Error rate down to 0.3%', level: 'success' },
    ],
    linkedIncident: 'INC-2026-0812',
  },
  {
    id: 'exec-004',
    runbookId: 'rb-006',
    runbookName: 'Capacity Scale-Up',
    trigger: 'manual',
    status: 'running',
    duration: 180,
    executor: 'Mike Johnson',
    startTime: '2026-08-11T09:00:00Z',
    currentStep: 4,
    totalSteps: 7,
    logs: [
      { timestamp: '2026-08-11T09:00:00Z', step: 'Check Capacity Metrics', message: 'CPU at 85%', level: 'warn' },
      { timestamp: '2026-08-11T09:01:00Z', step: 'Forecast Demand', message: 'Expected 20% increase in next hour', level: 'info' },
      { timestamp: '2026-08-11T09:02:00Z', step: 'Scale Compute', message: 'Adding 2 instances', level: 'info' },
      { timestamp: '2026-08-11T09:03:00Z', step: 'Update Load Balancer', message: 'Configuring LB...', level: 'info' },
    ],
  },
  {
    id: 'exec-005',
    runbookId: 'rb-004',
    runbookName: 'Cost Overrun Response',
    trigger: 'auto',
    status: 'waiting-approval',
    duration: 120,
    executor: 'System',
    startTime: '2026-08-11T08:00:00Z',
    currentStep: 4,
    totalSteps: 7,
    logs: [
      { timestamp: '2026-08-11T08:00:00Z', step: 'Query Cost Metrics', message: 'Daily spend at 135% of budget', level: 'warn' },
      { timestamp: '2026-08-11T08:01:00Z', step: 'Identify Cost Drivers', message: 'claude-opus usage 3x normal', level: 'warn' },
      { timestamp: '2026-08-11T08:02:00Z', step: 'Enable Cost Controls', message: 'Waiting for approval...', level: 'info' },
    ],
  },
  {
    id: 'exec-006',
    runbookId: 'rb-005',
    runbookName: 'Security Incident Response',
    trigger: 'incident',
    status: 'completed',
    duration: 1654,
    executor: 'Security Team',
    startTime: '2026-07-28T11:30:00Z',
    endTime: '2026-07-28T11:57:34Z',
    totalSteps: 8,
    logs: [
      { timestamp: '2026-07-28T11:30:00Z', step: 'Assess Threat Severity', message: 'Severity: HIGH - Potential data exfiltration', level: 'error' },
      { timestamp: '2026-07-28T11:32:00Z', step: 'Isolate Affected Agents', message: '2 agents isolated', level: 'warn' },
      { timestamp: '2026-07-28T11:40:00Z', step: 'Rotate Credentials', message: 'All affected credentials rotated', level: 'info' },
      { timestamp: '2026-07-28T11:57:34Z', step: 'Document Incident', message: 'Incident report created', level: 'success' },
    ],
    linkedIncident: 'SEC-2026-0042',
  },
  {
    id: 'exec-007',
    runbookId: 'rb-007',
    runbookName: 'Model Rollback',
    trigger: 'manual',
    status: 'failed',
    duration: 320,
    executor: 'David Lee',
    startTime: '2026-07-15T14:20:00Z',
    endTime: '2026-07-15T14:25:20Z',
    totalSteps: 7,
    logs: [
      { timestamp: '2026-07-15T14:20:00Z', step: 'Identify Problem Model', message: 'sonnet-4-5 showing quality degradation', level: 'warn' },
      { timestamp: '2026-07-15T14:21:00Z', step: 'Get Previous Version', message: 'Previous version: v4.4.2', level: 'info' },
      { timestamp: '2026-07-15T14:22:00Z', step: 'Initiate Rollback', message: 'Rollback started', level: 'info' },
      { timestamp: '2026-07-15T14:25:20Z', step: 'Wait for Propagation', message: 'Timeout waiting for propagation', level: 'error' },
    ],
  },
  {
    id: 'exec-008',
    runbookId: 'rb-003',
    runbookName: 'Agent Recovery',
    trigger: 'auto',
    status: 'aborted',
    duration: 45,
    executor: 'System',
    startTime: '2026-08-06T16:30:00Z',
    endTime: '2026-08-06T16:30:45Z',
    totalSteps: 6,
    logs: [
      { timestamp: '2026-08-06T16:30:00Z', step: 'Identify Failed Agent', message: 'Agent already recovered by auto-healing', level: 'info' },
      { timestamp: '2026-08-06T16:30:45Z', step: 'Aborted', message: 'Runbook aborted - agent healthy', level: 'info' },
    ],
  },
];

// ─────────────────────────── Configuration ───────────────────────────

const categoryConfig: Record<RunbookCategory, { label: string; icon: IconName; color: string; bg: string }> = {
  'incident-response': { label: 'Incident Response', icon: 'bell-alert', color: 'text-rose-600', bg: 'bg-rose-100' },
  'scaling': { label: 'Scaling', icon: 'arrow-trending-up', color: 'text-blue-600', bg: 'bg-blue-100' },
  'recovery': { label: 'Recovery', icon: 'arrow-path', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  'maintenance': { label: 'Maintenance', icon: 'wrench', color: 'text-amber-600', bg: 'bg-amber-100' },
  'diagnostics': { label: 'Diagnostics', icon: 'magnifying-glass', color: 'text-violet-600', bg: 'bg-violet-100' },
  'security': { label: 'Security', icon: 'shield-check', color: 'text-slate-600', bg: 'bg-slate-200' },
};

const stepTypeConfig: Record<StepType, { label: string; icon: IconName; color: string; bg: string }> = {
  'check': { label: 'Check', icon: 'eye', color: 'text-blue-600', bg: 'bg-blue-50' },
  'action': { label: 'Action', icon: 'bolt', color: 'text-amber-600', bg: 'bg-amber-50' },
  'decision': { label: 'Decision', icon: 'arrows-right-left', color: 'text-violet-600', bg: 'bg-violet-50' },
  'notify': { label: 'Notify', icon: 'bell', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'wait': { label: 'Wait', icon: 'clock', color: 'text-slate-500', bg: 'bg-slate-50' },
  'escalate': { label: 'Escalate', icon: 'megaphone', color: 'text-rose-600', bg: 'bg-rose-50' },
};

const statusConfig: Record<ExecutionStatus, { label: string; color: string; bg: string }> = {
  'pending': { label: 'Pending', color: 'text-slate-600', bg: 'bg-slate-100' },
  'running': { label: 'Running', color: 'text-blue-600', bg: 'bg-blue-100' },
  'completed': { label: 'Completed', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  'failed': { label: 'Failed', color: 'text-rose-600', bg: 'bg-rose-100' },
  'aborted': { label: 'Aborted', color: 'text-slate-500', bg: 'bg-slate-100' },
  'waiting-approval': { label: 'Waiting Approval', color: 'text-amber-600', bg: 'bg-amber-100' },
};

const triggerConfig: Record<TriggerType, { label: string; icon: IconName }> = {
  'manual': { label: 'Manual', icon: 'user' },
  'auto': { label: 'Auto', icon: 'cpu-chip' },
  'incident': { label: 'Incident', icon: 'bell-alert' },
};

// ─────────────────────────── Helper Functions ───────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────── Component ───────────────────────────

type ViewMode = 'library' | 'detail' | 'execution' | 'history' | 'editor';

export default function RunbookCenter() {
  const [view, setView] = useState<ViewMode>('library');
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [selectedRunbook, setSelectedRunbook] = useState<Runbook | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RunbookCategory | 'all'>('all');
  const [historyFilter, setHistoryFilter] = useState<{ runbook: string; status: string; trigger: string }>({
    runbook: 'all',
    status: 'all',
    trigger: 'all',
  });

  // Simulated execution state
  const [activeExecution, setActiveExecution] = useState<ExecutionRecord | null>(null);

  // The step-based runbook library and its execution tracker below are a
  // curated, illustrative demo of authored runbooks. The real, read-only
  // Systems Manager fleet — managed instances, document/runbook catalog, and
  // Run Command history — is rendered live in <SsmFleetSection /> further down.
  const { executions: liveExecutions } = useRunbookExecutions();

  const runbooksData = RUNBOOKS;
  const executionHistory = liveExecutions.length > 0 ? liveExecutions : EXECUTION_HISTORY;

  // KPI calculations
  const kpis = useMemo(() => {
    const totalRunbooks = runbooksData.length;
    const executions30d = executionHistory.length;
    const successfulExecs = executionHistory.filter(e => e.status === 'completed').length;
    const successRate = executions30d > 0 ? Math.round((successfulExecs / executions30d) * 100) : 0;
    const avgDuration = executions30d > 0 ? Math.round(executionHistory.reduce((sum, e) => sum + e.duration, 0) / executions30d) : 0;
    const autoTriggered = executionHistory.filter(e => e.trigger === 'auto').length;
    const manualRuns = executionHistory.filter(e => e.trigger === 'manual').length;

    return { totalRunbooks, executions30d, successRate, avgDuration, autoTriggered, manualRuns };
  }, [runbooksData, executionHistory]);

  // Filtered runbooks
  const filteredRunbooks = useMemo(() => {
    let results = [...runbooksData];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== 'all') {
      results = results.filter(r => r.category === categoryFilter);
    }
    return results;
  }, [searchQuery, categoryFilter, runbooksData]);

  // Filtered execution history
  const filteredHistory = useMemo(() => {
    let results = [...executionHistory];
    if (historyFilter.runbook !== 'all') {
      results = results.filter(e => e.runbookId === historyFilter.runbook);
    }
    if (historyFilter.status !== 'all') {
      results = results.filter(e => e.status === historyFilter.status);
    }
    if (historyFilter.trigger !== 'all') {
      results = results.filter(e => e.trigger === historyFilter.trigger);
    }
    return results.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [historyFilter, executionHistory]);

  // Start execution simulation
  const startExecution = (runbook: Runbook) => {
    const execution: ExecutionRecord = {
      id: `exec-sim-${Date.now()}`,
      runbookId: runbook.id,
      runbookName: runbook.name,
      trigger: 'manual',
      status: 'running',
      duration: 0,
      executor: 'Current User',
      startTime: new Date().toISOString(),
      currentStep: 0,
      totalSteps: runbook.steps.length,
      logs: [{ timestamp: new Date().toISOString(), step: 'Started', message: `Execution started for ${runbook.name}`, level: 'info' }],
    };
    setActiveExecution(execution);
    setView('execution');
  };

  // View runbook detail
  const viewRunbookDetail = (runbook: Runbook) => {
    setSelectedRunbook(runbook);
    setView('detail');
  };

  // View execution detail
  const viewExecutionDetail = (execution: ExecutionRecord) => {
    setSelectedExecution(execution);
    setView('execution');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Runbook Center</h1>
          <p className="text-slate-500 mt-1">Operational runbook management and execution</p>
          <div className="mt-2">
            <MockDataBadge integration="Step-based runbook library is illustrative; live read-only Systems Manager fleet data is shown below" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view !== 'library' && (
            <button
              onClick={() => {
                setView('library');
                setSelectedRunbook(null);
                setSelectedExecution(null);
                setActiveExecution(null);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <Icon name="arrow-left" className="w-3.5 h-3.5" strokeWidth={2} />
              Back to Library
            </button>
          )}
          <button
            onClick={() => setView('history')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              view === 'history' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon name="clock" className="w-3.5 h-3.5" strokeWidth={2} />
            Execution History
          </button>
          <button
            onClick={() => setView('editor')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
            Create Runbook
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-4">
        <StatCard label="Total Runbooks" value={kpis.totalRunbooks} variant="default" icon={<Icon name="document-text" className="w-4 h-4 text-slate-400" strokeWidth={2} />} />
        <StatCard label="Executions (30d)" value={kpis.executions30d} variant="info" icon={<Icon name="play-circle" className="w-4 h-4 text-blue-400" strokeWidth={2} />} />
        <StatCard label="Success Rate" value={`${kpis.successRate}%`} variant="success" icon={<Icon name="check-circle" className="w-4 h-4 text-emerald-400" strokeWidth={2} />} />
        <StatCard label="Avg Duration" value={formatDuration(kpis.avgDuration)} variant="default" icon={<Icon name="clock" className="w-4 h-4 text-slate-400" strokeWidth={2} />} />
        <StatCard label="Auto-triggered" value={kpis.autoTriggered} variant="default" icon={<Icon name="cpu-chip" className="w-4 h-4 text-slate-400" strokeWidth={2} />} />
        <StatCard label="Manual Runs" value={kpis.manualRuns} variant="default" icon={<Icon name="user" className="w-4 h-4 text-slate-400" strokeWidth={2} />} />
      </div>

      {/* Main Content */}
      {view === 'library' && (
        <div className="space-y-4">
          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={2} />
              <input
                type="text"
                placeholder="Search runbooks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Category:</span>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as RunbookCategory | 'all')}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {Object.entries(categoryConfig).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewStyle('grid')}
                className={`p-2 transition-colors ${viewStyle === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Icon name="squares-2x2" className="w-4 h-4" strokeWidth={2} />
              </button>
              <button
                onClick={() => setViewStyle('list')}
                className={`p-2 transition-colors ${viewStyle === 'list' ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Icon name="queue-list" className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Runbook Grid/List */}
          {viewStyle === 'grid' ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRunbooks.map(runbook => {
                const cat = categoryConfig[runbook.category];
                return (
                  <div
                    key={runbook.id}
                    className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-9 h-9 rounded-lg ${cat.bg} flex items-center justify-center`}>
                        <Icon name={cat.icon} className={`w-4.5 h-4.5 ${cat.color}`} strokeWidth={2} />
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${cat.bg} ${cat.color}`}>
                        {cat.label}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mb-1">{runbook.name}</div>
                    <div className="text-[11px] text-slate-500 mb-3 line-clamp-2">{runbook.description}</div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center">
                        <div className="text-sm font-bold text-slate-700">{runbook.steps.length}</div>
                        <div className="text-[9px] text-slate-400">Steps</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-sm font-bold ${runbook.successRate >= 90 ? 'text-emerald-600' : runbook.successRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {runbook.successRate}%
                        </div>
                        <div className="text-[9px] text-slate-400">Success</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-slate-700">{runbook.totalRuns}</div>
                        <div className="text-[9px] text-slate-400">Runs</div>
                      </div>
                    </div>
                    {runbook.lastRun && (
                      <div className="text-[10px] text-slate-400 mb-3">
                        Last run: {formatDateTime(runbook.lastRun)}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewRunbookDetail(runbook)}
                        className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => startExecution(runbook)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                      >
                        <Icon name="play-circle" className="w-3.5 h-3.5" strokeWidth={2} />
                        Run
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Runbook</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Category</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Steps</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Success Rate</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Runs</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Last Run</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRunbooks.map(runbook => {
                    const cat = categoryConfig[runbook.category];
                    return (
                      <tr key={runbook.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{runbook.name}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-xs">{runbook.description}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${cat.bg} ${cat.color}`}>
                            {cat.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-slate-700">{runbook.steps.length}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-medium ${runbook.successRate >= 90 ? 'text-emerald-600' : runbook.successRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {runbook.successRate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-slate-700">{runbook.totalRuns}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {runbook.lastRun ? formatDateTime(runbook.lastRun) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => viewRunbookDetail(runbook)}
                              className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                            >
                              View
                            </button>
                            <button
                              onClick={() => startExecution(runbook)}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Icon name="play-circle" className="w-3 h-3" strokeWidth={2} />
                              Run
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Read-only Systems Manager Fleet Manager */}
          <SsmFleetSection />
        </div>
      )}

      {/* Runbook Detail View */}
      {view === 'detail' && selectedRunbook && (
        <div className="space-y-6">
          {/* Runbook Header */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${categoryConfig[selectedRunbook.category].bg} flex items-center justify-center`}>
                  <Icon name={categoryConfig[selectedRunbook.category].icon} className={`w-6 h-6 ${categoryConfig[selectedRunbook.category].color}`} strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{selectedRunbook.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">{selectedRunbook.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${categoryConfig[selectedRunbook.category].bg} ${categoryConfig[selectedRunbook.category].color}`}>
                      {categoryConfig[selectedRunbook.category].label}
                    </span>
                    <span className="text-[10px] text-slate-400">Created by {selectedRunbook.createdBy}</span>
                    <span className="text-[10px] text-slate-400">Updated {selectedRunbook.updatedDate}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedRunbook(selectedRunbook);
                    setView('editor');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Icon name="wrench" className="w-3.5 h-3.5" strokeWidth={2} />
                  Edit
                </button>
                <button
                  onClick={() => startExecution(selectedRunbook)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Icon name="play-circle" className="w-4 h-4" strokeWidth={2} />
                  Run Runbook
                </button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              <div>
                <div className="text-xl font-bold text-slate-700">{selectedRunbook.steps.length}</div>
                <div className="text-[10px] text-slate-500">Total Steps</div>
              </div>
              <div>
                <div className={`text-xl font-bold ${selectedRunbook.successRate >= 90 ? 'text-emerald-600' : selectedRunbook.successRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {selectedRunbook.successRate}%
                </div>
                <div className="text-[10px] text-slate-500">Success Rate</div>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-700">{selectedRunbook.totalRuns}</div>
                <div className="text-[10px] text-slate-500">Total Runs</div>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-700">{formatDuration(selectedRunbook.avgDuration)}</div>
                <div className="text-[10px] text-slate-500">Avg Duration</div>
              </div>
            </div>
          </div>

          {/* Auto-trigger Rules */}
          {selectedRunbook.autoTriggerRules && selectedRunbook.autoTriggerRules.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="cpu-chip" className="w-4 h-4 text-violet-500" strokeWidth={2} />
                <span className="text-sm font-semibold text-slate-900">Auto-trigger Rules</span>
              </div>
              <div className="space-y-2">
                {selectedRunbook.autoTriggerRules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                    <Icon name="bolt" className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Variables */}
          {selectedRunbook.variables && selectedRunbook.variables.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="code-bracket" className="w-4 h-4 text-blue-500" strokeWidth={2} />
                <span className="text-sm font-semibold text-slate-900">Variables</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {selectedRunbook.variables.map((v, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-blue-600">{`{${v.name}}`}</code>
                      {v.default && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
                          default: {v.default}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">{v.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step Flowchart */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-900 mb-4">Execution Flow</div>
            <div className="space-y-3">
              {selectedRunbook.steps.map((step, index) => {
                const stepConfig = stepTypeConfig[step.type];
                return (
                  <div key={step.id} className="relative">
                    {index > 0 && (
                      <div className="absolute left-5 -top-3 w-0.5 h-3 bg-slate-200" />
                    )}
                    <div className={`rounded-lg border ${stepConfig.bg} border-slate-200 p-4`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg ${stepConfig.bg} border ${stepConfig.color.replace('text-', 'border-')} flex items-center justify-center flex-shrink-0`}>
                          <Icon name={stepConfig.icon} className={`w-5 h-5 ${stepConfig.color}`} strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white text-slate-600 border border-slate-200">
                              Step {index + 1}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${stepConfig.bg} ${stepConfig.color}`}>
                              {stepConfig.label}
                            </span>
                            {step.approvalRequired && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
                                Approval Required
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-medium text-slate-900">{step.name}</div>
                          <div className="text-xs text-slate-500 mt-1">{step.description}</div>
                          {step.command && (
                            <div className="mt-2 bg-slate-800 text-emerald-400 text-[10px] font-mono px-3 py-2 rounded overflow-x-auto">
                              {step.command}
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                            <span>Expected: {step.expectedOutcome}</span>
                            {step.timeout && <span>Timeout: {step.timeout}s</span>}
                            {step.retries && <span>Retries: {step.retries}</span>}
                          </div>
                          {step.rollback && (
                            <div className="mt-2 text-[10px] text-rose-600 bg-rose-50 rounded px-2 py-1">
                              <span className="font-medium">Rollback:</span> {step.rollback}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {index < selectedRunbook.steps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <Icon name="arrow-down" className="w-4 h-4 text-slate-300" strokeWidth={2} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Execution History */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-900 mb-4">Recent Executions</div>
            <div className="space-y-2">
              {EXECUTION_HISTORY.filter(e => e.runbookId === selectedRunbook.id).slice(0, 5).map(exec => (
                <div
                  key={exec.id}
                  onClick={() => viewExecutionDetail(exec)}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${statusConfig[exec.status].bg} ${statusConfig[exec.status].color}`}>
                      {statusConfig[exec.status].label}
                    </span>
                    <span className="text-xs text-slate-600">{formatDateTime(exec.startTime)}</span>
                    <span className="text-xs text-slate-400">by {exec.executor}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{formatDuration(exec.duration)}</span>
                    <Icon name="chevron-right" className="w-3.5 h-3.5" strokeWidth={2} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Execution View */}
      {view === 'execution' && (activeExecution || selectedExecution) && (
        <ExecutionTracker
          execution={activeExecution || selectedExecution!}
          runbook={RUNBOOKS.find(r => r.id === (activeExecution?.runbookId || selectedExecution?.runbookId))!}
          isActive={!!activeExecution}
          onAbort={() => {
            setActiveExecution(null);
            setView('library');
          }}
        />
      )}

      {/* Execution History View */}
      {view === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Runbook:</span>
              <select
                value={historyFilter.runbook}
                onChange={e => setHistoryFilter({ ...historyFilter, runbook: e.target.value })}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Runbooks</option>
                {RUNBOOKS.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Status:</span>
              <select
                value={historyFilter.status}
                onChange={e => setHistoryFilter({ ...historyFilter, status: e.target.value })}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                {Object.entries(statusConfig).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Trigger:</span>
              <select
                value={historyFilter.trigger}
                onChange={e => setHistoryFilter({ ...historyFilter, trigger: e.target.value })}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Triggers</option>
                {Object.entries(triggerConfig).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Runbook</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Trigger</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Duration</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Executor</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Time</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map(exec => {
                  const trigger = triggerConfig[exec.trigger];
                  const status = statusConfig[exec.status];
                  return (
                    <tr key={exec.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{exec.runbookName}</div>
                        {exec.linkedIncident && (
                          <div className="text-[10px] text-slate-500">Linked: {exec.linkedIncident}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Icon name={trigger.icon} className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                          <span className="text-slate-600">{trigger.label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatDuration(exec.duration)}</td>
                      <td className="py-3 px-4 text-slate-600">{exec.executor}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDateTime(exec.startTime)}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => viewExecutionDetail(exec)}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editor View */}
      {view === 'editor' && (
        <RunbookEditor
          runbook={selectedRunbook}
          onSave={() => {
            setView('library');
            setSelectedRunbook(null);
          }}
          onCancel={() => {
            setView(selectedRunbook ? 'detail' : 'library');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────── SSM Fleet Manager (read-only) ───────────────────────

function pingStatusStyle(status: string): { color: string; bg: string } {
  const s = (status || '').toLowerCase();
  if (s === 'online') return { color: 'text-emerald-600', bg: 'bg-emerald-100' };
  if (s === 'connectionlost') return { color: 'text-rose-600', bg: 'bg-rose-100' };
  if (s === 'inactive') return { color: 'text-slate-500', bg: 'bg-slate-100' };
  return { color: 'text-amber-600', bg: 'bg-amber-100' };
}

function commandStatusStyle(status: string): { color: string; bg: string } {
  const s = (status || '').toLowerCase();
  if (s === 'success') return { color: 'text-emerald-600', bg: 'bg-emerald-100' };
  if (s === 'failed' || s === 'cancelled' || s === 'timedout') return { color: 'text-rose-600', bg: 'bg-rose-100' };
  if (s === 'inprogress' || s === 'pending') return { color: 'text-blue-600', bg: 'bg-blue-100' };
  return { color: 'text-slate-600', bg: 'bg-slate-100' };
}

/**
 * SsmFleetSection — read-only Systems Manager Fleet Manager.
 *
 * Renders three live blocks (managed instances, document/runbook catalog, and
 * Run Command history), each with a live/mock badge gated on its own response
 * `.live` flag and an honest empty state. The per-document "Run" control is
 * intentionally disabled: this build issues no SendCommand /
 * StartAutomationExecution or any other SSM mutation.
 */
function SsmFleetSection() {
  const instances = useManagedInstances();
  const catalog = useRunbooks();
  const history = useCommandHistory(7);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
            <Icon name="server-stack" className="w-4 h-4 text-slate-600" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Systems Manager Fleet Manager</h2>
            <p className="text-xs text-slate-500">
              Read-only view of managed instances, the document catalog, and Run Command history.
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
          title="This build does not issue SendCommand or StartAutomationExecution."
        >
          <Icon name="lock-closed" className="w-3 h-3" strokeWidth={2} />
          Read-only
        </span>
      </div>

      {/* Managed instances */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Icon name="computer-desktop" className="w-4 h-4 text-slate-500" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-900">Managed Instances</span>
            {instances.live && instances.total > 0 && (
              <span className="text-[11px] text-slate-500">{instances.onlineCount}/{instances.total} online</span>
            )}
          </div>
          {instances.live
            ? <LiveDataBadge source="SSM describe_instance_information" detail={instances.note || undefined} />
            : <MockDataBadge integration={instances.note || 'Connect Systems Manager (describe_instance_information)'} />}
        </div>
        {instances.loading ? (
          <div className="px-4 py-6 text-xs text-slate-400">Loading managed instances...</div>
        ) : !instances.live ? (
          <div className="px-4 py-6 text-xs text-slate-500">{instances.note || 'Systems Manager is unreachable - check credentials and permissions.'}</div>
        ) : instances.total === 0 ? (
          <div className="px-4 py-6 text-xs text-slate-500">No managed instances are reporting to Systems Manager in this region.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Instance</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Ping Status</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Platform</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Agent</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">IP Address</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Last Ping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instances.instances.map((inst: SsmManagedInstance) => {
                const ps = pingStatusStyle(inst.ping_status);
                return (
                  <tr key={inst.instance_id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{inst.name || inst.instance_id}</div>
                      {inst.name && <div className="text-[10px] text-slate-400 font-mono">{inst.instance_id}</div>}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${ps.bg} ${ps.color}`}>{inst.ping_status}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {[inst.platform_name, inst.platform_type].filter(Boolean).join(' - ') || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{inst.agent_version || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-600 font-mono">{inst.ip_address || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-500">{inst.last_ping_at ? formatDateTime(inst.last_ping_at) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Document / runbook catalog */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Icon name="document-text" className="w-4 h-4 text-slate-500" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-900">Document / Runbook Catalog</span>
            {catalog.live && catalog.total > 0 && (
              <span className="text-[11px] text-slate-500">{catalog.commandCount} Command - {catalog.automationCount} Automation</span>
            )}
          </div>
          {catalog.live
            ? <LiveDataBadge source="SSM list_documents" detail={catalog.note || undefined} />
            : <MockDataBadge integration={catalog.note || 'Connect Systems Manager (list_documents)'} />}
        </div>
        {catalog.loading ? (
          <div className="px-4 py-6 text-xs text-slate-400">Loading document catalog...</div>
        ) : !catalog.live ? (
          <div className="px-4 py-6 text-xs text-slate-500">{catalog.note || 'Systems Manager is unreachable - check credentials and permissions.'}</div>
        ) : catalog.total === 0 ? (
          <div className="px-4 py-6 text-xs text-slate-500">No Command or Automation documents are available in this region.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Document</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Type</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Owner</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Platforms</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Version</th>
                <th className="text-right py-2.5 px-4 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {catalog.runbooks.map((doc: SsmRunbookDoc, i: number) => (
                <tr key={`${doc.name}-${i}`} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{doc.name}</div>
                    {doc.target_type && <div className="text-[10px] text-slate-400">{doc.target_type}</div>}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${doc.document_type === 'Automation' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{doc.document_type || '-'}</span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{doc.owner || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{doc.platform_types.length > 0 ? doc.platform_types.join(', ') : '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{doc.default_version || '-'}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      disabled
                      title="Read-only - execution not enabled in this build"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 border border-slate-200 rounded cursor-not-allowed"
                    >
                      <Icon name="play-circle" className="w-3.5 h-3.5" strokeWidth={2} />
                      Run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400">
          Read-only - execution not enabled in this build. No SendCommand or StartAutomationExecution is issued.
        </div>
      </div>

      {/* Command history */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Icon name="clock" className="w-4 h-4 text-slate-500" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-900">Recent Command History</span>
            <span className="text-[11px] text-slate-500">last 7 days</span>
          </div>
          {history.live
            ? <LiveDataBadge source="SSM list_commands" detail={history.note || undefined} />
            : <MockDataBadge integration={history.note || 'Connect Systems Manager (list_commands)'} />}
        </div>
        {history.loading ? (
          <div className="px-4 py-6 text-xs text-slate-400">Loading command history...</div>
        ) : !history.live ? (
          <div className="px-4 py-6 text-xs text-slate-500">{history.note || 'Systems Manager is unreachable - check credentials and permissions.'}</div>
        ) : history.total === 0 ? (
          <div className="px-4 py-6 text-xs text-slate-500">No Run Command executions in the last 7 days.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Command</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Status</th>
                <th className="text-center py-2.5 px-4 font-semibold text-slate-700">Targets</th>
                <th className="text-center py-2.5 px-4 font-semibold text-slate-700">Errors</th>
                <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.commands.map((cmd: SsmCommandRecord) => {
                const cs = commandStatusStyle(cmd.status);
                return (
                  <tr key={cmd.command_id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{cmd.document_name || '-'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{cmd.command_id}</div>
                      {cmd.comment && <div className="text-[10px] text-slate-500 truncate max-w-xs">{cmd.comment}</div>}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${cs.bg} ${cs.color}`}>{cmd.status}</span>
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-600">{cmd.targets_count}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={cmd.error_count && cmd.error_count > 0 ? 'text-rose-600 font-medium' : 'text-slate-500'}>{cmd.error_count ?? 0}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{cmd.requested_at ? formatDateTime(cmd.requested_at) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Execution Tracker Component ───────────────────────────

interface ExecutionTrackerProps {
  execution: ExecutionRecord;
  runbook: Runbook;
  isActive: boolean;
  onAbort: () => void;
}

function ExecutionTracker({ execution, runbook, isActive, onAbort }: ExecutionTrackerProps) {
  const [currentStep, setCurrentStep] = useState(execution.currentStep || 0);
  const [stepStatuses, setStepStatuses] = useState<Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>>({});
  const [logs, setLogs] = useState(execution.logs);
  const [duration] = useState(execution.duration);

  // Simulate execution progress
  const advanceStep = () => {
    if (currentStep < runbook.steps.length) {
      const step = runbook.steps[currentStep];
      setStepStatuses(prev => ({ ...prev, [step.id]: 'completed' }));
      setLogs(prev => [
        ...prev,
        { timestamp: new Date().toISOString(), step: step.name, message: `Step completed: ${step.expectedOutcome}`, level: 'success' as const },
      ]);
      if (currentStep < runbook.steps.length - 1) {
        const nextStep = runbook.steps[currentStep + 1];
        setStepStatuses(prev => ({ ...prev, [nextStep.id]: 'running' }));
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const skipStep = () => {
    if (currentStep < runbook.steps.length) {
      const step = runbook.steps[currentStep];
      setStepStatuses(prev => ({ ...prev, [step.id]: 'skipped' }));
      setLogs(prev => [
        ...prev,
        { timestamp: new Date().toISOString(), step: step.name, message: 'Step skipped by user', level: 'warn' as const },
      ]);
      if (currentStep < runbook.steps.length - 1) {
        const nextStep = runbook.steps[currentStep + 1];
        setStepStatuses(prev => ({ ...prev, [nextStep.id]: 'running' }));
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const approveStep = () => {
    setLogs(prev => [
      ...prev,
      { timestamp: new Date().toISOString(), step: runbook.steps[currentStep].name, message: 'Approval granted', level: 'success' as const },
    ]);
    advanceStep();
  };

  return (
    <div className="space-y-4">
      {/* Simulation notice — this tracker does not execute the AWS CLI commands shown */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
        <Icon name="information-circle" className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
        <span>
          Simulation only &mdash; advancing, approving, or skipping steps updates this view but does <strong>not</strong> execute the AWS CLI commands shown. No AWS calls are made.
        </span>
      </div>

      {/* Execution Header */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${statusConfig[execution.status].bg} ${statusConfig[execution.status].color}`}>
                {statusConfig[execution.status].label}
              </span>
              <span className="text-xs text-slate-500">Execution {execution.id}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{runbook.name}</h2>
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Icon name={triggerConfig[execution.trigger].icon} className="w-3.5 h-3.5" strokeWidth={2} />
                {triggerConfig[execution.trigger].label}
              </span>
              <span>Executor: {execution.executor}</span>
              <span>Started: {formatDateTime(execution.startTime)}</span>
              <span>Duration: {formatDuration(duration)}</span>
            </div>
          </div>
          {isActive && (
            <button
              onClick={onAbort}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50"
            >
              <Icon name="stop-circle" className="w-3.5 h-3.5" strokeWidth={2} />
              Abort Execution
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${((currentStep + 1) / runbook.steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">
            Step {currentStep + 1} of {runbook.steps.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Step Tracker */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-900 mb-4">Step Progress</div>
          <div className="space-y-2">
            {runbook.steps.map((step, index) => {
              const stepConfig = stepTypeConfig[step.type];
              const status = stepStatuses[step.id] || (index === currentStep ? 'running' : index < currentStep ? 'completed' : 'pending');
              const isCurrent = index === currentStep && isActive;

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isCurrent ? 'bg-blue-50 border border-blue-200' :
                    status === 'completed' ? 'bg-emerald-50' :
                    status === 'failed' ? 'bg-rose-50' :
                    status === 'skipped' ? 'bg-slate-100' :
                    'bg-slate-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    status === 'completed' ? 'bg-emerald-500 text-white' :
                    status === 'running' ? 'bg-blue-500 text-white' :
                    status === 'failed' ? 'bg-rose-500 text-white' :
                    status === 'skipped' ? 'bg-slate-400 text-white' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {status === 'completed' && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2} />}
                    {status === 'running' && <Icon name="spinner" className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />}
                    {status === 'failed' && <Icon name="x-mark" className="w-3.5 h-3.5" strokeWidth={2} />}
                    {status === 'skipped' && <span className="text-[10px] font-bold">-</span>}
                    {status === 'pending' && <span className="text-[10px] font-bold">{index + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-900">{step.name}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded ${stepConfig.bg} ${stepConfig.color}`}>
                        {stepConfig.label}
                      </span>
                      {step.approvalRequired && (
                        <Icon name="lock-closed" className="w-3 h-3 text-amber-500" strokeWidth={2} />
                      )}
                    </div>
                    {isCurrent && (
                      <div className="text-[10px] text-slate-500 mt-0.5">{step.description}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons for Active Execution */}
          {isActive && currentStep < runbook.steps.length && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
              {runbook.steps[currentStep].approvalRequired ? (
                <button
                  onClick={approveStep}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2} />
                  Approve & Continue
                </button>
              ) : (
                <button
                  onClick={advanceStep}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Icon name="play-circle" className="w-3.5 h-3.5" strokeWidth={2} />
                  Complete Step
                </button>
              )}
              <button
                onClick={skipStep}
                className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Skip
              </button>
            </div>
          )}
        </div>

        {/* Execution Logs */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-900 mb-4">Execution Logs</div>
          <div className="bg-slate-900 rounded-lg p-3 h-96 overflow-y-auto font-mono text-[11px]">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2 py-1">
                <span className="text-slate-500 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`flex-shrink-0 ${
                  log.level === 'error' ? 'text-rose-400' :
                  log.level === 'warn' ? 'text-amber-400' :
                  log.level === 'success' ? 'text-emerald-400' :
                  'text-blue-400'
                }`}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="text-slate-400">[{log.step}]</span>
                <span className="text-slate-200">{log.message}</span>
              </div>
            ))}
            {isActive && (
              <div className="flex items-center gap-2 py-1 text-slate-400">
                <Icon name="spinner" className="w-3 h-3 animate-spin" strokeWidth={2} />
                <span>Waiting for input...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Runbook Editor Component ───────────────────────────

interface RunbookEditorProps {
  runbook: Runbook | null;
  onSave: () => void;
  onCancel: () => void;
}

function RunbookEditor({ runbook, onSave, onCancel }: RunbookEditorProps) {
  const [name, setName] = useState(runbook?.name || '');
  const [description, setDescription] = useState(runbook?.description || '');
  const [category, setCategory] = useState<RunbookCategory>(runbook?.category || 'incident-response');
  const [steps, setSteps] = useState<RunbookStep[]>(runbook?.steps || []);
  const [autoTriggerRules, setAutoTriggerRules] = useState<string[]>(runbook?.autoTriggerRules || []);

  const addStep = () => {
    const newStep: RunbookStep = {
      id: `s-${Date.now()}`,
      name: 'New Step',
      type: 'check',
      description: '',
      expectedOutcome: '',
    };
    setSteps([...steps, newStep]);
  };

  const updateStep = (index: number, updates: Partial<RunbookStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    setSteps(newSteps);
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="text-sm font-semibold text-slate-900 mb-4">
          {runbook ? 'Edit Runbook' : 'Create New Runbook'}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Runbook name"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as RunbookCategory)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(categoryConfig).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-700 block mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what this runbook does..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Auto-trigger Rules */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-slate-900">Auto-trigger Rules</div>
          <button
            onClick={() => setAutoTriggerRules([...autoTriggerRules, ''])}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            + Add Rule
          </button>
        </div>
        <div className="space-y-2">
          {autoTriggerRules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={rule}
                onChange={e => {
                  const newRules = [...autoTriggerRules];
                  newRules[i] = e.target.value;
                  setAutoTriggerRules(newRules);
                }}
                placeholder="e.g., P99 latency > 2000ms for 5 minutes"
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setAutoTriggerRules(autoTriggerRules.filter((_, j) => j !== i))}
                className="p-1.5 text-slate-400 hover:text-rose-500"
              >
                <Icon name="x-mark" className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          ))}
          {autoTriggerRules.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-4">
              No auto-trigger rules. This runbook can only be run manually.
            </div>
          )}
        </div>
      </div>

      {/* Steps Builder */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-slate-900">Steps ({steps.length})</div>
          <button
            onClick={addStep}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2} />
            Add Step
          </button>
        </div>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start gap-4">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveStep(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                  >
                    <Icon name="chevron-up" className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                    {index + 1}
                  </div>
                  <button
                    onClick={() => moveStep(index, 'down')}
                    disabled={index === steps.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                  >
                    <Icon name="chevron-down" className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">Name</label>
                      <input
                        type="text"
                        value={step.name}
                        onChange={e => updateStep(index, { name: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">Type</label>
                      <select
                        value={step.type}
                        onChange={e => updateStep(index, { type: e.target.value as StepType })}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {Object.entries(stepTypeConfig).map(([key, config]) => (
                          <option key={key} value={key}>{config.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={step.approvalRequired || false}
                          onChange={e => updateStep(index, { approvalRequired: e.target.checked })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Approval Required
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-1">Description</label>
                    <input
                      type="text"
                      value={step.description}
                      onChange={e => updateStep(index, { description: e.target.value })}
                      placeholder="What this step does..."
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">Command (optional)</label>
                      <input
                        type="text"
                        value={step.command || ''}
                        onChange={e => updateStep(index, { command: e.target.value })}
                        placeholder="aws bedrock-agentcore ..."
                        className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">Expected Outcome</label>
                      <input
                        type="text"
                        value={step.expectedOutcome}
                        onChange={e => updateStep(index, { expectedOutcome: e.target.value })}
                        placeholder="What success looks like..."
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">Timeout (seconds)</label>
                      <input
                        type="number"
                        value={step.timeout || ''}
                        onChange={e => updateStep(index, { timeout: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="300"
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">Retries</label>
                      <input
                        type="number"
                        value={step.retries || ''}
                        onChange={e => updateStep(index, { retries: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 block mb-1">Rollback Command</label>
                      <input
                        type="text"
                        value={step.rollback || ''}
                        onChange={e => updateStep(index, { rollback: e.target.value })}
                        placeholder="Rollback command..."
                        className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeStep(index)}
                  className="p-1.5 text-slate-400 hover:text-rose-500"
                >
                  <Icon name="x-mark" className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
          {steps.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Icon name="document-text" className="w-8 h-8 mx-auto mb-2" strokeWidth={1.5} />
              <div className="text-xs">No steps yet. Add your first step to get started.</div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <button
          type="button"
          disabled
          title="Test run is not available yet"
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed"
        >
          <Icon name="beaker" className="w-3.5 h-3.5" strokeWidth={2} />
          Test Run (coming soon)
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!name || steps.length === 0}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {runbook ? 'Save Changes' : 'Create Runbook'}
          </button>
        </div>
      </div>
    </div>
  );
}
