// =============================================================================
// presentationBeats.ts — Iteration 26: Presentation Mode Story Beats
// 24-beat presentation flow — maps to slide deck reconciliation
// =============================================================================

import type { Persona } from '../contexts/PersonaContext';
import type { TabId } from '../types/tabs';

export interface StoryBeat {
  id: number;
  title: string;
  talkingPoints: string[];
  whatToNotice?: string;
  persona: Persona;
  tab: TabId | null; // null = fleet view (no tab)
  scrollTo?: string;
  notes?: string;
  duration?: number; // suggested seconds
}

export const PRESENTATION_BEATS: StoryBeat[] = [
  {
    id: 1,
    title: 'The Problem',
    talkingPoints: [
      '67% of FSI AI projects stall at governance — not capability, governance.',
      'Banks need to prove AI is safe, explainable, and compliant — while moving fast.',
      'Current state: spreadsheets, quarterly reviews, and PowerPoint decks that are out of date on slide 3.',
    ],
    persona: 'cro-fleet',
    tab: null,
    notes: 'Set the scene. This is about the governance gap, not AI capability.',
    duration: 45,
  },
  {
    id: 2,
    title: 'One Console, Four Lenses',
    talkingPoints: [
      'Same system, four stakeholder views. No separate tools, no context-switching.',
      'CRO sees fleet health. Ops sees throughput. Compliance sees evidence. Engineering sees architecture.',
      'Persona selector in top-right — click to switch lens instantly.',
    ],
    whatToNotice: 'The persona selector in the top-right corner',
    persona: 'cro-fleet',
    tab: null,
    notes: 'Point at the persona selector. Emphasise: one URL, four experiences.',
    duration: 30,
  },
  {
    id: 3,
    title: 'CRO Fleet View',
    talkingPoints: [
      'The CRO sees everything at fleet level — 4 AI use cases, health scores, alerts.',
      'Each card is clickable — drill down into any use case.',
      'Aggregate health score: 92. But what does 92 mean? We answer that next.',
    ],
    whatToNotice: 'The 2x2 constellation of AI use cases with health scores',
    persona: 'cro-fleet',
    tab: null,
    notes: 'Hover over a use case card to show it is interactive.',
    duration: 30,
  },
  {
    id: 4,
    title: 'Risk Appetite Alignment',
    talkingPoints: [
      '92 means nothing in isolation. Against a board-set floor of 85? That is +7 GREEN.',
      'One use case breaching appetite — Mortgage at 78 vs floor of 80. Escalation triggered automatically.',
      'Appetite thresholds are configurable — board sets these quarterly.',
    ],
    whatToNotice: 'The RAG indicators and the red alert for Mortgage',
    persona: 'cro-fleet',
    tab: null,
    scrollTo: '[class*="RiskAppetite"]',
    notes: 'Key message: context transforms a number into a governance answer.',
    duration: 40,
  },
  {
    id: 5,
    title: 'KRI Trends & Incidents',
    talkingPoints: [
      'Direction matters more than position. All KRIs improving over 30 days.',
      '2 incidents this month — 1 contained in 4 minutes by Cedar kill switch, 1 under investigation.',
      '5 near-misses blocked by governance controls. Validates the investment.',
    ],
    whatToNotice: 'The sparkline trends and the incident timeline',
    persona: 'cro-fleet',
    tab: null,
    notes: 'Click expand on the KYC latency incident to show the 4-minute containment timeline.',
    duration: 45,
  },
  {
    id: 6,
    title: 'SM&CR Accountability',
    talkingPoints: [
      '"Who is accountable?" Sarah Thompson, CRO, SMF4. Attested 3 weeks ago.',
      'Full chain: CRO → Head of AI → ML Lead. Every decision traceable to a named individual.',
      'One attestation overdue — MLRO. System flagged it before the regulator did.',
    ],
    whatToNotice: 'The accountability chain and attestation RAG status',
    persona: 'cro-fleet',
    tab: null,
    notes: 'Key demo moment: "This is the s166 answer." FCA asks who is accountable — one click.',
    duration: 40,
  },
  {
    id: 7,
    title: 'Business Operations',
    talkingPoints: [
      'Switch persona: Business Ops. Same system, different view.',
      'STP rate 80%. Cost per decision: £2.47. SLA compliance: 94%.',
      'The ops lens answers: "Is AI making us faster, cheaper, and safer?"',
    ],
    whatToNotice: 'The KPI cards with sparkline trends',
    persona: 'business-ops',
    tab: 'operations',
    duration: 35,
  },
  {
    id: 8,
    title: 'Policy Engine — Cedar',
    talkingPoints: [
      'Policies as CODE, not PDFs. 12 Cedar policies, enforceable at runtime.',
      'Real syntax, real enforcement. PERMIT/FORBID with conditions.',
      'Every KYC decision passes through this policy engine before executing.',
    ],
    whatToNotice: 'The Cedar policy syntax highlighting',
    persona: 'business-ops',
    tab: 'governance',
    notes: 'Emphasise: these are not decorative — they actively BLOCK decisions in real-time.',
    duration: 35,
  },
  {
    id: 9,
    title: 'Simulation — Approve Path',
    talkingPoints: [
      'Sarah Chen, Acme Corporation. Low risk. Risk score 22 out of 100.',
      'Auto-approved in 560ms. 7 governance steps — each with policy checks.',
      'Full trace available: every model call, every guardrail, every policy gate.',
    ],
    whatToNotice: 'Step through the 7 governance stages using the → button',
    persona: 'business-ops',
    tab: 'simulation',
    notes: 'Click Next repeatedly to walk through all 7 steps. Pause on step 4 (risk scoring).',
    duration: 60,
  },
  {
    id: 10,
    title: 'Simulation — Block Path',
    talkingPoints: [
      'Viktor Petrov, Omega Trading. OFAC sanctions match at 78%. PEP association confirmed.',
      'Cedar policy: HARD BLOCK. No human can override a sanctions hit above 70%.',
      'SAR filed automatically. Evidence pack generated. MLRO notified.',
    ],
    whatToNotice: 'The red BLOCK indicator and the human-in-the-loop decision point',
    persona: 'business-ops',
    tab: 'simulation',
    notes: 'Switch scenario to Block. Walk through to the HITL step — show the human decision point.',
    duration: 50,
  },
  {
    id: 11,
    title: 'Compliance View',
    talkingPoints: [
      'Switch persona: Compliance. The auditor lens.',
      '86 controls mapped across 5 frameworks. Real-time scoring.',
      'Composite compliance score: 94%. Each control individually assessed.',
    ],
    whatToNotice: 'The framework filter and composite score ring',
    persona: 'compliance',
    tab: 'compliance-audit',
    duration: 35,
  },
  {
    id: 12,
    title: 'Control Testing Evidence',
    talkingPoints: [
      'Not just "control exists" — "control was TESTED and PASSED."',
      '12 controls tested in last 90 days. 1 failed (bias testing). Finding raised.',
      'Click any control: see test procedure, methodology, sample size, tester independence.',
    ],
    whatToNotice: 'The Control Testing Evidence section with test results',
    persona: 'compliance',
    tab: 'compliance-audit',
    notes: 'Expand a test record to show the full detail. Key message: operating effectiveness, not just design.',
    duration: 40,
  },
  {
    id: 13,
    title: 'Model Inventory',
    talkingPoints: [
      '3 AI models registered. EU AI Act Annex VIII compliant.',
      'Risk tiering: Claude Sonnet = High risk. Nova Pro = Limited. Haiku = Minimal.',
      'Each model: validated, bias-assessed, with full data flow documentation.',
    ],
    whatToNotice: 'The risk tier badges and validation status',
    persona: 'compliance',
    tab: 'compliance-audit',
    notes: 'Expand Claude Sonnet to show the full model card with performance metrics.',
    duration: 35,
  },
  {
    id: 14,
    title: 'Evidence Trail',
    talkingPoints: [
      'Immutable evidence. Every decision traced. Your s166 answer in one click.',
      'Timeline view: decisions, policy changes, interventions, QA reviews, alerts.',
      'Full accountability chain: agent → evaluator → policy → human → SMF holder.',
    ],
    whatToNotice: 'The evidence timeline entries and accountability chain below',
    persona: 'compliance',
    tab: 'evidence-trail',
    notes: 'Point out the Decision Attribution section. Expand CUST-001 to show full chain.',
    duration: 40,
  },
  {
    id: 15,
    title: 'Issues & Findings',
    talkingPoints: [
      '8 findings tracked. 3 open, 1 critical at 17 days.',
      'Full lifecycle: Open → In Progress → Remediated → Closed.',
      'Each finding: owner assigned, target date set, linked to specific controls.',
    ],
    whatToNotice: 'The severity badges and aging indicators',
    persona: 'compliance',
    tab: 'compliance-audit',
    notes: 'Expand the critical finding (FND-2026-001) to show remediation plan.',
    duration: 30,
  },
  {
    id: 16,
    title: 'Engineering View',
    talkingPoints: [
      'Switch persona: Engineering. The builder view.',
      'How this actually runs on AWS. Not metrics — topology.',
      'Decision traces, architecture layers, model performance.',
    ],
    persona: 'engineering',
    tab: 'architecture',
    duration: 25,
  },
  {
    id: 17,
    title: 'Architecture — How It Is Built',
    talkingPoints: [
      'Request flow: API Gateway → Lambda → Bedrock → Cedar → Response.',
      'Defence in depth: 3 layers (Probabilistic, Deterministic, Observability).',
      'Every component visible, every data flow mapped.',
    ],
    whatToNotice: 'The request flow diagram and defence-in-depth layers',
    persona: 'engineering',
    tab: 'architecture',
    notes: 'Scroll to the request flow diagram. Highlight the Cedar policy gate in the middle.',
    duration: 35,
  },
  {
    id: 18,
    title: 'Decision Trace Waterfall',
    talkingPoints: [
      'Every model call, every policy check, every guardrail — timestamped.',
      'CUST-001: 560ms total. 9 steps. All green.',
      'CUST-047: 1,240ms total. Cedar DENY at step 5. SAR generated.',
    ],
    whatToNotice: 'The waterfall trace with colour-coded steps',
    persona: 'engineering',
    tab: 'simulation',
    notes: 'This is the Agent Traces view — engineering persona sees waterfall instead of step-through.',
    duration: 40,
  },
  {
    id: 19,
    title: 'Decision Attribution Chain',
    talkingPoints: [
      'For every AI decision: who is accountable?',
      'Agent → Evaluator → Policy → Human → Technical Owner → SMF Holder.',
      'Regulatory basis and governance framework cited for each automation level.',
    ],
    whatToNotice: 'Expand the CUST-001 attribution card to see the full chain',
    persona: 'engineering',
    tab: 'simulation',
    duration: 30,
  },
  {
    id: 20,
    title: 'Cedar Policies (Live DSL)',
    talkingPoints: [
      'Real Cedar policy language. PERMIT/FORBID with conditions.',
      'These are the actual policies enforcing decisions at runtime.',
      'Not conceptual — every KYC decision passes through these gates.',
    ],
    whatToNotice: 'The Cedar syntax highlighting and policy list',
    persona: 'engineering',
    tab: 'cedar-policy',
    duration: 30,
  },
  {
    id: 21,
    title: 'The ROI Story',
    talkingPoints: [
      'STP rate: 80%. 1,000 decisions today with zero human touch.',
      'Cost per decision: £2.47 all-in — down from £8.33 manual. 70% reduction.',
      'Capacity planning: absorb +20% volume without hiring. Automation over headcount.',
    ],
    whatToNotice: 'The cost comparison bar and capacity planning slider',
    persona: 'business-ops',
    tab: 'operations',
    notes: 'Drag the capacity slider to +20% to show the FTE projection live.',
    duration: 40,
  },
  {
    id: 22,
    title: 'Board Pack — One Click',
    talkingPoints: [
      'CRO needs a board summary? One click. Generated from live data.',
      'Fleet health, trend direction, open incidents, attestation status.',
      'Key recommendation auto-generated: "Increase KYC to Level 3. Restrict Mortgage."',
    ],
    whatToNotice: 'The Generate Board Pack button and the resulting summary',
    persona: 'cro-fleet',
    tab: null,
    notes: 'Click the Generate Board Pack button to show the one-page summary.',
    duration: 35,
  },
  {
    id: 23,
    title: 'Only on AWS',
    talkingPoints: [
      'Cedar — Amazon Verified Permissions. Policy as code, not as PDF.',
      'Bedrock Guardrails — automated content safety at inference time.',
      'AgentCore — managed multi-model orchestration with native governance hooks.',
      'Multi-Model Chain — Claude Sonnet + Nova Pro + Haiku, governed end-to-end.',
    ],
    whatToNotice: 'The multi-model governance chain with AWS badges',
    persona: 'engineering',
    tab: 'architecture',
    notes: 'Key AWS differentiation slide. Emphasise: these are managed services, not DIY.',
    duration: 40,
  },
  {
    id: 24,
    title: 'Close — One URL',
    talkingPoints: [
      'No PowerPoint. No alt-tab. One URL. The demo IS the governance.',
      'Every metric you saw is live. Click anything — it responds.',
      '"Can I see that again?" — yes, it is right here. Always.',
    ],
    persona: 'cro-fleet',
    tab: null,
    notes: 'Final beat. Return to CRO Fleet. Let the dashboard speak. Pause for questions.',
    duration: 30,
  },
];
