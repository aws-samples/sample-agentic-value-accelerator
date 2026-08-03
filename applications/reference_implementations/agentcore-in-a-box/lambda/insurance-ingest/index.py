"""insurance-ingest — builds the Ridgeline Mutual submission universe from REAL public data.

Mission: give the insurance vertical the same quant-grade SUBSTANCE the bond desk has. This
Lambda pulls the REAL FEMA National Risk Index (NRI) county file — per-county, per-peril
Expected Annual Loss, hazard risk scores, building-value exposure, social vulnerability — from
FEMA's public ArcGIS FeatureServer (key-free), then generates a deterministic ~4,000-submission
underwriting universe of insureds anchored to REAL counties and COMPUTES each submission's
peril grades, catastrophe loss cost, technical premium and expected loss off that REAL county
hazard data.

"Real macro, modeled micro" (mirrors bond-ingest): the macro inputs (county hazard scores,
per-peril Expected Annual Loss, building-value exposure) and the actuarial anchor (loss cost =
FEMA expected-annual-loss ÷ building value, per county) are 100% REAL, straight from FEMA NRI.
Only the last-mile per-submission insured name / TIV / occupancy / construction is generated
(no free per-policy submission feed exists). The universe STRUCTURE is fixed by a constant seed,
so the same submissions reappear every run — only the hazard/loss economics move with the live
FEMA file, exactly like a real book re-rated when the risk model updates.

Outputs:
  S3  nri/counties_latest.json                 (the real FEMA county hazard file we pulled)
  S3  nri/counties_<date>.json                 (dated history)
  S3  universe/insurance_latest.json           (full computed submission universe — the working
                                                dataset the insurance tools load)
  DDB InsuranceTable                            (per-submission items — the "4k risks in DynamoDB"
                                                proof + point lookups)

Env: INSURANCE_TABLE, MARKET_BUCKET, UNIVERSE_SIZE (default 4000).
No third-party deps — urllib + boto3 only (no bundling needed).
"""
import json
import os
import random
import urllib.request
import urllib.error
from datetime import datetime, timedelta

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
INSURANCE_TABLE = os.environ.get('INSURANCE_TABLE', '')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_SIZE = int(os.environ.get('UNIVERSE_SIZE', '4000'))
# Constant seed → the universe (insureds, TIVs, occupancies) is identical every run; only the
# FEMA-derived hazard/loss economics move with the live risk file.
SEED = 20260101

_s3 = boto3.client('s3', region_name=REGION)
_ddb = boto3.resource('dynamodb', region_name=REGION)

# ── FEMA National Risk Index (public, key-free ArcGIS FeatureServer) ─────────────
# Official FEMA_NationalRiskIndex service. Layer 0 = NRI_Counties_Prod (3,232 counties,
# 18 hazards). No API key / auth. Verified live 2026-07-06.
NRI_QUERY_URL = ('https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/'
                 'National_Risk_Index_Counties/FeatureServer/0/query')


def _assert_https(url):
    """Reject any non-https URL before it reaches urlopen (which would otherwise honor
    file://, ftp://, and custom schemes — the vector bandit B310 flags). This URL is built
    from the hardcoded https FEMA NRI endpoint, so this enforces that invariant rather than
    asserting it in a comment. Returns the URL unchanged; raises ValueError otherwise."""
    if not isinstance(url, str) or not url.lower().startswith('https://'):
        raise ValueError(f'refusing non-https URL for outbound request: {url!r}')
    return url
NRI_PAGE = 2000  # server maxRecordCount

# The perils we surface, in NRI's {PREFIX}_{SUFFIX} convention. score=_RISKS (0-100),
# rating=_RISKR (text), eal=_EALT (expected annual loss $, all exposure), afreq=_AFREQ.
PERILS = {
    'Hurricane': 'HRCN', 'Wildfire': 'WFIR', 'Riverine Flood': 'IFLD', 'Coastal Flood': 'CFLD',
    'Earthquake': 'ERQK', 'Tornado': 'TRND', 'Strong Wind': 'SWND', 'Hail': 'HAIL',
    'Heat Wave': 'HWAV',
}
_PERIL_EAL_FIELDS = [f'{p}_EALT' for p in PERILS.values()]
_PERIL_SCORE_FIELDS = [f'{p}_RISKS' for p in PERILS.values()]
_PERIL_AFREQ_FIELDS = [f'{p}_AFREQ' for p in PERILS.values()]
OUT_FIELDS = ','.join([
    'STATE', 'STATEABBRV', 'COUNTY', 'STCOFIPS', 'POPULATION', 'BUILDVALUE', 'AGRIVALUE',
    'RISK_SCORE', 'RISK_RATNG', 'EAL_VALT', 'EAL_VALB', 'SOVI_SCORE', 'SOVI_RATNG',
    'RESL_SCORE', 'RESL_RATNG',
] + _PERIL_SCORE_FIELDS + _PERIL_EAL_FIELDS + _PERIL_AFREQ_FIELDS)

# Baked-in tiny county snapshot — used ONLY if FEMA is unreachable, so the demo never hard-fails.
# Real values captured from NRI for these counties (building-value $ and per-peril EAL $).
FALLBACK_COUNTIES = [
    {'STCOFIPS': '06037', 'STATE': 'California', 'STATEABBRV': 'CA', 'COUNTY': 'Los Angeles',
     'POPULATION': 10005712, 'BUILDVALUE': 1.70e12, 'RISK_SCORE': 100.0, 'RISK_RATNG': 'Very High',
     'EAL_VALB': 4.9e9, 'SOVI_SCORE': 92.0, 'RESL_SCORE': 55.0,
     'perils': {'Earthquake': {'score': 100.0, 'eal': 4.57e9}, 'Wildfire': {'score': 97.0, 'eal': 1.55e8},
                'Hurricane': {'score': 0.0, 'eal': 0.0}}},
    {'STCOFIPS': '12086', 'STATE': 'Florida', 'STATEABBRV': 'FL', 'COUNTY': 'Miami-Dade',
     'POPULATION': 2701767, 'BUILDVALUE': 4.7e11, 'RISK_SCORE': 100.0, 'RISK_RATNG': 'Very High',
     'EAL_VALB': 1.9e9, 'SOVI_SCORE': 96.0, 'RESL_SCORE': 48.0,
     'perils': {'Hurricane': {'score': 100.0, 'eal': 1.6e9}, 'Coastal Flood': {'score': 99.0, 'eal': 1.4e8}}},
    {'STCOFIPS': '48201', 'STATE': 'Texas', 'STATEABBRV': 'TX', 'COUNTY': 'Harris',
     'POPULATION': 4731145, 'BUILDVALUE': 7.4e11, 'RISK_SCORE': 100.0, 'RISK_RATNG': 'Very High',
     'EAL_VALB': 1.5e9, 'SOVI_SCORE': 88.0, 'RESL_SCORE': 52.0,
     'perils': {'Hurricane': {'score': 96.0, 'eal': 6.5e8}, 'Riverine Flood': {'score': 99.0, 'eal': 4.2e8}}},
    {'STCOFIPS': '36061', 'STATE': 'New York', 'STATEABBRV': 'NY', 'COUNTY': 'New York',
     'POPULATION': 1694251, 'BUILDVALUE': 9.2e11, 'RISK_SCORE': 98.0, 'RISK_RATNG': 'Very High',
     'EAL_VALB': 5.1e8, 'SOVI_SCORE': 72.0, 'RESL_SCORE': 64.0,
     'perils': {'Coastal Flood': {'score': 92.0, 'eal': 2.1e8}, 'Hurricane': {'score': 78.0, 'eal': 1.4e8}}},
    {'STCOFIPS': '17031', 'STATE': 'Illinois', 'STATEABBRV': 'IL', 'COUNTY': 'Cook',
     'POPULATION': 5275541, 'BUILDVALUE': 8.8e11, 'RISK_SCORE': 95.0, 'RISK_RATNG': 'Relatively High',
     'EAL_VALB': 3.8e8, 'SOVI_SCORE': 80.0, 'RESL_SCORE': 60.0,
     'perils': {'Tornado': {'score': 88.0, 'eal': 1.2e8}, 'Hail': {'score': 84.0, 'eal': 9.0e7},
                'Strong Wind': {'score': 82.0, 'eal': 8.0e7}}},
]


# ── FEMA fetch (paginated) ───────────────────────────────────────────────────--
def _fetch_page(offset):
    """One page of NRI counties as a list of attribute dicts. ArcGIS rejects the default
    urllib UA, so we send a real one. Returns (records, exceeded_transfer_limit)."""
    params = (
        'where=1%3D1'
        f'&outFields={urllib.parse.quote(OUT_FIELDS)}'
        '&orderByFields=STCOFIPS'
        f'&resultOffset={offset}&resultRecordCount={NRI_PAGE}'
        '&returnGeometry=false&f=json'
    )
    url = f'{NRI_QUERY_URL}?{params}'
    _assert_https(url)
    req = urllib.request.Request(url, headers={'User-Agent': 'RidgelineMutual-AgentCoreDemo/1.0'})
    with urllib.request.urlopen(req, timeout=25) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
        doc = json.loads(resp.read().decode())
    feats = doc.get('features', [])
    return [f.get('attributes', {}) for f in feats], bool(doc.get('exceededTransferLimit'))


def _num(v):
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def fetch_counties():
    """Pull all NRI counties from FEMA, normalizing to a compact per-county record with the
    REAL per-peril EAL + a REAL cat loss cost (EAL_building ÷ building value). Falls back to the
    baked snapshot if FEMA is unreachable. Returns (counties, source_label)."""
    raw = []
    try:
        offset = 0
        for _ in range(6):  # safety cap; 3,232 counties fit in 2 pages
            page, more = _fetch_page(offset)
            raw.extend(page)
            if not more or not page:
                break
            offset += NRI_PAGE
    except Exception as e:
        print(f'FEMA NRI fetch failed: {type(e).__name__}: {e}', flush=True)

    counties = []
    for a in raw:
        bv = _num(a.get('BUILDVALUE'))
        ealb = _num(a.get('EAL_VALB'))
        stco = a.get('STCOFIPS')
        if not stco or not bv or bv <= 0:
            continue
        perils = {}
        for name, pfx in PERILS.items():
            score = _num(a.get(f'{pfx}_RISKS'))
            eal = _num(a.get(f'{pfx}_EALT'))
            if score is None and eal is None:
                continue
            perils[name] = {'score': round(score or 0.0, 1), 'eal': round(eal or 0.0),
                            'afreq': round(_num(a.get(f'{pfx}_AFREQ')) or 0.0, 4)}
        # REAL actuarial anchor: catastrophe loss cost in bps of insured (building) value =
        # FEMA expected annual building loss ÷ building value. This is a genuine, published
        # expected-loss rate, not a made-up number.
        loss_cost_bps = round((ealb / bv) * 10000, 2) if ealb else 0.0
        counties.append({
            'stcofips': stco, 'state': a.get('STATE'), 'state_abbrv': a.get('STATEABBRV'),
            'county': a.get('COUNTY'), 'population': int(_num(a.get('POPULATION')) or 0),
            'build_value': round(bv), 'risk_score': round(_num(a.get('RISK_SCORE')) or 0.0, 1),
            'risk_rating': a.get('RISK_RATNG'), 'eal_building': round(ealb or 0.0),
            'loss_cost_bps': loss_cost_bps, 'sovi_score': round(_num(a.get('SOVI_SCORE')) or 0.0, 1),
            'resl_score': round(_num(a.get('RESL_SCORE')) or 0.0, 1), 'perils': perils,
        })
    if len(counties) >= 100:
        return counties, 'FEMA National Risk Index (ArcGIS FeatureServer, county file)'

    print('NRI incomplete — using baked county snapshot fallback.', flush=True)
    fb = []
    for c in FALLBACK_COUNTIES:
        bv, ealb = c['BUILDVALUE'], c['EAL_VALB']
        fb.append({
            'stcofips': c['STCOFIPS'], 'state': c['STATE'], 'state_abbrv': c['STATEABBRV'],
            'county': c['COUNTY'], 'population': c['POPULATION'], 'build_value': round(bv),
            'risk_score': c['RISK_SCORE'], 'risk_rating': c['RISK_RATNG'],
            'eal_building': round(ealb), 'loss_cost_bps': round((ealb / bv) * 10000, 2),
            'sovi_score': c['SOVI_SCORE'], 'resl_score': c['RESL_SCORE'],
            'perils': {n: {'score': p['score'], 'eal': round(p['eal']), 'afreq': 0.0}
                       for n, p in c['perils'].items()},
        })
    return fb, 'fallback (baked FEMA NRI snapshot — FEMA API unreachable)'


# ── Universe generation (deterministic; anchored to REAL counties) ───────────────
# Real insured names by occupancy so the book reads like a real submission pipeline.
INSUREDS = {
    'Habitational': ['Cedar Ridge Apartments LLC', 'Harborview Residences', 'Magnolia Court Homes',
                     'Summit Ridge Townhomes', 'Lakeside Living Communities'],
    'Manufacturing': ['Lakeside Manufacturing', 'Delta Precision Works', 'Ironclad Fabrication',
                      'Continental Casting Co', 'Apex Industrial Products'],
    'Retail': ['Summit Retail Group', 'Meadowbrook Shops', 'Crossroads Retail Partners',
               'Pinnacle Outlets', 'Riverbend Mercantile'],
    'Healthcare': ['Metro Health Systems', 'Cedarcrest Medical Center', 'Unity Care Network',
                   'Beacon Hospital Group', 'Wellspring Clinics'],
    'Warehouse/Logistics': ['Prairie Logistics', 'Highland Warehousing', 'Delta Foods Cold Storage',
                            'Gateway Distribution Co', 'Coastal Marine Terminal'],
    'Hospitality': ['Riverside Hospitality', 'Grand Harbor Resorts', 'Sunset Inn Group',
                    'Lakefront Lodging LLC', 'Vista Hotels & Suites'],
    'Office': ['Pinnacle Office REIT', 'Cornerstone Commercial', 'Meridian Office Trust',
               'Parkway Plaza Holdings', 'Keystone Workspaces'],
    'Energy': ['Harbor Refinery', 'Gulf Coast Energy Partners', 'Permian Midstream Co',
               'Cascade Power & Utility', 'Longhorn Petroleum'],
}
OCCUPANCIES = list(INSUREDS.keys())
CONSTRUCTION = ['Frame', 'Joisted Masonry', 'Non-Combustible', 'Masonry Non-Combustible', 'Fire-Resistive']
LINES = ['Commercial Property', 'General Liability', 'Commercial Auto', 'Umbrella', 'Workers Comp']


def _sub_id(rng, line):
    prefix = {'Commercial Property': 'CP', 'General Liability': 'GL', 'Commercial Auto': 'CA',
              'Umbrella': 'UM', 'Workers Comp': 'WC'}.get(line, 'RM')
    return f'RM-{prefix}-{rng.randint(80000, 99999)}'


def _dominant_peril(county):
    """The peril driving the most Expected Annual Loss in this county (real, from FEMA)."""
    perils = county.get('perils', {})
    if not perils:
        return None, 0.0
    top = max(perils.items(), key=lambda kv: kv[1].get('eal', 0))
    return top[0], top[1].get('score', 0.0)


def _hazard_grade(score):
    """Map a FEMA 0-100 peril risk score to an underwriting hazard grade 1 (best) - 5 (worst)."""
    return 1 + min(4, int((score or 0) / 20))


def _cat_zone(peril, score):
    """A readable cat-zone tag derived from the county's dominant real peril + severity."""
    if not peril:
        return 'Non-Cat'
    tier = 'Tier1' if (score or 0) >= 80 else ('Tier2' if (score or 0) >= 55 else 'Tier3')
    tag = {'Hurricane': 'Wind', 'Coastal Flood': 'Surge', 'Riverine Flood': 'SFHA',
           'Wildfire': 'WUI', 'Earthquake': 'Quake', 'Tornado': 'SCS', 'Strong Wind': 'SCS',
           'Hail': 'SCS', 'Heat Wave': 'Heat'}.get(peril, 'Cat')
    return f'{tag}-{tier}'


def build_universe(counties, as_of):
    """Generate ~UNIVERSE_SIZE submissions across REAL counties. Each submission's catastrophe
    economics (loss cost, expected loss, hazard grade, cat zone) derive from the REAL FEMA county
    hazard data; only the insured/TIV/occupancy/construction last-mile is modeled (seed-stable)."""
    rng = random.Random(SEED)
    # Weight county selection by building value so high-exposure counties carry more submissions,
    # exactly like a real book concentrates where insured value concentrates.
    weights = [max(1.0, c['build_value'] / 1e9) for c in counties]
    total_w = sum(weights)
    cum, acc = [], 0.0
    for w in weights:
        acc += w
        cum.append(acc / total_w)

    def pick_county():
        r = rng.random()
        for i, c in enumerate(cum):
            if r <= c:
                return counties[i]
        return counties[-1]

    subs = []
    for _ in range(UNIVERSE_SIZE):
        county = pick_county()
        occ = rng.choice(OCCUPANCIES)
        line = rng.choice(LINES)
        # TIV: log-uniform-ish spread $2M–$400M, occupancy-scaled (industrial/energy run larger).
        base_tiv = 2_000_000 * (1 + rng.random() ** 2 * 200)
        occ_mult = {'Manufacturing': 1.8, 'Energy': 3.2, 'Warehouse/Logistics': 1.5,
                    'Healthcare': 1.4, 'Office': 1.2}.get(occ, 1.0)
        tiv = round(base_tiv * occ_mult, -4)
        dom_peril, dom_score = _dominant_peril(county)
        hazard_grade = _hazard_grade(dom_score or county['risk_score'])
        # REAL loss cost from FEMA, with a modeled construction/occupancy modifier on top (a real
        # rating step — better construction lowers the cat loss cost).
        constr = rng.choice(CONSTRUCTION)
        constr_mod = {'Frame': 1.35, 'Joisted Masonry': 1.1, 'Non-Combustible': 0.95,
                      'Masonry Non-Combustible': 0.85, 'Fire-Resistive': 0.7}[constr]
        loss_cost_bps = round(county['loss_cost_bps'] * constr_mod, 2)
        expected_loss = round(tiv * loss_cost_bps / 10000, -2)
        # Technical premium = expected loss ÷ target loss ratio + expense load (a real technical
        # price identity). Target permissible loss ratio 62%, expense load applied via divisor.
        technical_premium = round(expected_loss / 0.62, -2) if expected_loss else round(tiv * 0.004, -2)
        # Rate adequacy: charged-vs-technical, seed-stable around 1.0.
        rate_adequacy = round(0.9 + rng.random() * 0.3, 2)
        subs.append({
            'sub_id': _sub_id(rng, line), 'insured': rng.choice(INSUREDS[occ]),
            'line': line, 'occupancy': occ, 'construction': constr,
            'state': county['state_abbrv'], 'county': county['county'], 'stcofips': county['stcofips'],
            'tiv': tiv, 'protection_class': 1 + min(9, int((100 - (county['resl_score'] or 50)) / 11)),
            'hazard_grade': hazard_grade, 'dominant_peril': dom_peril,
            'cat_zone': _cat_zone(dom_peril, dom_score), 'loss_cost_bps': loss_cost_bps,
            'expected_loss': expected_loss, 'technical_premium': technical_premium,
            'charged_premium': round(technical_premium * rate_adequacy, -2),
            'rate_adequacy': rate_adequacy,
            'county_risk_score': county['risk_score'], 'sovi_score': county['sovi_score'],
        })
    return subs


def _aggregate_stats(subs, counties):
    n = len(subs)
    by_line, by_state, by_occ = {}, {}, {}
    tiv = prem = eloss = 0.0
    for s in subs:
        by_line[s['line']] = by_line.get(s['line'], 0) + 1
        by_state[s['state']] = by_state.get(s['state'], 0) + 1
        by_occ[s['occupancy']] = by_occ.get(s['occupancy'], 0) + 1
        tiv += s['tiv']; prem += s['technical_premium']; eloss += s['expected_loss']
    return {
        'submission_count': n, 'counties_referenced': len({s['stcofips'] for s in subs}),
        'counties_loaded': len(counties), 'total_tiv': round(tiv), 'total_technical_premium': round(prem),
        'total_expected_loss': round(eloss), 'portfolio_loss_ratio': round(eloss / prem, 3) if prem else None,
        'avg_loss_cost_bps': round(sum(s['loss_cost_bps'] for s in subs) / n, 2) if n else 0,
        'by_line': by_line, 'by_state': dict(sorted(by_state.items(), key=lambda kv: -kv[1])[:12]),
        'by_occupancy': by_occ,
    }


# ── Persistence ──────────────────────────────────────────────────────────────
def _put_json(key, obj):
    _s3.put_object(Bucket=MARKET_BUCKET, Key=key, Body=json.dumps(obj, default=str).encode(),
                   ContentType='application/json')


def _write_dynamo(subs):
    from decimal import Decimal
    table = _ddb.Table(INSURANCE_TABLE)
    written = 0
    with table.batch_writer(overwrite_by_pkeys=['sub_id', 'dataType']) as bw:
        for s in subs:
            item = json.loads(json.dumps(s), parse_float=Decimal)
            item['dataType'] = 'submission'
            bw.put_item(Item=item)
            written += 1
    return written


def handler(event, context):
    as_of = datetime.utcnow().date()
    counties, src = fetch_counties()
    print(f'NRI counties from {src}: {len(counties)}', flush=True)

    subs = build_universe(counties, as_of)
    stats = _aggregate_stats(subs, counties)
    print(f'Generated {stats["submission_count"]} submissions across '
          f'{stats["counties_referenced"]} counties · portfolio LR {stats["portfolio_loss_ratio"]}', flush=True)

    iso = as_of.isoformat()
    counties_doc = {'as_of': iso, 'source': src, 'count': len(counties), 'counties': counties}
    universe_doc = {'as_of': iso, 'nri_source': src, 'stats': stats,
                    'counties': counties, 'submissions': subs}

    written = 0
    if MARKET_BUCKET:
        _put_json('nri/counties_latest.json', counties_doc)
        _put_json(f'nri/counties_{iso}.json', counties_doc)
        _put_json('universe/insurance_latest.json', universe_doc)
    if INSURANCE_TABLE:
        try:
            written = _write_dynamo(subs)
        except Exception as e:
            print(f'DynamoDB write failed: {type(e).__name__}: {e}', flush=True)

    return {'as_of': iso, 'nri_source': src, 'counties_loaded': len(counties),
            'submissions_generated': stats['submission_count'], 'submissions_written_ddb': written,
            'portfolio_loss_ratio': stats['portfolio_loss_ratio'],
            'avg_loss_cost_bps': stats['avg_loss_cost_bps'], 'by_state': stats['by_state']}
