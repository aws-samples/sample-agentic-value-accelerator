/**
 * governanceDimensions — AWS's six agentic-AI security/governance dimensions.
 *
 * Both the AWS Agentic AI Security Scoping Matrix and the AWS public-sector
 * agentic-governance framework enumerate the SAME six dimensions (the matrix
 * calls them "six critical dimensions"). Two names differ in wording between the
 * two sources; we use the public-sector-blog forms as primary and note the
 * matrix variant.
 *
 * Sources:
 * - AWS Agentic AI Security Scoping Matrix — aws.amazon.com/ai/security/agentic-ai-scoping-matrix/
 * - AWS public-sector governance framework —
 *   aws.amazon.com/blogs/publicsector/a-governance-framework-for-building-trustworthy-agentic-ai-for-public-sector-and-regulated-organizations/
 *
 * This gives the Govern module a single canonical control-dimension vocabulary
 * to map existing controls onto, grounded in AWS's framework.
 */

export interface GovernanceDimension {
  id: string;
  /** Primary name (AWS public-sector blog wording). */
  name: string;
  /** Alternate name used by the Scoping Matrix, where it differs. */
  matrixName?: string;
  description: string;
  /** Representative AWS services that implement this dimension. */
  services: string[];
}

export const GOVERNANCE_DIMENSIONS: GovernanceDimension[] = [
  {
    id: 'identity-context',
    name: 'Identity Context',
    description: 'Authentication and authorization across users, services, and agents. Every agent runs under a defined identity with explicit authorization boundaries to preserve traceability and prevent privilege escalation; importance scales with autonomy (delegation, continuous verification).',
    services: ['AWS IAM', 'Just-in-time credentials', 'Trusted identity propagation'],
  },
  {
    id: 'data-memory-state',
    name: 'Data, Memory, and State Protection',
    description: 'Securing persistent and in-flight memory/state across sessions — access controls, encryption, integrity validation, retention/TTL, and session isolation — to prevent memory-poisoning and state tampering.',
    services: ['AWS KMS', 'AWS Secrets Manager', 'Memory isolation & TTL'],
  },
  {
    id: 'audit-logging',
    name: 'Audit and Logging',
    description: 'Comprehensive tracking of agent actions and reasoning chains — both API-level logging ("what happened") and decision-context logging ("why it happened") — escalating to behavioral analytics and tamper-evident logs.',
    services: ['AWS CloudTrail', 'Amazon CloudWatch', 'Bedrock invocation logging'],
  },
  {
    id: 'agent-fm-controls',
    name: 'Agent and Foundation Model (FM) Controls',
    matrixName: 'Agent and FM controls',
    description: 'Guardrails, input/output validation, behavioral constraints, and sandboxing/isolation that prevent harmful outputs or unsafe actions; escalating to anomaly detection and containment.',
    services: ['Amazon Bedrock Guardrails', 'Tool sandboxing', 'Circuit breakers'],
  },
  {
    id: 'agency-boundaries',
    name: 'Agency Boundaries and Policies',
    matrixName: 'Agency perimeters and policies',
    description: 'Clear, enforceable operational limits on what an agent can and cannot do, implemented through technical controls rather than policy documentation alone — shifting from static to dynamic, context-aware boundaries.',
    services: ['IAM permissions boundaries', 'AWS Organizations SCPs', 'Amazon Verified Permissions (Cedar)'],
  },
  {
    id: 'orchestration',
    name: 'Orchestration',
    description: 'The coordination layer managing agent-to-system interaction, tool access, and execution flow via structured workflows, approval gates, and state management; evolving to dynamic multi-agent orchestration.',
    services: ['AWS Step Functions', 'Approval gates', 'Bedrock AgentCore Gateway'],
  },
];

export const getDimension = (id: string) => GOVERNANCE_DIMENSIONS.find(d => d.id === id);
