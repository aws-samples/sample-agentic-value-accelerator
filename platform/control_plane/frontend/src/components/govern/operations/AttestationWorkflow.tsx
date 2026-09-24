/**
 * AttestationWorkflow - Enterprise-grade Attestation Workflow System
 *
 * Comprehensive GRC attestation management with:
 * - Multi-level sign-off chain (control-owner, reviewer, risk-manager, audit-committee, ciso)
 * - Visual workflow diagram showing approval chain
 * - Bulk attestation for multiple controls
 * - Delegation with audit trail
 * - Auto-escalation rules (overdue > 7 days)
 * - Digital signature simulation (hash + timestamp)
 * - Comments/notes at each approval step
 * - Evidence snapshot lock at attestation time
 * - Re-certification scheduling (quarterly/annual)
 * - Attestation history timeline
 */

import { useState, useMemo, useCallback } from 'react';
import { Icon } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge } from '../DataSourceIndicator';
import CoreBadge from '../CoreBadge';
import Drawer from '../Drawer';

// ============================================================================
// Types
// ============================================================================

type AttestationType = 'control-owner' | 'reviewer' | 'risk-manager' | 'audit-committee' | 'ciso';

type WorkflowState =
  | 'draft'
  | 'pending-review'
  | 'approved'
  | 'rejected'
  | 'delegated'
  | 'escalated'
  | 'attested'
  | 'expired';

type RecertificationFrequency = 'quarterly' | 'semi-annual' | 'annual';

type ControlCategory = 'platform' | 'policy' | 'guardrail' | 'custom';

interface Approver {
  id: string;
  name: string;
  email: string;
  role: AttestationType;
  department: string;
  delegatedTo?: string;
  delegatedAt?: string;
}

interface ApprovalStep {
  id: string;
  attestationType: AttestationType;
  approver: Approver;
  status: WorkflowState;
  submittedAt?: string;
  completedAt?: string;
  comments?: string;
  digitalSignature?: string;
  evidenceSnapshotId?: string;
}

interface DelegationEvent {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  delegatedAt: string;
  reason: string;
  attestationType: AttestationType;
}

interface AttestationRecord {
  id: string;
  controlId: string;
  controlName: string;
  controlCategory: ControlCategory;
  workflowState: WorkflowState;
  currentStep: number;
  totalSteps: number;
  approvalChain: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
  dueDate: string;
  recertificationFrequency: RecertificationFrequency;
  nextRecertificationDate: string;
  escalatedAt?: string;
  escalationReason?: string;
  delegationHistory: DelegationEvent[];
  evidenceLockedAt?: string;
  evidenceSnapshotId?: string;
}

interface HistoryEvent {
  id: string;
  attestationId: string;
  eventType: 'created' | 'submitted' | 'approved' | 'rejected' | 'delegated' | 'escalated' | 'expired' | 'recertified';
  actor: string;
  timestamp: string;
  details: string;
  oldState?: WorkflowState;
  newState?: WorkflowState;
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_APPROVERS: Approver[] = [
  { id: 'user-001', name: 'Sarah Chen', email: 'sarah.chen@company.com', role: 'control-owner', department: 'Platform Engineering' },
  { id: 'user-002', name: 'Michael Torres', email: 'michael.torres@company.com', role: 'reviewer', department: 'Internal Audit' },
  { id: 'user-003', name: 'Jennifer Park', email: 'jennifer.park@company.com', role: 'risk-manager', department: 'Risk Management' },
  { id: 'user-004', name: 'David Kim', email: 'david.kim@company.com', role: 'audit-committee', department: 'Board' },
  { id: 'user-005', name: 'Lisa Wong', email: 'lisa.wong@company.com', role: 'ciso', department: 'Security' },
  { id: 'user-006', name: 'Robert Adams', email: 'robert.adams@company.com', role: 'control-owner', department: 'Compliance' },
  { id: 'user-007', name: 'Emily Zhang', email: 'emily.zhang@company.com', role: 'reviewer', department: 'Internal Audit' },
  { id: 'user-008', name: 'James Wilson', email: 'james.wilson@company.com', role: 'risk-manager', department: 'Risk Management' },
];

function generateDigitalSignature(data: string): string {
  // Placeholder signature for demo data only. This is a simple bit-shift
  // hash, NOT a real cryptographic signature or SHA-256 digest.
  const hash = Array.from(data)
    .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
    .toString(16)
    .padStart(8, '0');
  return `DEMO-SIG:${hash}-${Date.now().toString(36)}`.toUpperCase();
}

const MOCK_ATTESTATIONS: AttestationRecord[] = [
  {
    id: 'att-001',
    controlId: 'ctrl-001',
    controlName: 'Model Invocation Logging',
    controlCategory: 'platform',
    workflowState: 'attested',
    currentStep: 4,
    totalSteps: 4,
    approvalChain: [
      { id: 'step-001-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[0], status: 'approved', submittedAt: '2026-07-01T10:00:00Z', completedAt: '2026-07-01T14:30:00Z', comments: 'Control operating as designed. All log fields captured.', digitalSignature: generateDigitalSignature('att-001-step-1'), evidenceSnapshotId: 'snap-001' },
      { id: 'step-001-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[1], status: 'approved', submittedAt: '2026-07-01T14:30:00Z', completedAt: '2026-07-02T09:15:00Z', comments: 'Evidence reviewed. Sampling confirms 100% capture rate.', digitalSignature: generateDigitalSignature('att-001-step-2'), evidenceSnapshotId: 'snap-001' },
      { id: 'step-001-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'approved', submittedAt: '2026-07-02T09:15:00Z', completedAt: '2026-07-02T16:00:00Z', comments: 'Risk assessment complete. Residual risk acceptable.', digitalSignature: generateDigitalSignature('att-001-step-3'), evidenceSnapshotId: 'snap-001' },
      { id: 'step-001-4', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'approved', submittedAt: '2026-07-02T16:00:00Z', completedAt: '2026-07-03T11:00:00Z', comments: 'Final sign-off granted.', digitalSignature: generateDigitalSignature('att-001-step-4'), evidenceSnapshotId: 'snap-001' },
    ],
    createdAt: '2026-07-01T09:00:00Z',
    updatedAt: '2026-07-03T11:00:00Z',
    dueDate: '2026-07-15T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-10-03T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-07-01T10:00:00Z',
    evidenceSnapshotId: 'snap-001',
  },
  {
    id: 'att-002',
    controlId: 'ctrl-002',
    controlName: 'IAM Role Boundary',
    controlCategory: 'platform',
    workflowState: 'pending-review',
    currentStep: 2,
    totalSteps: 5,
    approvalChain: [
      { id: 'step-002-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[0], status: 'approved', submittedAt: '2026-08-01T10:00:00Z', completedAt: '2026-08-01T15:00:00Z', comments: 'All IAM policies reviewed and compliant.', digitalSignature: generateDigitalSignature('att-002-step-1'), evidenceSnapshotId: 'snap-002' },
      { id: 'step-002-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[1], status: 'pending-review', submittedAt: '2026-08-01T15:00:00Z' },
      { id: 'step-002-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'draft' },
      { id: 'step-002-4', attestationType: 'audit-committee', approver: MOCK_APPROVERS[3], status: 'draft' },
      { id: 'step-002-5', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'draft' },
    ],
    createdAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-01T15:00:00Z',
    dueDate: '2026-08-15T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-11-15T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-08-01T10:00:00Z',
    evidenceSnapshotId: 'snap-002',
  },
  {
    id: 'att-003',
    controlId: 'ctrl-003',
    controlName: 'PII Detection and Masking',
    controlCategory: 'guardrail',
    workflowState: 'rejected',
    currentStep: 2,
    totalSteps: 4,
    approvalChain: [
      { id: 'step-003-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[5], status: 'approved', submittedAt: '2026-07-20T10:00:00Z', completedAt: '2026-07-20T14:00:00Z', comments: 'PII detection operating with 99.8% accuracy.', digitalSignature: generateDigitalSignature('att-003-step-1'), evidenceSnapshotId: 'snap-003' },
      { id: 'step-003-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[6], status: 'rejected', submittedAt: '2026-07-20T14:00:00Z', completedAt: '2026-07-21T10:00:00Z', comments: 'REJECTED: Test coverage insufficient for new PII patterns (addresses, phone numbers). Need additional test cases before approval.', digitalSignature: generateDigitalSignature('att-003-step-2-reject'), evidenceSnapshotId: 'snap-003' },
      { id: 'step-003-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'draft' },
      { id: 'step-003-4', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'draft' },
    ],
    createdAt: '2026-07-20T09:00:00Z',
    updatedAt: '2026-07-21T10:00:00Z',
    dueDate: '2026-08-01T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-10-21T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-07-20T10:00:00Z',
    evidenceSnapshotId: 'snap-003',
  },
  {
    id: 'att-004',
    controlId: 'ctrl-004',
    controlName: 'Human-in-the-Loop',
    controlCategory: 'policy',
    workflowState: 'delegated',
    currentStep: 1,
    totalSteps: 4,
    approvalChain: [
      { id: 'step-004-1', attestationType: 'control-owner', approver: { ...MOCK_APPROVERS[7], delegatedTo: 'user-001', delegatedAt: '2026-08-05T09:00:00Z' }, status: 'delegated', submittedAt: '2026-08-04T10:00:00Z' },
      { id: 'step-004-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[1], status: 'draft' },
      { id: 'step-004-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'draft' },
      { id: 'step-004-4', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'draft' },
    ],
    createdAt: '2026-08-04T09:00:00Z',
    updatedAt: '2026-08-05T09:00:00Z',
    dueDate: '2026-08-20T00:00:00Z',
    recertificationFrequency: 'semi-annual',
    nextRecertificationDate: '2027-02-05T00:00:00Z',
    delegationHistory: [
      { id: 'del-001', fromUserId: 'user-008', fromUserName: 'James Wilson', toUserId: 'user-001', toUserName: 'Sarah Chen', delegatedAt: '2026-08-05T09:00:00Z', reason: 'On PTO until August 15th. Sarah has deep knowledge of this control.', attestationType: 'control-owner' },
    ],
    evidenceLockedAt: '2026-08-04T10:00:00Z',
    evidenceSnapshotId: 'snap-004',
  },
  {
    id: 'att-005',
    controlId: 'ctrl-005',
    controlName: 'Model Drift Detection',
    controlCategory: 'policy',
    workflowState: 'escalated',
    currentStep: 2,
    totalSteps: 3,
    approvalChain: [
      { id: 'step-005-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[0], status: 'approved', submittedAt: '2026-07-25T10:00:00Z', completedAt: '2026-07-25T14:00:00Z', comments: 'Drift detection thresholds calibrated.', digitalSignature: generateDigitalSignature('att-005-step-1'), evidenceSnapshotId: 'snap-005' },
      { id: 'step-005-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[6], status: 'escalated', submittedAt: '2026-07-25T14:00:00Z' },
      { id: 'step-005-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'draft' },
    ],
    createdAt: '2026-07-25T09:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    dueDate: '2026-07-31T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-10-25T00:00:00Z',
    escalatedAt: '2026-08-01T00:00:00Z',
    escalationReason: 'Review step overdue by 7+ days. Auto-escalated to department head.',
    delegationHistory: [],
    evidenceLockedAt: '2026-07-25T10:00:00Z',
    evidenceSnapshotId: 'snap-005',
  },
  {
    id: 'att-006',
    controlId: 'ctrl-006',
    controlName: 'Prompt Injection Defense',
    controlCategory: 'guardrail',
    workflowState: 'expired',
    currentStep: 4,
    totalSteps: 4,
    approvalChain: [
      { id: 'step-006-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[0], status: 'approved', submittedAt: '2026-04-01T10:00:00Z', completedAt: '2026-04-01T15:00:00Z', comments: 'Injection defense operational.', digitalSignature: generateDigitalSignature('att-006-step-1'), evidenceSnapshotId: 'snap-006' },
      { id: 'step-006-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[1], status: 'approved', submittedAt: '2026-04-01T15:00:00Z', completedAt: '2026-04-02T10:00:00Z', comments: 'Test suite passing.', digitalSignature: generateDigitalSignature('att-006-step-2'), evidenceSnapshotId: 'snap-006' },
      { id: 'step-006-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'approved', submittedAt: '2026-04-02T10:00:00Z', completedAt: '2026-04-02T16:00:00Z', comments: 'Risk accepted.', digitalSignature: generateDigitalSignature('att-006-step-3'), evidenceSnapshotId: 'snap-006' },
      { id: 'step-006-4', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'approved', submittedAt: '2026-04-02T16:00:00Z', completedAt: '2026-04-03T11:00:00Z', comments: 'Approved.', digitalSignature: generateDigitalSignature('att-006-step-4'), evidenceSnapshotId: 'snap-006' },
    ],
    createdAt: '2026-04-01T09:00:00Z',
    updatedAt: '2026-04-03T11:00:00Z',
    dueDate: '2026-04-15T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-07-03T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-04-01T10:00:00Z',
    evidenceSnapshotId: 'snap-006',
  },
  {
    id: 'att-007',
    controlId: 'ctrl-007',
    controlName: 'Data Retention Policy',
    controlCategory: 'policy',
    workflowState: 'draft',
    currentStep: 0,
    totalSteps: 3,
    approvalChain: [
      { id: 'step-007-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[5], status: 'draft' },
      { id: 'step-007-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[6], status: 'draft' },
      { id: 'step-007-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'draft' },
    ],
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-10T09:00:00Z',
    dueDate: '2026-08-25T00:00:00Z',
    recertificationFrequency: 'annual',
    nextRecertificationDate: '2027-08-10T00:00:00Z',
    delegationHistory: [],
  },
  {
    id: 'att-008',
    controlId: 'ctrl-008',
    controlName: 'Network Isolation',
    controlCategory: 'platform',
    workflowState: 'approved',
    currentStep: 3,
    totalSteps: 4,
    approvalChain: [
      { id: 'step-008-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[0], status: 'approved', submittedAt: '2026-08-05T10:00:00Z', completedAt: '2026-08-05T14:00:00Z', comments: 'VPC configuration verified.', digitalSignature: generateDigitalSignature('att-008-step-1'), evidenceSnapshotId: 'snap-008' },
      { id: 'step-008-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[1], status: 'approved', submittedAt: '2026-08-05T14:00:00Z', completedAt: '2026-08-06T09:00:00Z', comments: 'Network scan results reviewed.', digitalSignature: generateDigitalSignature('att-008-step-2'), evidenceSnapshotId: 'snap-008' },
      { id: 'step-008-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'approved', submittedAt: '2026-08-06T09:00:00Z', completedAt: '2026-08-06T15:00:00Z', comments: 'Network isolation adequate.', digitalSignature: generateDigitalSignature('att-008-step-3'), evidenceSnapshotId: 'snap-008' },
      { id: 'step-008-4', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'pending-review', submittedAt: '2026-08-06T15:00:00Z' },
    ],
    createdAt: '2026-08-05T09:00:00Z',
    updatedAt: '2026-08-06T15:00:00Z',
    dueDate: '2026-08-20T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-11-06T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-08-05T10:00:00Z',
    evidenceSnapshotId: 'snap-008',
  },
  {
    id: 'att-009',
    controlId: 'ctrl-002',
    controlName: 'IAM Role Boundary',
    controlCategory: 'platform',
    workflowState: 'attested',
    currentStep: 5,
    totalSteps: 5,
    approvalChain: [
      { id: 'step-009-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[0], status: 'approved', submittedAt: '2026-05-01T10:00:00Z', completedAt: '2026-05-01T14:00:00Z', comments: 'Q2 review complete.', digitalSignature: generateDigitalSignature('att-009-step-1'), evidenceSnapshotId: 'snap-009' },
      { id: 'step-009-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[1], status: 'approved', submittedAt: '2026-05-01T14:00:00Z', completedAt: '2026-05-02T09:00:00Z', comments: 'Audit passed.', digitalSignature: generateDigitalSignature('att-009-step-2'), evidenceSnapshotId: 'snap-009' },
      { id: 'step-009-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'approved', submittedAt: '2026-05-02T09:00:00Z', completedAt: '2026-05-02T14:00:00Z', comments: 'Risk acceptable.', digitalSignature: generateDigitalSignature('att-009-step-3'), evidenceSnapshotId: 'snap-009' },
      { id: 'step-009-4', attestationType: 'audit-committee', approver: MOCK_APPROVERS[3], status: 'approved', submittedAt: '2026-05-02T14:00:00Z', completedAt: '2026-05-03T10:00:00Z', comments: 'Board review complete.', digitalSignature: generateDigitalSignature('att-009-step-4'), evidenceSnapshotId: 'snap-009' },
      { id: 'step-009-5', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'approved', submittedAt: '2026-05-03T10:00:00Z', completedAt: '2026-05-03T15:00:00Z', comments: 'Final approval granted.', digitalSignature: generateDigitalSignature('att-009-step-5'), evidenceSnapshotId: 'snap-009' },
    ],
    createdAt: '2026-05-01T09:00:00Z',
    updatedAt: '2026-05-03T15:00:00Z',
    dueDate: '2026-05-15T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-08-03T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-05-01T10:00:00Z',
    evidenceSnapshotId: 'snap-009',
  },
  {
    id: 'att-010',
    controlId: 'ctrl-003',
    controlName: 'PII Detection and Masking',
    controlCategory: 'guardrail',
    workflowState: 'pending-review',
    currentStep: 1,
    totalSteps: 4,
    approvalChain: [
      { id: 'step-010-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[5], status: 'pending-review', submittedAt: '2026-08-09T10:00:00Z' },
      { id: 'step-010-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[6], status: 'draft' },
      { id: 'step-010-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'draft' },
      { id: 'step-010-4', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'draft' },
    ],
    createdAt: '2026-08-09T09:00:00Z',
    updatedAt: '2026-08-09T10:00:00Z',
    dueDate: '2026-08-23T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-11-09T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-08-09T10:00:00Z',
    evidenceSnapshotId: 'snap-010',
  },
  {
    id: 'att-011',
    controlId: 'ctrl-004',
    controlName: 'Human-in-the-Loop',
    controlCategory: 'policy',
    workflowState: 'attested',
    currentStep: 4,
    totalSteps: 4,
    approvalChain: [
      { id: 'step-011-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[7], status: 'approved', submittedAt: '2026-06-01T10:00:00Z', completedAt: '2026-06-01T15:00:00Z', comments: 'Workflow thresholds verified.', digitalSignature: generateDigitalSignature('att-011-step-1'), evidenceSnapshotId: 'snap-011' },
      { id: 'step-011-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[1], status: 'approved', submittedAt: '2026-06-01T15:00:00Z', completedAt: '2026-06-02T10:00:00Z', comments: 'Sample review passed.', digitalSignature: generateDigitalSignature('att-011-step-2'), evidenceSnapshotId: 'snap-011' },
      { id: 'step-011-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'approved', submittedAt: '2026-06-02T10:00:00Z', completedAt: '2026-06-02T15:00:00Z', comments: 'Risk controls adequate.', digitalSignature: generateDigitalSignature('att-011-step-3'), evidenceSnapshotId: 'snap-011' },
      { id: 'step-011-4', attestationType: 'ciso', approver: MOCK_APPROVERS[4], status: 'approved', submittedAt: '2026-06-02T15:00:00Z', completedAt: '2026-06-03T10:00:00Z', comments: 'Approved.', digitalSignature: generateDigitalSignature('att-011-step-4'), evidenceSnapshotId: 'snap-011' },
    ],
    createdAt: '2026-06-01T09:00:00Z',
    updatedAt: '2026-06-03T10:00:00Z',
    dueDate: '2026-06-15T00:00:00Z',
    recertificationFrequency: 'semi-annual',
    nextRecertificationDate: '2026-12-03T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-06-01T10:00:00Z',
    evidenceSnapshotId: 'snap-011',
  },
  {
    id: 'att-012',
    controlId: 'ctrl-005',
    controlName: 'Model Drift Detection',
    controlCategory: 'policy',
    workflowState: 'attested',
    currentStep: 3,
    totalSteps: 3,
    approvalChain: [
      { id: 'step-012-1', attestationType: 'control-owner', approver: MOCK_APPROVERS[0], status: 'approved', submittedAt: '2026-04-25T10:00:00Z', completedAt: '2026-04-25T14:00:00Z', comments: 'Drift monitoring operational.', digitalSignature: generateDigitalSignature('att-012-step-1'), evidenceSnapshotId: 'snap-012' },
      { id: 'step-012-2', attestationType: 'reviewer', approver: MOCK_APPROVERS[6], status: 'approved', submittedAt: '2026-04-25T14:00:00Z', completedAt: '2026-04-26T10:00:00Z', comments: 'Thresholds reviewed.', digitalSignature: generateDigitalSignature('att-012-step-2'), evidenceSnapshotId: 'snap-012' },
      { id: 'step-012-3', attestationType: 'risk-manager', approver: MOCK_APPROVERS[2], status: 'approved', submittedAt: '2026-04-26T10:00:00Z', completedAt: '2026-04-26T16:00:00Z', comments: 'Approved.', digitalSignature: generateDigitalSignature('att-012-step-3'), evidenceSnapshotId: 'snap-012' },
    ],
    createdAt: '2026-04-25T09:00:00Z',
    updatedAt: '2026-04-26T16:00:00Z',
    dueDate: '2026-05-10T00:00:00Z',
    recertificationFrequency: 'quarterly',
    nextRecertificationDate: '2026-07-26T00:00:00Z',
    delegationHistory: [],
    evidenceLockedAt: '2026-04-25T10:00:00Z',
    evidenceSnapshotId: 'snap-012',
  },
];

const MOCK_HISTORY: HistoryEvent[] = [
  { id: 'hist-001', attestationId: 'att-001', eventType: 'created', actor: 'System', timestamp: '2026-07-01T09:00:00Z', details: 'Attestation workflow initiated for quarterly review' },
  { id: 'hist-002', attestationId: 'att-001', eventType: 'submitted', actor: 'Sarah Chen', timestamp: '2026-07-01T10:00:00Z', details: 'Control owner submitted for review', oldState: 'draft', newState: 'pending-review' },
  { id: 'hist-003', attestationId: 'att-001', eventType: 'approved', actor: 'Sarah Chen', timestamp: '2026-07-01T14:30:00Z', details: 'Control owner sign-off complete' },
  { id: 'hist-004', attestationId: 'att-001', eventType: 'approved', actor: 'Michael Torres', timestamp: '2026-07-02T09:15:00Z', details: 'Reviewer sign-off complete' },
  { id: 'hist-005', attestationId: 'att-001', eventType: 'approved', actor: 'Jennifer Park', timestamp: '2026-07-02T16:00:00Z', details: 'Risk manager sign-off complete' },
  { id: 'hist-006', attestationId: 'att-001', eventType: 'approved', actor: 'Lisa Wong', timestamp: '2026-07-03T11:00:00Z', details: 'CISO final sign-off - attestation complete', oldState: 'approved', newState: 'attested' },
  { id: 'hist-007', attestationId: 'att-003', eventType: 'rejected', actor: 'Emily Zhang', timestamp: '2026-07-21T10:00:00Z', details: 'Reviewer rejected - insufficient test coverage', oldState: 'pending-review', newState: 'rejected' },
  { id: 'hist-008', attestationId: 'att-004', eventType: 'delegated', actor: 'James Wilson', timestamp: '2026-08-05T09:00:00Z', details: 'Delegated to Sarah Chen (PTO)', oldState: 'pending-review', newState: 'delegated' },
  { id: 'hist-009', attestationId: 'att-005', eventType: 'escalated', actor: 'System', timestamp: '2026-08-01T00:00:00Z', details: 'Auto-escalated: review overdue by 7+ days', oldState: 'pending-review', newState: 'escalated' },
  { id: 'hist-010', attestationId: 'att-006', eventType: 'expired', actor: 'System', timestamp: '2026-07-03T00:00:00Z', details: 'Attestation expired - re-certification required', oldState: 'attested', newState: 'expired' },
];

// ============================================================================
// Styling Constants
// ============================================================================

const WORKFLOW_STATE_CONFIG: Record<WorkflowState, { bg: string; text: string; border: string; label: string; icon: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: 'Draft', icon: 'document' },
  'pending-review': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Pending Review', icon: 'clock' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', label: 'Approved', icon: 'check-circle' },
  rejected: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', label: 'Rejected', icon: 'x-circle' },
  delegated: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', label: 'Delegated', icon: 'users' },
  escalated: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', label: 'Escalated', icon: 'bell-alert' },
  attested: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Attested', icon: 'check-badge' },
  expired: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', label: 'Expired', icon: 'exclamation-triangle' },
};

const ATTESTATION_TYPE_CONFIG: Record<AttestationType, { label: string; description: string; icon: string; color: string }> = {
  'control-owner': { label: 'Control Owner', description: 'Initial sign-off that control is operating', icon: 'user', color: 'text-blue-600' },
  'reviewer': { label: 'Reviewer', description: 'Independent review of evidence', icon: 'magnifying-glass', color: 'text-indigo-600' },
  'risk-manager': { label: 'Risk Manager', description: 'Risk acceptance sign-off', icon: 'shield-exclamation', color: 'text-amber-600' },
  'audit-committee': { label: 'Audit Committee', description: 'Final board-level approval', icon: 'building-office', color: 'text-purple-600' },
  'ciso': { label: 'CISO', description: 'Security sign-off for security controls', icon: 'lock-closed', color: 'text-emerald-600' },
};

const CATEGORY_CONFIG: Record<ControlCategory, { bg: string; text: string; label: string }> = {
  platform: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Platform' },
  policy: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Policy' },
  guardrail: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Guardrail' },
  custom: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Custom' },
};

const FREQUENCY_CONFIG: Record<RecertificationFrequency, { label: string; days: number }> = {
  quarterly: { label: 'Quarterly', days: 90 },
  'semi-annual': { label: 'Semi-Annual', days: 180 },
  annual: { label: 'Annual', days: 365 },
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDaysUntilDue(dueDate: string): number {
  const now = new Date();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function isOverdue(dueDate: string): boolean {
  return getDaysUntilDue(dueDate) < 0;
}

// ============================================================================
// Sub-Components
// ============================================================================

function WorkflowDiagram({ attestation }: { attestation: AttestationRecord }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <h4 className="text-sm font-semibold text-slate-900 mb-4">Approval Chain</h4>
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-200" />
        <div
          className="absolute left-6 top-6 w-0.5 bg-emerald-500 transition-all"
          style={{
            height: attestation.currentStep > 0
              ? `${Math.min(100, (attestation.currentStep / attestation.totalSteps) * 100)}%`
              : '0%',
          }}
        />

        {/* Steps */}
        <div className="space-y-6">
          {attestation.approvalChain.map((step, index) => {
            const typeConfig = ATTESTATION_TYPE_CONFIG[step.attestationType];
            const stateConfig = WORKFLOW_STATE_CONFIG[step.status];
            const isComplete = step.status === 'approved' || step.status === 'attested';
            const isCurrent = index === attestation.currentStep - 1 ||
              (attestation.currentStep === 0 && index === 0);

            return (
              <div key={step.id} className="relative flex items-start gap-4">
                {/* Step Indicator */}
                <div
                  className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    isComplete ? 'bg-emerald-100' :
                    step.status === 'rejected' ? 'bg-rose-100' :
                    step.status === 'escalated' ? 'bg-orange-100' :
                    step.status === 'delegated' ? 'bg-violet-100' :
                    isCurrent ? 'bg-amber-100' : 'bg-slate-100'
                  }`}
                >
                  <Icon
                    name={isComplete ? 'check' : step.status === 'rejected' ? 'x-mark' : typeConfig.icon as any}
                    className={`w-5 h-5 ${
                      isComplete ? 'text-emerald-600' :
                      step.status === 'rejected' ? 'text-rose-600' :
                      step.status === 'escalated' ? 'text-orange-600' :
                      step.status === 'delegated' ? 'text-violet-600' :
                      isCurrent ? 'text-amber-600' : 'text-slate-400'
                    }`}
                  />
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{typeConfig.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${stateConfig.bg} ${stateConfig.text}`}>
                      {stateConfig.label}
                    </span>
                    {step.approver.delegatedTo && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600">
                        Delegated
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {step.approver.name} ({step.approver.department})
                    {step.approver.delegatedTo && (
                      <span className="text-violet-600"> - delegated to {
                        MOCK_APPROVERS.find(a => a.id === step.approver.delegatedTo)?.name
                      }</span>
                    )}
                  </div>
                  {step.comments && (
                    <div className={`mt-2 p-2 rounded text-xs ${
                      step.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
                    }`}>
                      {step.comments}
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-400">
                    {step.submittedAt && (
                      <span>Submitted: {formatDateTime(step.submittedAt)}</span>
                    )}
                    {step.completedAt && (
                      <span>Completed: {formatDateTime(step.completedAt)}</span>
                    )}
                    {step.digitalSignature && (
                      <span className="font-mono text-slate-400" title="Placeholder signature (demo data, not a verified cryptographic signature)">
                        <Icon name="finger-print" className="w-3 h-3 inline mr-1" />
                        {step.digitalSignature.slice(0, 20)}...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttestationCard({
  attestation,
  onSelect,
  isSelected,
}: {
  attestation: AttestationRecord;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const stateConfig = WORKFLOW_STATE_CONFIG[attestation.workflowState];
  const categoryConfig = CATEGORY_CONFIG[attestation.controlCategory];
  const daysUntil = getDaysUntilDue(attestation.dueDate);
  const overdue = isOverdue(attestation.dueDate);

  return (
    <div
      onClick={() => onSelect(attestation.id)}
      className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-indigo-300 ring-2 ring-indigo-100'
          : 'border-slate-200/60 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${categoryConfig.bg} ${categoryConfig.text}`}>
              {categoryConfig.label}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${stateConfig.bg} ${stateConfig.text}`}>
              <Icon name={stateConfig.icon as any} className="w-3 h-3 inline mr-1" />
              {stateConfig.label}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-slate-900 mt-2 truncate">{attestation.controlName}</h4>
          <p className="text-xs text-slate-500 mt-0.5">Control ID: {attestation.controlId}</p>
        </div>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          className="w-4 h-4 text-indigo-600 rounded border-slate-300 flex-shrink-0"
        />
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
          <span>Progress</span>
          <span>{attestation.currentStep} / {attestation.totalSteps} steps</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              attestation.workflowState === 'attested' ? 'bg-emerald-500' :
              attestation.workflowState === 'rejected' ? 'bg-rose-500' :
              attestation.workflowState === 'escalated' ? 'bg-orange-500' :
              'bg-indigo-500'
            }`}
            style={{ width: `${(attestation.currentStep / attestation.totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Due Date & Recertification */}
      <div className="flex items-center justify-between text-xs">
        <div className={`flex items-center gap-1 ${overdue ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
          <Icon name="calendar" className="w-3.5 h-3.5" />
          <span>
            {overdue ? 'Overdue' : daysUntil === 0 ? 'Due today' : `${daysUntil} days`}
          </span>
        </div>
        <div className="text-slate-400">
          {FREQUENCY_CONFIG[attestation.recertificationFrequency].label}
        </div>
      </div>

      {/* Escalation Warning */}
      {attestation.escalatedAt && (
        <div className="mt-3 p-2 bg-orange-50 rounded text-xs text-orange-700">
          <Icon name="bell-alert" className="w-3.5 h-3.5 inline mr-1" />
          {attestation.escalationReason}
        </div>
      )}
    </div>
  );
}

function BulkAttestationPanel({
  selectedIds,
  onClear,
  onBulkAction,
}: {
  selectedIds: string[];
  attestations: AttestationRecord[];
  onClear: () => void;
  onBulkAction: (action: 'approve' | 'delegate' | 'remind') => void;
}) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl px-6 py-4 flex items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{selectedIds.length}</span>
          <span className="text-sm text-slate-300">attestations selected</span>
        </div>
        <div className="w-px h-8 bg-slate-700" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Planned</span>
          <button
            onClick={() => onBulkAction('approve')}
            disabled
            title="Bulk approve is a planned capability and is not available in this demo"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-400 cursor-not-allowed"
          >
            <Icon name="check-badge" className="w-4 h-4 inline mr-1.5" />
            Bulk Approve
          </button>
          <button
            onClick={() => onBulkAction('delegate')}
            disabled
            title="Bulk delegate is a planned capability and is not available in this demo"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-400 cursor-not-allowed"
          >
            <Icon name="users" className="w-4 h-4 inline mr-1.5" />
            Delegate
          </button>
          <button
            onClick={() => onBulkAction('remind')}
            disabled
            title="Send reminder is a planned capability and is not available in this demo"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-400 cursor-not-allowed"
          >
            <Icon name="bell" className="w-4 h-4 inline mr-1.5" />
            Send Reminder
          </button>
        </div>
        <button
          onClick={onClear}
          className="p-2 hover:bg-slate-800 rounded-lg transition"
        >
          <Icon name="x-mark" className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function AttestationTimeline({ attestationId }: { attestationId: string }) {
  const events = MOCK_HISTORY.filter(e => e.attestationId === attestationId);

  const eventConfig: Record<HistoryEvent['eventType'], { icon: string; color: string }> = {
    created: { icon: 'plus', color: 'text-slate-500' },
    submitted: { icon: 'arrow-right', color: 'text-blue-500' },
    approved: { icon: 'check', color: 'text-emerald-500' },
    rejected: { icon: 'x-mark', color: 'text-rose-500' },
    delegated: { icon: 'users', color: 'text-violet-500' },
    escalated: { icon: 'bell-alert', color: 'text-orange-500' },
    expired: { icon: 'exclamation-triangle', color: 'text-red-500' },
    recertified: { icon: 'arrow-path', color: 'text-indigo-500' },
  };

  if (events.length === 0) {
    return (
      <div className="text-center text-sm text-slate-500 py-4">
        No history events recorded
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => {
        const config = eventConfig[event.eventType];
        return (
          <div key={event.id} className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center`}>
              <Icon name={config.icon as any} className={`w-4 h-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{event.actor}</span>
                {event.oldState && event.newState && (
                  <span className="text-xs text-slate-400">
                    {WORKFLOW_STATE_CONFIG[event.oldState].label} {'->'} {WORKFLOW_STATE_CONFIG[event.newState].label}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{event.details}</p>
              <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(event.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DelegationHistory({ delegations }: { delegations: DelegationEvent[] }) {
  if (delegations.length === 0) {
    return (
      <div className="text-center text-sm text-slate-500 py-4">
        No delegation history
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {delegations.map((del) => (
        <div key={del.id} className="p-3 bg-violet-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-violet-900">{del.fromUserName}</span>
            <Icon name="arrow-right" className="w-4 h-4 text-violet-400" />
            <span className="font-medium text-violet-900">{del.toUserName}</span>
          </div>
          <p className="text-xs text-violet-700 mt-1">{del.reason}</p>
          <div className="flex items-center gap-2 mt-2 text-[10px] text-violet-500">
            <span className="px-1.5 py-0.5 bg-violet-100 rounded">{ATTESTATION_TYPE_CONFIG[del.attestationType].label}</span>
            <span>{formatDateTime(del.delegatedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecertificationSchedule({ attestations }: { attestations: AttestationRecord[] }) {
  const upcoming = useMemo(() => {
    return attestations
      .filter(a => a.workflowState === 'attested')
      .map(a => ({
        ...a,
        daysUntilRecert: getDaysUntilDue(a.nextRecertificationDate),
      }))
      .sort((a, b) => a.daysUntilRecert - b.daysUntilRecert)
      .slice(0, 5);
  }, [attestations]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Upcoming Re-certifications</h3>
        <p className="text-xs text-slate-500 mt-0.5">Controls requiring attestation renewal</p>
      </div>
      <div className="divide-y divide-slate-100">
        {upcoming.map((att) => (
          <div key={att.id} className="p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900">{att.controlName}</div>
              <div className="text-xs text-slate-500">
                {FREQUENCY_CONFIG[att.recertificationFrequency].label} cycle
              </div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-semibold ${
                att.daysUntilRecert <= 7 ? 'text-rose-600' :
                att.daysUntilRecert <= 30 ? 'text-amber-600' :
                'text-slate-600'
              }`}>
                {att.daysUntilRecert} days
              </div>
              <div className="text-[10px] text-slate-400">{formatDate(att.nextRecertificationDate)}</div>
            </div>
          </div>
        ))}
        {upcoming.length === 0 && (
          <div className="p-4 text-center text-sm text-slate-500">
            No upcoming re-certifications
          </div>
        )}
      </div>
    </div>
  );
}

function AttestationStats({ attestations }: { attestations: AttestationRecord[] }) {
  const stats = useMemo(() => {
    const byState = attestations.reduce((acc, a) => {
      acc[a.workflowState] = (acc[a.workflowState] || 0) + 1;
      return acc;
    }, {} as Record<WorkflowState, number>);

    const overdue = attestations.filter(a =>
      isOverdue(a.dueDate) && a.workflowState !== 'attested' && a.workflowState !== 'expired'
    ).length;

    const dueThisWeek = attestations.filter(a => {
      const days = getDaysUntilDue(a.dueDate);
      return days >= 0 && days <= 7 && a.workflowState !== 'attested' && a.workflowState !== 'expired';
    }).length;

    return {
      total: attestations.length,
      attested: byState['attested'] || 0,
      pending: (byState['pending-review'] || 0) + (byState['draft'] || 0) + (byState['approved'] || 0),
      rejected: byState['rejected'] || 0,
      escalated: byState['escalated'] || 0,
      delegated: byState['delegated'] || 0,
      expired: byState['expired'] || 0,
      overdue,
      dueThisWeek,
    };
  }, [attestations]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
      <StatCard label="Total" value={stats.total.toString()} sub="attestations" />
      <StatCard label="Attested" value={stats.attested.toString()} sub="complete" variant="success" />
      <StatCard label="Pending" value={stats.pending.toString()} sub="in progress" variant="warning" />
      <StatCard label="Rejected" value={stats.rejected.toString()} sub="need fixes" variant={stats.rejected > 0 ? 'danger' : 'default'} />
      <StatCard label="Escalated" value={stats.escalated.toString()} sub="overdue 7+ days" variant={stats.escalated > 0 ? 'danger' : 'default'} />
      <StatCard label="Delegated" value={stats.delegated.toString()} sub="reassigned" variant={stats.delegated > 0 ? 'info' : 'default'} />
      <StatCard label="Expired" value={stats.expired.toString()} sub="need renewal" variant={stats.expired > 0 ? 'danger' : 'default'} />
      <StatCard label="Overdue" value={stats.overdue.toString()} sub="past due" variant={stats.overdue > 0 ? 'danger' : 'success'} />
      <StatCard label="Due This Week" value={stats.dueThisWeek.toString()} sub="action needed" variant={stats.dueThisWeek > 0 ? 'warning' : 'default'} />
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AttestationWorkflow() {
  const [attestations] = useState<AttestationRecord[]>(MOCK_ATTESTATIONS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<WorkflowState | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<ControlCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [detailTab, setDetailTab] = useState<'workflow' | 'timeline' | 'delegation'>('workflow');

  const filteredAttestations = useMemo(() => {
    return attestations.filter(a => {
      if (filterState !== 'all' && a.workflowState !== filterState) return false;
      if (filterCategory !== 'all' && a.controlCategory !== filterCategory) return false;
      if (searchQuery && !a.controlName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [attestations, filterState, filterCategory, searchQuery]);

  const selectedAttestation = useMemo(() =>
    attestations.find(a => a.id === selectedDetailId),
    [attestations, selectedDetailId]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleViewDetails = useCallback((id: string) => {
    setSelectedDetailId(id);
    setShowDetailDrawer(true);
  }, []);

  const handleBulkAction = useCallback(() => {
    // Bulk attestation actions are a planned capability and are disabled in
    // this demo. No backend integration exists yet, so this intentionally
    // performs no action rather than surfacing a fake success.
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CoreBadge pillar="show" compact />
          <MockDataBadge integration="Connect IAM, GRC, and Audit systems for live attestation data" />
        </div>
        <button
          disabled
          title="Creating attestations is a planned capability and is not available in this demo"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
        >
          <Icon name="plus" className="w-4 h-4" />
          New Attestation
          <span className="text-[10px] font-normal text-slate-400">(demo)</span>
        </button>
      </div>

      {/* Stats */}
      <AttestationStats attestations={attestations} />

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Filters & Schedule */}
        <div className="lg:col-span-1 space-y-6">
          {/* Filters */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Filters</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Search</label>
                <input
                  type="text"
                  placeholder="Search controls..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Status</label>
                <select
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value as WorkflowState | 'all')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                >
                  <option value="all">All Statuses</option>
                  {Object.entries(WORKFLOW_STATE_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as ControlCategory | 'all')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                >
                  <option value="all">All Categories</option>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Recertification Schedule */}
          <RecertificationSchedule attestations={attestations} />
        </div>

        {/* Right: Attestation List */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-600">
              {filteredAttestations.length} attestation{filteredAttestations.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(filteredAttestations.map(a => a.id))}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
              >
                Select All
              </button>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
                >
                  Clear ({selectedIds.length})
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAttestations.map((attestation) => (
              <div key={attestation.id} className="relative group">
                <AttestationCard
                  attestation={attestation}
                  onSelect={handleSelect}
                  isSelected={selectedIds.includes(attestation.id)}
                />
                <button
                  onClick={() => handleViewDetails(attestation.id)}
                  className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 p-1.5 bg-white rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  <Icon name="magnifying-glass" className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            ))}
          </div>

          {filteredAttestations.length === 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-12 text-center">
              <Icon name="clipboard-document-check" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No attestations match your filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Panel */}
      <BulkAttestationPanel
        selectedIds={selectedIds}
        attestations={attestations}
        onClear={() => setSelectedIds([])}
        onBulkAction={handleBulkAction}
      />

      {/* Detail Drawer */}
      <Drawer
        open={showDetailDrawer}
        onClose={() => setShowDetailDrawer(false)}
        title={selectedAttestation?.controlName || 'Attestation Details'}
        subtitle={selectedAttestation ? `${WORKFLOW_STATE_CONFIG[selectedAttestation.workflowState].label} - ${CATEGORY_CONFIG[selectedAttestation.controlCategory].label}` : ''}
        width="lg"
      >
        {selectedAttestation && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-500 uppercase">Control ID</div>
                <div className="text-sm font-medium text-slate-900">{selectedAttestation.controlId}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-500 uppercase">Due Date</div>
                <div className={`text-sm font-medium ${isOverdue(selectedAttestation.dueDate) ? 'text-rose-600' : 'text-slate-900'}`}>
                  {formatDate(selectedAttestation.dueDate)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-500 uppercase">Recertification</div>
                <div className="text-sm font-medium text-slate-900">
                  {FREQUENCY_CONFIG[selectedAttestation.recertificationFrequency].label}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-500 uppercase">Evidence Locked</div>
                <div className="text-sm font-medium text-slate-900">
                  {selectedAttestation.evidenceLockedAt
                    ? formatDateTime(selectedAttestation.evidenceLockedAt)
                    : 'Not locked'}
                </div>
              </div>
            </div>

            {/* Evidence Snapshot */}
            {selectedAttestation.evidenceSnapshotId && (
              <div className="p-3 bg-emerald-50 rounded-lg flex items-center gap-3">
                <Icon name="lock-closed" className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="text-sm font-medium text-emerald-900">Evidence Snapshot Locked</div>
                  <div className="text-xs text-emerald-700">
                    Snapshot ID: {selectedAttestation.evidenceSnapshotId}
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl">
              {[
                { id: 'workflow', label: 'Workflow', icon: 'arrow-path' },
                { id: 'timeline', label: 'Timeline', icon: 'clock' },
                { id: 'delegation', label: 'Delegation', icon: 'users' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id as typeof detailTab)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    detailTab === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Icon name={tab.icon as any} className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {detailTab === 'workflow' && (
              <WorkflowDiagram attestation={selectedAttestation} />
            )}
            {detailTab === 'timeline' && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-4">Attestation History</h4>
                <AttestationTimeline attestationId={selectedAttestation.id} />
              </div>
            )}
            {detailTab === 'delegation' && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-4">Delegation History</h4>
                <DelegationHistory delegations={selectedAttestation.delegationHistory} />
              </div>
            )}

            {/* Actions (planned capability - not wired to a backend in this demo) */}
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="flex gap-3">
                {(selectedAttestation.workflowState === 'pending-review' ||
                  selectedAttestation.workflowState === 'delegated') && (
                  <>
                    <button
                      disabled
                      title="Approving an attestation is a planned capability and is not available in this demo"
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
                    >
                      <Icon name="check-badge" className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      disabled
                      title="Rejecting an attestation is a planned capability and is not available in this demo"
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
                    >
                      <Icon name="x-circle" className="w-4 h-4" />
                      Reject
                    </button>
                  </>
                )}
                {selectedAttestation.workflowState !== 'attested' &&
                 selectedAttestation.workflowState !== 'expired' && (
                  <button
                    disabled
                    title="Delegating an attestation is a planned capability and is not available in this demo"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
                  >
                    <Icon name="users" className="w-4 h-4" />
                    Delegate
                  </button>
                )}
                {selectedAttestation.workflowState === 'expired' && (
                  <button
                    disabled
                    title="Starting re-certification is a planned capability and is not available in this demo"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
                  >
                    <Icon name="arrow-path" className="w-4 h-4" />
                    Start Re-certification
                  </button>
                )}
                {selectedAttestation.workflowState === 'rejected' && (
                  <button
                    disabled
                    title="Resubmitting for review is a planned capability and is not available in this demo"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
                  >
                    <Icon name="arrow-path" className="w-4 h-4" />
                    Resubmit for Review
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Attestation actions are a planned capability and are disabled in this demo.
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
