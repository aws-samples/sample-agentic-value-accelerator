/**
 * threatModelData — agentic capability → threat → control model.
 *
 * Turns the platform from threat-AWARE (OWASP T1–T17 tagged in the risk register)
 * into threat-FIRST: for a given autonomous CAPABILITY (web-search sub-agent, tool
 * use, memory, multi-agent delegation, code execution, etc.) it enumerates the
 * applicable OWASP Agentic threats, maps each to the platform CONTROLS that
 * mitigate it, and computes residual exposure once those controls are applied.
 *
 * Threat taxonomy is the official OWASP Agentic AI — Threats & Mitigations v1.1
 * (T1–T17), reused from risk/riskData.ts AGENTIC_RISK_CATEGORIES.
 */

import { AGENTIC_RISK_CATEGORIES, type AgenticRiskCategory } from './risk/riskData';

/** Platform controls that can mitigate agentic threats — each maps to a real
 *  Govern/Secure surface, so a threat's coverage is honest, not aspirational. */
export type ControlId =
  | 'guardrails'        // Bedrock guardrails (content/PII/prompt-attack/grounding)
  | 'autonomy-gate'     // Runtime enforcement AUTONOMY_GATE (allow/pause/deny)
  | 'a2a-ceiling'       // A2A autonomy ceiling (min source/target/policy)
  | 'hitl'              // Human-in-the-loop gates + handoff
  | 'audit-log'         // Append-only examiner audit trail
  | 'cedar-policy'      // Cedar/AgentCore policy (tool + resource scope)
  | 'kill-switch'       // Emergency fleet controls (kill/throttle/LOG_ONLY)
  | 'sandbox'           // Sandboxed code execution / isolation
  | 'identity'          // Agent identity + trust-boundary enforcement
  | 'sbom';             // Signed artifacts / AIBOM / supply-chain verification

export interface ControlMeta {
  id: ControlId;
  name: string;
  surface: string;   // where it lives in the platform
  to: string;        // deep-link route
  built: boolean;    // is the surface actually present today?
}

export const CONTROLS: Record<ControlId, ControlMeta> = {
  'guardrails':    { id: 'guardrails',    name: 'Bedrock Guardrails',        surface: 'Secure · Guardrails',           to: '/secure/guardrails',                 built: true },
  'autonomy-gate': { id: 'autonomy-gate', name: 'Runtime Enforcement Gate',  surface: 'Govern · Human Oversight',      to: '/govern/agents?tab=human-oversight', built: true },
  'a2a-ceiling':   { id: 'a2a-ceiling',   name: 'A2A Autonomy Ceiling',      surface: 'Govern · A2A Governance',       to: '/govern/agents?tab=a2a',             built: true },
  'hitl':          { id: 'hitl',          name: 'Human-in-the-Loop Gates',   surface: 'Govern · Human Oversight',      to: '/govern/agents?tab=human-oversight', built: true },
  'audit-log':     { id: 'audit-log',     name: 'Append-Only Audit Trail',   surface: 'Govern · Audit & Incidents',    to: '/govern/audit',                      built: true },
  'cedar-policy':  { id: 'cedar-policy',  name: 'Cedar Policy (tool/scope)', surface: 'Secure · Policy',               to: '/secure/policy',                     built: true },
  'kill-switch':   { id: 'kill-switch',   name: 'Emergency Fleet Controls',  surface: 'Govern · Fleet',                to: '/govern/fleet',                      built: true },
  'sandbox':       { id: 'sandbox',       name: 'Sandboxed Execution',       surface: 'Runtime (infra)',               to: '/govern/playbook',                   built: false },
  'identity':      { id: 'identity',      name: 'Agent Identity & Trust',    surface: 'Govern · Agent Registry',       to: '/govern/agents',                     built: true },
  'sbom':          { id: 'sbom',          name: 'Signed Artifacts / AIBOM',  surface: 'Supply chain (infra)',          to: '/govern/playbook',                   built: false },
};

/** An autonomous capability being threat-modeled. */
export interface Capability {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Threats (OWASP T-codes) that apply to this capability, with inherent
   *  likelihood/impact (1-5) and the controls that mitigate each. */
  threats: {
    threat: AgenticRiskCategory;
    likelihood: number;
    impact: number;
    controls: ControlId[];
  }[];
}

/**
 * Capability library — the autonomous behaviors an agent might have. Each lists
 * its OWASP threat exposure and the platform controls that mitigate it. The
 * "web search sub-agent" case (called out explicitly) is included.
 */
export const CAPABILITIES: Capability[] = [
  {
    id: 'web-search-subagent',
    name: 'Web Search Sub-Agent',
    description: 'A sub-agent that autonomously issues web/search queries and ingests external content into the parent agent\'s context.',
    icon: 'globe-alt',
    threats: [
      { threat: 'T1',  likelihood: 4, impact: 4, controls: ['guardrails', 'audit-log'] },              // memory poisoning via ingested content
      { threat: 'T5',  likelihood: 4, impact: 4, controls: ['guardrails', 'hitl'] },                   // cascading hallucination from web content
      { threat: 'T6',  likelihood: 3, impact: 4, controls: ['guardrails', 'autonomy-gate'] },          // intent breaking via injected instructions
      { threat: 'T2',  likelihood: 3, impact: 4, controls: ['cedar-policy', 'autonomy-gate'] },        // tool misuse (search API abuse)
      { threat: 'T4',  likelihood: 3, impact: 2, controls: ['autonomy-gate', 'kill-switch'] },         // resource overload (query storms)
      { threat: 'T17', likelihood: 2, impact: 4, controls: ['sbom', 'guardrails'] },                   // supply chain (poisoned sources)
    ],
  },
  {
    id: 'tool-use',
    name: 'Tool / Function Calling',
    description: 'Agent invokes external tools, APIs, or functions to take actions in downstream systems.',
    icon: 'wrench-screwdriver',
    threats: [
      { threat: 'T2',  likelihood: 4, impact: 5, controls: ['cedar-policy', 'autonomy-gate', 'hitl'] },
      { threat: 'T3',  likelihood: 3, impact: 5, controls: ['cedar-policy', 'identity', 'audit-log'] },
      { threat: 'T11', likelihood: 2, impact: 5, controls: ['sandbox', 'hitl'] },
      { threat: 'T8',  likelihood: 3, impact: 3, controls: ['audit-log'] },
    ],
  },
  {
    id: 'multi-agent',
    name: 'Multi-Agent Delegation',
    description: 'Agent delegates tasks to, or receives delegation from, other agents (supervisor/worker, A2A).',
    icon: 'users',
    threats: [
      { threat: 'T13', likelihood: 3, impact: 5, controls: ['a2a-ceiling', 'audit-log', 'kill-switch'] },
      { threat: 'T12', likelihood: 3, impact: 4, controls: ['a2a-ceiling', 'identity'] },
      { threat: 'T16', likelihood: 3, impact: 4, controls: ['a2a-ceiling', 'cedar-policy'] },
      { threat: 'T14', likelihood: 2, impact: 4, controls: ['a2a-ceiling', 'hitl'] },
      { threat: 'T9',  likelihood: 2, impact: 4, controls: ['identity', 'audit-log'] },
    ],
  },
  {
    id: 'persistent-memory',
    name: 'Persistent Memory',
    description: 'Agent retains long-term memory / state across sessions, influencing future decisions.',
    icon: 'cpu-chip',
    threats: [
      { threat: 'T1',  likelihood: 4, impact: 4, controls: ['guardrails', 'audit-log'] },
      { threat: 'T8',  likelihood: 3, impact: 3, controls: ['audit-log'] },
      { threat: 'T7',  likelihood: 2, impact: 4, controls: ['hitl', 'autonomy-gate'] },
    ],
  },
  {
    id: 'code-execution',
    name: 'Code Generation & Execution',
    description: 'Agent generates and executes code in a runtime environment.',
    icon: 'code-bracket',
    threats: [
      { threat: 'T11', likelihood: 3, impact: 5, controls: ['sandbox', 'hitl', 'audit-log'] },
      { threat: 'T2',  likelihood: 3, impact: 4, controls: ['cedar-policy', 'sandbox'] },
      { threat: 'T17', likelihood: 2, impact: 4, controls: ['sbom'] },
      { threat: 'T4',  likelihood: 2, impact: 3, controls: ['autonomy-gate', 'kill-switch'] },
    ],
  },
  {
    id: 'autonomous-decisions',
    name: 'Autonomous Decision-Making',
    description: 'Agent takes consequential actions without per-action human approval (higher autonomy levels).',
    icon: 'flag',
    threats: [
      { threat: 'T7',  likelihood: 3, impact: 5, controls: ['hitl', 'autonomy-gate', 'audit-log'] },
      { threat: 'T6',  likelihood: 3, impact: 5, controls: ['guardrails', 'autonomy-gate'] },
      { threat: 'T10', likelihood: 3, impact: 4, controls: ['hitl'] },
      { threat: 'T15', likelihood: 2, impact: 4, controls: ['guardrails', 'hitl'] },
    ],
  },
];

// ── Computation helpers ──────────────────────────────────────────────────────

/** Control effectiveness: each applied+built control knocks down inherent risk.
 *  Residual = inherent × Π(1 − perControl), floored — matches the residual-risk
 *  philosophy used elsewhere (controls reduce, never fully eliminate). */
const PER_CONTROL_REDUCTION = 0.35; // each built control reduces residual ~35%

export function threatName(t: AgenticRiskCategory): string {
  return AGENTIC_RISK_CATEGORIES.find(c => c.id === t)?.name ?? t;
}
export function threatMeta(t: AgenticRiskCategory) {
  return AGENTIC_RISK_CATEGORIES.find(c => c.id === t);
}

export interface ScoredThreat {
  threat: AgenticRiskCategory;
  name: string;
  inherent: number;        // likelihood × impact (max 25)
  residual: number;        // after applied+built controls
  controls: ControlMeta[];
  builtControls: number;   // how many mapped controls are actually built
  coverageGap: boolean;    // any mapped control not built
  likelihood: number;
  impact: number;
}

export function scoreCapability(cap: Capability): ScoredThreat[] {
  return cap.threats.map(t => {
    const inherent = t.likelihood * t.impact;
    const controls = t.controls.map(id => CONTROLS[id]);
    const built = controls.filter(c => c.built).length;
    // Only built controls reduce residual; unbuilt ones are a coverage gap.
    const residual = Math.round(inherent * Math.pow(1 - PER_CONTROL_REDUCTION, built) * 10) / 10;
    return {
      threat: t.threat,
      name: threatName(t.threat),
      inherent,
      residual,
      controls,
      builtControls: built,
      coverageGap: controls.some(c => !c.built),
      likelihood: t.likelihood,
      impact: t.impact,
    };
  }).sort((a, b) => b.residual - a.residual);
}

export function capabilityExposure(cap: Capability): {
  inherentMax: number;
  residualMax: number;
  meanResidual: number;
  gaps: number;
} {
  const scored = scoreCapability(cap);
  const inherentMax = Math.max(...scored.map(s => s.inherent));
  const residualMax = Math.max(...scored.map(s => s.residual));
  const meanResidual = Math.round((scored.reduce((s, x) => s + x.residual, 0) / scored.length) * 10) / 10;
  const gaps = scored.filter(s => s.coverageGap).length;
  return { inherentMax, residualMax, meanResidual, gaps };
}

/** RAG for a residual threat score (max 25 scale). */
export function threatRag(residual: number): 'green' | 'amber' | 'red' {
  if (residual <= 6) return 'green';
  if (residual <= 12) return 'amber';
  return 'red';
}

// ── MAESTRO 7-layer reference architecture ───────────────────────────────────
// MAESTRO (CSA / Ken Huang) = Multi-Agent Environment, Security, Threat, Risk &
// Outcome. Threat-model an agentic system by decomposing it into 7 layers, then
// applying each layer's threat landscape + cross-layer threats. We keep OWASP
// T1–T17 as the threat vocabulary and place each threat on the layer(s) where it
// primarily manifests, so the model can be viewed BY LAYER (MAESTRO) as well as
// by capability (existing view). Matches the MAESTRO model used in the AI Trust tool.

export interface MaestroLayer {
  n: number;
  id: string;
  name: string;
  blurb: string;
  /** OWASP threats that primarily land on this layer. */
  threats: AgenticRiskCategory[];
}

export const MAESTRO_LAYERS: MaestroLayer[] = [
  { n: 1, id: 'foundation',   name: 'Foundation Models',        blurb: 'The core LLM/model — adversarial examples, model theft, membership inference.',        threats: ['T5', 'T7'] },
  { n: 2, id: 'data-ops',     name: 'Data Operations',          blurb: 'Databases, vector stores, RAG pipelines — data poisoning, RAG compromise.',          threats: ['T1', 'T17'] },
  { n: 3, id: 'agent-frameworks', name: 'Agent Frameworks',     blurb: 'Toolkits/frameworks used to build agents — tool misuse, backdoor/supply-chain.',      threats: ['T2', 'T6'] },
  { n: 4, id: 'deployment',   name: 'Deployment & Infrastructure', blurb: 'Cloud/on-prem infra — container/orchestration/IaC attacks, RCE, privilege compromise.', threats: ['T3', 'T4', 'T11'] },
  { n: 5, id: 'eval-obs',     name: 'Evaluation & Observability', blurb: 'Performance tracking, anomaly detection — metric manipulation, compromised observability, repudiation.', threats: ['T8'] },
  { n: 6, id: 'sec-compliance', name: 'Security & Compliance',  blurb: 'Vertical layer cutting across all others — identity spoofing, evasion of security AI, human manipulation.', threats: ['T9', 'T15'] },
  { n: 7, id: 'ecosystem',    name: 'Agent Ecosystem',          blurb: 'Marketplace where agents meet apps/users — inter-agent comms, rogue agents, protocol abuse, human attacks.', threats: ['T10', 'T12', 'T13', 'T14', 'T16'] },
];

/** Cross-layer threats — MAESTRO emphasizes attacks that span layers. */
export const MAESTRO_CROSS_LAYER: { name: string; blurb: string; owasp: AgenticRiskCategory[] }[] = [
  { name: 'Supply Chain Attacks',       blurb: 'Compromised models/libraries/tools propagate across layers.', owasp: ['T17'] },
  { name: 'Lateral Movement',           blurb: 'Compromise of one agent/tool used to reach others.',          owasp: ['T3', 'T13'] },
  { name: 'Privilege Escalation',       blurb: 'Dynamic role inheritance / delegation exploited upward.',      owasp: ['T3', 'T14'] },
  { name: 'Data Leakage',               blurb: 'Sensitive data exfiltrated across layer boundaries.',          owasp: ['T2', 'T9'] },
  { name: 'Goal-Misalignment Cascades', blurb: 'A manipulated goal propagates through multi-agent workflows.', owasp: ['T5', 'T6', 'T12'] },
];

/** Which MAESTRO layer a given OWASP threat primarily sits on (reverse lookup). */
export function layerForThreat(t: AgenticRiskCategory): MaestroLayer | undefined {
  return MAESTRO_LAYERS.find(l => l.threats.includes(t));
}
