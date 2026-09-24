import type { UseCase } from '../types';
import { simStepsApprove, simStepsBlock } from '../../data/simulationData';

export const kycUseCase: UseCase = {
  id: 'kyc',
  name: 'KYC Risk Assessment',
  domain: 'Financial Crime / Compliance',
  description: 'Automated KYC onboarding with credit analysis, sanctions screening, and multi-agent governance controls.',
  agents: [
    {
      id: 'agt-credit-analyst-001',
      name: 'Credit Analyst',
      role: 'Analyses financial statements, credit history, payment behaviour to assess creditworthiness',
      tier: 2,
      allowedTools: ['s3:GetCustomerFinancials', 's3:GetPaymentHistory', 's3:GetCreditScore', 'calculator:RatioCalc'],
      prohibitedTools: ['sanctions:*', 'pep:*'],
      escalationPath: ['Senior Credit Analyst', 'Credit Committee'],
    },
    {
      id: 'agt-compliance-officer-001',
      name: 'Compliance Officer',
      role: 'KYC/AML verification: sanctions screening, PEP checks, adverse media, geographic risk',
      tier: 2,
      allowedTools: ['sanctions:FuzzyMatch', 'pep:Lookup', 'media:AdverseSearch', 'geo:RiskScore', 's3:GetCustomerDocs'],
      prohibitedTools: ['s3:GetCustomerFinancials', 'payments:Transfer', 'accounts:Create'],
      escalationPath: ['Senior Compliance Analyst', 'MLRO'],
    },
  ],
  policies: [
    { id: 'ORG-001', layer: 'ORG', description: 'Sanctions partial match blocks processing', triggerCondition: 'sanctions_match_score > 0.70', action: 'BLOCK' },
    { id: 'ORG-002', layer: 'ORG', description: 'PII access requires consent logging', triggerCondition: 'agent accesses PII without consent_logged', action: 'BLOCK' },
    { id: 'ORG-003', layer: 'ORG', description: 'Rate limit 100 invocations/hour', triggerCondition: 'agent_invocations_1h > 100', action: 'BLOCK' },
    { id: 'APP-001', layer: 'APP', description: 'Credit >£50K requires escalation', triggerCondition: 'facility_amount > 50000', action: 'ESCALATE' },
    { id: 'APP-002', layer: 'APP', description: 'Risk score ≥30 requires escalation', triggerCondition: 'risk_score >= 30', action: 'ESCALATE' },
    { id: 'APP-003', layer: 'APP', description: 'PEP association requires analyst review', triggerCondition: 'pep_level >= 1', action: 'ESCALATE' },
    { id: 'REQ-001', layer: 'REQ', description: 'Cross-border >£100K blocked', triggerCondition: 'cross_border && amount > 100000', action: 'BLOCK' },
  ],
  risks: [
    { id: 'R1', category: 'Hallucination', description: 'Agent fabricates compliance check results', likelihood: 'medium', impact: 'critical', controls: ['Deterministic Lambda', 'Automated Reasoning'], residualRisk: 'low' },
    { id: 'R2', category: 'Sanctions Evasion', description: 'Missed true positive on sanctions list', likelihood: 'low', impact: 'critical', controls: ['Parallel Fuzzy Match', 'Gateway Interceptors'], residualRisk: 'low' },
    { id: 'R3', category: 'Data Poisoning', description: 'Adversarial input manipulates risk score', likelihood: 'low', impact: 'high', controls: ['Bedrock Guardrails', 'Input Validation'], residualRisk: 'low' },
    { id: 'R4', category: 'Calculation Error', description: 'Incorrect financial ratio computation', likelihood: 'medium', impact: 'high', controls: ['Lambda Validator', 'LLM-as-Judge'], residualRisk: 'low' },
    { id: 'R5', category: 'Prompt Injection', description: 'Malicious content in uploaded documents', likelihood: 'medium', impact: 'high', controls: ['Bedrock Guardrails', 'Input Sanitisation'], residualRisk: 'low' },
  ],
  controls: [
    { id: 'C1', name: 'Bedrock Guardrails', type: 'deterministic', awsService: 'Amazon Bedrock', description: 'Content filtering, PII redaction, topic denial' },
    { id: 'C2', name: 'Policy Engine', type: 'deterministic', awsService: 'AgentCore + Lambda', description: '3-layer cascade (Org/App/Request), most restrictive wins' },
    { id: 'C3', name: 'Lambda Validator', type: 'deterministic', awsService: 'AWS Lambda', description: 'Independent recalculation of all numerical outputs' },
    { id: 'C4', name: 'LLM-as-Judge', type: 'probabilistic', awsService: 'Bedrock Claude Sonnet 4.5', description: '5-criterion quality evaluation of agent output' },
    { id: 'C5', name: 'X-Ray Tracing', type: 'observability', awsService: 'AWS X-Ray', description: 'Distributed tracing across all agent tool calls' },
    { id: 'C6', name: 'CloudWatch Alarms', type: 'observability', awsService: 'Amazon CloudWatch', description: 'Real-time alerting on drift, anomalies, SLA breaches' },
  ],
  scenarios: {
    approve: {
      id: 'approve',
      label: 'Acme Corporation Ltd',
      customerName: 'Acme Corporation Ltd',
      customerId: 'CUST001',
      outcome: 'APPROVE',
      steps: simStepsApprove,
    },
    block: {
      id: 'block',
      label: 'Omega Trading Ltd',
      customerName: 'Omega Trading Ltd',
      customerId: 'CUST047',
      outcome: 'BLOCK',
      steps: simStepsBlock,
    },
  },
  hitlStepIndex: 5,
};
