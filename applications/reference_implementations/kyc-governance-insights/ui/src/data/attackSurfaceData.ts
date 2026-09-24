export interface AttackSurface {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitigatedBy: string;
  status: 'active' | 'partial' | 'planned';
  mitreRef: string;
  cedarPolicy: string;
  lastTested: string;
}

export const attackSurfaces: AttackSurface[] = [
  { id: 'as1', name: 'Prompt Injection', severity: 'critical', mitigatedBy: 'Bedrock Guardrails + input validation', status: 'active', mitreRef: 'ATLAS ML04.1', cedarPolicy: 'kyc-hallucination-guard', lastTested: '2026-06-22' },
  { id: 'as2', name: 'Agent Hijacking', severity: 'critical', mitigatedBy: 'Cedar policies + scope limits', status: 'active', mitreRef: 'ATLAS ML05', cedarPolicy: 'kyc-model-allowlist', lastTested: '2026-06-20' },
  { id: 'as3', name: 'Cross-Agent Escalation', severity: 'high', mitigatedBy: 'Per-agent IAM + no shared credentials', status: 'active', mitreRef: 'ATLAS ML09', cedarPolicy: 'kyc-rate-limit', lastTested: '2026-06-20' },
  { id: 'as4', name: 'Token Abuse / Cost Spike', severity: 'high', mitigatedBy: 'Budget caps + rate limits', status: 'active', mitreRef: 'ATLAS ML06', cedarPolicy: 'kyc-rate-limit', lastTested: '2026-06-22' },
  { id: 'as5', name: 'Model Drift (Accuracy Decay)', severity: 'high', mitigatedBy: 'Continuous evaluation + auto-tighten', status: 'active', mitreRef: 'ATLAS ML07', cedarPolicy: 'kyc-confidence-threshold', lastTested: '2026-06-22' },
  { id: 'as6', name: 'Data Exfiltration', severity: 'high', mitigatedBy: 'VPC isolation + Guardrails PII detection', status: 'active', mitreRef: 'MITRE T1048', cedarPolicy: 'kyc-data-residency', lastTested: '2026-06-19' },
  { id: 'as7', name: 'Goal Misalignment', severity: 'medium', mitigatedBy: 'Deterministic checks + HITL gates', status: 'active', mitreRef: 'ATLAS ML03', cedarPolicy: 'kyc-audit-trail-required', lastTested: '2026-06-18' },
  { id: 'as8', name: 'Supply Chain (Model Provenance)', severity: 'medium', mitigatedBy: 'Bedrock managed models + version pinning', status: 'partial', mitreRef: 'MITRE T1195', cedarPolicy: 'kyc-model-allowlist', lastTested: '2026-06-15' },
  { id: 'as9', name: 'Denial of Service', severity: 'medium', mitigatedBy: 'Shield Advanced + WAF rate limiting', status: 'active', mitreRef: 'MITRE T1498', cedarPolicy: 'kyc-rate-limit', lastTested: '2026-06-20' },
  { id: 'as10', name: 'Memory Poisoning', severity: 'low', mitigatedBy: 'Session-scoped memory + DynamoDB TTL', status: 'active', mitreRef: 'ATLAS ML08', cedarPolicy: 'kyc-document-expiry', lastTested: '2026-06-18' },
];
