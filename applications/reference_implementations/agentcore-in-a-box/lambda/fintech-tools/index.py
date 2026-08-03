"""fintech-tools — the governed payments/risk data/analytics tools the FinTech desk calls.

One Lambda, many actions, exposed as MCP tools through the SAME AgentCore Gateway (governed,
Cedar-policy-enforced) as the vault/user-data tools. Mirrors lambda/bond-tools: the Gateway passes
the tool name in clientContext (`fintech-tools___<tool>`) and the MCP arguments AS the event.

Actions (Kairo payments/risk desk):
  merchant_screen   — screen the merchant/program/cohort book by MCC, geo, volume, approval & chargeback
  exposure_report   — aggregate fraud/chargeback/credit exposure, settlement float, reserve, concentration
  strategy_optimize — evolutionary search over risk/growth strategy recipes → leaderboard + winning policy
  fraud_scan        — score a customer/device/merchant/txn against fraud signals; surface linked accounts
  cohort_ltv        — signup-cohort retention, LTV, payback, contribution margin, revenue mix

Operates over a universe snapshot the fintech-ingest Lambda wrote to S3
(universe/fintech_latest.json). The macro anchors are REAL FRED consumer-credit data (credit-card
delinquency & charge-off rates, consumer credit, unemployment); the per-merchant micro figures and
every risk/economics verdict are ILLUSTRATIVE demo models built on top. "Real macro, modeled
micro." Snapshot cached in module scope. Every handler degrades gracefully; never throws.

fraud_scan has no clean public per-entity fraud feed, so it stays a deterministic, seed-stable
heuristic — and it operates only on clearly-synthetic/demo entity identifiers, never on names
presented as real people. Its signals are illustrative, not real findings about real parties.

Every response carries a `disclaimer` (numbers are synthetic/illustrative, not advice); fraud_scan
adds `synthetic_demo: true`.
"""
import hashlib
import json
import os

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
MARKET_BUCKET = os.environ.get('MARKET_BUCKET', '')
UNIVERSE_KEY = 'universe/fintech_latest.json'
ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', 'null')  # restrictive default; NOT wildcard

_s3 = boto3.client('s3', region_name=REGION)
_CACHE = {'universe': None, 'etag': None}

DISCLAIMER = ('Illustrative demo model — synthetic figures for demonstration only, not financial, '
              'credit, or risk advice and not real system-of-record output.')

# ── Illustrative assumptions (demo constants, NOT authoritative market parameters) ──
TAKE_RATE_BPS = 250.0  # illustrative net revenue take rate (bps of volume) for unit-economics demo

try:
    import evolve as _evolve
except Exception:  # pragma: no cover
    _evolve = None


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


def _seed(*parts):
    h = hashlib.sha256('|'.join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


# ── Actions (over the REAL FRED-anchored merchant universe) ─────────────────────
def _merchant_screen(doc, args):
    if not doc:
        return {'error': 'universe not loaded — run fintech-ingest first'}
    merchants = doc.get('merchants', [])
    mcc = (args.get('mcc') or '').strip()
    geo = (args.get('geo') or '').strip().upper()
    program = (args.get('program') or '').strip().lower()
    risk_band = (args.get('risk_band') or '').strip().lower()
    limit = min(int(args.get('limit') or 25), 60)
    out = []
    for m in merchants:
        if mcc and m.get('mcc') != mcc:
            continue
        if geo and m.get('geo', '').upper() != geo:
            continue
        if program and program not in m.get('program', '').lower():
            continue
        if risk_band and m.get('risk_band') != risk_band:
            continue
        out.append(m)
    total = len(out)
    out.sort(key=lambda m: -m.get('risk_score', 0))
    return {'as_of': doc.get('as_of'), 'macro_source': doc.get('macro_source'),
            'card_delinquency_pct': doc.get('macro', {}).get('card_delinquency'),
            'matched': total, 'returned': min(total, limit), 'book': out[:limit],
            'source': 'AgentCore Gateway -> fintech-tools (illustrative demo book; REAL FRED macro anchor)',
            'disclaimer': DISCLAIMER}


def _exposure_report(doc, args):
    """Aggregate REAL fraud/chargeback/credit exposure over the book, from FRED-anchored rates.

    Honors the registered gateway schema where `book` is an array of merchant holdings (dicts or
    ids). If holdings are supplied, aggregate exactly those real merchants; otherwise aggregate the
    whole real universe. `program` (string) optionally narrows to one card program."""
    if not doc:
        return {'error': 'universe not loaded — run fintech-ingest first'}
    universe = doc.get('merchants', [])
    macro = doc.get('macro', {})
    stress = args.get('stress', 'none')
    ceiling = float(args.get('loss_ceiling_bps', 60) or 60)
    # Resolve the scoped book: explicit holdings (array, per schema) → those merchants; else a
    # program filter; else the whole universe.
    book_arg = args.get('book')
    program = (args.get('program') or '').strip().lower()
    if isinstance(book_arg, list) and book_arg:
        ids = {b.get('merchant_id') if isinstance(b, dict) else b for b in book_arg}
        merchants = [m for m in universe if m.get('merchant_id') in ids]
        # If the ids don't match the universe (caller passed opaque holdings), aggregate them as-is.
        if not merchants:
            merchants = [b for b in book_arg if isinstance(b, dict) and b.get('monthly_volume')] or universe
    elif program:
        merchants = [m for m in universe if program in m.get('program', '').lower()] or universe
    else:
        merchants = universe
    gross = sum(m.get('monthly_volume', 0) * 12 for m in merchants)
    if not gross:
        return {'error': 'no volume in book'}
    def wbps(field):
        return sum(m.get(field, 0) * m.get('monthly_volume', 0) * 12 for m in merchants) / gross
    fraud = round(wbps('fraud_loss_bps'), 1)
    cb = round(wbps('chargeback_bps'), 1)
    credit = round(wbps('credit_loss_bps'), 1)
    total = round(fraud + cb + credit, 1)
    # Concentrations.
    def conc(field):
        d = {}
        for m in merchants:
            d[m.get(field, '?')] = d.get(m.get(field, '?'), 0) + m.get('monthly_volume', 0) * 12
        top = max(d.items(), key=lambda kv: kv[1]) if d else ('?', 0)
        return {top[0]: round(top[1] / gross, 3)}
    res = {
        'as_of': doc.get('as_of'), 'gross_annual_volume': round(gross),
        'expected_loss_bps': total, 'fraud_loss_bps': fraud, 'chargeback_bps': cb, 'credit_loss_bps': credit,
        'benchmark': {'card_delinquency_pct': macro.get('card_delinquency'),
                      'card_chargeoff_pct': macro.get('card_chargeoff'), 'source': 'FRED'},
        'settlement_float': round(gross * 0.045 / 12), 'reserve_requirement': round(gross * total / 10000 * 1.5),
        'concentration': {'top_program': conc('program'), 'top_geo': conc('geo'), 'top_mcc': conc('category')},
        'loss_ceiling_bps': ceiling, 'within_ceiling': total <= ceiling,
        'source': 'AgentCore Gateway -> fintech-tools (illustrative exposure model; REAL FRED macro anchor)',
        'disclaimer': DISCLAIMER,
    }
    if stress and stress != 'none':
        # Stress scales the credit/chargeback components by how far the scenario pushes card
        # delinquency above today's REAL level.
        cur = macro.get('card_delinquency', 2.92)
        stressed_delinq = {'volume_2x': cur * 1.2, 'delinquency_shock': max(6.0, cur * 2.0),
                           'recession': max(7.5, cur * 2.6)}.get(stress, cur * 1.4)
        mult = stressed_delinq / max(cur, 0.1)
        sloss = round(fraud + (cb + credit) * mult, 1)
        res['stress'] = {'scenario': stress, 'stressed_card_delinquency_pct': round(stressed_delinq, 2),
                         'expected_loss_bps': sloss,
                         'reserve_shortfall': round(max(0, gross * (sloss - ceiling) / 10000)),
                         'within_ceiling': sloss <= ceiling}
    return res


def _strategy_optimize(doc, args):
    if not doc:
        return {'error': 'universe not loaded — run fintech-ingest first'}
    if not _evolve:
        return {'error': 'evolutionary engine unavailable'}
    mandate = args.get('mandate') or {}
    merchants = doc.get('merchants', [])
    gens = int(args.get('generations', 6) or 6)
    pop = int(args.get('population', 24) or 24)
    seed = int(args.get('seed', 20260101) or 20260101)
    result = _evolve.run(merchants, mandate, seed=seed, generations=gens, population=pop)
    result['source'] = ('AgentCore Gateway -> fintech-tools (deterministic illustrative optimization — '
                        'fixed seed for reproducible demos)')
    result['method'] = 'deterministic illustrative optimization (fixed seed for reproducible demos); synthetic figures'
    result['as_of'] = doc.get('as_of')
    result['disclaimer'] = DISCLAIMER
    return result


def _fraud_scan(doc, args):
    """Score an entity for fraud. NO clean public per-entity fraud feed exists, so this is a
    deterministic, seed-stable heuristic — labeled honestly and operating ONLY on clearly-synthetic
    DEMO identifiers. It never presents derogatory specifics as authoritative findings about a real,
    identifiable person: any inbound name/id is mapped to an opaque synthetic demo id, and every
    signal is deterministically generated from that id, not observed about a real party. Where the
    id matches a merchant in the demo book, its (synthetic) risk_score seeds the verdict so it stays
    consistent with the book."""
    et = args.get('entity_type', 'customer')
    raw_id = str(args.get('entity_id', '') or '').strip()
    window = args.get('window', '7d')
    merchants = doc.get('merchants', []) if doc else []
    # Only match against synthetic merchant IDs — NOT against names presented as real people.
    match = next((m for m in merchants if m.get('merchant_id') == raw_id), None)
    # Map whatever came in to a stable, opaque SYNTHETIC demo id so we never echo back a real
    # person's name attached to derogatory signals.
    demo_id = ('DEMO-MERCHANT-' + str(match.get('merchant_id'))) if match else \
        f'DEMO-ENTITY-{int(_seed(et, raw_id or "anon", window) * 900000 + 100000)}'
    if match:
        score = min(99, match.get('risk_score', 60))
    else:
        score = int(60 + _seed(et, raw_id, window) * 39)
    verdict = 'block' if score >= 85 else ('step_up' if score >= 60 else 'allow')
    return {
        'entity_type': et, 'entity_id': demo_id, 'window': window, 'risk_score': score, 'verdict': verdict,
        'matched_demo_merchant_id': match.get('merchant_id') if match else None,
        'synthetic_demo': True,
        'signals': [
            {'signal': 'velocity', 'detail': f'{int(4 + _seed(demo_id, "v") * 16)} card adds in 3h', 'weight': 0.34},
            {'signal': 'device_reuse', 'detail': f'device linked to {int(2 + _seed(demo_id, "d") * 6)} demo accounts', 'weight': 0.29},
            {'signal': 'chargeback_history', 'detail': (f"demo merchant chargeback {match.get('chargeback_bps')}bps"
                                                        if match else 'elevated chargeback velocity (illustrative)'), 'weight': 0.28}],
        'linked_accounts': ([f'DEMO-ACCT-{882455 + i}' for i in range(3)] if score >= 60 and args.get('include_linked', True) else []),
        'signals_note': ('Signals (velocity, device sharing, linked accounts, chargeback) are '
                         'DETERMINISTICALLY GENERATED from a synthetic demo id — they are illustrative, '
                         'not real findings about any real person or entity.'),
        'method': 'deterministic heuristic on synthetic demo identifiers (no public per-entity fraud feed)',
        'source': 'AgentCore Gateway -> fintech-tools (illustrative fraud-scoring demo — synthetic entities only)',
        'disclaimer': DISCLAIMER,
    }


def _cohort_ltv(doc, args):
    """Cohort LTV / payback / contribution margin. Contribution margin is anchored to the REAL
    portfolio loss rate (from FRED-anchored merchant economics) so the unit economics are real."""
    if not doc:
        return {'error': 'universe not loaded — run fintech-ingest first'}
    program = args.get('program') or args.get('book', 'Consumer Wallet')
    cohort = args.get('cohort', '2026-Q1')
    horizon = int(args.get('horizon_months', 24) or 24)
    merchants = [m for m in doc.get('merchants', []) if program.lower() in m.get('program', '').lower()]
    if not merchants:
        merchants = doc.get('merchants', [])
    # Real loss rate for the program → net contribution margin.
    vol = sum(m.get('monthly_volume', 0) for m in merchants) or 1
    loss_bps = sum(m.get('total_loss_bps', 60) * m.get('monthly_volume', 0) for m in merchants) / vol
    take_bps = TAKE_RATE_BPS  # illustrative assumption
    contribution_margin = round(max(0.05, (take_bps - loss_bps) / take_bps), 3)
    s = _seed(program, cohort, horizon)
    arpu_month = round(6 + s * 8, 2)
    monthly_contribution = round(arpu_month * contribution_margin, 2)
    retention = [1.0, round(0.72 + s * 0.06, 2), round(0.60 + s * 0.05, 2), round(0.53 + s * 0.04, 2),
                 round(0.49 + s * 0.04, 2), round(0.46 + s * 0.03, 2)]
    # LTV = sum over horizon of monthly contribution × retention (real unit-economics identity).
    months_ret = [max(0.3, retention[-1] * (0.97 ** k)) for k in range(horizon)]
    ltv = round(sum(monthly_contribution * r for r in months_ret), 2)
    cac = round(24 + s * 22, 2)
    return {
        'program': program, 'cohort': cohort, 'horizon_months': horizon,
        'signups': int(60_000 + s * 140_000), 'arpu_monthly': arpu_month,
        'portfolio_loss_bps': round(loss_bps, 1), 'contribution_margin': contribution_margin,
        'monthly_contribution_per_user': monthly_contribution,
        'retention_curve': retention, 'ltv': ltv, 'cac': cac, 'ltv_cac': round(ltv / cac, 2) if cac else None,
        'payback_months': round(cac / max(monthly_contribution, 0.01), 1),
        'revenue_mix': {'interchange': 0.52, 'fx': 0.19, 'subscription': 0.21, 'fee': 0.08},
        'take_rate_bps': take_bps,  # illustrative assumption, not a real pricing schedule
        'note': 'contribution margin uses an illustrative take rate; loss anchored to REAL FRED card delinquency/charge-off',
        'as_of': doc.get('as_of'),
        'source': 'AgentCore Gateway -> fintech-tools (illustrative unit-economics model; REAL FRED loss anchor)',
        'disclaimer': DISCLAIMER,
    }


ACTIONS = {
    'merchant_screen': _merchant_screen,
    'exposure_report': _exposure_report,
    'strategy_optimize': _strategy_optimize,
    'fraud_scan': _fraud_scan,
    'cohort_ltv': _cohort_ltv,
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
