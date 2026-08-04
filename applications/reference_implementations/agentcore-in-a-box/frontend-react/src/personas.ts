// personas.ts — the frontend persona registry. Each persona is a self-contained *desk*:
// branding/copy, an agent-identity map (key → name/color/icon), the ordered roster, the
// Swarm/Graph quick-prompt catalogs, and the AWS-stack primitive triggers/copy. It mirrors
// the backend agent/personas.py (the agent-key sets MUST match, since the backend emits
// those keys in the __agent/__handoff/__graph markers the viz reads).
//
// The AgentCore *platform* is shared across all personas — the primitives, the transport,
// the auth. A persona only swaps the desk that runs on top. Theming is done purely by CSS:
// each persona's accent tokens (--primary/--ring/--chart-*/--agent-<key>) live under a
// `:root.persona-<id>` selector in styles.css, applied by toggling an <html> class (exactly
// how dark/light already works). capital_markets uses the base :root tokens (no class), so
// it is byte-for-byte the original Meridian experience.

import {
  // Capital markets
  Workflow, Database, Search, Cpu, ShieldCheck, Briefcase, Landmark, Leaf, PieChart,
  Droplets, Scale, Activity,
  // Insurance (Ridgeline)
  Inbox, Calculator, FileSignature, CloudLightning, Layers, ShieldAlert, Umbrella,
  // Banking (Rampart)
  Building2, ClipboardCheck, BadgeDollarSign, Handshake, FileSearch,
  // Fintech (Kairo)
  Radar, Wallet, Globe2, Fingerprint, TrendingUp, Banknote,
  type LucideIcon,
} from 'lucide-react';

export type PersonaId = 'capital_markets' | 'insurance' | 'banking' | 'fintech';

export type AgentIdentity = { name: string; color: string; Icon: LucideIcon };

export type QuickPrompt = { label: string; hint: string; agent: string; prompt: string };

export type StackPrimitive = {
  key: string;
  name: string;
  value: string;       // the business value it proves (persona-flavored subtext)
  triggers: string[];  // __tool names (or markers) that light this primitive up
};

export type PersonaDef = {
  id: PersonaId;
  // Login-picker card
  cardTitle: string;   // short vertical name, e.g. "Capital Markets"
  cardBlurb: string;   // one line under the card title
  Icon: LucideIcon;    // the vertical's mark on the picker + header
  // Branding / copy
  firmName: string;
  wordmark: string;    // ALLCAPS header wordmark
  tagline: string;     // header + login subtitle lead
  loginSubtitle: string;
  heroTitle: string;
  heroBlurb: string;   // supports simple <strong> wrapping via dangerouslySetInnerHTML
  composerPlaceholder: string;
  livePillLabel: string;
  answerLabel: string; // field-key on the assistant answer panel (e.g. "Desk answer")
  // Roster: identity map + display order (keys MUST match backend personas.py roster keys)
  agents: Record<string, AgentIdentity>;
  order: string[];
  // Quick prompts
  swarmPrompts: QuickPrompt[];
  graphPrompts: QuickPrompt[];
  // AWS-stack rail (Runtime/Gateway+Cedar/Identity/Memory/Code/Browser/Observability)
  primitives: StackPrimitive[];
  // Sidebar Identity-section bullets (per-vertical framing of the three Identity modes)
  identityBullets: { title: string; body: string }[];
};

// The seven AgentCore primitives, in platform-story order. Only the `value` subtext and the
// domain-tool `triggers` differ per persona; Runtime/Swarm/Memory/Browser/Code/Observability
// structure is shared. Personas override `value` + the Gateway/Identity `triggers`.
function primitives(over: Partial<Record<string, Partial<StackPrimitive>>>): StackPrimitive[] {
  const base: StackPrimitive[] = [
    { key: 'runtime', name: 'AgentCore Runtime', value: 'Serverless agent hosting · per-session microVM isolation', triggers: ['*'] },
    { key: 'swarm', name: 'Strands Multi-Agent Swarm', value: 'Autonomous specialist hand-offs on the Strands SDK', triggers: ['handoff', 'agent_active'] },
    { key: 'gateway', name: 'Gateway + Cedar Policy', value: 'APIs → governed MCP tools · policy-enforced access', triggers: ['secure_vault', 'user_data_lookup', 'query_holdings'] },
    { key: 'identity', name: 'AgentCore Identity', value: '3-legged OAuth · agent acts on the user’s behalf', triggers: ['positions_view', 'trade_execute'] },
    { key: 'memory', name: 'AgentCore Memory', value: 'Long-term recall of the user’s mandate across sessions', triggers: ['__memory'] },
    { key: 'code', name: 'Code Interpreter', value: 'Sandboxed Python for bespoke analytics', triggers: ['code_interpreter'] },
    { key: 'browser', name: 'AgentCore Browser', value: 'Managed headless browser for live web data', triggers: ['web_browser'] },
    { key: 'observability', name: 'Observability', value: 'OpenTelemetry → CloudWatch GenAI traces & token metrics', triggers: ['__observability'] },
    { key: 'evaluations', name: 'AgentCore Evaluations', value: 'LLM-as-judge scoring · governance judge on every turn', triggers: ['__evaluations'] },
    { key: 'registry', name: 'AWS Agent Registry', value: 'Governed catalog of agents & MCP tools · admin-curated', triggers: ['__registry'] },
    { key: 'harness', name: 'AgentCore Harness', value: 'Managed agent loop declared as config — no orchestration code', triggers: ['__harness'] },
    { key: 'optimization', name: 'AgentCore Optimization', value: 'Trace-driven prompt/tool tuning · A/B with significance', triggers: ['__optimization'] },
  ];
  return base.map((p) => ({ ...p, ...(over[p.key] || {}) }));
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA: capital_markets — the original Meridian fixed-income desk (verbatim).
// ═══════════════════════════════════════════════════════════════════════════
const CAPITAL_MARKETS: PersonaDef = {
  id: 'capital_markets',
  cardTitle: 'Capital Markets',
  cardBlurb: 'Fixed-income portfolio intelligence',
  Icon: Activity,
  firmName: 'AgentCore in a Box',
  wordmark: 'AGENTCORE',
  tagline: 'Portfolio Intelligence',
  loginSubtitle: 'Portfolio Intelligence — on Amazon Bedrock AgentCore',
  heroTitle: 'AgentCore in a Box — Fixed-Income Portfolio Intelligence',
  heroBlurb:
    'An autonomous multi-agent swarm on Amazon Bedrock AgentCore, built on the ' +
    '<strong>Strands Agents SDK</strong>, working a <strong>~3,000-bond universe</strong> ' +
    'priced off the live US Treasury curve and real ICE BofA credit spreads. A Lead ' +
    'Coordinator routes to <strong>nine specialists</strong> — Universe &amp; Data, Credit ' +
    'Research, Macro &amp; Rates, ESG, Risk &amp; Quant, Performance Attribution, Compliance, ' +
    'Liquidity and Execution — who screen the universe and run an <strong>evolutionary ' +
    'portfolio construction</strong> in the Code Interpreter against your mandate. An ' +
    '<strong>Investment Committee</strong> then reconciles and challenges their work into a ' +
    'single verdict. Every hand-off, tool call and AgentCore primitive lights up live. Try ' +
    '“Full Core Bond Review” on the left to run the whole desk in one pass.',
  composerPlaceholder: 'Ask about your funds, run analytics, or execute a trade…',
  livePillLabel: 'AgentCore Swarm · Live',
  answerLabel: 'Desk Answer',
  agents: {
    orchestrator: { name: 'Lead Coordinator', color: 'var(--agent-orchestrator)', Icon: Workflow },
    universe: { name: 'Universe & Data', color: 'var(--agent-universe)', Icon: Database },
    research: { name: 'Credit Research', color: 'var(--agent-research)', Icon: Search },
    analytics: { name: 'Risk & Quant', color: 'var(--agent-analytics)', Icon: Cpu },
    compliance: { name: 'Compliance & Controls', color: 'var(--agent-compliance)', Icon: ShieldCheck },
    trading: { name: 'Portfolio & Execution', color: 'var(--agent-trading)', Icon: Briefcase },
    macro: { name: 'Macro & Rates', color: 'var(--agent-macro)', Icon: Landmark },
    esg: { name: 'ESG & Sustainability', color: 'var(--agent-esg)', Icon: Leaf },
    attribution: { name: 'Performance Attribution', color: 'var(--agent-attribution)', Icon: PieChart },
    liquidity: { name: 'Liquidity & Microstructure', color: 'var(--agent-liquidity)', Icon: Droplets },
    committee: { name: 'Investment Committee', color: 'var(--agent-committee)', Icon: Scale },
  },
  order: ['orchestrator', 'universe', 'research', 'macro', 'esg', 'analytics', 'attribution', 'compliance', 'liquidity', 'trading', 'committee'],
  swarmPrompts: [
    { label: 'Build a Core Bond Portfolio', hint: 'Risk & Quant · evolve', agent: 'analytics', prompt: 'Build me an investment-grade core bond portfolio: target ~6-year duration to track the US Agg, BBB rating floor, no more than 30% in any sector, ~30 holdings, balance yield against risk. Run the evolutionary construction and show me the leaderboard and the winning portfolio.' },
    { label: 'Reach for Yield', hint: 'Risk & Quant · evolve', agent: 'analytics', prompt: 'Construct a higher-yielding core-plus portfolio: keep ~6-year duration but tilt hard toward yield (allow high-yield down to BB), ~30 holdings. Evolve it and compare the winner against the Agg on yield, tracking error and rate-shock stress.' },
    { label: 'Read the Rate Regime', hint: 'Macro & Rates · FOMC + curve', agent: 'macro', prompt: 'Read the current US Treasury par-yield curve and the latest FOMC guidance from the web. Is the curve steepening, flattening or inverted, where do credit spreads sit versus history, and what does it imply for how I should position duration right now?' },
    { label: 'Treasury Curve', hint: 'Universe & Data · FRED', agent: 'universe', prompt: 'Show me the current US Treasury par-yield curve across maturities.' },
    { label: 'Credit Spreads', hint: 'Universe & Data · ICE BofA', agent: 'universe', prompt: 'Pull the current credit-spread ladder by rating (AAA through CCC) and tell me where BBB spreads sit.' },
    { label: 'Licensed Market Feed', hint: 'Universe & Data · Identity M2M', agent: 'universe', prompt: "Pull the firm's licensed market-data vendor feed for the current Treasury curve, and tell me it came in over our application (machine-to-machine) entitlement rather than on my behalf." },
    { label: 'Live CPI & Fed Funds', hint: 'Macro & Rates · FRED api-key', agent: 'macro', prompt: 'Pull the latest CPI inflation print and the current fed funds rate from FRED, and tell me what they imply for how I should position duration.' },
    { label: 'Screen the Universe', hint: 'Universe & Data · 3k bonds', agent: 'universe', prompt: 'Screen the bond universe for investment-grade Financials with 4–7 year duration and the highest yields. Show me the top names.' },
    { label: 'ESG Issuer Screen', hint: 'ESG · web + mandate', agent: 'esg', prompt: 'Screen a handful of large US issuers — Apple, JPMorgan, ExxonMobil and NextEra Energy — for ESG ratings, controversies and green/sustainability-bond issuance. Which would pass a mainstream investment-grade ESG mandate, and which are exclusion-list risks?' },
    { label: 'Stress My Portfolio', hint: 'Risk & Quant · rate shocks', agent: 'analytics', prompt: 'For a portfolio of JPM, AAPL, XOM, UNH and VZ equally weighted, what is the duration, yield and rate-shock P&L at +/-100 and +/-200bps versus the Agg?' },
    { label: 'Attribute My Returns', hint: 'Attribution · vs the Agg', agent: 'attribution', prompt: 'For a portfolio of JPM, AAPL, XOM, UNH and VZ equally weighted, decompose the active return and risk versus the US Agg into carry, curve, credit and selection, and rank the biggest drivers.' },
    { label: 'Liquidity & Execution Plan', hint: 'Liquidity · slice + impact', agent: 'liquidity', prompt: 'For a portfolio of JPM, AAPL, XOM, UNH and VZ equally weighted, rank the holdings by liquidity, flag the least tradable name, and lay out how you would work a $50mm sell in it to limit market impact.' },
    { label: 'My Mandate & Funds', hint: 'Credit Research · Identity', agent: 'research', prompt: 'Look up my portfolio manager profile, the funds I manage, and my benchmark.' },
    { label: 'Restricted List', hint: 'Compliance · Vault + Cedar', agent: 'compliance', prompt: "What's on the firm's restricted trading list right now?" },
  ],
  graphPrompts: [
    { label: 'Full Core Bond Review', hint: 'Full DAG · fans in to Committee', agent: 'committee', prompt: 'Run a full desk review and give me the Investment Committee verdict. (1) Build an investment-grade core bond portfolio to ~6-year duration, BBB floor, ≤30% per sector, ~30 holdings, balancing yield and risk. (2) Attribute its risk and return versus the US Agg (carry / curve / credit / selection). (3) ESG-screen its largest issuers and flag any exclusion risks. (4) Assess the liquidity of the holdings and outline an execution plan. Then have the Investment Committee reconcile all of it, call out the conflicts and trade-offs, and issue a go / adjust / no-go decision.' },
    { label: 'Regime → Build → Sign-off', hint: 'Macro-led · fans in to Committee', agent: 'committee', prompt: 'Start from the macro view and end with a committee sign-off. First read the Treasury curve and latest FOMC guidance and decide how to position duration. Then build an investment-grade portfolio to that duration view (BBB floor, ~30 holdings). Attribute its risk versus the Agg, ESG-screen the top holdings, assess liquidity, and have the Investment Committee challenge the whole package and give a final verdict with the key risks.' },
    { label: 'Core-Plus Yield Review', hint: 'Yield tilt · full DAG', agent: 'committee', prompt: 'Run a full desk review for a core-plus mandate. Build a higher-yielding portfolio that keeps ~6-year duration but reaches for yield (allow high-yield down to BB), ~30 holdings. Attribute its risk and return versus the US Agg, ESG-screen the largest issuers for exclusion risks, and assess the liquidity of the lower-rated names with an execution plan. Then have the Investment Committee weigh the extra yield against the added credit, liquidity and tracking-error risk and issue a go / adjust / no-go verdict.' },
    { label: 'Short-Duration Defensive Review', hint: 'Defensive · full DAG', agent: 'committee', prompt: 'Run a full desk review for a defensive, capital-preservation mandate. Build a short-duration, up-in-quality portfolio (~3-year duration, A rating floor, ~30 holdings). Attribute its risk versus the US Agg, ESG-screen the top holdings, and assess liquidity with an execution plan. Then have the Investment Committee judge whether the defensiveness costs too much yield and issue a go / adjust / no-go verdict.' },
  ],
  primitives: primitives({
    gateway: { value: 'APIs → governed MCP tools · policy-enforced access', triggers: ['secure_vault', 'user_data_lookup', 'bond_screen', 'curve_lookup', 'spread_lookup', 'price_bond', 'portfolio_risk'] },
    identity: { value: '3-legged OAuth · agent acts on behalf of the PM', triggers: ['positions_view', 'trade_execute'] },
    memory: { value: 'Long-term recall of the PM’s mandate across sessions', triggers: ['__memory'] },
    code: { value: 'Sandboxed Python for portfolio analytics', triggers: ['code_interpreter'] },
    browser: { value: 'Managed headless browser for live market data', triggers: ['web_browser'] },
  }),
  identityBullets: [
    { title: '3-legged OAuth', body: 'the agent acts on your behalf (your funds only).' },
    { title: 'Machine-to-machine', body: "the agent acts as the firm's licensed app (market-data vendor)." },
    { title: 'API-key vault', body: 'outbound secrets (FRED) live in Identity, never in the agent.' },
  ],
};

// Shared 7-primitive AWS-stack rail, re-voiced per vertical. `gateway`/`identity` triggers
// vary because each desk's governed tools differ; the rest are platform-constant.
const INSURANCE: PersonaDef = {
  id: 'insurance',
  cardTitle: 'Insurance',
  cardBlurb: 'P&C + Life underwriting intelligence',
  Icon: Umbrella,
  firmName: 'Ridgeline Mutual',
  wordmark: 'RIDGELINE',
  tagline: 'Underwriting Intelligence',
  loginSubtitle: 'Underwriting Intelligence — on Amazon Bedrock AgentCore',
  heroTitle: 'Ridgeline — P&C + Life Underwriting Intelligence',
  heroBlurb:
    'An autonomous underwriting desk on Amazon Bedrock AgentCore, built on the ' +
    '<strong>Strands Agents SDK</strong>. A Lead Coordinator routes to <strong>nine ' +
    'specialists</strong> — Submission Intake, Risk Research, Catastrophe &amp; Climate, ' +
    'Reinsurance, Pricing &amp; Actuarial, Profitability, Compliance, Fraud and Bind &amp; ' +
    'Policy Admin — who screen submissions, model <strong>catastrophe accumulation</strong>, ' +
    'and price and bind risk against your appetite. An <strong>Underwriting Committee</strong> ' +
    'then reconciles the package into a go / adjust / no-go bind decision. Every tool call ' +
    'runs live on real AWS primitives, governed by Cedar policy and delegated Identity. Try ' +
    '“Full Property Book Review” on the left to run the whole desk in one pass.',
  composerPlaceholder: 'Ask about your book, screen submissions, run the cat model, or bind a risk…',
  livePillLabel: 'AgentCore Underwriting · Live',
  answerLabel: 'Underwriting Verdict',
  agents: {
    orchestrator: { name: 'Lead Coordinator', color: 'var(--agent-orchestrator)', Icon: Workflow },
    intake: { name: 'Submission Intake', color: 'var(--agent-intake)', Icon: Inbox },
    research: { name: 'Risk Research', color: 'var(--agent-research)', Icon: Search },
    pricing: { name: 'Pricing & Actuarial', color: 'var(--agent-pricing)', Icon: Calculator },
    compliance: { name: 'Compliance & Controls', color: 'var(--agent-compliance)', Icon: ShieldCheck },
    binding: { name: 'Bind & Policy Admin', color: 'var(--agent-binding)', Icon: FileSignature },
    catmodel: { name: 'Catastrophe & Climate', color: 'var(--agent-catmodel)', Icon: CloudLightning },
    reinsurance: { name: 'Reinsurance & Ceded', color: 'var(--agent-reinsurance)', Icon: Layers },
    profitability: { name: 'Profitability Analysis', color: 'var(--agent-profitability)', Icon: PieChart },
    fraud: { name: 'Fraud & Claims Integrity', color: 'var(--agent-fraud)', Icon: ShieldAlert },
    committee: { name: 'Underwriting Committee', color: 'var(--agent-committee)', Icon: Scale },
  },
  order: ['orchestrator', 'intake', 'research', 'catmodel', 'reinsurance', 'pricing', 'profitability', 'compliance', 'fraud', 'binding', 'committee'],
  swarmPrompts: [
    { label: 'Build a Core Property Book', hint: 'Pricing & Actuarial · evolve', agent: 'pricing', prompt: 'Build me a profitable commercial-property book: target a 58% loss ratio to beat plan, no more than 25% in any one state, keep the 1-in-250 PML under $60mm, ~300 policies, balance premium against volatility. Run the evolutionary construction and show me the leaderboard and the winning bind list.' },
    { label: 'Reach for Premium', hint: 'Pricing & Actuarial · evolve', agent: 'pricing', prompt: 'Construct a higher-premium growth book: keep the target loss ratio near 60% but tilt hard toward premium (allow coastal wind and higher-hazard occupancies), ~300 policies. Evolve it and compare the winner against plan on premium, combined ratio and 1-in-250 PML.' },
    { label: 'Read the Cat Season', hint: 'Catastrophe & Climate · NOAA + model', agent: 'catmodel', prompt: 'Read the current NOAA hurricane-season outlook and active storm tracks from the web, then run the cat model on my coastal property book. Where does the PML concentrate, is the season running above or below normal, and what does it imply for how I should set coastal line limits right now?' },
    { label: 'Peril & Hazard Lookup', hint: 'Submission Intake · peril grid', agent: 'intake', prompt: 'Pull the perils and hazard grades for a habitational risk in ZIP 33139, Miami-Dade — wind, surge, flood zone and protection class.' },
    { label: 'Exposure & Loss-Cost Feed', hint: 'Submission Intake · Identity M2M', agent: 'intake', prompt: "Pull the firm's licensed exposure & loss-cost feed (real FEMA National Risk Index county hazard and per-peril loss costs) for the states my coastal book concentrates in, and tell me it came in over our application (machine-to-machine) entitlement rather than on my behalf." },
    { label: 'Live Weather & Hazard', hint: 'Catastrophe & Climate · web browser', agent: 'catmodel', prompt: 'Browse the web for the latest NOAA sea-surface-temperature anomaly and the active tropical outlook, and tell me what they imply for how I should position coastal wind capacity this quarter.' },
    { label: 'Screen the Pipeline', hint: 'Submission Intake · 4k subs', agent: 'intake', prompt: 'Screen the submission pipeline for investment-grade commercial property in the Midwest with joisted-masonry construction, protection class 4 or better, TIV between $10mm and $50mm, and the best rate adequacy. Show me the top accounts.' },
    { label: 'Reinsurance Fit Check', hint: 'Reinsurance & Ceded · treaty', agent: 'reinsurance', prompt: 'Check a handful of large accounts — a $120mm TIV coastal condo, a $40mm Midwest warehouse, a $200mm refinery and a $15mm strip mall — against our treaty structure. Which fit net of reinsurance, which need facultative, and where do I breach retention?' },
    { label: 'Cat-Model My Book', hint: 'Catastrophe & Climate · PML', agent: 'catmodel', prompt: 'Run the cat model on my coastal property book for hurricane, severe-convective and flood on a forward-climate basis. Give me AAL, the 1-in-100 and 1-in-250 PML, and where they sit versus my reinsurance attachment.' },
    { label: 'Explain My Result', hint: 'Profitability · vs plan', agent: 'profitability', prompt: 'For a book of five accounts — Cedar Ridge Apartments, Gulf Coast Condos, Prairie Logistics, Harbor Refinery and Summit Retail — decompose the combined-ratio variance versus plan into rate, loss, cat load, expense and mix, and rank the biggest drivers.' },
    { label: 'Fraud & SIU Screen', hint: 'Fraud · red flags', agent: 'fraud', prompt: 'Screen my Florida AOB water-claims cohort for fraud, moral hazard and adverse selection. Score the accounts, flag the worst, list the SIU red flags, and lay out an inspection / referral plan to limit leakage.' },
    { label: 'My Appetite & Books', hint: 'Risk Research · Identity', agent: 'research', prompt: 'Look up my underwriting portfolio manager profile, the books I manage, and my appetite and treaty structure.' },
    { label: 'Moratorium List', hint: 'Compliance · Vault + Cedar', agent: 'compliance', prompt: "What's on the firm's declined-risk and bound-risk moratorium list right now?" },
  ],
  graphPrompts: [
    { label: 'Full Property Book Review', hint: 'Full DAG · fans in to Committee', agent: 'committee', prompt: 'Run a full desk review and give me the Underwriting Committee verdict. (1) Build a commercial-property book to a 58% target loss ratio, ≤25% per state, 1-in-250 PML under $60mm, ~300 policies, balancing premium and volatility. (2) Attribute its result versus plan (rate / loss / cat / expense / mix). (3) Cat-model the book and check the PML against our reinsurance attachment. (4) Fraud-screen the largest accounts and flag any integrity risks. Then have the Underwriting Committee reconcile all of it, call out the conflicts and trade-offs, and issue a go / adjust / no-go BIND decision.' },
    { label: 'Cat View → Build → Sign-off', hint: 'Cat-led · fans in to Committee', agent: 'committee', prompt: 'Start from the catastrophe view and end with a committee sign-off. First read the NOAA season outlook and run the cat model to decide how much coastal wind capacity to deploy. Then build a property book to that cat view (PML cap under $60mm, ~300 policies). Attribute its result versus plan, check reinsurance fit, fraud-screen the top accounts, and have the Underwriting Committee challenge the whole package and give a final BIND verdict with the key risks.' },
    { label: 'Growth Premium Review', hint: 'Premium tilt · full DAG', agent: 'committee', prompt: 'Run a full desk review for a growth mandate. Build a higher-premium book that keeps the target loss ratio near 60% but reaches for premium (allow coastal wind and higher-hazard occupancies), ~300 policies. Attribute its result versus plan, cat-model the added coastal exposure against our reinsurance attachment, and fraud-screen the higher-hazard accounts. Then have the Underwriting Committee weigh the extra premium against the added cat, ceded and volatility risk and issue a go / adjust / no-go BIND verdict.' },
    { label: 'Defensive Low-Cat Review', hint: 'Defensive · full DAG', agent: 'committee', prompt: 'Run a full desk review for a defensive, capital-preservation mandate. Build a low-cat, up-in-quality book (inland only, protection class 4 or better, PML under $30mm, ~300 policies). Attribute its result versus plan, cat-model the residual exposure, and fraud-screen the top accounts. Then have the Underwriting Committee judge whether the low-cat posture costs too much premium and issue a go / adjust / no-go BIND verdict.' },
  ],
  primitives: primitives({
    swarm: { value: 'Autonomous specialist hand-offs across the underwriting desk on the Strands SDK' },
    gateway: { value: 'Bureau & book APIs → governed MCP tools · Cedar blocks the moratorium vault', triggers: ['secure_vault', 'user_data_lookup', 'risk_screen', 'peril_lookup', 'book_risk', 'cat_model_run', 'fraud_signal', 'evolve_book'] },
    identity: { value: '3-legged OAuth · view the book, then bind risk on the underwriter’s behalf', triggers: ['positions_view', 'trade_execute'] },
    memory: { value: 'Long-term recall of the underwriter’s appetite & treaty structure across sessions' },
    code: { value: 'Sandboxed Python for actuarial analytics — combined ratio, loss triangles, leakage' },
    browser: { value: 'Managed headless browser for live account, litigation & storm-track context' },
  }),
  identityBullets: [
    { title: '3-legged OAuth', body: 'the agent views your book and binds risk on your behalf (your books only).' },
    { title: 'Machine-to-machine', body: "the agent acts as the firm's licensed app (exposure & loss-cost feed)." },
    { title: 'API-key vault', body: 'outbound secrets (FRED rate/inflation series) live in Identity, never in the agent.' },
  ],
};

const BANKING: PersonaDef = {
  id: 'banking',
  cardTitle: 'Banking',
  cardBlurb: 'Commercial credit intelligence',
  Icon: Landmark,
  firmName: 'Rampart Financial',
  wordmark: 'RAMPART',
  tagline: 'Credit Intelligence',
  loginSubtitle: 'Credit Intelligence — on Amazon Bedrock AgentCore',
  heroTitle: 'Rampart — Commercial Credit Intelligence',
  heroBlurb:
    'An autonomous credit desk on Amazon Bedrock AgentCore, built on the <strong>Strands ' +
    'Agents SDK</strong>. A Lead Credit Officer routes to <strong>nine specialists</strong> — ' +
    'Borrower Intelligence, Rates &amp; Macro, Credit Analysis, Pricing &amp; Structuring, ' +
    'Portfolio Risk, Covenant &amp; Monitoring, Financial Crime &amp; Controls, Fraud and ' +
    'Relationship &amp; Servicing — who grade the borrower, price and structure the facility, ' +
    'scan the <strong>whole loan book</strong> for concentration and stress, and screen for ' +
    '<strong>sanctions &amp; financial crime</strong>. A <strong>Credit Committee</strong> then ' +
    'signs off with an approve / conditions / decline verdict. Every decision is governed, ' +
    'every action consented, every primitive live on real AWS services. Try “Full Credit ' +
    'Review” on the left to run the whole desk in one pass.',
  composerPlaceholder: 'Grade a borrower, price a facility, scan the book, or approve a limit change…',
  livePillLabel: 'AgentCore Credit Desk · Live',
  answerLabel: 'Credit Verdict',
  agents: {
    orchestrator: { name: 'Lead Credit Officer', color: 'var(--agent-orchestrator)', Icon: Workflow },
    borrower: { name: 'Borrower Intelligence', color: 'var(--agent-borrower)', Icon: Building2 },
    underwriting: { name: 'Credit Analysis', color: 'var(--agent-underwriting)', Icon: ClipboardCheck },
    pricing: { name: 'Pricing & Structuring', color: 'var(--agent-pricing)', Icon: BadgeDollarSign },
    controls: { name: 'Financial Crime & Controls', color: 'var(--agent-controls)', Icon: ShieldCheck },
    relationship: { name: 'Relationship & Servicing', color: 'var(--agent-relationship)', Icon: Handshake },
    macro: { name: 'Rates & Macro', color: 'var(--agent-macro)', Icon: Landmark },
    portfolio: { name: 'Portfolio Risk', color: 'var(--agent-portfolio)', Icon: PieChart },
    monitoring: { name: 'Covenant & Monitoring', color: 'var(--agent-monitoring)', Icon: FileSearch },
    fraud: { name: 'Fraud & Adverse Media', color: 'var(--agent-fraud)', Icon: ShieldAlert },
    committee: { name: 'Credit Committee', color: 'var(--agent-committee)', Icon: Scale },
  },
  order: ['orchestrator', 'borrower', 'macro', 'underwriting', 'pricing', 'portfolio', 'monitoring', 'controls', 'fraud', 'relationship', 'committee'],
  swarmPrompts: [
    { label: 'Grade a New Borrower', hint: 'Credit Analysis · PD + grade', agent: 'underwriting', prompt: 'Underwrite Cedar Ridge Logistics LLC: $18M revenue, $4.1M EBITDA, $14M total debt, 11 years in business, requesting a $5M term facility. Compute the internal PD, credit grade and score band, and give me the key ratios (DSCR, leverage, debt yield) with a pass/decline lean.' },
    { label: 'Price a Facility', hint: 'Pricing · risk-based APR', agent: 'pricing', prompt: 'Price a $5M, 60-month term loan for a grade 6 / BB borrower secured by equipment at 70% LTV, floating over SOFR. Give me the all-in APR, spread over index, fee schedule, expected net interest margin after expected loss, and whether it clears our RAROC hurdle.' },
    { label: 'Read the Rate Regime', hint: 'Rates & Macro · FOMC + curve', agent: 'macro', prompt: 'Read the current Treasury curve, SOFR and prime, and the latest FOMC guidance from the web. Is the curve inverted, where is our cost of funds heading, and what does it imply for our lending appetite and pricing floors right now?' },
    { label: 'Live SOFR & Prime', hint: 'Rates & Macro · FRED api-key', agent: 'macro', prompt: 'Pull the current SOFR, prime rate and fed funds target from FRED, and tell me what they imply for pricing a new floating-rate commercial facility.' },
    { label: 'Reference-Rates & Credit Feed', hint: 'Borrower Intel · Identity M2M', agent: 'borrower', prompt: "Pull the firm's licensed reference-rates & credit-performance feed (real FRED Treasury curve, SOFR/prime, and Fed H.8 business-loan delinquency & charge-off) to frame Cedar Ridge Logistics LLC's sector, and tell me it came in over our firm's application (machine-to-machine) entitlement, not on any consumer's behalf." },
    { label: 'Sanctions / AML Screen', hint: 'Controls · Vault + Cedar', agent: 'controls', prompt: "Screen the borrower and its principals against the sanctions/AML watchlist and internal fraud blocklist. What's flagged right now?" },
    { label: 'Scan My Loan Book', hint: 'Portfolio Risk · concentration', agent: 'portfolio', prompt: 'Scan my Commercial & Industrial book: show me the concentrations by sector, geography and single name against our limits, the weighted PD/LGD, expected loss, NPL ratio and CECL coverage. Flag anything tight.' },
    { label: 'Stress the Book', hint: 'Portfolio Risk · scenarios', agent: 'portfolio', prompt: 'Run a severely-adverse stress scenario over my Commercial & Industrial book. Show me the stressed expected loss, the CET1 trough, whether we stay above the minimum, and which segments drive the losses.' },
    { label: 'Check Covenants', hint: 'Covenant · breach + headroom', agent: 'monitoring', prompt: 'For Cedar Ridge Logistics (facility CI-2029-0417): DSCR 1.18, leverage 3.4x, LTV 71%, liquidity $1.25M. Test it against its covenant package, flag any breaches or tight headroom, and recommend the action.' },
    { label: 'Adverse-Media Check', hint: 'Fraud · web + exclusions', agent: 'fraud', prompt: 'Run an adverse-media and reputational check on Cedar Ridge Logistics LLC and its principals — enforcement actions, litigation, bankruptcies, related-party red flags — and give me a fraud/reputational risk rating with the evidence.' },
    { label: 'View a Customer', hint: 'Relationship · Identity 3LO', agent: 'relationship', prompt: "View Cedar Ridge Logistics' accounts and outstanding loan book — current facilities, balances, utilization and deposits." },
    { label: 'Approve a Limit Change', hint: 'Relationship · 3LO write', agent: 'relationship', prompt: "Increase Cedar Ridge Logistics' revolving line from $2M to $3M and confirm it went through the separate write consent, not the read one." },
    { label: 'My Books & Policy', hint: 'Borrower Intel · Identity', agent: 'borrower', prompt: 'Look up my credit-officer profile, the lending books I own, and my credit-policy preferences and risk appetite.' },
  ],
  graphPrompts: [
    { label: 'Full Credit Review', hint: 'Full DAG · fans in to Committee', agent: 'committee', prompt: 'Run a full credit review and give me the Credit Committee verdict on a $5M term-loan request from Cedar Ridge Logistics LLC ($18M revenue, $4.1M EBITDA, $14M debt, equipment-secured at 70% LTV). (1) Build the borrower brief from filings, news and the licensed reference-rates & credit-performance feed. (2) Frame the rate/cost-of-funds backdrop. (3) Underwrite it — PD, grade, DSCR/LTV. (4) Price and structure the facility. (5) Sanctions/AML screen the principals, (6) test its marginal effect on portfolio concentrations, (7) set the covenant package, and (8) run an adverse-media check. Then have the Credit Committee reconcile it all, call out the conflicts and trade-offs, and issue APPROVE / APPROVE-WITH-CONDITIONS / DECLINE.' },
    { label: 'Regime → Underwrite → Sign-off', hint: 'Macro-led · fans in to Committee', agent: 'committee', prompt: 'Start from the rate regime and end with a committee decision on a $5M commercial facility for Cedar Ridge Logistics. First read the curve, SOFR and FOMC guidance and set our appetite and pricing floor. Then underwrite the borrower to a grade, price the facility to that floor, sanctions-screen the principals, test the portfolio impact, set covenants and check adverse media. Have the Credit Committee challenge the whole package and issue a final verdict with the key risks and conditions.' },
    { label: 'CRE Deal Review', hint: 'Concentration risk · full DAG', agent: 'committee', prompt: 'Run a full credit review for a $12M commercial-real-estate office loan (65% LTV, 10-year, single-tenant). Build the borrower brief, frame the rate backdrop, underwrite it, price and structure it, sanctions-screen the sponsor, and — critically — test what it does to our CRE-Office concentration limit and stress it in a CRE-downturn scenario. Set covenants and check adverse media. Then have the Credit Committee weigh the deal economics against the concentration and stressed-loss risk and issue a go / conditions / no-go verdict.' },
    { label: 'Workout / Restructure Review', hint: 'Covenant breach · full DAG', agent: 'committee', prompt: 'Run a full desk review for a covenant-breaching borrower we may need to restructure: Cedar Ridge Logistics has breached its DSCR covenant (1.18 vs 1.25 floor). Re-underwrite and re-grade it on current financials, re-price a restructured facility, re-screen for sanctions and adverse media, test the impact on portfolio expected loss, and re-examine the covenant package with cure options. Then have the Credit Committee decide: waive, amend-and-extend with step-up pricing, or downgrade to workout — with the reasoning and conditions.' },
  ],
  primitives: primitives({
    swarm: { value: 'Autonomous credit-desk hand-offs on the Strands SDK' },
    gateway: { value: 'APIs → governed MCP tools · sanctions/AML access policy-enforced', triggers: ['secure_vault', 'user_data_lookup', 'credit_score', 'loan_price', 'portfolio_risk_scan', 'covenant_check', 'stress_test'] },
    identity: { value: '3-legged OAuth · view accounts vs. approve limits/disbursements', triggers: ['positions_view', 'trade_execute'] },
    memory: { value: 'Long-term recall of the officer’s books & credit policy across sessions' },
    code: { value: 'Sandboxed Python for credit analytics (DSCR, LTV, expected loss)' },
    browser: { value: 'Managed headless browser for live borrower & adverse-media context' },
  }),
  identityBullets: [
    { title: '3-legged OAuth', body: 'the agent views accounts, then approves limits/disbursements on your behalf.' },
    { title: 'Machine-to-machine', body: "the agent acts as the firm's licensed app (reference-rates & credit-performance feed)." },
    { title: 'API-key vault', body: 'outbound secrets (FRED rates) live in Identity, never in the agent.' },
  ],
};

const FINTECH: PersonaDef = {
  id: 'fintech',
  cardTitle: 'FinTech',
  cardBlurb: 'Payments & risk intelligence',
  Icon: Radar,
  firmName: 'Kairo',
  wordmark: 'KAIRO',
  tagline: 'Payments & Risk Intelligence',
  loginSubtitle: 'Payments & Risk Intelligence — on Amazon Bedrock AgentCore',
  heroTitle: 'Kairo — Payments & Risk Intelligence',
  heroBlurb:
    'A live multi-agent risk &amp; growth desk for an embedded-finance platform on Amazon ' +
    'Bedrock AgentCore, built on the <strong>Strands Agents SDK</strong>. An Ops Coordinator ' +
    'routes to <strong>nine specialists</strong> — Portfolio &amp; Data, Risk Intelligence, ' +
    'Network &amp; Macro, Fraud &amp; Trust, Risk &amp; Modeling, Growth &amp; Unit Economics, ' +
    'Compliance, Settlement &amp; Liquidity and Account Actions — who screen the merchant book, ' +
    '<strong>optimize authorization strategy</strong>, scan for <strong>fraud rings</strong>, ' +
    'and model settlement and unit economics. A <strong>Risk &amp; Growth Council</strong> then ' +
    'reconciles it into a ship / adjust / hold verdict. Every step runs on real AWS primitives, ' +
    'governed by Cedar and delegated Identity. Try “Full Strategy Review” on the left to run the ' +
    'whole desk in one pass.',
  composerPlaceholder: 'Ask the desk — optimize a strategy, fraud-scan an account, review exposure…',
  livePillLabel: 'AgentCore Swarm · Live',
  answerLabel: 'Council Verdict',
  agents: {
    orchestrator: { name: 'Ops Coordinator', color: 'var(--agent-orchestrator)', Icon: Workflow },
    universe: { name: 'Portfolio & Data', color: 'var(--agent-universe)', Icon: Layers },
    research: { name: 'Risk Intelligence', color: 'var(--agent-research)', Icon: Radar },
    analytics: { name: 'Risk & Modeling', color: 'var(--agent-analytics)', Icon: Cpu },
    compliance: { name: 'Compliance & Controls', color: 'var(--agent-compliance)', Icon: ShieldCheck },
    trading: { name: 'Account Actions & Execution', color: 'var(--agent-trading)', Icon: Wallet },
    macro: { name: 'Network & Macro', color: 'var(--agent-macro)', Icon: Globe2 },
    esg: { name: 'Fraud & Trust', color: 'var(--agent-esg)', Icon: Fingerprint },
    attribution: { name: 'Growth & Unit Economics', color: 'var(--agent-attribution)', Icon: TrendingUp },
    liquidity: { name: 'Settlement & Liquidity', color: 'var(--agent-liquidity)', Icon: Banknote },
    committee: { name: 'Risk & Growth Council', color: 'var(--agent-committee)', Icon: Scale },
  },
  order: ['orchestrator', 'universe', 'research', 'macro', 'esg', 'analytics', 'attribution', 'compliance', 'liquidity', 'trading', 'committee'],
  swarmPrompts: [
    { label: 'Optimize My Decline Strategy', hint: 'Risk & Modeling · optimize', agent: 'analytics', prompt: 'Optimize the authorization strategy for my consumer card book: hold approval rate above 94%, keep fraud loss under 25bps and chargebacks under 12bps of volume, maximize net interchange revenue, no more than 20% exposure in any one MCC. Run the evolutionary optimization and show me the leaderboard and the winning policy.' },
    { label: 'Grow Approvals, Hold Losses', hint: 'Risk & Modeling · optimize', agent: 'analytics', prompt: 'Build a growth-tilted strategy: push approval rate as high as possible while keeping fraud loss under 30bps and chargebacks under 14bps. Evolve it and compare the winner against my current policy on approval rate, loss and net revenue.' },
    { label: 'Read the Network Regime', hint: 'Network & Macro · credit-cycle + FX', agent: 'macro', prompt: 'Read the current book approval / volume stats and the real card-delinquency & charge-off cycle from our licensed consumer-credit & network feed, and pull live FX on our top corridors. Are approvals and the loss cycle richer or thinner than baseline, where is FX exposure building, and what does it imply for how I should price and route right now?' },
    { label: 'Consumer-Credit & Network Feed', hint: 'Portfolio & Data · Identity M2M', agent: 'universe', prompt: "Pull the firm's licensed consumer-credit & network feed for the current card delinquency / charge-off cycle and our book's approval and volume stats, and tell me it came in over our application (machine-to-machine) entitlement rather than on my behalf." },
    { label: 'Live FX Rates', hint: 'Network & Macro · API-key', agent: 'macro', prompt: 'Pull live FX rates for EUR/USD, GBP/USD and USD/JPY from FRED via the API-key vault, and tell me what they imply for our multi-currency wallet exposure.' },
    { label: 'Screen the Merchant Book', hint: 'Portfolio & Data · MCC/risk', agent: 'universe', prompt: 'Screen the merchant book for high-risk MCCs with chargeback rates above 1% and monthly volume over $1M. Show me the top offenders by risk score.' },
    { label: 'Fraud-Scan a Customer', hint: 'Fraud & Trust · linked accounts', agent: 'esg', prompt: 'Fraud-scan customer C-882301 over the last 7 days. Give me the risk score, the signals driving it, and any linked accounts that share a device, funding account or IP. Should we block?' },
    { label: 'Book Exposure & Reserves', hint: 'Risk & Modeling · stress', agent: 'analytics', prompt: 'Aggregate the fraud, chargeback and credit exposure on my consumer card book, break it down by MCC and geo, and stress it under a delinquency shock. Are we within a 45bps loss ceiling and are we adequately reserved?' },
    { label: 'Cohort LTV & Payback', hint: 'Growth · unit economics', agent: 'attribution', prompt: 'For the Consumer Wallet book, pull the 2026-Q1 signup cohort: retention curve, LTV, CAC payback, contribution margin and revenue mix. Decompose contribution into revenue drivers minus fraud and chargeback costs and rank the biggest movers versus plan.' },
    { label: 'Settlement Float & Concentration', hint: 'Settlement · reserve model', agent: 'liquidity', prompt: 'Project the settlement float and reserve requirement for my book, flag any counterparty or rail concentration, and stress next-day payout timing under a 2x volume day. Are we under-reserved anywhere?' },
    { label: 'Freeze a Fraudulent Account', hint: 'Account Actions · 3LO write', agent: 'trading', prompt: 'View customer C-882301’s recent transactions and wallet balance, then freeze the account and block the card pending review.' },
    { label: 'View a Customer & Issue Refund', hint: 'Account Actions · 3LO', agent: 'trading', prompt: 'Pull up customer C-771204’s last 30 days of transactions and card limits, then issue a $128.40 refund on the disputed charge.' },
    { label: 'My Books & Mandate', hint: 'Risk Intelligence · Identity', agent: 'research', prompt: 'Look up my risk & growth lead profile, the product books I own, and my loss and growth targets.' },
    { label: 'Fraud-Ring Blocklist', hint: 'Compliance · Vault + Cedar', agent: 'compliance', prompt: "What's on the firm's confirmed fraud-ring blocklist and restricted-MCC list right now?" },
  ],
  graphPrompts: [
    { label: 'Full Strategy Review', hint: 'Full DAG · Council sign-off', agent: 'committee', prompt: 'Run a full desk review and give me the Risk & Growth Council verdict. (1) Optimize an authorization / limit strategy for my consumer card book: hold approval above 94%, fraud loss under 25bps, chargebacks under 12bps, ≤20% per MCC, maximize net revenue. (2) Report its fraud/chargeback/credit exposure and concentration versus a 45bps ceiling. (3) Fraud-screen the largest cohorts and flag any ring linkage. (4) Project settlement float and reserve adequacy with a stress case. Then have the Council reconcile all of it, call out the conflicts and trade-offs, and issue a SHIP / ADJUST / HOLD decision.' },
    { label: 'Regime → Strategy → Sign-off', hint: 'Network-led · Council', agent: 'committee', prompt: 'Start from the network view and end with a Council sign-off. First read the book approval / volume stats, the real card delinquency / charge-off cycle and live FX and decide how to price and route. Then optimize a strategy to that view (approval floor 94%, fraud-loss ceiling 25bps). Report its exposure and concentration, fraud-screen the top cohorts, project settlement and reserves, and have the Risk & Growth Council challenge the whole package and give a final verdict with the key risks.' },
    { label: 'Growth-Push Review', hint: 'Growth tilt · full DAG', agent: 'committee', prompt: 'Run a full desk review for a growth-push mandate. Optimize a strategy that lifts approval rate hard while keeping fraud loss under 30bps and chargebacks under 14bps. Report its exposure and concentration versus the ceiling, fraud-screen the newly-approved cohorts for ring risk, and project the settlement and reserve impact of the higher volume. Then have the Risk & Growth Council weigh the extra revenue against the added fraud, chargeback and settlement risk and issue a SHIP / ADJUST / HOLD verdict.' },
    { label: 'De-Risk / Loss-Control Review', hint: 'Defensive · full DAG', agent: 'committee', prompt: 'Run a full desk review for a loss-control mandate. Optimize a tightened, up-in-quality strategy (lower limits, stricter decline and step-up thresholds, fraud loss under 18bps). Report its exposure and concentration, fraud-screen the retained book, and project settlement and reserve headroom. Then have the Risk & Growth Council judge whether the tightening costs too much approved volume and revenue and issue a SHIP / ADJUST / HOLD verdict.' },
  ],
  primitives: primitives({
    swarm: { value: 'Autonomous risk/growth specialist hand-offs on the Strands SDK' },
    gateway: { value: 'APIs → governed MCP tools · policy-blockable fraud-ring blocklist & restricted MCCs', triggers: ['secure_vault', 'user_data_lookup', 'merchant_screen', 'exposure_report', 'strategy_optimize', 'fraud_scan', 'cohort_ltv'] },
    identity: { value: '3-legged OAuth · agent freezes / refunds / raises limits on the lead’s behalf', triggers: ['positions_view', 'trade_execute'] },
    memory: { value: 'Long-term recall of the desk’s loss ceilings & growth mandate across sessions' },
    code: { value: 'Sandboxed Python for approval-vs-loss, LTV/CAC and reserve modeling' },
    browser: { value: 'Managed headless browser for live breach / scheme / fraud-pattern intel' },
  }),
  identityBullets: [
    { title: '3-legged OAuth', body: 'the agent views a customer, then freezes / refunds / raises limits on your behalf.' },
    { title: 'Machine-to-machine', body: "the agent acts as the firm's licensed app (consumer-credit & network feed)." },
    { title: 'API-key vault', body: 'outbound secrets (FRED FX rates) live in Identity, never in the agent.' },
  ],
};

// Registry. capital_markets is always present and is the default; the three verticals layer on.
export const PERSONAS: Record<string, PersonaDef> = {
  capital_markets: CAPITAL_MARKETS,
  insurance: INSURANCE,
  banking: BANKING,
  fintech: FINTECH,
};

export const DEFAULT_PERSONA: PersonaId = 'capital_markets';

// Display order for the login picker (capital_markets first).
export const PERSONA_ORDER: PersonaId[] = ['capital_markets', 'insurance', 'banking', 'fintech'];

export function getPersona(id: string | null | undefined): PersonaDef {
  return (id && PERSONAS[id]) || PERSONAS[DEFAULT_PERSONA];
}

export function personaList(): PersonaDef[] {
  return PERSONA_ORDER.filter((id) => PERSONAS[id]).map((id) => PERSONAS[id]);
}

// The <html> class that selects a persona's accent palette in styles.css. capital_markets
// uses the base :root tokens, so it gets NO persona class (identical to the original).
export function personaClass(id: string): string | null {
  return id && id !== DEFAULT_PERSONA ? `persona-${id}` : null;
}
