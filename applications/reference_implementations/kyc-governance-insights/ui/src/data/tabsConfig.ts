import type { TabConfig } from '../types/tabs';

const ALL_TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: '🎯' },
  { id: 'simulation', label: 'Agent Execution', icon: '🤖' },
  { id: 'compliance-audit', label: 'Compliance & Audit', icon: '✓' },
  { id: 'risk-register', label: 'Risk Register', icon: '🛡' },
  { id: 'governance', label: 'Governance', icon: '📊' },
  { id: 'cedar-policy', label: 'Cedar Policies', icon: '🛡️' },
  { id: 'architecture', label: 'Architecture', icon: '⚙️' },
  { id: 'kyc-report', label: 'KYC Report', icon: '📋' },
  { id: 'more-info', label: 'More Info', icon: '📖' },
  { id: 'talking-points', label: 'Talking Points', icon: '💬' },
];

const isPresenter = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('presenter');

export const TABS: TabConfig[] = isPresenter
  ? ALL_TABS
  : ALL_TABS.filter(t => t.id !== 'talking-points');
