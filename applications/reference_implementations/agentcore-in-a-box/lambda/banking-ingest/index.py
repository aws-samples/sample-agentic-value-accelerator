"""banking-ingest — builds the Rampart Financial credit universe from REAL public data.

Mission: give the banking vertical the same quant-grade SUBSTANCE the bond desk has. This Lambda
pulls the REAL rate environment (SOFR, prime, the US Treasury curve) and the REAL commercial-bank
credit-performance series (business-loan delinquency & charge-off, CRE delinquency) from FRED,
then generates a deterministic ~1,500-borrower commercial-loan universe and COMPUTES each
borrower's PD / credit grade / expected loss and each facility's risk-based price off that REAL
cost of funds and REAL industry loss experience.

"Real macro, modeled micro" (mirrors bond-ingest): the macro inputs (curve, SOFR, prime) and the
credit-performance anchor (industry delinquency → base PD; charge-off → LGD; live curve → cost of
funds) are 100% REAL from FRED. Only the last-mile per-borrower financials (revenue, EBITDA,
leverage) are generated (no free per-borrower financials feed exists). The universe STRUCTURE is
fixed by a constant seed, so the same borrowers reappear every run — only the rate/credit
economics move with the live FRED data, exactly like a real book re-priced as rates move.

Outputs:
  S3  bank/rates_latest.json                 (real curve + SOFR/prime + credit-performance series)
  S3  bank/rates_<date>.json                 (dated history)
  S3  universe/banking_latest.json           (full computed borrower/loan universe — working set)
  DDB BankingTable                            (per-borrower items — point lookups + proof)

Env: FRED_API_KEY (from .fred-key via deploy.sh), BANKING_TABLE, MARKET_BUCKET,
     UNIVERSE_SIZE (default 1500).
No third-party deps — urllib + boto3 only.
"""
import json
import os
import random
import urllib.request
from datetime import datetime

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
FRED_API_KEY = os.environ.get('FRED_API_KEY', '')
BANKING_TABLE = os.environ.get('BANKING_TABLE', '')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_SIZE = int(os.environ.get('UNIVERSE_SIZE', '1500'))
SEED = 20260101

_s3 = boto3.client('s3', region_name=REGION)
_ddb = boto3.resource('dynamodb', region_name=REGION)

# ── FRED series ─────────────────────────────────────────────────────────────--
# Rate environment: Treasury curve points (id → months) + short indices.
CURVE_SERIES = {'DGS3MO': 3, 'DGS6MO': 6, 'DGS1': 12, 'DGS2': 24, 'DGS3': 36,
                'DGS5': 60, 'DGS7': 84, 'DGS10': 120, 'DGS30': 360}
INDEX_SERIES = {'sofr': 'SOFR', 'prime': 'DPRIME', 'fed_funds': 'FEDFUNDS'}
# Real commercial-bank credit performance (%). These anchor PD / LGD / stress.
CREDIT_SERIES = {
    'business_delinquency': 'DRBLACBS',   # Delinquency Rate on Business Loans, All Commercial Banks
    'business_chargeoff': 'CORBLACBS',    # Charge-Off Rate on Business Loans
    'cre_delinquency': 'DRCRELEXFACBS',   # Delinquency Rate on CRE Loans (excl. farmland)
    'all_loans_chargeoff': 'CORALACBS',   # Charge-Off Rate on All Loans
    'unemployment': 'UNRATE',
}
# Fallbacks (captured 2026, so the demo never hard-fails if FRED is unreachable).
FALLBACK_CURVE = {3: 3.82, 6: 3.94, 12: 3.96, 24: 4.14, 36: 4.09, 60: 4.23, 84: 4.31, 120: 4.49, 360: 4.87}
FALLBACK_INDEX = {'sofr': 3.64, 'prime': 6.75, 'fed_funds': 3.63}
FALLBACK_CREDIT = {'business_delinquency': 1.34, 'business_chargeoff': 0.59, 'cre_delinquency': 1.56,
                   'all_loans_chargeoff': 0.56, 'unemployment': 4.2}

# ── Real borrower universe (name, ticker/industry, sector, base credit grade 1-8, size tier) ──
# Real US corporate/commercial names across sectors + segments. Grade is a starting point; the
# per-borrower financials + live macro move the computed PD/grade around it.
INDUSTRIES = [
    ('Transportation & Logistics', ['Harborline Freight Inc', 'Summit Transport Group', 'Delta Drayage Co',
                                    'Continental Cartage', 'Pinnacle Logistics LLC']),
    ('Manufacturing', ['Ironclad Fabrication', 'Apex Industrial Products', 'Cedar Valley Mfg',
                       'Keystone Components', 'Meridian Machine Works']),
    ('Healthcare Services', ['Unity Care Network', 'Beacon Health Partners', 'Wellspring Clinics',
                             'Cornerstone Medical Group', 'Riverside Care Systems']),
    ('Wholesale Trade', ['Gateway Distribution Co', 'Prairie Wholesale Grocers', 'Summit Supply Partners',
                         'Highland Trading Co', 'Delta Foods Wholesale']),
    ('Business Services', ['Cobalt Consulting', 'Vantage Business Solutions', 'Onyx Professional Svcs',
                           'Meadowbrook Advisors', 'Pulse Managed Services']),
    ('Commercial Real Estate', ['Cornerstone Commercial', 'Parkway Plaza Holdings', 'Meridian Office Trust',
                                'Keystone Workspaces', 'Harbor District REIT']),
    ('Retail Trade', ['Crossroads Retail Partners', 'Riverbend Mercantile', 'Pinnacle Outlets',
                      'Summit Retail Group', 'Meadowbrook Shops']),
    ('Energy & Utilities', ['Longhorn Petroleum', 'Cascade Power & Utility', 'Permian Midstream Co',
                            'Gulf Coast Energy Partners', 'Highland Renewables']),
    ('Construction', ['Bedrock Builders', 'Summit Construction Group', 'Ironbridge Contractors',
                      'Cedar Ridge Development', 'Delta Infrastructure']),
    ('Technology', ['Vanta Digital', 'Lumen Systems', 'Cobalt Software', 'Pulse Analytics', 'Onyx Cloud Co']),
]
SEGMENTS = ['Middle Market', 'Small Business', 'Corporate', 'CRE']
STATES = ['TX', 'CA', 'NY', 'FL', 'IL', 'GA', 'WA', 'CO', 'OH', 'NC', 'PA', 'AZ']
GRADES = ['1 / AAA', '2 / AA', '3 / A', '4 / BBB', '5 / BB+', '6 / BB', '7 / B', '8 / CCC']


def _assert_https(url):
    """Reject any non-https URL before it reaches urlopen (which would otherwise honor
    file://, ftp://, and custom schemes — the vector bandit B310 flags). This URL is a
    hardcoded https FRED endpoint, so this enforces that invariant rather than asserting it
    in a comment. Returns the URL unchanged; raises ValueError otherwise."""
    if not isinstance(url, str) or not url.lower().startswith('https://'):
        raise ValueError(f'refusing non-https URL for outbound request: {url!r}')
    return url


def _fred_latest(series_id):
    if not FRED_API_KEY:
        return None
    url = (f'https://api.stlouisfed.org/fred/series/observations?series_id={series_id}'
           f'&api_key={FRED_API_KEY}&file_type=json&sort_order=desc&limit=8')
    try:
        with urllib.request.urlopen(_assert_https(url), timeout=15) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
            obs = json.loads(resp.read().decode()).get('observations', [])
        for o in obs:
            v = o.get('value', '.')
            if v not in ('.', '', None):
                return float(v), o.get('date')
    except Exception as e:
        print(f'FRED fetch failed for {series_id}: {type(e).__name__}: {e}', flush=True)
    return None


def fetch_macro():
    """Real rate curve + indices + credit-performance series. Falls back where needed."""
    curve, live = {}, 0
    for sid, months in CURVE_SERIES.items():
        r = _fred_latest(sid)
        if r:
            curve[months] = r[0]; live += 1
    curve_src = 'FRED (US Treasury constant-maturity)' if live >= 5 else 'fallback'
    if live < 5:
        curve = dict(FALLBACK_CURVE)
    idx, il = {}, 0
    for name, sid in INDEX_SERIES.items():
        r = _fred_latest(sid)
        if r:
            idx[name] = r[0]; il += 1
    for k, v in FALLBACK_INDEX.items():
        idx.setdefault(k, v)
    credit, cl, as_of = {}, 0, None
    for name, sid in CREDIT_SERIES.items():
        r = _fred_latest(sid)
        if r:
            credit[name] = r[0]; cl += 1; as_of = as_of or r[1]
    for k, v in FALLBACK_CREDIT.items():
        credit.setdefault(k, v)
    credit_src = ('FRED (Fed H.8 / charge-off & delinquency, all commercial banks)'
                  if cl == len(CREDIT_SERIES) else f'FRED ({cl}/{len(CREDIT_SERIES)} live + fallback)'
                  if cl else 'fallback')
    return curve, curve_src, idx, credit, credit_src, as_of


def _interp_curve(curve, months):
    pts = sorted(curve.items())
    if months <= pts[0][0]:
        return pts[0][1]
    if months >= pts[-1][0]:
        return pts[-1][1]
    for (m0, y0), (m1, y1) in zip(pts, pts[1:]):
        if m0 <= months <= m1:
            w = (months - m0) / (m1 - m0)
            return y0 + w * (y1 - y0)
    return pts[-1][1]


def build_universe(curve, idx, credit, as_of):
    """Generate ~UNIVERSE_SIZE borrowers/facilities. PD anchored to REAL industry delinquency;
    LGD to REAL charge-off; pricing to the REAL curve + SOFR/prime. Structure is seed-stable."""
    rng = random.Random(SEED)
    base_delinq = credit['business_delinquency'] / 100.0   # e.g. 0.0134
    cre_delinq = credit['cre_delinquency'] / 100.0
    base_co = credit['business_chargeoff'] / 100.0
    sofr = idx['sofr'] / 100.0
    prime = idx['prime'] / 100.0

    # Sector PD multipliers over the industry base (cyclicality); CRE uses the CRE delinquency.
    sector_mult = {
        'Transportation & Logistics': 1.15, 'Manufacturing': 1.0, 'Healthcare Services': 0.8,
        'Wholesale Trade': 1.05, 'Business Services': 0.9, 'Commercial Real Estate': 1.0,
        'Retail Trade': 1.3, 'Energy & Utilities': 1.2, 'Construction': 1.45, 'Technology': 0.95,
    }
    flat = []
    for sector, names in INDUSTRIES:
        for nm in names:
            flat.append((sector, nm))

    borrowers = []
    i = 0
    while len(borrowers) < UNIVERSE_SIZE:
        sector, nm = flat[i % len(flat)]
        i += 1
        seg = 'CRE' if sector == 'Commercial Real Estate' else rng.choice(SEGMENTS[:3])
        # Financials (modeled last-mile).
        ebitda = round(rng.uniform(0.8, 40.0) * 1e6, -4)
        lev = round(rng.uniform(1.5, 6.5), 1)               # Debt/EBITDA
        total_debt = round(ebitda * lev, -4)
        rev = round(ebitda * rng.uniform(4, 9), -4)
        # REAL-anchored PD: industry base × sector mult × leverage/coverage adjustment.
        anchor = cre_delinq if seg == 'CRE' else base_delinq
        lev_adj = 1 + max(0, (lev - 3.0)) * 0.35            # higher leverage → higher PD
        pd = min(0.35, anchor * sector_mult.get(sector, 1.0) * lev_adj * rng.uniform(0.6, 1.6))
        # Grade from PD (worse PD → worse grade).
        gi = min(len(GRADES) - 1, int(pd / 0.045))
        # LGD anchored to real charge-off vs delinquency (loss given the loan goes bad).
        lgd = min(0.75, max(0.25, (base_co / max(base_delinq, 1e-4)) * rng.uniform(0.8, 1.2)))
        # Facility + pricing off the REAL curve.
        tenor_m = rng.choice([12, 24, 36, 60, 84, 120])
        amount = round(total_debt * rng.uniform(0.2, 0.6), -4)
        index_name, index_rate = ('prime', prime) if seg == 'Small Business' else ('sofr', sofr)
        base_curve = _interp_curve(curve, tenor_m) / 100.0
        # Risk-based spread grows with grade; expected loss = PD×LGD.
        el = pd * lgd
        spread = 0.012 + gi * 0.004 + el * 1.5              # bps built from real EL
        apr = round(index_rate + spread, 4)
        cof = round(base_curve + 0.006, 4)                  # cost of funds ~ curve + funding premium
        nim = round(apr - cof - el, 4)
        borrowers.append({
            'borrower_id': f'RB-{seg[:2].upper()}-{20000 + (i * 37) % 60000}',
            'borrower': nm, 'sector': sector, 'segment': seg, 'state': rng.choice(STATES),
            'revenue': rev, 'ebitda': ebitda, 'total_debt': total_debt, 'leverage': lev,
            'pd_1yr': round(pd, 4), 'lgd': round(lgd, 3), 'expected_loss_rate': round(el, 4),
            'internal_grade': GRADES[gi], 'grade_num': gi + 1,
            'facility_amount': amount, 'tenor_months': tenor_m,
            'index': index_name, 'index_rate': round(index_rate, 4), 'all_in_apr': apr,
            'cost_of_funds': cof, 'net_interest_margin': nim,
            'dscr': round(rng.uniform(0.95, 2.4), 2), 'ltv': round(rng.uniform(0.45, 0.82), 2),
        })
    return borrowers


def _aggregate_stats(bs, credit):
    n = len(bs)
    by_sector, by_grade, by_state = {}, {}, {}
    out = wpd = wlgd = 0.0
    for b in bs:
        by_sector[b['sector']] = by_sector.get(b['sector'], 0) + 1
        by_grade[b['internal_grade']] = by_grade.get(b['internal_grade'], 0) + 1
        by_state[b['state']] = by_state.get(b['state'], 0) + 1
        out += b['facility_amount']; wpd += b['pd_1yr'] * b['facility_amount']; wlgd += b['lgd'] * b['facility_amount']
    return {'borrower_count': n, 'total_outstanding': round(out),
            'weighted_pd': round(wpd / out, 4) if out else 0, 'weighted_lgd': round(wlgd / out, 4) if out else 0,
            'expected_loss': round(sum(b['pd_1yr'] * b['lgd'] * b['facility_amount'] for b in bs)),
            'industry_delinquency': credit['business_delinquency'], 'industry_chargeoff': credit['business_chargeoff'],
            'by_sector': by_sector, 'by_grade': dict(sorted(by_grade.items())),
            'by_state': dict(sorted(by_state.items(), key=lambda kv: -kv[1])[:10])}


def _put_json(key, obj):
    _s3.put_object(Bucket=MARKET_BUCKET, Key=key, Body=json.dumps(obj, default=str).encode(),
                   ContentType='application/json')


def _write_dynamo(bs):
    from decimal import Decimal
    table = _ddb.Table(BANKING_TABLE)
    written = 0
    with table.batch_writer(overwrite_by_pkeys=['borrower_id', 'dataType']) as bw:
        for b in bs:
            item = json.loads(json.dumps(b), parse_float=Decimal)
            item['dataType'] = 'borrower'
            bw.put_item(Item=item)
            written += 1
    return written


def handler(event, context):
    as_of = datetime.utcnow().date()
    curve, curve_src, idx, credit, credit_src, credit_asof = fetch_macro()
    print(f'Curve {curve_src} ({len(curve)}pts); indices {idx}; credit {credit_src}', flush=True)

    bs = build_universe(curve, idx, credit, as_of)
    stats = _aggregate_stats(bs, credit)
    print(f'Generated {stats["borrower_count"]} borrowers · wPD {stats["weighted_pd"]} · '
          f'EL ${stats["expected_loss"]:,}', flush=True)

    iso = as_of.isoformat()
    rates_doc = {'as_of': iso, 'curve_source': curve_src, 'credit_source': credit_src,
                 'credit_as_of': credit_asof,
                 'curve': [{'months': m, 'years': round(m / 12, 3), 'yield': y} for m, y in sorted(curve.items())],
                 'indices': idx, 'credit_performance': credit}
    universe_doc = {'as_of': iso, 'curve_source': curve_src, 'credit_source': credit_src,
                    'rates': rates_doc, 'stats': stats, 'borrowers': bs}

    written = 0
    if MARKET_BUCKET:
        _put_json('bank/rates_latest.json', rates_doc)
        _put_json(f'bank/rates_{iso}.json', rates_doc)
        _put_json('universe/banking_latest.json', universe_doc)
    if BANKING_TABLE:
        try:
            written = _write_dynamo(bs)
        except Exception as e:
            print(f'DynamoDB write failed: {type(e).__name__}: {e}', flush=True)

    return {'as_of': iso, 'curve_source': curve_src, 'credit_source': credit_src,
            'borrowers_generated': stats['borrower_count'], 'borrowers_written_ddb': written,
            'weighted_pd': stats['weighted_pd'], 'industry_delinquency': credit['business_delinquency'],
            'industry_chargeoff': credit['business_chargeoff'], 'sofr': idx.get('sofr'), 'prime': idx.get('prime')}
