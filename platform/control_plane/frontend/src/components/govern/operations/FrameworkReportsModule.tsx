/**
 * FrameworkReportsModule - Comprehensive Regulatory Framework Compliance Reporting
 *
 * Deep-dive into each framework with:
 * - Full requirement breakdown by category/article
 * - Control mapping with evidence links
 * - Gap analysis with remediation guidance
 * - Report generation with customizable sections
 * - Export to PDF/DOCX/JSON
 * - Historical compliance trending
 * - Auditor view with evidence packages
 */

import { useState, useMemo, useEffect } from 'react';
import { Icon } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import CoreBadge from '../CoreBadge';
import Drawer from '../Drawer';
import { exportToPDF, exportToWord, exportToExcel, exportToJSON, FORMAT_CAPABILITIES } from './reportExport';
import { useFrameworkCompliance } from './useReportsLiveData';

// ============================================================================
// Types
// ============================================================================

type ComplianceStatus = 'compliant' | 'partial' | 'gap' | 'not-applicable';
type EvidenceStatus = 'verified' | 'pending-review' | 'missing' | 'expired';
type ReportFormat = 'pdf' | 'docx' | 'json' | 'csv';

interface Evidence {
  id: string;
  name: string;
  type: 'document' | 'screenshot' | 'log' | 'config' | 'test-result' | 'attestation';
  source: string;
  collectedAt: string;
  expiresAt?: string;
  status: EvidenceStatus;
  hash?: string;
  url?: string;
}

interface ControlMapping {
  controlId: string;
  controlName: string;
  controlCategory: 'platform' | 'policy' | 'guardrail' | 'custom';
  status: ComplianceStatus;
  evidence: Evidence[];
  lastTested: string;
  testResult: 'pass' | 'fail' | 'partial' | 'not-tested';
  notes?: string;
}

interface Requirement {
  id: string;
  article: string;
  title: string;
  description: string;
  category: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  status: ComplianceStatus;
  controlMappings: ControlMapping[];
  gapDescription?: string;
  remediationGuidance?: string;
  dueDate?: string;
  owner?: string;
}

interface RequirementCategory {
  id: string;
  name: string;
  description: string;
  requirements: Requirement[];
}

interface Framework {
  id: string;
  code: string;
  name: string;
  fullName: string;
  description: string;
  effectiveDate: string;
  version: string;
  regulatoryBody: string;
  jurisdiction: string;
  applicability: string[];
  categories: RequirementCategory[];
  overallScore: number;
  lastAssessment: string;
  nextAssessment: string;
  certificationStatus?: string;
}

interface GeneratedReport {
  id: string;
  frameworkId: string;
  frameworkName: string;
  title: string;
  generatedAt: string;
  generatedBy: string;
  format: ReportFormat;
  sections: string[];
  fileSize: string;
  downloadUrl: string;
}

// ============================================================================
// Mock Data - Comprehensive Framework Data
// ============================================================================

const MOCK_FRAMEWORKS: Framework[] = [
  {
    id: 'sr-26-2',
    code: 'SR 26-2',
    name: 'OCC Model Risk Management',
    fullName: 'Supervisory Letter SR 26-2: Third-Party AI Model Risk Management',
    description: 'Federal Reserve guidance on managing risks associated with third-party AI/ML models used in banking operations, extending SR 11-7 to AI-specific considerations.',
    effectiveDate: '2026-01-01',
    version: '1.0',
    regulatoryBody: 'Office of the Comptroller of the Currency (OCC)',
    jurisdiction: 'United States',
    applicability: ['Federally supervised banks', 'Financial holding companies', 'Savings associations'],
    overallScore: 82,
    lastAssessment: '2026-07-20',
    nextAssessment: '2026-10-20',
    certificationStatus: 'In Progress',
    categories: [
      {
        id: 'sr-gov',
        name: 'Model Governance',
        description: 'Board and senior management oversight of AI model risk',
        requirements: [
          {
            id: 'sr-26-2-1.1',
            article: '1.1',
            title: 'Board Oversight',
            description: 'The board of directors must approve the AI model risk management framework and receive regular reports on model risk exposure.',
            category: 'Governance',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-gov-001',
                controlName: 'Board AI Governance Charter',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-001', name: 'AI Governance Charter v3.0', type: 'document', source: 'PolicyHub', collectedAt: '2026-06-15', status: 'verified' },
                  { id: 'ev-002', name: 'Board Meeting Minutes - AI Review', type: 'document', source: 'BoardVantage', collectedAt: '2026-07-10', status: 'verified' },
                ],
                lastTested: '2026-07-15',
                testResult: 'pass',
              },
              {
                controlId: 'ctrl-gov-002',
                controlName: 'Quarterly Board Reporting',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-003', name: 'Q2 2026 AI Risk Report', type: 'document', source: 'ReportingPortal', collectedAt: '2026-07-05', status: 'verified' },
                ],
                lastTested: '2026-07-15',
                testResult: 'pass',
              },
            ],
            owner: 'Chief Risk Officer',
          },
          {
            id: 'sr-26-2-1.2',
            article: '1.2',
            title: 'Model Risk Management Policy',
            description: 'Banks must maintain a comprehensive policy addressing AI model development, validation, implementation, and ongoing monitoring.',
            category: 'Governance',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-gov-003',
                controlName: 'AI Model Risk Policy',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-004', name: 'AI MRM Policy v2.1', type: 'document', source: 'PolicyHub', collectedAt: '2026-05-20', status: 'verified' },
                ],
                lastTested: '2026-06-30',
                testResult: 'pass',
              },
            ],
            owner: 'Model Risk Management',
          },
          {
            id: 'sr-26-2-1.3',
            article: '1.3',
            title: 'Model Inventory',
            description: 'Maintain a complete inventory of all AI models including third-party models, with risk tiering and ownership assignment.',
            category: 'Governance',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-plat-001',
                controlName: 'Agent Registry',
                controlCategory: 'platform',
                status: 'compliant',
                evidence: [
                  { id: 'ev-005', name: 'AVA Agent Registry Export', type: 'config', source: 'AVA Platform', collectedAt: '2026-08-10', status: 'verified' },
                  { id: 'ev-006', name: 'Model Inventory Reconciliation', type: 'document', source: 'MRM Team', collectedAt: '2026-07-28', status: 'verified' },
                ],
                lastTested: '2026-08-01',
                testResult: 'pass',
              },
            ],
            owner: 'Model Risk Management',
          },
        ],
      },
      {
        id: 'sr-val',
        name: 'Model Validation',
        description: 'Independent validation of AI models before deployment and on ongoing basis',
        requirements: [
          {
            id: 'sr-26-2-2.1',
            article: '2.1',
            title: 'Pre-Deployment Validation',
            description: 'All AI models must undergo independent validation before production deployment, including conceptual soundness review and outcome analysis.',
            category: 'Validation',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-pol-001',
                controlName: 'Deployment Gate Policy',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-007', name: 'Model Validation Report - Customer Agent', type: 'document', source: 'MRM Portal', collectedAt: '2026-03-10', status: 'verified' },
                  { id: 'ev-008', name: 'Deployment Approval Workflow', type: 'screenshot', source: 'ServiceNow', collectedAt: '2026-03-12', status: 'verified' },
                ],
                lastTested: '2026-07-20',
                testResult: 'pass',
              },
            ],
            owner: 'Model Validation Team',
          },
          {
            id: 'sr-26-2-2.2',
            article: '2.2',
            title: 'Ongoing Monitoring',
            description: 'Continuous monitoring of model performance, including drift detection, bias monitoring, and outcome tracking.',
            category: 'Validation',
            riskLevel: 'high',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-pol-002',
                controlName: 'Model Drift Detection',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-009', name: 'CloudWatch Drift Alarms Config', type: 'config', source: 'AWS', collectedAt: '2026-08-05', status: 'verified' },
                ],
                lastTested: '2026-08-05',
                testResult: 'partial',
                notes: 'Drift thresholds not calibrated per risk tier',
              },
              {
                controlId: 'ctrl-cust-001',
                controlName: 'Bias Monitoring Dashboard',
                controlCategory: 'custom',
                status: 'partial',
                evidence: [
                  { id: 'ev-010', name: 'Bias Metrics Dashboard Screenshot', type: 'screenshot', source: 'Langfuse', collectedAt: '2026-07-30', status: 'pending-review' },
                ],
                lastTested: '2026-07-30',
                testResult: 'partial',
                notes: 'Protected class analysis pending for underwriting agent',
              },
            ],
            gapDescription: 'Drift detection thresholds not calibrated by risk tier. Bias monitoring incomplete for high-risk underwriting agent.',
            remediationGuidance: '1. Complete bias analysis for underwriting agent by 2026-08-30. 2. Calibrate drift thresholds per SR 26-2 Appendix B guidance.',
            dueDate: '2026-09-15',
            owner: 'Model Risk Management',
          },
          {
            id: 'sr-26-2-2.3',
            article: '2.3',
            title: 'Annual Revalidation',
            description: 'High-risk and critical models must be revalidated annually. Medium-risk models every 18 months.',
            category: 'Validation',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-pol-003',
                controlName: 'Revalidation Schedule',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-011', name: 'Revalidation Calendar 2026', type: 'document', source: 'MRM Portal', collectedAt: '2026-01-15', status: 'verified' },
                  { id: 'ev-012', name: 'Customer Agent Revalidation Report', type: 'document', source: 'MRM Portal', collectedAt: '2026-06-20', status: 'verified' },
                ],
                lastTested: '2026-07-01',
                testResult: 'pass',
              },
            ],
            owner: 'Model Validation Team',
          },
        ],
      },
      {
        id: 'sr-ctrl',
        name: 'Model Controls',
        description: 'Technical and operational controls for AI model risk mitigation',
        requirements: [
          {
            id: 'sr-26-2-3.1',
            article: '3.1',
            title: 'Input/Output Controls',
            description: 'Implement controls to prevent harmful inputs and outputs, including prompt injection defense and content filtering.',
            category: 'Controls',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-gr-001',
                controlName: 'Bedrock Guardrails',
                controlCategory: 'guardrail',
                status: 'compliant',
                evidence: [
                  { id: 'ev-013', name: 'Guardrail Configuration Export', type: 'config', source: 'AWS Bedrock', collectedAt: '2026-08-10', status: 'verified' },
                  { id: 'ev-014', name: 'Guardrail Effectiveness Report', type: 'test-result', source: 'Red Team', collectedAt: '2026-07-25', status: 'verified' },
                ],
                lastTested: '2026-07-25',
                testResult: 'pass',
              },
              {
                controlId: 'ctrl-gr-002',
                controlName: 'Prompt Injection Defense',
                controlCategory: 'guardrail',
                status: 'compliant',
                evidence: [
                  { id: 'ev-015', name: 'Injection Test Results', type: 'test-result', source: 'Security Team', collectedAt: '2026-08-01', status: 'verified' },
                ],
                lastTested: '2026-08-01',
                testResult: 'pass',
              },
            ],
            owner: 'AI Platform Team',
          },
          {
            id: 'sr-26-2-3.2',
            article: '3.2',
            title: 'Data Controls',
            description: 'Protect sensitive data used in model training and inference, including PII masking and data classification.',
            category: 'Controls',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-gr-003',
                controlName: 'PII Detection and Masking',
                controlCategory: 'guardrail',
                status: 'compliant',
                evidence: [
                  { id: 'ev-016', name: 'PII Filter Configuration', type: 'config', source: 'AWS Bedrock', collectedAt: '2026-08-10', status: 'verified' },
                  { id: 'ev-017', name: 'PII Test Results', type: 'test-result', source: 'Privacy Team', collectedAt: '2026-07-20', status: 'verified' },
                ],
                lastTested: '2026-07-20',
                testResult: 'pass',
              },
            ],
            owner: 'Data Privacy Team',
          },
          {
            id: 'sr-26-2-3.3',
            article: '3.3',
            title: 'Human Oversight',
            description: 'Ensure appropriate human oversight for high-risk decisions, including escalation paths and approval workflows.',
            category: 'Controls',
            riskLevel: 'high',
            status: 'gap',
            controlMappings: [
              {
                controlId: 'ctrl-pol-004',
                controlName: 'Human-in-the-Loop Policy',
                controlCategory: 'policy',
                status: 'gap',
                evidence: [],
                lastTested: '2026-07-01',
                testResult: 'fail',
                notes: 'HITL workflow not implemented for underwriting decisions',
              },
            ],
            gapDescription: 'Human-in-the-loop workflow not implemented for underwriting agent high-value decisions.',
            remediationGuidance: 'Implement HITL approval workflow for underwriting decisions above $100K using Step Functions. Reference playbook PB-005.',
            dueDate: '2026-09-30',
            owner: 'AI Platform Team',
          },
        ],
      },
      {
        id: 'sr-third',
        name: 'Third-Party Risk',
        description: 'Managing risks from third-party AI model providers',
        requirements: [
          {
            id: 'sr-26-2-4.1',
            article: '4.1',
            title: 'Vendor Due Diligence',
            description: 'Conduct thorough due diligence on third-party AI model providers, including security assessments and contractual protections.',
            category: 'Third-Party',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-pol-005',
                controlName: 'Vendor Assessment Process',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-018', name: 'Anthropic Vendor Assessment', type: 'document', source: 'TPRM Portal', collectedAt: '2026-02-15', status: 'verified' },
                  { id: 'ev-019', name: 'AWS Bedrock Security Review', type: 'document', source: 'TPRM Portal', collectedAt: '2026-01-20', status: 'verified' },
                ],
                lastTested: '2026-06-01',
                testResult: 'pass',
              },
            ],
            owner: 'Third-Party Risk Management',
          },
          {
            id: 'sr-26-2-4.2',
            article: '4.2',
            title: 'Concentration Risk',
            description: 'Assess and manage concentration risk from reliance on single AI model providers.',
            category: 'Third-Party',
            riskLevel: 'medium',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-plat-002',
                controlName: 'Multi-Model Fallback',
                controlCategory: 'platform',
                status: 'compliant',
                evidence: [
                  { id: 'ev-020', name: 'Model Fallback Configuration', type: 'config', source: 'AVA Platform', collectedAt: '2026-08-05', status: 'verified' },
                ],
                lastTested: '2026-08-05',
                testResult: 'pass',
              },
            ],
            owner: 'AI Platform Team',
          },
        ],
      },
    ],
  },
  {
    id: 'nist-ai-rmf',
    code: 'NIST AI RMF',
    name: 'AI Risk Management Framework',
    fullName: 'NIST AI Risk Management Framework 1.0',
    description: 'Voluntary framework to help organizations design, develop, deploy, and use AI systems in ways that are safe, secure, and trustworthy.',
    effectiveDate: '2023-01-26',
    version: '1.0',
    regulatoryBody: 'National Institute of Standards and Technology',
    jurisdiction: 'United States',
    applicability: ['All organizations using AI systems', 'Federal agencies (mandatory)', 'Critical infrastructure'],
    overallScore: 75,
    lastAssessment: '2026-07-18',
    nextAssessment: '2026-10-18',
    categories: [
      {
        id: 'nist-govern',
        name: 'GOVERN',
        description: 'Cultivate a culture of risk management within organizations designing, developing, deploying, or using AI systems',
        requirements: [
          {
            id: 'nist-gov-1.1',
            article: 'GOVERN 1.1',
            title: 'Legal and Regulatory Compliance',
            description: 'Legal and regulatory requirements involving AI are understood, managed, and documented.',
            category: 'Governance',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-gov-004',
                controlName: 'Regulatory Tracking',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-021', name: 'AI Regulatory Register', type: 'document', source: 'Legal', collectedAt: '2026-07-01', status: 'verified' },
                ],
                lastTested: '2026-07-15',
                testResult: 'pass',
              },
            ],
            owner: 'Legal & Compliance',
          },
          {
            id: 'nist-gov-1.2',
            article: 'GOVERN 1.2',
            title: 'Organizational AI Principles',
            description: 'The organization has established AI principles that inform policies and procedures.',
            category: 'Governance',
            riskLevel: 'medium',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-gov-005',
                controlName: 'AI Ethics Principles',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-022', name: 'AI Ethics Policy v2.0', type: 'document', source: 'PolicyHub', collectedAt: '2026-04-10', status: 'verified' },
                ],
                lastTested: '2026-06-01',
                testResult: 'pass',
              },
            ],
            owner: 'AI Ethics Committee',
          },
        ],
      },
      {
        id: 'nist-map',
        name: 'MAP',
        description: 'Establish context to frame risks related to an AI system',
        requirements: [
          {
            id: 'nist-map-1.1',
            article: 'MAP 1.1',
            title: 'Intended Purpose Documentation',
            description: 'Intended purposes, potentially beneficial uses, context of use, and AI system limitations are documented.',
            category: 'Mapping',
            riskLevel: 'medium',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-doc-001',
                controlName: 'Agent Documentation Standard',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-023', name: 'Customer Agent Use Case Doc', type: 'document', source: 'Confluence', collectedAt: '2026-05-20', status: 'verified' },
                ],
                lastTested: '2026-07-01',
                testResult: 'partial',
                notes: '2 of 5 agents missing limitation documentation',
              },
            ],
            gapDescription: 'Not all agents have complete documentation of limitations and intended use.',
            remediationGuidance: 'Complete limitation documentation for Internal KB and Claims Processing agents.',
            dueDate: '2026-09-01',
            owner: 'Product Management',
          },
        ],
      },
      {
        id: 'nist-measure',
        name: 'MEASURE',
        description: 'Employ quantitative, qualitative, or mixed-method tools to analyze, assess, benchmark, and monitor AI risk',
        requirements: [
          {
            id: 'nist-meas-2.1',
            article: 'MEASURE 2.1',
            title: 'Accuracy and Performance',
            description: 'AI system accuracy and performance are measured and documented.',
            category: 'Measurement',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-obs-001',
                controlName: 'Performance Monitoring',
                controlCategory: 'platform',
                status: 'compliant',
                evidence: [
                  { id: 'ev-024', name: 'Langfuse Dashboard Export', type: 'screenshot', source: 'Langfuse', collectedAt: '2026-08-10', status: 'verified' },
                ],
                lastTested: '2026-08-10',
                testResult: 'pass',
              },
            ],
            owner: 'MLOps Team',
          },
          {
            id: 'nist-meas-2.5',
            article: 'MEASURE 2.5',
            title: 'Fairness Assessment',
            description: 'AI system fairness and bias are regularly evaluated across relevant demographic groups.',
            category: 'Measurement',
            riskLevel: 'critical',
            status: 'gap',
            controlMappings: [
              {
                controlId: 'ctrl-fair-001',
                controlName: 'Bias Testing Framework',
                controlCategory: 'custom',
                status: 'gap',
                evidence: [],
                lastTested: '2026-06-15',
                testResult: 'fail',
                notes: 'No automated bias testing in place',
              },
            ],
            gapDescription: 'Automated bias testing framework not implemented.',
            remediationGuidance: 'Implement SageMaker Clarify for bias detection. Priority for underwriting agent.',
            dueDate: '2026-10-01',
            owner: 'Data Science Team',
          },
        ],
      },
      {
        id: 'nist-manage',
        name: 'MANAGE',
        description: 'Allocate risk resources based on assessed risks and their impacts',
        requirements: [
          {
            id: 'nist-man-1.1',
            article: 'MANAGE 1.1',
            title: 'Risk Treatment Plans',
            description: 'Processes are in place to prioritize and treat documented AI risks.',
            category: 'Management',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-risk-001',
                controlName: 'AI Risk Register',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-025', name: 'AI Risk Register Q2 2026', type: 'document', source: 'ServiceNow', collectedAt: '2026-07-05', status: 'verified' },
                ],
                lastTested: '2026-07-10',
                testResult: 'pass',
              },
            ],
            owner: 'Risk Management',
          },
        ],
      },
    ],
  },
  {
    id: 'eu-ai-act',
    code: 'EU AI Act',
    name: 'European AI Regulation',
    fullName: 'Regulation (EU) 2024/1689 - Artificial Intelligence Act',
    description: 'First comprehensive AI law establishing requirements for high-risk AI systems operating in the European Union.',
    effectiveDate: '2026-08-02',
    version: '2024/1689',
    regulatoryBody: 'European Commission',
    jurisdiction: 'European Union',
    applicability: ['Providers of high-risk AI systems', 'Deployers in EU market', 'Operators regardless of location if affecting EU persons'],
    overallScore: 68,
    lastAssessment: '2026-07-15',
    nextAssessment: '2026-10-15',
    categories: [
      {
        id: 'eu-art9',
        name: 'Article 9 - Risk Management',
        description: 'Risk management system requirements for high-risk AI',
        requirements: [
          {
            id: 'eu-art9-1',
            article: 'Art. 9(1)',
            title: 'Risk Management System',
            description: 'Establish, implement, document and maintain a risk management system for high-risk AI systems.',
            category: 'Risk Management',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-eu-001',
                controlName: 'EU AI RMS Documentation',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-026', name: 'EU AI Act RMS Document', type: 'document', source: 'Compliance', collectedAt: '2026-06-01', status: 'verified' },
                ],
                lastTested: '2026-07-01',
                testResult: 'pass',
              },
            ],
            owner: 'EU Compliance Team',
          },
          {
            id: 'eu-art9-2',
            article: 'Art. 9(2)',
            title: 'Continuous Iteration',
            description: 'Risk management system shall be a continuous iterative process planned and run throughout the entire lifecycle.',
            category: 'Risk Management',
            riskLevel: 'high',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-eu-002',
                controlName: 'Lifecycle Risk Reviews',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-027', name: 'Risk Review Schedule', type: 'document', source: 'Compliance', collectedAt: '2026-05-15', status: 'verified' },
                ],
                lastTested: '2026-06-30',
                testResult: 'partial',
                notes: 'Post-market monitoring process not fully documented',
              },
            ],
            gapDescription: 'Post-market monitoring and iteration process incomplete.',
            remediationGuidance: 'Document post-market monitoring procedures per Art. 72.',
            dueDate: '2026-08-30',
            owner: 'EU Compliance Team',
          },
        ],
      },
      {
        id: 'eu-art10',
        name: 'Article 10 - Data Governance',
        description: 'Data and data governance requirements for training, validation, and testing',
        requirements: [
          {
            id: 'eu-art10-2',
            article: 'Art. 10(2)',
            title: 'Data Quality',
            description: 'Training, validation and testing data sets shall be relevant, sufficiently representative, and free of errors.',
            category: 'Data Governance',
            riskLevel: 'critical',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-data-001',
                controlName: 'Data Quality Framework',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-028', name: 'Data Quality Policy', type: 'document', source: 'Data Team', collectedAt: '2026-04-20', status: 'verified' },
                ],
                lastTested: '2026-06-15',
                testResult: 'partial',
                notes: 'KB data quality validation not automated',
              },
            ],
            gapDescription: 'Automated data quality validation not implemented for knowledge bases.',
            remediationGuidance: 'Implement data quality checks in KB sync pipeline.',
            dueDate: '2026-09-15',
            owner: 'Data Engineering',
          },
        ],
      },
      {
        id: 'eu-art14',
        name: 'Article 14 - Human Oversight',
        description: 'Human oversight measures for high-risk AI systems',
        requirements: [
          {
            id: 'eu-art14-1',
            article: 'Art. 14(1)',
            title: 'Human Oversight Design',
            description: 'High-risk AI systems shall be designed to be effectively overseen by natural persons.',
            category: 'Human Oversight',
            riskLevel: 'critical',
            status: 'gap',
            controlMappings: [
              {
                controlId: 'ctrl-hitl-001',
                controlName: 'Human Oversight Interface',
                controlCategory: 'platform',
                status: 'gap',
                evidence: [],
                lastTested: '2026-07-01',
                testResult: 'fail',
                notes: 'No dedicated human oversight interface for intervention',
              },
            ],
            gapDescription: 'No dedicated human oversight interface allowing intervention during AI operation.',
            remediationGuidance: 'Build human oversight dashboard with real-time intervention capability.',
            dueDate: '2026-10-01',
            owner: 'AI Platform Team',
          },
        ],
      },
      {
        id: 'eu-art73',
        name: 'Article 73 - Incident Reporting',
        description: 'Serious incident reporting requirements',
        requirements: [
          {
            id: 'eu-art73-1',
            article: 'Art. 73(1)',
            title: 'Serious Incident Reporting',
            description: 'Report serious incidents to market surveillance authorities within 15 days of becoming aware.',
            category: 'Incident Reporting',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-inc-001',
                controlName: 'EU Incident Reporting Process',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-029', name: 'EU Incident Response Plan', type: 'document', source: 'Compliance', collectedAt: '2026-06-10', status: 'verified' },
                  { id: 'ev-030', name: 'Incident Reporting Template', type: 'document', source: 'Compliance', collectedAt: '2026-06-10', status: 'verified' },
                ],
                lastTested: '2026-07-15',
                testResult: 'pass',
              },
            ],
            owner: 'EU Compliance Team',
          },
        ],
      },
    ],
  },
  {
    id: 'iso-42001',
    code: 'ISO 42001',
    name: 'AI Management System',
    fullName: 'ISO/IEC 42001:2023 - Artificial Intelligence Management System',
    description: 'International standard specifying requirements for establishing, implementing, maintaining and improving an AI management system.',
    effectiveDate: '2023-12-18',
    version: '2023',
    regulatoryBody: 'International Organization for Standardization',
    jurisdiction: 'International',
    applicability: ['Organizations developing AI', 'Organizations deploying AI', 'Organizations seeking certification'],
    overallScore: 71,
    lastAssessment: '2026-07-19',
    nextAssessment: '2026-10-19',
    certificationStatus: 'Planned for Q4 2026',
    categories: [
      {
        id: 'iso-4',
        name: 'Clause 4 - Context',
        description: 'Understanding the organization and its context',
        requirements: [
          {
            id: 'iso-4.1',
            article: '4.1',
            title: 'Understanding the Organization',
            description: 'Determine external and internal issues relevant to AI management system.',
            category: 'Context',
            riskLevel: 'medium',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-iso-001',
                controlName: 'Context Analysis Document',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-031', name: 'AIMS Context Analysis', type: 'document', source: 'ISMS Portal', collectedAt: '2026-05-01', status: 'verified' },
                ],
                lastTested: '2026-06-01',
                testResult: 'pass',
              },
            ],
            owner: 'Quality Management',
          },
        ],
      },
      {
        id: 'iso-5',
        name: 'Clause 5 - Leadership',
        description: 'Leadership and commitment requirements',
        requirements: [
          {
            id: 'iso-5.1',
            article: '5.1',
            title: 'Leadership and Commitment',
            description: 'Top management shall demonstrate leadership and commitment to the AI management system.',
            category: 'Leadership',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-iso-002',
                controlName: 'Executive AI Steering Committee',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-032', name: 'AI Steering Committee Charter', type: 'document', source: 'Governance', collectedAt: '2026-03-15', status: 'verified' },
                  { id: 'ev-033', name: 'Q2 Steering Committee Minutes', type: 'document', source: 'Governance', collectedAt: '2026-06-30', status: 'verified' },
                ],
                lastTested: '2026-07-01',
                testResult: 'pass',
              },
            ],
            owner: 'CTO Office',
          },
        ],
      },
      {
        id: 'iso-8',
        name: 'Clause 8 - Operation',
        description: 'Operational planning and control',
        requirements: [
          {
            id: 'iso-8.4',
            article: '8.4',
            title: 'AI System Impact Assessment',
            description: 'Conduct impact assessment considering individuals, groups, and society.',
            category: 'Operation',
            riskLevel: 'critical',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-iso-003',
                controlName: 'AI Impact Assessment Process',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-034', name: 'Impact Assessment Template', type: 'document', source: 'Compliance', collectedAt: '2026-04-01', status: 'verified' },
                ],
                lastTested: '2026-06-15',
                testResult: 'partial',
                notes: 'Impact assessments not completed for all high-risk agents',
              },
            ],
            gapDescription: 'Impact assessments incomplete for 2 high-risk agents.',
            remediationGuidance: 'Complete impact assessments for Underwriting and Claims agents.',
            dueDate: '2026-09-01',
            owner: 'AI Ethics Committee',
          },
        ],
      },
    ],
  },
  {
    id: 'cri-fs-ai',
    code: 'CRI FS AI',
    name: 'Financial Services AI Profile',
    fullName: 'Cloud Risk Institute Financial Services AI Risk Profile v1.0',
    description: 'Industry-specific AI risk management profile for financial services, addressing cloud-hosted AI systems, third-party model risk, and FSI regulatory alignment.',
    effectiveDate: '2025-06-01',
    version: '1.0',
    regulatoryBody: 'Cloud Risk Institute',
    jurisdiction: 'Global (FSI Focus)',
    applicability: ['Banks and credit unions', 'Insurance companies', 'Asset managers', 'Payment processors', 'FinTech providers'],
    overallScore: 76,
    lastAssessment: '2026-08-01',
    nextAssessment: '2026-11-01',
    certificationStatus: 'Self-Assessment Complete',
    categories: [
      {
        id: 'cri-gov',
        name: 'AI Governance (GOV)',
        description: 'Board-level oversight and organizational accountability for AI systems',
        requirements: [
          {
            id: 'cri-gov-1',
            article: 'GOV-1',
            title: 'AI Strategy and Policy',
            description: 'Establish board-approved AI strategy aligned with business objectives and risk appetite. Document policies covering AI development, deployment, and use.',
            category: 'Governance',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-001',
                controlName: 'AI Strategy Document',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-001', name: 'Enterprise AI Strategy 2026', type: 'document', source: 'Strategy Office', collectedAt: '2026-01-15', status: 'verified' },
                  { id: 'ev-cri-002', name: 'Board AI Strategy Approval', type: 'document', source: 'BoardVantage', collectedAt: '2026-01-20', status: 'verified' },
                ],
                lastTested: '2026-07-15',
                testResult: 'pass',
              },
            ],
            owner: 'Chief AI Officer',
          },
          {
            id: 'cri-gov-2',
            article: 'GOV-2',
            title: 'AI Risk Appetite',
            description: 'Define and document AI-specific risk appetite statements covering model risk, third-party AI risk, and operational AI risk.',
            category: 'Governance',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-002',
                controlName: 'AI Risk Appetite Statement',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-003', name: 'AI Risk Appetite Framework', type: 'document', source: 'Risk Management', collectedAt: '2026-02-10', status: 'verified' },
                ],
                lastTested: '2026-06-30',
                testResult: 'pass',
              },
            ],
            owner: 'Chief Risk Officer',
          },
          {
            id: 'cri-gov-3',
            article: 'GOV-3',
            title: 'AI Accountability Structure',
            description: 'Establish clear accountability for AI systems including designated AI owner, model owner, and business owner for each AI application.',
            category: 'Governance',
            riskLevel: 'high',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-cri-003',
                controlName: 'AI RACI Matrix',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-cri-004', name: 'AI Ownership RACI', type: 'document', source: 'Governance', collectedAt: '2026-04-01', status: 'verified' },
                ],
                lastTested: '2026-07-01',
                testResult: 'partial',
                notes: 'RACI incomplete for 3 recently deployed agents',
              },
            ],
            gapDescription: 'Accountability matrix not updated for recently deployed AI agents.',
            remediationGuidance: 'Update RACI matrix to include Customer Service Agent, Claims Assistant, and Internal KB Agent.',
            dueDate: '2026-09-15',
            owner: 'AI Governance Office',
          },
        ],
      },
      {
        id: 'cri-cloud',
        name: 'Cloud AI Infrastructure (CLOUD)',
        description: 'Security and resilience requirements for cloud-hosted AI systems',
        requirements: [
          {
            id: 'cri-cloud-1',
            article: 'CLOUD-1',
            title: 'Cloud AI Architecture Review',
            description: 'Conduct architecture review of cloud AI deployments ensuring alignment with FSI security requirements and data residency obligations.',
            category: 'Infrastructure',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-004',
                controlName: 'Cloud Architecture Review',
                controlCategory: 'platform',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-005', name: 'AWS Bedrock Architecture Review', type: 'document', source: 'Architecture Team', collectedAt: '2026-03-15', status: 'verified' },
                  { id: 'ev-cri-006', name: 'Data Residency Compliance Check', type: 'test-result', source: 'Compliance', collectedAt: '2026-05-20', status: 'verified' },
                ],
                lastTested: '2026-07-10',
                testResult: 'pass',
              },
            ],
            owner: 'Cloud Architecture Team',
          },
          {
            id: 'cri-cloud-2',
            article: 'CLOUD-2',
            title: 'AI Workload Isolation',
            description: 'Implement network and compute isolation for AI workloads handling sensitive financial data.',
            category: 'Infrastructure',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-005',
                controlName: 'VPC Isolation for AI Agents',
                controlCategory: 'platform',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-007', name: 'VPC Configuration Export', type: 'config', source: 'AWS', collectedAt: '2026-08-01', status: 'verified' },
                  { id: 'ev-cri-008', name: 'Network Segmentation Diagram', type: 'document', source: 'Network Team', collectedAt: '2026-06-15', status: 'verified' },
                ],
                lastTested: '2026-08-01',
                testResult: 'pass',
              },
            ],
            owner: 'Cloud Security Team',
          },
          {
            id: 'cri-cloud-3',
            article: 'CLOUD-3',
            title: 'AI Service Continuity',
            description: 'Establish business continuity and disaster recovery plans for AI systems supporting critical business functions.',
            category: 'Infrastructure',
            riskLevel: 'high',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-cri-006',
                controlName: 'AI DR Plan',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-cri-009', name: 'AI BCP/DR Plan', type: 'document', source: 'BCM Team', collectedAt: '2026-04-01', status: 'pending-review' },
                ],
                lastTested: '2026-06-15',
                testResult: 'partial',
                notes: 'DR plan exists but not tested for AI-specific scenarios',
              },
            ],
            gapDescription: 'AI-specific disaster recovery scenarios not tested.',
            remediationGuidance: 'Conduct tabletop DR exercise for AI agent failover scenario.',
            dueDate: '2026-10-01',
            owner: 'Business Continuity Management',
          },
        ],
      },
      {
        id: 'cri-tprm',
        name: 'Third-Party AI Risk (TPRM)',
        description: 'Managing risks from third-party AI model providers and AI-as-a-Service',
        requirements: [
          {
            id: 'cri-tprm-1',
            article: 'TPRM-1',
            title: 'AI Vendor Due Diligence',
            description: 'Conduct enhanced due diligence on AI/ML model providers including assessment of model development practices, data handling, and security controls.',
            category: 'Third-Party',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-007',
                controlName: 'AI Vendor Assessment Framework',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-010', name: 'Anthropic Due Diligence Report', type: 'document', source: 'TPRM', collectedAt: '2026-02-15', status: 'verified' },
                  { id: 'ev-cri-011', name: 'AWS AI Services Assessment', type: 'document', source: 'TPRM', collectedAt: '2026-01-20', status: 'verified' },
                  { id: 'ev-cri-012', name: 'AI Vendor Questionnaire Template', type: 'document', source: 'TPRM', collectedAt: '2026-01-05', status: 'verified' },
                ],
                lastTested: '2026-07-20',
                testResult: 'pass',
              },
            ],
            owner: 'Third-Party Risk Management',
          },
          {
            id: 'cri-tprm-2',
            article: 'TPRM-2',
            title: 'AI Model Provenance',
            description: 'Maintain documentation of AI model provenance including training data sources, model versioning, and change history for all third-party models.',
            category: 'Third-Party',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-008',
                controlName: 'Model Provenance Registry',
                controlCategory: 'platform',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-013', name: 'AVA Model Registry Export', type: 'config', source: 'AVA Platform', collectedAt: '2026-08-10', status: 'verified' },
                  { id: 'ev-cri-014', name: 'Model Version History', type: 'document', source: 'MLOps', collectedAt: '2026-07-30', status: 'verified' },
                ],
                lastTested: '2026-08-05',
                testResult: 'pass',
              },
            ],
            owner: 'MLOps Team',
          },
          {
            id: 'cri-tprm-3',
            article: 'TPRM-3',
            title: 'AI Concentration Risk',
            description: 'Assess and manage concentration risk from reliance on single AI providers or models for critical business functions.',
            category: 'Third-Party',
            riskLevel: 'medium',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-009',
                controlName: 'AI Concentration Analysis',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-015', name: 'AI Provider Concentration Report', type: 'document', source: 'Risk Management', collectedAt: '2026-06-15', status: 'verified' },
                  { id: 'ev-cri-016', name: 'Model Fallback Configuration', type: 'config', source: 'AVA Platform', collectedAt: '2026-08-01', status: 'verified' },
                ],
                lastTested: '2026-07-15',
                testResult: 'pass',
              },
            ],
            owner: 'Third-Party Risk Management',
          },
        ],
      },
      {
        id: 'cri-data',
        name: 'AI Data Management (DATA)',
        description: 'Data governance requirements specific to AI/ML systems in financial services',
        requirements: [
          {
            id: 'cri-data-1',
            article: 'DATA-1',
            title: 'AI Training Data Governance',
            description: 'Establish governance over data used for AI training including data quality, lineage, and consent management.',
            category: 'Data',
            riskLevel: 'critical',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-cri-010',
                controlName: 'Training Data Governance Policy',
                controlCategory: 'policy',
                status: 'partial',
                evidence: [
                  { id: 'ev-cri-017', name: 'AI Data Governance Policy', type: 'document', source: 'Data Office', collectedAt: '2026-03-01', status: 'verified' },
                ],
                lastTested: '2026-06-30',
                testResult: 'partial',
                notes: 'Policy exists but lineage tracking not fully implemented for RAG data',
              },
            ],
            gapDescription: 'Data lineage tracking not implemented for Knowledge Base content.',
            remediationGuidance: 'Implement data lineage tracking in KB sync pipeline using AWS Glue Data Catalog.',
            dueDate: '2026-10-15',
            owner: 'Chief Data Officer',
          },
          {
            id: 'cri-data-2',
            article: 'DATA-2',
            title: 'Sensitive Data in AI',
            description: 'Implement controls to identify, classify, and protect sensitive financial data processed by AI systems.',
            category: 'Data',
            riskLevel: 'critical',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-011',
                controlName: 'PII Detection in AI Pipelines',
                controlCategory: 'guardrail',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-018', name: 'Guardrail PII Config', type: 'config', source: 'AWS Bedrock', collectedAt: '2026-08-10', status: 'verified' },
                  { id: 'ev-cri-019', name: 'Macie Findings Report', type: 'test-result', source: 'AWS Macie', collectedAt: '2026-07-25', status: 'verified' },
                ],
                lastTested: '2026-07-25',
                testResult: 'pass',
              },
            ],
            owner: 'Data Privacy Team',
          },
          {
            id: 'cri-data-3',
            article: 'DATA-3',
            title: 'AI Output Data Integrity',
            description: 'Ensure integrity and accuracy of AI-generated outputs used in financial decision-making.',
            category: 'Data',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-012',
                controlName: 'Output Grounding Validation',
                controlCategory: 'guardrail',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-020', name: 'Grounding Check Configuration', type: 'config', source: 'AWS Bedrock', collectedAt: '2026-08-05', status: 'verified' },
                  { id: 'ev-cri-021', name: 'Hallucination Test Results', type: 'test-result', source: 'QA Team', collectedAt: '2026-07-20', status: 'verified' },
                ],
                lastTested: '2026-07-20',
                testResult: 'pass',
              },
            ],
            owner: 'AI Quality Team',
          },
        ],
      },
      {
        id: 'cri-fair',
        name: 'AI Fairness (FAIR)',
        description: 'Fair lending and non-discrimination requirements for AI in financial services',
        requirements: [
          {
            id: 'cri-fair-1',
            article: 'FAIR-1',
            title: 'Fair Lending AI Assessment',
            description: 'Assess AI models used in lending decisions for fair lending compliance including disparate impact analysis.',
            category: 'Fairness',
            riskLevel: 'critical',
            status: 'gap',
            controlMappings: [
              {
                controlId: 'ctrl-cri-013',
                controlName: 'Fair Lending AI Testing',
                controlCategory: 'custom',
                status: 'gap',
                evidence: [],
                lastTested: '2026-06-01',
                testResult: 'fail',
                notes: 'Disparate impact analysis not performed for underwriting agent',
              },
            ],
            gapDescription: 'Fair lending analysis not completed for AI-assisted underwriting decisions.',
            remediationGuidance: 'Implement disparate impact testing using SageMaker Clarify. Engage Fair Lending team for methodology review.',
            dueDate: '2026-09-30',
            owner: 'Fair Lending Officer',
          },
          {
            id: 'cri-fair-2',
            article: 'FAIR-2',
            title: 'Bias Monitoring',
            description: 'Implement ongoing bias monitoring for AI systems with regular reporting to risk committees.',
            category: 'Fairness',
            riskLevel: 'critical',
            status: 'partial',
            controlMappings: [
              {
                controlId: 'ctrl-cri-014',
                controlName: 'Bias Monitoring Dashboard',
                controlCategory: 'platform',
                status: 'partial',
                evidence: [
                  { id: 'ev-cri-022', name: 'Bias Metrics Dashboard', type: 'screenshot', source: 'AVA Platform', collectedAt: '2026-07-30', status: 'verified' },
                ],
                lastTested: '2026-07-30',
                testResult: 'partial',
                notes: 'Dashboard exists but not all protected classes monitored',
              },
            ],
            gapDescription: 'Bias monitoring incomplete - not all protected classes tracked.',
            remediationGuidance: 'Extend bias monitoring to cover age, disability status, and geographic location.',
            dueDate: '2026-10-15',
            owner: 'Model Risk Management',
          },
          {
            id: 'cri-fair-3',
            article: 'FAIR-3',
            title: 'AI Explainability for Customers',
            description: 'Provide clear explanations to customers for AI-influenced decisions, particularly adverse actions.',
            category: 'Fairness',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-015',
                controlName: 'Adverse Action Explanation Generation',
                controlCategory: 'custom',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-023', name: 'Adverse Action Letter Templates', type: 'document', source: 'Compliance', collectedAt: '2026-05-15', status: 'verified' },
                  { id: 'ev-cri-024', name: 'Explainability Module Test', type: 'test-result', source: 'QA', collectedAt: '2026-06-20', status: 'verified' },
                ],
                lastTested: '2026-06-20',
                testResult: 'pass',
              },
            ],
            owner: 'Customer Communications',
          },
        ],
      },
      {
        id: 'cri-ops',
        name: 'AI Operations (OPS)',
        description: 'Operational resilience and incident management for AI systems',
        requirements: [
          {
            id: 'cri-ops-1',
            article: 'OPS-1',
            title: 'AI Incident Response',
            description: 'Establish AI-specific incident response procedures including escalation paths for AI failures and misuse.',
            category: 'Operations',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-016',
                controlName: 'AI Incident Response Plan',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-025', name: 'AI Incident Response Playbook', type: 'document', source: 'Security', collectedAt: '2026-04-01', status: 'verified' },
                  { id: 'ev-cri-026', name: 'AI Incident Tabletop Exercise', type: 'document', source: 'BCM', collectedAt: '2026-06-15', status: 'verified' },
                ],
                lastTested: '2026-06-15',
                testResult: 'pass',
              },
            ],
            owner: 'Security Operations',
          },
          {
            id: 'cri-ops-2',
            article: 'OPS-2',
            title: 'AI Performance Monitoring',
            description: 'Implement real-time monitoring of AI system performance including latency, accuracy, and availability metrics.',
            category: 'Operations',
            riskLevel: 'medium',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-017',
                controlName: 'AI Observability Stack',
                controlCategory: 'platform',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-027', name: 'CloudWatch AI Dashboards', type: 'screenshot', source: 'AWS', collectedAt: '2026-08-10', status: 'verified' },
                  { id: 'ev-cri-028', name: 'Langfuse Integration Config', type: 'config', source: 'MLOps', collectedAt: '2026-07-15', status: 'verified' },
                ],
                lastTested: '2026-08-10',
                testResult: 'pass',
              },
            ],
            owner: 'SRE Team',
          },
          {
            id: 'cri-ops-3',
            article: 'OPS-3',
            title: 'AI Change Management',
            description: 'Implement change management controls for AI model updates including approval workflows and rollback procedures.',
            category: 'Operations',
            riskLevel: 'high',
            status: 'compliant',
            controlMappings: [
              {
                controlId: 'ctrl-cri-018',
                controlName: 'AI Model Change Process',
                controlCategory: 'policy',
                status: 'compliant',
                evidence: [
                  { id: 'ev-cri-029', name: 'Model Change Approval Workflow', type: 'screenshot', source: 'ServiceNow', collectedAt: '2026-07-01', status: 'verified' },
                  { id: 'ev-cri-030', name: 'Model Rollback Procedure', type: 'document', source: 'MLOps', collectedAt: '2026-05-20', status: 'verified' },
                ],
                lastTested: '2026-07-15',
                testResult: 'pass',
              },
            ],
            owner: 'Change Advisory Board',
          },
        ],
      },
    ],
  },
];

// MOCK_GENERATED_REPORTS was removed here. It seeded the Recent Reports card with six
// invented reports carrying named authors ("Sarah Chen"), precise timestamps and precise
// file sizes ("2.4 MB"), rendered without a badge - so it read as a real report history.
// Nothing persists generated reports; they download straight to the user's machine. The
// card now starts empty and says so. This also removed a second problem: re-downloading a
// historical row regenerated a fresh document but stamped it with that row's author and
// today's date, attributing a new artifact to someone who did not produce it.

// ============================================================================
// Styling Constants
// ============================================================================

const STATUS_CONFIG: Record<ComplianceStatus, { bg: string; text: string; label: string; icon: string }> = {
  compliant: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Compliant', icon: 'check-circle' },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Partial', icon: 'exclamation-circle' },
  gap: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Gap', icon: 'x-circle' },
  'not-applicable': { bg: 'bg-slate-100', text: 'text-slate-500', label: 'N/A', icon: 'minus-circle' },
};

const RISK_CONFIG: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600' },
};

const EVIDENCE_STATUS_CONFIG: Record<EvidenceStatus, { bg: string; text: string }> = {
  verified: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'pending-review': { bg: 'bg-amber-100', text: 'text-amber-700' },
  missing: { bg: 'bg-rose-100', text: 'text-rose-700' },
  expired: { bg: 'bg-slate-100', text: 'text-slate-500' },
};

// ============================================================================
// Sub-Components
// ============================================================================

function FrameworkCard({
  framework,
  onSelect,
}: {
  framework: Framework;
  onSelect: () => void;
}) {
  const totalReqs = framework.categories.reduce((acc, c) => acc + c.requirements.length, 0);
  const compliantReqs = framework.categories.reduce(
    (acc, c) => acc + c.requirements.filter(r => r.status === 'compliant').length,
    0
  );
  const gapReqs = framework.categories.reduce(
    (acc, c) => acc + c.requirements.filter(r => r.status === 'gap').length,
    0
  );
  // Derive the badge/progress percentage from the counts shown on the card so
  // it stays consistent with the requirement tallies (and the detail view).
  const compliancePct = totalReqs > 0 ? Math.round((compliantReqs / totalReqs) * 100) : 0;

  return (
    <div
      onClick={onSelect}
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-slate-900">{framework.code}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
              compliancePct >= 80 ? 'bg-emerald-100 text-emerald-700' :
              compliancePct >= 60 ? 'bg-amber-100 text-amber-700' :
              'bg-rose-100 text-rose-700'
            }`}>
              {compliancePct}%
            </span>
          </div>
          <div className="text-sm text-slate-600">{framework.name}</div>
        </div>
        <Icon name="document-text" className="w-6 h-6 text-slate-400" />
      </div>

      <p className="text-[11px] text-slate-500 mb-4 line-clamp-2">{framework.description}</p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 bg-slate-50 rounded-lg">
          <div className="text-lg font-bold text-slate-900">{totalReqs}</div>
          <div className="text-[10px] text-slate-500">Requirements</div>
        </div>
        <div className="text-center p-2 bg-emerald-50 rounded-lg">
          <div className="text-lg font-bold text-emerald-700">{compliantReqs}</div>
          <div className="text-[10px] text-emerald-600">Compliant</div>
        </div>
        <div className="text-center p-2 bg-rose-50 rounded-lg">
          <div className="text-lg font-bold text-rose-700">{gapReqs}</div>
          <div className="text-[10px] text-rose-600">Gaps</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${compliancePct}%`,
            backgroundColor: compliancePct >= 80 ? '#059669' : compliancePct >= 60 ? '#d97706' : '#dc2626'
          }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>Last assessed: {framework.lastAssessment}</span>
        <span>{framework.jurisdiction}</span>
      </div>
    </div>
  );
}

function RequirementRow({
  requirement,
  onViewDetails,
}: {
  requirement: Requirement;
  onViewDetails: () => void;
}) {
  const statusConfig = STATUS_CONFIG[requirement.status];
  const riskConfig = RISK_CONFIG[requirement.riskLevel];
  const evidenceCount = requirement.controlMappings.reduce((acc, cm) => acc + cm.evidence.length, 0);

  return (
    <div
      onClick={onViewDetails}
      className="flex items-center gap-4 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer transition"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusConfig.bg}`}>
        <Icon name={statusConfig.icon as any} className={`w-4 h-4 ${statusConfig.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono text-indigo-600">{requirement.article}</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${riskConfig.bg} ${riskConfig.text}`}>
            {requirement.riskLevel}
          </span>
        </div>
        <div className="text-sm font-medium text-slate-900 truncate">{requirement.title}</div>
        {requirement.owner && (
          <div className="text-[10px] text-slate-500">Owner: {requirement.owner}</div>
        )}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <Icon name="shield-check" className="w-3 h-3" />
          {requirement.controlMappings.length} controls
        </span>
        <span className="flex items-center gap-1">
          <Icon name="document-text" className="w-3 h-3" />
          {evidenceCount} evidence
        </span>
      </div>
      <span className={`px-2 py-1 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
        {statusConfig.label}
      </span>
      <Icon name="chevron-right" className="w-4 h-4 text-slate-400" />
    </div>
  );
}

function RequirementDetail({ requirement }: { requirement: Requirement }) {
  const statusConfig = STATUS_CONFIG[requirement.status];
  const riskConfig = RISK_CONFIG[requirement.riskLevel];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-50 to-indigo-50 rounded-xl p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-mono text-indigo-600 font-semibold">{requirement.article}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${riskConfig.bg} ${riskConfig.text}`}>
            {requirement.riskLevel} risk
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
            {statusConfig.label}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{requirement.title}</h3>
        <p className="text-sm text-slate-600">{requirement.description}</p>
        {requirement.owner && (
          <div className="mt-2 text-xs text-slate-500">
            <strong>Owner:</strong> {requirement.owner}
          </div>
        )}
      </div>

      {/* Gap Description */}
      {requirement.gapDescription && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-rose-900 mb-2 flex items-center gap-2">
            <Icon name="exclamation-triangle" className="w-4 h-4" />
            Gap Identified
          </h4>
          <p className="text-sm text-rose-800">{requirement.gapDescription}</p>
          {requirement.remediationGuidance && (
            <div className="mt-3 pt-3 border-t border-rose-200">
              <h5 className="text-xs font-semibold text-rose-900 mb-1">Remediation Guidance:</h5>
              <p className="text-sm text-rose-700">{requirement.remediationGuidance}</p>
            </div>
          )}
          {requirement.dueDate && (
            <div className="mt-2 text-xs text-rose-600">
              <strong>Due Date:</strong> {requirement.dueDate}
            </div>
          )}
        </div>
      )}

      {/* Control Mappings */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Mapped Controls ({requirement.controlMappings.length})</h4>
        <div className="space-y-3">
          {requirement.controlMappings.map(control => {
            const ctrlStatus = STATUS_CONFIG[control.status];
            return (
              <div key={control.controlId} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-slate-500">{control.controlId}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        control.controlCategory === 'platform' ? 'bg-slate-100 text-slate-700' :
                        control.controlCategory === 'policy' ? 'bg-indigo-100 text-indigo-700' :
                        control.controlCategory === 'guardrail' ? 'bg-blue-100 text-blue-700' :
                        'bg-violet-100 text-violet-700'
                      }`}>
                        {control.controlCategory}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-900">{control.controlName}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${ctrlStatus.bg} ${ctrlStatus.text}`}>
                    {ctrlStatus.label}
                  </span>
                </div>

                {control.notes && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded p-2 mb-2">
                    {control.notes}
                  </div>
                )}

                <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-3">
                  <span>Last tested: {control.lastTested}</span>
                  <span className={`font-semibold ${
                    control.testResult === 'pass' ? 'text-emerald-600' :
                    control.testResult === 'fail' ? 'text-rose-600' :
                    control.testResult === 'partial' ? 'text-amber-600' : 'text-slate-400'
                  }`}>
                    Test: {control.testResult}
                  </span>
                </div>

                {/* Evidence */}
                {control.evidence.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium text-slate-600 mb-2">Evidence ({control.evidence.length})</div>
                    <div className="space-y-1">
                      {control.evidence.map(ev => {
                        const evStatus = EVIDENCE_STATUS_CONFIG[ev.status];
                        return (
                          <div
                            key={ev.id}
                            className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200"
                          >
                            <div className="flex items-center gap-2">
                              <Icon name={
                                ev.type === 'document' ? 'document-text' :
                                ev.type === 'screenshot' ? 'computer-desktop' :
                                ev.type === 'config' ? 'cog-6-tooth' :
                                ev.type === 'test-result' ? 'clipboard-document-check' : 'document'
                              } className="w-4 h-4 text-slate-400" />
                              <div>
                                <div className="text-xs font-medium text-slate-800">{ev.name}</div>
                                <div className="text-[10px] text-slate-500">{ev.source} · {ev.collectedAt}</div>
                              </div>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${evStatus.bg} ${evStatus.text}`}>
                              {ev.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {control.evidence.length === 0 && (
                  <div className="text-xs text-rose-600 bg-rose-50 rounded p-2">
                    No evidence collected
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FrameworkDetailView({
  framework,
  onGenerateReport,
}: {
  framework: Framework;
  onGenerateReport: () => void;
}) {
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(framework.categories[0]?.id || '');

  const totalReqs = framework.categories.reduce((acc, c) => acc + c.requirements.length, 0);
  const compliantReqs = framework.categories.reduce(
    (acc, c) => acc + c.requirements.filter(r => r.status === 'compliant').length,
    0
  );
  const partialReqs = framework.categories.reduce(
    (acc, c) => acc + c.requirements.filter(r => r.status === 'partial').length,
    0
  );
  const gapReqs = framework.categories.reduce(
    (acc, c) => acc + c.requirements.filter(r => r.status === 'gap').length,
    0
  );
  // Derive the headline percentage from the requirement counts shown below so
  // the "% compliant" badge can never disagree with the tallies on this page.
  const compliancePct = totalReqs > 0 ? Math.round((compliantReqs / totalReqs) * 100) : 0;

  const activeReqs = framework.categories.find(c => c.id === activeCategory)?.requirements || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-bold text-slate-900">{framework.code}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              compliancePct >= 80 ? 'bg-emerald-100 text-emerald-700' :
              compliancePct >= 60 ? 'bg-amber-100 text-amber-700' :
              'bg-rose-100 text-rose-700'
            }`}>
              {compliancePct}% compliant
            </span>
            {framework.certificationStatus && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                {framework.certificationStatus}
              </span>
            )}
          </div>
          <h2 className="text-sm text-slate-600">{framework.fullName}</h2>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span>{framework.regulatoryBody}</span>
            <span>{framework.jurisdiction}</span>
            <span>Effective: {framework.effectiveDate}</span>
          </div>
        </div>
        <button
          onClick={onGenerateReport}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
        >
          <Icon name="document-arrow-down" className="w-4 h-4" />
          Generate Report
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-slate-900">{totalReqs}</div>
          <div className="text-xs text-slate-500">Total Requirements</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-emerald-700">{compliantReqs}</div>
          <div className="text-xs text-emerald-600">Compliant</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-700">{partialReqs}</div>
          <div className="text-xs text-amber-600">Partial</div>
        </div>
        <div className="bg-rose-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-rose-700">{gapReqs}</div>
          <div className="text-xs text-rose-600">Gaps</div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {framework.categories.map(cat => {
            const catGaps = cat.requirements.filter(r => r.status === 'gap').length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition ${
                  activeCategory === cat.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {cat.name}
                {catGaps > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-semibold">
                    {catGaps}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Requirements List */}
      <div className="space-y-2">
        {activeReqs.map(req => (
          <RequirementRow
            key={req.id}
            requirement={req}
            onViewDetails={() => setSelectedRequirement(req)}
          />
        ))}
      </div>

      {/* Requirement Detail Drawer */}
      <Drawer
        open={!!selectedRequirement}
        onClose={() => setSelectedRequirement(null)}
        title={selectedRequirement?.article || ''}
        subtitle={selectedRequirement?.title || ''}
        width="xl"
      >
        {selectedRequirement && <RequirementDetail requirement={selectedRequirement} />}
      </Drawer>
    </div>
  );
}

function ReportGeneratorModal({
  framework,
  onClose,
  onGenerate,
}: {
  framework: Framework;
  onClose: () => void;
  onGenerate: (format: ReportFormat, sections: string[]) => void;
}) {
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [selectedSections, setSelectedSections] = useState<string[]>([
    'executive-summary',
    'requirement-status',
    'gap-analysis',
    'evidence-package',
  ]);

  const SECTIONS = [
    { id: 'executive-summary', label: 'Executive Summary', description: 'High-level compliance overview for leadership' },
    { id: 'requirement-status', label: 'Requirement Status', description: 'Full breakdown by requirement with control mappings' },
    { id: 'gap-analysis', label: 'Gap Analysis', description: 'Detailed gaps with remediation guidance' },
    { id: 'evidence-package', label: 'Evidence Package', description: 'All supporting evidence with chain of custody' },
    { id: 'control-inventory', label: 'Control Inventory', description: 'Complete list of mapped controls' },
    { id: 'trend-analysis', label: 'Trend Analysis', description: 'Historical compliance trending' },
    { id: 'auditor-notes', label: 'Auditor Notes', description: 'Space for auditor observations and findings' },
  ];

  // What this format can actually emit. SECTIONS above is the catalogue of section ids the
  // UI knows about; FORMAT_CAPABILITIES says which of them a given exporter honours.
  const capability = FORMAT_CAPABILITIES[format];
  const availableSections = capability.honoursSections
    ? SECTIONS.filter(sec => capability.sections.includes(sec.id))
    : [];

  // Switching format must prune the selection: keeping a tick for a section the new format
  // cannot produce is how the old modal silently dropped sections from the output.
  useEffect(() => {
    if (!capability.honoursSections) return;
    setSelectedSections(prev => {
      const pruned = prev.filter(id => capability.sections.includes(id));
      return pruned.length === prev.length ? prev : pruned;
    });
  }, [format, capability]);

  const toggleSection = (id: string) => {
    if (selectedSections.includes(id)) {
      setSelectedSections(selectedSections.filter(s => s !== id));
    } else {
      setSelectedSections([...selectedSections, id]);
    }
  };

  const handleGenerate = () => {
    onGenerate(format, selectedSections);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Generate Report</h3>
            <p className="text-sm text-slate-500">{framework.code} - {framework.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <Icon name="x-mark" className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <label className="text-sm font-semibold text-slate-900 mb-2 block">Export Format</label>
            <div className="grid grid-cols-4 gap-2">
              {(['pdf', 'docx', 'csv', 'json'] as ReportFormat[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    format === f
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300'
                      : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* What this format produces — stated before the section list, because for CSV and
              JSON the section list does not apply at all. */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <Icon name="information-circle" className="w-4 h-4 text-slate-400 flex-shrink-0 mt-px" />
            <div className="text-[11px] text-slate-600">{capability.note}</div>
          </div>

          {/* Section Selection */}
          <div>
            <label className="text-sm font-semibold text-slate-900 mb-2 block">
              Include Sections
              {!capability.honoursSections && (
                <span className="ml-2 text-[10px] font-normal text-slate-400 normal-case">
                  not applicable to {format.toUpperCase()}
                </span>
              )}
            </label>
            {!capability.honoursSections ? (
              <div className="text-xs text-slate-500 p-3 rounded-lg border border-dashed border-slate-300">
                {format.toUpperCase()} exports a fixed payload, so there is nothing to choose here.
                Pick PDF or DOCX to select sections.
              </div>
            ) : (
            <div className="space-y-2">
              {availableSections.map(section => (
                <label
                  key={section.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedSections.includes(section.id)
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSections.includes(section.id)}
                    onChange={() => toggleSection(section.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900">{section.label}</div>
                    <div className="text-xs text-slate-500">{section.description}</div>
                  </div>
                </label>
              ))}
              {/* Sections the UI knows about but this format cannot emit. Listed as
                  unavailable rather than hidden, so the absence is explained rather than
                  looking like the section does not exist. */}
              {SECTIONS.filter(sec => !capability.sections.includes(sec.id)).map(section => (
                <div
                  key={section.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60"
                  title={`No ${format.toUpperCase()} exporter produces this section.`}
                >
                  <input type="checkbox" checked={false} disabled className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-slate-400">
                      {section.label}
                      <span className="ml-2 text-[10px] font-normal">not available in {format.toUpperCase()}</span>
                    </div>
                    <div className="text-xs text-slate-400">{section.description}</div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={selectedSections.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}

async function downloadReport(report: GeneratedReport, framework?: Framework) {
  if (!framework) {
    framework = MOCK_FRAMEWORKS.find(f => f.id === report.frameworkId);
  }
  if (!framework) return;

  const options = {
    sections: report.sections,
    includeEvidence: true,
    includeGaps: true,
    generatedBy: report.generatedBy,
    // Every artifact this module produces is built from MOCK_FRAMEWORKS — the seeded
    // requirement/control/evidence tree in this file. Both entry points reach it: this
    // function's own lookup above, and handleGenerateReport, whose framework can only ever
    // be one of those five. So the export is illustrative, unconditionally.
    //
    // The on-screen surfaces are already badged, but that badge does not travel with a
    // downloaded file, and these files title themselves "Compliance Assessment Report".
    // When requirement-level detail is wired to measured data, this becomes conditional on
    // the framework's own source rather than being flipped to 'measured' wholesale.
    dataProvenance: 'illustrative' as const,
  };

  try {
    switch (report.format) {
      case 'pdf':
        await exportToPDF(framework, options);
        break;
      case 'docx':
        await exportToWord(framework, options);
        break;
      case 'csv':
        await exportToExcel(framework, options);
        break;
      case 'json':
      default:
        exportToJSON(framework, options);
        break;
    }
  } catch (error) {
    console.error('Export failed:', error);
    alert('Export failed. Please try again.');
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function FrameworkReportsModule() {
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null);
  const [showReportGenerator, setShowReportGenerator] = useState(false);
  const [generatingFramework, setGeneratingFramework] = useState<Framework | null>(null);
  // Starts EMPTY. This list used to seed MOCK_GENERATED_REPORTS - six invented reports with
  // named authors ("Sarah Chen"), precise timestamps and precise file sizes ("2.4 MB") -
  // rendered with no badge, which reads as a real report history. Nothing persists generated
  // reports: they download straight to the user's machine. So only reports generated in this
  // session appear, and the card says why the list is empty.
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);

  // Live compliance posture (AWS Config / Audit Manager via the compliance API).
  // Only the top-level compliance FIGURES map to the live shape; the per-requirement
  // drill-down below has no live source and stays illustrative.
  const { frameworks: liveFrameworks, posture, isLive: isComplianceLive } = useFrameworkCompliance();

  const liveStats = useMemo(() => {
    const frameworkCount = liveFrameworks.length;
    const totalControls = liveFrameworks.reduce((a, f) => a + f.totalControls, 0);
    const totalGaps = liveFrameworks.reduce((a, f) => a + f.failCount, 0);
    // Pool the fallback overall-coverage % from summed pass / applicable controls
    // (applicable = total − not-started), mirroring the server's overall_coverage_pct
    // (govern_compliance_service.get_compliance_posture). Averaging per-framework rates
    // would ignore each framework's differing denominator and give a wrong number.
    const totalPass = liveFrameworks.reduce((a, f) => a + f.passCount, 0);
    const totalApplicable = liveFrameworks.reduce((a, f) => a + (f.totalControls - f.notStartedCount), 0);
    const compliancePct =
      posture?.overall_coverage_pct != null
        ? Math.round(posture.overall_coverage_pct)
        : totalApplicable > 0
          ? Math.round((totalPass / totalApplicable) * 100)
          : null;
    // Carried so the tile can name its own denominator. "Avg Compliance 70%" sitting beside
    // "Total Controls 318" invited the reader to assume 70% of 318, when the rate excludes
    // every not-started control.
    const notAssessed = totalControls - totalApplicable;
    return { frameworkCount, totalControls, totalGaps, compliancePct, totalApplicable, notAssessed };
  }, [liveFrameworks, posture]);

  const aggregateStats = useMemo(() => {
    const totalReqs = MOCK_FRAMEWORKS.reduce(
      (acc, f) => acc + f.categories.reduce((a, c) => a + c.requirements.length, 0),
      0
    );
    const compliantReqs = MOCK_FRAMEWORKS.reduce(
      (acc, f) => acc + f.categories.reduce((a, c) => a + c.requirements.filter(r => r.status === 'compliant').length, 0),
      0
    );
    const gapReqs = MOCK_FRAMEWORKS.reduce(
      (acc, f) => acc + f.categories.reduce((a, c) => a + c.requirements.filter(r => r.status === 'gap').length, 0),
      0
    );
    // Derive overall compliance from the requirement counts so the headline
    // stat agrees with the totals shown, rather than averaging a separate score.
    const compliancePct = totalReqs > 0 ? Math.round((compliantReqs / totalReqs) * 100) : 0;

    return { totalReqs, compliantReqs, gapReqs, compliancePct };
  }, []);

  const handleGenerateReport = async (format: ReportFormat, sections: string[]) => {
    if (!generatingFramework) return;

    const newReport: GeneratedReport = {
      id: `rpt-${Date.now()}`,
      frameworkId: generatingFramework.id,
      frameworkName: generatingFramework.code,
      title: `${generatingFramework.code} Compliance Report - ${new Date().toLocaleDateString()}`,
      generatedAt: new Date().toISOString(),
      generatedBy: 'Current User',
      format,
      sections,
      fileSize: format === 'pdf' ? '~2 MB' : format === 'docx' ? '~1.5 MB' : '~500 KB',
      downloadUrl: '#',
    };

    // Generate and download the actual report
    await downloadReport(newReport, generatingFramework);

    // Add to history
    setGeneratedReports([newReport, ...generatedReports]);
    setShowReportGenerator(false);
    setGeneratingFramework(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CoreBadge pillar="show" compact />
          {isComplianceLive ? (
            <LiveDataBadge
              source="Compliance Posture API"
              detail="Framework compliance figures from live control posture (AWS Config / Audit Manager)"
            />
          ) : (
            <MockDataBadge integration="Connect to GRC systems for live compliance data" />
          )}
        </div>
      </div>

      {/* Aggregate Stats — driven by live compliance posture when available */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Frameworks"
          value={(isComplianceLive ? liveStats.frameworkCount : MOCK_FRAMEWORKS.length).toString()}
          sub="tracked"
        />
        <StatCard
          label={isComplianceLive ? 'Total Controls' : 'Total Requirements'}
          value={(isComplianceLive ? liveStats.totalControls : aggregateStats.totalReqs).toString()}
          sub={isComplianceLive && liveStats.notAssessed > 0
            ? `${liveStats.totalApplicable} assessed · ${liveStats.notAssessed} not yet`
            : 'across frameworks'}
        />
        {/* The rate's denominator is the ASSESSED population, so the tile states it. A
            null rate (nothing assessed) renders an em-dash and never a success variant:
            0% would read as total failure where it means nothing has been attested. */}
        <StatCard
          label="Avg Compliance"
          value={
            isComplianceLive
              ? liveStats.compliancePct === null ? '—' : `${liveStats.compliancePct}%`
              : `${aggregateStats.compliancePct}%`
          }
          sub={
            isComplianceLive
              ? liveStats.compliancePct === null
                ? 'no control assessed yet'
                : `of ${liveStats.totalApplicable} assessed controls`
              : 'of requirements compliant'
          }
          variant={
            isComplianceLive
              ? liveStats.compliancePct === null
                ? 'muted'
                : liveStats.compliancePct >= 75 ? 'success' : 'warning'
              : aggregateStats.compliancePct >= 75 ? 'success' : 'warning'
          }
        />
        <StatCard
          label="Open Gaps"
          value={(isComplianceLive ? liveStats.totalGaps : aggregateStats.gapReqs).toString()}
          sub="requiring remediation"
          variant={(isComplianceLive ? liveStats.totalGaps : aggregateStats.gapReqs) > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Framework Cards or Detail View */}
      {selectedFramework ? (
        <div>
          <button
            onClick={() => setSelectedFramework(null)}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            Back to Frameworks
          </button>
          <FrameworkDetailView
            framework={selectedFramework}
            onGenerateReport={() => {
              setGeneratingFramework(selectedFramework);
              setShowReportGenerator(true);
            }}
          />
        </div>
      ) : (
        <>
          {/* Framework Grid */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Regulatory Frameworks</h3>
              <MockDataBadge integration="Requirement-level control detail is illustrative" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MOCK_FRAMEWORKS.map(fw => (
                <FrameworkCard
                  key={fw.id}
                  framework={fw}
                  onSelect={() => setSelectedFramework(fw)}
                />
              ))}
            </div>
          </div>

          {/* Recent Reports — this session only; there is no report store. */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Recent Reports</h3>
              <span className="text-[10px] text-slate-400">this session only</span>
            </div>
            {generatedReports.length === 0 && (
              <div className="text-center py-8">
                <Icon name="document-arrow-down" className="w-8 h-8 mx-auto mb-2 text-slate-300" strokeWidth={1.5} />
                <div className="text-sm font-medium text-slate-600">No reports generated yet</div>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                  Generated reports download directly to your machine and are not retained here, so this list
                  covers only what you generate in this session.
                </p>
              </div>
            )}
            <div className="space-y-2">
              {generatedReports.slice(0, 5).map(report => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      report.format === 'pdf' ? 'bg-rose-100' :
                      report.format === 'docx' ? 'bg-blue-100' :
                      report.format === 'csv' ? 'bg-emerald-100' : 'bg-slate-100'
                    }`}>
                      <Icon name="document-text" className={`w-5 h-5 ${
                        report.format === 'pdf' ? 'text-rose-600' :
                        report.format === 'docx' ? 'text-blue-600' :
                        report.format === 'csv' ? 'text-emerald-600' : 'text-slate-600'
                      }`} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{report.title}</div>
                      <div className="text-[10px] text-slate-500">
                        {report.frameworkName} · {new Date(report.generatedAt).toLocaleDateString()} · {report.generatedBy} · {report.fileSize}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadReport(report)}
                    className="p-2 rounded-lg hover:bg-white transition"
                  >
                    <Icon name="arrow-down-tray" className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Report Generator Modal */}
      {showReportGenerator && generatingFramework && (
        <ReportGeneratorModal
          framework={generatingFramework}
          onClose={() => {
            setShowReportGenerator(false);
            setGeneratingFramework(null);
          }}
          onGenerate={handleGenerateReport}
        />
      )}
    </div>
  );
}
