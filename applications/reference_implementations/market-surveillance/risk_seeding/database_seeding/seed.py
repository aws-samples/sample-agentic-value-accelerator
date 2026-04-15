"""
CLI orchestrator for loading Risk Analyst CSVs into PostgreSQL.

Usage:
    python -m risk_seeding.database_seeding.seed \
        --input-dir ./risk_seeding/data \
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
# Insertion order: dim tables first, then fact tables (FK dependency order).
# Each entry: (csv_filename, db_table_name)
# =============================================================================

# Level 1: Dimension tables
DIM_TABLE_MAP = [
    ("dim_metric.csv", "dim_metric"),
]

# Level 2: Fact tables
FACT_TABLE_MAP = [
    ("fact_history.csv", "fact_history"),
]

# All insertion levels in order
ALL_LEVELS = [
    ("Dimension tables", DIM_TABLE_MAP, None),
    ("Fact tables", FACT_TABLE_MAP, None),
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Load Risk Analyst CSV files into PostgreSQL database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Load all CSVs into database
  python -m risk_seeding.database_seeding.seed \\
      --input-dir ./risk_seeding/data \\
      --database mydb --host localhost --port 5432 --user postgres

  # Dry run (show plan without loading)
  python -m risk_seeding.database_seeding.seed \\
      --input-dir ./risk_seeding/data --dry-run

  # Load specific tables only
  python -m risk_seeding.database_seeding.seed \\
      --input-dir ./risk_seeding/data \\
      --database mydb --tables dim_metric
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
    print("Risk Analyst Database Seeding from CSVs")
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
            all_table_names = []
            for _level_name, table_map, _default_col_map in ALL_LEVELS:
                for csv_filename, table_name in table_map:
                    if args.tables and table_name not in args.tables:
                        continue
                    csv_path = input_dir / csv_filename
                    if csv_path.exists() and table_name not in all_table_names:
                        all_table_names.append(table_name)

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
                col_map = default_col_map

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
