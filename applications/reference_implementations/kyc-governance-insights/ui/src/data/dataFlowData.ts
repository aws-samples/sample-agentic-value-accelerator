export interface DataNode {
  id: string;
  name: string;
  encryption: string;
  piiFields: string[];
  residency: string;
}

export interface DataEdge {
  from: string;
  to: string;
  protocol: string;
  encryption: string;
  crossesBoundary: boolean;
}

export const dataNodes: DataNode[] = [
  { id: 'client', name: 'Customer Browser', encryption: 'TLS 1.3 (transit)', piiFields: ['UBO name', 'UBO DOB', 'address', 'ID number'], residency: 'Client device' },
  { id: 'apigw', name: 'API Gateway', encryption: 'TLS 1.3 (transit)', piiFields: [], residency: 'eu-west-1' },
  { id: 'orchestrator', name: 'Orchestrator Agent', encryption: 'VPC internal (encrypted)', piiFields: ['UBO name', 'UBO DOB'], residency: 'eu-west-1 (private subnet)' },
  { id: 'bedrock', name: 'Bedrock (PrivateLink)', encryption: 'TLS 1.3 (PrivateLink)', piiFields: [], residency: 'eu-west-1 (AWS managed)' },
  { id: 'dynamodb', name: 'DynamoDB', encryption: 'AES-256 KMS CMK', piiFields: ['UBO name', 'UBO DOB', 'address', 'ID number'], residency: 'eu-west-1' },
  { id: 's3', name: 'S3 Audit Trail', encryption: 'AES-256 KMS CMK + Object Lock', piiFields: ['Full decision record (encrypted)'], residency: 'eu-west-1' },
  { id: 'cloudwatch', name: 'CloudWatch Logs', encryption: 'AES-256 KMS', piiFields: [], residency: 'eu-west-1 (PII redacted before ingest)' },
];

export const dataEdges: DataEdge[] = [
  { from: 'client', to: 'apigw', protocol: 'HTTPS', encryption: 'TLS 1.3', crossesBoundary: true },
  { from: 'apigw', to: 'orchestrator', protocol: 'VPC internal', encryption: 'TLS (internal)', crossesBoundary: false },
  { from: 'orchestrator', to: 'bedrock', protocol: 'PrivateLink', encryption: 'TLS 1.3', crossesBoundary: true },
  { from: 'orchestrator', to: 'dynamodb', protocol: 'VPC Endpoint', encryption: 'TLS + KMS at rest', crossesBoundary: false },
  { from: 'orchestrator', to: 's3', protocol: 'VPC Endpoint', encryption: 'TLS + KMS + Object Lock', crossesBoundary: false },
  { from: 'orchestrator', to: 'cloudwatch', protocol: 'VPC Endpoint', encryption: 'TLS + KMS', crossesBoundary: false },
];

export const complianceNotes = {
  gdpr: ['Article 32 — Encryption in transit + at rest + access logging', 'Article 17 — Right to erasure via DynamoDB TTL + S3 lifecycle'],
  dpa2018: ['Schedule 1 — Appropriate technical measures (KMS CMK, VPC isolation)'],
  residency: 'All data: eu-west-1 (Ireland). No cross-region replication.',
};
