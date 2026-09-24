export type TabId =
  | 'overview'
  | 'compliance-audit'
  | 'risk-register'
  | 'governance'
  | 'cedar-policy'
  | 'evidence-trail'
  | 'review-queue'
  | 'roi-projection'
  | 'architecture'
  | 'simulation'
  | 'kyc-report'
  | 'talking-points'
  | 'more-info'
  | 'operations'
  | 'evaluations';

/**
 * Tier drives information architecture, not access (Golden Rule: nothing is removed):
 *   1 = front-and-centre (default landing, inline)
 *   2 = visible but secondary (inline, never first-selected)
 *   3 = behind the "More" grouping in the tab bar
 *   4 = hidden unless ?presenter (same pattern as Talking Points)
 * Absent tier defaults to 2.
 */
export type TabTier = 1 | 2 | 3 | 4;

export interface TabConfig {
  id: TabId;
  label: string;
  icon: string; // emoji or icon class
  tier?: TabTier;
}
