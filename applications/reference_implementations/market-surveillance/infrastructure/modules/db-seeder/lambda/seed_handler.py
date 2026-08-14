"""Aurora seeder Lambda — in-VPC, idempotent.

Runs the market-surveillance `seeding_scripts` package in-process:

  1. Idempotency probe. Count tables in the `public` schema. If any exist,
     assume the DB is already seeded and return early — this makes redeploys
     cheap (~seconds) and lets operators safely re-invoke the Lambda by hand
     after a partial failure.

  2. Schema init. `seeding_scripts.db_ops.db_init.main(argv)` — reads
     `schema.yaml` and runs the DDL against Aurora.

  3. Data generation. `seeding_scripts.data_gen.main(argv)` — generates
     synthetic CSVs into /tmp/synthetic_data (Lambda's writable scratch;
     ephemeral, per-invocation).

  4. Data load. `seeding_scripts.database_seeding.seed.main(argv)` — reads
     the /tmp CSVs and INSERTs into the tables in FK-dependency order.

Environment variables (set by Terraform):

  DB_SECRET_ARN  Secrets Manager secret containing HOST/PORT/DBNAME/USERNAME/PASSWORD
  DB_NAME        Fallback if the secret lacks DBNAME (older schemas)
  AWS_REGION     Set automatically by the Lambda runtime

Payload (all optional):

  { "force": true }   Bypass the idempotency check and truncate-then-seed.
                      NOT the default — must be explicit to prevent
                      accidental data loss.

Returns:

  Success:
    {"seeded": {"tables_created": <int>, "rows_loaded": {<table>: <n>}}, "seconds": <float>}
  Already seeded:
    {"already_seeded": true, "existing_tables": <int>}

Raises (Lambda invocation returns FunctionError=Handled):

  Any exception aborts the Lambda; deploy.sh reads the response and fails
  the CodeBuild step. Never silently returns success on partial failure.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any, Dict

import boto3
import psycopg

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# The seeding_scripts package is packaged next to this handler at the root
# of the Lambda zip. Ensure /var/task is on sys.path (Lambda default) and
# that we can find the package.
sys.path.insert(0, os.path.dirname(__file__))


def _db_creds() -> Dict[str, str]:
    """Fetch DB credentials from Secrets Manager. Returns a dict with
    HOST/PORT/DBNAME/USERNAME/PASSWORD keys (uppercase — same shape the
    existing deploy.sh reads)."""
    secret_arn = os.environ["DB_SECRET_ARN"]
    region = os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("secretsmanager", region_name=region)
    resp = client.get_secret_value(SecretId=secret_arn)
    secret = json.loads(resp["SecretString"])
    # Normalize keys — the existing schema uses uppercase; some AWS-managed
    # secrets use lowercase. Accept either.
    normalized = {k.upper(): v for k, v in secret.items()}
    if "DBNAME" not in normalized and os.environ.get("DB_NAME"):
        normalized["DBNAME"] = os.environ["DB_NAME"]
    return normalized


def _count_public_tables(creds: Dict[str, str]) -> int:
    """Returns the number of tables in the `public` schema."""
    with psycopg.connect(
        host=creds["HOST"],
        port=int(creds.get("PORT", 5432)),
        dbname=creds["DBNAME"],
        user=creds["USERNAME"],
        password=creds["PASSWORD"],
        connect_timeout=10,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
            (n,) = cur.fetchone()
            return int(n)


def _count_fact_alerts(creds: Dict[str, str]) -> int:
    """Row-count probe on the primary user-facing table. Returns -1 if
    the table doesn't exist yet (fresh DB, before schema init).

    This is the definitive "is the DB usably populated?" check — a
    non-zero row count in fact_alert means the UI has data to render.
    A count of 0 means schema exists but data load never completed
    (typical after a first-run crash between db_init and data_gen).
    """
    try:
        with psycopg.connect(
            host=creds["HOST"],
            port=int(creds.get("PORT", 5432)),
            dbname=creds["DBNAME"],
            user=creds["USERNAME"],
            password=creds["PASSWORD"],
            connect_timeout=10,
        ) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM fact_alert")
                (n,) = cur.fetchone()
                return int(n)
    except Exception:  # noqa: BLE001 — table probably doesn't exist yet
        return -1


def _run_db_init(creds: Dict[str, str]) -> int:
    """Run schema DDL via seeding_scripts.db_ops.db_init. Overrides sys.argv
    so the module's argparse-based `main()` sees the right flags."""
    from seeding_scripts.db_ops import db_init as _mod

    saved_argv = sys.argv
    # Wire the password via env — db_init reads it that way per the current
    # deploy.sh pattern (`export DB_PASSWORD=...` before invoking).
    os.environ["DB_PASSWORD"] = creds["PASSWORD"]
    sys.argv = [
        "db_init",
        "--database", creds["DBNAME"],
        "--host",     creds["HOST"],
        "--port",     str(creds.get("PORT", 5432)),
        "--user",     creds["USERNAME"],
        "--no-ssl",
    ]
    try:
        _mod.main()
    finally:
        sys.argv = saved_argv
    # Return the count of tables after DDL — sanity check.
    return _count_public_tables(creds)


def _run_data_gen(output_dir: str) -> None:
    """Generate synthetic CSVs into output_dir. Uses seed=42 to match the
    existing deploy.sh invocation for stable reproducibility.

    Note: `main()` lives in `data_gen.generate`, not `data_gen` itself —
    the package's `__init__.py` is empty and `__main__.py` just imports
    from `.generate`. Same shape for `database_seeding` (main lives in
    `.seed`) and `db_ops.db_init`.
    """
    from seeding_scripts.data_gen import generate as _mod

    saved_argv = sys.argv
    sys.argv = [
        "data_gen",
        "--seed", "42",
        "--output-dir", output_dir,
    ]
    try:
        _mod.main()
    finally:
        sys.argv = saved_argv


def _run_seed_load(creds: Dict[str, str], input_dir: str) -> Dict[str, int]:
    """Load CSVs into DB in FK-dependency order. Returns a per-table
    row-count summary (best-effort — the underlying seed.py doesn't
    currently expose one, so we count post-load)."""
    from seeding_scripts.database_seeding import seed as _mod

    # seed.py reads DB_PASSWORD from env — set it before invoking.
    # Note: seed.py does NOT accept --no-ssl (unlike db_init/data_gen);
    # its argparse would SystemExit(2) on the extra arg. Aurora accepts
    # unencrypted connections from the VPC subnet the seeder runs in.
    os.environ["DB_PASSWORD"] = creds["PASSWORD"]
    saved_argv = sys.argv
    sys.argv = [
        "seed",
        "--input-dir", input_dir,
        "--database",  creds["DBNAME"],
        "--host",      creds["HOST"],
        "--port",      str(creds.get("PORT", 5432)),
        "--user",      creds["USERNAME"],
    ]
    try:
        _mod.main()
    finally:
        sys.argv = saved_argv

    # Post-load count for the visible/interesting tables. Missing tables
    # just get 0; we don't fail the seed because count reporting is a nice-
    # to-have.
    summary: Dict[str, int] = {}
    with psycopg.connect(
        host=creds["HOST"],
        port=int(creds.get("PORT", 5432)),
        dbname=creds["DBNAME"],
        user=creds["USERNAME"],
        password=creds["PASSWORD"],
        connect_timeout=10,
    ) as conn:
        with conn.cursor() as cur:
            for table in ("fact_alert", "fact_trade", "dim_account", "dim_actor"):
                try:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    (n,) = cur.fetchone()
                    summary[table] = int(n)
                except Exception:  # noqa: BLE001 — count is best-effort
                    summary[table] = -1
    return summary


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    start = time.time()
    force = bool((event or {}).get("force", False))

    creds = _db_creds()
    table_count = _count_public_tables(creds)
    alert_rows = _count_fact_alerts(creds)
    logger.info(
        "state probe: public tables=%d fact_alert rows=%d (force=%s)",
        table_count, alert_rows, force,
    )

    # Three-state idempotency:
    #   1. Schema exists AND fact_alert has rows → fully seeded → skip.
    #   2. Schema exists but fact_alert is empty (0 rows, or non-existent
    #      but recoverable) → skip db_init (would fail on existing FK
    #      constraints), run data_gen + seed_load only.
    #   3. Schema doesn't exist at all → run full pipeline.
    #
    # `force=True` bypasses state 1 only; states 2 and 3 always run
    # what's needed. We never re-run db_init when the schema already
    # exists because db_ops.db_init calls sys.exit(1) on any DDL error
    # (including "constraint already exists"), which kills the Lambda
    # runtime before data_gen can run.
    if alert_rows > 0 and not force:
        return {
            "already_seeded": True,
            "existing_tables": table_count,
            "fact_alert_rows": alert_rows,
            "seconds": round(time.time() - start, 2),
        }

    skip_db_init = table_count > 0
    if skip_db_init:
        logger.info(
            "schema already exists (%d tables) — skipping db_init, "
            "running data_gen + seed_load only",
            table_count,
        )

    # /tmp is Lambda's writable ephemeral scratch, up to 512 MB by default.
    # 1.5 MB of CSVs fits comfortably.
    gen_dir = "/tmp/synthetic_data"
    os.makedirs(gen_dir, exist_ok=True)

    if skip_db_init:
        tables_after_init = table_count
    else:
        logger.info("running schema init (db_init)...")
        tables_after_init = _run_db_init(creds)

    logger.info("running data generation (data_gen)...")
    _run_data_gen(gen_dir)

    logger.info("loading data (database_seeding.seed)...")
    rows_loaded = _run_seed_load(creds, gen_dir)

    return {
        "seeded": {
            "tables_created": tables_after_init,
            "rows_loaded": rows_loaded,
        },
        "seconds": round(time.time() - start, 2),
    }
