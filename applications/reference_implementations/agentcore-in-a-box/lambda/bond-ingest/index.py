"""bond-ingest — builds the Meridian fixed-income universe from REAL public market data.

Mission: give the AgentCore demo quant-grade SUBSTANCE. This Lambda pulls the real US
Treasury par-yield curve and real ICE BofA credit-spread ladder (both from FRED), then
generates a deterministic ~3,000-bond universe of real US issuers and COMPUTES each bond's
yield / clean price / modified duration / convexity / OAS off that real curve + spread.

"Real macro, modeled micro": the macro inputs (curve, spreads) and the quant (curve pricing,
duration, convexity, tracking error) are 100% real; only the last-mile per-CUSIP coupon/
maturity is generated (no free per-CUSIP feed exists). The universe STRUCTURE is fixed by a
constant seed, so the same bonds reappear every run — only their valuations move with the
live curve, exactly like a real book marked daily.

Outputs:
  S3  market/curve_latest.json, market/spreads_latest.json   (real macro inputs)
  S3  market/curve_<date>.json, market/spreads_<date>.json   (history for time-series charts)
  S3  universe/latest.json                                    (full computed universe — the
                                                               working dataset the bond tools load)
  DDB BondsTable                                              (per-CUSIP items — the "3k bonds in
                                                               DynamoDB" proof + point lookups)

Env: FRED_API_KEY (from .fred-key via deploy.sh), BONDS_TABLE, MARKET_BUCKET,
     UNIVERSE_SIZE (default 3000).
No third-party deps — urllib + boto3 only (no bundling needed).
"""
import json
import os
import random
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
FRED_API_KEY = os.environ.get('FRED_API_KEY', '')
BONDS_TABLE = os.environ.get('BONDS_TABLE', '')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_SIZE = int(os.environ.get('UNIVERSE_SIZE', '3000'))
# Constant seed → the universe (issuers, coupons, maturities) is identical every run;
# only the market-derived valuations move with the live curve.
SEED = 20260101

_s3 = boto3.client('s3', region_name=REGION)
_ddb = boto3.resource('dynamodb', region_name=REGION)

# ── FRED series ───────────────────────────────────────────────────────────────
# Treasury par-yield curve points: FRED series id → tenor in months. (Verified live.)
CURVE_SERIES = {
    'DGS1MO': 1, 'DGS3MO': 3, 'DGS6MO': 6, 'DGS1': 12, 'DGS2': 24, 'DGS3': 36,
    'DGS5': 60, 'DGS7': 84, 'DGS10': 120, 'DGS20': 240, 'DGS30': 360,
}
# ICE BofA Option-Adjusted Spread by rating: rating → FRED series id. (Verified live.)
SPREAD_SERIES = {
    'AAA': 'BAMLC0A1CAAA', 'AA': 'BAMLC0A2CAA', 'A': 'BAMLC0A3CA',
    'BBB': 'BAMLC0A4CBBB', 'BB': 'BAMLH0A1HYBB', 'B': 'BAMLH0A2HYB', 'CCC': 'BAMLH0A3HYC',
}
RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC']
RATING_NUM = {r: i + 1 for i, r in enumerate(RATING_ORDER)}  # 1=AAA … 7=CCC

# Baked-in recent snapshot — used ONLY if FRED is unreachable / key missing, so the demo
# never hard-fails. Values captured 2026-06-29 from the same FRED series.
FALLBACK_CURVE = {1: 3.70, 3: 3.83, 6: 3.94, 12: 3.94, 24: 4.07, 36: 4.09,
                  60: 4.12, 84: 4.23, 120: 4.38, 240: 4.87, 360: 4.87}
FALLBACK_SPREADS = {'AAA': 0.38, 'AA': 0.52, 'A': 0.64, 'BBB': 0.95,
                    'BB': 1.69, 'B': 3.00, 'CCC': 9.67}

# ── Real US issuer universe ─────────────────────────────────────────────────────
# (issuer, ticker, sector, rating, size_tier 1-4). Real names + realistic ratings; the
# size tier drives how many bonds each issuer floats (mega issuers have deeper curves).
ISSUERS = [
    # Treasuries (own block, AAA, deepest curve)
    ('US Treasury', 'UST', 'Treasury', 'AAA', 4),
    # Financials
    ('JPMorgan Chase & Co.', 'JPM', 'Financials', 'A', 4),
    ('Bank of America Corp.', 'BAC', 'Financials', 'A', 4),
    ('Wells Fargo & Co.', 'WFC', 'Financials', 'BBB', 3),
    ('Citigroup Inc.', 'C', 'Financials', 'BBB', 3),
    ('Goldman Sachs Group', 'GS', 'Financials', 'BBB', 3),
    ('Morgan Stanley', 'MS', 'Financials', 'A', 3),
    ('American Express Co.', 'AXP', 'Financials', 'BBB', 2),
    ('Berkshire Hathaway', 'BRK', 'Financials', 'AA', 4),
    ('BlackRock Inc.', 'BLK', 'Financials', 'AA', 2),
    ('Charles Schwab Corp.', 'SCHW', 'Financials', 'A', 2),
    ('Capital One Financial', 'COF', 'Financials', 'BBB', 2),
    ('MetLife Inc.', 'MET', 'Financials', 'A', 2),
    ('Prudential Financial', 'PRU', 'Financials', 'A', 2),
    ('US Bancorp', 'USB', 'Financials', 'A', 2),
    ('PNC Financial Services', 'PNC', 'Financials', 'A', 2),
    ('Truist Financial', 'TFC', 'Financials', 'BBB', 2),
    # Technology
    ('Apple Inc.', 'AAPL', 'Technology', 'AA', 4),
    ('Microsoft Corp.', 'MSFT', 'Technology', 'AAA', 4),
    ('Alphabet Inc.', 'GOOGL', 'Technology', 'AA', 3),
    ('Oracle Corp.', 'ORCL', 'Technology', 'BBB', 3),
    ('IBM Corp.', 'IBM', 'Technology', 'A', 3),
    ('Cisco Systems', 'CSCO', 'Technology', 'AA', 2),
    ('Intel Corp.', 'INTC', 'Technology', 'A', 3),
    ('NVIDIA Corp.', 'NVDA', 'Technology', 'A', 2),
    ('Broadcom Inc.', 'AVGO', 'Technology', 'BBB', 3),
    ('Qualcomm Inc.', 'QCOM', 'Technology', 'A', 2),
    ('Texas Instruments', 'TXN', 'Technology', 'A', 2),
    ('Dell Technologies', 'DELL', 'Technology', 'BBB', 2),
    ('Hewlett Packard Enterprise', 'HPE', 'Technology', 'BBB', 1),
    # Healthcare
    ('Johnson & Johnson', 'JNJ', 'Healthcare', 'AAA', 4),
    ('UnitedHealth Group', 'UNH', 'Healthcare', 'A', 3),
    ('Pfizer Inc.', 'PFE', 'Healthcare', 'A', 3),
    ('Merck & Co.', 'MRK', 'Healthcare', 'A', 3),
    ('AbbVie Inc.', 'ABBV', 'Healthcare', 'BBB', 3),
    ('Amgen Inc.', 'AMGN', 'Healthcare', 'BBB', 2),
    ('Eli Lilly & Co.', 'LLY', 'Healthcare', 'A', 2),
    ('Bristol-Myers Squibb', 'BMY', 'Healthcare', 'A', 2),
    ('CVS Health Corp.', 'CVS', 'Healthcare', 'BBB', 3),
    ('Gilead Sciences', 'GILD', 'Healthcare', 'BBB', 2),
    ('Medtronic plc', 'MDT', 'Healthcare', 'A', 2),
    ('Thermo Fisher Scientific', 'TMO', 'Healthcare', 'A', 2),
    # Energy
    ('Exxon Mobil Corp.', 'XOM', 'Energy', 'AA', 4),
    ('Chevron Corp.', 'CVX', 'Energy', 'AA', 3),
    ('ConocoPhillips', 'COP', 'Energy', 'A', 2),
    ('Enterprise Products', 'EPD', 'Energy', 'BBB', 2),
    ('Kinder Morgan Inc.', 'KMI', 'Energy', 'BBB', 2),
    ('Williams Companies', 'WMB', 'Energy', 'BBB', 2),
    ('Marathon Petroleum', 'MPC', 'Energy', 'BBB', 2),
    ('Phillips 66', 'PSX', 'Energy', 'BBB', 2),
    ('Occidental Petroleum', 'OXY', 'Energy', 'BB', 2),
    ('Schlumberger NV', 'SLB', 'Energy', 'A', 1),
    # Industrials
    ('Boeing Co.', 'BA', 'Industrials', 'BBB', 3),
    ('Caterpillar Inc.', 'CAT', 'Industrials', 'A', 2),
    ('Honeywell International', 'HON', 'Industrials', 'A', 2),
    ('General Electric', 'GE', 'Industrials', 'BBB', 3),
    ('3M Co.', 'MMM', 'Industrials', 'A', 2),
    ('Lockheed Martin', 'LMT', 'Industrials', 'A', 2),
    ('Raytheon (RTX)', 'RTX', 'Industrials', 'BBB', 2),
    ('Union Pacific', 'UNP', 'Industrials', 'A', 2),
    ('United Parcel Service', 'UPS', 'Industrials', 'A', 2),
    ('Deere & Co.', 'DE', 'Industrials', 'A', 2),
    ('Emerson Electric', 'EMR', 'Industrials', 'A', 1),
    ('Illinois Tool Works', 'ITW', 'Industrials', 'A', 1),
    # Consumer
    ('Amazon.com Inc.', 'AMZN', 'Consumer', 'AA', 4),
    ('Walmart Inc.', 'WMT', 'Consumer', 'AA', 3),
    ('Home Depot Inc.', 'HD', 'Consumer', 'A', 3),
    ('Procter & Gamble', 'PG', 'Consumer', 'AA', 3),
    ('Coca-Cola Co.', 'KO', 'Consumer', 'A', 3),
    ('PepsiCo Inc.', 'PEP', 'Consumer', 'A', 3),
    ('McDonald’s Corp.', 'MCD', 'Consumer', 'BBB', 2),
    ('Nike Inc.', 'NKE', 'Consumer', 'A', 2),
    ('Costco Wholesale', 'COST', 'Consumer', 'A', 2),
    ('Target Corp.', 'TGT', 'Consumer', 'A', 2),
    ('Starbucks Corp.', 'SBUX', 'Consumer', 'BBB', 2),
    ('Mondelez International', 'MDLZ', 'Consumer', 'BBB', 1),
    ('Philip Morris International', 'PM', 'Consumer', 'A', 2),
    ('Altria Group', 'MO', 'Consumer', 'BBB', 2),
    ('Ford Motor Co.', 'F', 'Consumer', 'BB', 3),
    ('General Motors', 'GM', 'Consumer', 'BBB', 3),
    # Communications
    ('Verizon Communications', 'VZ', 'Communications', 'BBB', 4),
    ('AT&T Inc.', 'T', 'Communications', 'BBB', 4),
    ('Comcast Corp.', 'CMCSA', 'Communications', 'A', 3),
    ('Walt Disney Co.', 'DIS', 'Communications', 'A', 2),
    ('Verizon Wireless', 'VZW', 'Communications', 'BBB', 2),
    ('T-Mobile US', 'TMUS', 'Communications', 'BBB', 2),
    ('Charter Communications', 'CHTR', 'Communications', 'BB', 2),
    ('Netflix Inc.', 'NFLX', 'Communications', 'BBB', 2),
    ('Meta Platforms', 'META', 'Communications', 'AA', 2),
    ('Warner Bros. Discovery', 'WBD', 'Communications', 'BBB', 2),
    # Utilities
    ('NextEra Energy', 'NEE', 'Utilities', 'A', 3),
    ('Duke Energy Corp.', 'DUK', 'Utilities', 'BBB', 3),
    ('Southern Co.', 'SO', 'Utilities', 'BBB', 3),
    ('Dominion Energy', 'D', 'Utilities', 'BBB', 2),
    ('American Electric Power', 'AEP', 'Utilities', 'BBB', 2),
    ('Exelon Corp.', 'EXC', 'Utilities', 'BBB', 2),
    ('Sempra', 'SRE', 'Utilities', 'BBB', 2),
    ('Public Service Enterprise', 'PEG', 'Utilities', 'BBB', 1),
    ('Consolidated Edison', 'ED', 'Utilities', 'A', 1),
    ('Xcel Energy', 'XEL', 'Utilities', 'A', 1),
    # Materials
    ('Dow Inc.', 'DOW', 'Materials', 'BBB', 2),
    ('DuPont de Nemours', 'DD', 'Materials', 'BBB', 2),
    ('Linde plc', 'LIN', 'Materials', 'A', 2),
    ('Air Products & Chemicals', 'APD', 'Materials', 'A', 1),
    ('Freeport-McMoRan', 'FCX', 'Materials', 'BB', 2),
    ('Nucor Corp.', 'NUE', 'Materials', 'A', 1),
    ('Newmont Corp.', 'NEM', 'Materials', 'BBB', 1),
    ('Sherwin-Williams', 'SHW', 'Materials', 'BBB', 1),
    # Real Estate
    ('Prologis Inc.', 'PLD', 'Real Estate', 'A', 2),
    ('American Tower Corp.', 'AMT', 'Real Estate', 'BBB', 2),
    ('Simon Property Group', 'SPG', 'Real Estate', 'A', 2),
    ('Crown Castle Inc.', 'CCI', 'Real Estate', 'BBB', 2),
    ('Public Storage', 'PSA', 'Real Estate', 'A', 1),
    ('Equinix Inc.', 'EQIX', 'Real Estate', 'BBB', 1),
    ('Realty Income Corp.', 'O', 'Real Estate', 'A', 1),
    ('Welltower Inc.', 'WELL', 'Real Estate', 'BBB', 1),
]

# Bonds emitted per issuer size tier (round-robin until UNIVERSE_SIZE reached).
TIER_WEIGHT = {1: 6, 2: 12, 3: 20, 4: 34}


# ── FRED fetch ───────────────────────────────────────────────────────────────
def _assert_https(url):
    """Reject any non-https URL before it reaches urlopen (which would otherwise honor
    file://, ftp://, and custom schemes — the vector bandit B310 flags). This URL is a
    hardcoded https FRED endpoint, so this enforces that invariant rather than asserting it
    in a comment. Returns the URL unchanged; raises ValueError otherwise."""
    if not isinstance(url, str) or not url.lower().startswith('https://'):
        raise ValueError(f'refusing non-https URL for outbound request: {url!r}')
    return url


def _fred_latest(series_id):
    """Most-recent non-'.' observation value for a FRED series, or None."""
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
                return float(v)
    except Exception as e:
        print(f'FRED fetch failed for {series_id}: {type(e).__name__}: {e}', flush=True)
    return None


def fetch_curve():
    """Real Treasury par-yield curve: {months: yield_pct}. Falls back to snapshot."""
    curve = {}
    for sid, months in CURVE_SERIES.items():
        v = _fred_latest(sid)
        if v is not None:
            curve[months] = v
    if len(curve) < 5:
        print('Curve incomplete from FRED — using fallback snapshot.', flush=True)
        return dict(FALLBACK_CURVE), 'fallback'
    return curve, 'FRED (US Treasury constant-maturity)'


def fetch_spreads():
    """Real ICE BofA OAS ladder: {rating: oas_pct}. Falls back to snapshot for any
    rating FRED didn't return. Source label is honest about whether the LIVE values
    actually came from FRED (provenance matters — this is the 'real data' claim)."""
    spreads = {}
    live = 0
    for rating, sid in SPREAD_SERIES.items():
        v = _fred_latest(sid)
        if v is not None:
            spreads[rating] = v
            live += 1
    for r, v in FALLBACK_SPREADS.items():
        spreads.setdefault(r, v)  # fill any gaps so the ladder is always complete
    if live == len(SPREAD_SERIES):
        src = 'FRED (ICE BofA OAS indices)'
    elif live > 0:
        src = f'FRED (ICE BofA OAS, {live}/{len(SPREAD_SERIES)} live + fallback)'
    else:
        src = 'fallback'
    return spreads, src


# ── Curve interpolation + bond math (all real, standard fixed-income) ──────────
def interp_curve(curve, months):
    """Linear-interpolated Treasury yield (pct) at an arbitrary tenor in months."""
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


def price_and_risk(coupon_pct, ytm_pct, years, freq=2):
    """Clean price (per 100), modified duration (yrs), convexity (yrs^2) for a
    semiannual fixed-coupon bond. Standard closed-form discounting — real math."""
    n = max(1, int(round(years * freq)))
    i = (ytm_pct / 100.0) / freq                      # per-period yield
    cpn = (coupon_pct / 100.0) * 100.0 / freq         # per-period coupon on 100 face
    price = 0.0
    dur_w = 0.0   # sum t * CF / (1+i)^t   (t in periods)
    cvx_w = 0.0   # sum t(t+1) CF / (1+i)^t
    for t in range(1, n + 1):
        cf = cpn + (100.0 if t == n else 0.0)
        disc = cf / ((1 + i) ** t)
        price += disc
        dur_w += t * disc
        cvx_w += t * (t + 1) * disc
    if price <= 0:
        return 0.0, 0.0, 0.0
    mac_periods = dur_w / price
    mod_dur = (mac_periods / (1 + i)) / freq          # → years
    convexity = (cvx_w / (price * (1 + i) ** 2)) / (freq ** 2)
    return round(price, 3), round(mod_dur, 3), round(convexity, 3)


# ── Universe generation (deterministic) ────────────────────────────────────────
def _cusip(rng):
    """Synthetic but stable, CUSIP-shaped 9-char id."""
    chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    return ''.join(rng.choice(chars) for _ in range(9))


def build_universe(curve, spreads, as_of):
    """Generate ~UNIVERSE_SIZE bonds across the real issuer list, valuing each off the
    real curve + the issuer's rating OAS (+ a small deterministic sector/idiosyncratic
    premium). Structure is seed-stable; valuations move with the live curve."""
    rng = random.Random(SEED)
    # Sector adds a modest spread premium over the pure rating OAS (cyclical/secured tilt).
    sector_prem = {
        'Treasury': -0.02, 'Technology': 0.05, 'Healthcare': 0.06, 'Consumer': 0.08,
        'Financials': 0.12, 'Industrials': 0.10, 'Energy': 0.18, 'Communications': 0.14,
        'Utilities': 0.07, 'Materials': 0.16, 'Real Estate': 0.20,
    }
    # Build a weighted round-robin order of issuers.
    order = []
    for iss in ISSUERS:
        order.extend([iss] * TIER_WEIGHT[iss[4]])
    rng.shuffle(order)

    bonds = []
    idx = 0
    while len(bonds) < UNIVERSE_SIZE:
        name, ticker, sector, rating, tier = order[idx % len(order)]
        idx += 1
        is_ust = sector == 'Treasury'
        # Maturity: spread across the curve, weighted to the belly. Years 0.5–30.
        years = round(rng.choice([0.5, 1, 2, 2, 3, 3, 5, 5, 5, 7, 7, 10, 10, 10, 20, 30])
                      + rng.uniform(-0.2, 0.4), 2)
        years = max(0.25, years)
        base = interp_curve(curve, years * 12)
        if is_ust:
            oas = 0.0
            coupon = round(base + rng.uniform(-0.25, 0.25), 3)  # near-par issuance
        else:
            oas = max(0.05, spreads.get(rating, 1.0) + sector_prem.get(sector, 0.1)
                      + rng.uniform(-0.10, 0.20))
            # Coupon set near issuance yield at a past date → bonds trade off par today.
            coupon = round(base + oas + rng.uniform(-0.6, 0.6), 3)
            coupon = max(0.5, coupon)
        ytm = round(base + oas, 4)
        price, mod_dur, convexity = price_and_risk(coupon, ytm, years)
        mat = as_of + timedelta(days=int(years * 365))
        liquidity = round(min(1.0, 0.45 + 0.14 * tier + rng.uniform(-0.05, 0.08)), 2)
        bonds.append({
            'cusip': _cusip(rng),
            'issuer': name,
            'ticker': ticker,
            'sector': sector,
            'rating': rating,
            'rating_num': RATING_NUM[rating],
            'coupon': round(coupon, 3),
            'maturity': mat.isoformat(),
            'years': years,
            'ytm': ytm,
            'oas': round(oas, 4),
            'price': price,
            'mod_duration': mod_dur,
            'convexity': convexity,
            'dv01': round(price * mod_dur / 10000.0, 6),
            'liquidity': liquidity,
            'face': 1000,
            'is_treasury': is_ust,
        })
    return bonds


def _aggregate_stats(bonds):
    """Headline universe stats for the snapshot + ingest summary."""
    n = len(bonds)
    by_rating, by_sector = {}, {}
    for b in bonds:
        by_rating[b['rating']] = by_rating.get(b['rating'], 0) + 1
        by_sector[b['sector']] = by_sector.get(b['sector'], 0) + 1
    avg_y = round(sum(b['ytm'] for b in bonds) / n, 3) if n else 0
    avg_d = round(sum(b['mod_duration'] for b in bonds) / n, 3) if n else 0
    return {'count': n, 'avg_ytm': avg_y, 'avg_duration': avg_d,
            'by_rating': by_rating, 'by_sector': by_sector}


# ── Persistence ──────────────────────────────────────────────────────────────
def _put_json(key, obj):
    _s3.put_object(Bucket=MARKET_BUCKET, Key=key,
                   Body=json.dumps(obj, default=str).encode(),
                   ContentType='application/json')


def _write_dynamo(bonds):
    """Write per-CUSIP items (the '3k bonds in DynamoDB' proof + point lookups). Floats
    must be Decimal for DynamoDB, so round-trip through JSON with parse_float=Decimal."""
    from decimal import Decimal
    table = _ddb.Table(BONDS_TABLE)
    written = 0
    with table.batch_writer(overwrite_by_pkeys=['cusip', 'dataType']) as bw:
        for b in bonds:
            item = json.loads(json.dumps(b), parse_float=Decimal)
            item['dataType'] = 'bond'
            bw.put_item(Item=item)
            written += 1
    return written


def handler(event, context):
    as_of = datetime.utcnow().date()
    curve, curve_src = fetch_curve()
    spreads, spread_src = fetch_spreads()
    print(f'Curve from {curve_src} ({len(curve)} pts); spreads from {spread_src}', flush=True)

    bonds = build_universe(curve, spreads, as_of)
    stats = _aggregate_stats(bonds)
    print(f'Generated {stats["count"]} bonds · avg YTM {stats["avg_ytm"]}% · '
          f'avg dur {stats["avg_duration"]}y', flush=True)

    iso = as_of.isoformat()
    curve_doc = {'as_of': iso, 'source': curve_src,
                 'points': [{'months': m, 'years': round(m / 12, 3), 'yield': y}
                            for m, y in sorted(curve.items())]}
    spread_doc = {'as_of': iso, 'source': spread_src,
                  'ladder': [{'rating': r, 'rating_num': RATING_NUM[r], 'oas': spreads[r]}
                             for r in RATING_ORDER if r in spreads]}
    universe_doc = {'as_of': iso, 'curve_source': curve_src, 'spread_source': spread_src,
                    'stats': stats, 'curve': curve_doc['points'],
                    'spreads': spread_doc['ladder'], 'bonds': bonds}

    written = 0
    if MARKET_BUCKET:
        _put_json('market/curve_latest.json', curve_doc)
        _put_json('market/spreads_latest.json', spread_doc)
        _put_json(f'market/curve_{iso}.json', curve_doc)
        _put_json(f'market/spreads_{iso}.json', spread_doc)
        _put_json('universe/latest.json', universe_doc)
    if BONDS_TABLE:
        try:
            written = _write_dynamo(bonds)
        except Exception as e:
            print(f'DynamoDB write failed: {type(e).__name__}: {e}', flush=True)

    return {'as_of': iso, 'curve_source': curve_src, 'spread_source': spread_src,
            'bonds_generated': stats['count'], 'bonds_written_ddb': written,
            'avg_ytm': stats['avg_ytm'], 'avg_duration': stats['avg_duration'],
            'by_rating': stats['by_rating'], 'by_sector': stats['by_sector']}
