"""
Market-Data API Lambda — a downstream resource reached by MACHINE-TO-MACHINE
(2-legged / client_credentials) AgentCore Identity, NOT on behalf of any user.

This is the mirror image of the Grades API (the 3LO downstream). Where the Grades
API trusts a user-delegated token and attributes every call to a portfolio manager
(`sub`), THIS service models a **market-data vendor that licenses the firm's
application, not the individual user**. The agent authenticates as Meridian's
application via a Cognito client_credentials token carrying the `market-data/read`
scope. That token has **no user subject** — and that is exactly correct here: a
Bloomberg/ICE-style data entitlement belongs to the institution, not to Alice.

Identity is taken from the validated JWT claims injected by the API Gateway JWT
authorizer (requestContext.authorizer.jwt.claims). For a client_credentials token
the caller principal is the app's `client_id` (there is no `sub`), and authorization
is proven by the presence of the `market-data/read` scope. We log `client_id` as the
acting principal — the machine-identity analogue of the grades-api PM audit line.

Data: this ONE M2M feed serves every desk, routing on the (globally-unique) dataset name
to the REAL snapshot that desk's own ingest Lambda already wrote to S3 — so each vertical
gets its own real, licensed-to-the-right-firm data, never Meridian's bond universe by
default. See _DATASETS for the full map. Datasets (path param /market/{dataset}):
  Capital markets (Meridian, universe/latest.json — real Treasury curve + ICE BofA OAS ladder):
    curve · spreads · reference
  Banking (Rampart, bank/rates_latest.json — real FRED curve + SOFR/prime + Fed H.8):
    rate_curve · rate_indices · credit_performance
  FinTech (Kairo, fintech/*.json — real FRED consumer credit + book network stats):
    consumer_credit · network_stats
  Insurance (Ridgeline, nri/counties_latest.json — real FEMA National Risk Index):
    hazard · loss_cost · exposure
"""
import json
import os

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_KEY = 'universe/latest.json'

# ── Per-dataset routing ────────────────────────────────────────────────────────────────────
# ONE M2M feed serves every desk. The client_credentials token carries only the app client_id
# (no user, no persona), so we route on the DATASET name — which is globally unique across desks
# (enforced by personas.TOOL_SPEC_OVERRIDES). Each entry maps a dataset → (S3 snapshot key that
# the desk's own ingest Lambda already writes, the firm the data is licensed to). This is why the
# feed is honestly per-vertical: banking reads the REAL FRED rates/H.8 file banking-ingest wrote,
# insurance the REAL FEMA NRI file insurance-ingest wrote, etc. — never Meridian's bond universe.
_CM_KEY = UNIVERSE_KEY
_DATASETS = {
    # Capital markets (Meridian) — the bond universe snapshot.
    'curve':              (_CM_KEY, 'Meridian Asset Management'),
    'spreads':            (_CM_KEY, 'Meridian Asset Management'),
    'reference':          (_CM_KEY, 'Meridian Asset Management'),
    # Banking (Rampart) — real FRED curve + SOFR/prime + Fed H.8 credit performance.
    'rate_curve':         ('bank/rates_latest.json', 'Rampart Financial'),
    'rate_indices':       ('bank/rates_latest.json', 'Rampart Financial'),
    'credit_performance': ('bank/rates_latest.json', 'Rampart Financial'),
    # FinTech (Kairo) — real FRED consumer-credit macro + book network stats.
    'consumer_credit':    ('fintech/macro_latest.json', 'Kairo'),
    'network_stats':      ('universe/fintech_latest.json', 'Kairo'),
    # Insurance (Ridgeline) — real FEMA National Risk Index county hazard / loss cost.
    'hazard':             ('nri/counties_latest.json', 'Ridgeline Mutual'),
    'loss_cost':          ('nri/counties_latest.json', 'Ridgeline Mutual'),
    'exposure':           ('nri/counties_latest.json', 'Ridgeline Mutual'),
}

_s3 = boto3.client('s3', region_name=REGION)
# One cache slot per S3 key so different desks' snapshots don't evict each other.
_CACHE = {}


def _load_doc(key):
    """Load + cache an S3 snapshot by key (re-fetch on ETag change). Cached per key."""
    if not MARKET_BUCKET:
        return None
    slot = _CACHE.setdefault(key, {'doc': None, 'etag': None})
    try:
        head = _s3.head_object(Bucket=MARKET_BUCKET, Key=key)
        etag = head.get('ETag')
        if slot['doc'] is not None and etag == slot['etag']:
            return slot['doc']
        obj = _s3.get_object(Bucket=MARKET_BUCKET, Key=key)
        doc = json.loads(obj['Body'].read().decode())
        slot['doc'], slot['etag'] = doc, etag
        return doc
    except Exception as e:
        print(f'snapshot load failed for {key}: {type(e).__name__}: {e}', flush=True)
        return slot['doc']


def _claims(event):
    """Pull the validated JWT claims the HTTP API JWT authorizer attached."""
    try:
        return event['requestContext']['authorizer']['jwt']['claims']
    except (KeyError, TypeError):
        return {}


def _resp(code, payload):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(payload, default=str),
    }


def _reference_master(doc):
    """Distinct issuer reference master from the universe snapshot: one row per
    issuer with sector + rating + how many of its bonds are in the universe."""
    seen = {}
    for b in (doc.get('bonds', []) if doc else []):
        name = b.get('issuer')
        if not name:
            continue
        row = seen.setdefault(name, {'issuer': name, 'ticker': b.get('ticker'),
                                     'sector': b.get('sector'), 'rating': b.get('rating'),
                                     'instruments': 0})
        row['instruments'] += 1
    return sorted(seen.values(), key=lambda r: r['issuer'])


def _extract(dataset, doc):
    """Shape the licensed payload for one dataset from its (already desk-specific) snapshot.
    Every branch reads REAL data the desk's ingest Lambda wrote — no dataset invents figures."""
    d = doc or {}
    # ── Capital markets (bond universe) ──
    if dataset == 'curve':
        return {'as_of': d.get('as_of'), 'source': d.get('curve_source'), 'curve': d.get('curve', [])}
    if dataset == 'spreads':
        return {'as_of': d.get('as_of'), 'source': d.get('spread_source'), 'ladder': d.get('spreads', [])}
    if dataset == 'reference':
        ref = _reference_master(d)
        return {'as_of': d.get('as_of'), 'source': 'issuer reference master', 'issuers': ref, 'count': len(ref)}
    # ── Banking (bank/rates_latest.json: {as_of, curve_source, credit_source, curve, indices,
    #    credit_performance}) ──
    if dataset == 'rate_curve':
        return {'as_of': d.get('as_of'), 'source': d.get('curve_source'), 'curve': d.get('curve', [])}
    if dataset == 'rate_indices':
        return {'as_of': d.get('as_of'), 'source': d.get('curve_source'), 'indices': d.get('indices', {})}
    if dataset == 'credit_performance':
        return {'as_of': d.get('as_of'), 'source': d.get('credit_source'),
                'credit_performance': d.get('credit_performance', {})}
    # ── FinTech (fintech/macro_latest.json: {as_of, source, macro}; universe/fintech_latest.json:
    #    {..., stats}) ──
    if dataset == 'consumer_credit':
        return {'as_of': d.get('as_of'), 'source': d.get('source'), 'macro': d.get('macro', {})}
    if dataset == 'network_stats':
        return {'as_of': d.get('as_of'), 'source': d.get('macro_source'), 'stats': d.get('stats', {})}
    # ── Insurance (nri/counties_latest.json: {as_of, source, count, counties:[{...,perils,
    #    loss_cost_bps, build_value, risk_score}]}) ──
    counties = d.get('counties', [])
    if dataset == 'hazard':
        rows = [{'stcofips': c.get('stcofips'), 'state': c.get('state_abbrv'), 'county': c.get('county'),
                 'risk_score': c.get('risk_score'), 'risk_rating': c.get('risk_rating'),
                 'perils': c.get('perils', {})} for c in counties]
        return {'as_of': d.get('as_of'), 'source': d.get('source'), 'hazard': rows, 'count': len(rows)}
    if dataset == 'loss_cost':
        rows = [{'stcofips': c.get('stcofips'), 'state': c.get('state_abbrv'), 'county': c.get('county'),
                 'loss_cost_bps': c.get('loss_cost_bps'), 'eal_building': c.get('eal_building')}
                for c in counties]
        return {'as_of': d.get('as_of'), 'source': d.get('source'), 'loss_cost': rows, 'count': len(rows)}
    # dataset == 'exposure'
    rows = [{'stcofips': c.get('stcofips'), 'state': c.get('state_abbrv'), 'county': c.get('county'),
             'build_value': c.get('build_value'), 'population': c.get('population'),
             'sovi_score': c.get('sovi_score')} for c in counties]
    return {'as_of': d.get('as_of'), 'source': d.get('source'), 'exposure': rows, 'count': len(rows)}


def handler(event, context):
    claims = _claims(event)
    # client_credentials tokens carry NO `sub` — the principal is the app client_id.
    # Authorization is the presence of the market-data/read scope (validated by the
    # JWT authorizer's authorizationScopes). We refuse if neither is present.
    client_id = claims.get('client_id', '')
    scope = claims.get('scope', '')
    if not client_id and 'market-data/read' not in scope:
        return _resp(401, {'error': 'No authenticated application in token claims'})

    dataset = (event.get('pathParameters') or {}).get('dataset', 'curve')
    route = _DATASETS.get(dataset)
    if route is None:
        return _resp(400, {'error': f'Unknown dataset: {dataset}',
                           'known': sorted(_DATASETS)})
    key, firm = route
    doc = _load_doc(key)
    data = _extract(dataset, doc)

    # AUDIT LOG — the machine-identity analogue of the grades-api PM line: which
    # APPLICATION (client_id) pulled which licensed dataset. No user subject, by design.
    print(json.dumps({
        'audit': 'market_data_read',
        'principal_type': 'application',
        'client_id': client_id,
        'scope': scope,
        'dataset': dataset,
        'licensed_to': firm,
    }, default=str), flush=True)

    # The feed is licensed to the ACTIVE firm (not always Meridian) — set from the dataset's
    # own routing entry so the payload never misattributes a desk's data to another firm.
    data['licensed_to'] = f'{firm} (application entitlement)'
    return _resp(200, data)
