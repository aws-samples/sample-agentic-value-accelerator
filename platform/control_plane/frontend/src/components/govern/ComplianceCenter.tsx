/**
 * ComplianceCenter — Interactive compliance framework management
 *
 * Features:
 * - Compliance Posture Strip with live metrics
 * - Governance Program Builder (6-phase wizard)
 * - Interactive checklists with checkboxes
 * - Evidence attachment and links
 * - Notes per control
 * - Progress tracking with visual indicators
 * - Data Sensitivity framework (PII/PHI/PCI)
 * - Export/audit trail
 * - Revalidation tracking
 * - Attestation management
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import {
  COMPLIANCE_CENTER_FRAMEWORKS,
  type ControlStatus,
  type ComplianceFramework,
  type ControlType,
  type ControlCriticality,
} from './mockData';
import UnifiedGuide, { COMPLIANCE_GUIDE } from './UnifiedGuide';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import { governScpApi, governControlsApi, maturityApi, governAuditApi, type AwsConfigRulesResponse, type AwsScpResponse, type ControlStatus as ApiControlStatus, type MaturityAssessment, type GovernAuditEvent } from '../../api/client';
import { useControlEvaluation } from './useControlEvaluation';
// GuardrailsCoverage and FailingConfigRules consolidated into ConfigGuardrailsSideBySide
import { usePersistedState } from './usePersistedState';
import GovernPageLayout from './GovernPageLayout';
import Sr26MappingView from './Sr26MappingView';
import ConformanceView from './ConformanceView';
import NistAiRmfView from './NistAiRmfView';
import EuAiActView from './EuAiActView';
import FinosAirView from './FinosAirView';
import OwaspLlmView from './OwaspLlmView';
import { useComplianceAttestations } from './useComplianceAttestations';
import ConfigGuardrailsSideBySide from './ConfigGuardrailsSideBySide';
import PolicyObservability from './PolicyObservability';
import CriAiRmfView from './CriAiRmfView';
import OsfiE23View from './OsfiE23View';
import Iso42001View from './Iso42001View';
import MitreAtlasView from './MitreAtlasView';
import NaicAiView from './NaicAiView';
import CoreBadge from './CoreBadge';
import ConformityAssessmentWorkflow from './compliance/ConformityAssessmentWorkflow';
import FriaWizard from './compliance/FriaWizard';
import ComplianceGapGuidance from './compliance/ComplianceGapGuidance';
import SecurityHubFindingsPanel from './compliance/SecurityHubFindingsPanel';
import AISecurityControlsPanel from './compliance/AISecurityControlsPanel';
import { DataSourceInfo, getPageDataSources } from './DataSourceInfo';

// ─────────────────────────── Helpers ───────────────────────────

const STATUS_CONFIG: Record<ControlStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  'pass': { label: 'Compliant', color: '#10b981', bgColor: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <Icon name="check" className="w-3 h-3" /> },
  'in-progress': { label: 'In Progress', color: '#f59e0b', bgColor: 'bg-amber-50 border-amber-200 text-amber-700', icon: <Icon name="circle-half" className="w-3 h-3" /> },
  'fail': { label: 'Gap', color: '#ef4444', bgColor: 'bg-rose-50 border-rose-200 text-rose-700', icon: <Icon name="x-mark" className="w-3 h-3" /> },
  'not-started': { label: 'N/A', color: '#6b7280', bgColor: 'bg-slate-100 border-slate-200 text-slate-500', icon: <span>—</span> },
};

const CONTROL_TYPE_CONFIG: Record<ControlType, { label: string; color: string; bgColor: string; description: string }> = {
  'technical': {
    label: 'Technical',
    color: '#3b82f6',
    bgColor: 'bg-blue-50 border-blue-200 text-blue-700',
    description: 'Can be auto-detected from AWS services',
  },
  'non-technical': {
    label: 'Policy',
    color: '#8b5cf6',
    bgColor: 'bg-violet-50 border-violet-200 text-violet-700',
    description: 'Requires manual attestation (policy, process, or documentation)',
  },
  'hybrid': {
    label: 'Hybrid',
    color: '#f59e0b',
    bgColor: 'bg-amber-50 border-amber-200 text-amber-700',
    description: 'Has both technical and policy components',
  },
};

const CRITICALITY_CONFIG: Record<ControlCriticality, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  'critical': {
    label: 'Critical',
    color: '#dc2626',
    bgColor: 'bg-red-100 border-red-300 text-red-800',
    icon: <Icon name="exclamation-circle" className="w-3 h-3 inline-block align-middle" />,
  },
  'high': {
    label: 'High',
    color: '#ea580c',
    bgColor: 'bg-orange-100 border-orange-300 text-orange-800',
    icon: <Icon name="exclamation-triangle" className="w-3 h-3 inline-block align-middle" />,
  },
  'medium': {
    label: 'Medium',
    color: '#ca8a04',
    bgColor: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    icon: <Icon name="circle-half" className="w-3 h-3 inline-block align-middle" />,
  },
  'low': {
    label: 'Low',
    color: '#16a34a',
    bgColor: 'bg-green-100 border-green-300 text-green-800',
    icon: <Icon name="check-circle" className="w-3 h-3 inline-block align-middle" />,
  },
};

// ─────────────────────────── Framework Control Mapping ───────────────────────────
// Maps governance tasks to specific framework controls they satisfy
// This enables showing how one implementation satisfies multiple frameworks

interface FrameworkControlMapping {
  taskId: string;
  taskName: string;
  description: string;
  deliverable: string;
  template?: boolean;
  platform?: string;
  satisfies: {
    /** Must be a `shortName` in COMPLIANCE_CENTER_FRAMEWORKS to resolve a checklist. */
    framework: string;
    /**
     * Control references. Each SHOULD name a control in that framework's checklist, and every
     * consumer resolves it through `splitControlRefs` / CONTROL_REF_INDEX (below) rather than
     * trusting the string: a reference resolves if it equals a `ComplianceControl.id`, or a
     * `ComplianceControl.section` that names exactly one control in that framework.
     *
     * MEASURED 2026-09-14: 36 of the 155 references here resolve to nothing - EU AI Act 18/18
     * (uses an EU-TRANS-1 scheme where the checklist ids are article numbers, 'Art.13'),
     * CRI FS AI RMF 7/15 ('GV-1' vs 'CRI-GV-1.1.1'), OWASP Agentic 6/6 (no checklist exists
     * for it at all), OSFI E-23 3/7 ('E23-DATA-1' where the families are GOV/DEV/VAL/IMP/MON/
     * INV), OWASP LLM 1/15 ('LLM06-3' where LLM06 carries only -1 and -2), NIST AI RMF 1/14
     * ('MEASURE 3.2', a subcategory this checklist stops short of). The other 119 resolve:
     * 106 by id, and 13 NIST references by section - they carry published AI RMF subcategory
     * identifiers ('GOVERN 1.1'), which are verbatim the `section` of exactly one control each.
     *
     * The 36 are NOT all the same defect. Where a framework is internally consistent (EU,
     * OWASP Agentic) the references are a deliberate second namespace - published framework
     * identifiers rather than this app's ids - and re-pointing them means re-deriving each
     * mapping by meaning, which no id transform can do. Where a framework is internally MIXED
     * (CRI, OSFI, OWASP LLM, and the one NIST outlier - 12 references) the odd ones out are
     * simply wrong, since their siblings in the same list resolve.
     *
     * Not repaired: choosing the EU namespace and re-deriving those mappings is a design
     * decision, and guessing them would invent cross-framework claims that no source supports.
     * Two instances WERE repaired, in the 'guardrails' task below: 'AIR-P-001' and 'AIR-P-002'
     * belonged to neither namespace - not published FINOS ids (the published families are
     * AIR-OP/SEC/RC/PREV/DET) and not checklist ids - so they were unambiguous, and FINOS AIR
     * now resolves 14 of 14.
     *
     * Until then the 36 are reported, not hidden: they are excluded from every mapped-control
     * count in the program builder, and the counts that exclude them say so - per framework in
     * the comparison table's "Mapped Refs" column and the coverage cards, and per reference in
     * a task's expanded framework list.
     */
    controls: string[];
    section?: string;
  }[];
  phase: string;
  category: 'governance' | 'data' | 'model' | 'validation' | 'deployment' | 'monitoring' | 'security' | 'consumer';
}

const UNIFIED_CONTROL_MAPPINGS: FrameworkControlMapping[] = [
  // Governance & Charter
  {
    taskId: 'gov-charter',
    taskName: 'AI Governance Charter',
    description: 'Establish written AI governance program with purpose, scope, authority, and accountability.',
    deliverable: 'AI Governance Charter',
    template: true,
    phase: 'foundation',
    category: 'governance',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 1.1', 'GOVERN 1.4'], section: 'GOVERN' },
      { framework: 'SR 26-2', controls: ['GOV-2', 'GOV-3'], section: '§V-VI' },
      { framework: 'EU AI Act', controls: ['EU-QMS-1'], section: 'Art. 17' },
      { framework: 'CRI FS AI RMF', controls: ['GV-1', 'GV-2'], section: 'Governance' },
      { framework: 'ISO 42001', controls: ['ISO-5.1', 'ISO-5.2'], section: 'Cl. 5' },
      { framework: 'NAIC', controls: ['NAIC-B1', 'NAIC-B2'], section: 'Exhibit B' },
      { framework: 'OSFI E-23', controls: ['E23-GOV-1'], section: 'Governance' },
      { framework: 'FINOS AIR', controls: ['AIR-RC-022'], section: 'Regulatory & Compliance' },
    ],
  },
  {
    taskId: 'gov-committee',
    taskName: 'AI Governance Committee',
    description: 'Form cross-functional committee: CRO, CDO, CISO, Legal, Business, Technology with defined roles.',
    deliverable: 'Committee Charter with Roles',
    template: true,
    phase: 'foundation',
    category: 'governance',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 1.4'], section: 'GOVERN' },
      { framework: 'SR 26-2', controls: ['GOV-2'], section: '§VI' },
      { framework: 'CRI FS AI RMF', controls: ['GV-3'], section: 'Governance' },
      { framework: 'ISO 42001', controls: ['ISO-5.1'], section: 'Cl. 5' },
      { framework: 'NAIC', controls: ['NAIC-B2'], section: 'Exhibit B' },
    ],
  },
  {
    taskId: 'risk-appetite',
    taskName: 'AI Risk Appetite Statement',
    description: 'Define organizational tolerance for AI risk including thresholds for performance, bias, and operational risk.',
    deliverable: 'AI Risk Appetite Statement',
    template: true,
    phase: 'foundation',
    category: 'governance',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 1.1'], section: 'GOVERN' },
      { framework: 'CRI FS AI RMF', controls: ['GV-4'], section: 'Governance' },
      { framework: 'ISO 42001', controls: ['ISO-6.1'], section: 'Cl. 6' },
      { framework: 'OSFI E-23', controls: ['E23-GOV-2'], section: 'Governance' },
      { framework: 'NAIC', controls: ['NAIC-B13'], section: 'Exhibit B §3k' },
    ],
  },
  // Inventory & Registry
  {
    taskId: 'ai-inventory',
    taskName: 'AI Systems Inventory',
    description: 'Maintain comprehensive catalog of all AI/ML models, agents, and systems with metadata.',
    deliverable: 'AI Model Registry',
    platform: '/govern/models',
    phase: 'foundation',
    category: 'governance',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 5.1'], section: 'GOVERN' },
      { framework: 'SR 26-2', controls: ['GOV-1'], section: '§V' },
      { framework: 'EU AI Act', controls: ['EU-REG-1'], section: 'Art. 49' },
      { framework: 'CRI FS AI RMF', controls: ['GV-3'], section: 'Governance' },
      { framework: 'ISO 42001', controls: ['ISO-8.3'], section: 'Cl. 8' },
      { framework: 'NAIC', controls: ['NAIC-A1', 'NAIC-A2', 'NAIC-A3', 'NAIC-C1'], section: 'Exhibit A & C' },
      { framework: 'OSFI E-23', controls: ['E23-INV-1'], section: 'Inventory' },
    ],
  },
  // Data Governance
  {
    taskId: 'data-governance',
    taskName: 'AI Data Governance Policy',
    description: 'Define data quality, lineage, classification, access controls, retention, and privacy requirements.',
    deliverable: 'AI Data Governance Policy',
    platform: '/govern/data',
    phase: 'policies',
    category: 'data',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MAP 1.1'], section: 'MAP' },
      { framework: 'SR 26-2', controls: ['DEV-2'], section: '§IV.A' },
      { framework: 'EU AI Act', controls: ['EU-DATA-1', 'EU-DATA-2'], section: 'Art. 10' },
      { framework: 'CRI FS AI RMF', controls: ['DG-1', 'DG-2'], section: 'Data Governance' },
      { framework: 'ISO 42001', controls: ['ISO-7.5'], section: 'Cl. 7' },
      { framework: 'NAIC', controls: ['NAIC-B6', 'NAIC-D1', 'NAIC-D3'], section: 'Exhibit B & D' },
      { framework: 'OSFI E-23', controls: ['E23-DATA-1'], section: 'Data' },
      { framework: 'FINOS AIR', controls: ['AIR-OP-019', 'AIR-RC-001'], section: 'Operational & Regulatory' },
    ],
  },
  {
    taskId: 'data-privacy',
    taskName: 'Data Privacy & PII Protection',
    description: 'Implement PII detection, redaction, and consumer data protection measures.',
    deliverable: 'Privacy Controls',
    platform: '/secure/guardrails',
    phase: 'technology',
    category: 'data',
    satisfies: [
      { framework: 'EU AI Act', controls: ['EU-DATA-3'], section: 'Art. 10' },
      { framework: 'NAIC', controls: ['NAIC-B6', 'NAIC-D6', 'NAIC-D11'], section: 'Exhibit B & D' },
      { framework: 'OWASP LLM', controls: ['LLM06-1', 'LLM06-2'], section: 'LLM06' },
      { framework: 'MITRE ATLAS', controls: ['ATLAS-EXF-2'], section: 'Exfiltration' },
    ],
  },
  // Model Development & Validation
  {
    taskId: 'model-documentation',
    taskName: 'Model Documentation (Model Cards)',
    description: 'Document model design, objectives, methodology, assumptions, limitations, and intended use.',
    deliverable: 'Model Card Template',
    template: true,
    phase: 'processes',
    category: 'model',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MAP 3.1'], section: 'MAP' },
      { framework: 'SR 26-2', controls: ['DEV-1', 'DEV-4'], section: '§IV.A' },
      { framework: 'EU AI Act', controls: ['EU-DOC-1', 'EU-DOC-2'], section: 'Art. 11' },
      { framework: 'CRI FS AI RMF', controls: ['MD-1'], section: 'Model Development' },
      { framework: 'NAIC', controls: ['NAIC-C5', 'NAIC-C6', 'NAIC-C11'], section: 'Exhibit C' },
      { framework: 'OSFI E-23', controls: ['E23-MOD-1'], section: 'Model' },
    ],
  },
  {
    taskId: 'model-validation',
    taskName: 'Independent Model Validation',
    description: 'Perform independent validation by qualified personnel covering conceptual soundness and outcomes.',
    deliverable: 'Validation Procedures',
    platform: '/govern/models',
    phase: 'processes',
    category: 'validation',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MEASURE 1.1'], section: 'MEASURE' },
      { framework: 'SR 26-2', controls: ['VAL-1', 'VAL-2', 'VAL-3', 'VAL-4'], section: '§IV.B' },
      { framework: 'CRI FS AI RMF', controls: ['VT-1', 'VT-2'], section: 'Validation' },
      { framework: 'NAIC', controls: ['NAIC-C7', 'NAIC-C8'], section: 'Exhibit C §8' },
      { framework: 'OSFI E-23', controls: ['E23-VAL-1'], section: 'Validation' },
    ],
  },
  // Bias & Fairness
  {
    taskId: 'bias-testing',
    taskName: 'Bias Testing & Fairness Analysis',
    description: 'Conduct bias testing, protected class analysis, proxy variable detection, and adverse impact assessment.',
    deliverable: 'Fairness Testing Reports',
    platform: '/govern/models',
    phase: 'processes',
    category: 'validation',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MEASURE 2.3'], section: 'MEASURE' },
      { framework: 'EU AI Act', controls: ['EU-BIAS-1', 'EU-BIAS-2'], section: 'Art. 10' },
      { framework: 'CRI FS AI RMF', controls: ['CP-1'], section: 'Consumer Protection' },
      { framework: 'NAIC', controls: ['NAIC-MB-1', 'NAIC-MB-2', 'NAIC-MB-3', 'NAIC-B3'], section: 'Model Bulletin' },
    ],
  },
  // Security & Adversarial
  {
    taskId: 'security-controls',
    taskName: 'AI Security Controls',
    description: 'Implement prompt injection defense, input validation, rate limiting, and adversarial attack prevention.',
    deliverable: 'Security Configuration',
    platform: '/secure/guardrails',
    phase: 'technology',
    category: 'security',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MEASURE 2.7'], section: 'MEASURE' },
      { framework: 'OWASP LLM', controls: ['LLM01-1', 'LLM01-2', 'LLM04-1', 'LLM04-2'], section: 'LLM01 & LLM04' },
      { framework: 'MITRE ATLAS', controls: ['ATLAS-IA-2', 'ATLAS-STG-1', 'ATLAS-STG-2'], section: 'Initial Access & Staging' },
      { framework: 'EU AI Act', controls: ['EU-ROB-1'], section: 'Art. 15' },
      { framework: 'NAIC', controls: ['NAIC-B4'], section: 'Exhibit B §3b' },
    ],
  },
  // Monitoring & Observability
  {
    taskId: 'continuous-monitoring',
    taskName: 'Continuous Monitoring & Observability',
    description: 'Deploy monitoring for drift, accuracy, performance degradation with alerts and dashboards.',
    deliverable: 'Monitoring Stack',
    platform: '/observability',
    phase: 'technology',
    category: 'monitoring',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MANAGE 3.1'], section: 'MANAGE' },
      { framework: 'SR 26-2', controls: ['USE-2'], section: '§IV.C' },
      { framework: 'EU AI Act', controls: ['EU-MON-1'], section: 'Art. 72' },
      { framework: 'CRI FS AI RMF', controls: ['DM-1'], section: 'Deployment & Monitoring' },
      { framework: 'ISO 42001', controls: ['ISO-9.1'], section: 'Cl. 9' },
      { framework: 'NAIC', controls: ['NAIC-C9'], section: 'Exhibit C §8' },
      { framework: 'MITRE ATLAS', controls: ['ATLAS-IMP-1'], section: 'Impact' },
    ],
  },
  // Incident Response
  {
    taskId: 'incident-response',
    taskName: 'AI Incident Response Plan',
    description: 'Define incident response procedures, escalation paths, and remediation processes for AI failures.',
    deliverable: 'IR Playbook',
    template: true,
    phase: 'operate',
    category: 'monitoring',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MANAGE 1.1'], section: 'MANAGE' },
      { framework: 'EU AI Act', controls: ['EU-INC-1'], section: 'Art. 73' },
      { framework: 'ISO 42001', controls: ['ISO-10.1'], section: 'Cl. 10' },
      { framework: 'MITRE ATLAS', controls: ['ATLAS-IMP-3'], section: 'Impact' },
    ],
  },
  // Transparency & Explainability
  {
    taskId: 'transparency',
    taskName: 'Transparency & Explainability',
    description: 'Provide explanations for AI decisions, consumer disclosures, and regulatory reporting.',
    deliverable: 'Explainability API',
    platform: '/govern/models',
    phase: 'processes',
    category: 'consumer',
    satisfies: [
      { framework: 'EU AI Act', controls: ['EU-TRANS-1', 'EU-TRANS-2'], section: 'Art. 13-14' },
      { framework: 'NAIC', controls: ['NAIC-MB-6', 'NAIC-MB-7', 'NAIC-B16'], section: 'Exhibit B & Model Bulletin' },
      { framework: 'CRI FS AI RMF', controls: ['CP-2'], section: 'Consumer Protection' },
    ],
  },
  // Human Oversight
  {
    taskId: 'human-oversight',
    taskName: 'Human Oversight & HITL',
    description: 'Implement human-in-the-loop workflows, approval gates, and override capabilities.',
    deliverable: 'HITL Workflows',
    platform: '/secure',
    phase: 'processes',
    category: 'governance',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['MEASURE 3.2'], section: 'MEASURE' },
      { framework: 'EU AI Act', controls: ['EU-HO-1', 'EU-HO-2'], section: 'Art. 14' },
      { framework: 'OWASP LLM', controls: ['LLM08-2', 'LLM09-2'], section: 'LLM08-09' },
      { framework: 'NAIC', controls: ['NAIC-MB-4', 'NAIC-MB-5'], section: 'Model Bulletin' },
    ],
  },
  // Third-Party / Vendor Management
  {
    taskId: 'vendor-management',
    taskName: 'Third-Party AI Risk Management',
    description: 'Assess and monitor third-party AI vendors, data sources, and model providers.',
    deliverable: 'Vendor Assessment Policy',
    template: true,
    phase: 'policies',
    category: 'governance',
    satisfies: [
      { framework: 'CRI FS AI RMF', controls: ['TP-1', 'TP-2'], section: 'Third-Party' },
      { framework: 'EU AI Act', controls: ['EU-SC-1'], section: 'Art. 25' },
      { framework: 'ISO 42001', controls: ['ISO-8.4'], section: 'Cl. 8' },
      { framework: 'NAIC', controls: ['NAIC-B14', 'NAIC-C3', 'NAIC-D5'], section: 'Exhibit B, C, D' },
      { framework: 'OWASP LLM', controls: ['LLM05-1'], section: 'LLM05' },
      { framework: 'OSFI E-23', controls: ['E23-TP-1'], section: 'Third-Party' },
    ],
  },
  // Training & Awareness
  {
    taskId: 'training',
    taskName: 'AI Training & Awareness Program',
    description: 'Train workforce on AI risks, responsible use, prohibited practices, and governance procedures.',
    deliverable: 'Training Program',
    template: true,
    phase: 'operate',
    category: 'governance',
    satisfies: [
      { framework: 'NIST AI RMF', controls: ['GOVERN 3.2'], section: 'GOVERN' },
      { framework: 'SR 26-2', controls: ['USE-4'], section: '§IV.C' },
      { framework: 'ISO 42001', controls: ['ISO-7.2', 'ISO-7.3'], section: 'Cl. 7' },
      { framework: 'NAIC', controls: ['NAIC-B12'], section: 'Exhibit B §3j' },
    ],
  },
  // Guardrails & Content Filters
  {
    taskId: 'guardrails',
    taskName: 'Deploy Bedrock Guardrails',
    description: 'Configure content filters, PII detection, denied topics, and contextual grounding checks.',
    deliverable: 'Guardrail Configuration',
    platform: '/secure/guardrails',
    phase: 'technology',
    category: 'security',
    satisfies: [
      { framework: 'OWASP LLM', controls: ['LLM01-1', 'LLM02-1', 'LLM06-1', 'LLM06-3'], section: 'Multiple' },
      { framework: 'EU AI Act', controls: ['EU-ROB-1'], section: 'Art. 15' },
      { framework: 'MITRE ATLAS', controls: ['ATLAS-IA-2', 'ATLAS-EXF-2'], section: 'Access & Exfil' },
      // AIR-PREV-003 / AIR-PREV-017 were written 'AIR-P-001' / 'AIR-P-002' — a prefix that
      // exists in no FINOS AIR taxonomy. Every other id in this file's `satisfies` lists is a
      // real control id, and `efficiencyStats` counts these strings as distinct obligations
      // (`${sat.framework}::${c}`), so two of the four FINOS obligations this task claimed to
      // satisfy pointed at nothing that exists.
      { framework: 'FINOS AIR', controls: ['AIR-SEC-010', 'AIR-OP-004', 'AIR-OP-020', 'AIR-PREV-003', 'AIR-PREV-017'], section: 'Security & Preventative' },
    ],
  },
  // Runtime Safety Controls (FINOS AIR agentic risks)
  {
    taskId: 'runtime-safety',
    taskName: 'Runtime Safety Controls',
    description: 'Configure forbidden targets (blocklist), alignment drift detection, and reliability metrics for agentic AI.',
    deliverable: 'Runtime Safety Configuration',
    platform: '/govern/safety/runtime',
    phase: 'technology',
    category: 'security',
    satisfies: [
      { framework: 'FINOS AIR', controls: ['AIR-OP-014', 'AIR-OP-028', 'AIR-SEC-024', 'AIR-SEC-025'], section: 'Operational & Security' },
      { framework: 'OWASP Agentic', controls: ['T2', 'T6', 'T7', 'T12', 'T13'], section: 'Agentic Threats' },
    ],
  },
  // MCP Server Security
  {
    taskId: 'mcp-security',
    taskName: 'MCP Server Supply Chain Security',
    description: 'Secure MCP server registry, validate tool provenance, prevent supply chain compromise.',
    deliverable: 'MCP Security Controls',
    platform: '/govern/agents?tab=attack-surface',
    phase: 'technology',
    category: 'security',
    satisfies: [
      { framework: 'FINOS AIR', controls: ['AIR-SEC-026', 'AIR-SEC-027'], section: 'Security' },
      { framework: 'OWASP Agentic', controls: ['T17'], section: 'Supply Chain' },
      { framework: 'OWASP LLM', controls: ['LLM03-1', 'LLM03-2'], section: 'LLM03:2025' },
    ],
  },
];

// Get all unique framework names from the mappings
const getFrameworksFromMappings = (): string[] => {
  const frameworks = new Set<string>();
  UNIFIED_CONTROL_MAPPINGS.forEach(m => m.satisfies.forEach(s => frameworks.add(s.framework)));
  return Array.from(frameworks).sort();
};

// ─────────────────────────── Export Utilities ───────────────────────────

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportComplianceCSV(framework: ComplianceFramework, controlStates: Record<string, { checked: boolean; notes: string }>) {
  const timestamp = new Date().toISOString().split('T')[0];
  const headers = ['Control ID', 'Section', 'Control Label', 'Status', 'Owner', 'Due Date', 'Last Reviewed', 'Evidence', 'User Checked', 'User Notes'];

  const rows: string[][] = [];
  framework.categories.forEach(cat => {
    cat.controls.forEach(ctrl => {
      const state = controlStates[ctrl.id] || { checked: false, notes: '' };
      rows.push([
        ctrl.id,
        ctrl.section || '',
        ctrl.label,
        STATUS_CONFIG[ctrl.status].label,
        ctrl.owner || '',
        ctrl.dueDate || '',
        ctrl.lastReviewed || '',
        ctrl.evidence || '',
        state.checked ? 'Yes' : 'No',
        state.notes,
      ]);
    });
  });

  const escape = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
  const csvContent = [
    `# ${framework.name} Compliance Export`,
    `# Generated: ${timestamp}`,
    '',
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ].join('\n');

  downloadFile(csvContent, `${framework.shortName}_Compliance_${timestamp}.csv`, 'text/csv');
}

function generateComplianceReport(framework: ComplianceFramework, controlStates: Record<string, { checked: boolean; notes: string }>) {
  const timestamp = new Date().toISOString().split('T')[0];
  const allControls = framework.categories.flatMap(c => c.controls);
  const stats = {
    total: allControls.length,
    pass: allControls.filter(c => c.status === 'pass').length,
    inProgress: allControls.filter(c => c.status === 'in-progress').length,
    fail: allControls.filter(c => c.status === 'fail').length,
    notStarted: allControls.filter(c => c.status === 'not-started').length,
  };
  const compliancePct = Math.round((stats.pass / (stats.total - stats.notStarted)) * 100) || 0;

  const reportData = {
    reportTitle: `${framework.name} Compliance Report`,
    framework: framework.shortName,
    generatedDate: timestamp,
    lastAudit: framework.lastAudit,
    nextAudit: framework.nextAudit,
    summary: {
      compliancePercentage: compliancePct,
      ...stats,
    },
    categories: framework.categories.map(cat => ({
      name: cat.name,
      controls: cat.controls.map(ctrl => {
        const state = controlStates[ctrl.id] || { checked: false, notes: '' };
        return {
          id: ctrl.id,
          label: ctrl.label,
          status: ctrl.status,
          owner: ctrl.owner,
          dueDate: ctrl.dueDate,
          evidence: ctrl.evidence,
          userChecked: state.checked,
          userNotes: state.notes,
        };
      }),
    })),
    gaps: allControls.filter(c => c.status === 'fail').map(c => ({
      id: c.id,
      label: c.label,
      owner: c.owner,
      dueDate: c.dueDate,
    })),
  };

  downloadFile(JSON.stringify(reportData, null, 2), `${framework.shortName}_Compliance_Report_${timestamp}.json`, 'application/json');
}

// ─────────────────────────── Compliance Posture Strip ───────────────────────────

interface PostureTileProps {
  title: string;
  metric: string | number;
  sub: string;
  tone: 'success' | 'warning' | 'danger' | 'default';
  onClick?: () => void;
}

function PostureTile({ title, metric, sub, tone, onClick }: PostureTileProps) {
  const toneColors = {
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-rose-600',
    default: 'text-slate-900',
  };

  return (
    <button
      onClick={onClick}
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm text-left hover:shadow-md transition-all"
    >
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneColors[tone]}`}>{metric}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </button>
  );
}

// ─────────────────────────── Maturity Readiness Card ───────────────────────────

const MATURITY_LEVELS: Record<number, { label: string; color: string; description: string }> = {
  1: { label: 'Initial', color: '#ef4444', description: 'Ad-hoc processes, limited governance' },
  2: { label: 'Developing', color: '#f97316', description: 'Basic processes, emerging standards' },
  3: { label: 'Defined', color: '#eab308', description: 'Documented standards, consistent practices' },
  4: { label: 'Managed', color: '#22c55e', description: 'Measured processes, proactive governance' },
  5: { label: 'Optimizing', color: '#10b981', description: 'Continuous improvement, industry-leading' },
};

function MaturityReadinessCard() {
  const [expanded, setExpanded] = useState(false);
  const [maturityData, setMaturityData] = useState<MaturityAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchMaturity = async () => {
      try {
        const assessments = await maturityApi.list();
        if (cancelled) return;
        // Get the most recent assessment that is Complete or In Progress
        const activeAssessment = assessments
          .filter(a => a.status === 'Complete' || a.status === 'In Progress')
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
        setMaturityData(activeAssessment || null);
        setLive(true);
      } catch {
        if (!cancelled) {
          setMaturityData(null);
          setLive(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchMaturity();
    return () => { cancelled = true; };
  }, []);

  const computed = maturityData?.computed;
  const maturityLevel = computed?.maturity_level ?? 0;
  const composite = computed?.composite ?? 0;
  const governanceDimension = computed?.dimensions?.governance;
  const completion = computed?.completion ?? 0;

  // Map maturity level to compliance readiness
  const getComplianceReadiness = (level: number): { label: string; color: string; description: string } => {
    if (level >= 4) return { label: 'High', color: '#10b981', description: 'Strong foundation for compliance automation' };
    if (level >= 3) return { label: 'Moderate', color: '#eab308', description: 'Ready for structured compliance programs' };
    if (level >= 2) return { label: 'Developing', color: '#f97316', description: 'Compliance gaps likely - prioritize governance' };
    return { label: 'Low', color: '#ef4444', description: 'Foundational work needed before compliance' };
  };

  const readiness = getComplianceReadiness(maturityLevel);
  const levelInfo = MATURITY_LEVELS[maturityLevel] || MATURITY_LEVELS[1];

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading maturity data...</span>
        </div>
      </div>
    );
  }

  return (
    <details
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm mb-6"
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
    >
      <summary className="px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors flex items-center justify-between list-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Icon name="academic-cap" className="w-4 h-4 text-violet-600" strokeWidth={2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">Maturity Readiness</span>
              {live && maturityData && <LiveDataBadge source="Plan API" />}
            </div>
            <span className="text-[10px] text-slate-500">
              {maturityData ? `${maturityData.name} - ${maturityData.organization}` : 'No assessment available'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {maturityData && (
            <>
              {/* Maturity Level Indicator */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">Level</span>
                <div
                  className="text-lg font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: `${levelInfo.color}20`, color: levelInfo.color }}
                >
                  L{maturityLevel}
                </div>
              </div>
              {/* Governance Score */}
              {governanceDimension && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">Governance</span>
                  <div className="text-lg font-bold text-violet-600">
                    {governanceDimension.average.toFixed(1)}
                  </div>
                </div>
              )}
              {/* Compliance Readiness */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">Compliance Ready</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded"
                  style={{ backgroundColor: `${readiness.color}20`, color: readiness.color }}
                >
                  {readiness.label}
                </span>
              </div>
            </>
          )}
          <Icon name="chevron-down" className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </summary>

      <div className="px-4 pb-4 border-t border-slate-100">
        {!maturityData ? (
          <div className="py-6 text-center">
            <Icon name="clipboard-document-list" className="w-10 h-10 text-slate-300 mx-auto mb-2" strokeWidth={1.5} />
            <div className="text-sm text-slate-500 mb-3">No maturity assessment found</div>
            <Link
              to="/maturity"
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Icon name="plus" className="w-4 h-4" />
              Create Assessment in Plan
            </Link>
          </div>
        ) : (
          <div className="pt-4 space-y-4">
            {/* Overall Status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Composite Score</div>
                <div className="text-2xl font-bold text-slate-800">{composite.toFixed(1)}</div>
                <div className="text-[10px] text-slate-400">out of 5.0</div>
              </div>
              <div className="p-3 rounded-lg border" style={{ backgroundColor: `${levelInfo.color}10`, borderColor: `${levelInfo.color}40` }}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: levelInfo.color }}>Maturity Level</div>
                <div className="text-2xl font-bold" style={{ color: levelInfo.color }}>L{maturityLevel}</div>
                <div className="text-[10px]" style={{ color: levelInfo.color }}>{levelInfo.label}</div>
              </div>
              <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
                <div className="text-[10px] text-violet-600 uppercase tracking-wide">Governance Dimension</div>
                <div className="text-2xl font-bold text-violet-700">
                  {governanceDimension ? governanceDimension.average.toFixed(1) : '—'}
                </div>
                <div className="text-[10px] text-violet-500">
                  {governanceDimension ? `L${governanceDimension.maturity_level}` : 'Not scored'}
                </div>
              </div>
              <div className="p-3 rounded-lg border" style={{ backgroundColor: `${readiness.color}10`, borderColor: `${readiness.color}40` }}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: readiness.color }}>Compliance Readiness</div>
                <div className="text-2xl font-bold" style={{ color: readiness.color }}>{readiness.label}</div>
                <div className="text-[10px]" style={{ color: readiness.color }}>{readiness.description}</div>
              </div>
            </div>

            {/* Dimension Breakdown */}
            {computed?.dimensions && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-3">All 6 Dimensions</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(computed.dimensions).map(([key, dim]) => {
                    const isGovernance = key === 'governance';
                    return (
                      <div
                        key={key}
                        className={`p-2 rounded-lg border ${isGovernance ? 'bg-violet-50 border-violet-200' : 'bg-white border-slate-200'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium capitalize ${isGovernance ? 'text-violet-700' : 'text-slate-700'}`}>
                            {dim.label}
                          </span>
                          <span className={`text-sm font-bold ${isGovernance ? 'text-violet-600' : 'text-slate-800'}`}>
                            {dim.average.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(dim.average / 5) * 100}%`,
                                backgroundColor: isGovernance ? '#8b5cf6' : MATURITY_LEVELS[dim.maturity_level]?.color || '#64748b',
                              }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-500">L{dim.maturity_level}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          {dim.answered}/{dim.total} questions
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Compliance Readiness Explanation */}
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-start gap-3">
                <Icon name="information-circle" className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-blue-800 mb-1">How Maturity Relates to Compliance</div>
                  <div className="text-xs text-blue-700 space-y-1">
                    <p>
                      Your maturity level indicates organizational readiness for compliance programs. The <strong>Governance dimension</strong> specifically measures:
                    </p>
                    <ul className="list-disc list-inside ml-2 space-y-0.5">
                      <li>AI governance framework maturity</li>
                      <li>Policy and standards documentation</li>
                      <li>Oversight committee effectiveness</li>
                      <li>Risk management integration</li>
                    </ul>
                    <p className="pt-1">
                      {maturityLevel >= 3
                        ? 'Your organization is ready for structured compliance frameworks like NIST AI RMF and SR 26-2.'
                        : 'Focus on improving governance foundations before scaling compliance programs.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Assessment Metadata & Link */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <div className="text-[10px] text-slate-500">
                <span>Assessment: </span>
                <span className="font-medium text-slate-700">{maturityData.name}</span>
                <span className="mx-2">|</span>
                <span>Status: </span>
                <span className={`font-medium ${maturityData.status === 'Complete' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {maturityData.status}
                </span>
                <span className="mx-2">|</span>
                <span>Completion: </span>
                <span className="font-medium text-slate-700">{completion.toFixed(0)}%</span>
                <span className="mx-2">|</span>
                <span>Updated: </span>
                <span className="font-medium text-slate-700">
                  {new Date(maturityData.updated_at).toLocaleDateString()}
                </span>
              </div>
              <Link
                to="/maturity"
                className="text-xs font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1"
              >
                View Full Assessment
                <Icon name="arrow-right" className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function CompliancePostureStrip({ frameworks, live }: { frameworks: ComplianceFramework[]; live: boolean }) {
  const avgScore = useMemo(() => {
    let passed = 0, applicable = 0;
    frameworks.forEach(fw => {
      const controls = fw.categories.flatMap(c => c.controls);
      applicable += controls.filter(c => c.status !== 'not-started').length;
      passed += controls.filter(c => c.status === 'pass').length;
    });
    return applicable > 0 ? Math.round((passed / applicable) * 100) : 0;
  }, [frameworks]);

  const revalidation = useMemo(() => {
    let overdue = 0, dueSoon = 0;
    frameworks.forEach(fw => {
      fw.categories.flatMap(c => c.controls).forEach(ctrl => {
        if (ctrl.dueDate) {
          const days = Math.round((new Date(ctrl.dueDate).getTime() - Date.now()) / 86400000);
          if (days < 0) overdue++;
          else if (days <= 30) dueSoon++;
        }
      });
    });
    return { overdue, dueSoon };
  }, [frameworks]);

  const gaps = useMemo(() => {
    return frameworks.reduce((count, fw) =>
      count + fw.categories.flatMap(c => c.controls).filter(c => c.status === 'fail').length
    , 0);
  }, [frameworks]);

  const attestations = useMemo(() => {
    const active = frameworks.filter(fw => fw.lastAudit).length;
    return { active, total: frameworks.length };
  }, [frameworks]);

  // Live AWS Config rule compliance. Sourced from the same endpoint as the AWS Config Rules
  // card further down this page (governControlsApi.configRules) so both surfaces report one
  // shared rule-set denominator instead of two. The percentage is over the rules AWS Config
  // returned a pass/fail verdict for; rules with no verdict yet (INSUFFICIENT_DATA /
  // NOT_APPLICABLE — e.g. Security Hub service-linked rules) are stated alongside it rather
  // than dropped silently from the denominator. evaluated + noVerdict === total.
  const [configRules, setConfigRules] = useState<AwsConfigRulesResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    governControlsApi.configRules()
      .then(d => { if (!cancelled) setConfigRules(d); })
      .catch(() => { if (!cancelled) setConfigRules(null); });
    return () => { cancelled = true; };
  }, []);
  const configEvaluated = (configRules?.compliant ?? 0) + (configRules?.noncompliant ?? 0);
  const configNoVerdict = (configRules?.insufficient_data ?? 0) + (configRules?.not_applicable ?? 0);
  const configPct = configEvaluated > 0
    ? Math.round((configRules!.compliant / configEvaluated) * 1000) / 10
    : 0;
  const configTone: 'success' | 'warning' | 'danger' | 'default' = !configRules?.live || configEvaluated === 0 ? 'default'
    : configPct >= 80 ? 'success'
    : configPct >= 50 ? 'warning' : 'danger';
  const configSub = !configRules?.live
    ? (configRules?.note ?? 'AWS Config unavailable')
    : configEvaluated > 0
      ? `${configRules.compliant}/${configEvaluated} evaluated rules passing · ${configNoVerdict} of ${configRules.total} awaiting a verdict`
      : configRules.total > 0
        ? `None of the ${configRules.total} Config rules have a verdict yet`
        : (configRules.note ?? 'No AWS Config rules configured');

  const scoreTone = avgScore >= 80 ? 'success' : avgScore >= 60 ? 'warning' : 'danger';
  const revalTone = revalidation.overdue > 0 ? 'danger' : revalidation.dueSoon > 0 ? 'warning' : 'success';
  const gapTone = gaps > 5 ? 'danger' : gaps > 0 ? 'warning' : 'success';
  const attestTone = attestations.active === attestations.total ? 'success' : 'warning';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="chart-bar" className="w-4 h-4 text-blue-600" strokeWidth={2} />
        <span className="text-sm font-semibold text-slate-800">Compliance Posture</span>
        {live
          ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium uppercase tracking-wider">LIVE</span>
          : <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium uppercase tracking-wider">Demo</span>}
        <span className="text-[10px] text-slate-400 ml-auto">across {frameworks.length} frameworks</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PostureTile
          title="Avg Framework Score"
          metric={`${avgScore}%`}
          sub={`${frameworks.length} frameworks tracked`}
          tone={scoreTone}
        />
        <PostureTile
          title="Revalidation"
          metric={revalidation.overdue > 0 ? revalidation.overdue : revalidation.dueSoon}
          sub={revalidation.overdue > 0 ? 'controls overdue' : revalidation.dueSoon > 0 ? 'due within 30 days' : 'all on track'}
          tone={revalTone}
        />
        <PostureTile
          title="Control Gaps"
          metric={gaps}
          sub={gaps > 0 ? 'require remediation' : 'no gaps identified'}
          tone={gapTone}
        />
        <PostureTile
          title="Attestations"
          metric={`${attestations.active}/${attestations.total}`}
          sub={attestations.active === attestations.total ? 'all frameworks attested' : `${attestations.total - attestations.active} pending`}
          tone={attestTone}
        />
        <PostureTile
          title="Config Rules (Evaluated)"
          metric={configRules?.live && configEvaluated > 0 ? `${configPct}%` : '—'}
          sub={configSub}
          tone={configTone}
        />
      </div>
    </div>
  );
}

// ─────────────────────────── Preventive Controls (SCPs) ───────────────────────────

/**
 * Preventive Controls (SCPs) — real AWS Organizations Service Control Policies.
 *
 * Backed by governScpApi.policies(). SCPs are org-level preventive guardrails that
 * cap what any account can do regardless of IAM. LiveDataBadge/MockDataBadge gated
 * on `.live`. When the backend account is not the org management / delegated-admin
 * account, Organizations returns AccessDenied — the card shows the honest note.
 * When the only policy is the AWS-managed default FullAWSAccess, it is shown with a
 * note that no custom restrictive SCPs are attached (no fabricated posture).
 */
function PreventiveControlsCard() {
  const [data, setData] = useState<AwsScpResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    governScpApi.policies()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isLive = !!data?.live;
  const policies = data?.policies ?? [];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="no-symbol" className="w-4 h-4 text-indigo-600" strokeWidth={2} />
          <span className="text-sm font-semibold text-slate-900">Preventive Controls (SCPs)</span>
          {isLive
            ? <LiveDataBadge source="Organizations" detail={data?.source ?? undefined} />
            : <MockDataBadge integration="AWS Organizations (management / delegated-admin access)" />}
        </div>
        <span className="text-[10px] text-slate-400">Org-level guardrails that cap account permissions</span>
      </div>

      {loading ? (
        <div className="p-4 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading Service Control Policies…</span>
        </div>
      ) : !isLive ? (
        <div className="p-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <Icon name="information-circle" className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
            <div className="text-xs text-slate-500">
              {data?.note ?? 'Requires AWS Organizations management or delegated-admin access to enumerate Service Control Policies.'}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Stat tiles — all from the live response */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Total SCPs</div>
              <div className="text-2xl font-bold text-slate-800 tabular-nums">{data!.total}</div>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
              <div className="text-[10px] text-indigo-600 uppercase tracking-wide">Custom Restrictive</div>
              <div className="text-2xl font-bold text-indigo-700 tabular-nums">{data!.custom_count}</div>
              <div className="text-[9px] text-indigo-500">non AWS-managed</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">AWS-Managed</div>
              <div className="text-2xl font-bold text-slate-700 tabular-nums">{data!.aws_managed_count}</div>
              <div className="text-[9px] text-slate-400">e.g. FullAWSAccess</div>
            </div>
          </div>

          {/* Honest note when only the default managed SCP exists */}
          {data!.custom_count === 0 && data?.note && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
              <div className="text-xs text-amber-700">{data.note}</div>
            </div>
          )}

          {/* Policy list */}
          {policies.length > 0 ? (
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {policies.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <Icon
                    name={p.aws_managed ? 'lock-closed' : 'no-symbol'}
                    className={`w-3.5 h-3.5 flex-shrink-0 ${p.aws_managed ? 'text-slate-400' : 'text-indigo-500'}`}
                    strokeWidth={2}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-700 truncate" title={p.description ?? p.name}>{p.name}</div>
                    {p.description && (
                      <div className="text-[10px] text-slate-400 truncate">{p.description}</div>
                    )}
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    p.aws_managed ? 'bg-slate-100 text-slate-600' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {p.aws_managed ? 'AWS-managed' : 'Custom'}
                  </span>
                  {typeof p.attached_target_count === 'number' && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                      title="Targets this SCP is attached to (accounts / OUs / root)"
                    >
                      {p.attached_target_count} target{p.attached_target_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 p-3 rounded-lg bg-slate-50 border border-slate-200">
              No Service Control Policies returned.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── AWS Config Rules ───────────────────────────

/**
 * AwsConfigRulesCard — real AWS Config rule compliance.
 *
 * Backed by governControlsApi.configRules() (config:DescribeConfigRules +
 * DescribeComplianceByConfigRule). AWS Config already powers internal control
 * evaluation in this platform; this surfaces the underlying rule set directly.
 * LiveDataBadge / MockDataBadge gated on `.live`; the honest note is shown when
 * Config is not enabled, config:Describe* is not granted, or no rules exist.
 * All numbers come straight from the live response — none are fabricated.
 */
const CONFIG_COMPLIANCE_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  COMPLIANT: { label: 'Compliant', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' },
  NON_COMPLIANT: { label: 'Non-compliant', badge: 'bg-rose-50 border-rose-200 text-rose-700', dot: 'bg-rose-500' },
  NOT_APPLICABLE: { label: 'N/A', badge: 'bg-slate-100 border-slate-200 text-slate-500', dot: 'bg-slate-400' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', badge: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500' },
};

function AwsConfigRulesCard() {
  const [data, setData] = useState<AwsConfigRulesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    governControlsApi.configRules()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isLive = !!data?.live;
  const rules = data?.rules ?? [];

  const tiles = [
    { key: 'compliant', label: 'Compliant', value: data?.compliant ?? 0, cls: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', sub: 'text-emerald-500' },
    { key: 'noncompliant', label: 'Non-compliant', value: data?.noncompliant ?? 0, cls: 'bg-rose-50 border-rose-200', text: 'text-rose-700', sub: 'text-rose-500' },
    { key: 'not_applicable', label: 'Not applicable', value: data?.not_applicable ?? 0, cls: 'bg-slate-50 border-slate-200', text: 'text-slate-700', sub: 'text-slate-400' },
    { key: 'insufficient_data', label: 'Insufficient data', value: data?.insufficient_data ?? 0, cls: 'bg-amber-50 border-amber-200', text: 'text-amber-700', sub: 'text-amber-500' },
  ];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="clipboard-document-check" className="w-4 h-4 text-emerald-600" strokeWidth={2} />
          <span className="text-sm font-semibold text-slate-900">AWS Config Rules</span>
          {isLive
            ? <LiveDataBadge source="AWS Config" detail={data?.source ?? undefined} />
            : <MockDataBadge integration="AWS Config (config:DescribeConfigRules)" />}
        </div>
        <span className="text-[10px] text-slate-400">Resource compliance evaluated by AWS Config rules</span>
      </div>

      {loading ? (
        <div className="p-4 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading AWS Config rules…</span>
        </div>
      ) : !isLive ? (
        <div className="p-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <Icon name="information-circle" className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
            <div className="text-xs text-slate-500">
              {data?.note ?? 'AWS Config not enabled or config:Describe* not granted.'}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Summary tiles — straight from the live response */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiles.map(t => (
              <div key={t.key} className={`rounded-lg p-3 border ${t.cls}`}>
                <div className={`text-[10px] uppercase tracking-wide ${t.sub}`}>{t.label}</div>
                <div className={`text-2xl font-bold tabular-nums ${t.text}`}>{t.value}</div>
              </div>
            ))}
          </div>

          {/* Honest note (no rules configured, or cached-age stamp) */}
          {data?.note && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <Icon name="information-circle" className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
              <div className="text-xs text-slate-500">{data.note}</div>
            </div>
          )}

          {/* Per-rule list — non-compliant surfaced first */}
          {rules.length > 0 ? (
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden max-h-96 overflow-y-auto">
              {rules.map(rule => {
                const cfg = CONFIG_COMPLIANCE_CONFIG[rule.compliance] ?? CONFIG_COMPLIANCE_CONFIG.INSUFFICIENT_DATA;
                return (
                  <div key={rule.name} className="flex items-center gap-2 px-3 py-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-700 truncate" title={rule.description ?? rule.name}>{rule.name}</div>
                      {rule.description && (
                        <div className="text-[10px] text-slate-400 truncate">{rule.description}</div>
                      )}
                    </div>
                    {rule.source && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500" title="Config rule source owner">
                        {rule.source}
                      </span>
                    )}
                    {typeof rule.noncompliant_resources === 'number' && rule.noncompliant_resources > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700" title="Non-compliant resources (capped count)">
                        {rule.noncompliant_resources} resource{rule.noncompliant_resources !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-slate-500 p-3 rounded-lg bg-slate-50 border border-slate-200">
              AWS Config returned no rules for this account/region.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Framework-Aware Governance Program Builder ───────────────────────────

const FRAMEWORK_COLORS: Record<string, string> = {
  'NIST AI RMF': '#3b82f6',
  'SR 26-2': '#8b5cf6',
  'EU AI Act': '#f59e0b',
  'CRI FS AI RMF': '#10b981',
  'ISO 42001': '#06b6d4',
  'NAIC': '#ea580c',
  'OSFI E-23': '#ec4899',
  'OWASP LLM': '#dc2626',
  'MITRE ATLAS': '#db2777',
};

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  governance: { label: 'Governance', color: '#8b5cf6' },
  data: { label: 'Data', color: '#3b82f6' },
  model: { label: 'Model', color: '#10b981' },
  validation: { label: 'Validation', color: '#f59e0b' },
  deployment: { label: 'Deployment', color: '#06b6d4' },
  monitoring: { label: 'Monitoring', color: '#ec4899' },
  security: { label: 'Security', color: '#dc2626' },
  consumer: { label: 'Consumer', color: '#ea580c' },
};

// Framework deep-dive navigation identifiers. These are distinct from TabId
// (the Compliance Center's own tab ids) — the main component translates them
// into framework ids via fwIdMap before switching tabs.
type FrameworkNavId =
  | 'nist'
  | 'eu-ai-act'
  | 'finos-air'
  | 'owasp-llm'
  | 'sr26'
  | 'cri-ai-rmf'
  | 'osfi-e23'
  | 'iso-42001'
  | 'mitre-atlas'
  | 'naic-ai';

// Map framework names to framework nav IDs for navigation
const FRAMEWORK_TAB_MAP: Record<string, FrameworkNavId> = {
  'NIST AI RMF': 'nist',
  'EU AI Act': 'eu-ai-act',
  'FINOS AIR': 'finos-air',
  'OWASP LLM Top 10': 'owasp-llm',
  'SR 26-2': 'sr26',
  'CRI FS AI RMF': 'cri-ai-rmf',
  'OSFI E-23': 'osfi-e23',
  'ISO 42001': 'iso-42001',
  'MITRE ATLAS': 'mitre-atlas',
  'NAIC AI': 'naic-ai',
};

interface ProgramBuilderProps {
  onNavigateToFramework?: (tabId: FrameworkNavId) => void;
}

// Implementation phases with timeline estimates
const IMPLEMENTATION_PHASES = [
  { id: 'foundation', label: 'Foundation', description: 'Governance charter, committee, risk appetite', weeks: '2-4', color: '#8b5cf6', icon: <Icon name="building-office" className="w-5 h-5" /> },
  { id: 'policies', label: 'Policies', description: 'Data governance, vendor management, documentation standards', weeks: '3-6', color: '#3b82f6', icon: <Icon name="clipboard-document-list" className="w-5 h-5" /> },
  { id: 'processes', label: 'Processes', description: 'Model validation, bias testing, HITL workflows', weeks: '4-8', color: '#10b981', icon: <Icon name="cog-6-tooth" className="w-5 h-5" /> },
  { id: 'technology', label: 'Technology', description: 'Guardrails, security controls, runtime safety', weeks: '4-8', color: '#f59e0b', icon: <Icon name="wrench" className="w-5 h-5" /> },
  { id: 'operate', label: 'Operate', description: 'Training, incident response, continuous improvement', weeks: 'Ongoing', color: '#ef4444', icon: <Icon name="rocket-launch" className="w-5 h-5" /> },
];

// Framework metadata for comparison — descriptive attributes only. Control counts are
// deliberately not here; see CHECKLIST_CONTROL_TOTALS below.
const FRAMEWORK_METADATA: Record<string, { type: string; region: string; mandatory: boolean }> = {
  'NIST AI RMF': { type: 'Standards', region: 'US', mandatory: false },
  'SR 26-2': { type: 'Regulatory', region: 'US (Banking)', mandatory: true },
  'EU AI Act': { type: 'Regulatory', region: 'EU', mandatory: true },
  'CRI FS AI RMF': { type: 'Industry', region: 'Global (FSI)', mandatory: false },
  'ISO 42001': { type: 'Standards', region: 'Global', mandatory: false },
  'NAIC': { type: 'Regulatory', region: 'US (Insurance)', mandatory: true },
  'OSFI E-23': { type: 'Regulatory', region: 'Canada', mandatory: true },
  'FINOS AIR': { type: 'Industry', region: 'Global (FSI)', mandatory: false },
  'OWASP LLM': { type: 'Technical', region: 'Global', mandatory: false },
  'MITRE ATLAS': { type: 'Technical', region: 'Global', mandatory: false },
};

// Controls per framework, COUNTED from COMPLIANCE_CENTER_FRAMEWORKS rather than transcribed.
//
// These were ten hardcoded `totalControls` literals on FRAMEWORK_METADATA above, and one had
// drifted: 'CRI FS AI RMF' read 230 while that checklist carries 274. Nine of the ten
// literals equalled the checklist roll-up exactly (NIST 62, SR 26-2 36, EU 65, ISO 61,
// NAIC 74, OSFI 26, FINOS 46, OWASP 22, ATLAS 74), and nine exact hits on numbers that
// arbitrary is what identifies the intended quantity: the size of *this repo's* checklist,
// not the published size of the framework. OWASP LLM settles it — 22 is the checklist's
// sub-control count, where the published framework has 10 entries. CRI's 230 was the one
// row copied from the wrong source (the framework's own description string in mockData.ts
// still says "230 control objectives") and then never re-copied as the checklist grew.
//
// Counting removes the class of defect, not just the instance: adding a control to any
// checklist now moves this number, and a framework the checklist does not carry resolves to
// undefined and renders '—' rather than a stale integer.
//
// Deliberately NOT read from GET /govern/compliance/posture. That endpoint's total_controls
// is a different quantity — 45 for cri-fs-ai-rmf against these 274 — and the backend
// annotates it "informational (the frontend is authoritative for displayed control counts)".
// Substituting it would trade a stale count of the right thing for a live count of the
// wrong thing.
const CHECKLIST_CONTROL_TOTALS: Record<string, number> = Object.fromEntries(
  COMPLIANCE_CENTER_FRAMEWORKS.map(fw => [
    fw.shortName,
    fw.categories.reduce((sum, cat) => sum + cat.controls.length, 0),
  ]),
);

// Resolution of UNIFIED_CONTROL_MAPPINGS' `satisfies[].controls` references onto real controls.
//
// Two consumers read those strings as checklist control ids: `crossFrameworkImpact` (the "Also
// satisfies N other frameworks" chip on a checklist row) and the obligation counts below.
// Neither used to check that a reference names anything, so a reference that named nothing both
// rendered no chip AND still counted toward a displayed total — silently understating the first
// and inflating the second. Everything below counts only what resolves, and reports the rest.
//
// The index is BUILT from COMPLIANCE_CENTER_FRAMEWORKS rather than being a transcribed list of
// known-bad strings, so adding a control to a checklist starts resolving references to it. Two
// keys per control:
//   - its `id`, the canonical form ('NIST-GV-1.1');
//   - its `section`, but ONLY where that section names exactly one control in that framework.
//     This is what admits the NIST references: they carry published AI RMF subcategory
//     identifiers ('GOVERN 1.1'), and each is verbatim the `section` of exactly one control in
//     this checklist ('NIST-GV-1.1' has `section: 'GOVERN 1.1'`), so the two strings are two
//     spellings of one obligation. Sections shared by several controls (SR 26-2 '§IV.A', OWASP
//     LLM 'LLM01:2025') stay ambiguous and resolve to nothing rather than to an arbitrary
//     sibling — a wrong target would be a fabricated cross-framework claim, an unresolved one
//     is merely an honest gap.
// An `id` always wins over a `section` alias, so a canonical reference cannot be diverted.
const CONTROL_REF_INDEX: Map<string, Map<string, string>> = (() => {
  const byFramework = new Map<string, Map<string, string>>();
  COMPLIANCE_CENTER_FRAMEWORKS.forEach(fw => {
    const refs = new Map<string, string>();
    const sectionOwners = new Map<string, string[]>();
    fw.categories.forEach(cat => cat.controls.forEach(ctrl => {
      refs.set(ctrl.id, ctrl.id);
      if (ctrl.section) {
        const owners = sectionOwners.get(ctrl.section);
        if (owners) owners.push(ctrl.id);
        else sectionOwners.set(ctrl.section, [ctrl.id]);
      }
    }));
    sectionOwners.forEach((owners, section) => {
      if (owners.length === 1 && !refs.has(section)) refs.set(section, owners[0]);
    });
    byFramework.set(fw.shortName, refs);
  });
  return byFramework;
})();

/**
 * Split one `satisfies` entry's control references into the checklist control ids they resolve
 * to and the references that match no control in the named framework. `resolved` is canonical
 * (checklist ids) and deduped, so two spellings of one control count once.
 */
function splitControlRefs(framework: string, refs: string[]): { resolved: string[]; unresolved: string[] } {
  const index = CONTROL_REF_INDEX.get(framework);
  const resolved: string[] = [];
  const unresolved: string[] = [];
  refs.forEach(ref => {
    const id = index?.get(ref);
    if (id === undefined) unresolved.push(ref);
    else if (!resolved.includes(id)) resolved.push(id);
  });
  return { resolved, unresolved };
}

// Per-framework reference resolution across the WHOLE mapping table, independent of which
// frameworks the user has selected. Raw reference counts (a control referenced by two tasks
// counts twice), which is the quantity the framework-comparison table reports.
const MAPPING_REF_RESOLUTION: Record<string, { referenced: number; resolved: number }> = (() => {
  const byFramework: Record<string, { referenced: number; resolved: number }> = {};
  UNIFIED_CONTROL_MAPPINGS.forEach(task => task.satisfies.forEach(sat => {
    const entry = byFramework[sat.framework] ?? { referenced: 0, resolved: 0 };
    const { resolved } = splitControlRefs(sat.framework, sat.controls);
    entry.referenced += sat.controls.length;
    entry.resolved += resolved.length;
    byFramework[sat.framework] = entry;
  }));
  return byFramework;
})();

function GovernanceProgramBuilder({ onNavigateToFramework }: ProgramBuilderProps) {
  const [selectedFrameworks, setSelectedFrameworks] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ava_selected_frameworks');
      return saved ? new Set(JSON.parse(saved)) : new Set(['NIST AI RMF', 'SR 26-2']);
    } catch {
      return new Set(['NIST AI RMF', 'SR 26-2']);
    }
  });
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ava_unified_program_progress') || '{}');
    } catch {
      return {};
    }
  });
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'unified' | 'by-framework' | 'timeline'>('unified');
  const [showMatrix, setShowMatrix] = useState(false);

  const availableFrameworks = getFrameworksFromMappings();

  const toggleFramework = (fw: string) => {
    const updated = new Set(selectedFrameworks);
    if (updated.has(fw)) updated.delete(fw);
    else updated.add(fw);
    setSelectedFrameworks(updated);
    localStorage.setItem('ava_selected_frameworks', JSON.stringify(Array.from(updated)));
  };

  const toggleTask = (taskId: string) => {
    const updated = { ...completedTasks, [taskId]: !completedTasks[taskId] };
    setCompletedTasks(updated);
    localStorage.setItem('ava_unified_program_progress', JSON.stringify(updated));
  };

  // Filter tasks to only those relevant to selected frameworks
  const relevantTasks = useMemo(() => {
    if (selectedFrameworks.size === 0) return [];
    return UNIFIED_CONTROL_MAPPINGS.filter(task =>
      task.satisfies.some(s => selectedFrameworks.has(s.framework))
    );
  }, [selectedFrameworks]);

  // Calculate total controls satisfied across all selected frameworks. Only references that
  // resolve to a control in that framework's checklist reach `total` — the rest are carried
  // separately as `unresolved` and reported, rather than padding a coverage number with
  // references to controls this build does not carry.
  const controlsSatisfied = useMemo(() => {
    const byFramework: Record<string, { total: number; completed: number; unresolved: number }> = {};
    selectedFrameworks.forEach(fw => {
      byFramework[fw] = { total: 0, completed: 0, unresolved: 0 };
    });

    relevantTasks.forEach(task => {
      task.satisfies.forEach(s => {
        if (selectedFrameworks.has(s.framework)) {
          const { resolved, unresolved } = splitControlRefs(s.framework, s.controls);
          byFramework[s.framework].total += resolved.length;
          byFramework[s.framework].unresolved += unresolved.length;
          if (completedTasks[task.taskId]) {
            byFramework[s.framework].completed += resolved.length;
          }
        }
      });
    });

    return byFramework;
  }, [selectedFrameworks, relevantTasks, completedTasks]);

  // References the selected frameworks' mappings name but their checklists do not carry, so the
  // roll-ups below can say how much of the mapping table they could not account for.
  const unresolvedRefTotal = Object.values(controlsSatisfied).reduce((sum, s) => sum + s.unresolved, 0);

  const completedCount = relevantTasks.filter(t => completedTasks[t.taskId]).length;
  const overallProgress = relevantTasks.length > 0 ? Math.round((completedCount / relevantTasks.length) * 100) : 0;

  // Group tasks by category for unified view
  const tasksByCategory = useMemo(() => {
    const groups: Record<string, FrameworkControlMapping[]> = {};
    relevantTasks.forEach(task => {
      if (!groups[task.category]) groups[task.category] = [];
      groups[task.category].push(task);
    });
    return groups;
  }, [relevantTasks]);

  // Group tasks by phase for timeline view
  const tasksByPhase = useMemo(() => {
    const groups: Record<string, FrameworkControlMapping[]> = {};
    relevantTasks.forEach(task => {
      if (!groups[task.phase]) groups[task.phase] = [];
      groups[task.phase].push(task);
    });
    return groups;
  }, [relevantTasks]);

  // Mapping-overlap stats — every number below is counted from UNIFIED_CONTROL_MAPPINGS,
  // with no assumed effort model. `mappedControls` is the distinct (framework, control)
  // pairs the selected tasks actually satisfy, and `workItemReduction` is the measured
  // collapse of those obligations into shared tasks (1 - tasks / obligations). It is a
  // count of work items, not an estimate of implementation effort or cost.
  //
  // "Actually satisfy" is load-bearing: a control reference is counted only once it resolves to
  // a control in that framework's checklist (see CONTROL_REF_INDEX). Counting the raw strings
  // inflated `mappedControls` with obligations that point at nothing — and because
  // `workItemReduction` is 1 - tasks/obligations, every phantom obligation also pushed the
  // headline percentage up. `unresolvedControls` is the size of that excluded set and is
  // disclosed next to the totals, so the number shrinking is visible rather than silent.
  const efficiencyStats = useMemo(() => {
    if (selectedFrameworks.size <= 1) return null;
    // Named for what it is. This was `publishedControls`, and the sentence it feeds said
    // "controls published across the selected frameworks" — a claim the number does not
    // support, since it is the roll-up of this app's checklists (see
    // CHECKLIST_CONTROL_TOTALS). Frameworks with no checklist here contribute 0, so the
    // denominator never counts a framework it cannot enumerate.
    const checklistControls = Array.from(selectedFrameworks).reduce((sum, fw) => {
      return sum + (CHECKLIST_CONTROL_TOTALS[fw] ?? 0);
    }, 0);
    const unifiedTasks = relevantTasks.length;
    const mapped = new Set<string>();
    const unresolved = new Set<string>();
    relevantTasks.forEach(task => task.satisfies.forEach(sat => {
      if (selectedFrameworks.has(sat.framework)) {
        const split = splitControlRefs(sat.framework, sat.controls);
        split.resolved.forEach(id => mapped.add(`${sat.framework}::${id}`));
        split.unresolved.forEach(ref => unresolved.add(`${sat.framework}::${ref}`));
      }
    }));
    const mappedControls = mapped.size;
    const unresolvedControls = unresolved.size;
    const referencedControls = mappedControls + unresolvedControls;
    // Nothing referenced at all means nothing to report. Nothing *resolved* is a different
    // state and is reported (the caller branches on `mappedControls === 0`), because a callout
    // that vanished would hide the same fact the inflated count used to misstate.
    if (unifiedTasks === 0 || referencedControls === 0) return null;
    const controlsPerTask = mappedControls === 0 ? 0 : Math.round((mappedControls / unifiedTasks) * 10) / 10;
    const workItemReduction = mappedControls === 0 ? 0 : Math.max(Math.round((1 - unifiedTasks / mappedControls) * 100), 0);
    return { checklistControls, unifiedTasks, mappedControls, unresolvedControls, referencedControls, controlsPerTask, workItemReduction };
  }, [selectedFrameworks, relevantTasks]);

  return (
    <div className="space-y-4">
      {/* Header Card - Platform consistent styling */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Icon name="wrench-screwdriver" className="w-5 h-5 text-slate-600" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">AI Governance Program Builder</h2>
                <p className="text-slate-500 text-sm">Unified compliance across {availableFrameworks.length} frameworks</p>
              </div>
            </div>
            <p className="text-slate-500 text-sm mt-2 max-w-2xl">
              Build once, satisfy many. Our unified task mapping eliminates duplicate compliance work by identifying
              shared controls across regulatory and industry frameworks.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={() => setShowMatrix(!showMatrix)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                showMatrix ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Icon name="table-cells" className="w-3.5 h-3.5" />
              Compare Frameworks
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-800 tabular-nums">{selectedFrameworks.size}</div>
            <div className="text-xs text-slate-500">Selected Frameworks</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-800 tabular-nums">{relevantTasks.length}</div>
            <div className="text-xs text-slate-500">Unified Tasks</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-800 tabular-nums">
              {Object.values(controlsSatisfied).reduce((sum, s) => sum + s.total, 0)}
            </div>
            <div className="text-xs text-slate-500">Controls Covered</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${overallProgress}%`, background: overallProgress >= 80 ? '#10b981' : overallProgress >= 40 ? '#3b82f6' : '#f59e0b' }}
                />
              </div>
              <span className="text-2xl font-bold text-slate-800 tabular-nums">{overallProgress}%</span>
            </div>
            <div className="text-xs text-slate-500">Complete</div>
          </div>
        </div>

        {/* Mapping-overlap callout (when multiple frameworks selected). Counted from the
            control mappings on this page — distinct obligations vs shared tasks — so the
            model behind the percentage is stated rather than assumed. The second branch is the
            case where the mappings for the selected frameworks reference controls but none of
            them resolve: there is no overlap figure to state, and saying so beats rendering
            nothing at all. */}
        {efficiencyStats && (efficiencyStats.mappedControls === 0 ? (
          <div className="mt-4 p-3 bg-amber-50/60 rounded-lg border border-amber-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-600" strokeWidth={2} />
              </div>
              <div className="flex-1 text-xs text-amber-800">
                <span className="font-medium">No overlap to report:</span> none of the {efficiencyStats.referencedControls} control
                references these {efficiencyStats.unifiedTasks} tasks carry for the selected frameworks match a control id in this
                platform's checklists, so there is no obligation count to collapse.
                <span className="block text-[11px] text-amber-700/80 mt-0.5">
                  The mappings name published framework identifiers this build's checklists do not use. Expand a task's frameworks
                  to see which references are affected.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-emerald-600">{efficiencyStats.workItemReduction}%</span>
              </div>
              <div className="flex-1 text-xs text-emerald-700">
                <span className="font-medium">Fewer work items:</span> the {efficiencyStats.mappedControls} distinct framework
                controls these tasks map to are covered by {efficiencyStats.unifiedTasks} shared tasks
                (~{efficiencyStats.controlsPerTask} controls per task).
                <span className="block text-[11px] text-emerald-600/80 mt-0.5">
                  Counted from the mappings below: {efficiencyStats.mappedControls} of the {efficiencyStats.checklistControls} controls
                  in this platform's checklists for the selected frameworks are mapped here. Not an estimate of implementation effort or cost.
                </span>
                {efficiencyStats.unresolvedControls > 0 && (
                  <span className="block text-[11px] text-amber-700 mt-0.5">
                    {efficiencyStats.mappedControls} of the {efficiencyStats.referencedControls} control references in these mappings
                    resolve to a control in the AVA checklist. Excluded from every count above:{' '}
                    {efficiencyStats.unresolvedControls === 1
                      ? 'one reference naming a control'
                      : `${efficiencyStats.unresolvedControls} references naming controls`}{' '}
                    the checklist does not carry.
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Framework Comparison Matrix (collapsible) */}
      {showMatrix && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="table-cells" className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-800">Framework Comparison</span>
            </div>
            <button onClick={() => setShowMatrix(false)} className="text-slate-400 hover:text-slate-600">
              <Icon name="x-mark" className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Framework</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Type</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Region</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Mandatory</th>
                  {/* "Controls" is the size of this platform's checklist for the framework,
                      counted at module load — not the published control count of the
                      framework itself. Labelled so a reader cannot take it for the latter. */}
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">
                    Controls
                    <span className="block font-normal text-[10px] text-slate-400">in AVA checklist</span>
                  </th>
                  {/* How much of the mapping table below can actually be pointed at a control
                      in that framework's checklist. Reported rather than hidden: an unresolved
                      reference is a real data-quality fact about this build, and it is the
                      reason a framework's mapped-obligation count can be lower than the number
                      of references written for it. */}
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">
                    Mapped Refs
                    <span className="block font-normal text-[10px] text-slate-400">resolved of written</span>
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Selected</th>
                </tr>
              </thead>
              <tbody>
                {availableFrameworks.map(fw => {
                  const meta = FRAMEWORK_METADATA[fw];
                  const isSelected = selectedFrameworks.has(fw);
                  const color = FRAMEWORK_COLORS[fw] || '#64748b';
                  const refs = MAPPING_REF_RESOLUTION[fw];
                  const refGap = refs ? refs.referenced - refs.resolved : 0;
                  return (
                    <tr key={fw} className={`border-b border-slate-100 ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="font-medium text-slate-800">{fw}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          meta?.type === 'Regulatory' ? 'bg-rose-100 text-rose-700' :
                          meta?.type === 'Standards' ? 'bg-blue-100 text-blue-700' :
                          meta?.type === 'Industry' ? 'bg-violet-100 text-violet-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {meta?.type || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{meta?.region || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {meta?.mandatory ? (
                          <span className="text-rose-600 font-semibold">Yes</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-medium text-slate-700">{CHECKLIST_CONTROL_TOTALS[fw] ?? '—'}</td>
                      <td
                        className={`px-3 py-2 text-center font-medium ${refGap > 0 ? 'text-amber-700' : 'text-slate-700'}`}
                        title={
                          !refs
                            ? 'No control references are written for this framework.'
                            : refGap > 0
                              ? `${refGap} of the ${refs.referenced} control references written for ${fw} match no control id in this platform's checklist for it, so they are excluded from the mapped-obligation counts.`
                              : `All ${refs.referenced} control references written for ${fw} resolve to a control in this platform's checklist.`
                        }
                      >
                        {refs ? `${refs.resolved} of ${refs.referenced}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleFramework(fw)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 hover:border-slate-400'
                          }`}
                        >
                          {isSelected && <Icon name="check" className="w-3 h-3" />}
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

      {/* Implementation Timeline */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="calendar" className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-800">Implementation Timeline</span>
          </div>
          <span className="text-[10px] text-slate-500">Typical rollout: 12-20 weeks</span>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-0">
            {IMPLEMENTATION_PHASES.map((phase, idx) => {
              const phaseTasks = tasksByPhase[phase.id] || [];
              const phaseCompleted = phaseTasks.filter(t => completedTasks[t.taskId]).length;
              const phaseProgress = phaseTasks.length > 0 ? Math.round((phaseCompleted / phaseTasks.length) * 100) : 0;
              const isActive = phaseProgress > 0 && phaseProgress < 100;
              const isComplete = phaseProgress === 100;

              return (
                <div key={phase.id} className="flex-1 relative">
                  {/* Connector line */}
                  {idx < IMPLEMENTATION_PHASES.length - 1 && (
                    <div className="absolute top-4 left-1/2 w-full h-0.5 bg-slate-200 z-0">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${phaseProgress}%`, background: phase.color }}
                      />
                    </div>
                  )}
                  {/* Phase node */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all ${
                        isComplete ? 'ring-2 ring-offset-2' : isActive ? 'ring-2 ring-offset-2 animate-pulse' : ''
                      }`}
                      style={{
                        background: isComplete || isActive ? phase.color : '#e2e8f0',
                        color: isComplete || isActive ? 'white' : '#94a3b8',
                        ['--tw-ring-color' as string]: phase.color,
                      }}
                    >
                      {isComplete ? <Icon name="check" className="w-5 h-5" /> : phase.icon}
                    </div>
                    <div className="mt-2 text-center">
                      <div className="text-xs font-semibold text-slate-800">{phase.label}</div>
                      <div className="text-[10px] text-slate-500 max-w-[100px] leading-tight hidden md:block">{phase.description}</div>
                      <div className="text-[10px] font-medium mt-1" style={{ color: phase.color }}>
                        {phaseTasks.length > 0 ? `${phaseCompleted}/${phaseTasks.length}` : '—'}
                      </div>
                      <div className="text-[9px] text-slate-400">{phase.weeks}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Framework Selector */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="clipboard-document-check" className="w-4 h-4 text-slate-500" strokeWidth={2} />
            <span className="text-sm font-medium text-slate-800">Select Frameworks</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('unified')}
                className={`px-2 py-1 text-[10px] font-medium rounded ${viewMode === 'unified' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
              >
                Unified
              </button>
              <button
                onClick={() => setViewMode('by-framework')}
                className={`px-2 py-1 text-[10px] font-medium rounded ${viewMode === 'by-framework' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
              >
                By Framework
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-2 py-1 text-[10px] font-medium rounded ${viewMode === 'timeline' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
              >
                Timeline
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${overallProgress}%`, background: overallProgress >= 80 ? '#10b981' : overallProgress >= 40 ? '#3b82f6' : '#f59e0b' }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-600">{overallProgress}%</span>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Click to toggle frameworks:</div>
          <div className="flex flex-wrap gap-2">
            {availableFrameworks.map(fw => {
              const isSelected = selectedFrameworks.has(fw);
              const color = FRAMEWORK_COLORS[fw] || '#64748b';
              const tabId = FRAMEWORK_TAB_MAP[fw];
              return (
                <div key={fw} className="flex items-center gap-1">
                  <button
                    onClick={() => toggleFramework(fw)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border-2 ${
                      isSelected ? 'text-white shadow-sm' : 'bg-white/60 hover:bg-white'
                    }`}
                    style={{
                      background: isSelected ? color : undefined,
                      borderColor: color,
                      color: isSelected ? 'white' : color,
                    }}
                  >
                    {fw}
                    {isSelected && controlsSatisfied[fw] && (
                      <span className="ml-1.5 text-[9px] opacity-80">
                        {controlsSatisfied[fw].completed}/{controlsSatisfied[fw].total}
                      </span>
                    )}
                  </button>
                  {tabId && onNavigateToFramework && (
                    <button
                      onClick={() => onNavigateToFramework(tabId)}
                      className="text-[9px] text-blue-600 hover:text-blue-800 hover:underline"
                      title={`View ${fw} details`}
                    >
                      Details →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Framework Coverage Summary */}
        {selectedFrameworks.size > 1 && (
          <div className="bg-white/60 rounded-xl p-3 border border-slate-200/60">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Control Coverage by Framework</div>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {Array.from(selectedFrameworks).map(fw => {
                const stats = controlsSatisfied[fw];
                const pct = stats?.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                const color = FRAMEWORK_COLORS[fw] || '#64748b';
                const tabId = FRAMEWORK_TAB_MAP[fw];
                return (
                  <div key={fw} className="text-center p-2 rounded-lg bg-slate-50 group">
                    <div className="text-[9px] font-medium truncate" style={{ color }}>{fw}</div>
                    <div className="text-lg font-bold text-slate-800">{pct}%</div>
                    <div className="text-[9px] text-slate-400">{stats?.completed || 0}/{stats?.total || 0} controls</div>
                    {/* Per-framework disclosure at the point of use: this framework's mappings
                        reference controls the checklist does not carry, and they are not in the
                        denominator above. */}
                    {stats?.unresolved ? (
                      <div
                        className="text-[9px] text-amber-600"
                        title={`${stats.unresolved} control reference(s) written for ${fw} match no control id in this platform's checklist for it, so they are not counted above.`}
                      >
                        +{stats.unresolved} not in AVA checklist
                      </div>
                    ) : null}
                    <div className="w-full h-1 bg-slate-200 rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    {tabId && onNavigateToFramework && (
                      <button
                        onClick={() => onNavigateToFramework(tabId)}
                        className="text-[9px] text-blue-600 hover:text-blue-800 hover:underline mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View Details →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedFrameworks.size >= 2 && (
              <div className="mt-3 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="flex items-center gap-2">
                  <Icon name="check" className="w-4 h-4 text-emerald-600" strokeWidth={2} />
                  <span className="text-xs text-emerald-800">
                    <strong>{relevantTasks.length} unified tasks</strong> satisfy{' '}
                    <strong>{Object.values(controlsSatisfied).reduce((sum, s) => sum + s.total, 0)} total controls</strong>{' '}
                    across {selectedFrameworks.size} frameworks
                    {unresolvedRefTotal > 0 && (
                      <span className="block text-[11px] text-amber-700 mt-0.5">
                        Counted from references that resolve to a control in the AVA checklist. Not counted:{' '}
                        {unresolvedRefTotal === 1
                          ? 'one further reference naming a control'
                          : `${unresolvedRefTotal} further references naming controls`}{' '}
                        the checklist does not carry.
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tasks Display */}
      {selectedFrameworks.size === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <div className="text-amber-600 text-lg mb-2">Select at least one framework</div>
          <div className="text-sm text-amber-700">Choose the regulatory frameworks you need to comply with above.</div>
        </div>
      ) : viewMode === 'unified' ? (
        <div className="space-y-4">
          {Object.keys(tasksByCategory).length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
              <div className="text-slate-400 text-lg mb-2">No tasks found</div>
              <div className="text-sm text-slate-500">
                No governance tasks are mapped to your selected frameworks.
              </div>
            </div>
          )}
          {Object.entries(tasksByCategory).map(([category, tasks]) => {
            const catMeta = CATEGORY_LABELS[category] || { label: category, color: '#64748b' };
            const catCompleted = tasks.filter(t => completedTasks[t.taskId]).length;

            return (
              <div key={category} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between" style={{ borderLeftWidth: '4px', borderLeftColor: catMeta.color }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-white" style={{ background: catMeta.color }}>
                      {catMeta.label}
                    </span>
                    <span className="text-xs text-slate-500">{catCompleted}/{tasks.length} tasks</span>
                  </div>
                  <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${tasks.length > 0 ? (catCompleted / tasks.length) * 100 : 0}%`, background: catMeta.color }} />
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {tasks.map(task => {
                    const done = completedTasks[task.taskId];
                    const isExpanded = expandedTask === task.taskId;
                    // Each entry carries its reference split, so the badge count and the
                    // expanded list agree on which of this task's references name a control
                    // that exists here.
                    const relevantSatisfies = task.satisfies
                      .filter(s => selectedFrameworks.has(s.framework))
                      .map(s => ({ ...s, ...splitControlRefs(s.framework, s.controls) }));

                    return (
                      <div
                        key={task.taskId}
                        className={`p-3 rounded-lg border transition-all ${done ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50/80 border-slate-200/60'}`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleTask(task.taskId)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                              done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400'
                            }`}
                          >
                            {done && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                {task.taskName}
                              </div>
                              <button
                                onClick={() => setExpandedTask(isExpanded ? null : task.taskId)}
                                className="text-[10px] text-blue-600 hover:text-blue-700"
                              >
                                {isExpanded ? 'Hide' : 'Show'} frameworks
                              </button>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">{task.description}</div>

                            {/* Framework badges showing what this task satisfies */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {relevantSatisfies.map(s => (
                                <span
                                  key={s.framework}
                                  className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                                  style={{
                                    background: `${FRAMEWORK_COLORS[s.framework]}15`,
                                    color: FRAMEWORK_COLORS[s.framework],
                                    border: `1px solid ${FRAMEWORK_COLORS[s.framework]}40`,
                                  }}
                                  title={
                                    s.unresolved.length > 0
                                      ? `Satisfies ${s.resolved.length} control(s) in the AVA checklist: ${s.resolved.join(', ') || 'none'}. ${s.unresolved.length} further reference(s) match no control id here: ${s.unresolved.join(', ')}.`
                                      : `Satisfies ${s.resolved.length} controls: ${s.resolved.join(', ')}`
                                  }
                                >
                                  {s.framework} ({s.unresolved.length > 0 ? `${s.resolved.length} of ${s.controls.length}` : s.resolved.length})
                                </span>
                              ))}
                            </div>

                            {/* Expanded details */}
                            {isExpanded && (
                              <div className="mt-3 p-2 bg-white rounded-lg border border-slate-200 space-y-2">
                                {relevantSatisfies.map(s => (
                                  <div key={s.framework}>
                                    <div className="text-[10px] font-semibold" style={{ color: FRAMEWORK_COLORS[s.framework] }}>
                                      {s.framework} {s.section && `(${s.section})`}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Controls: {s.resolved.join(', ') || 'none in AVA checklist'}
                                    </div>
                                    {/* The most precise place to disclose the gap: the exact
                                        reference strings this build cannot resolve, next to the
                                        ones it can. */}
                                    {s.unresolved.length > 0 && (
                                      <div className="text-[10px] text-amber-600">
                                        Not in AVA checklist: {s.unresolved.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Deliverable and links */}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{task.deliverable}</span>
                              {task.template && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 cursor-pointer hover:bg-amber-200 inline-flex items-center gap-1">
                                  <Icon name="document-text" className="w-3 h-3" /> Template
                                </span>
                              )}
                              {task.platform && (
                                <Link to={task.platform} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200">
                                  Open in Platform →
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'by-framework' ? (
        /* By Framework View */
        <div className="space-y-4">
          {Array.from(selectedFrameworks).map(fw => {
            const color = FRAMEWORK_COLORS[fw] || '#64748b';
            const fwTasks = relevantTasks.filter(t => t.satisfies.some(s => s.framework === fw));
            const fwCompleted = fwTasks.filter(t => completedTasks[t.taskId]).length;

            return (
              <div key={fw} className="bg-white/80 backdrop-blur-sm rounded-xl border overflow-hidden" style={{ borderColor: `${color}40` }}>
                <div className="p-3 border-b" style={{ background: `${color}10`, borderColor: `${color}20` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color }}>{fw}</span>
                      <span className="text-xs text-slate-500">{fwCompleted}/{fwTasks.length} tasks · {controlsSatisfied[fw]?.completed || 0}/{controlsSatisfied[fw]?.total || 0} controls</span>
                    </div>
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${fwTasks.length > 0 ? (fwCompleted / fwTasks.length) * 100 : 0}%`, background: color }} />
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {fwTasks.map(task => {
                    const done = completedTasks[task.taskId];
                    const fwSatisfy = task.satisfies.find(s => s.framework === fw);
                    const fwSplit = fwSatisfy ? splitControlRefs(fw, fwSatisfy.controls) : null;
                    const otherFrameworks = task.satisfies.filter(s => s.framework !== fw && selectedFrameworks.has(s.framework));

                    return (
                      <div key={task.taskId} className={`p-3 rounded-lg border ${done ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50/80 border-slate-200/60'}`}>
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleTask(task.taskId)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                              done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400'
                            }`}
                          >
                            {done && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />}
                          </button>
                          <div className="flex-1">
                            <div className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                              {task.taskName}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {fwSatisfy?.section && <span className="font-medium">{fwSatisfy.section}:</span>} {fwSplit?.resolved.join(', ')}
                              {fwSplit && fwSplit.unresolved.length > 0 && (
                                <span className="text-amber-600">
                                  {fwSplit.resolved.length > 0 ? ' · ' : ' '}
                                  {fwSplit.unresolved.join(', ')} (not in AVA checklist)
                                </span>
                              )}
                            </div>
                            {otherFrameworks.length > 0 && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <span className="text-[9px] text-emerald-600 font-medium">Also satisfies:</span>
                                {otherFrameworks.map(s => (
                                  <span key={s.framework} className="text-[9px] px-1 py-0.5 rounded" style={{ background: `${FRAMEWORK_COLORS[s.framework]}15`, color: FRAMEWORK_COLORS[s.framework] }}>
                                    {s.framework}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Timeline View - Tasks grouped by implementation phase */
        <div className="space-y-4">
          {IMPLEMENTATION_PHASES.map(phase => {
            const phaseTasks = tasksByPhase[phase.id] || [];
            if (phaseTasks.length === 0) return null;
            const phaseCompleted = phaseTasks.filter(t => completedTasks[t.taskId]).length;
            const phaseProgress = Math.round((phaseCompleted / phaseTasks.length) * 100);

            return (
              <div key={phase.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div
                  className="px-4 py-3 border-b flex items-center justify-between"
                  style={{ borderLeftWidth: '4px', borderLeftColor: phase.color, background: `${phase.color}08` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{phase.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: phase.color }}>{phase.label}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {phase.weeks}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">{phase.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600">{phaseCompleted}/{phaseTasks.length}</span>
                    <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${phaseProgress}%`, background: phase.color }}
                      />
                    </div>
                    <span className="text-xs font-bold" style={{ color: phase.color }}>{phaseProgress}%</span>
                  </div>
                </div>

                <div className="p-3 grid gap-2 md:grid-cols-2">
                  {phaseTasks.map(task => {
                    const done = completedTasks[task.taskId];
                    const relevantSatisfies = task.satisfies.filter(s => selectedFrameworks.has(s.framework));
                    // Resolved references only, so this agrees with the roll-ups above rather
                    // than counting references to controls the checklists do not carry. The
                    // remainder is shown beside it, so a task reading '0 controls' says why.
                    const splits = relevantSatisfies.map(s => splitControlRefs(s.framework, s.controls));
                    const totalControls = splits.reduce((sum, s) => sum + s.resolved.length, 0);
                    const unresolvedControls = splits.reduce((sum, s) => sum + s.unresolved.length, 0);

                    return (
                      <div
                        key={task.taskId}
                        className={`p-3 rounded-lg border transition-all ${
                          done ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50/80 border-slate-200/60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleTask(task.taskId)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                              done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400'
                            }`}
                          >
                            {done && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                              {task.taskName}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{task.deliverable}</span>
                              <span className="text-[9px] text-slate-500">→ {totalControls} controls</span>
                              {unresolvedControls > 0 && (
                                <span
                                  className="text-[9px] text-amber-600"
                                  title={`${unresolvedControls} control reference(s) on this task match no control id in the selected frameworks' checklists here, so they are not counted.`}
                                >
                                  +{unresolvedControls} not in AVA checklist
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {relevantSatisfies.slice(0, 4).map(s => (
                                <span
                                  key={s.framework}
                                  className="text-[8px] px-1 py-0.5 rounded"
                                  style={{ background: `${FRAMEWORK_COLORS[s.framework]}15`, color: FRAMEWORK_COLORS[s.framework] }}
                                >
                                  {s.framework}
                                </span>
                              ))}
                              {relevantSatisfies.length > 4 && (
                                <span className="text-[8px] text-slate-400">+{relevantSatisfies.length - 4}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

type TabId = 'frameworks' | 'program' | 'conformance' | 'eu-conformity' | 'fria' | 'gap-guidance' | 'security-hub';
type FrameworkViewMode = 'checklist' | 'deep-dive';

// Map framework IDs to their deep-dive view components.
//
// Keys MUST match COMPLIANCE_CENTER_FRAMEWORKS[].id exactly. Three of them did not, and
// because a miss falls through to the "Deep dive view not available" placeholder rather
// than failing loudly, three fully built deep-dive views were unreachable from their only
// entry point: 'sr-26-2' vs the real 'sr26-2', 'owasp-llm-top-10' vs 'owasp-llm-top10',
// and 'osfi-e-23' vs 'osfi-e23'. Verified against the ids in mockData.ts.
const FRAMEWORK_DEEP_DIVE_MAP: Record<string, string> = {
  'nist-ai-rmf': 'nist',
  'eu-ai-act': 'eu-ai-act',
  'finos-air': 'finos-air',
  'owasp-llm-top10': 'owasp-llm',
  'sr26-2': 'sr26',
  'cri-fs-ai-rmf': 'cri-ai-rmf',
  'osfi-e23': 'osfi-e23',
  'iso-42001': 'iso-42001',
  'mitre-atlas': 'mitre-atlas',
  'naic-ai': 'naic-ai',
};

export default function ComplianceCenter() {
  const [activeTab, setActiveTab] = useState<TabId>('program');
  const [selectedFramework, setSelectedFramework] = useState<string>(COMPLIANCE_CENTER_FRAMEWORKS[0].id);
  const [frameworkViewMode, setFrameworkViewMode] = useState<FrameworkViewMode>('checklist');
  const [controlStates, setControlStates] = usePersistedState<Record<string, { checked: boolean; notes: string }>>('compliance_control_states', {});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<ControlStatus | 'all'>('all');
  const [filterControlType, setFilterControlType] = useState<ControlType | 'all'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [showTimelineView, setShowTimelineView] = useState(false);

  // Live audit history from the Govern audit log (control-plane backend).
  // Falls back to the illustrative demo entries when the log is empty/unavailable.
  const [auditEvents, setAuditEvents] = useState<GovernAuditEvent[]>([]);
  const [auditLive, setAuditLive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    governAuditApi.list()
      .then(events => {
        if (cancelled) return;
        setAuditEvents(events);
        setAuditLive(events.length > 0);
      })
      .catch(() => {
        if (cancelled) return;
        setAuditEvents([]);
        setAuditLive(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Live compliance attestations from API
  const {
    frameworks: liveFrameworks,
    live: apiLive,
    updateStatus,
    runAutoDetection,
    refresh: refreshAttestations,
  } = useComplianceAttestations();

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Use live data if available, else fall back to static mockData
  const allFrameworks = apiLive ? liveFrameworks : COMPLIANCE_CENTER_FRAMEWORKS;
  const framework = allFrameworks.find(f => f.id === selectedFramework)!;

  // Extract all controls from the current framework for live evaluation
  const frameworkControls = useMemo(() =>
    framework.categories.flatMap(cat => cat.controls),
  [framework]);

  // Live control evaluation hook — evaluates controls with autoDetectSource against AWS
  const {
    evaluations: liveEvaluations,
    live: controlEvalsLive,
    sources: evalSources,
    refresh: refreshControlEvals,
    mergeControl,
  } = useControlEvaluation({
    controls: frameworkControls,
    skip: activeTab !== 'frameworks' || frameworkViewMode !== 'checklist', // Only fetch when viewing checklists
  });

  // THE single framework object every consumer must read.
  //
  // `mergeControl` overlays live AWS control evaluations onto the seeded framework.
  // It used to be applied to `filteredCategories` alone, so the row pills showed the
  // live status while `stats`, `typeStats`, `pct`, the critical-gaps banner and BOTH
  // exports read the raw seeded framework. Reproduced end to end: the checklist showed
  // AI-5 as "✓ Compliant" (live, evaluated pass) while the CSV download recorded it as
  // "Gap / Tool permission matrix incomplete", and the summary strip simultaneously
  // claimed 72% with AI-5 listed under "Gaps Requiring Attention". An audit artifact
  // that contradicts the screen it was exported from is worse than no artifact.
  //
  // NOTE: `frameworkControls` above deliberately stays on the RAW framework - it is the
  // input to the evaluation hook, so feeding it the merged result would be circular.
  const mergedFramework = useMemo(() => ({
    ...framework,
    categories: framework.categories.map(cat => ({
      ...cat,
      controls: cat.controls.map(c => mergeControl(c)),
    })),
  }), [framework, mergeControl]);

  // This badge sits beside the <h1> in GovernPageLayout, above the tab strip, so it
  // vouches for everything below it — including twelve embedded framework views that
  // drop their own badge in `embedded` mode. It must therefore describe `allFrameworks`,
  // which is the page's dominant content.
  //
  // It previously gated on `apiLive || controlEvalsLive`. That OR defeated the honesty
  // gate in useComplianceAttestations (:101-105), which sets live=false deliberately when
  // posture exists but attestations are empty, precisely so "the LIVE badge and posture
  // strip don't misrepresent mock control statuses as live". Because `allFrameworks`
  // (:2135) falls back to COMPLIANCE_CENTER_FRAMEWORKS on `!apiLive`, the OR let one live
  // control evaluation paint a green "Live attestations from the control-plane backend"
  // pill over a page of entirely seeded frameworks, percentages, and owners.
  //
  // controlEvalsLive is still a real signal, but it is narrow: useControlEvaluation is
  // skipped outside the Frameworks/checklist view, and it only overwrites the status of
  // controls carrying an autoDetectSource. It stays gated where it is actually used —
  // the evaluated-sources panel (:2656) and mergeControl's per-control LIVE chips.
  const compliancePageBadge = apiLive
    ? (
      <LiveDataBadge
        live={apiLive}
        source="Compliance Attestations API"
        detail="Live attestations from the control-plane backend. Individual controls show their own LIVE chip when auto-detected against AWS; unchipped controls remain illustrative."
      />
    )
    : <MockDataBadge integration="AWS Audit Manager + Config + Security Hub" />;

  // Handler to update control status via API
  const handleStatusChange = useCallback(async (controlId: string, newStatus: ControlStatus) => {
    try {
      await updateStatus(selectedFramework, controlId, newStatus as ApiControlStatus);
      showToast(`Control ${controlId} updated to ${newStatus}`, 'success');
    } catch {
      showToast('Failed to update status', 'error');
    }
  }, [selectedFramework, updateStatus, showToast]);

  // Handler to run auto-detection
  const handleAutoDetection = useCallback(async () => {
    setIsAutoDetecting(true);
    try {
      const results = await runAutoDetection();
      showToast(`Auto-detection complete: ${results.length} controls updated`, 'success');
    } catch {
      showToast('Auto-detection failed', 'error');
    } finally {
      setIsAutoDetecting(false);
    }
  }, [runAutoDetection, showToast]);

  const stats = useMemo(() => {
    const allControls = mergedFramework.categories.flatMap(c => c.controls);
    return {
      total: allControls.length,
      pass: allControls.filter(c => c.status === 'pass').length,
      inProgress: allControls.filter(c => c.status === 'in-progress').length,
      fail: allControls.filter(c => c.status === 'fail').length,
      notStarted: allControls.filter(c => c.status === 'not-started').length,
    };
  }, [mergedFramework]);

  // Stats by control type
  const typeStats = useMemo(() => {
    const allControls = mergedFramework.categories.flatMap(c => c.controls);
    const byType = (type: ControlType) => {
      const controls = allControls.filter(c => c.controlType === type);
      const applicable = controls.filter(c => c.status !== 'not-started');
      const passing = controls.filter(c => c.status === 'pass');
      return {
        total: controls.length,
        applicable: applicable.length,
        passing: passing.length,
        failing: controls.filter(c => c.status === 'fail').length,
        pct: applicable.length > 0 ? Math.round((passing.length / applicable.length) * 100) : 0,
      };
    };
    return {
      technical: byType('technical'),
      'non-technical': byType('non-technical'),
      hybrid: byType('hybrid'),
      unclassified: {
        total: allControls.filter(c => !c.controlType).length,
        applicable: allControls.filter(c => !c.controlType && c.status !== 'not-started').length,
        passing: allControls.filter(c => !c.controlType && c.status === 'pass').length,
        failing: allControls.filter(c => !c.controlType && c.status === 'fail').length,
        pct: 0,
      },
    };
  }, [framework]);

  // Upcoming due dates across all frameworks
  const upcomingDueDates = useMemo(() => {
    const now = new Date();
    const items: Array<{ control: typeof framework.categories[0]['controls'][0]; framework: string; daysUntil: number }> = [];
    allFrameworks.forEach(fw => {
      fw.categories.flatMap(c => c.controls).forEach(ctrl => {
        if (ctrl.dueDate && ctrl.status !== 'pass') {
          const due = new Date(ctrl.dueDate);
          const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86400000);
          if (daysUntil >= -30 && daysUntil <= 90) {
            items.push({ control: ctrl, framework: fw.shortName, daysUntil });
          }
        }
      });
    });
    return items.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [allFrameworks]);

  // Cross-framework impact - which other frameworks does a control satisfy.
  //
  // Indexed by resolved checklist control id (see splitControlRefs), not by the raw reference
  // string. The read below is `crossFrameworkImpact[control.id]`, so a reference written in a
  // framework's published spelling used to key an entry no checklist row could ever look up —
  // the chip simply never rendered and nothing reported the miss. Resolving first restores the
  // chip for those rows without inventing a mapping: the framework list still comes only from
  // what UNIFIED_CONTROL_MAPPINGS already asserts. References that resolve to nothing are
  // skipped, since there is no row they could belong to.
  const crossFrameworkImpact = useMemo(() => {
    const impact: Record<string, string[]> = {};
    UNIFIED_CONTROL_MAPPINGS.forEach(mapping => {
      mapping.satisfies.forEach(s => {
        splitControlRefs(s.framework, s.controls).resolved.forEach(ctrlId => {
          if (!impact[ctrlId]) impact[ctrlId] = [];
          if (!impact[ctrlId].includes(s.framework)) {
            impact[ctrlId].push(s.framework);
          }
        });
      });
    });
    return impact;
  }, []);

  const pct = Math.round((stats.pass / (stats.total - stats.notStarted)) * 100) || 0;

  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  };

  const toggleControl = (controlId: string) => {
    setControlStates(prev => ({
      ...prev,
      [controlId]: { ...prev[controlId], checked: !prev[controlId]?.checked },
    }));
  };

  const updateNotes = (controlId: string, notes: string) => {
    setControlStates(prev => ({
      ...prev,
      [controlId]: { ...prev[controlId], notes },
    }));
  };

  const filteredCategories = useMemo(() => {
    // `mergedFramework` has already applied mergeControl to every control, so this only
    // filters. Re-merging here would be a redundant second pass over the same data.
    return mergedFramework.categories.map(cat => ({
      ...cat,
      controls: cat.controls.filter(c => {
        const statusMatch = filterStatus === 'all' || c.status === filterStatus;
        const typeMatch = filterControlType === 'all' || c.controlType === filterControlType;
        return statusMatch && typeMatch;
      }),
    })).filter(cat => cat.controls.length > 0);
  }, [mergedFramework, filterStatus, filterControlType]);

  return (
    <GovernPageLayout
      title="Compliance Center"
      description="Prove compliance continuously — live posture across AI frameworks, evidence and attestations, and preventive-control tracking."
      badge={<><CoreBadge pillar="govern" />{compliancePageBadge}</>}
      actions={
        <Link
          to="/govern/risk"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          View Risk Controls →
        </Link>
      }
    >
        {/* How to Use & Make Live in AWS Guide */}
        <UnifiedGuide {...COMPLIANCE_GUIDE} />

        {/* Compliance Posture Strip */}
        <CompliancePostureStrip frameworks={allFrameworks} live={apiLive} />

        {/* Maturity Readiness Card - shows Plan maturity data in compliance context */}
        <MaturityReadinessCard />

        {/* Tab Switcher - Clean 3-tab design (Program Builder first) */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist" aria-label="Compliance Center sections">
          <button
            id="tab-program"
            role="tab"
            aria-selected={activeTab === 'program'}
            aria-controls="tabpanel-program"
            onClick={() => setActiveTab('program')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'program'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name="wrench-screwdriver" className="w-4 h-4" strokeWidth={2} />
            Program Builder
          </button>
          <button
            id="tab-frameworks"
            role="tab"
            aria-selected={activeTab === 'frameworks'}
            aria-controls="tabpanel-frameworks"
            onClick={() => setActiveTab('frameworks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'frameworks'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name="document-check" className="w-4 h-4" strokeWidth={2} />
            Framework Checklists
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">{allFrameworks.length}</span>
          </button>
          <button
            id="tab-eu-conformity"
            role="tab"
            aria-selected={activeTab === 'eu-conformity'}
            aria-controls="tabpanel-eu-conformity"
            onClick={() => setActiveTab('eu-conformity')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'eu-conformity'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
            title="EU AI Act Article 43 Conformity Assessment Workflow"
          >
            <Icon name="clipboard-document-check" className="w-4 h-4" strokeWidth={2} />
            Conformity
            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700">Art.43</span>
          </button>
          <button
            id="tab-conformance"
            role="tab"
            aria-selected={activeTab === 'conformance'}
            aria-controls="tabpanel-conformance"
            onClick={() => setActiveTab('conformance')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'conformance'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
            title="ISO 42001 AI Management System conformance record"
          >
            <Icon name="clipboard-document-list" className="w-4 h-4" strokeWidth={2} />
            ISO 42001 AIMS
          </button>
          <button
            id="tab-fria"
            role="tab"
            aria-selected={activeTab === 'fria'}
            aria-controls="tabpanel-fria"
            onClick={() => setActiveTab('fria')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'fria'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
            title="Fundamental Rights Impact Assessment - EU AI Act Article 27"
          >
            <Icon name="document-text" className="w-4 h-4" strokeWidth={2} />
            FRIA
            <span className="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700">Art.27</span>
          </button>
          <button
            id="tab-gap-guidance"
            role="tab"
            aria-selected={activeTab === 'gap-guidance'}
            aria-controls="tabpanel-gap-guidance"
            onClick={() => setActiveTab('gap-guidance')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'gap-guidance'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
            title="Organizational actions required beyond platform automation"
          >
            <Icon name="clipboard-document-list" className="w-4 h-4" strokeWidth={2} />
            Gap Guidance
          </button>
          <button
            id="tab-security-hub"
            role="tab"
            aria-selected={activeTab === 'security-hub'}
            aria-controls="tabpanel-security-hub"
            onClick={() => setActiveTab('security-hub')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'security-hub'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
            title="AWS Security Hub AI-related compliance findings"
          >
            <Icon name="shield-check" className="w-4 h-4" strokeWidth={2} />
            Security Hub
            <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-100 text-cyan-700">AI</span>
          </button>
        </div>

        {activeTab === 'security-hub' ? (
          <div id="tabpanel-security-hub" role="tabpanel" aria-labelledby="tab-security-hub" className="space-y-6">
            {/* AI Security Controls - Best Practices & Framework Mapping */}
            <AISecurityControlsPanel />

            {/* Preventive Controls - real AWS Organizations Service Control Policies */}
            <PreventiveControlsCard />

            {/* AWS Config Rules - real per-rule compliance from AWS Config */}
            <AwsConfigRulesCard />

            {/* Security Hub Findings Panel */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 bg-cyan-500 rounded-full" />
                <h3 className="text-base font-semibold text-slate-900">Security Hub Findings</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">
                  All Findings
                </span>
              </div>
              <SecurityHubFindingsPanel aiOnly={false} />
            </div>
          </div>
        ) : activeTab === 'gap-guidance' ? (
          <div id="tabpanel-gap-guidance" role="tabpanel" aria-labelledby="tab-gap-guidance">
            <ComplianceGapGuidance />
          </div>
        ) : activeTab === 'fria' ? (
          <div id="tabpanel-fria" role="tabpanel" aria-labelledby="tab-fria">
            <FriaWizard embedded />
          </div>
        ) : activeTab === 'eu-conformity' ? (
          <div id="tabpanel-eu-conformity" role="tabpanel" aria-labelledby="tab-eu-conformity">
            <ConformityAssessmentWorkflow embedded />
          </div>
        ) : activeTab === 'conformance' ? (
          <div id="tabpanel-conformance" role="tabpanel" aria-labelledby="tab-conformance">
            <ConformanceView embedded />
          </div>
        ) : activeTab === 'program' ? (
          <div id="tabpanel-program" role="tabpanel" aria-labelledby="tab-program">
            <GovernanceProgramBuilder onNavigateToFramework={(fwTabId) => {
              // Map the old framework tab IDs to the new unified view
              const fwIdMap: Record<string, string> = {
                'nist': 'nist-ai-rmf',
                'eu-ai-act': 'eu-ai-act',
                'finos-air': 'finos-air',
                'owasp-llm': 'owasp-llm-top-10',
                'sr26': 'sr-26-2',
                'cri-ai-rmf': 'cri-fs-ai-rmf',
                'osfi-e23': 'osfi-e-23',
                'iso-42001': 'iso-42001',
                'mitre-atlas': 'mitre-atlas',
                'naic-ai': 'naic-ai',
              };
              const fwId = fwIdMap[fwTabId as string];
              if (fwId) {
                const fw = allFrameworks.find(f => f.id === fwId);
                if (fw) {
                  setSelectedFramework(fw.id);
                  setFrameworkViewMode('deep-dive');
                  setActiveTab('frameworks');
                }
              }
            }} />
          </div>
        ) : (
          <div id="tabpanel-frameworks" role="tabpanel" aria-labelledby="tab-frameworks" className="space-y-4">
            {/* Framework Selector - FIRST for easy access */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon name="document-check" className="w-4 h-4 text-blue-600" strokeWidth={2} />
                  <span className="text-sm font-semibold text-slate-800">Select Framework</span>
                  <span className="text-[10px] text-slate-500">({allFrameworks.length} available)</span>
                </div>
                <div className="flex items-center gap-2">
                  {apiLive ? (
                    <span className="text-[9px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE
                    </span>
                  ) : (
                    <span className="text-[9px] px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-semibold">
                      MOCK
                    </span>
                  )}
                  <button
                    onClick={() => { refreshAttestations(); refreshControlEvals(); }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={handleAutoDetection}
                    disabled={isAutoDetecting}
                    className="text-[10px] px-2 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors disabled:opacity-50"
                  >
                    {isAutoDetecting ? 'Detecting...' : <span className="inline-flex items-center gap-1"><Icon name="bolt" className="w-3 h-3" />Auto-Detect</span>}
                  </button>
                </div>
              </div>

              {/* Framework Grid */}
              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2"
                role="tablist"
                aria-label="Compliance frameworks"
              >
                {allFrameworks.map(fw => {
                  const fwControls = fw.categories.flatMap(c => c.controls);
                  const fwPass = fwControls.filter(c => c.status === 'pass').length;
                  const fwTotal = fwControls.filter(c => c.status !== 'not-started').length;
                  const fwPct = Math.round((fwPass / fwTotal) * 100) || 0;
                  const isSelected = selectedFramework === fw.id;
                  return (
                    <button
                      key={fw.id}
                      id={`framework-tab-${fw.id}`}
                      role="tab"
                      aria-selected={isSelected}
                      aria-controls={`framework-panel-${fw.id}`}
                      onClick={() => setSelectedFramework(fw.id)}
                      className={`px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-current shadow-md bg-white ring-2 ring-offset-1'
                          : 'border-slate-200 hover:border-slate-300 bg-white/60'
                      }`}
                      style={{
                        borderColor: isSelected ? fw.color : undefined,
                        ['--tw-ring-color' as string]: isSelected ? `${fw.color}40` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: fw.color }} />
                        <span className="text-xs font-semibold text-slate-900 truncate">{fw.shortName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{fwPass}/{fwTotal}</div>
                      <div className="w-full h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${fwPct}%`, backgroundColor: fw.color }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* View Mode Toggle: Checklist vs Deep Dive */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">View:</span>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                    <button
                      onClick={() => setFrameworkViewMode('checklist')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        frameworkViewMode === 'checklist'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon name="clipboard-document-list" className="w-3.5 h-3.5" strokeWidth={2} />
                        Checklist
                      </span>
                    </button>
                    <button
                      onClick={() => setFrameworkViewMode('deep-dive')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        frameworkViewMode === 'deep-dive'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon name="magnifying-glass-plus" className="w-3.5 h-3.5" strokeWidth={2} />
                        Deep Dive
                      </span>
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400">
                  {frameworkViewMode === 'checklist' ? 'Control status with attestation' : 'Detailed framework analysis'}
                </span>
              </div>
            </div>

            {/* Render based on view mode */}
            {frameworkViewMode === 'deep-dive' ? (
              /* Deep Dive Views */
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                {FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'nist' ? (
                  <NistAiRmfView embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'eu-ai-act' ? (
                  <EuAiActView embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'finos-air' ? (
                  <FinosAirView embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'owasp-llm' ? (
                  <OwaspLlmView embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'sr26' ? (
                  <Sr26MappingView embedded />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'cri-ai-rmf' ? (
                  <CriAiRmfView embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'osfi-e23' ? (
                  <OsfiE23View embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'iso-42001' ? (
                  <Iso42001View embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'mitre-atlas' ? (
                  <MitreAtlasView embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : FRAMEWORK_DEEP_DIVE_MAP[framework.id] === 'naic-ai' ? (
                  <NaicAiView embedded onNavigateToProgram={() => setActiveTab('program')} />
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    <Icon name="document-magnifying-glass" className="w-12 h-12 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
                    <div className="text-sm font-medium">Deep dive view not available</div>
                    <div className="text-xs mt-1">Switch to Checklist view to see controls</div>
                  </div>
                )}
              </div>
            ) : (
              /* Checklist View - show existing checklist UI */
              <>
                {/* Live Source Latencies - compact inline */}
            {controlEvalsLive && Object.keys(evalSources).length > 0 && (
              <div className="flex items-center gap-2 px-2">
                <span className="text-[9px] text-emerald-600 font-medium">AWS Sources:</span>
                {Object.entries(evalSources).map(([source, info]) => (
                  <span key={source} className={`text-[9px] px-1.5 py-0.5 rounded ${info.live ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {source} {info.live && <span className="text-emerald-500">{info.latency_ms}ms</span>}
                  </span>
                ))}
              </div>
            )}

            {/* AWS Config & Guardrails - Collapsible */}
            <details className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
              <summary className="px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="shield-check" className="w-4 h-4 text-violet-600" strokeWidth={2} />
                  <span className="text-sm font-semibold text-slate-800">AWS Config Rules & Bedrock Guardrails</span>
                </div>
                <span className="text-[10px] text-slate-400">Click to expand</span>
              </summary>
              <div className="px-4 pb-4">
                <ConfigGuardrailsSideBySide />
              </div>
            </details>

            {/* Cedar Policy Enforcement - Collapsible */}
            <details className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
              <summary className="px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="document-check" className="w-4 h-4 text-blue-600" strokeWidth={2} />
                  <span className="text-sm font-semibold text-slate-800">Cedar Policy Enforcement</span>
                </div>
                <span className="text-[10px] text-slate-400">Click to expand</span>
              </summary>
              <div className="px-4 pb-4">
                <PolicyObservability compact hours={24} maxEvents={5} />
              </div>
            </details>

            {/* Control Type Stats & Filter - Collapsible */}
            <details className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
              <summary className="px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="funnel" className="w-4 h-4 text-blue-600" strokeWidth={2} />
                  <span className="text-sm font-semibold text-slate-800">Control Type Filters & Stats</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {stats.pass}/{stats.total} passing
                  </span>
                  <span className="text-[10px] text-slate-400">Click to expand</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-700">Control Type Breakdown</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTimelineView(!showTimelineView)}
                      className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${showTimelineView ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      <span className="inline-flex items-center gap-1"><Icon name="calendar" className="w-3 h-3" />Timeline</span>
                    </button>
                    <button
                      onClick={() => setShowAuditHistory(!showAuditHistory)}
                      className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${showAuditHistory ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      <span className="inline-flex items-center gap-1"><Icon name="document-text" className="w-3 h-3" />Audit Log</span>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* All Types */}
                  <button
                    onClick={() => setFilterControlType('all')}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      filterControlType === 'all'
                        ? 'border-slate-400 bg-slate-50 ring-2 ring-slate-300'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">All Types</div>
                    <div className="text-xl font-bold text-slate-800">{stats.total}</div>
                    <div className="text-[10px] text-slate-500">{stats.pass} passing</div>
                  </button>
                  {/* Technical */}
                  <button
                    onClick={() => setFilterControlType(filterControlType === 'technical' ? 'all' : 'technical')}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      filterControlType === 'technical'
                        ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300'
                        : 'border-blue-200 bg-blue-50/50 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-blue-600 uppercase tracking-wide inline-flex items-center gap-1"><Icon name="bolt" className="w-3 h-3" />Technical</span>
                    </div>
                    <div className="text-xl font-bold text-blue-700">{typeStats.technical.passing}/{typeStats.technical.applicable}</div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 bg-blue-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${typeStats.technical.pct}%` }} />
                      </div>
                      <span className="text-[10px] text-blue-600 font-medium">{typeStats.technical.pct}%</span>
                    </div>
                  </button>
                  {/* Policy (Non-technical) */}
                  <button
                    onClick={() => setFilterControlType(filterControlType === 'non-technical' ? 'all' : 'non-technical')}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      filterControlType === 'non-technical'
                        ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-300'
                        : 'border-violet-200 bg-violet-50/50 hover:border-violet-300'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-violet-600 uppercase tracking-wide inline-flex items-center gap-1"><Icon name="clipboard-document-list" className="w-3 h-3" />Policy</span>
                    </div>
                    <div className="text-xl font-bold text-violet-700">{typeStats['non-technical'].passing}/{typeStats['non-technical'].applicable}</div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 bg-violet-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${typeStats['non-technical'].pct}%` }} />
                      </div>
                      <span className="text-[10px] text-violet-600 font-medium">{typeStats['non-technical'].pct}%</span>
                    </div>
                  </button>
                  {/* Hybrid */}
                  <button
                    onClick={() => setFilterControlType(filterControlType === 'hybrid' ? 'all' : 'hybrid')}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      filterControlType === 'hybrid'
                        ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-300'
                        : 'border-amber-200 bg-amber-50/50 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-amber-600 uppercase tracking-wide inline-flex items-center gap-1"><Icon name="arrows-right-left" className="w-3 h-3" />Hybrid</span>
                    </div>
                    <div className="text-xl font-bold text-amber-700">{typeStats.hybrid.passing}/{typeStats.hybrid.applicable}</div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 bg-amber-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${typeStats.hybrid.pct}%` }} />
                      </div>
                      <span className="text-[10px] text-amber-600 font-medium">{typeStats.hybrid.pct}%</span>
                    </div>
                  </button>
                </div>
                {filterControlType !== 'all' && (
                  <div className="mt-3 p-2 bg-slate-100 rounded-lg flex items-center justify-between">
                    <span className="text-xs text-slate-600">
                      Filtering by: <strong>{filterControlType === 'non-technical' ? 'Policy' : filterControlType}</strong> controls
                    </span>
                    <button
                      onClick={() => setFilterControlType('all')}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Clear filter
                    </button>
                  </div>
                )}
              </div>
            </details>

            {/* Timeline View - Due Dates */}
              {showTimelineView && (
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1"><Icon name="calendar" className="w-3.5 h-3.5" />Upcoming Due Dates</span>
                    <span className="text-[10px] text-slate-500">{upcomingDueDates.length} items</span>
                  </div>
                  {upcomingDueDates.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-sm">No upcoming due dates</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {upcomingDueDates.slice(0, 10).map((item, i) => (
                        <div
                          key={`${item.framework}-${item.control.id}-${i}`}
                          className={`p-2 rounded-lg border ${
                            item.daysUntil < 0
                              ? 'bg-rose-50 border-rose-200'
                              : item.daysUntil <= 7
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-mono">{item.control.id}</span>
                              <span className="text-xs text-slate-700 truncate max-w-xs">{item.control.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{item.framework}</span>
                              <span className={`text-xs font-semibold ${
                                item.daysUntil < 0 ? 'text-rose-600' : item.daysUntil <= 7 ? 'text-amber-600' : 'text-slate-600'
                              }`}>
                                {item.daysUntil < 0 ? `${Math.abs(item.daysUntil)}d overdue` : item.daysUntil === 0 ? 'Today' : `${item.daysUntil}d`}
                              </span>
                            </div>
                          </div>
                          {item.control.owner && (
                            <div className="text-[10px] text-slate-400 mt-1">Owner: {item.control.owner}</div>
                          )}
                        </div>
                      ))}
                      {upcomingDueDates.length > 10 && (
                        <div className="text-center text-[10px] text-slate-400 py-2">
                          + {upcomingDueDates.length - 10} more items
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Audit History */}
              {showAuditHistory && (
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
                      <Icon name="document-text" className="w-3.5 h-3.5" />Audit History
                      {auditLive
                        ? <LiveDataBadge source="Govern audit log" detail="Recent governance events from the control-plane audit log (guardrail / incident / approval / deployment / config / enforcement)" />
                        : <MockDataBadge integration="AWS Audit Manager change history" />}
                    </span>
                    <span className="text-[10px] text-slate-500">Recent changes</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {/* Live audit events when the Govern audit log has entries; illustrative demo rows otherwise. */}
                    {(auditLive
                      ? auditEvents.slice(0, 25).map(e => ({
                          action: e.action || e.category,
                          control: e.category,
                          from: '',
                          to: '',
                          detail: e.summary as string | undefined,
                          user: e.actor,
                          time: e.ts,
                          severity: e.severity as string | undefined,
                        }))
                      : [
                          // These rows are illustrative (MockDataBadge above), but they name
                          // controls in the `control` field, so they use the same ids a real
                          // attestation carries. 'GOVERN 1.1' and 'MEASURE 1.1' were the
                          // `section` strings of NIST-GV-1.1 / NIST-MS-1.1, not their ids —
                          // and the auto-detection row in particular showed an id the
                          // backend's cloudwatch probe does not write, while the two rows
                          // either side of it already used real ids.
                          { action: 'Status changed', control: 'NIST-GV-1.1', from: 'in-progress', to: 'pass', detail: undefined as string | undefined, user: 'greg.sorrels', time: '2 hours ago', severity: undefined as string | undefined },
                          { action: 'Evidence added', control: 'AIR-SEC-010', from: '', to: 'Guardrails config v2.1', detail: undefined as string | undefined, user: 'system', time: '5 hours ago', severity: undefined as string | undefined },
                          { action: 'Auto-detected', control: 'NIST-MS-1.1', from: 'not-started', to: 'pass', detail: undefined as string | undefined, user: 'aws-sync', time: '1 day ago', severity: undefined as string | undefined },
                          { action: 'Status changed', control: 'EU-TRANS-1', from: 'pass', to: 'in-progress', detail: undefined as string | undefined, user: 'compliance.team', time: '2 days ago', severity: undefined as string | undefined },
                        ]
                    ).map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className={`w-2 h-2 rounded-full ${
                          entry.severity === 'critical' || entry.severity === 'high' ? 'bg-rose-500' :
                          entry.severity === 'medium' ? 'bg-amber-500' :
                          entry.severity === 'low' ? 'bg-emerald-500' :
                          entry.action === 'Auto-detected' ? 'bg-blue-500' :
                          entry.to === 'pass' ? 'bg-emerald-500' :
                          entry.to === 'fail' ? 'bg-rose-500' : 'bg-amber-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-700">{entry.action}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-mono">{entry.control}</span>
                          </div>
                          {entry.from ? (
                            <div className="text-[10px] text-slate-500">
                              {entry.from} → {entry.to}
                            </div>
                          ) : entry.detail ? (
                            <div className="text-[10px] text-slate-500 truncate">{entry.detail}</div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500">{entry.user}</div>
                          <div className="text-[9px] text-slate-400">{entry.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Framework Header & Checklist */}
            <div
              id={`framework-panel-${framework.id}`}
              role="tabpanel"
              aria-labelledby={`framework-tab-${framework.id}`}
              className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: framework.color }}
                    />
                    <h2 className="text-lg font-semibold text-slate-900">{framework.name}</h2>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 max-w-2xl">{framework.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold" style={{ color: framework.color }}>{pct}%</div>
                  <div className="text-xs text-slate-500">compliant</div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-5 gap-3 mt-4">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`p-3 rounded-lg border transition-all ${filterStatus === 'all' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                >
                  <div className="text-xl font-bold text-slate-900">{stats.total}</div>
                  <div className="text-[10px] text-slate-500 uppercase">Total</div>
                </button>
                {(['pass', 'in-progress', 'fail', 'not-started'] as ControlStatus[]).map(status => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
                    className={`p-3 rounded-lg border transition-all ${filterStatus === status ? 'ring-2' : 'hover:bg-opacity-80'} ${STATUS_CONFIG[status].bgColor}`}
                    style={{ ['--tw-ring-color' as string]: STATUS_CONFIG[status].color }}
                  >
                    <div className="text-xl font-bold">{stats[status === 'in-progress' ? 'inProgress' : status === 'not-started' ? 'notStarted' : status]}</div>
                    <div className="text-[10px] uppercase">{STATUS_CONFIG[status].label}</div>
                  </button>
                ))}
              </div>

              {/* Critical Gaps Alert */}
              {(() => {
                const criticalGaps = mergedFramework.categories
                  .flatMap(c => c.controls)
                  .filter(c => c.status === 'fail' && (c.criticality === 'critical' || c.criticality === 'high'));
                if (criticalGaps.length === 0) return null;
                return (
                  <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-rose-700 uppercase flex items-center gap-1">
                        <Icon name="exclamation-triangle" className="w-3.5 h-3.5" /> Critical/High Gaps Requiring Attention
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">
                        {criticalGaps.length} gap{criticalGaps.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {criticalGaps.slice(0, 3).map(gap => (
                        <div key={gap.id} className="flex items-center gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${CRITICALITY_CONFIG[gap.criticality!].bgColor}`}>
                            {CRITICALITY_CONFIG[gap.criticality!].icon} {gap.criticality}
                          </span>
                          <span className="font-mono text-rose-600">{gap.id}</span>
                          <span className="text-rose-700 truncate">{gap.label}</span>
                        </div>
                      ))}
                      {criticalGaps.length > 3 && (
                        <div className="text-[10px] text-rose-500">+ {criticalGaps.length - 3} more critical gaps</div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {framework.lastAudit && (
                <div className="flex gap-6 mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
                  <div>Last audit: <span className="font-medium text-slate-700">{framework.lastAudit}</span></div>
                  {framework.nextAudit && <div>Next audit: <span className="font-medium text-slate-700">{framework.nextAudit}</span></div>}
                </div>
              )}
            </div>

            {/* Controls by Category */}
            <div className="space-y-4">
              {filteredCategories.length === 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
                  <div className="text-slate-400 text-lg mb-2">No controls match this filter</div>
                  <div className="text-sm text-slate-500">
                    Try selecting "All" to see all controls, or choose a different status filter.
                  </div>
                  <button
                    onClick={() => setFilterStatus('all')}
                    className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    Show All Controls
                  </button>
                </div>
              )}
              {filteredCategories.map(category => {
                const catStats = {
                  pass: category.controls.filter(c => c.status === 'pass').length,
                  total: category.controls.filter(c => c.status !== 'not-started').length,
                };
                const isExpanded = expandedCategories.has(category.name) || expandedCategories.size === 0;

                return (
                  <div key={category.name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category.name)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          name="chevron-right"
                          className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          strokeWidth={2}
                        />
                        <span className="text-sm font-semibold text-slate-900">{category.name}</span>
                        <span className="text-xs text-slate-400">({category.controls.length} controls)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{catStats.pass}/{catStats.total}</span>
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${catStats.total ? (catStats.pass / catStats.total) * 100 : 0}%`,
                              backgroundColor: framework.color,
                            }}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Controls List - Card Grid Layout */}
                    {isExpanded && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {category.controls.map(control => {
                          const state = controlStates[control.id] || { checked: false, notes: '' };
                          const statusConfig = STATUS_CONFIG[control.status];

                          return (
                            <div
                              key={control.id}
                              className={`p-4 rounded-xl border-2 transition-all ${
                                state.checked
                                  ? 'bg-emerald-50/50 border-emerald-200'
                                  : control.status === 'pass'
                                    ? 'bg-emerald-50/30 border-emerald-200/60'
                                    : control.status === 'fail'
                                      ? 'bg-rose-50/30 border-rose-200/60'
                                      : control.status === 'in-progress'
                                        ? 'bg-amber-50/30 border-amber-200/60'
                                        : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              {/* Header: Checkbox + ID + Criticality + Control Type + Status */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleControl(control.id)}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                      state.checked
                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                        : 'border-slate-300 hover:border-slate-400'
                                    }`}
                                  >
                                    {state.checked && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />}
                                  </button>
                                  <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{control.id}</span>
                                  {/* Criticality Badge */}
                                  {control.criticality && (
                                    <span
                                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${CRITICALITY_CONFIG[control.criticality].bgColor}`}
                                      title={`${CRITICALITY_CONFIG[control.criticality].label} priority control`}
                                    >
                                      {CRITICALITY_CONFIG[control.criticality].icon} {CRITICALITY_CONFIG[control.criticality].label}
                                    </span>
                                  )}
                                  {/* Control Type Badge */}
                                  {control.controlType && (
                                    <span
                                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${CONTROL_TYPE_CONFIG[control.controlType].bgColor}`}
                                      title={CONTROL_TYPE_CONFIG[control.controlType].description}
                                    >
                                      {control.controlType === 'technical' && <Icon name="bolt" className="w-3 h-3" />}
                                      {control.controlType === 'non-technical' && <Icon name="clipboard-document-list" className="w-3 h-3" />}
                                      {control.controlType === 'hybrid' && <Icon name="arrows-right-left" className="w-3 h-3" />}
                                      {CONTROL_TYPE_CONFIG[control.controlType].label}
                                    </span>
                                  )}
                                </div>
                                {/* Editable status dropdown */}
                                <select
                                  value={control.status}
                                  onChange={(e) => handleStatusChange(control.id, e.target.value as ControlStatus)}
                                  className={`text-[10px] font-semibold px-2 py-1 rounded border cursor-pointer ${statusConfig.bgColor}`}
                                  title="Click to change status"
                                >
                                  <option value="pass">✓ Compliant</option>
                                  <option value="in-progress">◐ In Progress</option>
                                  <option value="fail">✗ Gap</option>
                                  <option value="not-started">— N/A</option>
                                </select>
                              </div>

                              {/* Control Label */}
                              <div className="text-sm text-slate-800 mb-3 leading-relaxed">{control.label}</div>

                              {/* Metadata Grid */}
                              <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                                {control.owner && (
                                  <div>
                                    <span className="text-slate-400">Owner</span>
                                    <div className="text-slate-700 font-medium truncate">{control.owner}</div>
                                  </div>
                                )}
                                {control.lastReviewed && (
                                  <div>
                                    <span className="text-slate-400">Reviewed</span>
                                    <div className="text-slate-700">{control.lastReviewed}</div>
                                  </div>
                                )}
                                {control.dueDate && (
                                  <div>
                                    <span className="text-amber-500">Due Date</span>
                                    <div className="text-amber-700 font-medium">{control.dueDate}</div>
                                  </div>
                                )}
                                {control.autoDetectSource && (
                                  <div>
                                    <span className="text-blue-500 flex items-center gap-1">
                                      Auto-Detect Source
                                      {liveEvaluations.has(control.id) && (
                                        <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold uppercase">
                                          LIVE
                                        </span>
                                      )}
                                    </span>
                                    <div className="text-blue-700 font-medium flex items-center gap-1.5">
                                      {control.autoDetectSource}
                                      {liveEvaluations.has(control.id) && (
                                        <span className="text-[9px] text-emerald-600">
                                          ({Math.round((liveEvaluations.get(control.id)?.confidence || 0) * 100)}% confidence)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {control.evidence && (
                                  <div className="col-span-2">
                                    <span className="text-slate-400">Evidence</span>
                                    {control.evidenceLink ? (
                                      <a href={control.evidenceLink} className="block text-blue-600 hover:underline truncate">{control.evidence}</a>
                                    ) : (
                                      <div className="text-slate-600 truncate">{control.evidence}</div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Cross-Framework Impact */}
                              {crossFrameworkImpact[control.id] && crossFrameworkImpact[control.id].length > 1 && (
                                <div className="mb-3 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                                  <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium mb-1">
                                    <Icon name="check" className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                                    <span>Also satisfies {crossFrameworkImpact[control.id].length - 1} other framework{crossFrameworkImpact[control.id].length > 2 ? 's' : ''}:</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {crossFrameworkImpact[control.id]
                                      .filter(fw => fw !== framework.shortName && fw !== framework.name)
                                      .slice(0, 4)
                                      .map(fw => (
                                        <span
                                          key={fw}
                                          className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium"
                                        >
                                          {fw}
                                        </span>
                                      ))}
                                    {crossFrameworkImpact[control.id].length > 5 && (
                                      <span className="text-[9px] text-emerald-600">+{crossFrameworkImpact[control.id].length - 5} more</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Gap Remediation (for failed controls) */}
                              {control.status === 'fail' && (
                                <div className="mb-3 p-2 bg-rose-50 rounded-lg border border-rose-200">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-rose-700 font-semibold uppercase">Gap Remediation</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">Action Required</span>
                                  </div>
                                  <div className="text-[10px] text-rose-600 mb-2">
                                    This control requires remediation before the next audit cycle.
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      disabled
                                      title="Planned — not yet wired to a backend"
                                      className="text-[10px] px-2 py-1 bg-rose-600 text-white rounded opacity-50 cursor-not-allowed"
                                    >
                                      Create Remediation Task
                                    </button>
                                    <button
                                      disabled
                                      title="Planned — not yet wired to a backend"
                                      className="text-[10px] px-2 py-1 bg-white text-rose-600 border border-rose-300 rounded opacity-50 cursor-not-allowed"
                                    >
                                      Request Exception
                                    </button>
                                    <span className="text-[9px] text-slate-400 italic">(planned)</span>
                                  </div>
                                </div>
                              )}

                              {/* Notes Input */}
                              <textarea
                                placeholder="Add notes..."
                                value={state.notes}
                                onChange={(e) => updateNotes(control.id, e.target.value)}
                                className="w-full text-xs p-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80"
                                rows={1}
                                onFocus={(e) => e.target.rows = 3}
                                onBlur={(e) => { if (!e.target.value) e.target.rows = 1; }}
                              />

                              {/* Evidence Upload */}
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  disabled
                                  title="Planned — not yet wired to a backend"
                                  className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded opacity-50 cursor-not-allowed flex items-center gap-1"
                                >
                                  <Icon name="paper-clip" className="w-3 h-3" />
                                  Attach Evidence
                                </button>
                                <button
                                  disabled
                                  title="Planned — not yet wired to a backend"
                                  className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded opacity-50 cursor-not-allowed flex items-center gap-1"
                                >
                                  <Icon name="link" className="w-3 h-3" />
                                  Link Evidence
                                </button>
                                <span className="text-[9px] text-slate-400 italic">(planned)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Export Actions */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Export Compliance Status</div>
                  <div className="text-xs text-slate-500">Generate audit-ready documentation for {framework.shortName}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      exportComplianceCSV(mergedFramework, controlStates);
                      showToast(`${framework.shortName} exported to CSV`, 'success');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => {
                      generateComplianceReport(mergedFramework, controlStates);
                      showToast(`${framework.shortName} report generated`, 'success');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Generate Report
                  </button>
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        )}

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

      {/* Data Source Info Panel */}
      <DataSourceInfo
        pageId="compliance"
        pageTitle="Compliance Center"
        sources={getPageDataSources('compliance')}
      />
    </GovernPageLayout>
  );
}
