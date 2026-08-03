"""banking-tools — the governed commercial-credit data/analytics tools the Banking desk calls.

One Lambda, many actions, exposed as MCP tools through the SAME AgentCore Gateway (governed,
Cedar-policy-enforced) as the vault/user-data tools. Mirrors lambda/bond-tools: the Gateway passes
the tool name in clientContext (`banking-tools___<tool>`) and the MCP arguments AS the event.

Actions (Rampart Financial credit desk):
  credit_score        — internal PD / credit grade / score band for a borrower
  loan_price          — risk-based APR, spread over index, fees, expected NIM, RAROC for a facility
  portfolio_risk_scan — loan-book concentration, weighted PD/LGD, expected loss, NPL, CECL coverage
  covenant_check      — test a facility against its covenant package (DSCR/leverage/LTV/liquidity)
  stress_test         — macro stress scenarios (rate shock / recession / CRE downturn) over a book

Operates over a universe snapshot the banking-ingest Lambda wrote to S3
(universe/banking_latest.json). The macro anchors are REAL FRED data (the live Treasury curve +
SOFR/prime for pricing/cost of funds, and the Fed commercial-bank credit-performance series —
business-loan delinquency, charge-off, CRE delinquency, unemployment); the per-borrower micro
figures and every credit verdict are ILLUSTRATIVE demo models built on top, NOT real credit
decisions or system-of-record output. "Real macro, modeled micro." Snapshot cached in module scope
across warm invocations. Every handler degrades gracefully — returns 'universe not loaded' rather
than fabricating numbers if the snapshot is missing, and never throws to the caller.

Every response carries a `disclaimer` (numbers are synthetic/illustrative, not investment or credit
advice) and, where a missing business input was defaulted, an `assumptions` list disclosing it.
"""
import json
import os

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_KEY = 'universe/banking_latest.json'
ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', 'null')  # restrictive default; NOT wildcard

_s3 = boto3.client('s3', region_name=REGION)
_CACHE = {'universe': None, 'etag': None}

GRADES = ['1 / AAA', '2 / AA', '3 / A', '4 / BBB', '5 / BB+', '6 / BB', '7 / B', '8 / CCC']

DISCLAIMER = ('Illustrative demo model — synthetic figures for demonstration only, not investment '
              'or credit advice and not real system-of-record output.')

# ── Illustrative assumptions (demo constants, NOT authoritative market/regulatory parameters) ──
CECL_COVERAGE_MULT = 1.35   # illustrative CECL reserve-over-expected-loss coverage multiplier
DEFAULT_EBITDA = 4_100_000  # ad-hoc borrower fallback when EBITDA not supplied (illustrative)
DEFAULT_TOTAL_DEBT = 14_000_000  # ad-hoc borrower fallback when total debt not supplied (illustrative)
DEFAULT_LOAN_AMOUNT = 5_000_000  # facility size fallback (illustrative)
DEFAULT_TENOR_MONTHS = 60        # facility tenor fallback (illustrative)
DEFAULT_GRADE = '6 / BB'         # facility grade fallback (illustrative)
DEFAULT_DSCR, DEFAULT_LEVERAGE, DEFAULT_LTV, DEFAULT_LIQUIDITY = 1.18, 3.4, 0.71, 1_250_000  # covenant fallbacks


def _load_universe():
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


def _interp_curve(curve_points, months):
    pts = sorted((p['months'], p['yield']) for p in curve_points)
    if not pts:
        return 4.3
    if months <= pts[0][0]:
        return pts[0][1]
    if months >= pts[-1][0]:
        return pts[-1][1]
    for (m0, y0), (m1, y1) in zip(pts, pts[1:]):
        if m0 <= months <= m1:
            w = (months - m0) / (m1 - m0)
            return y0 + w * (y1 - y0)
    return pts[-1][1]


def _find_borrower(doc, name):
    """Find a borrower in the real universe by (fuzzy) name, else None."""
    if not name:
        return None
    nl = name.strip().lower()
    for b in doc.get('borrowers', []):
        if nl in (b.get('borrower', '') or '').lower():
            return b
    return None


# ── Actions (over the REAL FRED-anchored universe) ──────────────────────────────
def _credit_score(doc, args):
    """Internal PD / grade / score band. If the borrower is in the real book, return its
    REAL-anchored figures; else compute from supplied financials against the REAL industry base."""
    if not doc:
        return {'error': 'universe not loaded — run banking-ingest first'}
    credit = doc.get('rates', {}).get('credit_performance', {})
    borrower = args.get('borrower', '')
    match = _find_borrower(doc, borrower)
    if match:
        return {
            'borrower': match['borrower'], 'segment': match['segment'], 'sector': match['sector'],
            'pd_1yr': match['pd_1yr'], 'lgd': match['lgd'], 'expected_loss_rate': match['expected_loss_rate'],
            'internal_grade': match['internal_grade'],
            'score_band': 'Acceptable — Pass' if match['grade_num'] <= 6 else 'Watch — Substandard',
            'leverage_debt_ebitda': match['leverage'], 'dscr': match['dscr'],
            'drivers': [f"Debt/EBITDA {match['leverage']}x", f"sector {match['sector']}",
                        f"industry delinquency base {credit.get('business_delinquency')}% (FRED)"],
            'benchmark': {'industry_delinquency_pct': credit.get('business_delinquency'),
                          'industry_chargeoff_pct': credit.get('business_chargeoff')},
            'recommendation': 'Pass with standard monitoring' if match['grade_num'] <= 6 else 'Refer to committee',
            'source': 'AgentCore Gateway -> banking-tools (illustrative demo model; PD/LGD modeled, macro base from REAL FRED)',
            'disclaimer': DISCLAIMER,
        }
    # Ad-hoc borrower: compute PD off the REAL industry base + supplied leverage.
    base = (credit.get('business_delinquency', 1.34) or 1.34) / 100.0
    assumptions = []
    ebitda = _num(args.get('ebitda'))
    if ebitda is None:
        ebitda = DEFAULT_EBITDA
        assumptions.append(f'ebitda not provided; assumed ${DEFAULT_EBITDA:,.0f} for illustration')
    debt = _num(args.get('total_debt'))
    if debt is None:
        debt = DEFAULT_TOTAL_DEBT
        assumptions.append(f'total_debt not provided; assumed ${DEFAULT_TOTAL_DEBT:,.0f} for illustration')
    lev = round(debt / ebitda, 1) if ebitda else 3.4
    lev_adj = 1 + max(0, lev - 3.0) * 0.35
    pd = min(0.35, base * lev_adj)
    gi = min(len(GRADES) - 1, int(pd / 0.045))
    co = (credit.get('business_chargeoff', 0.59) or 0.59) / 100.0
    lgd = min(0.75, max(0.25, co / max(base, 1e-4)))
    return {
        'borrower': borrower or 'ad-hoc borrower', 'segment': args.get('segment', 'commercial'),
        'pd_1yr': round(pd, 4), 'lgd': round(lgd, 3), 'expected_loss_rate': round(pd * lgd, 4),
        'internal_grade': GRADES[gi], 'score_band': 'Acceptable — Pass' if gi <= 5 else 'Watch — Substandard',
        'leverage_debt_ebitda': lev,
        'drivers': [f'Debt/EBITDA {lev}x', f'industry delinquency base {credit.get("business_delinquency")}% (FRED)'],
        'benchmark': {'industry_delinquency_pct': credit.get('business_delinquency'),
                      'industry_chargeoff_pct': credit.get('business_chargeoff')},
        'recommendation': 'Pass with standard monitoring' if gi <= 5 else 'Refer to committee with conditions',
        'assumptions': assumptions,
        'source': 'AgentCore Gateway -> banking-tools (illustrative demo model; PD modeled from supplied leverage + REAL FRED industry base)',
        'disclaimer': DISCLAIMER,
    }


def _loan_price(doc, args):
    """Price a facility off the REAL live curve + SOFR/prime with a grade-driven risk spread."""
    if not doc:
        return {'error': 'universe not loaded — run banking-ingest first'}
    rates = doc.get('rates', {})
    idx = rates.get('indices', {})
    curve = rates.get('curve', [])
    assumptions = []
    amount = _num(args.get('amount'))
    if amount is None:
        amount = DEFAULT_LOAN_AMOUNT
        assumptions.append(f'amount not provided; assumed ${DEFAULT_LOAN_AMOUNT:,.0f} for illustration')
    if args.get('tenor_months') in (None, ''):
        tenor = DEFAULT_TENOR_MONTHS
        assumptions.append(f'tenor_months not provided; assumed {DEFAULT_TENOR_MONTHS} for illustration')
    else:
        tenor = int(args.get('tenor_months') or DEFAULT_TENOR_MONTHS)
    if not args.get('grade'):
        grade = DEFAULT_GRADE
        assumptions.append(f"grade not provided; assumed '{DEFAULT_GRADE}' for illustration")
    else:
        grade = args.get('grade')
    index_name = (args.get('index') or 'sofr').lower()
    index_rate = (idx.get(index_name, idx.get('sofr', 3.64))) / 100.0
    try:
        gi = int(str(grade).split('/')[0].strip()) - 1
    except (ValueError, IndexError):
        gi = 5
    gi = max(0, min(7, gi))
    # Expected loss from grade (real PD/LGD scale), spread built from it.
    pd = 0.003 + gi * 0.006
    lgd = 0.35 + gi * 0.03
    el = pd * lgd
    base_curve = _interp_curve(curve, tenor) / 100.0
    spread_bps = int((0.010 + gi * 0.004 + el * 1.6) * 10000)
    apr = round(index_rate + spread_bps / 10000, 4)
    cof = round(base_curve + 0.006, 4)
    nim = round(apr - cof - el, 4)
    # RAROC = risk-adjusted return / economic capital (capital ~ 8% × EAD × grade factor).
    cap_ratio = 0.08 * (1 + gi * 0.12)
    raroc = round((nim * amount) / max(cap_ratio * amount, 1), 3)
    return {
        'amount': amount, 'tenor_months': tenor, 'grade': grade, 'index': index_name,
        'index_rate': round(index_rate, 4), 'risk_spread_bps': spread_bps, 'all_in_apr': apr,
        'origination_fee_bps': 75, 'commitment_fee_bps': 25, 'cost_of_funds': cof,
        'expected_loss_rate': round(el, 4), 'net_interest_margin': nim, 'raroc': raroc,
        'clears_hurdle': raroc >= 0.15, 'hurdle': 0.15,
        'curve_source': rates.get('curve_source'), 'as_of': doc.get('as_of'),
        'assumptions': assumptions,
        'source': 'AgentCore Gateway -> banking-tools (illustrative pricing model over REAL live curve + SOFR/prime)',
        'disclaimer': DISCLAIMER,
    }


def _portfolio_risk_scan(doc, args):
    """Aggregate the REAL loan book: concentration, weighted PD/LGD, expected loss, CECL."""
    if not doc:
        return {'error': 'universe not loaded — run banking-ingest first'}
    borrowers = doc.get('borrowers', [])
    book = args.get('book') or 'Commercial & Industrial Book'
    proposed = args.get('proposed_facility')
    # Filter to a named segment/sector if asked, else the whole book.
    seg = (args.get('segment') or '').lower()
    scope = [b for b in borrowers if not seg or seg in (b.get('segment', '') + ' ' + b.get('sector', '')).lower()]
    if not scope:
        scope = borrowers
    out = sum(b['facility_amount'] for b in scope)
    if not out:
        return {'error': 'no facilities in scope'}
    wpd = sum(b['pd_1yr'] * b['facility_amount'] for b in scope) / out
    wlgd = sum(b['lgd'] * b['facility_amount'] for b in scope) / out
    el = sum(b['pd_1yr'] * b['lgd'] * b['facility_amount'] for b in scope)
    # Concentrations by sector / state / grade.
    def conc(key):
        d = {}
        for b in scope:
            d[b.get(key, '?')] = d.get(b.get(key, '?'), 0) + b['facility_amount']
        return sorted(({'name': k, 'pct': round(v / out, 3), 'outstanding': round(v)} for k, v in d.items()),
                      key=lambda x: -x['pct'])
    sector_c = conc('sector')
    herf = sum((c['pct']) ** 2 for c in sector_c)
    npl = sum(b['facility_amount'] for b in scope if b['pd_1yr'] > 0.08) / out  # >8% PD ~ nonperforming proxy
    credit = doc.get('rates', {}).get('credit_performance', {})
    return {
        'book': book, 'outstanding': round(out), 'facility_count': len(scope),
        'weighted_pd': round(wpd, 4), 'weighted_lgd': round(wlgd, 3), 'expected_loss': round(el),
        'expected_loss_rate_bps': round(el / out * 10000, 1), 'npl_ratio': round(npl, 3),
        'cecl_reserve': round(el * CECL_COVERAGE_MULT),
        'cecl_coverage_ratio': round((el * CECL_COVERAGE_MULT) / max(el, 1), 2),
        'cecl_coverage_multiple': CECL_COVERAGE_MULT,  # illustrative assumption, not a firm's actual CECL model
        'top_concentrations': {'by_sector': sector_c[:5], 'by_state': conc('state')[:5],
                               'by_grade': conc('internal_grade')[:8]},
        'herfindahl': round(herf, 4),
        'industry_benchmark': {'business_delinquency_pct': credit.get('business_delinquency'),
                               'business_chargeoff_pct': credit.get('business_chargeoff')},
        'marginal_effect': ({'note': 'proposed facility would be added to the largest sector concentration',
                             'largest_sector': sector_c[0]['name'],
                             'new_pct_est': round(sector_c[0]['pct'] + (_num((proposed or {}).get('amount')) or 5e6) / out, 3)}
                            if proposed else None),
        'as_of': doc.get('as_of'),
        'source': 'AgentCore Gateway -> banking-tools (illustrative demo book; modeled micro, REAL FRED macro benchmark)',
        'disclaimer': DISCLAIMER,
    }


def _covenant_check(doc, args):
    """Test a facility against its covenant package. Uses the borrower's REAL book figures where
    available (DSCR/leverage/LTV), else supplied values."""
    borrower = args.get('borrower', '')
    match = _find_borrower(doc, borrower) if doc else None
    assumptions = []
    dscr = _num(args.get('dscr'))
    if dscr is None:
        dscr = match['dscr'] if match else DEFAULT_DSCR
        if not match:
            assumptions.append(f'dscr not provided; assumed {DEFAULT_DSCR} for illustration')
    lev = _num(args.get('leverage'))
    if lev is None:
        lev = match['leverage'] if match else DEFAULT_LEVERAGE
        if not match:
            assumptions.append(f'leverage not provided; assumed {DEFAULT_LEVERAGE} for illustration')
    ltv = _num(args.get('ltv'))
    if ltv is None:
        ltv = match['ltv'] if match else DEFAULT_LTV
        if not match:
            assumptions.append(f'ltv not provided; assumed {DEFAULT_LTV} for illustration')
    liq = _num(args.get('liquidity'))
    if liq is None:
        liq = DEFAULT_LIQUIDITY
        assumptions.append(f'liquidity not provided; assumed ${DEFAULT_LIQUIDITY:,.0f} for illustration')
    covs = [
        {'name': 'Min DSCR', 'threshold': 1.25, 'actual': round(dscr, 2),
         'status': 'BREACH' if dscr < 1.25 else ('TIGHT' if dscr < 1.35 else 'OK'), 'headroom': round(dscr - 1.25, 2)},
        {'name': 'Max Leverage (Debt/EBITDA)', 'threshold': 4.0, 'actual': round(lev, 1),
         'status': 'BREACH' if lev > 4.0 else ('TIGHT' if lev > 3.7 else 'OK'), 'headroom': round(4.0 - lev, 2)},
        {'name': 'Max LTV', 'threshold': 0.75, 'actual': round(ltv, 2),
         'status': 'BREACH' if ltv > 0.75 else ('TIGHT' if ltv > 0.72 else 'OK'), 'headroom': round(0.75 - ltv, 2)},
        {'name': 'Min Liquidity', 'threshold': 500000, 'actual': round(liq),
         'status': 'BREACH' if liq < 500000 else 'OK', 'headroom': round(liq - 500000)},
    ]
    breached = any(c['status'] == 'BREACH' for c in covs)
    return {
        'borrower': (match['borrower'] if match else borrower) or 'facility',
        'facility_id': (match['borrower_id'] if match else args.get('facility_id', 'CI-2029-0417')),
        'covenants': covs,
        'overall': 'BREACH' if breached else ('TIGHT' if any(c['status'] == 'TIGHT' for c in covs) else 'OK'),
        'recommended_action': ('DSCR/leverage breach — issue reservation-of-rights, request cure plan, '
                               'consider covenant reset or step-up pricing' if breached else
                               'Within covenants — standard monitoring'),
        'assumptions': assumptions,
        'source': 'AgentCore Gateway -> banking-tools (illustrative covenant test vs modeled borrower figures)',
        'disclaimer': DISCLAIMER,
    }


def _stress_test(doc, args):
    """Run macro stress over the REAL book. Loss multipliers are calibrated to the REAL current
    industry delinquency/charge-off + unemployment, so the stressed loss builds on today's base."""
    if not doc:
        return {'error': 'universe not loaded — run banking-ingest first'}
    borrowers = doc.get('borrowers', [])
    credit = doc.get('rates', {}).get('credit_performance', {})
    book = args.get('book', 'Commercial & Industrial Book')
    scenario = args.get('scenario', 'severely_adverse')
    out = sum(b['facility_amount'] for b in borrowers) or 1
    base_el = sum(b['pd_1yr'] * b['lgd'] * b['facility_amount'] for b in borrowers)
    # Multipliers grounded in how far each scenario pushes delinquency above today's REAL level.
    cur_delinq = credit.get('business_delinquency', 1.34)
    cur_unemp = credit.get('unemployment', 4.2)
    scenarios = {
        'rate_shock_200bps': {'delinq_to': cur_delinq * 1.7, 'unemp_to': cur_unemp + 0.8},
        'recession': {'delinq_to': max(4.5, cur_delinq * 2.6), 'unemp_to': cur_unemp + 3.0},
        'cre_downturn': {'delinq_to': max(5.5, cur_delinq * 3.0), 'unemp_to': cur_unemp + 1.5},
        'severely_adverse': {'delinq_to': max(6.5, cur_delinq * 3.6), 'unemp_to': 10.0},
    }
    sc = scenarios.get(scenario, scenarios['recession'])
    mult = sc['delinq_to'] / max(cur_delinq, 0.1)               # PD scales with delinquency ratio
    stressed_el = base_el * mult
    # CET1 walk: start ~11.5%, drawn down by stressed losses over the horizon vs a capital base.
    cet1_start = 0.115
    cet1_trough = round(cet1_start - (stressed_el - base_el) / (out * 1.4), 4)
    # Loss drivers = the two largest stressed-loss sectors.
    by_sector = {}
    for b in borrowers:
        by_sector[b['sector']] = by_sector.get(b['sector'], 0) + b['pd_1yr'] * b['lgd'] * b['facility_amount'] * mult
    top = sorted(by_sector.items(), key=lambda kv: -kv[1])[:3]
    return {
        'book': book, 'scenario': scenario, 'horizon_quarters': int(args.get('horizon_quarters', 9) or 9),
        'assumptions': {'current_delinquency_pct': cur_delinq, 'stressed_delinquency_pct': round(sc['delinq_to'], 2),
                        'current_unemployment_pct': cur_unemp, 'stressed_unemployment_pct': sc['unemp_to'],
                        'source': 'FRED (Fed commercial-bank delinquency + unemployment)'},
        'baseline_expected_loss': round(base_el), 'stressed_expected_loss': round(stressed_el),
        'loss_rate_bps': round(stressed_el / out * 10000, 1), 'pd_stress_multiple': round(mult, 2),
        'cet1_start': cet1_start, 'cet1_trough': cet1_trough, 'cet1_buffer_ok': cet1_trough > 0.07,
        'top_loss_drivers': [{'sector': s, 'stressed_loss': round(v), 'share': round(v / stressed_el, 3)} for s, v in top],
        'verdict': (f'Passes — CET1 holds at {cet1_trough:.1%} above the 7% minimum'
                    if cet1_trough > 0.07 else
                    f'FAILS — CET1 trough {cet1_trough:.1%} breaches the 7% minimum; de-risk and raise reserves'),
        'as_of': doc.get('as_of'),
        'source': 'AgentCore Gateway -> banking-tools (illustrative stress model calibrated to REAL FRED series; not a CCAR/regulatory submission)',
        'disclaimer': DISCLAIMER,
    }


ACTIONS = {
    'credit_score': _credit_score,
    'loan_price': _loan_price,
    'portfolio_risk_scan': _portfolio_risk_scan,
    'covenant_check': _covenant_check,
    'stress_test': _stress_test,
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
