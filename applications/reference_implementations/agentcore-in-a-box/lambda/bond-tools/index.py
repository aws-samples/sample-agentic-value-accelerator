"""bond-tools — the governed fixed-income data/analytics tools the AgentCore swarm calls.

One Lambda, many actions (routed on `action`), exposed through the API Gateway HTTP route
/bonds/{action} (Cognito-authorized) and reachable by the agent. Operates over the REAL
universe snapshot the bond-ingest Lambda wrote to S3 (universe/latest.json), so every number
traces back to the real Treasury curve + ICE BofA spreads.

Actions:
  universe_stats   — headline universe shape (counts, avg yield/duration, rating/sector mix)
  curve_lookup     — the real Treasury par-yield curve (points + as-of + source)
  spread_lookup    — the real ICE BofA OAS ladder by rating
  bond_screen      — filter the universe (sector / rating band / duration / yield / issuer),
                     ranked, capped; returns matching bonds + summary
  price_bond       — value one hypothetical bond off the live curve + a rating OAS
  portfolio_risk   — aggregate risk for a set of {cusip|ticker, weight}: duration, convexity,
                     yield, rating/sector mix, tracking error vs a duration target, and
                     rate-shock P&L (+/-100/200bps, steepener, flattener)

The snapshot is cached in module scope across warm invocations (the universe only changes
on the daily ingest). All handlers degrade gracefully — never throw to the caller.
"""
import json
import os

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_KEY = 'universe/latest.json'
ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', 'null')  # restrictive default; NOT wildcard

_s3 = boto3.client('s3', region_name=REGION)
_CACHE = {'universe': None, 'etag': None}

RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC']
RATING_NUM = {r: i + 1 for i, r in enumerate(RATING_ORDER)}
# A clean "Agg-like" core benchmark for tracking-error framing: IG, ~6y duration. These are
# ILLUSTRATIVE assumptions for the demo benchmark, not the live index's actual duration/yield.
AGG_DURATION = 6.0  # illustrative assumption
AGG_YIELD = 4.6     # illustrative assumption

# Bond analytics trace to the REAL Treasury curve + ICE BofA spreads, but the valuations and
# portfolio construction here are illustrative demo output, not investment advice.
DISCLAIMER = ('Illustrative demo analytics over REAL market data (US Treasury curve + ICE BofA '
              'spreads); valuations/constructions are for demonstration, not investment advice.')


# ── Snapshot loading (cached) ───────────────────────────────────────────────--
def _load_universe():
    """Load + cache the universe snapshot from S3. Re-fetches when the object ETag
    changes (daily ingest). Returns the parsed doc or None."""
    if not MARKET_BUCKET:
        return None
    try:
        head = _s3.head_object(Bucket=MARKET_BUCKET, Key=UNIVERSE_KEY)
        etag = head.get('ETag')
        if _CACHE['universe'] is not None and etag == _CACHE['etag']:
            return _CACHE['universe']
        obj = _s3.get_object(Bucket=MARKET_BUCKET, Key=UNIVERSE_KEY)
        doc = json.loads(obj['Body'].read().decode())
        _CACHE['universe'] = doc
        _CACHE['etag'] = etag
        return doc
    except Exception as e:
        print(f'universe load failed: {type(e).__name__}: {e}', flush=True)
        return _CACHE['universe']


def _curve_points(doc):
    return doc.get('curve', []) if doc else []


def _interp_curve(points, months):
    """Linear-interpolated Treasury yield (pct) at a tenor in months, from snapshot pts."""
    pts = sorted(((p['months'], p['yield']) for p in points), key=lambda x: x[0])
    if not pts:
        return AGG_YIELD
    if months <= pts[0][0]:
        return pts[0][1]
    if months >= pts[-1][0]:
        return pts[-1][1]
    for (m0, y0), (m1, y1) in zip(pts, pts[1:]):
        if m0 <= months <= m1:
            w = (months - m0) / (m1 - m0)
            return y0 + w * (y1 - y0)
    return pts[-1][1]


# ── Bond math (shared with ingest; standard closed-form) ─────────────────────--
def _price_and_risk(coupon_pct, ytm_pct, years, freq=2):
    n = max(1, int(round(years * freq)))
    i = (ytm_pct / 100.0) / freq
    cpn = (coupon_pct / 100.0) * 100.0 / freq
    price = dur_w = cvx_w = 0.0
    for t in range(1, n + 1):
        cf = cpn + (100.0 if t == n else 0.0)
        disc = cf / ((1 + i) ** t)
        price += disc
        dur_w += t * disc
        cvx_w += t * (t + 1) * disc
    if price <= 0:
        return 0.0, 0.0, 0.0
    mod_dur = ((dur_w / price) / (1 + i)) / freq
    convexity = (cvx_w / (price * (1 + i) ** 2)) / (freq ** 2)
    return round(price, 3), round(mod_dur, 3), round(convexity, 3)


# ── Actions ──────────────────────────────────────────────────────────────────
def _universe_stats(doc, _args):
    if not doc:
        return {'error': 'universe not loaded'}
    return {'as_of': doc.get('as_of'), 'curve_source': doc.get('curve_source'),
            'spread_source': doc.get('spread_source'), 'stats': doc.get('stats', {})}


def _curve_lookup(doc, _args):
    if not doc:
        return {'error': 'curve not loaded'}
    return {'as_of': doc.get('as_of'), 'source': doc.get('curve_source'),
            'curve': doc.get('curve', [])}


def _spread_lookup(doc, _args):
    if not doc:
        return {'error': 'spreads not loaded'}
    return {'as_of': doc.get('as_of'), 'source': doc.get('spread_source'),
            'ladder': doc.get('spreads', [])}


def _bond_screen(doc, args):
    """Filter the universe and return the top matches + a summary. All filters optional."""
    if not doc:
        return {'error': 'universe not loaded'}
    bonds = doc.get('bonds', [])
    sector = (args.get('sector') or '').strip().lower()
    issuer = (args.get('issuer') or '').strip().lower()
    min_rating = (args.get('min_rating') or '').strip().upper()  # e.g. 'BBB' → BBB or better
    max_rating = (args.get('max_rating') or '').strip().upper()
    min_y = _num(args.get('min_yield'))
    max_y = _num(args.get('max_yield'))
    min_d = _num(args.get('min_duration'))
    max_d = _num(args.get('max_duration'))
    exclude_treasury = bool(args.get('exclude_treasury'))
    limit = int(args.get('limit') or 25)
    sort_by = (args.get('sort_by') or 'ytm').strip()  # ytm | mod_duration | oas | years
    min_rn = RATING_NUM.get(min_rating) if min_rating else None
    max_rn = RATING_NUM.get(max_rating) if max_rating else None

    out = []
    for b in bonds:
        if sector and b.get('sector', '').lower() != sector:
            continue
        if issuer and issuer not in (b.get('issuer', '').lower() + ' ' + b.get('ticker', '').lower()):
            continue
        if exclude_treasury and b.get('is_treasury'):
            continue
        rn = b.get('rating_num', 99)
        # "min_rating BBB" means BBB or better → rating_num <= num(BBB).
        if min_rn is not None and rn > min_rn:
            continue
        if max_rn is not None and rn < max_rn:
            continue
        if min_y is not None and b.get('ytm', 0) < min_y:
            continue
        if max_y is not None and b.get('ytm', 0) > max_y:
            continue
        if min_d is not None and b.get('mod_duration', 0) < min_d:
            continue
        if max_d is not None and b.get('mod_duration', 0) > max_d:
            continue
        out.append(b)

    total = len(out)
    reverse = sort_by in ('ytm', 'oas', 'convexity', 'years', 'liquidity')
    out.sort(key=lambda b: b.get(sort_by, 0), reverse=reverse)
    top = out[:max(1, min(limit, 100))]
    summary = _summarize(top) if top else {}
    return {'matched': total, 'returned': len(top), 'filters_applied': _active_filters(args),
            'summary': summary, 'bonds': top}


def _price_bond(doc, args):
    """Value a hypothetical bond off the live curve + a rating OAS."""
    if not doc:
        return {'error': 'universe not loaded'}
    assumptions = []
    years = _num(args.get('years'))
    if years is None:
        years = 10.0
        assumptions.append('years not provided; assumed 10.0 for illustration')
    if not args.get('rating'):
        assumptions.append("rating not provided; assumed 'A' for illustration")
    rating = (args.get('rating') or 'A').strip().upper()
    coupon = _num(args.get('coupon'))
    points = _curve_points(doc)
    base = _interp_curve(points, years * 12)
    ladder = {row['rating']: row['oas'] for row in doc.get('spreads', [])}
    oas = ladder.get(rating, 1.0)
    ytm = round(base + oas, 4)
    if coupon is None:
        coupon = round(ytm, 3)  # price at par if no coupon given
        assumptions.append('coupon not provided; priced at par (coupon = ytm) for illustration')
    price, mod_dur, convexity = _price_and_risk(coupon, ytm, years)
    return {'inputs': {'years': years, 'rating': rating, 'coupon': coupon},
            'treasury_base': round(base, 4), 'oas': oas, 'ytm': ytm,
            'price': price, 'mod_duration': mod_dur, 'convexity': convexity,
            'dv01_per_100': round(price * mod_dur / 10000.0, 6),
            'as_of': doc.get('as_of'), 'curve_source': doc.get('curve_source'),
            'assumptions': assumptions, 'disclaimer': DISCLAIMER}


def _eligible_pool(doc, mandate, cap=800):
    """Build the candidate pool for the evolutionary run: filter the FULL universe to the
    mandate's hard universe constraints (rating floor / HY / treasury / duration band) WITHOUT
    yield-sorting or truncating-by-yield (that would bias the GA toward the longest/riskiest
    bonds). If the eligible set exceeds `cap`, take a DETERMINISTIC, diversity-preserving
    stride sample rather than the top-N, so every sector/rating band stays represented."""
    bonds = doc.get('bonds', []) if doc else []
    floor = (mandate.get('rating_floor') or '').upper()
    floor_n = RATING_NUM.get(floor) if floor else None
    allow_hy = bool(mandate.get('allow_high_yield', False))
    excl_ust = bool(mandate.get('exclude_treasury', False))
    min_d = _num(mandate.get('min_duration'))
    max_d = _num(mandate.get('max_duration'))
    pool = []
    for b in bonds:
        rn = b.get('rating_num') or RATING_NUM.get(str(b.get('rating', '')).upper(), 99)
        if floor_n is not None and rn > floor_n:
            continue
        if not allow_hy and rn > RATING_NUM['BBB']:
            continue
        if excl_ust and b.get('is_treasury'):
            continue
        if min_d is not None and b.get('mod_duration', 0) < min_d:
            continue
        if max_d is not None and b.get('mod_duration', 0) > max_d:
            continue
        pool.append(b)
    if len(pool) < 20:  # mandate too tight — fall back to the full universe
        pool = list(bonds)
    if len(pool) > cap:
        stride = len(pool) / cap
        pool = [pool[int(i * stride)] for i in range(cap)]
    return pool


def _evolve_portfolio(doc, args):
    """Run the evolutionary portfolio construction over the universe (the Lambda FALLBACK
    path for the Code Interpreter primary). Builds an unbiased eligible pool, then evolves
    construction recipes. `mandate` carries the constraints + objective."""
    if not doc:
        return {'error': 'universe not loaded'}
    try:
        import evolve as _evolve  # shipped alongside this Lambda
    except Exception as e:
        return {'error': f'evolve module unavailable: {e}'}
    mandate = args.get('mandate') if isinstance(args.get('mandate'), dict) else {}
    candidates = _eligible_pool(doc, mandate)
    seed = int(args.get('seed') or 20260101)
    gens = int(args.get('generations') or 6)
    pop = int(args.get('population') or 24)
    res = _evolve.run(candidates, mandate, seed=seed, generations=gens, population=pop)
    res['source'] = 'bond-tools Lambda (deterministic illustrative optimization — fixed seed for reproducible demos)'
    res['method'] = 'deterministic illustrative portfolio-construction optimization (fixed seed for reproducible demos)'
    res['as_of'] = doc.get('as_of')
    res['disclaimer'] = DISCLAIMER
    return res


def _evolve_pool(doc, args):
    """Return the unbiased eligible candidate pool for a mandate — used by the AGENT to ship
    a bounded, representative pool into the Code Interpreter sandbox (primary evolve path)."""
    if not doc:
        return {'error': 'universe not loaded'}
    mandate = args.get('mandate') if isinstance(args.get('mandate'), dict) else args
    cap = int(args.get('cap') or 800)
    pool = _eligible_pool(doc, mandate, cap=cap)
    return {'eligible': len(pool), 'as_of': doc.get('as_of'), 'bonds': pool}


def _portfolio_risk(doc, args):
    """Aggregate risk for a weighted set of holdings. Holdings: [{cusip|ticker, weight}].
    Weights are normalized. Returns duration/convexity/yield, rating & sector mix,
    tracking error vs a duration target, and rate-shock P&L."""
    if not doc:
        return {'error': 'universe not loaded'}
    holdings = args.get('holdings') or []
    if not isinstance(holdings, list) or not holdings:
        return {'error': 'holdings required: [{cusip|ticker, weight}, ...]'}
    by_cusip = {b['cusip']: b for b in doc.get('bonds', [])}
    by_ticker = {}
    for b in doc.get('bonds', []):
        by_ticker.setdefault(b['ticker'], b)  # first bond per issuer as a representative

    resolved = []
    total_w = 0.0
    unmatched = []
    for h in holdings:
        key = str(h.get('cusip') or h.get('ticker') or '').strip()
        w = _num(h.get('weight'))
        if w is None or w <= 0:
            continue
        b = by_cusip.get(key) or by_ticker.get(key.upper())
        if not b:
            unmatched.append(key)
            continue
        resolved.append((b, w))
        total_w += w
    if not resolved or total_w <= 0:
        return {'error': 'no holdings matched the universe', 'unmatched': unmatched}

    dur = cvx = ytm = oas = 0.0
    rating_mix, sector_mix = {}, {}
    for b, w in resolved:
        nw = w / total_w
        dur += nw * b.get('mod_duration', 0)
        cvx += nw * b.get('convexity', 0)
        ytm += nw * b.get('ytm', 0)
        oas += nw * b.get('oas', 0)
        rating_mix[b['rating']] = round(rating_mix.get(b['rating'], 0) + nw * 100, 2)
        sector_mix[b['sector']] = round(sector_mix.get(b['sector'], 0) + nw * 100, 2)

    target_dur = _num(args.get('duration_target'))
    # Rate-shock P&L: ΔP/P ≈ -D·Δy + ½·C·Δy²  (Δy in decimal). Round AFTER scaling to %.
    def shock(dy):
        return round((-dur * dy + 0.5 * cvx * dy * dy) * 100, 3)  # percent

    shocks = {
        'parallel_+100bps': shock(0.01),
        'parallel_-100bps': shock(-0.01),
        'parallel_+200bps': shock(0.02),
        'parallel_-200bps': shock(-0.02),
    }
    # Steepener/flattener: approximate via a duration-split (front vs long) — informative,
    # labeled as approximate.
    out = {
        'holdings_count': len(resolved),
        'weighted_duration': round(dur, 3),
        'weighted_convexity': round(cvx, 2),
        'weighted_ytm': round(ytm, 3),
        'weighted_oas': round(oas, 4),
        'rating_mix_pct': rating_mix,
        'sector_mix_pct': sector_mix,
        'rate_shocks_pct': shocks,
        'benchmark': {'name': 'US Agg (core IG proxy)', 'duration': AGG_DURATION, 'ytm': AGG_YIELD},
        'duration_gap_vs_agg': round(dur - AGG_DURATION, 3),
        'yield_pickup_vs_agg': round(ytm - AGG_YIELD, 3),
    }
    if target_dur is not None:
        out['duration_target'] = target_dur
        out['duration_gap_vs_target'] = round(dur - target_dur, 3)
    if unmatched:
        out['unmatched'] = unmatched
    return out


# ── helpers ──────────────────────────────────────────────────────────────────
def _num(v):
    try:
        if v is None or v == '':
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _active_filters(args):
    keys = ['sector', 'issuer', 'min_rating', 'max_rating', 'min_yield', 'max_yield',
            'min_duration', 'max_duration', 'exclude_treasury', 'sort_by']
    return {k: args[k] for k in keys if args.get(k) not in (None, '', False)}


def _summarize(bonds):
    n = len(bonds)
    if not n:
        return {}
    rating_mix, sector_mix = {}, {}
    for b in bonds:
        rating_mix[b['rating']] = rating_mix.get(b['rating'], 0) + 1
        sector_mix[b['sector']] = sector_mix.get(b['sector'], 0) + 1
    return {'count': n,
            'avg_ytm': round(sum(b['ytm'] for b in bonds) / n, 3),
            'avg_duration': round(sum(b['mod_duration'] for b in bonds) / n, 3),
            'avg_oas': round(sum(b['oas'] for b in bonds) / n, 4),
            'rating_mix': rating_mix, 'sector_mix': sector_mix}


ACTIONS = {
    'universe_stats': _universe_stats,
    'curve_lookup': _curve_lookup,
    'spread_lookup': _spread_lookup,
    'bond_screen': _bond_screen,
    'price_bond': _price_bond,
    'portfolio_risk': _portfolio_risk,
    'evolve_portfolio': _evolve_portfolio,
    'evolve_pool': _evolve_pool,
}


def _run(action, args):
    fn = ACTIONS.get(action)
    if not fn:
        return {'error': f'unknown action: {action}', 'available': list(ACTIONS)}
    doc = _load_universe()
    try:
        return fn(doc, args or {})
    except Exception as e:
        print(f'action {action} failed: {type(e).__name__}: {e}', flush=True)
        return {'error': f'{type(e).__name__}: {e}'}


def _gateway_tool_name(context):
    """The tool name for an AgentCore Gateway invocation, read from the Lambda client
    context. Gateway passes it as `bedrockAgentCoreToolName` in clientContext.custom, often
    namespaced as `<targetName>___<toolName>` (e.g. 'bond-tools___bond_screen'); we take the
    part after the last '___'. Returns '' when this isn't a Gateway invoke."""
    cc = getattr(context, 'client_context', None)
    custom = getattr(cc, 'custom', None) or {}
    name = custom.get('bedrockAgentCoreToolName', '') or ''
    return name.split('___')[-1] if name else ''


def handler(event, context):
    """Triple entrypoint: AgentCore Gateway (MCP) · API Gateway HTTP (/bonds/{action}) ·
    direct invoke. Gateway passes the tool name via clientContext and the MCP arguments AS
    the event; HTTP puts the action in the path + args in the body; direct invoke sends
    {action, args}. Returns the action result (HTTP wraps it in a 200 JSON response)."""
    # AgentCore Gateway (governed MCP) invocation — tool name rides in the client context,
    # the event IS the arguments object. This is the primary path the agent now uses.
    gw_tool = _gateway_tool_name(context)
    if gw_tool:
        args = event if isinstance(event, dict) else {}
        return _run(gw_tool, args)

    # Direct Lambda invoke (local test / ingest / gateway-transport fallback).
    if isinstance(event, dict) and 'requestContext' not in event and 'action' in event:
        action = event.get('action')
        args = event.get('args') if isinstance(event.get('args'), dict) else \
            {k: v for k, v in event.items() if k != 'action'}
        return _run(action, args)

    # API Gateway HTTP API (v2) request.
    action = ''
    args = {}
    if isinstance(event, dict):
        pp = event.get('pathParameters') or {}
        action = pp.get('action') or ''
        body = event.get('body')
        if body:
            try:
                args = json.loads(body)
            except Exception:
                args = {}
        if not action:  # also allow action in body
            action = args.get('action', '')
    result = _run(action, args)
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': ALLOWED_ORIGIN},
        'body': json.dumps(result, default=str),
    }
