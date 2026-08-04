// Compute logic mirroring backend models/organization_design.py `compute()`.
// Runs locally for the localStorage fallback path.

import {
  DIMENSIONS,
  INDUSTRY_WEIGHTS,
  INDUSTRY_GATES,
  STRUCTURE_SPANS,
  STRUCTURE_MATRIX,
  PHASE_ATTRIBUTES,
  COST_BENCHMARKS,
  WORKFORCE_MIX_DEFAULT,
} from './types';
import type {
  ODOrgProfile,
  ODStrategyInputs,
  ODOperatingModelInputs,
  ODMaturityScores,
  ODAgentConfig,
  ODFunctionConfig,
  ODFunctionAgentBreakdown,
  ODHierarchyLayer,
  ODGateStatus,
  ODDimensionResult,
  ODScenarioSummary,
  ODWorkforcePhase,
  ODWorkforcePlan,
  ODTransitionEconomics,
  ODInvestmentAllocation,
  ComputedOrganizationDesign,
  Phase,
} from './types';

const PHASES: Phase[] = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

// -----------------------------------------------------------------------------

export function industryWeights(industry: string): Record<string, number> {
  return { ...(INDUSTRY_WEIGHTS[industry] ?? INDUSTRY_WEIGHTS['Other']) };
}

function classifyComplexity(nodes: number): 'Simple' | 'Moderate' | 'Complex' {
  if (nodes > 100) return 'Complex';
  if (nodes >= 20) return 'Moderate';
  return 'Simple';
}

function classifyScale(headcount: number): 'Enterprise' | 'Large' | 'Mid-Market' | 'Small' {
  if (headcount >= 10000) return 'Enterprise';
  if (headcount >= 1000)  return 'Large';
  if (headcount >= 200)   return 'Mid-Market';
  return 'Small';
}

export function archetypeFrom(composite: number): 'Stagnating' | 'Scaling' | 'Future-built' {
  if (composite >= 4.0) return 'Future-built';
  if (composite >= 2.5) return 'Scaling';
  return 'Stagnating';
}

function expandedArchetype(archetype: string, complexity: string): string {
  const suffix = complexity === 'Simple' ? 'Simple' : 'Complex';
  return `${archetype}-${suffix}`;
}

function strategicReadiness(strategy: ODStrategyInputs): number {
  const primary = strategy.value_chain.filter((v) => v.kind === 'primary');
  if (!primary.length) return 2.5;
  const avgImportance = primary.reduce((s, v) => s + v.strategic_importance, 0) / primary.length;
  const caps = strategy.capabilities;
  const avgGap = caps.length
    ? caps.reduce((s, c) => s + Math.max(0, c.priority - c.current_maturity), 0) / caps.length
    : 0;
  const v = (avgImportance / 5 + (5 - avgGap) / 5) / 2 * 5;
  return Math.round(v * 10000) / 10000;
}

function computeFunctionRow(fn: ODFunctionConfig, cfg: ODAgentConfig): ODFunctionAgentBreakdown {
  const totalAgents = fn.automated_processes * 2;
  const subPct = fn.type === 'Shared Services'
    ? Math.min(1.0, cfg.pct_subordinate + 0.15)
    : Math.max(0.0, cfg.pct_subordinate - 0.15);
  const subs = Math.round(totalAgents * subPct);
  const peers = Math.max(0, totalAgents - subs);
  const span = Math.max(1, cfg.span_of_control);
  const supervisors = (fn.headcount + subs) ? Math.ceil((fn.headcount + subs) / span) : 0;
  const dominant = fn.type === 'Shared Services'
    ? (subs > peers ? 'Primarily Subordinate' : 'Mixed')
    : (peers > subs ? 'Primarily Peer' : 'Mixed');
  const denom = subs + peers;
  const ratioLabel = denom ? `${(fn.headcount / denom).toFixed(1)}:1` : 'No AI';
  return {
    key: fn.key, label: fn.label, type: fn.type,
    human_staff: fn.headcount, total_agents: totalAgents,
    agents_subordinate: subs, agents_peer: peers,
    supervisors, teams: supervisors, dominant_role: dominant,
    total_positions: fn.headcount + totalAgents,
    ratio_label: ratioLabel,
  };
}

function hierarchy(companySize: number, targetPhase: string, spanAi: number): ODHierarchyLayer[] {
  const l1 = Math.max(1, Math.round(companySize / 5000) + 3);
  const l2 = Math.max(2, Math.round(companySize / 500));
  const l3 = Math.max(3, Math.round(companySize / 150));
  const l4 = Math.max(5, Math.round(companySize / Math.max(1, spanAi)));
  const l5 = Math.round(companySize * 0.15);
  const used = l1 + l2 + l3 + l4 + l5;
  const l6 = Math.max(0, companySize - used);
  const aiOnlyActive = targetPhase === 'Phase 3' || targetPhase === 'Phase 4';
  return [
    { layer: 1, level_name: 'C-Suite',       human_roles: 'CAIO, CEO, CTO',                                agent_functions: 'Strategic AI Advisory',        headcount: l1, ratio: '1:1-3',   phase_active: 'Phase 1+' },
    { layer: 2, level_name: 'VP/Senior Dir', human_roles: 'AI Agent Orchestrator, VP AI Strategy',         agent_functions: 'Multi-agent Orchestration',    headcount: l2, ratio: '1:50-200',phase_active: 'Phase 2+' },
    { layer: 3, level_name: 'Director',      human_roles: 'Director AI Ops, Agentic Process Owner',        agent_functions: 'Process Autonomous Agents',    headcount: l3, ratio: '1:100+',  phase_active: 'Phase 2-3+' },
    { layer: 4, level_name: 'Manager',       human_roles: 'Hybrid Manager, Agent Ops Manager',             agent_functions: 'Task-execution Agents',        headcount: l4, ratio: '1:20-50', phase_active: 'Phase 1-2+' },
    { layer: 5, level_name: 'Senior IC',     human_roles: 'AI Agent Builder, AI Architect, Prompt Engineer',agent_functions: 'Specialized Task Agents',     headcount: l5, ratio: '1:3-10',  phase_active: 'Phase 1+' },
    { layer: 6, level_name: 'IC',            human_roles: 'AI Champion, Knowledge Worker + Copilot',       agent_functions: 'Copilot Agents',               headcount: l6, ratio: '1:1-3',   phase_active: 'Phase 1+' },
    { layer: 7, level_name: 'AI-Only Layer', human_roles: 'N/A (Human Oversight)',                          agent_functions: 'Autonomous Execution Agents', headcount: 0,  ratio: '0:many',  phase_active: aiOnlyActive ? 'Phase 3-4' : 'Not Yet Active' },
  ];
}

function transition(profile: ODOrgProfile): ODTransitionEconomics {
  const b = COST_BENCHMARKS;
  const current = profile.company_size;
  const target = Math.max(1, Math.round(current * 0.85));
  const delta = target - current;
  const absdelta = Math.abs(Math.min(delta, 0));
  const severance = absdelta * b.severanceICWeeks * b.weeklySalary;
  const reskill = current * 0.5 * b.reskillingPerEmployee * 0.1;
  const hiring = current * 0.05 * b.hiringNonExec;
  const dip = profile.annual_revenue_m * 1_000_000 * b.productivityDipPct * (b.productivityDipMonths / 12);
  const total = severance + reskill + hiring + dip;
  const annualSavings = absdelta * b.weeklySalary * 52;
  const payback = annualSavings ? Math.round((total / annualSavings) * 100) / 100 : null;
  const roi = total ? Math.round(((annualSavings * 3 - total) / total) * 10000) / 10000 : 0;
  return {
    severance_cost: round2(severance),
    reskilling_investment: round2(reskill),
    hiring_cost: round2(hiring),
    productivity_dip_cost: round2(dip),
    total_transition_cost: round2(total),
    expected_annual_savings: round2(annualSavings),
    payback_years: payback,
    three_year_roi: roi,
  };
}

function workforce(profile: ODOrgProfile): ODWorkforcePlan {
  const b = COST_BENCHMARKS;
  const mix = WORKFORCE_MIX_DEFAULT;
  const scales = [1.0, 0.9, 0.75, 0.6];
  const phases: ODWorkforcePhase[] = PHASES.map((ph, i) => {
    const total = Math.round(profile.company_size * scales[i]);
    const build = Math.round(total * mix.build);
    const buy = Math.round(total * mix.buy);
    const borrow = Math.round(total * mix.borrow);
    const bot = Math.round(total * mix.bot);
    const cost = build * b.reskillingPerEmployee
      + buy * b.hiringNonExec
      + borrow * 130000 * 0.5
      + bot * 50000;
    return { phase: ph, total_headcount: total, build, buy, borrow, bot, total_cost: round2(cost) };
  });
  const totalInvestment = round2(phases.reduce((s, p) => s + p.total_cost, 0));
  const reskillSavings = round2(phases.reduce((s, p) => s + p.build, 0) * b.reskillingSavingsVsHiring);
  return { phases, total_investment: totalInvestment, reskill_vs_hire_savings: reskillSavings };
}

const SCENARIO_MULT: Record<string, { severance: number; reskilling: number }> = {
  Conservative: { severance: 0.30, reskilling: 0.50 },
  Moderate:     { severance: 1.00, reskilling: 1.00 },
  Aggressive:   { severance: 1.80, reskilling: 1.50 },
};

function scenarios(t: ODTransitionEconomics): ODScenarioSummary[] {
  const base = t.severance_cost + t.reskilling_investment;
  const build = (name: string, timeline: string, prod: string, invest: string, hc: string, risk: string, sp: string, payback: string, ratio: string, layers: string): ODScenarioSummary => {
    const mult = SCENARIO_MULT[name];
    return {
      scenario: name, timeline, productivity: prod, investment_pct: invest,
      headcount_reduction: hc,
      severance_cost: round2(base * mult.severance),
      reskilling: round2(t.reskilling_investment * mult.reskilling),
      risk_level: risk, success_probability: sp, payback, ratio, layers_eliminated: layers,
    };
  };
  return [
    build('Conservative', '7-10 years', '10-25%',           '1-2%', '5-10%',  'Low',    '70-80%', '3-5 years', '1:3-5',   '1-2'),
    build('Moderate',     '5-7 years',  '25-60%',           '2-4%', '15-25%', 'Medium', '50-60%', '2-3 years', '1:20-50', '2-4'),
    build('Aggressive',   '3-5 years',  '60%+ to 3x-10x',   '4-8%', '30-50%', 'High',   '24-30%', '1-2 years', '1:100+',  '4-6'),
  ];
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// -----------------------------------------------------------------------------

export function compute(
  profile: ODOrgProfile,
  strategy: ODStrategyInputs,
  operating_model: ODOperatingModelInputs,
  scores: ODMaturityScores,
  weights: Record<string, number> | null | undefined,
  agent_config: ODAgentConfig,
): ComputedOrganizationDesign {
  const industry = profile.industry;
  const w = weights ?? industryWeights(industry);
  const scoreObj = scores as unknown as Record<string, number>;

  const dims: Record<string, ODDimensionResult> = {};
  let num = 0, den = 0;
  for (const d of DIMENSIONS) {
    const s = Number(scoreObj[d.key] ?? 0) || 0;
    const dw = Number(w[d.key] ?? 0) || 0;
    dims[d.key] = { label: d.label, score: s, weight: dw, weighted: round2(s * dw), gap: 5 - s };
    if (s) { num += s * dw; den += dw; }
  }
  const composite = den ? Math.round((num / den) * 10000) / 10000 : 0;
  const simpleAvg = Math.round((DIMENSIONS.reduce((s, d) => s + (scoreObj[d.key] ?? 0), 0) / DIMENSIONS.length) * 10000) / 10000;
  const arche = archetypeFrom(composite);

  const nodes = Math.max(1, operating_model.num_product_lines * operating_model.num_geographies * operating_model.num_customer_segments);
  const complexity = classifyComplexity(nodes);
  const scale = classifyScale(profile.company_size);
  const expanded = expandedArchetype(arche, complexity);

  // Gates
  const gcfg = INDUSTRY_GATES[industry] ?? INDUSTRY_GATES['Other'];
  const gates: ODGateStatus[] = ([
    ['governance', 'Governance Gate', scores.governance_accountability, gcfg.governance],
    ['ai_maturity','AI Maturity Gate', scores.ai_maturity,                gcfg.ai_maturity],
    ['culture',    'Culture Gate',     scores.culture_change_readiness,   gcfg.culture],
    ['leadership', 'Leadership Gate',  scores.leadership_capability,      gcfg.leadership],
  ] as const).map(([key, label, s, req]) => {
    const passed = s >= req;
    return {
      key: String(key),
      label: String(label),
      score: Number(s),
      required: Number(req),
      passed,
      detail: passed ? `Score ${s.toFixed(1)} ≥ ${req.toFixed(1)}` : `Score ${s.toFixed(1)} < ${req.toFixed(1)}`,
    };
  });
  const allPassed = gates.every((g) => g.passed);

  const recScenario = composite >= 3.5 ? 'Aggressive' : composite >= 2.5 ? 'Moderate' : 'Conservative';
  const scenarioAlignment = profile.scenario_pathway === recScenario
    ? 'ALIGNED'
    : `MISALIGNED — recommended ${recScenario}`;

  // Span & layers
  const spanCfg = STRUCTURE_SPANS[profile.structure_type] ?? STRUCTURE_SPANS['Functional'];
  const spanAi = Math.max(2, Math.round(spanCfg.min * 1.5));
  const size = Math.max(2, profile.company_size);
  const midSpan = (spanCfg.min + spanCfg.max) / 2;
  const currentLayers = Math.max(2, Math.ceil(Math.log(size) / Math.log(midSpan)));
  const targetLayers = Math.max(2, Math.ceil(Math.log(size) / Math.log(spanAi)));

  const recommendedStructure = STRUCTURE_MATRIX[arche]?.[profile.target_phase as Phase] ?? '—';
  const phaseAttr = PHASE_ATTRIBUTES[profile.target_phase as Phase];

  const totalBudget = round2(profile.annual_revenue_m * profile.ai_budget_pct);
  const investment: ODInvestmentAllocation = {
    total_budget_m: totalBudget,
    technology_m: round2(totalBudget * 0.10),
    data_infra_m: round2(totalBudget * 0.20),
    people_process_m: round2(totalBudget * 0.70),
  };

  const functions = agent_config.functions.map((fn) => computeFunctionRow(fn, agent_config));
  const totalAgents = functions.reduce((s, f) => s + f.total_agents, 0);
  const totalSub = functions.reduce((s, f) => s + f.agents_subordinate, 0);
  const totalPeer = functions.reduce((s, f) => s + f.agents_peer, 0);
  const totalSup = functions.reduce((s, f) => s + f.supervisors, 0);
  const totalTeams = functions.reduce((s, f) => s + f.teams, 0);
  const totalHumans = functions.reduce((s, f) => s + f.human_staff, 0);
  const totalWorkforce = totalHumans + totalSub + totalPeer;
  const pctAi = totalWorkforce ? Math.round((totalSub + totalPeer) / totalWorkforce * 10000) / 10000 : 0;
  const effRatio = (totalSub + totalPeer) ? `${(totalHumans / (totalSub + totalPeer)).toFixed(1)}:1` : 'N/A';

  const hier = hierarchy(profile.company_size, profile.target_phase, spanAi);
  const tr = transition(profile);
  const wf = workforce(profile);
  const scen = scenarios(tr);

  return {
    dimensions: dims,
    weights: w,
    composite,
    simple_average: simpleAvg,
    archetype: arche,
    complexity_class: complexity,
    coordination_nodes: nodes,
    expanded_archetype: expanded,
    scale_class: scale,
    strategic_ai_readiness: strategicReadiness(strategy),
    gates,
    all_gates_passed: allPassed,
    scenario_alignment: scenarioAlignment,
    recommended_structure: recommendedStructure,
    current_layers: currentLayers,
    target_layers: targetLayers,
    layers_eliminated: Math.max(0, currentLayers - targetLayers),
    span_current_min: spanCfg.min,
    span_current_max: spanCfg.max,
    span_ai_adjusted: spanAi,
    governance_level: phaseAttr?.governance ?? '—',
    ratio_target: phaseAttr?.ratio ?? '—',
    expected_productivity_gain: phaseAttr?.gain ?? '—',
    investment,
    functions,
    hierarchy: hier,
    transition: tr,
    workforce: wf,
    scenarios: scen,
    total_ai_agents: totalAgents,
    total_agents_subordinate: totalSub,
    total_agents_peer: totalPeer,
    total_human_supervisors: totalSup,
    total_teams: totalTeams,
    pct_workforce_ai: pctAi,
    effective_ratio: effRatio,
  };
}

// Cell colouring helpers ------------------------------------------------------

export function archetypeColor(archetype: string): string {
  if (archetype.startsWith('Future')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (archetype.startsWith('Scaling'))return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

export function gateColor(passed: boolean): string {
  return passed
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-red-50 text-red-700 border-red-200';
}

export function phaseColor(phase: string): string {
  switch (phase) {
    case 'Phase 1': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'Phase 2': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Phase 3': return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'Phase 4': return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
    default:        return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export function scenarioColor(s: string): string {
  switch (s) {
    case 'Conservative': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Moderate':     return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'Aggressive':   return 'bg-rose-50 text-rose-700 border-rose-200';
    default:             return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
