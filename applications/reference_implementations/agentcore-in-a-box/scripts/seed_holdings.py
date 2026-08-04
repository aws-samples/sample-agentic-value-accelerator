#!/usr/bin/env python3
"""
Bootstrap the identity-governed Aurora "client holdings ledger" (the positions-db OpenAPI Gateway
target) over the RDS Data API. Idempotent — safe to re-run on every deploy.

WHAT IT BUILDS
  • principals(sub PK, desk, tier) — the identity → (desk, tier) map the governance keys off.
    Seeded from argv so it tracks the real Cognito subs of the demo users.
  • holdings(...) — a synthetic client-holdings ledger. Each row carries a book_desk so RLS can
    scope it, plus client_name (PII) + notional (the columns masked by tier).
  • ROW governance: an RLS policy on holdings that filters rows to the caller's desk, keyed off the
    session GUC app.principal (set by the resolver inside its transaction).
  • COLUMN governance: the view holdings_governed masks client_name → "REDACTED" and notional → NULL
    unless the caller's tier is 'senior'. The resolver SELECTs this view, never the base table.

WHY FORCE ROW LEVEL SECURITY IS NOT ENOUGH ON RDS/AURORA — THE `holdings_app` ROLE
  The Data API authenticates with the cluster MASTER secret, so the resolver connects as the table
  OWNER. Two things then defeat RLS unless we handle them:
    1. Postgres exempts the table owner from RLS by default. FORCE ROW LEVEL SECURITY fixes THAT.
    2. But on RDS/Aurora the master user is a member of `rds_superuser`, and a superuser (or member
       of one) BYPASSES RLS entirely — `row_security_active()` returns false — no matter what FORCE
       says or that the role's own `rolsuper` flag is false. FORCE alone silently bypasses.
  Fix: we create a dedicated least-privilege role `holdings_app` (NOLOGIN, NOBYPASSRLS, SELECT-only),
  grant it to the master, and the resolver does `SET LOCAL ROLE holdings_app` inside its transaction
  before selecting. RLS then actually applies. The governed view is created WITH (security_invoker =
  true) so its base-table access also runs as `holdings_app` (a security-definer view would re-open
  the owner-bypass hole). Both are the linchpin together.

WHY SEED WITH RLS DISABLED
  A USING-only policy is also the WITH CHECK for writes; with FORCE on, the owner's own INSERTs would
  be rejected (app.principal isn't set during seeding). So we DISABLE RLS, seed, then ENABLE+FORCE.
  The DB is only reachable via the resolver, and this window exists only during the deploy seed run.

Usage:
  seed_holdings.py <cluster_arn> <secret_arn> <db_name> <region> <desk:tier:sub> [<desk:tier:sub> ...]
Example:
  seed_holdings.py arn:...:cluster:... arn:...:secret:... positions us-west-2 \
      capital_markets:standard:<alice_sub> capital_markets:senior:<bob_sub> banking:standard:<rm1_sub>
"""
import sys

import boto3

REDACTED = '••• REDACTED (PII) •••'


def _p(name, value):
    """A stringValue Data API parameter (all our seed params are strings/None-safe)."""
    if value is None:
        return {'name': name, 'value': {'isNull': True}}
    return {'name': name, 'value': {'stringValue': str(value)}}


def _num(name, value):
    return {'name': name, 'value': {'doubleValue': float(value)}}


# ── Synthetic holdings ledger (deterministic; illustrative demo figures) ──────────────────────
# book_desk drives the RLS row scope. client_name + notional are the tier-masked columns.
_CM_BOOKS = ['Core Bond Fund', 'Short Duration Income Fund', 'Government Securities Fund']
_CM_CLIENTS = [
    'Cascade Public Employees Pension', 'Northwind University Endowment', 'Harbor Mutual Life',
    'Sierra Foundation Trust', 'Meridian Stable Value', 'Cascadia Insurance Group',
    'Evergreen Retirement System', 'Puget Sound Health Trust',
]
_SECTORS = ['US Treasury', 'Agency MBS', 'IG Corporate', 'Municipal', 'TIPS', 'Agency']


def _cm_rows():
    rows = []
    # 30 capital-markets rows spread across the three books/sectors/clients.
    for i in range(30):
        book = _CM_BOOKS[i % len(_CM_BOOKS)]
        sector = _SECTORS[i % len(_SECTORS)]
        client = _CM_CLIENTS[i % len(_CM_CLIENTS)]
        notional = 1_000_000 * (5 + (i * 7) % 46)          # $5MM … $50MM face
        mv = round(notional * (0.92 + ((i * 13) % 17) / 100.0), 2)  # 0.92–1.08 of face
        rows.append((f'cm-{i:03d}', book, 'capital_markets', sector, client, notional, mv))
    return rows


def _banking_rows():
    # A few banking-desk rows so cross-desk RLS is demonstrable (a CM caller must NOT see these,
    # and a banking caller must NOT see the CM book).
    clients = ['Riverside Manufacturing LLC', 'Delta Logistics Corp', 'Summit Retail Group']
    rows = []
    for i in range(6):
        notional = 1_000_000 * (10 + (i * 5) % 40)
        mv = round(notional * (0.95 + (i % 6) / 100.0), 2)
        rows.append((f'bk-{i:03d}', 'Middle Market C&I', 'banking', 'Commercial Loan',
                     clients[i % len(clients)], notional, mv))
    return rows


DDL = [
    # principals: identity → (desk, tier). No RLS (lookup table).
    """CREATE TABLE IF NOT EXISTS principals (
         sub  TEXT PRIMARY KEY,
         desk TEXT NOT NULL,
         tier TEXT NOT NULL DEFAULT 'standard'
       )""",
    # holdings: the governed ledger.
    """CREATE TABLE IF NOT EXISTS holdings (
         id           TEXT PRIMARY KEY,
         book         TEXT NOT NULL,
         book_desk    TEXT NOT NULL,
         sector       TEXT NOT NULL,
         client_name  TEXT NOT NULL,
         notional     NUMERIC NOT NULL,
         market_value NUMERIC NOT NULL,
         currency     TEXT NOT NULL DEFAULT 'USD',
         as_of        DATE NOT NULL DEFAULT CURRENT_DATE
       )""",
]

def _governance_stmts():
    """Build the governance statements (the view SQL is assembled here to avoid brittle %-escaping
    of the redaction glyph inside a module-level literal).

    NOTE: the redaction sentinel is inlined as a SQL string LITERAL, not a bind parameter. A
    CREATE VIEW body is stored (parsed and persisted) by Postgres, and a bind placeholder cannot
    be persisted into a stored view definition — the Data API rejects it with 'there is no
    parameter $1'. REDACTED is a fixed module constant (never user input), and we single-quote-
    escape it, so inlining is safe here."""
    redacted_literal = "'" + REDACTED.replace("'", "''") + "'"
    # security_invoker=true (PG15+) makes the view resolve its base-table access as the CALLER
    # (i.e. the SET-LOCAL-ROLE'd holdings_app), so RLS applies THROUGH the view. Without it the
    # view runs as its owner (holdingsadmin → rds_superuser → RLS bypassed) and returns all rows.
    view_sql = (
        "CREATE OR REPLACE VIEW holdings_governed WITH (security_invoker = true) AS "
        "SELECT h.id, h.book, h.book_desk, h.sector, "
        f"CASE WHEN p.tier = 'senior' THEN h.client_name ELSE {redacted_literal} END AS client_name, "
        "CASE WHEN p.tier = 'senior' THEN h.notional ELSE NULL END AS notional, "
        "h.market_value, h.currency, h.as_of "
        "FROM holdings h "
        "LEFT JOIN principals p ON p.sub = current_setting('app.principal', true)"
    )
    # Dedicated least-privilege application role. NOBYPASSRLS is the whole point — the resolver
    # SET LOCAL ROLEs into this so RLS is actually enforced (the master bypasses it as an
    # rds_superuser member). NOLOGIN: reachable only via SET ROLE from the already-authenticated
    # master connection, never a direct login. Idempotent via the DO-block guard.
    create_role = (
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='holdings_app') THEN "
        "CREATE ROLE holdings_app NOLOGIN NOBYPASSRLS; END IF; END $$"
    )
    return [
        (create_role, None),
        ('GRANT USAGE ON SCHEMA public TO holdings_app', None),
        # SELECT-only, on exactly the objects the resolver reads. No INSERT/UPDATE/DELETE.
        ('GRANT SELECT ON holdings, principals TO holdings_app', None),
        # Let the master SET LOCAL ROLE into it (membership is required for SET ROLE).
        ('GRANT holdings_app TO CURRENT_USER', None),
        ('DROP POLICY IF EXISTS holdings_desk_rls ON holdings', None),
        ("CREATE POLICY holdings_desk_rls ON holdings FOR SELECT USING ("
         "book_desk = (SELECT desk FROM principals "
         "WHERE sub = current_setting('app.principal', true)))", None),
        (view_sql, None),
        # The view is owned by the master; grant the app role SELECT on it too (security_invoker
        # still checks the caller's privilege on the view itself).
        ('GRANT SELECT ON holdings_governed TO holdings_app', None),
        ('ALTER TABLE holdings ENABLE ROW LEVEL SECURITY', None),
        # Apply RLS to the table owner too (defence-in-depth; the resolver also drops to holdings_app).
        ('ALTER TABLE holdings FORCE ROW LEVEL SECURITY', None),
    ]


def main():
    if len(sys.argv) < 6:
        print(__doc__)
        return 1
    cluster_arn, secret_arn, db_name, region = sys.argv[1:5]
    principal_specs = sys.argv[5:]

    rds = boto3.client('rds-data', region_name=region)

    def exec_sql(sql, params=None):
        kw = {'resourceArn': cluster_arn, 'secretArn': secret_arn, 'database': db_name, 'sql': sql}
        if params:
            kw['parameters'] = params
        return rds.execute_statement(**kw)

    # 1) DDL (auto-commit; IF NOT EXISTS → idempotent).
    for sql in DDL:
        exec_sql(sql)
    print('  holdings: tables ready')

    # 2) Disable RLS so owner-seeding is never blocked by the policy's implicit WITH CHECK.
    exec_sql('ALTER TABLE holdings DISABLE ROW LEVEL SECURITY')

    # 3) Seed principals from argv (ON CONFLICT keeps desk/tier fresh across re-runs).
    seeded = 0
    for spec in principal_specs:
        parts = spec.split(':')
        if len(parts) != 3:
            print(f'  holdings: skipping malformed principal spec {spec!r}')
            continue
        desk, tier, sub = (p.strip() for p in parts)
        if not sub or sub == 'None':
            print(f'  holdings: skipping principal with empty sub ({desk}/{tier})')
            continue
        exec_sql(
            'INSERT INTO principals (sub, desk, tier) VALUES (:sub, :desk, :tier) '
            'ON CONFLICT (sub) DO UPDATE SET desk = EXCLUDED.desk, tier = EXCLUDED.tier',
            [_p('sub', sub), _p('desk', desk), _p('tier', tier)],
        )
        seeded += 1
    print(f'  holdings: seeded {seeded} principal(s)')

    # 4) Seed holdings (ON CONFLICT DO NOTHING → stable, idempotent).
    for (hid, book, desk, sector, client, notional, mv) in (_cm_rows() + _banking_rows()):
        exec_sql(
            'INSERT INTO holdings (id, book, book_desk, sector, client_name, notional, market_value)'
            ' VALUES (:id, :book, :desk, :sector, :client, :notional, :mv) '
            'ON CONFLICT (id) DO NOTHING',
            [_p('id', hid), _p('book', book), _p('desk', desk), _p('sector', sector),
             _p('client', client), _num('notional', notional), _num('mv', mv)],
        )
    cnt = exec_sql('SELECT count(*) FROM holdings').get('records', [[{'longValue': 0}]])
    total = cnt[0][0].get('longValue', '?') if cnt else '?'
    print(f'  holdings: {total} row(s) present')

    # 5) (Re)build governance objects and ENABLE + FORCE RLS.
    for sql, params in _governance_stmts():
        exec_sql(sql, params)
    print('  holdings: RLS policy + governed view rebuilt, FORCE ROW LEVEL SECURITY on')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
