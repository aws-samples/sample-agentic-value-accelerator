"""fintech-ingest — builds the Kairo payments/risk universe from REAL public data.

Mission: give the fintech vertical the same quant-grade SUBSTANCE the bond desk has. This Lambda
pulls the REAL consumer-credit environment from FRED — credit-card delinquency & charge-off rates
(all commercial banks), total consumer credit, and unemployment — then generates a deterministic
~2,000-merchant/program portfolio and COMPUTES each merchant's expected fraud/chargeback/credit
loss off those REAL industry loss rates.

"Real macro, modeled micro" (mirrors bond-ingest): the macro inputs (card delinquency, charge-off,
consumer credit, unemployment) are 100% REAL from FRED and act as the CYCLICAL ANCHOR — a realistic
payments base loss (chargeback/fraud/credit, all in volume bps) is scaled by how elevated today's
real delinquency/charge-off is vs long-run normals, so the book's losses move with the real credit
cycle. (We deliberately do NOT equate the card-balance delinquency % with a payment-volume loss
rate — those are different denominators.) Only the last-mile per-merchant volume / MCC / approval
mix is generated (no free per-merchant feed exists). Structure is seed-stable.

Outputs:
  S3  fintech/macro_latest.json              (real card delinquency/charge-off + consumer credit)
  S3  fintech/macro_<date>.json              (dated history)
  S3  universe/fintech_latest.json           (full computed merchant/program portfolio)
  DDB FintechTable                            (per-merchant items — point lookups + proof)

Env: FRED_API_KEY (from .fred-key via deploy.sh), FINTECH_TABLE, MARKET_BUCKET,
     UNIVERSE_SIZE (default 2000).
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
FINTECH_TABLE = os.environ.get('FINTECH_TABLE', '')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_SIZE = int(os.environ.get('UNIVERSE_SIZE', '2000'))
SEED = 20260101

_s3 = boto3.client('s3', region_name=REGION)
_ddb = boto3.resource('dynamodb', region_name=REGION)

# ── FRED series (real consumer-credit environment) ──────────────────────────────
MACRO_SERIES = {
    'card_delinquency': 'DRCCLACBS',      # Delinquency Rate on Credit Card Loans, All Commercial Banks
    'card_chargeoff': 'CORCCACBS',        # Charge-Off Rate on Credit Card Loans
    'consumer_delinquency': 'DRCLACBS',   # Delinquency Rate on Consumer Loans
    'total_consumer_credit': 'TOTALSL',   # Total Consumer Credit Owned and Securitized ($MM)
    'unemployment': 'UNRATE',
}
FALLBACK_MACRO = {'card_delinquency': 2.92, 'card_chargeoff': 3.84, 'consumer_delinquency': 2.64,
                  'total_consumer_credit': 5153090.64, 'unemployment': 4.2}

# ── Real-ish merchant universe by MCC (name, mcc, category, base risk tier 1-3) ──
MCC_CATALOG = [
    ('Northwind Grocery', '5411', 'Grocery', 1), ('Meadow Foods', '5411', 'Grocery', 1),
    ('Vanta Digital Goods', '5816', 'Digital Goods', 3), ('Onyx Gaming', '7995', 'Gaming', 3),
    ('Peak Outfitters', '5651', 'Apparel', 2), ('Cobalt Electronics', '5732', 'Electronics', 2),
    ('Lumen Streaming', '4899', 'Streaming/Subscription', 2), ('Pulse Fitness', '7997', 'Fitness', 2),
    ('Harbor Freight Co', '5200', 'Home Improvement', 1), ('Solaris Travel', '4722', 'Travel', 3),
    ('Drift Rideshare', '4121', 'Transportation', 2), ('Ember Restaurants', '5812', 'Restaurant', 2),
    ('Summit Retail Group', '5311', 'Department Store', 1), ('Crossroads Marketplace', '5399', 'Marketplace', 2),
    ('Vista Hospitality', '3501', 'Lodging', 3), ('Riverbend Pharmacy', '5912', 'Pharmacy', 1),
    ('Cedar Auto Parts', '5533', 'Auto Parts', 1), ('Pinnacle Jewelry', '5944', 'Jewelry', 3),
]
GEOS = ['US', 'EU', 'UK', 'LATAM', 'APAC']
PROGRAMS = ['Consumer Wallet', 'SMB Acquiring', 'Card Issuing', 'BNPL', 'Cross-Border']


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
    macro, live, as_of = {}, 0, None
    for name, sid in MACRO_SERIES.items():
        r = _fred_latest(sid)
        if r:
            macro[name] = r[0]; live += 1; as_of = as_of or r[1]
    for k, v in FALLBACK_MACRO.items():
        macro.setdefault(k, v)
    src = ('FRED (Fed credit-card delinquency/charge-off + consumer credit)'
           if live == len(MACRO_SERIES) else f'FRED ({live}/{len(MACRO_SERIES)} live + fallback)'
           if live else 'fallback')
    return macro, src, as_of


def build_universe(macro, as_of):
    """Generate ~UNIVERSE_SIZE merchants. Loss rates are realistic PAYMENTS bps (chargeback/fraud
    are on transaction VOLUME, ~10-100bps — NOT the card delinquency %, which is a balance metric).
    FRED card delinquency & charge-off are used as the REAL CYCLICAL ANCHOR: we scale a realistic
    base loss by how elevated today's delinquency/charge-off is vs a long-run normal, so the book's
    losses move with the real credit cycle without conflating balance rates with volume rates.
    Structure seed-stable."""
    rng = random.Random(SEED)
    # Cyclical multipliers: >1 when today's real rates run hot vs long-run normals.
    NORMAL_CARD_DELINQ, NORMAL_CARD_CO = 2.5, 3.5  # long-run-ish normals (%)
    cb_cycle = macro['card_delinquency'] / NORMAL_CARD_DELINQ      # chargebacks track delinquency cycle
    credit_cycle = macro['card_chargeoff'] / NORMAL_CARD_CO        # credit loss tracks charge-off cycle
    # Programs that actually extend credit (so credit loss applies); others are pure acquiring.
    CREDIT_PROGRAMS = {'Card Issuing', 'BNPL'}
    merchants = []
    i = 0
    while len(merchants) < UNIVERSE_SIZE:
        nm, mcc, cat, tier = MCC_CATALOG[i % len(MCC_CATALOG)]
        i += 1
        geo = rng.choice(GEOS)
        program = rng.choice(PROGRAMS)
        monthly_volume = round(50_000 + (rng.random() ** 2) * 12_000_000, -3)
        # Chargeback: realistic base 6-45 bps by tier, scaled by the REAL delinquency cycle.
        cb_bps = round((6 + tier * 13) * cb_cycle * rng.uniform(0.6, 1.4), 1)
        cb_rate = round(cb_bps / 10000, 5)
        # Fraud: modeled 8-50 bps (no clean public per-merchant fraud series); tier + geo driven.
        geo_mult = {'US': 1.0, 'EU': 0.9, 'UK': 0.95, 'LATAM': 1.6, 'APAC': 1.3}[geo]
        fraud_bps = round((8 + tier * 14) * geo_mult * rng.uniform(0.6, 1.5), 1)
        # Credit loss: ONLY for credit-extending programs, realistic 30-150 bps of volume, scaled
        # by the REAL charge-off cycle. Pure acquiring programs carry ~0 credit loss.
        if program in CREDIT_PROGRAMS:
            credit_loss_bps = round((30 + tier * 40) * credit_cycle * rng.uniform(0.7, 1.3), 1)
        else:
            credit_loss_bps = 0.0
        approval = round(0.995 - tier * 0.02 - rng.random() * 0.03, 3)
        total_loss_bps = round(cb_bps + credit_loss_bps + fraud_bps, 1)
        merchants.append({
            'merchant_id': f'M-{40000 + (i * 311) % 90000}', 'name': nm, 'mcc': mcc, 'category': cat,
            'geo': geo, 'program': program, 'risk_tier': tier, 'monthly_volume': monthly_volume,
            'approval_rate': approval, 'chargeback_rate': cb_rate, 'chargeback_bps': round(cb_rate * 10000, 1),
            'credit_loss_bps': credit_loss_bps, 'fraud_loss_bps': fraud_bps, 'total_loss_bps': total_loss_bps,
            'risk_band': 'high' if total_loss_bps > 120 else ('medium' if total_loss_bps > 55 else 'low'),
            'risk_score': min(100, int(total_loss_bps / 2)),
        })
    return merchants


def _aggregate_stats(ms, macro):
    n = len(ms)
    gross = sum(m['monthly_volume'] for m in ms) * 12  # annualized
    by_program, by_geo, by_mcc = {}, {}, {}
    for m in ms:
        by_program[m['program']] = by_program.get(m['program'], 0) + m['monthly_volume'] * 12
        by_geo[m['geo']] = by_geo.get(m['geo'], 0) + m['monthly_volume'] * 12
        by_mcc[m['category']] = by_mcc.get(m['category'], 0) + 1
    w_loss = sum(m['total_loss_bps'] * m['monthly_volume'] for m in ms) / max(sum(m['monthly_volume'] for m in ms), 1)
    return {'merchant_count': n, 'gross_annual_volume': round(gross),
            'weighted_loss_bps': round(w_loss, 1),
            'card_delinquency_pct': macro['card_delinquency'], 'card_chargeoff_pct': macro['card_chargeoff'],
            'by_program': {k: round(v / gross, 3) for k, v in sorted(by_program.items(), key=lambda kv: -kv[1])} if gross else {},
            'by_geo': {k: round(v / gross, 3) for k, v in sorted(by_geo.items(), key=lambda kv: -kv[1])} if gross else {},
            'merchants_by_category': by_mcc}


def _put_json(key, obj):
    _s3.put_object(Bucket=MARKET_BUCKET, Key=key, Body=json.dumps(obj, default=str).encode(),
                   ContentType='application/json')


def _write_dynamo(ms):
    from decimal import Decimal
    table = _ddb.Table(FINTECH_TABLE)
    written = 0
    with table.batch_writer(overwrite_by_pkeys=['merchant_id', 'dataType']) as bw:
        for m in ms:
            item = json.loads(json.dumps(m), parse_float=Decimal)
            item['dataType'] = 'merchant'
            bw.put_item(Item=item)
            written += 1
    return written


def handler(event, context):
    as_of = datetime.utcnow().date()
    macro, src, macro_asof = fetch_macro()
    print(f'Macro {src}: {macro}', flush=True)

    ms = build_universe(macro, as_of)
    stats = _aggregate_stats(ms, macro)
    print(f'Generated {stats["merchant_count"]} merchants · gross ${stats["gross_annual_volume"]:,} · '
          f'weighted loss {stats["weighted_loss_bps"]}bps', flush=True)

    iso = as_of.isoformat()
    macro_doc = {'as_of': iso, 'source': src, 'macro_as_of': macro_asof, 'macro': macro}
    universe_doc = {'as_of': iso, 'macro_source': src, 'macro': macro, 'stats': stats, 'merchants': ms}

    written = 0
    if MARKET_BUCKET:
        _put_json('fintech/macro_latest.json', macro_doc)
        _put_json(f'fintech/macro_{iso}.json', macro_doc)
        _put_json('universe/fintech_latest.json', universe_doc)
    if FINTECH_TABLE:
        try:
            written = _write_dynamo(ms)
        except Exception as e:
            print(f'DynamoDB write failed: {type(e).__name__}: {e}', flush=True)

    return {'as_of': iso, 'macro_source': src, 'merchants_generated': stats['merchant_count'],
            'merchants_written_ddb': written, 'weighted_loss_bps': stats['weighted_loss_bps'],
            'card_delinquency_pct': macro['card_delinquency'], 'card_chargeoff_pct': macro['card_chargeoff'],
            'gross_annual_volume': stats['gross_annual_volume']}
