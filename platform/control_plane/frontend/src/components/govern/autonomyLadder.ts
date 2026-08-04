/**
 * autonomyLadder — Single source of truth for the agent autonomy/agency ladder.
 *
 * The canonical ladder is AGENT_SCOPE_META (see mockData.ts), aligned to the
 * AWS Agentic AI Security Scoping Matrix:
 *   L1 No Agency · L2 Prescribed Agency · L3 Supervised · L4 Full Agency
 *
 * This module re-exports the canonical metadata and provides the variants other
 * Govern surfaces need (Tailwind class names, where a hex `style` won't work),
 * plus typed per-level OVERLAYS for specialized data (risk multiplier, error
 * tolerance, controls/HITL guidance). Consumers read NAMES and COLORS from here
 * so there is exactly one place that defines what "L3" means and looks like.
 *
 * See AUTONOMY_LADDER_RECONCILIATION.md for the full design + migration plan.
 * All Bucket-A folds (Playbook, AgentRiskProfile, AgentROI) are now wired and
 * rendering via FleetRiskPosture with the canonical string→level mapping.
 */

import { AGENT_SCOPE_META, type AgentScopeLevel } from './mockData';

export { AGENT_SCOPE_META, type AgentScopeLevel };

export const SCOPE_LEVELS: AgentScopeLevel[] = [1, 2, 3, 4];

/**
 * Tailwind class variant of the canonical scope colors. Tailwind cannot consume
 * the hex in `AGENT_SCOPE_META[level].color` via className, so this map mirrors
 * the same emerald/blue/amber/rose semantics for class-based styling. Keep the
 * palette here in lockstep with AGENT_SCOPE_META.
 */
export const SCOPE_TAILWIND: Record<AgentScopeLevel, { bg: string; text: string; light: string }> = {
  1: { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-100' },
  2: { bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-100' },
  3: { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-100' },
  4: { bg: 'bg-rose-500', text: 'text-rose-600', light: 'bg-rose-100' },
};

/** Convenience: canonical display name for a scope level. */
export const scopeName = (level: AgentScopeLevel): string => AGENT_SCOPE_META[level].name;

/** Convenience: canonical hex color for a scope level. */
export const scopeColor = (level: AgentScopeLevel): string => AGENT_SCOPE_META[level].color;

/**
 * Cross-framework anchors for each canonical scope level. The AWS Agentic AI
 * Security Scoping Matrix is the spine; these map each level to the analogous
 * rung in the two formal autonomy standards (ISO/IEC 22989:2022 Clause 5.13,
 * a 0–6 spectrum; SAE J3016 L0–L5 driving-automation analogy) and to the NIST
 * AI RMF human-oversight subcategories that apply at that level. Used to harden
 * the ladder with authoritative citations in the UI.
 *
 * ISO 22989 wording is "aligned with" (standard is paywalled); SAE endpoint
 * names are verified. NIST subcategory IDs: GOVERN 3.2, MAP 3.5 (define
 * oversight), MANAGE 2.4 (supersede/disengage/deactivate), MANAGE 4.1
 * (override/appeal/decommission).
 */
export interface LadderCitations {
  iso22989: string;   // aligned ISO/IEC 22989:2022 Cl. 5.13 level
  saeJ3016: string;   // SAE J3016 analogy
  nistOversight: string[]; // applicable NIST AI RMF subcategory IDs
}

export const LADDER_CITATIONS: Record<AgentScopeLevel, LadderCitations> = {
  1: { iso22989: 'L1 Assistive automation', saeJ3016: 'L1 Driver Assistance', nistOversight: ['GOVERN 3.2', 'MAP 3.5'] },
  2: { iso22989: 'L2 Partial automation', saeJ3016: 'L2 Partial Driving Automation', nistOversight: ['GOVERN 3.2', 'MAP 3.5'] },
  3: { iso22989: 'L3 Conditional automation', saeJ3016: 'L3 Conditional Driving Automation', nistOversight: ['MAP 3.5', 'MANAGE 2.4', 'MANAGE 4.1'] },
  4: { iso22989: 'L4 High automation', saeJ3016: 'L4 High Driving Automation', nistOversight: ['MANAGE 2.4', 'MANAGE 4.1'] },
};
