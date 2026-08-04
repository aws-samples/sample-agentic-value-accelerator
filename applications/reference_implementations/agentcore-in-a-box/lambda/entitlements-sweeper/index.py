"""
Entitlements expiry SWEEPER — the live-revocation companion to lazy expiry.

Time-boxed grants (the "just-in-time" access layer) lapse LAZILY: agent/main.py and the WS/admin
enforcement points all call entitlements.evaluate(now=...), which collapses any grant whose
`expiries[key]` is in the past to DENY on the caller's very next turn. That makes expiry
AUTHORITATIVE without any scheduler. This sweeper is NOT the security boundary — it is the UX +
hygiene layer on top:

  1. LIVE UI: when a grant lapses while the user is sitting idle, nothing would tell their browser
     until they next act. The sweeper rewrites the lapsed grant to false and pushes the SAME
     `entitlements_changed` frame the admin-api push uses, so the desk/specialist greys out within
     the sweep interval — the "access just expired" moment is visible.
  2. HYGIENE: it strips the stale `expiries[key]` and flips `grants[key]=false` so the stored item
     reflects reality (no unbounded growth of dead expiry entries in the row).

Scope note (deliberate): the sweeper does NOT re-materialize the Cedar per-tool blocklist or the
IAM cred-Deny. Those are GLOBAL kill-switches (Cedar forbids a tool only when EVERY managed user is
revoked; the IAM Deny is per-agent-cred) — a single user's time-boxed grant lapsing is enforced
per-user by the runtime pre-check + Gateway interceptor on their very next call regardless, which
is where lazy expiry already bites. Keeping the sweeper free of the cedar.py/iam_creds.py bundle +
broad IAM keeps it a minimal, read-mostly janitor. If an expiry ever needs to flip a GLOBAL block,
the admin toggling that key through the admin-api re-materializes it there.

Triggered by an EventBridge rate rule (deploy.sh / CDK, ~1 min). Idempotent: an item with no
past-due expiries is skipped, so a re-run costs one scan and no writes. Single-sourced
entitlements.py is copied in by deploy.sh (same pattern as admin-api / gateway-interceptor).
"""
import json
import os
import time

import boto3

import entitlements as E

REGION = os.environ.get('REGION', 'us-west-2')
ENTITLEMENTS_TABLE = os.environ.get('ENTITLEMENTS_TABLE', '')
CONNECTIONS_TABLE = os.environ.get('CONNECTIONS_TABLE', '')
WS_ENDPOINT = os.environ.get('WS_ENDPOINT', '')

# The dimensions that can carry time-boxed grants (creds included — an agent-cred grant may be
# time-boxed too). meta never carries grants/expiries.
_SWEEPABLE_DT = (E.DT_TOOLS, E.DT_DESKS, E.DT_CREDS, E.DT_AGENTS)

_ddb = boto3.resource('dynamodb', region_name=REGION)
_table = _ddb.Table(ENTITLEMENTS_TABLE) if ENTITLEMENTS_TABLE else None


def _scan_all(**kwargs):
    """Fully-paginated scan (a single scan returns at most 1 MB / one page)."""
    items, lek = [], None
    while True:
        if lek:
            kwargs['ExclusiveStartKey'] = lek
        resp = _table.scan(**kwargs)
        items += resp.get('Items', [])
        lek = resp.get('LastEvaluatedKey')
        if not lek:
            return items


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _sweep_item(item, now):
    """If this grants item has any past-due expiry, rewrite it (grant→false, drop the expiry) and
    return (changed, lapsed_keys). Otherwise (False, [])."""
    grants = dict(item.get('grants') or {})
    expiries = dict(item.get('expiries') or {})
    lapsed = [k for k, e in expiries.items() if _int(e) and _int(e) <= now and grants.get(k)]
    if not lapsed:
        return False, []
    for k in lapsed:
        grants[k] = False
        expiries.pop(k, None)
    item['grants'] = {k: bool(v) for k, v in grants.items()}
    item['expiries'] = {k: _int(e) for k, e in expiries.items()}
    item['updated_at'] = now
    item['updated_by'] = 'expiry-sweeper'
    _table.put_item(Item=item)
    return True, lapsed


def _push_entitlements_changed(sub):
    """Push the caller's fresh effective view to their live WS connections (best-effort)."""
    if not (CONNECTIONS_TABLE and WS_ENDPOINT and sub):
        return
    try:
        from boto3.dynamodb.conditions import Attr, Key
        conns = _ddb.Table(CONNECTIONS_TABLE)
        items, lek = [], None
        while True:
            kw = {'FilterExpression': Attr('userId').eq(sub), 'ProjectionExpression': 'connectionId'}
            if lek:
                kw['ExclusiveStartKey'] = lek
            resp = conns.scan(**kw)
            items += resp.get('Items', [])
            lek = resp.get('LastEvaluatedKey')
            if not lek:
                break
        if not items:
            return
        # Fresh effective view for this principal.
        pr = E.user_pk(sub)
        eff = E.evaluate(
            {it['dataType']: it for it in _table.query(
                KeyConditionExpression=Key('principal').eq(pr)).get('Items', [])},
            now=time.time())
        apigw = boto3.client('apigatewaymanagementapi', endpoint_url=WS_ENDPOINT, region_name=REGION)
        data = json.dumps({'type': 'entitlements_changed', 'entitlements': eff}, default=_json_default).encode()
        for it in items:
            cid = it['connectionId']
            try:
                apigw.post_to_connection(ConnectionId=cid, Data=data)
            except apigw.exceptions.GoneException:
                conns.delete_item(Key={'connectionId': cid})
            except Exception as e:
                print(f'SWEEP PUSH WARN {cid}: {type(e).__name__}: {e}', flush=True)
    except Exception as e:
        print(f'SWEEP PUSH SCAN WARN: {type(e).__name__}: {e}', flush=True)


def handler(event, context):
    if _table is None:
        print('SWEEPER: ENTITLEMENTS_TABLE not configured — no-op', flush=True)
        return {'swept': 0}
    now = int(time.time())
    swept, affected_users = 0, set()
    try:
        items = _scan_all()
    except Exception as e:
        print(f'SWEEPER SCAN ERROR: {type(e).__name__}: {e}', flush=True)
        return {'error': str(e)}
    for item in items:
        if item.get('dataType') not in _SWEEPABLE_DT:
            continue
        try:
            changed, lapsed = _sweep_item(item, now)
        except Exception as e:
            print(f'SWEEP ITEM WARN {item.get("principal")}/{item.get("dataType")}: {type(e).__name__}: {e}', flush=True)
            continue
        if changed:
            swept += 1
            principal = item.get('principal', '')
            print(f'SWEEP lapsed principal={principal} dt={item.get("dataType")} keys={lapsed}', flush=True)
            if principal.startswith('user#'):
                affected_users.add(principal.split('#', 1)[1])
    # Live UI update for anyone whose grants just lapsed.
    for sub in affected_users:
        _push_entitlements_changed(sub)
    return {'swept': swept, 'users_notified': len(affected_users), 'now': now}


def _json_default(o):
    from decimal import Decimal
    if isinstance(o, Decimal):
        return int(o) if o % 1 == 0 else float(o)
    return str(o)
