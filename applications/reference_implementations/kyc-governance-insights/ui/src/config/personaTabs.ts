import type { Persona } from '../contexts/PersonaContext';
import type { TabConfig } from '../types/tabs';

// DISPLAY PROMINENCE (not dev priority). The earned-autonomy story is the same for
// everyone — prove accuracy -> earn trust -> grant autonomy -> monitor -> revoke —
// but each persona enters it from a different door, so `tier` here is per-persona:
//   Tier 1 = this audience's entry point (inline, landing leads with tier-1[0])
//   Tier 2 = supporting, still inline (secondary)
//   Tier 3 = depth, behind the "More" dropdown (one click away)
//   Tier 4 = supporting/presentation, hidden unless ?presenter
// Golden Rule: no tab is removed — tier only controls placement.
// Within-page depth is further demoted via <CollapsibleSection> (default-collapsed).

export const PERSONA_TABS: Record<Persona, TabConfig[]> = {
  // CRO / Board — enters via portfolio health. Single-page FleetDashboard (no tabs);
  // its own sections handle expand/collapse.
  'cro-fleet': [],

  // Business Ops — enters via the autonomy controls + operational health.
  'business-ops': [
    { id: 'governance', label: 'Decision Rules', icon: '📊', tier: 1 },     // autonomy config + intervention ladder
    { id: 'operations', label: 'Operations', icon: '🩺', tier: 1 },         // operational KPIs
    { id: 'evaluations', label: 'Evaluations', icon: '📈', tier: 1 },       // accuracy evidence
    { id: 'overview', label: 'Agent Fleet', icon: '🎯', tier: 2 },
    { id: 'risk-register', label: 'Control Framework', icon: '🛡', tier: 2 },
    { id: 'roi-projection', label: 'ROI Projection', icon: '💰', tier: 2 }, // detail collapses within
    { id: 'simulation', label: 'Live Decision', icon: '🤖', tier: 3 },
    { id: 'review-queue', label: 'Review Queue', icon: '👤', tier: 3 },
    { id: 'kyc-report', label: 'Reports', icon: '📋', tier: 4 },
  ],

  // Compliance — lands on the Audit Dashboard (composite/domain scores + findings);
  // Evaluations and Evidence Packs sit alongside as the accuracy/evidence entry.
  'compliance': [
    { id: 'compliance-audit', label: 'Audit Dashboard', icon: '✓', tier: 1 },   // landing: accountability + composite scores
    { id: 'evaluations', label: 'Evaluations', icon: '📈', tier: 1 },
    { id: 'evidence-trail', label: 'Evidence Packs', icon: '📜', tier: 1 },
    { id: 'governance', label: 'Policy Enforcement', icon: '🛡', tier: 2 },
    { id: 'risk-register', label: 'Findings & Remediation', icon: '📋', tier: 2 },
    { id: 'simulation', label: 'Decision Log', icon: '🤖', tier: 3 },
  ],

  // Engineering — enters via the mechanism: architecture, live Cedar, decision trace.
  'engineering': [
    { id: 'architecture', label: 'Architecture', icon: '⚙️', tier: 1 },
    { id: 'cedar-policy', label: 'Policy Engine', icon: '🛡️', tier: 1 },        // live Cedar policies
    { id: 'simulation', label: 'Observability', icon: '🤖', tier: 1 },          // decision trace (full waterfall collapses within)
    { id: 'evaluations', label: 'Evaluations', icon: '📈', tier: 2 },
    { id: 'overview', label: 'Agent Registry', icon: '📇', tier: 2 },
    { id: 'compliance-audit', label: 'Controls Matrix', icon: '✓', tier: 2 },
    { id: 'more-info', label: 'Guardrails', icon: '🔧', tier: 3 },
  ],
};
