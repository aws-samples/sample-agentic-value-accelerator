/**
 * FSIGuardrailTemplates — Rich template library for FSI guardrail configurations
 *
 * Features:
 * - Curated templates for FSI use cases (AML, Credit, Claims, Wealth, etc.)
 * - Filter by use case, risk tier, regulatory framework
 * - Preview controls before applying
 * - Direct apply to Guardrail Builder
 */

import { useState, useMemo } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface Props {
  onApplyTemplate: (template: FSITemplate) => void;
  onClose?: () => void;
}

type RiskTier = 'Critical' | 'High' | 'Medium' | 'Low';
type FSICategory = 'B' | 'P' | 'R' | 'C' | 'I' | 'O' | 'AWS';
type UseCase = 'aml-kyc' | 'credit' | 'claims' | 'wealth' | 'customer-service' | 'trading' | 'document-intel' | 'internal-ops' | 'regulatory' | 'payments' | 'fraud' | 'market-surveillance' | 'general';
type Framework = 'SR 26-2' | 'OSFI E-23' | 'NIST AI RMF' | 'EU AI Act' | 'FFIEC' | 'SOX' | 'GDPR' | 'CCPA';

interface ContentFilter {
  type: string;
  inputStrength: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  outputStrength: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
}

interface PiiEntity {
  type: string;
  action: 'BLOCK' | 'ANONYMIZE';
}

interface DeniedTopic {
  name: string;
  definition: string;
  examples: string[];
}

interface WordFilter {
  enableProfanity: boolean;
  blockedWords: string[];
}

interface ContextualGrounding {
  enabled: boolean;
  groundingThreshold: number;
  relevanceThreshold: number;
}

interface AutomatedReasoning {
  enabled: boolean;
  description?: string;
}

export interface FSITemplate {
  id: string;
  useCaseId: string;
  name: string;
  shortName: string;
  description: string;
  detailedDescription: string;
  icon: IconName;
  useCase: UseCase;
  category: FSICategory;
  riskTier: RiskTier;
  frameworks: Framework[];
  tags: string[];
  controls: {
    contentFilters: ContentFilter[];
    piiEntities: PiiEntity[];
    deniedTopics: DeniedTopic[];
    wordFilter: WordFilter;
    contextualGrounding: ContextualGrounding;
    automatedReasoning: AutomatedReasoning;
  };
  bestPractices: string[];
  warnings: string[];
}

const FSI_CATEGORIES: Record<FSICategory, { label: string; color: string; bg: string }> = {
  'AWS': { label: 'AWS Best Practice', color: 'text-orange-700', bg: 'bg-orange-50' },
  'B': { label: 'Banking', color: 'text-blue-700', bg: 'bg-blue-50' },
  'P': { label: 'Payments', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  'R': { label: 'Risk & Compliance', color: 'text-red-700', bg: 'bg-red-50' },
  'C': { label: 'Capital Markets', color: 'text-violet-700', bg: 'bg-violet-50' },
  'I': { label: 'Insurance', color: 'text-amber-700', bg: 'bg-amber-50' },
  'O': { label: 'Operations', color: 'text-teal-700', bg: 'bg-teal-50' },
};

const USE_CASE_META: Record<UseCase, { label: string; icon: IconName; color: string }> = {
  'aml-kyc': { label: 'AML/KYC', icon: 'search', color: '#8b5cf6' },
  'credit': { label: 'Credit & Lending', icon: 'credit-card', color: '#3b82f6' },
  'claims': { label: 'Claims Processing', icon: 'clipboard', color: '#f59e0b' },
  'wealth': { label: 'Wealth Advisory', icon: 'currency-dollar', color: '#3b82f6' },
  'customer-service': { label: 'Customer Service', icon: 'chat-bubble', color: '#06b6d4' },
  'trading': { label: 'Trading & Markets', icon: 'chart-line', color: '#8b5cf6' },
  'document-intel': { label: 'Document Intelligence', icon: 'document-text', color: '#14b8a6' },
  'internal-ops': { label: 'Internal Operations', icon: 'cog', color: '#14b8a6' },
  'payments': { label: 'Payments', icon: 'banknotes', color: '#10b981' },
  'fraud': { label: 'Fraud Detection', icon: 'shield-check', color: '#ef4444' },
  'market-surveillance': { label: 'Market Surveillance', icon: 'eye', color: '#8b5cf6' },
  'general': { label: 'General Purpose', icon: 'shield', color: '#f97316' },
  'regulatory': { label: 'Regulatory Reporting', icon: 'chart-bar', color: '#ec4899' },
};

const RISK_TIER_META: Record<RiskTier, { color: string; bg: string }> = {
  'Critical': { color: '#dc2626', bg: 'bg-red-50' },
  'High': { color: '#ea580c', bg: 'bg-orange-50' },
  'Medium': { color: '#d97706', bg: 'bg-amber-50' },
  'Low': { color: '#16a34a', bg: 'bg-emerald-50' },
};

const FSI_TEMPLATES: FSITemplate[] = [
  // AWS Best Practice - General purpose guardrail following AWS recommendations
  {
    id: 'aws-best-practice',
    useCaseId: 'AWS',
    name: 'AWS Best Practice Guardrail',
    shortName: 'AWS Starter',
    description: 'Recommended starting point for all Bedrock users based on AWS best practices with automated reasoning enabled.',
    detailedDescription: 'General-purpose guardrail following AWS best practices for Amazon Bedrock. Start with HIGH filter strength for maximum protection, then tune down based on false positive analysis. Includes content filtering, PII protection, prompt attack prevention, and automated reasoning for compliance validation. Recommended as a baseline for all production deployments.',
    icon: 'shield-check' as IconName,
    useCase: 'general',
    category: 'AWS',
    riskTier: 'Medium',
    frameworks: ['NIST AI RMF'],
    tags: ['AWS', 'best-practice', 'starter', 'all-purpose', 'reasoning'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'EMAIL', action: 'ANONYMIZE' },
        { type: 'PHONE', action: 'ANONYMIZE' },
        { type: 'NAME', action: 'ANONYMIZE' },
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        { type: 'CREDIT_DEBIT_CARD_CVV', action: 'BLOCK' },
        { type: 'CREDIT_DEBIT_CARD_EXPIRY', action: 'BLOCK' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'BLOCK' },
        { type: 'US_BANK_ROUTING_NUMBER', action: 'BLOCK' },
      ],
      deniedTopics: [
        {
          name: 'Illegal Activities',
          definition: 'Questions or instructions related to illegal activities including hacking, fraud, or circumventing security controls',
          examples: [
            'How to hack into a system',
            'Ways to commit fraud',
            'How to bypass security measures',
          ],
        },
        {
          name: 'Harmful Content Generation',
          definition: 'Requests to generate content that could cause harm to individuals or organizations',
          examples: [
            'Write malware code',
            'Create phishing emails',
            'Generate fake identity documents',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: [] },
      contextualGrounding: { enabled: false, groundingThreshold: 0.7, relevanceThreshold: 0.7 },
      automatedReasoning: { enabled: true, description: 'Validates responses against defined policies and compliance requirements' },
    },
    bestPractices: [
      'Start with HIGH filter strength, then tune down based on false positive analysis',
      'Use detect mode first to test behavior without blocking production traffic',
      'Use Standard tier for better accuracy and broader language support',
      'Use numerical versions in production, not DRAFT',
      'For multi-turn conversations, evaluate only recent turns to avoid false positives',
      'Consider parallelizing input validation and LLM inference for latency-sensitive apps',
    ],
    warnings: [
      'This is a starting point - tune filter strengths based on your specific use case',
      'Review false positive rates before reducing filter strengths',
      'Automated reasoning requires policy definitions to be effective',
    ],
  },

  // AML/KYC Compliance - aligns with R01 (AML Transaction Monitoring)
  {
    id: 'aml-kyc-screening',
    useCaseId: 'R01',
    name: 'AML/KYC Compliance Guardrail',
    shortName: 'AML/KYC',
    description: 'BSA/AML screening and sanctions compliance for customer onboarding and transaction monitoring.',
    detailedDescription: 'Comprehensive guardrail for anti-money laundering and know-your-customer processes. Blocks attempts to circumvent AML controls, protects sensitive customer identification data, and ensures compliance with BSA, OFAC sanctions, and FinCEN requirements.',
    icon: 'search' as IconName,
    useCase: 'aml-kyc',
    category: 'R',
    riskTier: 'Critical',
    frameworks: ['SR 26-2', 'FFIEC', 'NIST AI RMF'],
    tags: ['BSA', 'OFAC', 'FinCEN', 'sanctions', 'onboarding'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'ANONYMIZE' },
        { type: 'US_PASSPORT_NUMBER', action: 'ANONYMIZE' },
        { type: 'DRIVER_ID', action: 'ANONYMIZE' },
        { type: 'ADDRESS', action: 'ANONYMIZE' },
        { type: 'PHONE', action: 'ANONYMIZE' },
        { type: 'EMAIL', action: 'ANONYMIZE' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'BLOCK' },
        { type: 'US_BANK_ROUTING_NUMBER', action: 'BLOCK' },
      ],
      deniedTopics: [
        {
          name: 'AML Circumvention',
          definition: 'Any advice or techniques to avoid or circumvent anti-money laundering controls, reporting thresholds, or sanctions screening',
          examples: [
            'How to structure transactions to avoid reporting',
            'Ways to hide the source of funds',
            'How to avoid sanctions screening',
          ],
        },
        {
          name: 'Identity Fraud Assistance',
          definition: 'Assistance with creating false identities, forging documents, or deceiving KYC processes',
          examples: [
            'How to create a fake ID',
            'Ways to pass KYC with false documents',
            'How to open accounts with stolen identity',
          ],
        },
        {
          name: 'Shell Company Setup',
          definition: 'Instructions for creating opaque corporate structures to hide beneficial ownership',
          examples: [
            'How to set up anonymous shell companies',
            'Ways to hide beneficial ownership',
            'Offshore account setup to avoid detection',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: ['launder', 'smuggle', 'terrorist financing'] },
      contextualGrounding: { enabled: true, groundingThreshold: 0.8, relevanceThreshold: 0.8 },
      automatedReasoning: { enabled: true, description: 'Validates AML/KYC decisions against regulatory requirements' },
    },
    bestPractices: [
      'Enable audit logging for all AML-related queries',
      'Require human review for high-risk customer classifications',
      'Integrate with sanctions screening systems for real-time checks',
      'Maintain evidence of guardrail effectiveness for examiner requests',
    ],
    warnings: [
      'This guardrail does not replace required SAR filing obligations',
      'Manual review required for politically exposed persons (PEPs)',
    ],
  },

  // Credit Decisioning - aligns with B01 (KYC Risk Assessment)
  {
    id: 'credit-decisioning',
    useCaseId: 'B01',
    name: 'Fair Lending & Credit Guardrail',
    shortName: 'Credit',
    description: 'Ensures fair lending compliance and prevents discriminatory credit decisions.',
    detailedDescription: 'Guardrail designed for credit decisioning, underwriting, and lending workflows. Blocks protected class factors from influencing decisions, requires explainability for adverse actions, and ensures ECOA/Reg B compliance.',
    icon: 'credit-card' as IconName,
    useCase: 'credit',
    category: 'B',
    riskTier: 'Critical',
    frameworks: ['SR 26-2', 'FFIEC', 'NIST AI RMF', 'EU AI Act'],
    tags: ['ECOA', 'Reg B', 'fair lending', 'underwriting', 'adverse action'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'ANONYMIZE' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'ANONYMIZE' },
        { type: 'ADDRESS', action: 'ANONYMIZE' },
      ],
      deniedTopics: [
        {
          name: 'Protected Class Factors',
          definition: 'Any use of race, color, religion, national origin, sex, marital status, age, or public assistance status in credit decisions',
          examples: [
            'Consider the applicant\'s race when deciding',
            'Deny because they live in that neighborhood',
            'Factor in their age for the decision',
          ],
        },
        {
          name: 'Discriminatory Steering',
          definition: 'Directing applicants to different products based on protected characteristics rather than creditworthiness',
          examples: [
            'Offer them the subprime product instead',
            'They should apply for a different loan type',
            'Steer them to higher rate products',
          ],
        },
        {
          name: 'Unexplainable Decisions',
          definition: 'Credit decisions without clear, articulable reasons that can be disclosed to applicants',
          examples: [
            'Just deny it, don\'t explain why',
            'The model says no, that\'s enough',
            'We can\'t tell them the real reason',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: [] },
      contextualGrounding: { enabled: true, groundingThreshold: 0.85, relevanceThreshold: 0.85 },
      automatedReasoning: { enabled: true, description: 'Ensures fair lending compliance and explainable credit decisions' },
    },
    bestPractices: [
      'Require adverse action reason codes for all denials',
      'Log all credit decision factors for fair lending analysis',
      'Conduct regular disparate impact testing',
      'Maintain model documentation per SR 11-7/SR 26-2',
    ],
    warnings: [
      'Ensure adverse action notices are generated within required timeframes',
      'This guardrail supports but does not replace fair lending testing programs',
    ],
  },

  // Claims Processing - aligns with I01 (Claims Processing)
  {
    id: 'claims-processing',
    useCaseId: 'I01',
    name: 'Insurance Claims Guardrail',
    shortName: 'Claims',
    description: 'Protects claims processing with fraud detection and policy accuracy requirements.',
    detailedDescription: 'Guardrail for insurance claims adjudication and processing. Enforces grounding to policy terms, blocks fraud facilitation, and protects sensitive medical and claims data while ensuring fair claims handling.',
    icon: 'clipboard' as IconName,
    useCase: 'claims',
    category: 'I',
    riskTier: 'High',
    frameworks: ['NIST AI RMF', 'SR 26-2', 'GDPR'],
    tags: ['insurance', 'adjudication', 'fraud', 'medical', 'HIPAA'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
        { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'ANONYMIZE' },
        { type: 'ADDRESS', action: 'ANONYMIZE' },
        { type: 'PHONE', action: 'ANONYMIZE' },
        { type: 'EMAIL', action: 'ANONYMIZE' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'ANONYMIZE' },
      ],
      deniedTopics: [
        {
          name: 'Claims Fraud Facilitation',
          definition: 'Assistance with filing false claims, exaggerating damages, or staging incidents',
          examples: [
            'How to make the damage look worse',
            'Ways to inflate my claim amount',
            'How to file for something that didn\'t happen',
          ],
        },
        {
          name: 'Policy Misrepresentation',
          definition: 'Advice on misrepresenting facts on insurance applications or claims',
          examples: [
            'Should I hide my pre-existing condition',
            'How to not disclose prior claims',
            'Can I say I wasn\'t at fault',
          ],
        },
        {
          name: 'Bad Faith Practices',
          definition: 'Suggestions for denying valid claims or delaying payments inappropriately',
          examples: [
            'Find a reason to deny this claim',
            'How to delay payment as long as possible',
            'Ways to reduce the payout unfairly',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: [] },
      contextualGrounding: { enabled: true, groundingThreshold: 0.9, relevanceThreshold: 0.85 },
      automatedReasoning: { enabled: true, description: 'Validates claims decisions against policy terms and coverage rules' },
    },
    bestPractices: [
      'Ground all coverage determinations to specific policy language',
      'Require human review for claim denials above threshold amounts',
      'Log reasoning for all adjudication decisions',
      'Integrate with fraud detection systems for high-risk claims',
    ],
    warnings: [
      'Medical claims may require HIPAA-compliant data handling beyond this guardrail',
      'State insurance regulations may impose additional requirements',
    ],
  },

  // Wealth Advisory - aligns with B09 (Wealth Management)
  {
    id: 'wealth-advisory',
    useCaseId: 'B09',
    name: 'Wealth & Investment Advisory Guardrail',
    shortName: 'Wealth',
    description: 'Suitability guardrails for investment advice with risk disclosure requirements.',
    detailedDescription: 'Guardrail for wealth management and investment advisory applications. Ensures suitability requirements, blocks unauthorized investment advice, enforces risk disclosures, and maintains compliance with Reg BI and fiduciary standards.',
    icon: 'currency-dollar' as IconName,
    useCase: 'wealth',
    category: 'B',
    riskTier: 'Critical',
    frameworks: ['SR 26-2', 'NIST AI RMF', 'EU AI Act'],
    tags: ['Reg BI', 'fiduciary', 'suitability', 'investment', 'advice'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
        { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'ANONYMIZE' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        { type: 'ADDRESS', action: 'ANONYMIZE' },
      ],
      deniedTopics: [
        {
          name: 'Unsuitable Recommendations',
          definition: 'Investment recommendations without considering client risk tolerance, time horizon, and financial situation',
          examples: [
            'Put all your money in this stock',
            'This is guaranteed to make money',
            'You should leverage your portfolio',
          ],
        },
        {
          name: 'Unlicensed Advice',
          definition: 'Specific investment recommendations that require securities licensing',
          examples: [
            'Buy this specific stock now',
            'Sell all your bonds immediately',
            'Allocate 50% to this fund',
          ],
        },
        {
          name: 'Missing Risk Disclosures',
          definition: 'Investment discussions without appropriate risk warnings and disclosures',
          examples: [
            'This investment has no risk',
            'You can\'t lose money on this',
            'Past performance guarantees future results',
          ],
        },
        {
          name: 'Insider Information',
          definition: 'Use of material non-public information in investment recommendations',
          examples: [
            'I heard they\'re about to announce',
            'Before the earnings come out, you should',
            'The merger hasn\'t been announced yet but',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: ['guaranteed returns', 'no risk', 'sure thing'] },
      contextualGrounding: { enabled: true, groundingThreshold: 0.8, relevanceThreshold: 0.8 },
      automatedReasoning: { enabled: true, description: 'Validates suitability requirements and fiduciary compliance' },
    },
    bestPractices: [
      'Always include standard risk disclosures in investment discussions',
      'Document client suitability profile before providing recommendations',
      'Require human advisor review for complex product recommendations',
      'Maintain audit trail of all advice provided',
    ],
    warnings: [
      'AI cannot replace licensed investment advisor judgment for suitability',
      'Reg BI and fiduciary requirements extend beyond this guardrail',
    ],
  },

  // Customer Service (Enhanced) - aligns with B02 (Customer Service Agent)
  {
    id: 'customer-service-enhanced',
    useCaseId: 'B02',
    name: 'Customer Service Excellence Guardrail',
    shortName: 'Service',
    description: 'Balanced protection for customer-facing AI with empathy and accuracy requirements.',
    detailedDescription: 'Enhanced guardrail for customer service applications across banking, insurance, and financial services. Balances safety controls with natural conversation, protects customer data, and ensures accurate information delivery.',
    icon: 'chat-bubble' as IconName,
    useCase: 'customer-service',
    category: 'O',
    riskTier: 'Medium',
    frameworks: ['NIST AI RMF', 'GDPR', 'CCPA'],
    tags: ['chatbot', 'support', 'banking', 'insurance', 'contact center'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
        { type: 'INSULTS', inputStrength: 'LOW', outputStrength: 'HIGH' },
        { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'VIOLENCE', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
        { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'EMAIL', action: 'ANONYMIZE' },
        { type: 'PHONE', action: 'ANONYMIZE' },
        { type: 'ADDRESS', action: 'ANONYMIZE' },
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        { type: 'CREDIT_DEBIT_CARD_CVV', action: 'BLOCK' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'BLOCK' },
      ],
      deniedTopics: [
        {
          name: 'Unauthorized Account Actions',
          definition: 'Processing account changes or transactions without proper authentication',
          examples: [
            'Just transfer the money without verification',
            'Change my password without security questions',
            'Close the account immediately',
          ],
        },
        {
          name: 'Complaint Suppression',
          definition: 'Discouraging customers from filing formal complaints or regulatory reports',
          examples: [
            'You don\'t need to file a complaint',
            'The regulator won\'t help you',
            'Don\'t report this to anyone',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: [] },
      contextualGrounding: { enabled: true, groundingThreshold: 0.7, relevanceThreshold: 0.7 },
      automatedReasoning: { enabled: false },
    },
    bestPractices: [
      'Implement seamless escalation to human agents',
      'Track customer satisfaction with AI interactions',
      'Provide clear disclosure that customer is speaking with AI',
      'Log all conversations for quality assurance',
    ],
    warnings: [
      'Ensure proper authentication before any account-specific actions',
      'Complex complaints should be escalated to human agents',
    ],
  },

  // Trading & Markets - aligns with C01 (Market Surveillance)
  {
    id: 'trading-surveillance',
    useCaseId: 'C01',
    name: 'Trading & Market Surveillance Guardrail',
    shortName: 'Trading',
    description: 'Blocks market manipulation and insider trading advice for capital markets.',
    detailedDescription: 'Comprehensive guardrail for trading desks, capital markets, and market surveillance applications. Blocks insider trading facilitation, market manipulation strategies, and unauthorized trading advice while maintaining compliance with SEC/FINRA requirements.',
    icon: 'chart-line' as IconName,
    useCase: 'trading',
    category: 'C',
    riskTier: 'Critical',
    frameworks: ['SR 26-2', 'NIST AI RMF'],
    tags: ['SEC', 'FINRA', 'insider trading', 'market manipulation', 'capital markets'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
        { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'ANONYMIZE' },
      ],
      deniedTopics: [
        {
          name: 'Insider Trading',
          definition: 'Trading based on or sharing material non-public information',
          examples: [
            'Buy before the earnings announcement',
            'I heard about the merger, what should I do',
            'The CEO told me they\'re beating estimates',
          ],
        },
        {
          name: 'Market Manipulation',
          definition: 'Strategies to artificially influence security prices',
          examples: [
            'How to pump and dump a stock',
            'Coordinating trades to move the price',
            'Spoofing order strategies',
          ],
        },
        {
          name: 'Front Running',
          definition: 'Trading ahead of known client orders',
          examples: [
            'Buy before we execute the client order',
            'The client is about to place a large order',
            'Trade ahead of the block',
          ],
        },
        {
          name: 'Wash Trading',
          definition: 'Creating artificial trading activity through self-dealing',
          examples: [
            'How to create fake volume',
            'Trading with myself to show activity',
            'Circular trading strategies',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: ['pump and dump', 'spoof', 'layering'] },
      contextualGrounding: { enabled: false, groundingThreshold: 0.7, relevanceThreshold: 0.7 },
      automatedReasoning: { enabled: true, description: 'Validates trading communications against market manipulation rules' },
    },
    bestPractices: [
      'Integrate with trade surveillance systems',
      'Maintain communication logs for regulatory review',
      'Flag conversations mentioning specific securities for review',
      'Require pre-clearance references for personal trading discussions',
    ],
    warnings: [
      'All trading-related communications are subject to regulatory retention',
      'This guardrail supplements but does not replace surveillance systems',
    ],
  },

  // Document Intelligence - aligns with O01 (Document Processing)
  {
    id: 'document-intelligence',
    useCaseId: 'O01',
    name: 'Document Intelligence Guardrail',
    shortName: 'DocIntel',
    description: 'High-accuracy extraction with strict grounding for contract and statement parsing.',
    detailedDescription: 'Guardrail optimized for document processing, contract analysis, and statement extraction. Enforces extremely high grounding thresholds to prevent hallucination, protects extracted PII, and ensures extracted information matches source documents.',
    icon: 'document-text' as IconName,
    useCase: 'document-intel',
    category: 'O',
    riskTier: 'High',
    frameworks: ['NIST AI RMF', 'SR 26-2', 'GDPR'],
    tags: ['extraction', 'contracts', 'statements', 'OCR', 'parsing'],
    controls: {
      contentFilters: [
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'ANONYMIZE' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'ANONYMIZE' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'ANONYMIZE' },
        { type: 'ADDRESS', action: 'ANONYMIZE' },
        { type: 'PHONE', action: 'ANONYMIZE' },
        { type: 'EMAIL', action: 'ANONYMIZE' },
      ],
      deniedTopics: [
        {
          name: 'Fabricated Information',
          definition: 'Generating information not present in the source document',
          examples: [
            'Add this clause to the summary',
            'Include information not in the document',
            'Make up the missing details',
          ],
        },
        {
          name: 'Document Modification',
          definition: 'Instructions to alter, forge, or misrepresent document contents',
          examples: [
            'Change the date on this contract',
            'Modify the signature',
            'Alter the terms shown',
          ],
        },
      ],
      wordFilter: { enableProfanity: false, blockedWords: [] },
      contextualGrounding: { enabled: true, groundingThreshold: 0.95, relevanceThreshold: 0.9 },
      automatedReasoning: { enabled: true, description: 'Ensures extracted information matches source documents exactly' },
    },
    bestPractices: [
      'Always cite source document and page/section for extracted data',
      'Implement confidence scores for extracted fields',
      'Require human verification for high-value extractions',
      'Maintain audit trail linking extractions to source documents',
    ],
    warnings: [
      'Extremely high grounding thresholds may reject valid extractions - tune for your use case',
      'OCR quality affects extraction accuracy independent of guardrails',
    ],
  },

  // Internal Operations - aligns with O02 (Back Office Automation)
  {
    id: 'internal-operations',
    useCaseId: 'O02',
    name: 'Internal Operations Guardrail',
    shortName: 'Internal',
    description: 'Lighter content filtering with strict PII controls for back-office automation.',
    detailedDescription: 'Guardrail designed for internal employee-facing applications and back-office automation. Relaxed content filtering for business communications while maintaining strict PII protection and audit logging requirements.',
    icon: 'cog' as IconName,
    useCase: 'internal-ops',
    category: 'O',
    riskTier: 'Low',
    frameworks: ['NIST AI RMF', 'SOX'],
    tags: ['automation', 'back-office', 'employee', 'internal', 'operations'],
    controls: {
      contentFilters: [
        { type: 'HATE', inputStrength: 'LOW', outputStrength: 'MEDIUM' },
        { type: 'SEXUAL', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
        { type: 'VIOLENCE', inputStrength: 'LOW', outputStrength: 'MEDIUM' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'ANONYMIZE' },
        { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'ANONYMIZE' },
        { type: 'US_BANK_ACCOUNT_NUMBER', action: 'ANONYMIZE' },
      ],
      deniedTopics: [
        {
          name: 'Control Circumvention',
          definition: 'Attempts to bypass internal controls, approval processes, or segregation of duties',
          examples: [
            'How to approve my own request',
            'Ways to bypass the approval workflow',
            'Skip the review process',
          ],
        },
      ],
      wordFilter: { enableProfanity: false, blockedWords: [] },
      contextualGrounding: { enabled: false, groundingThreshold: 0.7, relevanceThreshold: 0.7 },
      automatedReasoning: { enabled: false },
    },
    bestPractices: [
      'Ensure proper access controls to internal AI tools',
      'Log all queries for SOX compliance where applicable',
      'Integrate with identity management for user attribution',
      'Regular review of query patterns for misuse detection',
    ],
    warnings: [
      'Internal use does not eliminate compliance obligations',
      'Employee PII still requires protection under various regulations',
    ],
  },

  // Regulatory Reporting - aligns with R05 (Regulatory Reporting)
  {
    id: 'regulatory-reporting',
    useCaseId: 'R05',
    name: 'Regulatory Reporting Guardrail',
    shortName: 'RegReport',
    description: 'High-accuracy guardrails for compliance filings with evidence requirements.',
    detailedDescription: 'Guardrail for AI-assisted regulatory reporting and compliance filings. Ensures factual accuracy through high grounding thresholds, blocks speculation, and requires evidence-based responses suitable for regulatory submission.',
    icon: 'chart-bar' as IconName,
    useCase: 'regulatory',
    category: 'R',
    riskTier: 'Critical',
    frameworks: ['SR 26-2', 'FFIEC', 'SOX', 'EU AI Act'],
    tags: ['compliance', 'filings', 'Call Report', 'FR Y-9C', 'regulatory'],
    controls: {
      contentFilters: [
        { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
        { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
      ],
      piiEntities: [
        { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
      ],
      deniedTopics: [
        {
          name: 'Speculative Statements',
          definition: 'Unsupported assertions or projections without factual basis',
          examples: [
            'I think the number is probably',
            'It should be around this amount',
            'We can estimate without the data',
          ],
        },
        {
          name: 'Regulatory Evasion',
          definition: 'Advice on avoiding, delaying, or minimizing regulatory reporting obligations',
          examples: [
            'We don\'t need to report this',
            'How to reduce our reported figures',
            'Ways to delay the filing',
          ],
        },
        {
          name: 'Misleading Disclosures',
          definition: 'Creating technically true but misleading regulatory disclosures',
          examples: [
            'Word it so they won\'t ask questions',
            'Hide this in the footnotes',
            'Make it hard to find in the filing',
          ],
        },
      ],
      wordFilter: { enableProfanity: true, blockedWords: ['approximately', 'roughly', 'guessing'] },
      contextualGrounding: { enabled: true, groundingThreshold: 0.95, relevanceThreshold: 0.95 },
      automatedReasoning: { enabled: true, description: 'Validates regulatory filings against compliance requirements and source data' },
    },
    bestPractices: [
      'Require source citation for all data points in regulatory reports',
      'Implement four-eyes review for AI-generated report sections',
      'Maintain complete audit trail from source to submission',
      'Cross-reference against prior period filings for consistency',
    ],
    warnings: [
      'AI-generated content must be reviewed by qualified personnel before submission',
      'Regulatory filing accuracy is ultimately human responsibility',
    ],
  },
];

export default function FSIGuardrailTemplates({ onApplyTemplate, onClose }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<FSITemplate | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FSICategory | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<RiskTier | 'all'>('all');
  const [frameworkFilter, setFrameworkFilter] = useState<Framework | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = useMemo(() => {
    return FSI_TEMPLATES.filter(t => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (riskFilter !== 'all' && t.riskTier !== riskFilter) return false;
      if (frameworkFilter !== 'all' && !t.frameworks.includes(frameworkFilter)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some(tag => tag.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [categoryFilter, riskFilter, frameworkFilter, searchQuery]);

  const allFrameworks = Array.from(new Set(FSI_TEMPLATES.flatMap(t => t.frameworks))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">FSI Guardrail Template Library</h2>
          <p className="text-sm text-slate-500 mt-1">
            Pre-configured guardrails for financial services use cases with regulatory alignment
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search templates, tags, or frameworks..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-all duration-150 focus:border-blue-400 pr-4"
          style={{ paddingLeft: '2.75rem' }}
        />
      </div>

      {/* Category Filter - FSI Foundry Style */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
            categoryFilter === 'all'
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          All ({FSI_TEMPLATES.length})
        </button>
        {Object.entries(FSI_CATEGORIES).map(([key, meta]) => {
          const count = FSI_TEMPLATES.filter(t => t.category === key).length;
          if (!count) return null;
          return (
            <button
              key={key}
              onClick={() => setCategoryFilter(categoryFilter === key ? 'all' : key as FSICategory)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                categoryFilter === key
                  ? 'bg-slate-800 text-white'
                  : `bg-white ${meta.color} border border-slate-200 hover:border-slate-300`
              }`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Additional Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value as RiskTier | 'all')}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">All Risk Tiers</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          value={frameworkFilter}
          onChange={e => setFrameworkFilter(e.target.value as Framework | 'all')}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">All Frameworks</option>
          {allFrameworks.map(fw => (
            <option key={fw} value={fw}>{fw}</option>
          ))}
        </select>

        <span className="text-xs text-slate-500 ml-auto">{filteredTemplates.length} templates</span>
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Template List */}
        <div className="flex-1 space-y-3 max-h-[600px] overflow-y-auto pr-2">
          {filteredTemplates.map(template => {
            const useCaseMeta = USE_CASE_META[template.useCase];
            const riskMeta = RISK_TIER_META[template.riskTier];
            const categoryMeta = FSI_CATEGORIES[template.category];
            const isSelected = selectedTemplate?.id === template.id;

            return (
              <div
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${useCaseMeta.color}15`, color: useCaseMeta.color }}
                  >
                    <Icon name={template.icon} className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${categoryMeta.bg} ${categoryMeta.color}`}>
                        {template.useCaseId}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900 truncate">{template.name}</h3>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{ backgroundColor: `${riskMeta.color}15`, color: riskMeta.color }}
                      >
                        {template.riskTier}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{template.description}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${useCaseMeta.color}15`, color: useCaseMeta.color }}
                      >
                        {useCaseMeta.label}
                      </span>
                      {template.frameworks.slice(0, 2).map(fw => (
                        <span key={fw} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {fw}
                        </span>
                      ))}
                      {template.frameworks.length > 2 && (
                        <span className="text-[10px] text-slate-400">+{template.frameworks.length - 2}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredTemplates.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Icon name="search" className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">No templates match your filters</p>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="w-[400px] flex-shrink-0">
          {selectedTemplate ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden sticky top-0">
              {/* Preview Header */}
              <div
                className="px-5 py-4 border-b"
                style={{ backgroundColor: `${USE_CASE_META[selectedTemplate.useCase].color}10` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${USE_CASE_META[selectedTemplate.useCase].color}20`, color: USE_CASE_META[selectedTemplate.useCase].color }}
                  >
                    <Icon name={selectedTemplate.icon} className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${FSI_CATEGORIES[selectedTemplate.category].bg} ${FSI_CATEGORIES[selectedTemplate.category].color}`}>
                        {selectedTemplate.useCaseId}
                      </span>
                      <h3 className="text-base font-semibold text-slate-900">{selectedTemplate.shortName}</h3>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{FSI_CATEGORIES[selectedTemplate.category].label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: `${RISK_TIER_META[selectedTemplate.riskTier].color}15`,
                          color: RISK_TIER_META[selectedTemplate.riskTier].color,
                        }}
                      >
                        {selectedTemplate.riskTier} Risk
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview Content */}
              <div className="p-5 space-y-4 max-h-[450px] overflow-y-auto">
                <p className="text-sm text-slate-600">{selectedTemplate.detailedDescription}</p>

                {/* Controls Summary */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Controls Included</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-lg font-bold text-slate-900">{selectedTemplate.controls.contentFilters.length}</div>
                      <div className="text-[10px] text-slate-500">Content Filters</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-lg font-bold text-slate-900">{selectedTemplate.controls.piiEntities.length}</div>
                      <div className="text-[10px] text-slate-500">PII Entities</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-lg font-bold text-slate-900">{selectedTemplate.controls.deniedTopics.length}</div>
                      <div className="text-[10px] text-slate-500">Denied Topics</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-lg font-bold text-slate-900">
                        {selectedTemplate.controls.contextualGrounding.enabled ? 'Yes' : 'No'}
                      </div>
                      <div className="text-[10px] text-slate-500">Grounding</div>
                    </div>
                    <div className={`p-2 rounded-lg ${selectedTemplate.controls.automatedReasoning.enabled ? 'bg-purple-50' : 'bg-slate-50'}`}>
                      <div className={`text-lg font-bold ${selectedTemplate.controls.automatedReasoning.enabled ? 'text-purple-700' : 'text-slate-900'}`}>
                        {selectedTemplate.controls.automatedReasoning.enabled ? 'Yes' : 'No'}
                      </div>
                      <div className={`text-[10px] ${selectedTemplate.controls.automatedReasoning.enabled ? 'text-purple-600' : 'text-slate-500'}`}>Reasoning</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-lg font-bold text-slate-900">
                        {selectedTemplate.controls.wordFilter.enableProfanity ? 'Yes' : 'No'}
                      </div>
                      <div className="text-[10px] text-slate-500">Profanity Filter</div>
                    </div>
                  </div>
                </div>

                {/* Automated Reasoning Description */}
                {selectedTemplate.controls.automatedReasoning.enabled && selectedTemplate.controls.automatedReasoning.description && (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span className="text-xs font-semibold text-purple-800">Automated Reasoning Enabled</span>
                    </div>
                    <p className="text-[11px] text-purple-700">{selectedTemplate.controls.automatedReasoning.description}</p>
                  </div>
                )}

                {/* Denied Topics Preview */}
                {selectedTemplate.controls.deniedTopics.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Denied Topics</h4>
                    <div className="space-y-2">
                      {selectedTemplate.controls.deniedTopics.map((topic, i) => (
                        <div key={i} className="p-2 bg-red-50 rounded-lg border border-red-100">
                          <div className="text-xs font-semibold text-red-800">{topic.name}</div>
                          <div className="text-[10px] text-red-600 mt-0.5 line-clamp-2">{topic.definition}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Frameworks */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Regulatory Alignment</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.frameworks.map(fw => (
                      <span key={fw} className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-700 font-medium">
                        {fw}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Best Practices */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Best Practices</h4>
                  <ul className="space-y-1">
                    {selectedTemplate.bestPractices.map((bp, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                        <Icon name="check" className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span>{bp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Warnings */}
                {selectedTemplate.warnings.length > 0 && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <h4 className="text-xs font-semibold text-amber-800 mb-1">Important Notes</h4>
                    <ul className="space-y-1">
                      {selectedTemplate.warnings.map((w, i) => (
                        <li key={i} className="text-[11px] text-amber-700 flex items-start gap-2">
                          <Icon name="exclamation-triangle" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Apply Button */}
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => onApplyTemplate(selectedTemplate)}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  Apply This Template
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center sticky top-0">
              <Icon name="arrow-left" className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500">Select a template to preview its configuration</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { FSI_TEMPLATES };
