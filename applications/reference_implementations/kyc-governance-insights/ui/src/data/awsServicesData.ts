export interface AwsServiceEntry {
  id: string;
  name: string;
  icon: string;
  protectsAgainst: string;
  status: 'active' | 'configured' | 'not_deployed';
  evidence: string;
}

export const awsServices: AwsServiceEntry[] = [
  { id: 'guardrails', name: 'Bedrock Guardrails', icon: '\uD83D\uDEE1\uFE0F', protectsAgainst: 'Content/PII/topic filtering', status: 'active', evidence: 'Continuous — every invocation logged' },
  { id: 'waf', name: 'AWS WAF', icon: '\uD83D\uDD25', protectsAgainst: 'Prompt injection, rate limiting, geo-fence', status: 'active', evidence: 'WAF logs (S3), 90-day retention' },
  { id: 'guardduty', name: 'Amazon GuardDuty', icon: '\uD83D\uDC41\uFE0F', protectsAgainst: 'Anomaly detection on API calls', status: 'active', evidence: 'GuardDuty findings (Security Hub)' },
  { id: 'securityhub', name: 'Security Hub', icon: '\uD83D\uDCCA', protectsAgainst: 'Unified posture score', status: 'active', evidence: 'CIS benchmark reports' },
  { id: 'kms', name: 'AWS KMS', icon: '\uD83D\uDD10', protectsAgainst: 'Encryption at rest (CMK)', status: 'active', evidence: 'CloudTrail key usage logs' },
  { id: 'cloudtrail', name: 'AWS CloudTrail', icon: '\uD83D\uDCDD', protectsAgainst: 'Audit trail (model invocation logs)', status: 'active', evidence: '100% API coverage, S3 + CW Logs' },
  { id: 'iam', name: 'AWS IAM', icon: '\uD83D\uDD11', protectsAgainst: 'Per-agent least privilege', status: 'active', evidence: 'IAM Access Analyzer reports' },
  { id: 'vpc', name: 'VPC + PrivateLink', icon: '\uD83C\uDF10', protectsAgainst: 'Network isolation', status: 'active', evidence: 'VPC Flow Logs (100% capture)' },
  { id: 'shield', name: 'Shield Advanced', icon: '\u2694\uFE0F', protectsAgainst: 'DDoS protection', status: 'active', evidence: 'Shield event history' },
  { id: 'config', name: 'AWS Config Rules', icon: '\u2699\uFE0F', protectsAgainst: 'Compliance rules for AI resources', status: 'configured', evidence: 'Config conformance packs' },
];
