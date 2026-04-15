"""
CLI orchestrator for loading CSVs into PostgreSQL (entry point).

Usage:
    python -m seeding_scripts.database_seeding.seed \
        --input-dir ./seeding_scripts/synthetic_data \
        --database mydb --host localhost --port 5432 --user postgres
"""

import argparse
import os
import sys
import time
from pathlib import Path

from .db_connection import DatabaseManager
from .table_inserter import insert_csv_into_table


# =============================================================================
# CSV -> TABLE MAPPING
#
# Insertion order matches the 8 dependency levels from db_init.py.
# Each entry: (csv_filename, db_table_name)
# =============================================================================

# Level 1-2: Reference tables
REF_TABLE_MAP = [
    ("ref_account_sub_type.csv", "ref_account_sub_type"),
    ("ref_account_type.csv", "ref_account_type"),
    ("ref_alert_summary.csv", "ref_alert_summary"),
    ("ref_algorithm_flag.csv", "ref_algorithm_flag"),
    ("ref_asset_class_name.csv", "ref_asset_class_name"),
    ("ref_book.csv", "ref_book"),
    ("ref_business_area.csv", "ref_business_area"),
    ("ref_business_unit_name.csv", "ref_business_unit_name"),
    ("ref_capacity_type.csv", "ref_capacity_type"),
    ("ref_country_name.csv", "ref_country_name"),
    ("ref_currency_code.csv", "ref_currency_code"),
    ("ref_dealer_name.csv", "ref_dealer_name"),
    ("ref_ecomm_app.csv", "ref_ecomm_app"),
    ("ref_event_type.csv", "ref_event_type"),
    ("ref_frb_code.csv", "ref_frb_code"),
    ("ref_government_bond_liquidity_threshold.csv", "ref_government_bond_liquidity_threshold"),
    ("ref_isvoicetrade_flag.csv", "ref_isvoicetrade_flag"),
    ("ref_legal_entity_code.csv", "ref_legal_entity_code"),
    ("ref_mli_number.csv", "ref_mli_number"),
    ("ref_product_sub_type.csv", "ref_product_sub_type"),
    ("ref_product_type.csv", "ref_product_type"),
    ("ref_risk_area_name.csv", "ref_risk_area_name"),
    ("ref_role.csv", "ref_role"),
    ("ref_trade_side.csv", "ref_trade_side"),
    ("ref_trade_source.csv", "ref_trade_source"),
    ("ref_trade_state.csv", "ref_trade_state"),
    ("ref_trade_type.csv", "ref_trade_type"),
    ("ref_trading_desk.csv", "ref_trading_desk"),
    ("ref_venue_name.csv", "ref_venue_name"),
]

# Level 3: Dimension tables (no FK dependencies on each other)
DIM_TABLE_MAP = [
    ("dim_account.csv", "dim_account"),
    ("dim_product.csv", "dim_product"),
]

# Level 4: Dim_Actor (FK to Dim_Account)
DIM_ACTOR_MAP = [
    ("dim_actor.csv", "dim_actor"),
]

# Level 5: Fact tables
FACT_TABLE_MAP = [
    ("fact_trade.csv", "fact_trade"),
    ("fact_ecomm_synth.csv", "fact_ecomm"),
]

# Level 6: Flagged_Trade (FK to Fact_Trade)
FLAGGED_TRADE_MAP = [
    ("flagged_trade.csv", "flagged_trade"),
]

# Level 7: Fact_Alert (FK to Flagged_Trade)
FACT_ALERT_MAP = [
    ("fact_alert.csv", "fact_alert"),
]

# Column mapping for eComm (CSV columns -> DB columns)
SYNTH_ECOMM_COLUMN_MAP = {
    "conversation_id": "ecomm_conversation_id",
    "app_code": "ecomm_app_code",
    "app_type": "ecomm_app_type",
    "date": "ecomm_date",
    "start_timestamp": "ecomm_start_timestamp",
    "end_timestamp": "ecomm_end_timestamp",
    "timezone": "ecomm_timezone",
    "participants_body": "ecomm_participants_body",
    "chat_body": "ecomm_chat_body",
}

# All insertion levels in order
ALL_LEVELS = [
    ("Reference tables", REF_TABLE_MAP, None),
    ("Dimension tables", DIM_TABLE_MAP, None),
    ("Dim_Actor", DIM_ACTOR_MAP, None),
    ("Fact tables", FACT_TABLE_MAP, SYNTH_ECOMM_COLUMN_MAP),
    ("Flagged_Trade", FLAGGED_TRADE_MAP, None),
    ("Fact_Alert", FACT_ALERT_MAP, None),
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Load CSV files into PostgreSQL database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Load all CSVs into database
  python -m seeding_scripts.database_seeding.seed \\
      --input-dir ./seeding_scripts/synthetic_data \\
      --database mydb --host localhost --port 5432 --user postgres

  # Dry run (show plan without loading)
  python -m seeding_scripts.database_seeding.seed \\
      --input-dir ./seeding_scripts/synthetic_data --dry-run

  # Load specific tables only
  python -m seeding_scripts.database_seeding.seed \\
      --input-dir ./seeding_scripts/synthetic_data \\
      --database mydb --tables dim_account dim_product
        """,
    )

    parser.add_argument("--input-dir", type=str, required=True, help="Directory containing CSV files")
    parser.add_argument("--database", default=os.environ.get("DB_NAME", ""), help="Database name")
    parser.add_argument("--host", default=os.environ.get("DB_HOST", "localhost"), help="Database host")
    parser.add_argument("--port", type=int, default=int(os.environ.get("DB_PORT", "5432")), help="Database port")
    parser.add_argument("--user", default=os.environ.get("DB_USER", "postgres"), help="Database user")
    parser.add_argument("--password", default=os.environ.get("DB_PASSWORD", ""), help="Database password")
    parser.add_argument("--clear", action="store_true", help="Clear tables before loading")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without loading")
    parser.add_argument("--tables", nargs="+", help="Load only specific tables (by DB table name)")

    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 60)
    print("Database Seeding from CSVs")
    print("=" * 60)

    input_dir = Path(args.input_dir)
    if not input_dir.exists():
        print(f"Error: Input directory not found: {input_dir}")
        sys.exit(1)

    print(f"Input directory: {input_dir}")

    # Connect to database
    db = None
    if not args.dry_run:
        if not args.database:
            print("Error: Database name required. Use --database or set DB_NAME env var")
            sys.exit(1)

        db = DatabaseManager(
            host=args.host,
            port=args.port,
            database=args.database,
            user=args.user,
            password=args.password,
        )
        db.connect()
        print(f"Connected to {args.user}@{args.host}:{args.port}/{args.database}")

    start_time = time.time()
    total_rows = 0

    try:
        # Pre-insertion: TRUNCATE all tables in reverse dependency order
        if args.clear and db and not args.dry_run:
            # Collect all table names that will be loaded (in insertion order)
            all_table_names = []
            for _level_name, table_map, _default_col_map in ALL_LEVELS:
                for csv_filename, table_name in table_map:
                    if args.tables and table_name not in args.tables:
                        continue
                    csv_path = input_dir / csv_filename
                    if csv_path.exists() and table_name not in all_table_names:
                        all_table_names.append(table_name)

            # Truncate in reverse dependency order
            print("\n--- Clearing tables (reverse dependency order) ---")
            for table_name in reversed(all_table_names):
                print(f"  TRUNCATE {table_name}...", end=" ")
                if db.execute(f"TRUNCATE TABLE {table_name} CASCADE"):
                    db.commit()
                    print("OK")
                else:
                    print("FAILED")

        for level_name, table_map, default_col_map in ALL_LEVELS:
            print(f"\n--- {level_name} ---")

            for csv_filename, table_name in table_map:
                # Filter by --tables if specified
                if args.tables and table_name not in args.tables:
                    continue

                csv_path = input_dir / csv_filename
                if not csv_path.exists():
                    print(f"  Skipping {csv_filename} (not found)")
                    continue

                # Determine column mapping
                col_map = default_col_map if table_name == "fact_ecomm" else None

                print(f"  Loading {csv_filename} -> {table_name}...", end=" ")
                rows = insert_csv_into_table(
                    db, table_name, csv_path,
                    column_mapping=col_map,
                    dry_run=args.dry_run,
                )
                if not args.dry_run:
                    print(f"{rows} rows OK")
                total_rows += rows

    finally:
        if db:
            db.close()

    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    if args.dry_run:
        print("[DRY RUN] No data was loaded.")
    else:
        print(f"SEEDING COMPLETE ({elapsed:.1f}s)")
        print(f"Total rows inserted: {total_rows:,}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
