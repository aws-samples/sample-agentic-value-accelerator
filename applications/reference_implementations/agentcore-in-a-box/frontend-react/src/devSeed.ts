// devSeed.ts — DEV-ONLY. Fabricates a signed-in session with realistic swarm / graph /
// tool-call timeline data so the whole authed shell renders locally without a backend.
// Never imported by the production entry (main.tsx); only by dev.tsx (served at /dev.html,
// which Vite does NOT emit into the production build unless explicitly listed as an input).
//
// It writes exactly what the real app writes: a fake-but-well-formed JWT into the same
// localStorage keys auth.ts reads, plus a `meridian-sessions` record the App restores on
// mount. The seeded turns carry the same smuggled `__agent_active` / `__handoff` / `__graph`
// / `__tool` markers the live AG-UI stream produces, so SwarmFlow, GraphFlow, StackRail,
// the tool cards, and the observability hand-off/tool counters all light up for real.

type AppCfg = Record<string, string>;

/** Base64url-encode a UTF-8 string (browser btoa + url-safe swap). */
function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A structurally valid (unsigned — the dev app never verifies) JWT with a far-future exp.
 * `groups` seeds cognito:groups so /dev.html?admin=1 can preview the ADMIN shell locally
 * (isAdmin falls back to the token's groups when /me is unreachable — see useEntitlements). */
function fakeJwt(email: string, groups?: string[]): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      email,
      'cognito:username': email.split('@')[0],  // nosemgrep  (no-stringify-keys: dev-only mock JWT; key order irrelevant)
      ...(groups && groups.length ? { 'cognito:groups': groups } : {}),
      exp: 4102444800, // 2100-01-01
      iat: 1700000000,
    }),
  );
  return `${header}.${payload}.dev`;
}

export const DEV_CONFIG: AppCfg = {
  REGION: 'us-west-2',
  USER_POOL_ID: 'dev',
  USER_POOL_CLIENT_ID: 'dev',
  API_URL: 'https://dev.invalid', // fetches fail fast + degrade gracefully
  WS_URL: 'wss://dev.invalid',
  AGUI_URL: 'https://dev.invalid',
  IDENTITY_POOL_ID: 'dev',
  COGNITO_DOMAIN: 'https://dev.invalid',
  REDIRECT_URI: 'http://localhost:5173/dev.html',
};

let uid = 0;
const id = () => `dev-${(uid++).toString(16).padStart(6, '0')}`;

/** One timeline item, JSON-stringifying args like the real stream does. */
function item(tool: string, args: object, result?: object | string) {
  return {
    id: id(),
    tool,
    args: JSON.stringify(args),
    result: result === undefined ? undefined : typeof result === 'string' ? result : JSON.stringify(result),
    status: 'done' as const,
    startedAt: 1,
    endedAt: 2,
  };
}

// ── Realistic tool-result payloads (shapes match toolViews.tsx / fiViews.tsx) ────
const EVOLVE_RESULT = {
  winner: {
    metrics: {
      yield: 5.42, yield_pickup_vs_agg: 0.63, duration: 6.1, duration_gap: 0.1,
      tracking_error: 0.42, stress_200bps: -11.8,
      rating_mix: { AAA: 12, AA: 22, A: 34, BBB: 32 },
      sector_mix: { Financials: 28, Industrials: 24, Utilities: 16, Energy: 12, Technology: 20 },
    },
    holdings: [
      { issuer: 'JPMorgan Chase', ticker: 'JPM', rating: 'A', sector: 'Financials', ytm: 5.31, mod_duration: 6.2, weight: 0.061 },
      { issuer: 'Bank of America', ticker: 'BAC', rating: 'A', sector: 'Financials', ytm: 5.44, mod_duration: 6.0, weight: 0.055 },
      { issuer: 'Apple Inc.', ticker: 'AAPL', rating: 'AAA', sector: 'Technology', ytm: 4.78, mod_duration: 6.4, weight: 0.052 },
      { issuer: 'Microsoft Corp.', ticker: 'MSFT', rating: 'AAA', sector: 'Technology', ytm: 4.71, mod_duration: 6.6, weight: 0.049 },
      { issuer: 'NextEra Energy', ticker: 'NEE', rating: 'BBB', sector: 'Utilities', ytm: 5.68, mod_duration: 5.9, weight: 0.047 },
      { issuer: 'ExxonMobil', ticker: 'XOM', rating: 'AA', sector: 'Energy', ytm: 5.22, mod_duration: 6.1, weight: 0.044 },
      { issuer: 'Verizon', ticker: 'VZ', rating: 'BBB', sector: 'Industrials', ytm: 5.79, mod_duration: 6.3, weight: 0.041 },
      { issuer: 'UnitedHealth', ticker: 'UNH', rating: 'A', sector: 'Industrials', ytm: 5.12, mod_duration: 6.0, weight: 0.039 },
    ],
  },
  generations: Array.from({ length: 12 }, (_, i) => ({
    generation: i + 1,
    best_fitness: 0.41 + (0.81 - 0.41) * (1 - Math.exp(-i / 3)),
    avg_fitness: 0.22 + (0.63 - 0.22) * (1 - Math.exp(-i / 3.4)),
  })),
  leaderboard: [
    { rank: 1, fitness: 0.812, yield: 5.42, duration: 6.1, tracking_error: 0.42, stress_200bps: -11.8, n_bonds: 31, diversification: 0.87 },
    { rank: 2, fitness: 0.804, yield: 5.39, duration: 6.0, tracking_error: 0.45, stress_200bps: -11.6, n_bonds: 30, diversification: 0.85 },
    { rank: 3, fitness: 0.796, yield: 5.51, duration: 6.3, tracking_error: 0.52, stress_200bps: -12.4, n_bonds: 33, diversification: 0.83 },
    { rank: 4, fitness: 0.781, yield: 5.28, duration: 5.9, tracking_error: 0.39, stress_200bps: -11.1, n_bonds: 29, diversification: 0.88 },
    { rank: 5, fitness: 0.774, yield: 5.60, duration: 6.5, tracking_error: 0.61, stress_200bps: -12.9, n_bonds: 34, diversification: 0.80 },
  ],
  evaluated_total: 4200,
  eligible_pool: 2841,
  source: 'Evolutionary construction over the live investment-grade universe',
};

const CURVE_RESULT = {
  source: 'FRED · US Treasury',
  as_of: '2026-07-07',
  curve: [
    { months: 1, yield: 4.92 }, { months: 3, yield: 4.81 }, { months: 6, yield: 4.63 },
    { months: 12, yield: 4.38 }, { months: 24, yield: 4.11 }, { months: 36, yield: 4.02 },
    { months: 60, yield: 4.06 }, { months: 84, yield: 4.18 }, { months: 120, yield: 4.34 },
    { months: 240, yield: 4.71 }, { months: 360, yield: 4.79 },
  ],
};

const RISK_RESULT = {
  weighted_ytm: 5.42, yield_pickup_vs_agg: 0.63, weighted_duration: 6.1, duration_gap_vs_agg: 0.1,
  weighted_convexity: 58.4, weighted_oas: 0.94,
  rate_shocks_pct: { 'parallel_-200bps': 12.9, 'parallel_-100bps': 6.2, 'parallel_+100bps': -5.9, 'parallel_+200bps': -11.8 },
  rating_mix_pct: { AAA: 12, AA: 22, A: 34, BBB: 32 },
  sector_mix_pct: { Financials: 28, Industrials: 24, Utilities: 16, Energy: 12, Technology: 20 },
};

const ANSWER = `## Investment Committee — verdict: **GO (with conditions)**

The evolutionary construction converged on a **31-bond** portfolio that clears the mandate: **6.1y** duration (target 6y), a **BBB** rating floor, and no sector above **28%**. It picks up **+0.63%** of yield over the US Agg while holding tracking error to **0.42**.

### Where the yield comes from
| Driver | Contribution | Note |
|---|---|---|
| Credit selection | **+0.41%** | overweight A/BBB financials |
| Curve position | +0.14% | slight belly overweight |
| Carry | +0.08% | roll-down on the 5–7y sector |

**Risk check.** A +200bps parallel shock costs **−11.8%** — in line with the benchmark for this duration. The committee flags the **32% BBB** bucket as the single largest risk and recommends a **≤30%** cap on the next rebalance.

*Reconciled across Risk & Quant, Macro & Rates, ESG, and Compliance. No exclusion-list breaches.*`;

// ── Session builders ─────────────────────────────────────────────────────────
// A compact swarm turn (roster + a curve tool + short answer) that fits the viewport, so
// the SwarmFlow rail and thread spine are visible without scrolling past them. ?mode=flow
function flowTurns() {
  const user = {
    id: id(), role: 'user' as const,
    text: 'Read the current US Treasury par-yield curve and tell me how to position duration.',
    timeline: [],
  };
  const asst = {
    id: id(), role: 'assistant' as const,
    text: 'The curve is **mildly inverted** at the front end (1M **4.92%** → 2Y **4.11%**) and upward-sloping past 3Y. That argues for holding duration **near your 6y target** rather than extending — you are paid little to reach for the long end. I would keep the belly overweight and let roll-down do the work.',
    startedAt: 0, endedAt: 18400,
    timeline: [
      item('agent', { __agent_active: { agent: 'orchestrator' } }),
      item('handoff', { __handoff: { to: 'macro', reason: 'Read the live Treasury curve and translate the shape into a duration stance.' } }),
      item('Treasury Curve', { __tool: 'curve_lookup' }, CURVE_RESULT),
      item('agent', { __agent_active: { agent: 'macro' } }),
    ],
  };
  return [user, asst];
}

function swarmTurns() {
  const user = {
    id: id(), role: 'user' as const,
    text: 'Build me an investment-grade core bond portfolio: ~6-year duration, BBB floor, ≤30% per sector, ~30 holdings. Run the evolutionary construction and give me the committee verdict.',
    timeline: [],
  };
  const asst = {
    id: id(), role: 'assistant' as const, text: ANSWER, startedAt: 0, endedAt: 74210,
    timeline: [
      item('agent', { __agent_active: { agent: 'orchestrator' } }),
      item('handoff', { __handoff: { to: 'universe', reason: 'Pull the eligible IG universe and the live Treasury curve before construction.' } }),
      item('Treasury Curve', { __tool: 'curve_lookup' }, CURVE_RESULT),
      item('handoff', { __handoff: { to: 'macro', reason: 'Read the rate regime — the curve is mildly inverted at the front end; position duration near target rather than long.' } }),
      item('handoff', { __handoff: { to: 'analytics', reason: 'Run the evolutionary construction against the mandate: 6y duration, BBB floor, ≤30% per sector, ~30 names, maximize yield-per-unit-risk.' } }),
      item('Evolve Portfolio', { __tool: 'evolve_portfolio' }, EVOLVE_RESULT),
      item('Portfolio Risk', { __tool: 'portfolio_risk' }, RISK_RESULT),
      item('handoff', { __handoff: { to: 'committee', reason: 'Reconcile the construction, attribution, and risk into a single go / adjust / no-go verdict.' } }),
      item('agent', { __agent_active: { agent: 'committee' } }),
    ],
  };
  return [user, asst];
}

const GRAPH_TOPOLOGY = {
  entry: 'orchestrator',
  nodes: {
    orchestrator: 'Lead Coordinator', universe: 'Universe & Data', macro: 'Macro & Rates',
    research: 'Credit Research', esg: 'ESG & Sustainability', analytics: 'Risk & Quant',
    attribution: 'Performance Attribution', compliance: 'Compliance & Controls',
    liquidity: 'Liquidity & Microstructure', trading: 'Portfolio & Execution', committee: 'Investment Committee',
  },
  edges: [
    ['orchestrator', 'universe'], ['orchestrator', 'macro'],
    ['universe', 'research'], ['universe', 'esg'], ['universe', 'analytics'],
    ['research', 'attribution'], ['analytics', 'attribution'], ['analytics', 'compliance'], ['analytics', 'liquidity'],
    ['attribution', 'trading'], ['compliance', 'trading'], ['liquidity', 'trading'],
    ['trading', 'committee'],
  ],
  layers: [
    ['orchestrator'], ['universe', 'macro'], ['research', 'esg', 'analytics'],
    ['attribution', 'compliance', 'liquidity'], ['trading'], ['committee'],
  ],
};

function graphTurns() {
  const user = {
    id: id(), role: 'user' as const,
    text: 'Run a full desk review and give me the Investment Committee verdict — build, attribute, ESG-screen, assess liquidity, then sign off.',
    timeline: [],
  };
  const reached = ['orchestrator', 'universe', 'macro', 'research', 'esg', 'analytics', 'attribution', 'compliance', 'liquidity', 'trading', 'committee'];
  const asst = {
    id: id(), role: 'assistant' as const, text: ANSWER, startedAt: 0, endedAt: 129400,
    timeline: [
      item('graph', { __graph: GRAPH_TOPOLOGY }),
      ...reached.map((a) => item('agent', { __agent_active: { agent: a } })),
      item('Treasury Curve', { __tool: 'curve_lookup' }, CURVE_RESULT),
      item('Evolve Portfolio', { __tool: 'evolve_portfolio' }, EVOLVE_RESULT),
      item('Portfolio Risk', { __tool: 'portfolio_risk' }, RISK_RESULT),
    ],
  };
  return [user, asst];
}

/** Seed localStorage + window.APP_CONFIG for a dev render.
 * Query params: ?persona / ?mode(swarm|graph|flow) / ?theme(light|dark) / ?empty=1 / ?login=1 /
 *   ?admin=1 (preview the admin control-panel shell — Overview + all operator sections). */
/** DEV-ONLY: intercept the admin-only Gateway console routes so the "Gateway" section renders
 * realistic live-shaped data locally (API_URL points at dev.invalid, so real fetches fail). The
 * shapes mirror lambda/admin-api/gateway_console.py exactly; the burst + guardrail responses are
 * derived from the request so the interactive controls behave (throttle engages at the cap+1th
 * call; a secret blocks, an email masks). Only installed for the admin preview. */
function installGatewayFetchShim() {
  const TARGETS = [
    { key: 'bond_screen', label: 'bond_screen', group: 'bond-tools', pillar: 'Lambda target', gateway_action: 'bond-tools___bond_screen', sensitive: false },
    { key: 'price_bond', label: 'price_bond', group: 'bond-tools', pillar: 'Lambda target', gateway_action: 'bond-tools___price_bond', sensitive: false },
    { key: 'curve_lookup', label: 'curve_lookup', group: 'bond-tools', pillar: 'Lambda target', gateway_action: 'bond-tools___curve_lookup', sensitive: false },
    { key: 'spread_lookup', label: 'spread_lookup', group: 'bond-tools', pillar: 'Lambda target', gateway_action: 'bond-tools___spread_lookup', sensitive: false },
    { key: 'trade_execute', label: 'trade_execute', group: 'bond-tools', pillar: 'Lambda target', gateway_action: 'bond-tools___trade_execute', sensitive: true },
    { key: 'secure_vault', label: 'secure_vault', group: 'vault', pillar: 'Lambda target', gateway_action: 'vault___secure_vault', sensitive: true },
    { key: 'market_quote', label: 'market_quote', group: 'market-data', pillar: 'EKS OpenAPI', gateway_action: 'market-data___market_quote', sensitive: false },
    { key: 'query_holdings', label: 'query_holdings', group: 'positions-db', pillar: 'Governed database', gateway_action: 'positions-db___query_holdings', sensitive: true },
  ];
  const PER_TOOL: Record<string, { count: number; window_seconds: number }> = {
    trade_execute: { count: 5, window_seconds: 60 },
    secure_vault: { count: 10, window_seconds: 60 },
    query_holdings: { count: 20, window_seconds: 60 },
  };
  const CONSOLE = {
    mcp_url: 'https://agentcore-demo-gateway-agentcoreinabox-ztizzy9stk.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp',
    gateway_id: 'agentcore-demo-gateway-agentcoreinabox-ztizzy9stk',
    region: 'us-west-2',
    targets: TARGETS,
    target_count: TARGETS.length,
    rate_limits: {
      window_seconds: 60,
      per_user: { count: 60, window_seconds: 60 },
      per_app: { count: 120, window_seconds: 60 },
      per_tool_default: { count: 30, window_seconds: 60 },
      per_tool: PER_TOOL,
    },
    guardrail: { enabled: true, id: 'gr-devlocal', version: '1', blocks: ['AWS secret key', 'US SSN', 'credit card'], masks: ['EMAIL', 'PHONE', 'NAME'] },
    generated_at: 1751846400,
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

    if (url.includes('/admin/gateway/console')) return json(CONSOLE);

    if (url.includes('/admin/ratelimits/test')) {
      const b = init?.body ? JSON.parse(String(init.body)) : {};
      const tool: string = b.tool || 'trade_execute';
      const count: number = Math.max(1, Math.min(40, b.count || 8));
      const cap = (PER_TOOL[tool]?.count) ?? CONSOLE.rate_limits.per_tool_default.count;
      let firstDenied: number | null = null;
      const calls = Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const allowed = n <= cap;
        if (!allowed && firstDenied == null) firstDenied = n;
        return { n, allowed, dimension: allowed ? null : 'per_tool', limit: allowed ? null : cap };
      });
      return json({
        tool, tool_label: TARGETS.find((t) => t.key === tool)?.label || tool, count,
        window_seconds: 60, dimensions: { per_tool: { count: cap, window_seconds: 60 } },
        first_denied_at: firstDenied, calls,
      });
    }

    if (url.includes('/admin/guardrail/scan')) {
      const b = init?.body ? JSON.parse(String(init.body)) : {};
      const text: string = b.text || '';
      const hasSecret = /AKIA[0-9A-Z]{12,}|wJalr|BEGIN [A-Z ]*PRIVATE KEY/.test(text);
      const hasSsn = /\b\d{3}-\d{2}-\d{4}\b/.test(text);
      const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      const blocked = hasSecret || hasSsn;
      const masked = !blocked && !!email;
      const reasons = [
        ...(hasSecret ? ['sensitiveInformation:AWS_SECRET_KEY:blocked'] : []),
        ...(hasSsn ? ['pii:US_SOCIAL_SECURITY_NUMBER:blocked'] : []),
        ...(masked ? ['pii:EMAIL:masked'] : []),
      ];
      return json({
        enabled: true, enforced: true, passed: !blocked, blocked, masked,
        action: blocked ? 'GUARDRAIL_INTERVENED' : masked ? 'ANONYMIZED' : 'NONE',
        text: masked && email ? text.replace(email[0], '{EMAIL}') : text,
        reasons, message: blocked ? 'Blocked by content policy.' : '',
        guardrail_id: 'gr-devlocal', guardrail_version: '1',
      });
    }

    if (url.includes('/admin/gateway/mcp')) {
      return json({ jsonrpc: '2.0', id: 1, result: { tools: TARGETS.map((t) => ({ name: `${t.group}___${t.key}` })) } });
    }

    return realFetch(input as any, init);
  }) as typeof window.fetch;
}

export function seedDev() {
  const q = new URLSearchParams(location.search);
  const persona = q.get('persona') || 'capital_markets';
  const mode = q.get('mode') || 'swarm';
  const theme = q.get('theme') || 'light'; // paper is the default look; ?theme=dark for the companion
  const empty = q.get('empty') === '1';

  const login = q.get('login') === '1'; // preview the signed-OUT login in a chosen theme
  const admin = q.get('admin') === '1'; // preview the ADMIN control-panel shell (Overview + all sections)

  (window as any).APP_CONFIG = DEV_CONFIG;

  // Admin preview signs in as the demo admin (in the `admins` group); otherwise a desk user.
  const devEmail = admin ? 'admin@demo.com' : 'jordan.chen@meridian.com';
  const devGroups = admin ? ['admins'] : undefined;

  // Admin-only surfaces that hit live backends (the Gateway console) get a dev fetch shim so
  // they render realistic data locally instead of the offline error state.
  if (admin) installGatewayFetchShim();

  if (login) {
    // Show PersonaLogin: clear auth but keep the theme/persona selection.
    localStorage.removeItem('idToken');
    localStorage.removeItem('accessToken');
  } else {
    localStorage.setItem('idToken', fakeJwt(devEmail, devGroups));
    localStorage.setItem('accessToken', fakeJwt(devEmail, devGroups));
  }
  localStorage.setItem('meridian-theme', theme);
  localStorage.setItem('meridian-persona', persona);

  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.forEach((c) => c.startsWith('persona-') && document.documentElement.classList.remove(c));
  if (persona !== 'capital_markets') document.documentElement.classList.add(`persona-${persona}`);

  if (login || empty) {
    localStorage.removeItem('meridian-sessions');
    return;
  }

  const turns = mode === 'graph' ? graphTurns() : mode === 'flow' ? flowTurns() : swarmTurns();
  const rec = {
    id: 'dev-thread-000000000000000000000000000000000000',
    title: turns[0].text.slice(0, 48),
    updatedAt: 1751846400000, // fixed 2025-07 stamp so it restores as "most recent"
    turns,
  };
  localStorage.setItem('meridian-sessions', JSON.stringify([rec]));
}
