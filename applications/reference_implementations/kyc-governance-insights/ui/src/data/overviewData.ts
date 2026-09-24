export interface StatCard {
  value: string;
  label: string;
  colorClass: string;
}

export interface TechStackCard {
  label: string;
  name: string;
  description: string;
  url?: string;
}

export interface UseCaseCard {
  icon: string;
  title: string;
  description: string;
  iconColor: string;
}

export const overviewStats: StatCard[] = [
  { value: '94.7%', label: 'Task Completion (test data)', colorClass: 'mv-green' },
  { value: '40s', label: 'Avg Processing', colorClass: 'mv-blue' },
  { value: '98.3%', label: 'Tool Accuracy', colorClass: 'mv-green' },
  { value: '0', label: 'Safety Violations', colorClass: 'mv-red' },
];

export const techStackCards: TechStackCard[] = [
  { label: 'Runtime', name: 'Amazon Bedrock AgentCore', description: 'Managed container runtime for multi-agent orchestration', url: 'https://aws.amazon.com/bedrock/agentcore/' },
  { label: 'LLM', name: 'Claude Sonnet 4.5 (Bedrock)', description: 'Foundation model for financial reasoning and compliance analysis', url: 'https://aws.amazon.com/bedrock/' },
  { label: 'Framework', name: 'LangGraph', description: 'Agent orchestration with parallel execution support' },
  { label: 'API Layer', name: 'API Gateway + Lambda', description: 'Serverless async invoke pattern with proxy/worker split', url: 'https://aws.amazon.com/lambda/' },
  { label: 'State Store', name: 'DynamoDB', description: 'Session tracking with TTL-based automatic cleanup', url: 'https://aws.amazon.com/dynamodb/' },
  { label: 'CDN & Hosting', name: 'CloudFront + S3', description: 'SPA hosting with origin access control and /api routing', url: 'https://aws.amazon.com/cloudfront/' },
];

export const useCaseCards: UseCaseCard[] = [
  { icon: '🔄', title: 'Full Lifecycle', description: '7-step KYC assessment pipeline from data ingestion through to immutable audit — with risks and controls at every stage.', iconColor: '#0052CC' },
  { icon: '🛡️', title: 'Defence in Depth', description: 'Probabilistic (GenAI) + Deterministic (Policy Engine, Lambda) + Observability — layered controls that cannot be bypassed by the AI.', iconColor: '#36b37e' },
  { icon: '👤', title: 'Human-in-the-Loop', description: 'Where humans are required, where agents have earned autonomy, and how the system escalates based on risk thresholds.', iconColor: '#ff991f' },
  { icon: '📐', title: 'Earned Autonomy', description: 'Tiered progression from 100% supervised to autonomous — based on continuous evaluation and track record.', iconColor: '#0052CC' },
  { icon: '⚠️', title: 'Agentic AI Risks', description: 'Hallucination, prompt injection, blast radius, model drift — real risks mapped to real AWS service controls.', iconColor: '#de350b' },
  { icon: '📄', title: 'End-to-End Output', description: 'Complete KYC report generation for Acme Corporation — credit risk scoring, compliance verification, regulatory notes.', iconColor: '#0052CC' },
];
