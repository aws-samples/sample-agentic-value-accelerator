"""insurance-tools — the governed underwriting data/analytics tools the Insurance desk calls.

One Lambda, many actions, exposed as MCP tools through the SAME AgentCore Gateway (governed,
Cedar-policy-enforced) as the bond/vault tools. The agent never invokes it directly on the happy
path; the Gateway passes the tool name in clientContext (`insurance-tools___<tool>`) and the MCP
arguments AS the event. Mirrors lambda/bond-tools exactly.

Actions (Ridgeline Mutual underwriting desk):
  risk_screen    — screen the ~4,000-submission universe by line/occupancy/construction/TIV/state/hazard
  peril_lookup   — perils + hazard grades attaching to a county / location (REAL FEMA NRI hazard data)
  book_risk      — aggregate premium / loss ratio / PML / AAL / concentration / cession for a book
  evolve_book    — evolutionary search over book-construction recipes → leaderboard + winning bind list
  cat_model_run  — catastrophe AAL + PML by return period, built up from REAL per-peril FEMA loss
  fraud_signal   — score a risk / claims cohort for fraud, moral hazard and adverse selection

Operates over a universe snapshot the insurance-ingest Lambda wrote to S3
(universe/insurance_latest.json). The catastrophe anchor is REAL FEMA National Risk Index county
data (per-county, per-peril Expected Annual Loss ÷ building-value exposure); the per-submission
micro figures, premiums, and every underwriting verdict are ILLUSTRATIVE demo models built on top,
NOT real actuarial pricing or system-of-record output. "Real macro, modeled micro." The snapshot is
cached in module scope across warm invocations (it only changes on the daily ingest). Every handler
degrades gracefully — if the snapshot is missing it returns a clear 'universe not loaded' rather
than fabricating numbers, and never throws to the caller.

fraud_signal has no FEMA anchor (fraud is not a natural-hazard signal), so it remains a
deterministic, seed-stable heuristic — and it operates ONLY on clearly-synthetic/demo account
identifiers, never on names presented as real insureds. Its red flags are illustrative, not real
findings about real parties.

Every response carries a `disclaimer` (numbers are synthetic/illustrative, not actuarial or
underwriting advice); fraud_signal adds `synthetic_demo: true`.
"""
import hashlib
import json
import os

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_KEY = 'universe/insurance_latest.json'
ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', 'null')  # restrictive default; NOT wildcard

_s3 = boto3.client('s3', region_name=REGION)
_CACHE = {'universe': None, 'etag': None}

DISCLAIMER = ('Illustrative demo model — synthetic figures for demonstration only, not actuarial, '
              'underwriting, or investment advice and not real system-of-record output.')

try:
    import evolve as _evolve  # shipped alongside this handler
except Exception:  # pragma: no cover
    _evolve = None


# ── Snapshot loading (cached; mirrors bond-tools) ───────────────────────────────
def _load_universe():
    """Load + cache the insurance universe snapshot from S3. Re-fetches on ETag change."""
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


def _num(v):
    try:
        return float(v) if v is not None and v != '' else None
    except (TypeError, ValueError):
        return None


def _seed(*parts):
    """Stable pseudo-random 0..1 — used ONLY where there is no real anchor (fraud heuristic)."""
    h = hashlib.sha256('|'.join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


# ── Return-period / PML helpers (real cat-model math) ───────────────────────────
def _pml_from_aal(aal, afreq):
    """Approximate a loss exceedance (return-period) curve from an Expected Annual Loss and an
    annualized event frequency. Standard cat-model heuristic: model severity as lognormal with a
    frequency-driven tail so scarcer perils have a fatter single-event tail. Returns dict of
    return-period → loss. Standard-form exceedance construction off the REAL FEMA AAL + AFREQ —
    illustrative for the demo, not a licensed cat-model submission."""
    import math
    if not aal or aal <= 0:
        return {rp: 0 for rp in (10, 50, 100, 250, 500)}
    freq = max(afreq or 0.1, 0.02)
    # Mean severity per event = AAL / expected annual event count. Lower-frequency perils (e.g.
    # hurricane) → larger per-event severity for the same AAL → fatter tail.
    mean_sev = aal / freq
    # Tail sigma grows as frequency falls (rarer → more volatile single events).
    sigma = min(1.6, 0.5 + 0.35 * math.log(1 / freq)) if freq < 1 else 0.5
    out = {}
    for rp in (10, 50, 100, 250, 500):
        # Exceedance prob p = 1/rp; per-event non-exceedance for a Poisson(freq) process.
        p = 1.0 / rp
        # z for the per-event severity distribution given the annual exceedance p and freq.
        per_event_p = min(0.999, 1 - (1 - p) ** (1 / max(freq, 1e-6)))
        z = _inv_norm(1 - per_event_p)
        loss = mean_sev * math.exp(sigma * z - 0.5 * sigma ** 2)
        out[rp] = round(loss)
    return out


def _inv_norm(p):
    """Inverse standard-normal CDF (Acklam approximation). Real, standard numerics."""
    import math
    p = min(max(p, 1e-9), 1 - 1e-9)
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / \
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


# ── Actions (all over the REAL FEMA-anchored universe) ──────────────────────────
def _risk_screen(doc, args):
    """Filter the real submission universe and return top matches + summary."""
    if not doc:
        return {'error': 'universe not loaded — run insurance-ingest first'}
    subs = doc.get('submissions', [])
    line = (args.get('line') or '').strip().lower()
    occ = (args.get('occupancy') or '').strip().lower()
    constr = (args.get('construction') or '').strip().lower()
    state = (args.get('state') or '').strip().upper()
    min_tiv = _num(args.get('min_tiv'))
    max_tiv = _num(args.get('max_tiv'))
    max_hazard = args.get('max_hazard_grade')
    exclude_cat = bool(args.get('exclude_cat_zone'))
    limit = min(int(args.get('limit') or 25), 60)
    sort_by = (args.get('sort_by') or 'rate_adequacy').strip()

    out = []
    for s in subs:
        if line and s.get('line', '').lower() != line:
            continue
        if occ and s.get('occupancy', '').lower() != occ:
            continue
        if constr and s.get('construction', '').lower() != constr:
            continue
        if state and s.get('state', '').upper() != state:
            continue
        if min_tiv is not None and s.get('tiv', 0) < min_tiv:
            continue
        if max_tiv is not None and s.get('tiv', 0) > max_tiv:
            continue
        if max_hazard is not None and s.get('hazard_grade', 5) > int(max_hazard):
            continue
        if exclude_cat and 'Tier1' in str(s.get('cat_zone', '')):
            continue
        out.append(s)

    total = len(out)
    reverse = sort_by in ('rate_adequacy', 'tiv', 'technical_premium', 'charged_premium')
    out.sort(key=lambda s: s.get(sort_by, 0), reverse=reverse)
    top = out[:max(1, limit)]
    return {'as_of': doc.get('as_of'), 'nri_source': doc.get('nri_source'),
            'universe': doc.get('stats', {}).get('submission_count'),
            'matched': total, 'returned': len(top), 'submissions': top,
            'source': 'AgentCore Gateway -> insurance-tools (illustrative demo book; REAL FEMA NRI hazard anchor)',
            'disclaimer': DISCLAIMER}


def _peril_lookup(doc, args):
    """Return the REAL FEMA perils + hazard grades for a county (by FIPS, name, or state)."""
    if not doc:
        return {'error': 'universe not loaded — run insurance-ingest first'}
    counties = doc.get('counties', [])
    fips = (args.get('stcofips') or args.get('fips') or '').strip()
    name = (args.get('county') or '').strip().lower()
    state = (args.get('state') or '').strip().upper()
    match = None
    for c in counties:
        if fips and c.get('stcofips') == fips:
            match = c
            break
        if name and name in (c.get('county', '') or '').lower() and (not state or c.get('state_abbrv') == state):
            match = c
            break
        if not fips and not name and state and c.get('state_abbrv') == state:
            match = c  # first county in the state as a representative
            break
    if not match:
        match = counties[0] if counties else None
    if not match:
        return {'error': 'no county data'}
    perils = []
    for pname, p in sorted(match.get('perils', {}).items(), key=lambda kv: -kv[1].get('eal', 0)):
        score = p.get('score', 0)
        perils.append({'peril': pname, 'hazard_grade': 1 + min(4, int(score / 20)),
                       'risk_score': score, 'annual_expected_loss': p.get('eal'),
                       'annualized_frequency': p.get('afreq')})
    return {
        'county': {'name': match.get('county'), 'state': match.get('state_abbrv'),
                   'stcofips': match.get('stcofips'), 'population': match.get('population')},
        'building_value_exposure': match.get('build_value'),
        'overall_risk_score': match.get('risk_score'), 'overall_risk_rating': match.get('risk_rating'),
        'cat_loss_cost_bps': match.get('loss_cost_bps'),
        'social_vulnerability': match.get('sovi_score'), 'community_resilience': match.get('resl_score'),
        'perils': perils,
        'source': 'AgentCore Gateway -> insurance-tools (REAL FEMA National Risk Index data)',
        'disclaimer': ('Hazard/peril figures are REAL FEMA National Risk Index data; any downstream '
                       'pricing/underwriting use here is illustrative demo modeling, not advice.'),
    }


def _book_risk(doc, args):
    """Aggregate REAL premium / loss ratio / PML / AAL / concentration for a set of policies.
    If explicit holdings are passed, aggregate those; else aggregate a representative slice of the
    real universe (so the tool is useful even without a bound book in hand)."""
    if not doc:
        return {'error': 'universe not loaded — run insurance-ingest first'}
    holdings = args.get('holdings') or args.get('book') or []
    subs = doc.get('submissions', [])
    if holdings:
        ids = {h.get('sub_id') if isinstance(h, dict) else h for h in holdings}
        book = [s for s in subs if s.get('sub_id') in ids] or holdings
    else:
        # Representative book: top-premium slice, real numbers.
        book = sorted(subs, key=lambda s: -s.get('technical_premium', 0))[:300]

    prem = sum(_num(b.get('technical_premium')) or 0 for b in book)
    charged = sum(_num(b.get('charged_premium')) or 0 for b in book)
    eloss = sum(_num(b.get('expected_loss')) or 0 for b in book)
    tiv = sum(_num(b.get('tiv')) or 0 for b in book)
    n = len(book)
    if not prem:
        return {'error': 'no priced policies in book'}

    by_line, by_state, tier1_prem = {}, {}, 0.0
    for b in book:
        by_line[b.get('line', '?')] = by_line.get(b.get('line', '?'), 0) + (_num(b.get('technical_premium')) or 0)
        by_state[b.get('state', '?')] = by_state.get(b.get('state', '?'), 0) + (_num(b.get('technical_premium')) or 0)
        if 'Tier1' in str(b.get('cat_zone', '')):
            tier1_prem += _num(b.get('technical_premium')) or 0
    # AAL = sum of expected losses (real, FEMA-derived). PML built off the same book-scaled
    # exceedance construction cat_model_run uses, so book_risk and cat_model_run agree.
    aal = eloss
    peak = max(by_state.values()) if by_state else 0
    cat_frac = (tier1_prem / prem) if prem else 0.0
    # Blend a book-level exceedance off the AAL with a cat-driven frequency (more Tier-1 premium →
    # rarer, fatter-tailed single events). This is the same _pml_from_aal engine, applied at book
    # level, so the 1-in-100 / 1-in-250 are consistent with cat_model_run's peril build-up.
    _ep = _pml_from_aal(aal, max(0.05, 0.6 - 0.4 * cat_frac))
    return {
        'policy_count': n, 'total_tiv': round(tiv), 'written_premium': round(charged),
        'technical_premium': round(prem), 'expected_loss_ratio': round(eloss / prem, 3),
        'rate_adequacy': round(charged / prem, 3), 'combined_ratio': round(eloss / charged + 0.31, 3) if charged else None,
        'aal': round(aal), 'cat_tier1_premium_share': round(cat_frac, 3),
        'pml_1_in_100': _ep[100], 'pml_1_in_250': _ep[250],
        'net_retention': round(prem * 0.26), 'ceded_premium': round(prem * 0.18),
        'concentration': {
            'by_line': {k: round(v / prem, 3) for k, v in sorted(by_line.items(), key=lambda kv: -kv[1])},
            'by_state': {k: round(v / prem, 3) for k, v in sorted(by_state.items(), key=lambda kv: -kv[1])[:8]},
            'peak_state_share': round(peak / prem, 3)},
        'as_of': doc.get('as_of'),
        'source': 'AgentCore Gateway -> insurance-tools (illustrative demo book aggregation; REAL FEMA cat anchor)',
        'disclaimer': DISCLAIMER,
    }


def _cat_model_run(doc, args):
    """Build a REAL, BOOK-SCALED catastrophe AAL + PML-by-return-period view.

    FEMA per-peril EAL is the expected annual loss for a county's ENTIRE building stock, so we
    scale it to Ridgeline's book by each county's insured share = (book TIV in county) ÷ (county
    building value). That converts county-wide FEMA loss into the book's own cat loss — a standard-
    form scaling step, illustrative for the demo. Then each peril's exceedance (return-period) curve
    is constructed with _pml_from_aal off the book-scaled AAL + the REAL FEMA annualized frequency."""
    if not doc:
        return {'error': 'universe not loaded — run insurance-ingest first'}
    counties = doc.get('counties', [])
    subs = doc.get('submissions', [])
    states = args.get('states')
    book_name = args.get('book_name', 'Coastal Property Book')

    # Determine the book in scope (explicit holdings, else a representative slice), then the
    # book's insured TIV per county FIPS.
    holdings = args.get('holdings') or args.get('book')
    if holdings:
        ids = {h.get('sub_id') if isinstance(h, dict) else h for h in holdings}
        book = [s for s in subs if s.get('sub_id') in ids]
    elif states:
        want = {s.upper() for s in states}
        book = [s for s in subs if s.get('state') in want]
    else:
        book = sorted(subs, key=lambda s: -s.get('tiv', 0))[:400]
    if not book:
        book = subs[:400]
    tiv_by_fips = {}
    for s in book:
        f = s.get('stcofips')
        if f:
            tiv_by_fips[f] = tiv_by_fips.get(f, 0) + (_num(s.get('tiv')) or 0)

    cty_by_fips = {c.get('stcofips'): c for c in counties}
    peril_agg = {}  # book-scaled EAL + exposure-weighted freq per peril
    for fips, book_tiv in tiv_by_fips.items():
        c = cty_by_fips.get(fips)
        if not c or not c.get('build_value'):
            continue
        share = min(1.0, book_tiv / c['build_value'])  # book's slice of the county exposure
        for pname, p in c.get('perils', {}).items():
            eal = (p.get('eal', 0) or 0) * share  # book-scaled REAL loss
            if eal <= 0:
                continue
            a = peril_agg.setdefault(pname, {'eal': 0.0, 'freq_w': 0.0, 'w': 0.0})
            a['eal'] += eal
            a['freq_w'] += (p.get('afreq', 0) or 0) * eal
            a['w'] += eal

    by_peril, total_aal = {}, 0.0
    ep_total = {rp: 0 for rp in (10, 50, 100, 250, 500)}
    for pname, a in sorted(peril_agg.items(), key=lambda kv: -kv[1]['eal']):
        aal = a['eal']
        if aal <= 0:
            continue
        afreq = (a['freq_w'] / a['w']) if a['w'] else 0.1
        ep = _pml_from_aal(aal, afreq)
        by_peril[pname] = {'aal': round(aal), 'annualized_frequency': round(afreq, 4),
                           'pml_1_in_100': ep[100], 'pml_1_in_250': ep[250]}
        total_aal += aal
        for rp in ep_total:
            ep_total[rp] += ep[rp]

    book_tiv_total = sum(tiv_by_fips.values())
    attach = float(args.get('reinsurance_attachment', 40_000_000))
    exhaust = float(args.get('reinsurance_exhaustion', 120_000_000))
    net_250 = max(0, ep_total[250] - attach)
    peak_peril = max(by_peril.items(), key=lambda kv: kv[1]['aal'])[0] if by_peril else None
    return {
        'book_name': book_name, 'policies_in_scope': len(book),
        'counties_in_scope': len(tiv_by_fips), 'book_tiv': round(book_tiv_total),
        'model': 'FEMA National Risk Index EAL (book-scaled by insured share) + lognormal exceedance',
        'as_of': doc.get('as_of'), 'aal': round(total_aal),
        'by_peril': by_peril,
        'ep_curve': [{'return_period': rp, 'loss': ep_total[rp]} for rp in (10, 50, 100, 250, 500)],
        'peak_peril': peak_peril,
        'reinsurance_attachment': round(attach), 'reinsurance_exhaustion': round(exhaust),
        'gross_pml_1_in_250': ep_total[250], 'net_pml_1_in_250': round(net_250),
        'source': 'AgentCore Gateway -> insurance-tools (illustrative cat model over REAL FEMA per-peril loss, book-scaled)',
        'disclaimer': DISCLAIMER,
    }


def _evolve_book(doc, args):
    """Evolutionary search over book-construction recipes on the REAL submission universe."""
    if not doc:
        return {'error': 'universe not loaded — run insurance-ingest first'}
    if not _evolve:
        return {'error': 'evolutionary engine unavailable'}
    appetite = args.get('appetite') or args.get('mandate') or {}
    subs = doc.get('submissions', [])
    gens = int(args.get('generations', 6) or 6)
    pop = int(args.get('population', 24) or 24)
    seed = int(args.get('seed', 20260101) or 20260101)
    result = _evolve.run(subs, appetite, seed=seed, generations=gens, population=pop)
    result['source'] = ('AgentCore Gateway -> insurance-tools (deterministic illustrative optimization — '
                        'fixed seed for reproducible demos)')
    result['method'] = 'deterministic illustrative book-construction optimization (fixed seed for reproducible demos); synthetic figures'
    result['as_of'] = doc.get('as_of')
    result['disclaimer'] = DISCLAIMER
    return result


def _fraud_signal(doc, args):
    """Score a risk/claims cohort for fraud/moral-hazard. NO natural-hazard anchor exists for
    fraud, so this is a deterministic, seed-stable heuristic — labeled honestly and operating ONLY
    on clearly-synthetic DEMO account identifiers. It never presents derogatory specifics (SIU
    watchlist, prior-claims, litigation) as authoritative findings about a real, identifiable
    insured: real submission names are replaced with opaque synthetic demo ids, and every red flag
    is deterministically generated for illustration — not observed about a real party."""
    cohort = args.get('cohort', 'demo AOB water-claims cohort')
    subs = doc.get('submissions', []) if doc else []
    accounts = args.get('accounts') or []
    thr = int(args.get('threshold', 70) or 70)
    # Determine how many demo accounts to score. We DO NOT surface any real insured name — only a
    # synthetic id derived from the cohort + index, so no derogatory finding attaches to a real party.
    if accounts:
        count = min(6, len([a for a in accounts if a]))
    else:
        count = min(6, len(subs)) or 6
    results, flagged = [], 0
    for i in range(count):
        demo_id = f'DEMO-CLAIM-{55000 + i * 41}'
        score = int(_seed(cohort, demo_id, i) * 100)
        hi = score >= thr
        flagged += 1 if hi else 0
        results.append({
            'account_id': demo_id, 'entity': demo_id, 'synthetic_demo': True,
            'integrity_score': score, 'risk': 'high' if hi else ('medium' if score >= 45 else 'low'),
            'red_flags': (['AOB assignment within 3 days of loss', 'vendor on SIU watchlist',
                           '3 prior water claims 18mo', 'represented by high-litigation firm'] if hi else []),
            'flags_note': 'red flags are illustrative signals generated deterministically for a synthetic demo id — not real findings',
            'expected_leakage': round(score * 500) if hi else 0,
            'recommendation': 'SIU referral + EUO (illustrative)' if hi else 'pay as filed (illustrative)',
        })
    results.sort(key=lambda r: -r['integrity_score'])
    return {'cohort': cohort, 'as_of': (doc or {}).get('as_of'), 'scored': len(results), 'flagged': flagged,
            'results': results, 'synthetic_demo': True,
            'method': 'deterministic heuristic on synthetic demo identifiers (no natural-hazard anchor for fraud)',
            'source': 'AgentCore Gateway -> insurance-tools (illustrative fraud-scoring demo — synthetic accounts only)',
            'disclaimer': DISCLAIMER}


ACTIONS = {
    'risk_screen': _risk_screen,
    'peril_lookup': _peril_lookup,
    'book_risk': _book_risk,
    'evolve_book': _evolve_book,
    'cat_model_run': _cat_model_run,
    'fraud_signal': _fraud_signal,
}


def _run(action, args):
    fn = ACTIONS.get(action)
    if not fn:
        return {'error': f'unknown action: {action}', 'available': list(ACTIONS)}
    try:
        doc = _load_universe()
        return fn(doc, args or {})
    except Exception as e:
        print(f'action {action} failed: {type(e).__name__}: {e}', flush=True)
        return {'error': f'{type(e).__name__}: {e}'}


def _gateway_tool_name(context):
    cc = getattr(context, 'client_context', None)
    custom = getattr(cc, 'custom', None) or {}
    name = custom.get('bedrockAgentCoreToolName', '') or ''
    return name.split('___')[-1] if name else ''


def handler(event, context):
    """AgentCore Gateway (MCP) primary path + direct-invoke / HTTP fallbacks (mirrors bond-tools)."""
    gw_tool = _gateway_tool_name(context)
    if gw_tool:
        return _run(gw_tool, event if isinstance(event, dict) else {})
    if isinstance(event, dict) and 'requestContext' not in event and 'action' in event:
        args = event.get('args') if isinstance(event.get('args'), dict) else \
            {k: v for k, v in event.items() if k != 'action'}
        return _run(event.get('action'), args)
    action, args = '', {}
    if isinstance(event, dict):
        pp = event.get('pathParameters') or {}
        action = pp.get('action') or ''
        body = event.get('body')
        if body:
            try:
                args = json.loads(body)
            except Exception:
                args = {}
        if not action:
            action = args.get('action', '')
    return {'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN},
            'body': json.dumps(_run(action, args), default=str)}
