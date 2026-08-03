"""
Persona registry for the multi-vertical AgentCore demo.

Each persona is a self-contained *desk*: an agent roster (the same
``{name, model, tools, role}`` shape the swarm/graph engines already consume), a
tool-capability table (used to build the routing directory), a deterministic graph
topology (entry / sink / edges / layers), and firm-level branding metadata.

The AgentCore *platform* is shared across all personas — Runtime, Gateway + Cedar,
Identity (3LO / M2M / API-key vault), Memory, Browser, Code Interpreter, Observability.
A persona only swaps the *desk* that runs on top of it: which specialists exist, what
they know, which tools they own, and how the deterministic graph wires them together.

This module holds PURE DATA + PURE compile helpers only. It MUST NOT ``import strands``
(so ``main.py`` can import it cheaply for the tier-identity line without pulling in the
SDK). The swarm/graph engines call :func:`compile_persona` ONCE per request to derive the
per-request "persona context" (``pctx``) that replaces the former import-time globals
(``SWARM_AGENTS`` / ``_KEY_BY_NAME`` / ``_ROUTING_DIRECTORY`` / ``GRAPH_*``).
"""

# ─────────────────────────────────────────────────────────────────────────────
# Shared platform tools — persona-agnostic. Every persona may reuse these verbatim;
# each maps 1:1 onto an AgentCore primitive the demo showcases. The per-persona
# tool_desc tables re-describe them in the persona's own language, but the tool NAMES
# and their transport (in main.execute_tool) are shared and globally unique.
# ─────────────────────────────────────────────────────────────────────────────
SHARED_TOOLS = (
    'web_browser',       # AgentCore Browser
    'code_interpreter',  # AgentCore Code Interpreter
    'secure_vault',      # Gateway + Cedar (the policy-blockable vault)
    'user_data_lookup',  # Gateway (per-user directory data)
    'positions_view',    # Identity 3LO — read consent
    'trade_execute',     # Identity 3LO — write consent (separate grant)
    'market_data',       # Identity M2M (client_credentials)
    'macro_indicator',   # Identity API-key vault
)


# ═════════════════════════════════════════════════════════════════════════════
# PERSONA: capital_markets  (the original Meridian fixed-income desk)
# Roster + tool_desc + graph moved VERBATIM from swarm_strands.py / graph_strands.py
# so behavior is provably identical to the single-vertical build.
# ═════════════════════════════════════════════════════════════════════════════
_CAPITAL_MARKETS_ROSTER = {
    'orchestrator': {
        'name': 'Lead Coordinator',
        'model': 'sonnet-5',
        'tools': [],
        'role': (
            "You are the LEAD COORDINATOR of a team of specialist agents at AgentCore in a "
            "Box. You have NO domain tools of your own — you CANNOT pull curves, screen "
            "bonds, browse the web, run analytics, or view positions yourself. Only the "
            "specialists can. Your job: understand the portfolio manager's request, then:\n"
            "(a) If — and ONLY if — it is a pure greeting, chit-chat, or a meta question about "
            "yourself (e.g. 'hello', 'which model are you?'), answer it directly in one line.\n"
            "(b) For EVERYTHING ELSE — any request that needs data, a lookup, a screen, a "
            "curve, a calculation, a document, market context, or an action — you MUST call "
            "handoff_to_agent NOW to the specialist that owns the needed tool (see the directory "
            "below), with a clear instruction as the message. Do this on your FIRST turn.\n"
            "CRITICAL: never claim you will fetch, pull, retrieve, look up, or check something "
            "yourself, and never write 'I'll get that for you' — you have no tools, so a promise "
            "with no handoff strands the request and the user gets nothing. If work is needed, "
            "your ONLY valid action is handoff_to_agent (emit it with no preamble text). "
            "Specialists do the work; a later specialist (or the Committee) writes the final "
            "answer, so you normally do NOT write the closing answer yourself."
        ),
    },
    'universe': {
        'name': 'Universe & Data',
        'model': 'sonnet-5',
        'tools': ['bond_screen', 'curve_lookup', 'spread_lookup', 'price_bond', 'market_data'],
        'role': (
            "You are the UNIVERSE & DATA specialist for a fixed-income desk. You command the "
            "firm's ~3,000-bond universe and the live rates/credit picture: screen bonds by "
            "sector / rating / duration / yield (bond_screen), pull the real US Treasury "
            "par-yield curve (curve_lookup), the real ICE BofA credit-spread ladder by rating "
            "(spread_lookup), and value a hypothetical bond off the live curve (price_bond). "
            "When a governed, application-licensed vendor source is wanted, pull the firm's "
            "licensed market-data feed via market_data (AgentCore Identity machine-to-machine — "
            "the agent acts as the FIRM's application, no user consent). "
            "When the PM wants to BUILD or optimize a portfolio, screen the eligible universe "
            "then hand off to Risk & Quant to construct it. Answer directly for pure data/curve "
            "questions; otherwise hand off to the right specialist."
        ),
    },
    'research': {
        'name': 'Credit Research',
        'model': 'opus-4-8',
        'tools': ['web_browser', 'user_data_lookup'],
        'role': (
            "You are the CREDIT RESEARCH specialist. You gather live market/issuer context via "
            "the web browser and look up the portfolio manager's own profile, the funds they "
            "manage, and their mandate/benchmark (user_data_lookup). Do your part, then answer "
            "directly if the request is fully satisfied, or hand off — to Universe & Data for "
            "screening/curve, to Risk & Quant for construction or analytics, or to Portfolio & "
            "Execution to view/execute positions."
        ),
    },
    'analytics': {
        'name': 'Risk & Quant',
        'model': 'opus-4-8',
        'tools': ['code_interpreter', 'portfolio_risk', 'evolve_portfolio'],
        'role': (
            "You are the RISK & QUANT specialist. You construct and analyze fixed-income "
            "portfolios on REAL data. Use evolve_portfolio to run an evolutionary search over "
            "construction recipes against the PM's mandate (duration target, rating floor, "
            "sector/issuer caps, yield-vs-risk objective) — it returns a fitness-by-generation "
            "curve, a leaderboard of candidate portfolios, and the winning trade list. Use "
            "portfolio_risk to aggregate duration, convexity, yield, rating/sector mix, tracking "
            "error vs the Agg, and rate-shock P&L for any holdings set. Use code_interpreter for "
            "any other bespoke Python analytics (Sharpe, drawdown, weighted yield). If the "
            "request needs the eligible universe first, hand off to Universe & Data; to act on a "
            "result, hand off to Portfolio & Execution. Otherwise write the final answer."
        ),
    },
    'compliance': {
        'name': 'Compliance & Controls',
        'model': 'sonnet-5',
        'tools': ['secure_vault'],
        'role': (
            "You are the COMPLIANCE & CONTROLS specialist. You retrieve restricted compliance "
            "values (e.g. the firm's restricted-trading list, protected PINs) from the Secure "
            "Vault via Gateway, subject to Cedar policy. These are synthetic/illustrative demo "
            "values held only by the vault tool. Report a restricted value ONLY when the tool "
            "actually returned it, and quote it VERBATIM from the tool's response — never guess, "
            "reconstruct, or complete a value from memory. If the policy blocks access or the tool "
            "returns no value, say so plainly — never invent one. Then answer directly or hand off "
            "as needed."
        ),
    },
    'trading': {
        'name': 'Portfolio & Execution',
        'model': 'sonnet-5',
        'tools': ['positions_view', 'trade_execute', 'query_holdings'],
        'role': (
            "You are the PORTFOLIO & EXECUTION specialist. You view positions and execute "
            "trades/rebalances in the PM's funds via AgentCore Identity 3-legged OAuth (viewing "
            "and trading are separate consents). You can also query the firm's client holdings "
            "ledger (query_holdings) — a governed database whose rows are scoped to your desk and "
            "whose client names / notional are masked unless you are entitled to see them; report "
            "exactly what the tool returns, including any masked/redacted fields, and never invent "
            "a client name or notional the tool withheld. Perform the action, then answer directly "
            "if the request is complete, or hand off to another specialist."
        ),
    },
    'macro': {
        'name': 'Macro & Rates',
        'model': 'opus-4-8',
        'tools': ['curve_lookup', 'spread_lookup', 'web_browser', 'macro_indicator'],
        'role': (
            "You are the MACRO & RATES STRATEGIST. You form the top-down rates view: read the "
            "live US Treasury par-yield curve (curve_lookup) and the ICE BofA credit-spread "
            "ladder (spread_lookup), pull the latest CPI / unemployment / fed-funds / core-PCE "
            "prints straight from FRED (macro_indicator — the key comes from the AgentCore "
            "Identity API-key vault), and browse the web (web_browser) for the latest FOMC "
            "statement, dot plot, and rate-path expectations. Synthesize the "
            "curve shape (steepening/flattening/inversion), where spreads sit vs history, and "
            "what it implies for duration positioning and sector tilts. Do NOT build portfolios "
            "yourself — when the PM wants that view turned into holdings, hand off to Risk & "
            "Quant with a clear duration/curve brief, or to Universe & Data to screen the "
            "eligible set. Answer directly for pure macro/rates/curve questions."
        ),
    },
    'esg': {
        'name': 'ESG & Sustainability',
        'model': 'sonnet-5',
        'tools': ['web_browser', 'user_data_lookup'],
        'role': (
            "You are the ESG & SUSTAINABILITY specialist. You assess issuers and candidate bonds "
            "against sustainability criteria: browse the web (web_browser) for issuer ESG "
            "ratings, controversies, green/social/sustainability-bond use-of-proceeds, and "
            "exclusion-list membership (tobacco, thermal coal, controversial weapons), and check "
            "the PM's own mandate/exclusions via user_data_lookup. Report which issuers pass or "
            "fail the PM's ESG constraints and why. To turn ESG constraints into an actual "
            "screen or portfolio, hand off to Universe & Data (to filter the universe) or Risk & "
            "Quant (to construct within the eligible set). Answer directly for ESG-assessment "
            "questions."
        ),
    },
    'attribution': {
        'name': 'Performance Attribution',
        'model': 'opus-4-8',
        'tools': ['portfolio_risk', 'code_interpreter'],
        'role': (
            "You are the PERFORMANCE ATTRIBUTION specialist. You explain WHERE a portfolio's "
            "return and risk come from relative to the US Agg benchmark. Use portfolio_risk to "
            "get the holdings' aggregate duration, convexity, yield, OAS, rating/sector mix, "
            "duration gap and yield pickup vs the Agg, and rate-shock P&L; then use "
            "code_interpreter to decompose the active return into carry (yield pickup), curve "
            "(duration-gap × rate move), credit (OAS × spread duration), and selection/residual, "
            "and to compute contribution by sector and rating. Present a clean attribution table "
            "with the drivers ranked. If you need the current holdings first, hand off to "
            "Portfolio & Execution (positions); otherwise write the final attribution answer."
        ),
    },
    'liquidity': {
        'name': 'Liquidity & Microstructure',
        'model': 'sonnet-5',
        'tools': ['bond_screen', 'code_interpreter'],
        'role': (
            "You are the LIQUIDITY & MICROSTRUCTURE specialist. You judge how tradable a name or "
            "a basket is and how to work an order. Use bond_screen (which exposes a per-bond "
            "liquidity score, duration and sector) to rank candidates by liquidity and to find "
            "liquid substitutes, and code_interpreter to estimate market impact and slice a "
            "target trade into tranches given the liquidity scores and sizes. Flag illiquid or "
            "concentrated names and suggest more-liquid alternatives with similar risk. To "
            "actually place the resulting trades, hand off to Portfolio & Execution; for a full "
            "rebuild, hand off to Risk & Quant. Answer directly for liquidity/execution-sizing "
            "questions."
        ),
    },
    'committee': {
        'name': 'Investment Committee',
        'model': 'opus-4-8',
        'tools': [],
        'role': (
            "You are the INVESTMENT COMMITTEE — the desk's synthesis and challenge function. You "
            "have NO tools; you reason over what the specialists have already produced. You are "
            "engaged ONLY for multi-faceted requests that several specialists have contributed to "
            "(e.g. a portfolio that was built, risk-attributed, ESG-screened and liquidity-checked). "
            "Your job: reconcile their findings into ONE coherent recommendation, and CHALLENGE it "
            "before signing off — call out conflicts and tensions (a yield tilt that breaks the "
            "duration mandate; an ESG exclusion that removes a top holding; an illiquid name the "
            "construction leaned on; tracking error vs the mandate), state the trade-offs, and give "
            "a clear go / adjust / no-go verdict with the reasoning. If a genuinely material input "
            "is missing (e.g. the portfolio was built but never risk-checked), hand off to the ONE "
            "specialist who can supply it; otherwise write the final committee memo. Do NOT re-run "
            "work that's already been done. This is the LAST stop — end with the decision, not a "
            "hand-off."
        ),
    },
}

# Human descriptions of each tool the capital-markets desk can reach — feeds the routing
# directory so every agent knows WHO owns WHICH tool and hands off directly (not via a
# bounce through the coordinator).
_CAPITAL_MARKETS_TOOL_DESC = {
    'web_browser': 'browse the web for live market data (yields, FOMC, prices)',
    'user_data_lookup': "look up the PM's own profile, the funds they manage, and preferences/benchmark",
    'code_interpreter': 'run Python for analytics (Sharpe, drawdown, volatility, weighted yield)',
    'secure_vault': 'retrieve restricted compliance values (restricted-trading list, protected PINs)',
    'positions_view': "view a fund's holdings/positions (Identity 3LO read)",
    'trade_execute': 'execute a trade / rebalance in a fund (Identity 3LO trade)',
    'query_holdings': 'query the identity-governed client holdings ledger (Aurora DB; row/column access scoped by your verified identity)',
    'market_data': 'pull licensed vendor market/reference data as the FIRM (Identity M2M / client-credentials)',
    'macro_indicator': 'fetch live macro series (CPI, unemployment, fed funds) via FRED (Identity API-key vault)',
    'bond_screen': 'screen the ~3,000-bond universe by sector/rating/duration/yield',
    'curve_lookup': 'pull the real US Treasury par-yield curve',
    'spread_lookup': 'pull the real ICE BofA credit-spread ladder by rating',
    'price_bond': 'value a hypothetical bond off the live curve + rating OAS',
    'portfolio_risk': 'aggregate duration/convexity/yield/tracking-error/rate-shock for a holdings set',
    'evolve_portfolio': 'evolutionary search over construction recipes → leaderboard + winning portfolio',
}

# The flagship "full desk review" DAG (moved verbatim from graph_strands.py). A declarative
# edge list over roster keys — the orchestration is DATA, reviewable at a glance:
#   orchestrator ─┬─ macro ─────┐
#                 └─ universe ───┴─ analytics ─┬─ attribution ┐
#                                              ├─ esg         ┼─ committee
#                                              └─ liquidity   ┘
_CAPITAL_MARKETS_GRAPH = {
    'entry': 'orchestrator',
    'sink': 'committee',
    'edges': [
        ('orchestrator', 'macro'),
        ('orchestrator', 'universe'),
        ('macro', 'analytics'),
        ('universe', 'analytics'),
        ('analytics', 'attribution'),
        ('analytics', 'esg'),
        ('analytics', 'liquidity'),
        ('attribution', 'committee'),
        ('esg', 'committee'),
        ('liquidity', 'committee'),
    ],
    'layers': [
        ['orchestrator'],
        ['macro', 'universe'],
        ['analytics'],
        ['attribution', 'esg', 'liquidity'],
        ['committee'],
    ],
}


# ═════════════════════════════════════════════════════════════════════════════
# The persona registry. Each entry is a complete desk. New verticals are appended
# below (insurance / banking / fintech); the compile helpers are persona-agnostic.
# ═════════════════════════════════════════════════════════════════════════════
PERSONAS = {
    'capital_markets': {
        'id': 'capital_markets',
        'display_name': 'AgentCore in a Box — Capital Markets (Fixed Income)',
        'firm_name': 'AgentCore in a Box',
        'firm_kind': 'a fixed-income investment firm',
        'user_title': 'portfolio manager',
        'roster': _CAPITAL_MARKETS_ROSTER,
        'tool_desc': _CAPITAL_MARKETS_TOOL_DESC,
        'graph': _CAPITAL_MARKETS_GRAPH,
        # query_holdings is a governed Gateway tool (the Aurora positions-db OpenAPI target), so it
        # routes through the SAME MCP path as the vertical tools. _index_vertical_tools indexes it
        # into VERTICAL_TOOL_TARGET so main.execute_tool dispatches it via _invoke_gateway_tool — no
        # per-tool runtime branch needed. (The bond tools are NOT here; they use _invoke_bond_tool.)
        'vertical_tools': {'target': 'positions-db', 'names': ['query_holdings']},
    },
}

DEFAULT_PERSONA = 'capital_markets'

# Maps a per-vertical governed tool NAME → the Gateway target that fronts its Lambda
# (registered by deploy.sh). main.execute_tool reads this to route insurance/banking/fintech
# tools through the same governed MCP path as the bond tools. Capital-markets bond tools are
# NOT here — they route via _invoke_bond_tool (which has a direct-Lambda fallback). Populated
# by _register from each persona spec's 'vertical_tools' declaration.
VERTICAL_TOOL_TARGET = {}


def _index_vertical_tools(spec):
    """Index a spec's 'vertical_tools': {'target': '<gateway-target>', 'names': [...]} into
    VERTICAL_TOOL_TARGET so main.execute_tool can route each tool through _invoke_gateway_tool."""
    vt = spec.get('vertical_tools')
    if vt:
        for n in vt.get('names', []):
            VERTICAL_TOOL_TARGET[n] = vt['target']


def _register(spec):
    """Register a persona spec and index its vertical tools → Gateway target. `spec` may carry
    'vertical_tools': {'target': '<gateway-target>', 'names': [tool_name, ...]}."""
    PERSONAS[spec['id']] = spec
    _index_vertical_tools(spec)


# The inline personas above (capital_markets) don't go through _register, so index their
# vertical_tools here — otherwise query_holdings would never reach VERTICAL_TOOL_TARGET.
for _inline_spec in PERSONAS.values():
    _index_vertical_tools(_inline_spec)


# ═════════════════════════════════════════════════════════════════════════════
# Per-persona SHARED-tool spec overrides.
#
# A few platform tools have ONE implementation (built once in swarm_strands._build_tools)
# but must DESCRIBE themselves in each desk's own language and expose only that desk's real,
# in-scope arguments — otherwise the model reads a capital-markets docstring on a banking desk
# and either hallucinates the mismatch or calls the tool with arguments the backend rejects
# ("wrong desc / spill"). Each override is applied to the model-visible tool spec at build time
# (Strands' tool_spec setter); the tool NAME and the closure never change, and the backend still
# routes by dataset/series/secret name (all globally unique). So this layer changes ONLY the
# description + inputSchema the model sees — never the transport or the RBAC choke point.
#
# INVARIANT (prod-grade): every enum value / behavior a description promises MUST be real —
# backed by _FRED_SERIES in main.py (macro_indicator), a dataset the market-data-api Lambda
# actually serves (market_data), a secret/list the vault Lambda actually holds (secure_vault),
# or a book the grades-api store actually returns (positions_view / trade_execute). No desk may
# name a data vendor the demo does not call. Capital-markets keeps the docstring defaults (it
# has NO entry here), so its behavior is byte-identical to before this layer existed.
#
# A spec patch is a dict with optional 'description' and/or 'inputSchema' (a full JSON-schema
# object, same shape Bedrock/Strands expect: {'json': {'type':'object','properties':{...},
# 'required':[...]}}). _build_tools merges these over the docstring-derived base.
# ═════════════════════════════════════════════════════════════════════════════

# Shared arg-schema fragments reused across desks (keeps the tables readable + consistent).
def _macro_schema(indicators, desc):
    """Build a macro_indicator inputSchema exposing only `indicators` (a subset of
    main._FRED_SERIES) with a per-desk `desc` for the enum param."""
    return {'json': {'type': 'object', 'properties': {
        'indicator': {'type': 'string', 'enum': list(indicators), 'description': desc}},
        'required': ['indicator']}}


def _market_schema(datasets, desc):
    """Build a market_data inputSchema exposing only the datasets a desk's feed serves."""
    return {'json': {'type': 'object', 'properties': {
        'dataset': {'type': 'string', 'enum': list(datasets), 'description': desc}},
        'required': ['dataset']}}


def _trade_schema(book_desc, item_desc, alloc_desc):
    """Build a trade_execute inputSchema. The grades-api store is a generic
    book(dataType) → item(ticker) → allocation map, so every desk reuses the same 4 fields
    with its own wording (a fund + ticker for CM; a book + line for insurance; etc.)."""
    return {'json': {'type': 'object', 'properties': {
        'fund_name': {'type': 'string', 'description': book_desc},
        'ticker': {'type': 'string', 'description': item_desc},
        'side': {'type': 'string', 'enum': ['buy', 'sell'], 'description': 'direction of the action'},
        'target_allocation': {'type': 'string', 'description': alloc_desc}},
        'required': ['fund_name', 'ticker', 'side', 'target_allocation']}}


def _positions_schema(book_desc):
    return {'json': {'type': 'object', 'properties': {
        'fund_name': {'type': 'string', 'description': book_desc}},
        'required': ['fund_name']}}


# The vault screening/retrieval schema is IDENTICAL across desks (the Lambda holds one set of
# lists + values); only the surrounding role prompt differs. So there is no vault inputSchema
# override — the shared docstring already exposes the `name` screening param (see swarm_strands).

TOOL_SPEC_OVERRIDES = {
    # ── Insurance (Ridgeline) ────────────────────────────────────────────────────────────
    'insurance': {
        'market_data': {
            'description': (
                "Pull LICENSED exposure & loss-cost reference data via AgentCore Identity "
                "machine-to-machine (client_credentials) — the agent authenticates as RIDGELINE's "
                "application, not a user, so no consent is needed. Served from the carrier's real "
                "FEMA National Risk Index county-hazard snapshot (per-peril Expected Annual Loss + "
                "hazard scores). Use for a governed, application-licensed exposure/loss-cost source."),
            'inputSchema': _market_schema(
                ['exposure', 'loss_cost', 'hazard'],
                "Which licensed dataset: 'hazard' (county hazard scores), 'loss_cost' (per-peril "
                "Expected Annual Loss), or 'exposure' (building-value exposure master)."),
        },
        # Insurance uses macro_indicator ONLY on Pricing & Actuarial, for the real FRED rate /
        # inflation context that drives reserving and investment income — NOT weather (FRED has
        # none). Catastrophe & Climate reads live weather via the web browser instead.
        'macro_indicator': {
            'description': (
                "Fetch a LIVE macroeconomic series from FRED (rates & inflation that frame "
                "reserving and investment income), using a key retrieved at call time from the "
                "AgentCore Identity API-key vault — never a plaintext credential in the agent. "
                "This is rate/inflation context, NOT weather; live weather/storm data comes from "
                "the web browser."),
            'inputSchema': _macro_schema(
                ['CPI', 'unemployment', 'fed_funds', '10y'],
                "Which macro series: CPI, unemployment, fed_funds, or 10y (10-year Treasury)."),
        },
        'positions_view': {
            'description': (
                "View the policies/exposures in one of the signed-in underwriter's books (or all "
                "books) from the Book API. Uses AgentCore Identity 3-legged OAuth (portfolio-api/read "
                "scope) so the agent reads only the calling underwriter's books, on their behalf. "
                "The first use requires the underwriter to authorize access in their browser."),
            'inputSchema': _positions_schema(
                "Book to view, e.g. 'Coastal Property Book', or 'all' for every book the underwriter manages."),
        },
        'trade_execute': {
            'description': (
                "Bind / adjust / endorse a policy line in one of the signed-in underwriter's books "
                "— sets a new target share for a line. WRITE action requiring a SEPARATE "
                "portfolio-api/trade consent (viewing the book does not grant binding). Performed on "
                "behalf of the underwriter via an AgentCore Identity delegated OAuth token; every "
                "bind is audit-logged."),
            'inputSchema': _trade_schema(
                "Book to bind in, e.g. 'Coastal Property Book'.",
                "Line / segment to bind, e.g. 'FL Habitational'.",
                "New target share for this line after the bind, e.g. '18%'."),
        },
    },
    # ── Banking (Rampart) ────────────────────────────────────────────────────────────────
    'banking': {
        'market_data': {
            'description': (
                "Pull LICENSED reference-rates & credit-performance data via AgentCore Identity "
                "machine-to-machine (client_credentials) — the agent authenticates as RAMPART's "
                "application, not a user, so no consent is needed. Served from the bank's real FRED "
                "feed: the US Treasury curve, SOFR/prime indices, and the Fed H.8 business-loan "
                "delinquency & charge-off series. Use for a governed, application-licensed rates/"
                "credit-performance source."),
            'inputSchema': _market_schema(
                ['rate_curve', 'rate_indices', 'credit_performance'],
                "Which licensed dataset: 'rate_curve' (Treasury par-yield), 'rate_indices' "
                "(SOFR/prime/fed funds), or 'credit_performance' (Fed H.8 delinquency & charge-off)."),
        },
        'macro_indicator': {
            'description': (
                "Fetch a LIVE rate or macro series from FRED — SOFR, prime, fed funds, the 10-year "
                "Treasury, CPI or unemployment — using a key retrieved at call time from the "
                "AgentCore Identity API-key vault (never a plaintext credential in the agent). Use "
                "for TODAY's cost of funds and cycle read behind an affordability/coverage or "
                "pricing decision."),
            'inputSchema': _macro_schema(
                ['sofr', 'prime', 'fed_funds', '10y', 'CPI', 'unemployment'],
                "Which series: sofr, prime, fed_funds, 10y (10-year Treasury), CPI, or unemployment."),
        },
        'positions_view': {
            'description': (
                "View a customer's accounts and outstanding loan book (or all books) from the "
                "Account API. Uses AgentCore Identity 3-legged OAuth (portfolio-api/read scope) so "
                "the agent reads only the calling officer's customers, on their behalf. The first "
                "use requires the officer to authorize access in their browser."),
            'inputSchema': _positions_schema(
                "Loan book to view, e.g. 'Commercial & Industrial Book', or 'all' for every book the officer manages."),
        },
        'trade_execute': {
            'description': (
                "Action an approved credit decision in one of the officer's books — approve a "
                "credit-limit change or initiate a loan disbursement (sets a new committed amount "
                "for a facility). WRITE action requiring a SEPARATE portfolio-api/trade consent "
                "(viewing accounts does not grant acting). Performed on behalf of the officer via an "
                "AgentCore Identity delegated OAuth token; every action is audit-logged."),
            'inputSchema': _trade_schema(
                "Loan book to act in, e.g. 'Commercial & Industrial Book'.",
                "Facility / borrower to action, e.g. 'Cedar Ridge Logistics LLC'.",
                "New committed share/limit for this facility after the action, e.g. '12%'."),
        },
    },
    # ── FinTech (Kairo) ──────────────────────────────────────────────────────────────────
    'fintech': {
        'market_data': {
            'description': (
                "Pull LICENSED consumer-credit & network reference data via AgentCore Identity "
                "machine-to-machine (client_credentials) — the agent authenticates as KAIRO's "
                "application, not a user, so no consent is needed. Served from the platform's real "
                "FRED consumer-credit feed (credit-card delinquency & charge-off, total consumer "
                "credit) plus the book's network/volume stats. Use for a governed, application-"
                "licensed consumer-credit/network source."),
            'inputSchema': _market_schema(
                ['consumer_credit', 'network_stats'],
                "Which licensed dataset: 'consumer_credit' (FRED card delinquency/charge-off + "
                "consumer credit) or 'network_stats' (book approval/interchange/volume stats)."),
        },
        'macro_indicator': {
            'description': (
                "Fetch a LIVE FX or consumer-credit series from FRED — EUR/USD, GBP/USD, USD/JPY, "
                "credit-card delinquency, credit-card charge-off, or total consumer credit — using "
                "a key retrieved at call time from the AgentCore Identity API-key vault (never a "
                "plaintext credential in the agent). Note: no crypto series (no free real feed); "
                "for crypto reference prices use the web browser."),
            'inputSchema': _macro_schema(
                ['eur_usd', 'gbp_usd', 'usd_jpy', 'card_delinquency', 'card_chargeoff', 'consumer_credit'],
                "Which series: eur_usd, gbp_usd, usd_jpy (real FRED FX), or card_delinquency, "
                "card_chargeoff, consumer_credit (real FRED consumer credit)."),
        },
        'positions_view': {
            'description': (
                "View a customer's transactions, wallet balances and card limits (or all accounts) "
                "from the Account API. Uses AgentCore Identity 3-legged OAuth (portfolio-api/read "
                "scope) so the agent reads only the calling lead's accounts, on their behalf. The "
                "first use requires the lead to authorize access in their browser."),
            'inputSchema': _positions_schema(
                "Account/program to view, e.g. 'Consumer Wallet', or 'all' for every account the lead manages."),
        },
        'trade_execute': {
            'description': (
                "Take an account action in one of the lead's programs — freeze/unfreeze an account, "
                "issue a refund, raise or lower a credit/spend limit, or block a card (sets the new "
                "state for an account). WRITE action requiring a SEPARATE portfolio-api/trade "
                "consent (viewing accounts does not grant acting). Performed on behalf of the lead "
                "via an AgentCore Identity delegated OAuth token; every action is audit-logged."),
            'inputSchema': _trade_schema(
                "Program/book to act in, e.g. 'Consumer Wallet'.",
                "Account / card to action, e.g. 'M-40217'.",
                "New limit/target for this account after the action, e.g. '10%' or 'blocked'."),
        },
    },
}


def tool_spec_overrides(persona_id):
    """Return the per-persona shared-tool spec-override map (name → {description?, inputSchema?}),
    or an empty dict for capital-markets / an unknown desk (→ the docstring defaults stand)."""
    return TOOL_SPEC_OVERRIDES.get((persona_id or '').strip().lower(), {})


def get_persona(persona_id):
    """Resolve a persona id (case-insensitive) to its spec; default = capital_markets."""
    return PERSONAS.get((persona_id or '').strip().lower(), PERSONAS[DEFAULT_PERSONA])


# ─────────────────────────────────────────────────────────────────────────────
# Pure compile helpers — replace the former import-time derivations. Called ONCE per
# request at engine build time, never at import, so each turn gets its own persona ctx.
# ─────────────────────────────────────────────────────────────────────────────
def build_key_by_name(roster):
    """name -> short-key (replaces the former module-global _KEY_BY_NAME)."""
    return {a['name']: k for k, a in roster.items()}


def build_routing_directory(roster, tool_desc):
    """A compact 'who owns which tool' table injected into every agent's system prompt so
    the orchestrator routes DIRECTLY to the owning specialist in one hand-off. Replaces
    the former module-global _ROUTING_DIRECTORY (built once at import)."""
    lines = []
    for key, spec in roster.items():
        if not spec['tools']:
            continue
        caps = '; '.join(tool_desc.get(t, t) for t in spec['tools'])
        lines.append(f"- {spec['name']}: {caps}")
    return '\n'.join(lines)


def compile_persona(persona_id):
    """Build ALL per-request derived state ONCE, returning the persona context (``pctx``)
    the swarm/graph engines consume in place of the old module globals."""
    p = get_persona(persona_id)
    roster, graph = p['roster'], p['graph']
    edges = graph['edges']
    # Every node that participates in the graph (entry + all edge targets), de-duped,
    # order-preserving (replaces the former GRAPH_NODES global).
    nodes = list(dict.fromkeys([graph['entry']] + [b for _, b in edges]))
    return {
        'id': p['id'],
        'display_name': p['display_name'],
        'firm_name': p['firm_name'],
        'firm_kind': p.get('firm_kind', ''),
        'user_title': p.get('user_title', 'user'),
        'roster': roster,
        'tool_desc': p['tool_desc'],   # kept so prune_roster can rebuild the routing directory
        'key_by_name': build_key_by_name(roster),
        'routing_directory': build_routing_directory(roster, p['tool_desc']),
        'entry_key': graph['entry'],   # de-hardcodes 'orchestrator'
        'sink_key': graph['sink'],     # de-hardcodes 'committee'
        'graph_edges': edges,
        'graph_layers': graph['layers'],
        'graph_nodes': nodes,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Per-AGENT (specialist) access — the runtime enforcement seam for the entitlements
# `agents` dimension. An admin may grant a user a SUBSET of a desk's specialists; the
# runtime prunes the rest out of the roster BEFORE either engine builds, so a revoked
# specialist is never instantiated and can never be a handoff target. See
# entitlements.AGENT_CATALOG / blocked_agents (the catalog side) and agent/main.py (the caller).
# ─────────────────────────────────────────────────────────────────────────────
def revocable_agents(persona_id):
    """The within-desk roster keys that MAY be individually revoked — every roster key EXCEPT
    the structural entry (Lead Coordinator) and sink (Committee), which are load-bearing for the
    swarm entry-point / graph fan-in and are therefore never revocable. Mirrors
    entitlements.AGENT_CATALOG membership for this desk without importing it (avoids a cycle)."""
    p = get_persona(persona_id)
    entry, sink = p['graph']['entry'], p['graph']['sink']
    return [k for k in p['roster'] if k not in (entry, sink)]


def _contract_edges(edges, remove):
    """Edge-contract a set of node keys out of a DAG edge-list while PRESERVING reachability:
    for each removed node R, every predecessor P (P→R) is bridged to every successor S (R→S),
    then all edges touching R are dropped. Done one node at a time; dedups; order-stable. This
    is what keeps entry→sink connected when a mid-DAG specialist is revoked."""
    edges = [(a, b) for a, b in edges]
    for r in remove:
        preds = [a for a, b in edges if b == r]
        succs = [b for a, b in edges if a == r]
        kept = [(a, b) for a, b in edges if a != r and b != r]
        bridged = [(a, b) for a in preds for b in succs if a != b]
        seen, out = set(), []
        for e in kept + bridged:
            if e not in seen:
                seen.add(e)
                out.append(e)
        edges = out
    return edges


def prune_roster(pctx, blocked_keys):
    """Return a NEW pctx with the given specialists removed — CONSISTENTLY across both engines:
      • swarm builds its nodes straight from `roster`, so a removed specialist is simply never
        created and cannot be resolved as a handoff target.
      • graph builds from `graph_nodes` + `graph_edges`; we EDGE-CONTRACT the removed nodes so
        the entry→sink path stays connected (dropping e.g. `analytics` re-links its predecessors
        to its successors instead of orphaning attribution/esg/liquidity or severing the sink).
    `routing_directory` is rebuilt from the pruned roster so the model is never told a revoked
    specialist still exists. Structural nodes (entry/sink) are NEVER pruned even if asked. A
    no-op blocked set returns the same pctx object unchanged (zero overhead on the common path)."""
    entry, sink = pctx['entry_key'], pctx['sink_key']
    remove = {k for k in (blocked_keys or ()) if k in pctx['roster'] and k not in (entry, sink)}
    if not remove:
        return pctx
    roster = {k: v for k, v in pctx['roster'].items() if k not in remove}
    edges = _contract_edges(pctx['graph_edges'], remove)
    nodes = list(dict.fromkeys([entry] + [b for _, b in edges]))
    layers = [[k for k in layer if k in roster] for layer in pctx['graph_layers']]
    layers = [lyr for lyr in layers if lyr]
    new = dict(pctx)
    new['roster'] = roster
    new['key_by_name'] = build_key_by_name(roster)
    new['routing_directory'] = build_routing_directory(roster, pctx.get('tool_desc', {}))
    new['graph_edges'] = edges
    new['graph_nodes'] = nodes
    new['graph_layers'] = layers
    new['pruned_agents'] = sorted(remove)   # surfaced for audit / the UI's "N specialists withheld"
    # Display names of the removed specialists — the swarm handoff hook denies routing to these
    # (defense-in-depth behind their removal from the node set). Captured BEFORE they're dropped.
    new['pruned_agent_names'] = sorted(pctx['roster'][k]['name'] for k in remove)
    return new


def scope_tools(pctx, blocked_tools):
    """Return a NEW pctx whose every specialist's tool list has `blocked_tools` removed, so the
    agent is NEVER even offered a tool the caller isn't entitled to — it can't waste a model call
    attempting one. This is the PROACTIVE half of tool RBAC; the runtime's per-call `_tool_allowed`
    gate remains the authoritative backstop (this only trims what the model sees). Because roster
    specs are SHARED module-level objects, we copy-on-write: only specs that actually lose a tool
    get a fresh dict with a new 'tools' list; untouched specs are shared as-is (cheap common path).

    A no-op blocked set returns the same pctx object. `pruned_tools` (sorted) is attached so the
    system prompt can honestly tell the model which tools are withheld and to explain, not retry.
    Structural nodes have empty tool lists, so they're unaffected."""
    blocked = {t for t in (blocked_tools or ())}
    if not blocked:
        return pctx
    roster = pctx['roster']
    removed = set()
    new_roster = {}
    changed = False
    for key, spec in roster.items():
        tools = spec.get('tools', [])
        kept = [t for t in tools if t not in blocked]
        if len(kept) != len(tools):
            removed.update(t for t in tools if t in blocked)
            new_spec = dict(spec)
            new_spec['tools'] = kept
            new_roster[key] = new_spec
            changed = True
        else:
            new_roster[key] = spec
    if not changed:
        return pctx
    new = dict(pctx)
    new['roster'] = new_roster
    # Rebuild the routing directory so "who owns which tool" never advertises a withheld tool.
    new['routing_directory'] = build_routing_directory(new_roster, pctx.get('tool_desc', {}))
    new['pruned_tools'] = sorted(removed)
    return new


# ─────────────────────────────────────────────────────────────────────────────
# Register the additional verticals. Each module calls _register(...) on import and only
# depends on the helpers defined above, so importing them here (at the END of this module)
# is safe. A failed vertical import must NOT take down the default desk, so each is guarded.
# ─────────────────────────────────────────────────────────────────────────────
for _mod in ('persona_insurance', 'persona_banking', 'persona_fintech'):
    try:
        __import__(_mod)
    except Exception as _e:  # pragma: no cover - defensive; capital_markets still works
        print(f'PERSONA LOAD WARNING: {_mod} failed to register: {type(_e).__name__}: {_e}', flush=True)
