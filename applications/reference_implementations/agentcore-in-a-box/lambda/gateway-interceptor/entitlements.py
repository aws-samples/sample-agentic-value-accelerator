"""
Canonical entitlements catalog + evaluation logic — the SINGLE source of truth for the
admin-managed, fine-grained RBAC layer. This module is intentionally dependency-free
(stdlib + boto3 only) and pure-data + pure-functions, so the SAME file can be dropped
verbatim into every enforcement point:

  • agent/main.py            — runtime pre-check (per-user, instant, sees verified sub)
  • lambda/admin-api         — the admin grant/revoke API + Cedar re-materialize
  • lambda/gateway-interceptor — the Gateway REQUEST interceptor (platform MCP boundary)
  • lambda/policy-toggle      — legacy vault toggle (kept working via the shared catalog)

deploy.sh copies agent/entitlements.py into each lambda/*/ dir at deploy time (same
"single-sourced" pattern as agent/evolve.py), so the catalog can never drift between
the runtime and the Lambdas.

────────────────────────────────────────────────────────────────────────────────────
DATA MODEL  (DynamoDB table: agentcore-demo-entitlements[-env])
────────────────────────────────────────────────────────────────────────────────────
  PK principal = "user#<cognito-sub>"   |  "agent#<workload-name>"
  SK dataType  = "meta" | "tools" | "desks" | "creds"

  tools item:  { principal, dataType:"tools", grants: { "<tool>":  true/false, ... } }
  desks item:  { principal, dataType:"desks", grants: { "<desk>":  true/false, ... } }
  creds item:  { principal, dataType:"creds", grants: { "<provider>": true/false, ... } }
  meta  item:  { principal, dataType:"meta",  label, kind, managed: true, updated_at, updated_by }

SEMANTICS — default-deny WITHIN a managed principal, fail-open for UNMANAGED principals:
  • A principal with a `meta` item (managed:true) is MANAGED → any key not explicitly
    granted (present && truthy) is DENIED.
  • A principal with NO records at all is UNMANAGED → every key is ALLOWED. This keeps a
    fresh deploy from bricking before deploy.sh seeds defaults, and keeps non-demo users
    (created ad hoc) working. The admin "manages" a principal the first time they save it.
  • The `admins` group is a HARD override handled by callers (an admin is never gated).

────────────────────────────────────────────────────────────────────────────────────
JUST-IN-TIME / TIME-BOXED GRANTS  (the "Persona-Scoped Access" layer)
────────────────────────────────────────────────────────────────────────────────────
A grant may be TIME-BOXED. Alongside the `grants` {key:bool} map, an item may carry an
`expiries` {key: epoch_seconds} map. A key is EFFECTIVE only while granted AND not past its
expiry. Expiry is evaluated LAZILY at every enforcement point (evaluate(now=...)), so a lapsed
grant denies on the caller's very next turn even if no sweeper has run yet — the EventBridge
sweeper (lambda/entitlements-sweeper) is only for pushing the live UI update + tidying the row.
A key WITHOUT an expiries entry is a STANDING grant (never lapses). Admins are seeded with full
standing grants and are never expired.

────────────────────────────────────────────────────────────────────────────────────
AGENTS dimension — per-specialist invocation access (dataType "agents")
────────────────────────────────────────────────────────────────────────────────────
Beyond desk + tool access, an admin may grant a user a SUBSET of the specialists WITHIN a desk.
The entitlement key is COMPOUND — "<persona_id>::<roster_key>" — because roster keys (e.g.
`research`, `esg`, `macro`) are REUSED across desks with different meanings, so only the compound
form is globally unique (see AGENT_CATALOG). A desk's structural nodes (the Lead Coordinator
entry + the Committee sink) are NOT revocable and are deliberately absent from AGENT_CATALOG —
removing them would break the swarm entry-point / graph sink. Enforced by pruning the roster
before the engines run (personas.prune_roster) AND by denying handoff_to_agent to a revoked
specialist. SAFETY: the agents dimension is fail-open until an admin first writes an `agents`
item for a principal (a pre-existing managed user must not lose every specialist the moment this
feature deploys) — see `allows()`.
"""

import time

# ─────────────────────────────────────────────────────────────────────────────
# TOOL CATALOG — every governed tool the platform exposes, across all four desks.
# `gateway_action` is the namespaced <target>___<tool> Cedar action for tools that
# route through the AgentCore Gateway (None = the tool does not traverse the Gateway,
# e.g. Identity 3LO/M2M/API-key tools and the local Browser/Code-Interpreter sessions —
# those are enforced at the runtime layer only, since Cedar can't see them).
# `sensitive` flags the tools whose denial makes the most compelling security story.
# ─────────────────────────────────────────────────────────────────────────────
TOOL_CATALOG = {
    # Shared platform tools (present in every desk's roster surface)
    'secure_vault':     {'label': 'Secure Vault',        'group': 'Identity / Gateway', 'gateway_action': 'secure-vault___secure_vault',           'sensitive': True,  'pillar': 'Gateway + Cedar'},
    'user_data_lookup': {'label': 'User Directory',      'group': 'Gateway',            'gateway_action': 'user-data-lookup___user_data_lookup',   'sensitive': False, 'pillar': 'Gateway'},
    'positions_view':   {'label': 'Positions (read)',    'group': 'Identity 3LO',       'gateway_action': None,                                     'sensitive': True,  'pillar': 'Identity 3LO (read consent)'},
    'trade_execute':    {'label': 'Trade Execute',       'group': 'Identity 3LO',       'gateway_action': None,                                     'sensitive': True,  'pillar': 'Identity 3LO (write consent)'},
    'market_data':      {'label': 'Market Data (M2M)',   'group': 'Identity M2M',       'gateway_action': None,                                     'sensitive': False, 'pillar': 'Identity M2M'},
    'macro_indicator':  {'label': 'Macro (API-key)',     'group': 'Identity vault',     'gateway_action': None,                                     'sensitive': False, 'pillar': 'Identity API-key vault'},
    'web_browser':      {'label': 'Web Browser',         'group': 'Compute',            'gateway_action': None,                                     'sensitive': False, 'pillar': 'AgentCore Browser'},
    'code_interpreter': {'label': 'Code Interpreter',    'group': 'Compute',            'gateway_action': None,                                     'sensitive': False, 'pillar': 'AgentCore Code Interpreter'},

    # Capital-markets bond tools (route via the bond-tools Lambda; not Gateway-fronted,
    # so runtime-enforced only — Cedar has no action for them).
    'bond_screen':      {'label': 'Bond Screen',         'group': 'Capital Markets', 'gateway_action': None, 'sensitive': False, 'pillar': 'Governed tool'},
    'curve_lookup':     {'label': 'Curve Lookup',        'group': 'Capital Markets', 'gateway_action': None, 'sensitive': False, 'pillar': 'Governed tool'},
    'spread_lookup':    {'label': 'Spread Lookup',       'group': 'Capital Markets', 'gateway_action': None, 'sensitive': False, 'pillar': 'Governed tool'},
    'price_bond':       {'label': 'Price Bond',          'group': 'Capital Markets', 'gateway_action': None, 'sensitive': False, 'pillar': 'Governed tool'},
    'portfolio_risk':   {'label': 'Portfolio Risk',      'group': 'Capital Markets', 'gateway_action': None, 'sensitive': False, 'pillar': 'Governed tool'},
    'evolve_portfolio': {'label': 'Evolve Portfolio',    'group': 'Capital Markets', 'gateway_action': None, 'sensitive': False, 'pillar': 'Governed tool'},
    # Identity-governed Aurora DB (the first NON-Lambda / OpenAPI Gateway target). gateway_action is
    # set (→ Cedar can represent it) even though the backend is a database, because it is reached
    # through the Gateway just like the vertical Lambda tools. Row/column visibility is ALSO governed
    # inside Postgres (RLS + a masking view) keyed off the verified caller — a second layer under this
    # tool-level grant.
    'query_holdings':   {'label': 'Client Holdings (governed DB)', 'group': 'Capital Markets', 'gateway_action': 'positions-db___query_holdings', 'sensitive': True, 'pillar': 'Gateway + RLS'},
    # Realtime market quotes served by an INTERNAL service running on EKS, exposed through the
    # Gateway as an OpenAPI target (market-data___market_quote). Governed identically to every other
    # tool — interceptor + Cedar + runtime pre-check + rate limit — which is the whole point: a
    # customer's own EKS/on-prem API becomes a first-class governed MCP tool with no bespoke auth.
    'market_quote':     {'label': 'Market Quotes (EKS)', 'group': 'Capital Markets', 'gateway_action': 'market-data___market_quote', 'sensitive': False, 'pillar': 'Gateway (EKS OpenAPI target)'},

    # Per-vertical Gateway-fronted tools (insurance / banking / fintech). Their
    # gateway_action is <target>___<tool>; targets are registered by deploy.sh.
    'risk_screen':        {'label': 'Risk Screen',        'group': 'Insurance', 'gateway_action': 'insurance-tools___risk_screen',        'sensitive': False, 'pillar': 'Gateway'},
    'peril_lookup':       {'label': 'Peril Lookup',       'group': 'Insurance', 'gateway_action': 'insurance-tools___peril_lookup',       'sensitive': False, 'pillar': 'Gateway'},
    'book_risk':          {'label': 'Book Risk',          'group': 'Insurance', 'gateway_action': 'insurance-tools___book_risk',          'sensitive': False, 'pillar': 'Gateway'},
    'evolve_book':        {'label': 'Evolve Book',        'group': 'Insurance', 'gateway_action': 'insurance-tools___evolve_book',        'sensitive': False, 'pillar': 'Gateway'},
    'cat_model_run':      {'label': 'Cat Model Run',      'group': 'Insurance', 'gateway_action': 'insurance-tools___cat_model_run',      'sensitive': False, 'pillar': 'Gateway'},
    'fraud_signal':       {'label': 'Fraud Signal',       'group': 'Insurance', 'gateway_action': 'insurance-tools___fraud_signal',       'sensitive': True,  'pillar': 'Gateway'},
    'credit_score':       {'label': 'Credit Score',       'group': 'Banking',   'gateway_action': 'banking-tools___credit_score',         'sensitive': True,  'pillar': 'Gateway'},
    'loan_price':         {'label': 'Loan Price',         'group': 'Banking',   'gateway_action': 'banking-tools___loan_price',           'sensitive': False, 'pillar': 'Gateway'},
    'portfolio_risk_scan':{'label': 'Portfolio Risk Scan','group': 'Banking',   'gateway_action': 'banking-tools___portfolio_risk_scan',  'sensitive': False, 'pillar': 'Gateway'},
    'stress_test':        {'label': 'Stress Test',        'group': 'Banking',   'gateway_action': 'banking-tools___stress_test',          'sensitive': False, 'pillar': 'Gateway'},
    'covenant_check':     {'label': 'Covenant Check',     'group': 'Banking',   'gateway_action': 'banking-tools___covenant_check',       'sensitive': False, 'pillar': 'Gateway'},
    'merchant_screen':    {'label': 'Merchant Screen',    'group': 'FinTech',   'gateway_action': 'fintech-tools___merchant_screen',      'sensitive': False, 'pillar': 'Gateway'},
    'exposure_report':    {'label': 'Exposure Report',    'group': 'FinTech',   'gateway_action': 'fintech-tools___exposure_report',      'sensitive': False, 'pillar': 'Gateway'},
    'strategy_optimize':  {'label': 'Strategy Optimize',  'group': 'FinTech',   'gateway_action': 'fintech-tools___strategy_optimize',    'sensitive': False, 'pillar': 'Gateway'},
    'fraud_scan':         {'label': 'Fraud Scan',         'group': 'FinTech',   'gateway_action': 'fintech-tools___fraud_scan',           'sensitive': True,  'pillar': 'Gateway'},
    'cohort_ltv':         {'label': 'Cohort LTV',         'group': 'FinTech',   'gateway_action': 'fintech-tools___cohort_ltv',           'sensitive': False, 'pillar': 'Gateway'},
}

# ─────────────────────────────────────────────────────────────────────────────
# DESK CATALOG — the four verticals. A user's desk grant gates which persona they may
# operate (enforced in the runtime; the persona is chosen at login today).
# ─────────────────────────────────────────────────────────────────────────────
DESK_CATALOG = {
    'capital_markets': {'label': 'Capital Markets (Fixed Income)', 'firm': 'AgentCore in a Box'},
    'insurance':       {'label': 'Insurance Underwriting',         'firm': 'Ridgeline Mutual'},
    'banking':         {'label': 'Commercial Banking / Credit',    'firm': 'Rampart Financial'},
    'fintech':         {'label': 'FinTech Payments / Risk',        'firm': 'Kairo'},
}

# ─────────────────────────────────────────────────────────────────────────────
# AGENT CATALOG — the per-desk SPECIALISTS a user may be granted to invoke, keyed by the
# globally-unique COMPOUND id "<persona_id>::<roster_key>". This MIRRORS the rosters in
# personas.py / persona_*.py (the same static-mirror discipline as TOOL_CATALOG). The
# structural nodes — every desk's `orchestrator` (Lead Coordinator, the entry point) and
# `committee` (the sink that writes the verdict) — are intentionally OMITTED: they are never
# revocable, because dropping them would break the swarm entry-point or the graph fan-in to
# the sink (see personas.prune_roster). `sensitive` flags specialists whose access should
# require a justification to request (execution / controls / fraud surfaces).
#
# `desk` is the persona id; `key` is the within-desk roster key; `label` is the display name.
# agent_key(desk, roster_key) builds the compound id; split_agent_key reverses it.
# ─────────────────────────────────────────────────────────────────────────────
AGENT_CATALOG = {
    # Capital Markets (Meridian) — roster in personas.py _CAPITAL_MARKETS_ROSTER
    'capital_markets::universe':    {'desk': 'capital_markets', 'key': 'universe',    'label': 'Universe & Data',          'sensitive': False},
    'capital_markets::research':    {'desk': 'capital_markets', 'key': 'research',    'label': 'Credit Research',          'sensitive': False},
    'capital_markets::analytics':   {'desk': 'capital_markets', 'key': 'analytics',   'label': 'Risk & Quant',             'sensitive': False},
    'capital_markets::compliance':  {'desk': 'capital_markets', 'key': 'compliance',  'label': 'Compliance & Controls',    'sensitive': True},
    'capital_markets::trading':     {'desk': 'capital_markets', 'key': 'trading',     'label': 'Portfolio & Execution',    'sensitive': True},
    'capital_markets::macro':       {'desk': 'capital_markets', 'key': 'macro',       'label': 'Macro & Rates',            'sensitive': False},
    'capital_markets::esg':         {'desk': 'capital_markets', 'key': 'esg',         'label': 'ESG & Sustainability',     'sensitive': False},
    'capital_markets::attribution': {'desk': 'capital_markets', 'key': 'attribution', 'label': 'Performance Attribution',  'sensitive': False},
    'capital_markets::liquidity':   {'desk': 'capital_markets', 'key': 'liquidity',   'label': 'Liquidity & Microstructure','sensitive': False},

    # Insurance (Ridgeline Mutual) — persona_insurance.py _ROSTER
    'insurance::intake':        {'desk': 'insurance', 'key': 'intake',        'label': 'Submission Intake',        'sensitive': False},
    'insurance::research':      {'desk': 'insurance', 'key': 'research',      'label': 'Risk Research',            'sensitive': False},
    'insurance::pricing':       {'desk': 'insurance', 'key': 'pricing',       'label': 'Pricing & Actuarial',      'sensitive': False},
    'insurance::compliance':    {'desk': 'insurance', 'key': 'compliance',    'label': 'Compliance & Controls',    'sensitive': True},
    'insurance::binding':       {'desk': 'insurance', 'key': 'binding',       'label': 'Bind & Policy Admin',      'sensitive': True},
    'insurance::catmodel':      {'desk': 'insurance', 'key': 'catmodel',      'label': 'Catastrophe & Climate',    'sensitive': False},
    'insurance::reinsurance':   {'desk': 'insurance', 'key': 'reinsurance',   'label': 'Reinsurance & Ceded',      'sensitive': False},
    'insurance::profitability': {'desk': 'insurance', 'key': 'profitability', 'label': 'Profitability Analysis',   'sensitive': False},
    'insurance::fraud':         {'desk': 'insurance', 'key': 'fraud',         'label': 'Fraud & Claims Integrity', 'sensitive': True},

    # Commercial Banking (Rampart) — persona_banking.py _ROSTER
    'banking::borrower':     {'desk': 'banking', 'key': 'borrower',     'label': 'Borrower Intelligence',    'sensitive': False},
    'banking::underwriting': {'desk': 'banking', 'key': 'underwriting', 'label': 'Credit Analysis',          'sensitive': False},
    'banking::pricing':      {'desk': 'banking', 'key': 'pricing',      'label': 'Pricing & Structuring',    'sensitive': False},
    'banking::controls':     {'desk': 'banking', 'key': 'controls',     'label': 'Financial Crime & Controls','sensitive': True},
    'banking::relationship': {'desk': 'banking', 'key': 'relationship', 'label': 'Relationship & Servicing', 'sensitive': False},
    'banking::macro':        {'desk': 'banking', 'key': 'macro',        'label': 'Rates & Macro',            'sensitive': False},
    'banking::portfolio':    {'desk': 'banking', 'key': 'portfolio',    'label': 'Portfolio Risk',           'sensitive': False},
    'banking::monitoring':   {'desk': 'banking', 'key': 'monitoring',   'label': 'Covenant & Monitoring',    'sensitive': False},
    'banking::fraud':        {'desk': 'banking', 'key': 'fraud',        'label': 'Fraud & Adverse Media',    'sensitive': True},

    # FinTech (Kairo) — persona_fintech.py _ROSTER
    'fintech::universe':    {'desk': 'fintech', 'key': 'universe',    'label': 'Portfolio & Data',         'sensitive': False},
    'fintech::research':    {'desk': 'fintech', 'key': 'research',    'label': 'Risk Intelligence',        'sensitive': False},
    'fintech::analytics':   {'desk': 'fintech', 'key': 'analytics',   'label': 'Risk & Modeling',          'sensitive': False},
    'fintech::compliance':  {'desk': 'fintech', 'key': 'compliance',  'label': 'Compliance & Controls',    'sensitive': True},
    'fintech::trading':     {'desk': 'fintech', 'key': 'trading',     'label': 'Account Actions & Execution','sensitive': True},
    'fintech::macro':       {'desk': 'fintech', 'key': 'macro',       'label': 'Network & Macro',          'sensitive': False},
    'fintech::esg':         {'desk': 'fintech', 'key': 'esg',         'label': 'Fraud & Trust',            'sensitive': True},
    'fintech::attribution': {'desk': 'fintech', 'key': 'attribution', 'label': 'Growth & Unit Economics',  'sensitive': False},
    'fintech::liquidity':   {'desk': 'fintech', 'key': 'liquidity',   'label': 'Settlement & Liquidity',   'sensitive': False},
}

# The structural roster keys present in every desk that are NEVER revocable (entry + sink).
# Kept as a set so personas.revocable_agents / prune_roster and the catalog stay in agreement.
STRUCTURAL_AGENT_KEYS = frozenset({'orchestrator', 'committee'})


def agent_key(desk, roster_key):
    """The globally-unique compound entitlement key for a specialist."""
    return f'{desk}::{roster_key}'


def split_agent_key(compound):
    """('<desk>', '<roster_key>') from a compound agent key; ('', compound) if malformed."""
    if '::' in (compound or ''):
        desk, key = compound.split('::', 1)
        return desk, key
    return '', compound


def agents_for_desk(desk):
    """The compound agent keys belonging to a desk, in catalog order (revocable specialists only)."""
    return [k for k, spec in AGENT_CATALOG.items() if spec.get('desk') == desk]

# ─────────────────────────────────────────────────────────────────────────────
# CREDENTIAL-PROVIDER CATALOG — the OUTBOUND credentials the AGENT workload may vend
# via the token vault. This is the "agent" half of "grant/revoke to users AND agents":
# the admin controls which downstream credential providers each agent workload can
# obtain. Enforced by the runtime pre-check AND by IAM least-privilege on the exec role.
# The `provider_env` names the deploy.sh-populated provider name env var so the admin-api
# and runtime can resolve the concrete provider without hardcoding per-env suffixes.
#
# `secret_vault` is the AgentCore-Identity Secrets Manager sub-namespace where this
# provider's backing secret lives — 'oauth2' for OAuth2 providers (3LO + M2M), 'apikey'
# for API-key-vault providers. The concrete secret is named
#   bedrock-agentcore-identity!default/<secret_vault>/<provider-name>-<hash>
# so <secret_vault>/<provider-name> is a stable ARN PREFIX. The runtime role's
# `secretsmanager:GetSecretValue` on that namespace is LOAD-BEARING for the vend (the SDK
# reads the secret to mint/fetch the token), which is exactly why a scoped explicit DENY on
# that prefix is a real IAM kill-switch: revoke a cred → deny the secret → the vend fails at
# the AWS control plane even if every line of runtime code were bypassed. See
# lambda/admin-api/iam_creds.py (the agent-side analogue of cedar.py's tool blocklist).
# ─────────────────────────────────────────────────────────────────────────────
CRED_CATALOG = {
    'grades_3lo':  {'label': 'Portfolio API (3LO delegated)', 'flow': 'USER_FEDERATION', 'provider_env': 'CREDENTIAL_PROVIDER_NAME', 'secret_vault': 'oauth2', 'tools': ['positions_view', 'trade_execute']},
    'market_m2m':  {'label': 'Market Data (M2M client-creds)', 'flow': 'M2M',            'provider_env': 'M2M_PROVIDER_NAME',        'secret_vault': 'oauth2', 'tools': ['market_data']},
    'fred_apikey': {'label': 'FRED (API-key vault)',           'flow': 'API_KEY',        'provider_env': 'FRED_APIKEY_PROVIDER_NAME','secret_vault': 'apikey', 'tools': ['macro_indicator']},
}

# ─────────────────────────────────────────────────────────────────────────────
# RATE-LIMIT POLICY — per-user, per-application, and per-tool request quotas enforced at the
# Gateway REQUEST interceptor (the platform MCP boundary). This is the "rate limiting" pillar:
# a fixed-window counter in DynamoDB, keyed by three independent dimensions so a single tools/call
# is checked against ALL of them and denied if ANY is over its cap. Fixed-window (not token-bucket)
# is deliberate — it needs only one atomic DynamoDB ADD per call and a TTL to self-expire, so it
# adds ~one round-trip and no background sweeper. Limits are data (here), enforcement is in
# lambda/gateway-interceptor (so the SAME single-sourced catalog file carries the policy).
#
# `count` = max tools/call requests allowed within `window_seconds`. A dimension with no entry (or
# count<=0) is UNLIMITED. Per-tool overrides let a cheap tool run hot while an expensive/sensitive
# one is throttled hard. Tunable per deploy via the RATE_LIMITS_JSON env override (see the
# interceptor), so a demo can dial the caps down to trigger a throttle live without a code change.
# ─────────────────────────────────────────────────────────────────────────────
RATE_LIMIT_WINDOW_SECONDS = 60  # the fixed window all three dimensions share

RATE_LIMITS = {
    # Per authenticated USER (across every tool): a broad abuse ceiling.
    'per_user': {'count': 60, 'window_seconds': RATE_LIMIT_WINDOW_SECONDS},
    # Per calling APPLICATION (the JWT client_id — SPA vs. an external MCP client vs. a service
    # principal). Lets the platform cap a whole app/integration independent of the human.
    'per_app': {'count': 120, 'window_seconds': RATE_LIMIT_WINDOW_SECONDS},
    # Per (USER, TOOL): the default per-tool cap, with sensitive/expensive tools overridden below.
    'per_tool_default': {'count': 30, 'window_seconds': RATE_LIMIT_WINDOW_SECONDS},
    'per_tool': {
        # Sensitive / expensive tools get a tighter per-user-per-tool cap — the compelling
        # "throttle the risky action, not the cheap lookup" story.
        'trade_execute':  {'count': 5,  'window_seconds': RATE_LIMIT_WINDOW_SECONDS},
        'secure_vault':   {'count': 10, 'window_seconds': RATE_LIMIT_WINDOW_SECONDS},
        'query_holdings': {'count': 20, 'window_seconds': RATE_LIMIT_WINDOW_SECONDS},
    },
}


def rate_limit_for(dimension, tool=None):
    """The {count, window_seconds} limit for a rate-limit dimension, or None (unlimited).
    dimension ∈ {'per_user','per_app','per_tool'}; `tool` selects the per-tool override."""
    if dimension == 'per_tool':
        spec = RATE_LIMITS.get('per_tool', {}).get(tool) or RATE_LIMITS.get('per_tool_default')
    else:
        spec = RATE_LIMITS.get(dimension)
    if not spec or int(spec.get('count', 0)) <= 0:
        return None
    return {'count': int(spec['count']), 'window_seconds': int(spec.get('window_seconds', RATE_LIMIT_WINDOW_SECONDS))}


# The admin group whose members bypass all gating and may call the admin-api.
ADMIN_GROUP = 'admins'

# Sort keys used in the entitlements table.
DT_META, DT_TOOLS, DT_DESKS, DT_CREDS, DT_AGENTS = 'meta', 'tools', 'desks', 'creds', 'agents'

# The user-facing (self-service requestable) grant dimensions, in display order. `creds` is
# AGENT-scoped (admin-only), so it is deliberately excluded from the requestable set.
REQUESTABLE_KINDS = (DT_DESKS, DT_AGENTS, DT_TOOLS)


def user_pk(sub):
    return f'user#{sub}'


def agent_pk(name):
    return f'agent#{name}'


def is_admin(groups):
    """True if the caller's cognito:groups claim contains the admins group.
    `groups` may be a list, a JSON-ish string, or a comma/space-separated string."""
    if not groups:
        return False
    if isinstance(groups, str):
        # Cognito sends cognito:groups as a JSON array in the token, but some decoders
        # surface it as a string like "[admins]" or "admins,pm". Normalize.
        groups = groups.strip().strip('[]').replace('"', '')
        groups = [g.strip() for g in groups.replace(',', ' ').split()]
    try:
        return ADMIN_GROUP in set(groups)
    except TypeError:
        return False


# Map a grant dimension → its catalog, in one place so evaluate/allows/default_grants_for agree.
_CATALOG_BY_KIND = {DT_TOOLS: TOOL_CATALOG, DT_DESKS: DESK_CATALOG, DT_CREDS: CRED_CATALOG, DT_AGENTS: AGENT_CATALOG}


def _grants_map(items_by_dt, dt):
    """Extract the {key: bool} grants map for a given dataType from a dict of items."""
    item = items_by_dt.get(dt) or {}
    g = item.get('grants') or {}
    # DynamoDB may hand back Decimals/strings for bools depending on the marshaller; coerce.
    return {k: bool(v) for k, v in g.items()}


def _expiries_map(items_by_dt, dt):
    """Extract the {key: epoch_seconds} expiries map for a dataType. Keys ABSENT here are
    STANDING grants (never lapse). DynamoDB hands numbers back as Decimal → coerce to float."""
    item = items_by_dt.get(dt) or {}
    x = item.get('expiries') or {}
    out = {}
    for k, v in x.items():
        try:
            out[k] = float(v)
        except (TypeError, ValueError):
            continue  # unparseable expiry → treat as no expiry (standing) rather than lapse-now
    return out


def _live_grants(grants, expiries, now):
    """The effective {k: bool} for a dimension: a key is live iff granted-true AND not past its
    expiry. Expired keys collapse to False so `allows` denies them with no extra bookkeeping —
    this is the LAZY expiry that makes a lapsed grant deny on the caller's very next turn."""
    live = {}
    for k, granted in grants.items():
        if not granted:
            live[k] = False
            continue
        exp = expiries.get(k)
        live[k] = True if (exp is None or exp > now) else False
    return live


def evaluate(items_by_dt, now=None):
    """Reduce a principal's raw DynamoDB items (keyed by dataType) into an effective, EXPIRY-AWARE
    entitlement view. `items_by_dt` = { 'meta': {...}, 'tools': {...}, 'agents': {...}, ... }.

    Returns a dict:
      { managed, agents_managed,
        tools:{k:bool}, desks:{k:bool}, creds:{k:bool}, agents:{k:bool},
        expiries: { tools:{k:epoch}, desks:{...}, creds:{...}, agents:{...} } }

    - `managed` is False when the principal has NO governing records (fail-open / unmanaged). It
      is computed from meta/tools/desks/creds ONLY (NOT agents), so the NEW agents dimension can
      never retroactively lock a principal's tools/desks.
    - `agents_managed` is True only when an explicit `agents` item exists — the agents dimension
      is fail-OPEN until an admin first scopes it, so deploying this feature doesn't strip every
      specialist from a user who was managed before it existed.
    - the four dim maps already have expired keys collapsed to False (lazy expiry).
    - `expiries` carries only FUTURE (still-live) expiries, for UI countdowns."""
    now = time.time() if now is None else now
    managed = bool(items_by_dt.get(DT_META)) or any(
        items_by_dt.get(dt) for dt in (DT_TOOLS, DT_DESKS, DT_CREDS)
    )
    agents_managed = bool(items_by_dt.get(DT_AGENTS))
    out = {'managed': managed, 'agents_managed': agents_managed, 'expiries': {}}
    for dt in (DT_TOOLS, DT_DESKS, DT_CREDS, DT_AGENTS):
        grants = _grants_map(items_by_dt, dt)
        expiries = _expiries_map(items_by_dt, dt)
        out[dt] = _live_grants(grants, expiries, now)
        # Surface only still-live expiries whose key is actually granted (UI countdowns).
        out['expiries'][dt] = {k: e for k, e in expiries.items() if e > now and grants.get(k)}
    return out


def allows(effective, kind, key):
    """The core decision function used by every enforcement point.

    effective : output of evaluate()  (dim maps already expiry-collapsed)
    kind      : 'tools' | 'desks' | 'creds' | 'agents'
    key       : the tool name / desk id / cred id / compound agent key

    Rule: an UNMANAGED principal allows everything (fail-open, pre-seed safety); a MANAGED
    principal allows ONLY keys explicitly granted true (default-deny). The AGENTS dimension has
    its OWN managed flag (`agents_managed`) so it stays fail-open until an admin first scopes it.
    Unknown catalog keys are always allowed (never gate something we don't model)."""
    if kind == DT_AGENTS:
        if not effective.get('agents_managed'):
            return True  # agents dimension not yet scoped for this principal → fail-open
        if key not in AGENT_CATALOG:
            return True  # structural node (orchestrator/committee) or unknown → never gate
        return bool(effective.get(DT_AGENTS, {}).get(key, False))
    if not effective.get('managed'):
        return True
    catalog = _CATALOG_BY_KIND.get(kind, {})
    if key not in catalog:
        return True  # we don't model this key → never our place to deny it
    return bool(effective.get(kind, {}).get(key, False))


def blocked_agents(effective, persona_id):
    """The set of within-desk roster keys the principal may NOT invoke on `persona_id`, given an
    effective view. Structural nodes are never blocked. Used by the runtime to prune the roster
    and to deny handoffs. Returns SHORT roster keys (not compound), since that is what the
    engines key on. Empty set when the agents dimension is unmanaged (fail-open)."""
    blocked = set()
    if not effective.get('agents_managed'):
        return blocked
    for compound, spec in AGENT_CATALOG.items():
        if spec.get('desk') != persona_id:
            continue
        if not allows(effective, DT_AGENTS, compound):
            blocked.add(spec['key'])
    return blocked


def default_grants_for(kind, all_true=True):
    """A full grants map for a catalog dimension — used by deploy.sh seeding and the
    admin 'grant all' action. all_true=True → everything granted (the default seed so the
    demo starts fully functional and the admin then REVOKES to show enforcement)."""
    catalog = _CATALOG_BY_KIND[kind]
    return {k: bool(all_true) for k in catalog}


def tools_for_creds(effective):
    """Given an effective view, return the set of TOOL names that are transitively blocked
    because their backing credential provider is revoked (agent-side outbound gating). Used
    by the runtime so revoking e.g. 'market_m2m' also blocks the 'market_data' tool."""
    blocked = set()
    for cid, spec in CRED_CATALOG.items():
        if not allows(effective, 'creds', cid):
            blocked.update(spec.get('tools', []))
    return blocked


# ─────────────────────────────────────────────────────────────────────────────
# Catalog shape helpers — used by the governance-graph read model (GET /admin/graph)
# to build the intermediate "tool group" lane so a 30-tool graph stays legible.
# Pure/deterministic (stable order = first appearance in TOOL_CATALOG).
# ─────────────────────────────────────────────────────────────────────────────
def tool_groups():
    """The distinct TOOL_CATALOG groups, in stable first-seen order (the graph renders one
    collapsed 'group' node per entry, expandable to its member tools)."""
    seen, out = set(), []
    for spec in TOOL_CATALOG.values():
        g = spec.get('group', '')
        if g and g not in seen:
            seen.add(g)
            out.append(g)
    return out


def tools_in_group(group):
    """The tool names belonging to a group, in catalog order."""
    return [name for name, spec in TOOL_CATALOG.items() if spec.get('group') == group]


# The four verticals map to their per-desk tool groups so the graph can draw the
# structural desk → tool-group edges. A group NOT listed here (shared platform groups
# like 'Identity / Gateway', 'Compute') is available to every desk.
DESK_TOOL_GROUPS = {
    'capital_markets': ['Capital Markets'],
    'insurance':       ['Insurance'],
    'banking':         ['Banking'],
    'fintech':         ['FinTech'],
}

# Groups every desk can reach (not vertical-specific) — the shared AgentCore platform surface.
SHARED_TOOL_GROUPS = [
    'Identity / Gateway', 'Gateway', 'Identity 3LO', 'Identity M2M',
    'Identity vault', 'Compute',
]


def groups_for_desk(desk):
    """Tool groups reachable from a desk = its vertical group(s) + the shared platform groups.
    Used for the graph's structural desk → group edges."""
    return list(DESK_TOOL_GROUPS.get(desk, [])) + list(SHARED_TOOL_GROUPS)
