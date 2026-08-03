/**
 * MRMFrameworkExplorer — Deep dive into Model Risk Management frameworks
 *
 * Provides detailed information about:
 * - SR 26-2 (US Federal Reserve)
 * - OSFI E-23 (Canada)
 * - NIST AI RMF (US)
 * - EU AI Act
 * - AWS Responsible AI (supplementary)
 */

import { useState } from 'react';
import { Icon, type IconName } from './icons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface FrameworkControl {
  id: string;
  name: string;
  description: string;
  requirement: 'mandatory' | 'recommended' | 'optional';
  evidenceExamples?: string[];
}

interface Framework {
  id: string;
  name: string;
  shortCode: string;
  region: string;
  regulator: string;
  effectiveDate: string;
  color: string;
  icon: string;
  overview: string;
  scope: string;
  keyPrinciples: string[];
  tiering: { tier: string; description: string; requirements: string }[];
  controls: FrameworkControl[];
  documentationUrl: string;
  keyDates: { date: string; event: string }[];
  evidenceCategories?: { category: string; examples: string[] }[];
}

const FRAMEWORKS: Framework[] = [
  {
    id: 'sr-26-2',
    name: 'SR 26-2 (Federal Reserve)',
    shortCode: 'SR',
    region: 'United States',
    regulator: 'Federal Reserve Board',
    effectiveDate: '2026-01-01',
    color: '#8b5cf6',
    icon: '🇺🇸',
    overview: 'SR 26-2 updates the Federal Reserve\'s model risk management guidance (originally SR 11-7) to address AI/ML models. It establishes expectations for banks\' use of AI in decision-making, requiring robust governance, validation, and ongoing monitoring.',
    scope: 'All bank holding companies, state member banks, and their subsidiaries using AI/ML models for material business decisions.',
    keyPrinciples: [
      'Model risk management must be commensurate with the model\'s materiality and complexity',
      'AI models require enhanced documentation of training data, features, and decision logic',
      'Human oversight is mandatory for high-risk automated decisions',
      'Continuous monitoring must detect model drift and performance degradation',
      'Third-party models are subject to the same governance as internally developed models',
    ],
    tiering: [
      { tier: 'Tier 1 (Critical)', description: 'Models with significant financial, regulatory, or reputational impact', requirements: 'Annual validation, quarterly monitoring, HITL required, C-suite attestation' },
      { tier: 'Tier 2 (High)', description: 'Models with moderate business impact', requirements: 'Annual validation, monthly monitoring, documented escalation procedures' },
      { tier: 'Tier 3 (Standard)', description: 'Models with limited business impact', requirements: 'Biennial validation, quarterly monitoring, standard documentation' },
    ],
    controls: [
      { id: 'SR-1', name: 'Model Inventory', description: 'Maintain complete inventory of all AI/ML models with materiality classification', requirement: 'mandatory' },
      { id: 'SR-2', name: 'Development Standards', description: 'Documented standards for model development including data quality, feature selection, and testing', requirement: 'mandatory' },
      { id: 'SR-3', name: 'Independent Validation', description: 'Validation by parties independent of model development', requirement: 'mandatory' },
      { id: 'SR-4', name: 'Ongoing Monitoring', description: 'Continuous monitoring of model performance, stability, and outcomes', requirement: 'mandatory' },
      { id: 'SR-5', name: 'Outcome Analysis', description: 'Regular analysis of model outcomes for bias and fair lending compliance', requirement: 'mandatory' },
      { id: 'SR-6', name: 'Board Reporting', description: 'Regular reporting to board on model risk profile and issues', requirement: 'mandatory' },
      { id: 'SR-7', name: 'Third-Party Due Diligence', description: 'Enhanced due diligence for third-party and vendor models', requirement: 'mandatory' },
      { id: 'SR-8', name: 'Change Management', description: 'Formal change management process for model updates', requirement: 'mandatory' },
    ],
    documentationUrl: 'https://www.federalreserve.gov/supervisionreg/srletters/sr1107.htm',
    keyDates: [
      { date: '2011-04-04', event: 'SR 11-7 original guidance issued' },
      { date: '2025-06-15', event: 'SR 26-2 draft released for comment' },
      { date: '2026-01-01', event: 'SR 26-2 effective date' },
      { date: '2026-07-01', event: 'Full compliance deadline' },
    ],
  },
  {
    id: 'osfi-e23',
    name: 'OSFI E-23 (Canada)',
    shortCode: 'OSFI',
    region: 'Canada',
    regulator: 'Office of the Superintendent of Financial Institutions',
    effectiveDate: '2027-05-01',
    color: '#ec4899',
    icon: '🇨🇦',
    overview: 'OSFI E-23 is Canada\'s enterprise-wide model risk management guideline. It requires federally regulated financial institutions to establish comprehensive frameworks for identifying, measuring, and managing model risk across all model types including AI/ML.',
    scope: 'All federally regulated financial institutions (FRFIs) in Canada including banks, insurance companies, and trust companies.',
    keyPrinciples: [
      'Enterprise-wide model risk management framework required',
      'Model materiality assessment drives governance intensity',
      'Three lines of defense model for oversight',
      'Explainability requirements for AI/ML models',
      'Regular stress testing of model assumptions',
    ],
    tiering: [
      { tier: 'Tier 1 (Material)', description: 'Models critical to business strategy, capital, or regulatory compliance', requirements: 'Board oversight, annual independent validation, quarterly performance review' },
      { tier: 'Tier 2 (Significant)', description: 'Models with notable business or operational impact', requirements: 'Senior management oversight, periodic validation, ongoing monitoring' },
      { tier: 'Tier 3 (Standard)', description: 'Models with limited materiality', requirements: 'Business line oversight, risk-based validation, standard monitoring' },
    ],
    controls: [
      { id: 'E23-1', name: 'Model Risk Appetite', description: 'Define and document enterprise model risk appetite', requirement: 'mandatory' },
      { id: 'E23-2', name: 'Model Inventory', description: 'Comprehensive inventory with materiality classification', requirement: 'mandatory' },
      { id: 'E23-3', name: 'Development Framework', description: 'Standardized model development lifecycle', requirement: 'mandatory' },
      { id: 'E23-4', name: 'Validation Framework', description: 'Independent model validation function', requirement: 'mandatory' },
      { id: 'E23-5', name: 'Performance Monitoring', description: 'Ongoing monitoring and benchmarking', requirement: 'mandatory' },
      { id: 'E23-6', name: 'Model Use Controls', description: 'Controls on model outputs and usage boundaries', requirement: 'mandatory' },
      { id: 'E23-7', name: 'Documentation Standards', description: 'Comprehensive model documentation requirements', requirement: 'mandatory' },
      { id: 'E23-8', name: 'Governance Structure', description: 'Clear roles, responsibilities, and escalation paths', requirement: 'mandatory' },
    ],
    documentationUrl: 'https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/enterprise-wide-model-risk-management-federally-regulated-financial-institutions-guideline',
    keyDates: [
      { date: '2025-09-11', event: 'E-23 final guideline published (expanded to all model types incl. AI/ML)' },
      { date: '2027-05-01', event: 'Effective date for all FRFIs' },
    ],
  },
  {
    id: 'nist-ai-rmf',
    name: 'NIST AI Risk Management Framework',
    shortCode: 'NIST',
    region: 'United States',
    regulator: 'National Institute of Standards and Technology',
    effectiveDate: '2023-01-26',
    color: '#3b82f6',
    icon: '🇺🇸',
    overview: 'The NIST AI RMF provides a voluntary framework for managing AI risks throughout the AI lifecycle. It emphasizes trustworthy AI characteristics and provides actionable guidance for organizations of all sizes.',
    scope: 'Voluntary framework applicable to all organizations developing, deploying, or using AI systems. Often referenced by regulators as a baseline.',
    keyPrinciples: [
      'AI systems should be valid and reliable',
      'AI systems should be safe, secure, and resilient',
      'AI systems should be accountable and transparent',
      'AI systems should be explainable and interpretable',
      'AI systems should be fair with harmful bias managed',
      'AI systems should be privacy-enhanced',
    ],
    tiering: [
      { tier: 'High Risk', description: 'AI systems with potential for significant harm', requirements: 'Full framework implementation, continuous monitoring, human oversight' },
      { tier: 'Medium Risk', description: 'AI systems with moderate risk potential', requirements: 'Core function implementation, periodic assessment' },
      { tier: 'Low Risk', description: 'AI systems with minimal risk', requirements: 'Basic governance, documentation' },
    ],
    controls: [
      { id: 'GOVERN', name: 'Govern Function', description: 'Cultivate culture of risk management and establish policies', requirement: 'mandatory' },
      { id: 'MAP', name: 'Map Function', description: 'Identify and document AI system context and potential impacts', requirement: 'mandatory' },
      { id: 'MEASURE', name: 'Measure Function', description: 'Analyze and assess AI risks and impacts', requirement: 'mandatory' },
      { id: 'MANAGE', name: 'Manage Function', description: 'Prioritize and act on AI risks', requirement: 'mandatory' },
      { id: 'GOVERN-1', name: 'Policies & Procedures', description: 'Documented AI governance policies', requirement: 'recommended' },
      { id: 'MAP-1', name: 'System Cataloging', description: 'Catalog of AI systems and use cases', requirement: 'recommended' },
      { id: 'MEASURE-1', name: 'Risk Assessment', description: 'Regular risk assessments for AI systems', requirement: 'recommended' },
      { id: 'MANAGE-1', name: 'Risk Response', description: 'Documented risk response procedures', requirement: 'recommended' },
    ],
    documentationUrl: 'https://www.nist.gov/itl/ai-risk-management-framework',
    keyDates: [
      { date: '2023-01-26', event: 'AI RMF 1.0 released' },
      { date: '2024-04-29', event: 'AI RMF Generative AI Profile released' },
      { date: '2024-07-26', event: 'NIST AI 600-1 (GenAI companion) released' },
    ],
  },
  {
    id: 'eu-ai-act',
    name: 'EU AI Act',
    shortCode: 'EU',
    region: 'European Union',
    regulator: 'European Commission',
    effectiveDate: '2024-08-01',
    color: '#f59e0b',
    icon: '🇪🇺',
    overview: 'The EU AI Act is the world\'s first comprehensive legal framework for AI. It takes a risk-based approach, with strict requirements for high-risk AI systems and prohibitions on certain AI practices.',
    scope: 'All AI systems placed on the market or used in the EU, regardless of where providers are established. Applies to providers, deployers, importers, and distributors.',
    keyPrinciples: [
      'Risk-based approach to AI regulation',
      'Prohibited AI practices (social scoring, real-time biometric ID in public)',
      'Strict requirements for high-risk AI systems',
      'Transparency obligations for certain AI systems',
      'Human oversight requirements',
      'Fundamental rights impact assessments',
    ],
    tiering: [
      { tier: 'Prohibited', description: 'AI systems banned in the EU', requirements: 'Not permitted: social scoring, manipulative AI, real-time biometric ID in public spaces' },
      { tier: 'High Risk (Annex III)', description: 'AI in critical areas like employment, credit, law enforcement', requirements: 'Conformity assessment, CE marking, registration, human oversight, transparency' },
      { tier: 'Limited Risk', description: 'AI systems with transparency obligations', requirements: 'Disclosure requirements (chatbots, deepfakes, emotion recognition)' },
      { tier: 'Minimal Risk', description: 'All other AI systems', requirements: 'Voluntary codes of conduct encouraged' },
    ],
    controls: [
      { id: 'EU-1', name: 'Risk Management System', description: 'Establish, implement, and maintain AI risk management system', requirement: 'mandatory' },
      { id: 'EU-2', name: 'Data Governance', description: 'Training data must be relevant, representative, and error-free', requirement: 'mandatory' },
      { id: 'EU-3', name: 'Technical Documentation', description: 'Comprehensive technical documentation before market placement', requirement: 'mandatory' },
      { id: 'EU-4', name: 'Record Keeping', description: 'Automatic logging of AI system operations', requirement: 'mandatory' },
      { id: 'EU-5', name: 'Transparency', description: 'Clear instructions and information for deployers', requirement: 'mandatory' },
      { id: 'EU-6', name: 'Human Oversight', description: 'Design for effective human oversight', requirement: 'mandatory' },
      { id: 'EU-7', name: 'Accuracy & Robustness', description: 'Appropriate levels of accuracy, robustness, and cybersecurity', requirement: 'mandatory' },
      { id: 'EU-8', name: 'Conformity Assessment', description: 'Conformity assessment before market placement', requirement: 'mandatory' },
    ],
    documentationUrl: 'https://artificialintelligenceact.eu/',
    keyDates: [
      { date: '2024-08-01', event: 'EU AI Act entered into force' },
      { date: '2025-02-02', event: 'Prohibited AI practices take effect' },
      { date: '2025-08-02', event: 'GPAI model obligations apply' },
      { date: '2026-08-02', event: 'High-risk AI requirements fully apply' },
      { date: '2027-08-02', event: 'All provisions fully applicable' },
    ],
  },
  {
    id: 'aws-rai',
    name: 'AWS Responsible AI',
    shortCode: 'AWS',
    region: 'Global',
    regulator: 'Amazon Web Services (Industry Best Practice)',
    effectiveDate: '2023-01-01',
    color: '#f97316',
    icon: 'cloud',
    overview: 'AWS Responsible AI provides guidance and tools for building AI systems responsibly on AWS. While not a regulation, it offers practical implementation patterns that align with regulatory requirements.',
    scope: 'Organizations using AWS AI/ML services. Provides tooling and guidance that supports compliance with various regulations.',
    keyPrinciples: [
      'Fairness: Detect and mitigate bias in ML models',
      'Explainability: Understand model predictions and behavior',
      'Privacy & Security: Protect data throughout the ML lifecycle',
      'Robustness: Build resilient and reliable AI systems',
      'Governance: Establish clear ownership and accountability',
      'Transparency: Document and communicate AI system behavior',
    ],
    tiering: [
      { tier: 'Foundation Models', description: 'Large-scale pre-trained models (Bedrock)', requirements: 'Model cards, guardrails, evaluation, access controls' },
      { tier: 'Custom ML Models', description: 'Models trained on SageMaker', requirements: 'Model registry, lineage tracking, bias detection, explainability' },
      { tier: 'AI Services', description: 'Pre-built AI services (Rekognition, Comprehend)', requirements: 'Usage guidelines, confidence thresholds, human review workflows' },
    ],
    controls: [
      { id: 'AWS-1', name: 'Model Cards', description: 'Document model purpose, performance, and limitations', requirement: 'recommended' },
      { id: 'AWS-2', name: 'Guardrails', description: 'Content filtering and safety controls for generative AI', requirement: 'recommended' },
      { id: 'AWS-3', name: 'Model Monitor', description: 'Continuous monitoring for drift and quality', requirement: 'recommended' },
      { id: 'AWS-4', name: 'Clarify', description: 'Bias detection and explainability', requirement: 'recommended' },
      { id: 'AWS-5', name: 'Model Registry', description: 'Version control and approval workflows', requirement: 'recommended' },
      { id: 'AWS-6', name: 'Data Lineage', description: 'Track data provenance and transformations', requirement: 'recommended' },
      { id: 'AWS-7', name: 'Access Controls', description: 'IAM policies and resource-based controls', requirement: 'recommended' },
      { id: 'AWS-8', name: 'Audit Logging', description: 'CloudTrail and CloudWatch for audit trails', requirement: 'recommended' },
    ],
    documentationUrl: 'https://aws.amazon.com/machine-learning/responsible-ai/',
    keyDates: [
      { date: '2023-04-13', event: 'Amazon Bedrock announced' },
      { date: '2023-09-28', event: 'Bedrock GA with Guardrails' },
      { date: '2024-04-23', event: 'Bedrock Model Evaluation launched' },
      { date: '2024-11-01', event: 'Bedrock Guardrails enhanced for EU AI Act' },
    ],
  },
  {
    id: 'cri-fs-ai-rmf',
    name: 'CRI Financial Services AI RMF',
    shortCode: 'CRI',
    region: 'Global (FSI Focus)',
    regulator: 'Cyber Risk Institute / FSSCC',
    effectiveDate: '2026-02-01',
    color: '#0ea5e9',
    icon: 'building-office',
    overview: 'The CRI Financial Services AI Risk Management Framework is a comprehensive "framework of frameworks" developed by the Cyber Risk Institute in coordination with the Financial Services Sector Coordinating Council (FSSCC). It provides 230 Control Objectives specifically tailored for financial services AI adoption, with direct lineage to NIST AI RMF.',
    scope: 'Financial services institutions globally adopting AI systems. Provides practical implementation guidance that harmonizes with NIST AI RMF, SR 26-2, OSFI E-23, and EU AI Act requirements.',
    keyPrinciples: [
      'Built on NIST AI RMF\'s four functions: GOVERN, MAP, MEASURE, MANAGE',
      'Tailored specifically for financial services sector risk appetite and regulatory requirements',
      'Adoption stage-based implementation (Initial, Minimal, Evolving, Embedded)',
      'Aligned to AI Trustworthy Principles: Validity, Safety, Security, Accountability, Transparency, Explainability, Privacy, Fairness',
      'Provides actionable implementation guidelines with example controls and evidence',
      'Harmonizes multiple regulatory frameworks into unified control objectives',
    ],
    tiering: [
      { tier: 'Initial', description: 'Beginning AI adoption journey', requirements: 'Focus on foundational governance, inventory, and basic risk awareness' },
      { tier: 'Minimal', description: 'Basic AI risk management in place', requirements: 'Core policies, defined roles, initial monitoring capabilities' },
      { tier: 'Evolving', description: 'Maturing AI risk practices', requirements: 'Comprehensive measurement, stakeholder engagement, continuous improvement' },
      { tier: 'Embedded', description: 'Fully integrated AI risk management', requirements: 'Enterprise-wide integration, advanced monitoring, proactive risk response' },
    ],
    controls: [
      { id: 'GOVERN', name: 'Establishing Key Policies & Processes', description: 'Legal compliance, trustworthy AI policies, risk management processes, AI inventory, decommissioning', requirement: 'mandatory' },
      { id: 'GOVERN-2', name: 'Defining Roles and Responsibilities', description: 'Training, executive accountability, human-AI configurations', requirement: 'mandatory' },
      { id: 'GOVERN-3', name: 'Building AI Risk Management Workforce', description: 'Diverse perspectives, skill development, organizational capability', requirement: 'mandatory' },
      { id: 'GOVERN-4', name: 'Bolstering Risk-Aware Culture', description: 'Cultural embedding, impact documentation, organizational awareness', requirement: 'mandatory' },
      { id: 'MAP', name: 'Understanding Operating Context', description: 'Mission/goals, real-world value, risk tolerances, user requirements', requirement: 'mandatory' },
      { id: 'MAP-2', name: 'Understanding AI System', description: 'Task methodology, utility assessment, scientific methodologies, oversight needs', requirement: 'mandatory' },
      { id: 'MAP-3', name: 'Understanding Costs and Benefits', description: 'Benefit analysis, scope documentation, operator proficiency, human oversight', requirement: 'mandatory' },
      { id: 'MAP-4', name: 'Understanding AI System Components', description: 'Component risks, control establishment, third-party assessment', requirement: 'mandatory' },
      { id: 'MEASURE', name: 'Methods and Metrics', description: 'Measurement selection, continuous improvement, external assessment', requirement: 'mandatory' },
      { id: 'MEASURE-2', name: 'Evaluating AI Systems', description: 'Validity, safety, security, accountability, transparency, explainability, privacy, fairness', requirement: 'mandatory' },
      { id: 'MEASURE-3', name: 'Tracking AI Risks', description: 'Known and emergent risks, qualitative tracking, feedback mechanisms', requirement: 'mandatory' },
      { id: 'MANAGE', name: 'Prioritizing and Responding to Risks', description: 'Deployment decisions, risk prioritization, high-priority response, residual risk', requirement: 'mandatory' },
      { id: 'MANAGE-2', name: 'Maximizing Benefits', description: 'Resource allocation, sustained value, emergent risk response', requirement: 'mandatory' },
    ],
    documentationUrl: 'https://cyberriskinstitute.org/fs-ai-rmf/',
    keyDates: [
      { date: '2025-09-01', event: 'CRI FS AI RMF development initiated with FSSCC' },
      { date: '2026-01-15', event: 'Public comment period opened' },
      { date: '2026-02-01', event: 'Version 1.0 released with 230 Control Objectives' },
      { date: '2026-06-01', event: 'Control Objective Reference Guide published' },
      { date: '2026-12-01', event: 'Planned alignment update for SR 26-2 effective date' },
    ],
    evidenceCategories: [
      {
        category: 'Governance Documentation',
        examples: [
          'AI Trustworthy Principles document with definitions and guiding philosophies',
          'AI regulatory risk register with assessments and assigned owners',
          'Board charter and membership roster with roles and responsibilities',
          'Policy documents with version history and approval signatures',
          'Charter or terms of reference for regulatory monitoring team',
          'Training completion records and assessment scores by role from LMS',
        ],
      },
      {
        category: 'Inventory & Classification',
        examples: [
          'AI system registry showing classification against policy and compliance status',
          'Model inventory with materiality classification and risk ratings',
          'Data classification inventory with sensitivity labels and retention periods',
          'Cross-reference matrix linking glossary terms to policies and system dossiers',
          'Completed compliance dossier files for sampled AI systems',
        ],
      },
      {
        category: 'Monitoring & Assessment',
        examples: [
          'Audit logs demonstrating enforcement of controls and policy compliance',
          'Performance monitoring dashboards and SLA tracking reports',
          'Drift detection alerts and model performance degradation reports',
          'Completed RIA/PIA assessment documents with risk ratings and mitigations',
          'Action item tracker linking decisions to owners, deadlines, and status',
        ],
      },
      {
        category: 'Change Management',
        examples: [
          'Change logs showing updates tied to regulatory or standards changes',
          'Change request forms with mandatory review fields and timestamps',
          'Approval records showing required mitigations accepted prior to deployment',
          'Version control logs for model artifacts and documentation',
          'Communication records announcing policy revisions to stakeholders',
        ],
      },
      {
        category: 'Third-Party & Vendor',
        examples: [
          'AI vendor assessment templates covering performance, bias, security, governance',
          'Contract obligation register with AI-specific obligations and due dates',
          'Third-party model risk assessment reports and due diligence documentation',
          'Repository of AI-related contract clauses and associated metadata',
          'Vendor audit reports and compliance attestations',
        ],
      },
      {
        category: 'Stakeholder & Communication',
        examples: [
          'Stakeholder engagement logs and feedback session minutes',
          'Communications plan artifacts and distribution records',
          'User survey results and action plans addressing concerns',
          'Escalation records showing issues forwarded to senior leadership',
          'Training and awareness campaign artifacts (FAQs, quick-reference guides)',
        ],
      },
    ],
  },
];

const ICON_SLUGS = new Set(['cloud', 'building-office']);
function FwIcon({ icon, className }: { icon: string; className?: string }) {
  if (ICON_SLUGS.has(icon)) {
    return <Icon name={icon as IconName} className={className ?? 'w-5 h-5'} />;
  }
  return <span>{icon}</span>;
}

export default function MRMFrameworkExplorer({ isOpen, onClose }: Props) {
  const [selectedFramework, setSelectedFramework] = useState<string>(FRAMEWORKS[0].id);
  const [activeSection, setActiveSection] = useState<'overview' | 'controls' | 'timeline' | 'evidence'>('overview');

  const framework = FRAMEWORKS.find(f => f.id === selectedFramework)!;
  const hasEvidence = framework.evidenceCategories && framework.evidenceCategories.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-6xl h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-slate-100">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">MRM Framework Explorer</h2>
            <p className="text-sm text-slate-500">Deep dive into Model Risk Management regulatory frameworks</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors" aria-label="Close">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Framework Selector Sidebar */}
          <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 overflow-y-auto">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Frameworks</div>
            <div className="space-y-2">
              {FRAMEWORKS.map(fw => (
                <button
                  key={fw.id}
                  onClick={() => setSelectedFramework(fw.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    selectedFramework === fw.id
                      ? 'bg-white shadow-md border-2'
                      : 'bg-white/50 border border-transparent hover:bg-white hover:shadow-sm'
                  }`}
                  style={{
                    borderColor: selectedFramework === fw.id ? fw.color : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <FwIcon icon={fw.icon} className="w-5 h-5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{fw.shortCode}</div>
                      <div className="text-[10px] text-slate-500 truncate">{fw.region}</div>
                    </div>
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: fw.color }}
                    />
                  </div>
                </button>
              ))}
            </div>

            {/* Quick Links */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Links</div>
              <div className="space-y-1">
                <a
                  href={framework.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Official Documentation
                </a>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Framework Header */}
            <div
              className="px-6 py-5 border-b"
              style={{ backgroundColor: `${framework.color}10`, borderColor: `${framework.color}30` }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${framework.color}20` }}
                  >
                    <FwIcon icon={framework.icon} className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{framework.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-slate-600">{framework.regulator}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-sm text-slate-600">{framework.region}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-sm font-medium" style={{ color: framework.color }}>
                        Effective: {framework.effectiveDate}
                      </span>
                    </div>
                  </div>
                </div>
                <a
                  href={framework.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: framework.color,
                    color: 'white',
                  }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View Full Documentation
                </a>
              </div>
            </div>

            {/* Section Tabs */}
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex gap-2">
              {[
                { id: 'overview', label: 'Overview & Principles', icon: 'clipboard-list' as IconName },
                { id: 'controls', label: 'Controls & Requirements', icon: 'shield-check' as IconName },
                ...(hasEvidence ? [{ id: 'evidence', label: 'Evidence Criteria', icon: 'document-text' as IconName }] : []),
                { id: 'timeline', label: 'Timeline & Dates', icon: 'calendar' as IconName },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as typeof activeSection)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    activeSection === tab.id
                      ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon name={tab.icon} className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Sections */}
            <div className="p-6">
              {/* Overview Section */}
              {activeSection === 'overview' && (
                <div className="space-y-6">
                  {/* Overview */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Overview</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{framework.overview}</p>
                  </div>

                  {/* Scope */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Scope & Applicability</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{framework.scope}</p>
                  </div>

                  {/* Key Principles */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Key Principles</h4>
                    <div className="space-y-2">
                      {framework.keyPrinciples.map((principle, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: framework.color }}
                          >
                            {i + 1}
                          </div>
                          <p className="text-sm text-slate-600 pt-0.5">{principle}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Risk Tiering */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Risk Tiering</h4>
                    <div className="space-y-3">
                      {framework.tiering.map((tier, i) => (
                        <div
                          key={i}
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: `${framework.color}05`,
                            borderColor: `${framework.color}20`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-900">{tier.tier}</span>
                          </div>
                          <p className="text-xs text-slate-600 mb-2">{tier.description}</p>
                          <div className="text-xs text-slate-500">
                            <span className="font-medium">Requirements:</span> {tier.requirements}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Controls Section */}
              {activeSection === 'controls' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                    This framework defines {framework.controls.length} key controls. Controls marked as "mandatory" are required for compliance.
                  </div>

                  <div className="grid gap-3">
                    {framework.controls.map(control => (
                      <div
                        key={control.id}
                        className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: framework.color }}
                            >
                              {control.id}
                            </div>
                            <div>
                              <h5 className="text-sm font-semibold text-slate-900">{control.name}</h5>
                              <p className="text-xs text-slate-600 mt-1">{control.description}</p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-semibold px-2 py-1 rounded ${
                              control.requirement === 'mandatory'
                                ? 'bg-rose-100 text-rose-700'
                                : control.requirement === 'recommended'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {control.requirement}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Section */}
              {activeSection === 'evidence' && hasEvidence && (
                <div className="space-y-6">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800">
                    <div className="flex items-start gap-3">
                      <Icon name="document-text" className="w-5 h-5 flex-shrink-0" />
                      <div>
                        <strong>Evidence Criteria from CRI FS AI RMF</strong>
                        <p className="mt-1 text-emerald-700">
                          The CRI Control Objective Reference Guide provides detailed examples of effective evidence for each control.
                          These examples are illustrative guides — organizations should tailor evidence to their specific context and regulatory environment.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {framework.evidenceCategories?.map((cat, i) => (
                      <div
                        key={i}
                        className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                            style={{ backgroundColor: `${framework.color}15` }}
                          >
                            {[
                              <Icon key="0" name="clipboard-list" className="w-4 h-4" />,
                              <Icon key="1" name="folder" className="w-4 h-4" />,
                              <Icon key="2" name="chart-bar" className="w-4 h-4" />,
                              <Icon key="3" name="arrow-path" className="w-4 h-4" />,
                              <Icon key="4" name="hand-raised" className="w-4 h-4" />,
                              <Icon key="5" name="chat-bubble" className="w-4 h-4" />,
                            ][i] ?? <Icon name="clipboard-list" className="w-4 h-4" />}
                          </div>
                          <h5 className="text-sm font-semibold text-slate-900">{cat.category}</h5>
                        </div>
                        <ul className="space-y-2">
                          {cat.examples.map((ex, j) => (
                            <li key={j} className="flex items-start gap-2 text-xs text-slate-600">
                              <Icon name="check" className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span>{ex}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <h5 className="text-sm font-semibold text-slate-900 mb-2">Evidence Best Practices</h5>
                    <div className="grid grid-cols-3 gap-4 text-xs text-slate-600">
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500">1.</span>
                        <span><strong>Timestamp everything</strong> — Dated acknowledgements, version histories, and audit logs provide clear timelines</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500">2.</span>
                        <span><strong>Link to owners</strong> — Every piece of evidence should have assigned responsibilities and accountability</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500">3.</span>
                        <span><strong>Show the workflow</strong> — Approval chains, escalation paths, and change logs demonstrate process adherence</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline Section */}
              {activeSection === 'timeline' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-4">Key Dates & Milestones</h4>
                    <div className="relative">
                      <div
                        className="absolute left-4 top-0 bottom-0 w-0.5"
                        style={{ backgroundColor: `${framework.color}30` }}
                      />
                      <div className="space-y-4">
                        {framework.keyDates.map((item, i) => {
                          const isPast = new Date(item.date) < new Date();
                          return (
                            <div key={i} className="flex items-start gap-4 relative">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                  isPast ? '' : 'ring-4 ring-white'
                                }`}
                                style={{
                                  backgroundColor: isPast ? `${framework.color}40` : framework.color,
                                }}
                              >
                                {isPast ? (
                                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-white" />
                                )}
                              </div>
                              <div className={`flex-1 pb-4 ${isPast ? 'opacity-60' : ''}`}>
                                <div className="text-xs font-semibold text-slate-500">{item.date}</div>
                                <div className="text-sm text-slate-900 mt-0.5">{item.event}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
