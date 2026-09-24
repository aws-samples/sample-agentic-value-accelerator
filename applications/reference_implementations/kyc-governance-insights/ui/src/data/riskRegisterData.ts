import { riskControlMapping, controls, services, stepMetadata } from './riskControlMapping';

export interface ControlEntry {
  name: string;
  awsService: string;
  status: 'active' | 'experimental' | 'planned';
}

export interface RiskRow {
  id: string;
  category: string;
  categoryKey: string;
  risk: string;
  riskDescription: string;
  stage: string;
  severity: string;
  severityClass: string;
  controls: ControlEntry[];
  residual: string;
  residualClass: string;
}

const CATEGORY_ASSIGNMENTS: Record<string, { label: string; key: string }> = {
  'injection-document': { label: 'Security', key: 'security' },
  'data-exfiltration': { label: 'Security', key: 'security' },
  'document-forgery': { label: 'Security', key: 'security' },
  'data-source-manipulation': { label: 'Security', key: 'security' },
  'token-manipulation': { label: 'Security', key: 'security' },
  'unauthorised-data-access': { label: 'Security', key: 'security' },

  'hallucination': { label: 'Accuracy', key: 'accuracy' },
  'ocr-error': { label: 'Accuracy', key: 'accuracy' },
  'calculation-error': { label: 'Accuracy', key: 'accuracy' },
  'sanctions-false-negative': { label: 'Accuracy', key: 'accuracy' },
  'false-positive-flooding': { label: 'Accuracy', key: 'accuracy' },
  'geographic-risk-miscalc': { label: 'Accuracy', key: 'accuracy' },

  'ubo-misidentification': { label: 'Compliance', key: 'compliance' },
  'stale-screening-data': { label: 'Compliance', key: 'compliance' },
  'sar-filing-error': { label: 'Compliance', key: 'compliance' },
  'audit-trail-incomplete': { label: 'Compliance', key: 'compliance' },
  'data-retention-violation': { label: 'Compliance', key: 'compliance' },
  'policy-bypass': { label: 'Compliance', key: 'compliance' },
  'rule-staleness': { label: 'Compliance', key: 'compliance' },

  'model-drift': { label: 'Operational', key: 'operational' },
  'agent-conflict': { label: 'Operational', key: 'operational' },
  'blast-radius': { label: 'Operational', key: 'operational' },
  'config-drift': { label: 'Operational', key: 'operational' },
  'escalation-failure': { label: 'Operational', key: 'operational' },
  'sla-breach': { label: 'Operational', key: 'operational' },
  'reviewer-bias': { label: 'Operational', key: 'operational' },
  'decision-inconsistency': { label: 'Operational', key: 'operational' },
  'data-lineage-loss': { label: 'Operational', key: 'operational' },
  'algorithmic-bias': { label: 'Accuracy', key: 'accuracy' },
};

const controlMap = new Map(controls.map(c => [c.id, c]));
const serviceMap = new Map(services.map(s => [s.id, s]));

function resolveControlEntries(controlIds: string[], serviceIds: string[]): ControlEntry[] {
  return controlIds.map(cid => {
    const ctrl = controlMap.get(cid);
    const label = ctrl?.label ?? cid;
    const linkedServiceId = serviceIds.find(sid => {
      if (cid.startsWith('verified-permissions')) return sid === 'verified-permissions';
      if (cid === 'step-functions-hitl') return sid === 'step-functions';
      if (cid === 'gateway-interceptors') return sid === 'agentcore-gateway';
      if (cid === 'lambda-validators') return sid === 'lambda';
      if (cid === 'guardrails-input' || cid === 'guardrails-output' || cid === 'contextual-grounding') return sid === 'bedrock-guardrails';
      if (cid === 'automated-reasoning') return sid === 'bedrock-ar';
      if (cid === 'llm-as-judge') return sid === 'bedrock';
      if (cid === 'rai-evaluator' || cid === 'continuous-eval' || cid === 'auto-tighten') return sid === 'agentcore-evaluations';
      if (cid === 'arbiter') return sid === 'agentcore-gateway' || sid === 'agentcore';
      if (cid === 'cloudwatch-alarms') return sid === 'cloudwatch';
      if (cid === 'dynamodb-ttl') return sid === 'dynamodb';
      if (cid === 'kms-encryption') return sid === 'kms';
      if (cid === 'vpc-isolation') return sid === 'vpc';
      if (cid === 'waf-rules') return sid === 'waf';
      if (cid === 'iam-least-privilege') return sid === 'iam';
      if (cid === 's3-object-lock') return sid === 's3';
      if (cid === 'sns-notifications') return sid === 'sns-ses';
      if (cid === 'tier-limits') return sid === 'agentcore-gateway';
      return false;
    });
    const svc = linkedServiceId ? serviceMap.get(linkedServiceId) : undefined;
    const awsService = svc?.label ?? 'AWS';
    return { name: label, awsService, status: 'active' as const };
  });
}

function resolveStage(activeAtSteps: number[]): string {
  if (activeAtSteps.length >= 5) return 'All';
  return activeAtSteps.map(i => stepMetadata[i]?.label ?? `Step ${i}`).join(', ');
}

function severityToClass(severity: string): string {
  if (severity === 'critical') return 'sev-critical';
  if (severity === 'high') return 'sev-high';
  if (severity === 'low') return 'sev-low';
  return 'sev-medium';
}

function severityLabel(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

const RESIDUAL_OVERRIDES: Record<string, 'low' | 'medium' | 'high'> = {
  'injection-document': 'high',
  'data-exfiltration': 'low',
  'ocr-error': 'low',
  'data-lineage-loss': 'low',
  'document-forgery': 'medium',
  'ubo-misidentification': 'medium',
  'data-source-manipulation': 'low',
  'sanctions-false-negative': 'high',
  'false-positive-flooding': 'low',
  'stale-screening-data': 'low',
  'geographic-risk-miscalc': 'low',
  'hallucination': 'high',
  'algorithmic-bias': 'medium',
  'calculation-error': 'low',
  'agent-conflict': 'low',
  'unauthorised-data-access': 'low',
  'policy-bypass': 'medium',
  'rule-staleness': 'low',
  'blast-radius': 'high',
  'config-drift': 'low',
  'escalation-failure': 'high',
  'sla-breach': 'low',
  'reviewer-bias': 'low',
  'token-manipulation': 'low',
  'audit-trail-incomplete': 'low',
  'sar-filing-error': 'medium',
  'model-drift': 'low',
  'data-retention-violation': 'low',
  'decision-inconsistency': 'low',
};

function residualForRisk(riskId: string): { label: string; cls: string } {
  const level = RESIDUAL_OVERRIDES[riskId] ?? 'medium';
  if (level === 'low') return { label: 'Low', cls: 'sev-low' };
  if (level === 'high') return { label: 'High', cls: 'sev-high' };
  return { label: 'Medium', cls: 'sev-medium' };
}

export const riskRegisterData: RiskRow[] = riskControlMapping.map((link, index) => {
  const cat = CATEGORY_ASSIGNMENTS[link.risk.id] ?? { label: 'Other', key: 'other' };
  const residual = residualForRisk(link.risk.id);
  return {
    id: `R-${String(index + 1).padStart(3, '0')}`,
    category: cat.label,
    categoryKey: cat.key,
    risk: link.risk.label,
    riskDescription: link.risk.description,
    stage: resolveStage(link.activeAtSteps),
    severity: severityLabel(link.risk.severity),
    severityClass: severityToClass(link.risk.severity),
    controls: resolveControlEntries(link.controls, link.services),
    residual: residual.label,
    residualClass: residual.cls,
  };
});

export const RISK_REGISTER_CATEGORIES = [
  { key: 'security', label: 'Security', icon: '🔒' },
  { key: 'accuracy', label: 'Accuracy', icon: '🎯' },
  { key: 'compliance', label: 'Compliance', icon: '📜' },
  { key: 'operational', label: 'Operational', icon: '⚙️' },
] as const;
