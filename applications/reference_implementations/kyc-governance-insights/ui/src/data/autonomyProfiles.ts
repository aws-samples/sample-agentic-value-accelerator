export interface PolicyParams {
  valueThreshold: number;
  riskScoreThreshold: number;
  allowExternalActions: boolean;
  hitlReviewRate: number;
  maxAutonomyScope: number;
  pepAutoApprove: boolean;
}

export interface AutonomyProfile {
  id: string;
  name: string;
  level: 'L1' | 'L2' | 'L3' | 'L4';
  description: string;
  params: PolicyParams;
  cedarSummary: string;
}

export const PROFILES: AutonomyProfile[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    level: 'L1',
    description: 'Agent suggests, human decides. All high-value decisions require approval.',
    params: { valueThreshold: 1000, riskScoreThreshold: 30, allowExternalActions: false, hitlReviewRate: 100, maxAutonomyScope: 1, pepAutoApprove: false },
    cedarSummary: 'forbid all write/execute; permit read/recommend only',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    level: 'L2',
    description: 'Agent acts on low-risk, human approves high-risk. Standard operating mode.',
    params: { valueThreshold: 5000, riskScoreThreshold: 50, allowExternalActions: true, hitlReviewRate: 25, maxAutonomyScope: 2, pepAutoApprove: true },
    cedarSummary: 'permit when riskScore < 50; forbid above threshold',
  },
  {
    id: 'progressive',
    name: 'Progressive',
    level: 'L3',
    description: 'Agent acts autonomously on most decisions. Human monitors post-hoc.',
    params: { valueThreshold: 25000, riskScoreThreshold: 75, allowExternalActions: true, hitlReviewRate: 10, maxAutonomyScope: 3, pepAutoApprove: true },
    cedarSummary: 'permit broadly; forbid only explicitly blocked categories',
  },
];

export const DEFAULT_PROFILE = PROFILES[1]; // Balanced
