/**
 * fleetScaleData — synthetic large-fleet generator + aggregation for the
 * "Fleet at Scale" view. Demonstrates how the Govern dashboard behaves at
 * 10,000+ agents using a deterministic, pre-aggregated model (no per-agent
 * rows rendered; the view consumes rollups + a bounded exception queue).
 *
 * Mirrors the real AgentRegistryEntry governance fields (scope, status,
 * provider, governanceStatus, incidents, riskScore) but generated at scale so
 * the aggregation/exception patterns can be proven before wiring to a real
 * Config-aggregator / pre-aggregation backend.
 */
import type { AgentStatus, AgentProvider, GovernanceStatus } from './mockData';
import type { AgentScopeLevel } from './autonomyLadder';

export interface ScaleAgent {
  id: string;
  name: string;
  businessUnit: string;
  environment: 'prod' | 'pilot' | 'dev';
  provider: AgentProvider;
  scopeLevel: AgentScopeLevel;
  status: AgentStatus;
  governanceStatus: GovernanceStatus;
  riskScore: number;       // 0-100
  openIncidents: number;
  hasPolicy: boolean;      // active Cedar policy attached
  model: string;
}

export const BUSINESS_UNITS = [
  'Retail Banking', 'Capital Markets', 'Wealth Management', 'Risk & Fraud',
  'Operations', 'Customer Service', 'Compliance', 'Insurance', 'Treasury', 'Digital Channels',
];
const PROVIDERS: AgentProvider[] = ['aws', 'azure', 'gcp', 'servicenow', 'salesforce', 'copilot_studio', 'custom'];
const MODELS = ['Claude Opus 4.7', 'Claude Sonnet 4.5', 'Claude Haiku 4.5', 'Nova Pro', 'Nova Lite'];

// Deterministic [0,1) pseudo-noise from an integer seed (no Math.random).
function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Generate a deterministic fleet of `count` agents. */
export function generateFleet(count: number): ScaleAgent[] {
  const agents: ScaleAgent[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const bu = BUSINESS_UNITS[i % BUSINESS_UNITS.length];
    const provider = PROVIDERS[Math.floor(noise(i * 3 + 1) * PROVIDERS.length)];
    // Scope skews toward lower levels (most agents are constrained).
    const sr = noise(i * 3 + 2);
    const scopeLevel: AgentScopeLevel = sr < 0.4 ? 1 : sr < 0.7 ? 2 : sr < 0.9 ? 3 : 4;
    const er = noise(i * 3 + 3);
    const environment = er < 0.6 ? 'prod' : er < 0.85 ? 'pilot' : 'dev';
    const status: AgentStatus = environment === 'prod' ? 'production' : environment === 'pilot' ? 'pilot' : 'development';
    const openIncidents = noise(i * 5 + 4) > 0.92 ? 1 + Math.floor(noise(i * 5 + 5) * 3) : 0;
    const hasPolicy = noise(i * 7 + 6) > 0.18; // ~82% have an active policy

    // Risk rises with scope, prod, incidents, and missing policy.
    const risk = Math.min(100, Math.round(
      (scopeLevel - 1) * 16
      + (environment === 'prod' ? 18 : environment === 'pilot' ? 8 : 0)
      + openIncidents * 14
      + (hasPolicy ? 0 : 16)
      + noise(i * 11 + 7) * 18,
    ));

    // Governance status derives from risk + policy + incidents.
    let governanceStatus: GovernanceStatus;
    if (!hasPolicy && (scopeLevel >= 3 || environment === 'prod')) governanceStatus = 'blocked';
    else if (risk >= 70 || openIncidents > 0) governanceStatus = 'review_needed';
    else governanceStatus = 'compliant';

    agents[i] = {
      id: `agt-${String(i).padStart(5, '0')}`,
      name: `${bu.split(' ')[0]}-Agent-${i}`,
      businessUnit: bu,
      environment,
      provider,
      scopeLevel,
      status,
      governanceStatus,
      riskScore: risk,
      openIncidents,
      hasPolicy,
      model: MODELS[Math.floor(noise(i * 13 + 8) * MODELS.length)],
    };
  }
  return agents;
}

// ─────────────────────────── Aggregation ───────────────────────────

export type RiskTier = 'critical' | 'high' | 'medium' | 'low';
export function riskTier(score: number): RiskTier {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export interface FleetSummary {
  total: number;
  governance: Record<GovernanceStatus, number>;
  risk: Record<RiskTier, number>;
  scope: Record<AgentScopeLevel, number>;
  prodFullAgency: number;       // prod + scope 4
  openIncidents: number;        // total open incidents
  unprotected: number;          // no active policy
  needsAttention: number;       // size of the exception set
  monthlyCostEstimate: number;  // rough Σ
  pctCompliant: number;
}

export interface SegmentRow {
  key: string;
  total: number;
  compliant: number;
  reviewNeeded: number;
  blocked: number;
  critical: number;
  high: number;
  pctCompliant: number;
}

/** attentionScore — drives the exception queue ordering. */
export function attentionScore(a: ScaleAgent): number {
  const gov = a.governanceStatus === 'blocked' ? 100 : a.governanceStatus === 'review_needed' ? 50 : a.governanceStatus === 'unknown' ? 20 : 0;
  const env = a.environment === 'prod' ? 30 : a.environment === 'pilot' ? 10 : 0;
  return gov + a.riskScore + (a.scopeLevel - 1) * 15 + a.openIncidents * 25 + env + (a.hasPolicy ? 0 : 20);
}

export function needsAttention(a: ScaleAgent): boolean {
  return a.governanceStatus !== 'compliant' || a.openIncidents > 0 || (a.scopeLevel === 4 && a.environment === 'prod');
}

/** Single-pass fleet summary — the only thing the hero needs (no row rendering). */
export function summarize(agents: ScaleAgent[]): FleetSummary {
  const s: FleetSummary = {
    total: agents.length,
    governance: { compliant: 0, review_needed: 0, blocked: 0, unknown: 0 },
    risk: { critical: 0, high: 0, medium: 0, low: 0 },
    scope: { 1: 0, 2: 0, 3: 0, 4: 0 },
    prodFullAgency: 0,
    openIncidents: 0,
    unprotected: 0,
    needsAttention: 0,
    monthlyCostEstimate: 0,
    pctCompliant: 0,
  };
  for (const a of agents) {
    s.governance[a.governanceStatus]++;
    s.risk[riskTier(a.riskScore)]++;
    s.scope[a.scopeLevel]++;
    if (a.environment === 'prod' && a.scopeLevel === 4) s.prodFullAgency++;
    s.openIncidents += a.openIncidents;
    if (!a.hasPolicy) s.unprotected++;
    if (needsAttention(a)) s.needsAttention++;
  }
  s.pctCompliant = s.total > 0 ? Math.round((s.governance.compliant / s.total) * 100) : 0;
  return s;
}

/** Group agents by a key function into governance segment rows. */
export function segmentBy(agents: ScaleAgent[], keyOf: (a: ScaleAgent) => string): SegmentRow[] {
  const map = new Map<string, SegmentRow>();
  for (const a of agents) {
    const key = keyOf(a);
    let row = map.get(key);
    if (!row) { row = { key, total: 0, compliant: 0, reviewNeeded: 0, blocked: 0, critical: 0, high: 0, pctCompliant: 0 }; map.set(key, row); }
    row.total++;
    if (a.governanceStatus === 'compliant') row.compliant++;
    else if (a.governanceStatus === 'review_needed') row.reviewNeeded++;
    else if (a.governanceStatus === 'blocked') row.blocked++;
    const t = riskTier(a.riskScore);
    if (t === 'critical') row.critical++;
    else if (t === 'high') row.high++;
  }
  for (const row of map.values()) row.pctCompliant = row.total > 0 ? Math.round((row.compliant / row.total) * 100) : 0;
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

/** Top-N exception queue (bounded — never returns the whole fleet). */
export function exceptionQueue(agents: ScaleAgent[], limit = 100): ScaleAgent[] {
  return agents
    .filter(needsAttention)
    .sort((a, b) => attentionScore(b) - attentionScore(a))
    .slice(0, limit);
}

/** Inventory breakdown by an arbitrary key (for the Registry lens). */
export interface InventoryRow { key: string; count: number; pctOfFleet: number }
export function inventoryBy(agents: ScaleAgent[], keyOf: (a: ScaleAgent) => string): InventoryRow[] {
  const map = new Map<string, number>();
  for (const a of agents) map.set(keyOf(a), (map.get(keyOf(a)) ?? 0) + 1);
  const total = agents.length || 1;
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count, pctOfFleet: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}
