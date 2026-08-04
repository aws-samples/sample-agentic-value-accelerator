"""
Positions-DB resolver — the thin compute BEHIND the AgentCore Gateway OpenAPI target.

The Gateway target for `query_holdings` is an OpenAPI/HTTP endpoint (NOT a Lambda target); this
Lambda sits behind that HTTP API and runs the actual SQL over the RDS Data API. It is the piece
that turns a VERIFIED caller identity into a row/column-governed result:

  • ROW governance   — a Postgres RLS policy on `holdings` filters rows to the caller's DESK, keyed
                       off a session variable (`app.principal`) we set inside the transaction.
  • COLUMN governance — the resolver SELECTs the governed view `holdings_governed`, which masks
                       client_name (PII) and notional unless the caller's TIER is senior.

Identity trust (never trust the model):
  • `principal_sub` arrives in the request body. On the desk path the runtime injects the verified
    Cognito sub (agent/main.py, mirroring user_data_lookup); at the Gateway boundary the REQUEST
    interceptor OVERWRITES `principal_sub` from the cryptographically-verified principal before
    forwarding. So by the time it reaches here it is authoritative, not a model-supplied value.
  • This resolver treats `principal_sub` as the SOLE identity input. It looks up (desk, tier)
    SERVER-SIDE from the `principals` table via the session var — the model never supplies desk/tier.
  • FAIL CLOSED: a missing/empty/malformed principal_sub is a hard 400, never an unscoped scan
    (same IDOR guard as lambda/userdata-tool/index.py).

Outbound auth: OpenAPI targets can't use GATEWAY_IAM_ROLE (Lambda-only), so the Gateway injects a
shared API key (API_KEY credential provider) as a header; we validate it against the same secret.

boto3/stdlib only (zip-from-asset).
"""
import json
import os

import boto3

REGION = os.environ.get('AWS_REGION', 'us-west-2')
DB_CLUSTER_ARN = os.environ.get('DB_CLUSTER_ARN', '')
DB_SECRET_ARN = os.environ.get('DB_SECRET_ARN', '')
DB_NAME = os.environ.get('DB_NAME', 'positions')
GW_KEY_SECRET_ARN = os.environ.get('GW_KEY_SECRET_ARN', '')

# The header the Gateway API_KEY credential provider is configured to inject (deploy.sh sets the
# provider's credentialLocation=HEADER, credentialParameterName to this). Compared case-insensitively.
API_KEY_HEADER = 'x-meridian-api-key'

_rds = boto3.client('rds-data', region_name=REGION)
_sm = boto3.client('secretsmanager', region_name=REGION)

# Cache the expected API key across warm invocations (it never rotates within a deploy).
_EXPECTED_KEY = None


def _expected_key():
    global _EXPECTED_KEY
    if _EXPECTED_KEY is None and GW_KEY_SECRET_ARN:
        try:
            raw = _sm.get_secret_value(SecretId=GW_KEY_SECRET_ARN)['SecretString']
            _EXPECTED_KEY = json.loads(raw).get('apiKey', '')
        except Exception as e:
            print(f'RESOLVER: failed to load gateway key secret: {type(e).__name__}: {e}', flush=True)
            _EXPECTED_KEY = ''
    return _EXPECTED_KEY or ''


def _resp(status, payload):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(payload, default=str),
    }


def _headers_lower(event):
    """API Gateway v2 lowercases header keys, but be defensive across invoke shapes."""
    h = event.get('headers') or {}
    return {str(k).lower(): v for k, v in h.items()}


def _parse_body(event):
    """The tool arguments arrive as the HTTP request body (JSON). Direct-invoke passes a dict."""
    body = event.get('body')
    if body is None:
        # Direct invoke / test — the event itself may be the arguments.
        return event if isinstance(event, dict) else {}
    if isinstance(body, dict):
        return body
    try:
        return json.loads(body or '{}')
    except (ValueError, TypeError):
        return {}


def _exec(sql, params=None, transaction_id=None, format_json=False):
    kwargs = {
        'resourceArn': DB_CLUSTER_ARN,
        'secretArn': DB_SECRET_ARN,
        'database': DB_NAME,
        'sql': sql,
    }
    if params:
        kwargs['parameters'] = params
    if transaction_id:
        kwargs['transactionId'] = transaction_id
    if format_json:
        kwargs['formatRecordsAs'] = 'JSON'
    return _rds.execute_statement(**kwargs)


def handler(event, context):
    # 1) Validate the Gateway-injected shared key. If the secret is wired but the header is absent
    #    or wrong, reject — this endpoint is reachable only via the Gateway credential provider.
    expected = _expected_key()
    if expected:
        supplied = _headers_lower(event).get(API_KEY_HEADER, '')
        if supplied != expected:
            print('RESOLVER DENY: missing/invalid gateway API key', flush=True)
            return _resp(403, {'error': 'forbidden'})

    body = _parse_body(event)

    # 2) FAIL CLOSED on identity. principal_sub is server-injected + interceptor-verified; a bad or
    #    empty value is a hard 400 (never a broad, unscoped scan — the IDOR guard).
    principal_sub = (body.get('principal_sub') or '').strip()
    if (not principal_sub or len(principal_sub) > 128
            or any(c in principal_sub for c in ("'", '"', ';', '\n', '\t', '%', '*'))):
        print('RESOLVER DENY: missing/invalid principal_sub', flush=True)
        return _resp(400, {'error': 'a valid, specific caller identity is required'})

    if not (DB_CLUSTER_ARN and DB_SECRET_ARN):
        return _resp(500, {'error': 'positions-db not configured'})

    # 3) Model-supplied filters (safe — bound as parameters, never interpolated).
    sector = (body.get('sector') or '').strip() or None
    try:
        min_mv = float(body['min_market_value']) if body.get('min_market_value') not in (None, '') else None
    except (ValueError, TypeError):
        min_mv = None
    try:
        limit = int(body.get('limit', 100))
    except (ValueError, TypeError):
        limit = 100
    limit = max(1, min(limit, 500))  # clamp

    where = []
    params = [{'name': 'principal', 'value': {'stringValue': principal_sub}}]
    if sector:
        where.append('sector = :sector')
        params.append({'name': 'sector', 'value': {'stringValue': sector}})
    if min_mv is not None:
        where.append('market_value >= :min_mv')
        params.append({'name': 'min_mv', 'value': {'doubleValue': min_mv}})
    where_sql = (' WHERE ' + ' AND '.join(where)) if where else ''
    select_sql = (
        'SELECT book, sector, client_name, notional, market_value, currency, as_of '
        f'FROM holdings_governed{where_sql} ORDER BY market_value DESC LIMIT {limit}'
    )

    # 4) RLS requires a session var set INSIDE the same transaction as the SELECT (set_config with
    #    is_local=true is scoped to the txn). The Data API pools connections, so we must Begin →
    #    (drop role) → set_config → Select → Commit as one transaction; the governed view + RLS
    #    policy read the var via current_setting('app.principal', true).
    #
    #    SET LOCAL ROLE holdings_app is the linchpin on RDS/Aurora: the Data API connects as the
    #    cluster master, which is a member of rds_superuser and therefore BYPASSES RLS entirely
    #    (row_security_active() == false) even with FORCE ROW LEVEL SECURITY. holdings_app is a
    #    dedicated NOBYPASSRLS, SELECT-only role (created by scripts/seed_holdings.py); dropping to
    #    it for the duration of the txn makes RLS actually enforce. The governed view is
    #    security_invoker=true so it, too, reads the base table as this role.
    txn = None
    try:
        txn = _rds.begin_transaction(
            resourceArn=DB_CLUSTER_ARN, secretArn=DB_SECRET_ARN, database=DB_NAME,
        )['transactionId']
        _exec('SET LOCAL ROLE holdings_app', transaction_id=txn)
        _exec("SELECT set_config('app.principal', :principal, true)", params=[
            {'name': 'principal', 'value': {'stringValue': principal_sub}},
        ], transaction_id=txn)
        result = _exec(select_sql, params=params, transaction_id=txn, format_json=True)
        _rds.commit_transaction(resourceArn=DB_CLUSTER_ARN, secretArn=DB_SECRET_ARN, transactionId=txn)
    except Exception as e:
        if txn:
            try:
                _rds.rollback_transaction(
                    resourceArn=DB_CLUSTER_ARN, secretArn=DB_SECRET_ARN, transactionId=txn)
            except Exception:
                pass
        print(f'RESOLVER ERROR: {type(e).__name__}: {e}', flush=True)
        return _resp(500, {'error': 'query failed'})

    rows = json.loads(result.get('formattedRecords') or '[]')
    return _resp(200, {
        'rows': rows,
        'row_count': len(rows),
        'governance': {
            'row_level': 'RLS filters rows to your desk',
            'column_level': 'client_name / notional are masked unless your tier is senior',
        },
        'source': 'Aurora PostgreSQL (identity-governed via AgentCore Gateway)',
        'disclaimer': 'Synthetic demo holdings. Row/column visibility is governed by your verified identity.',
    })
