#!/usr/bin/env python3
"""
Database Verification Script for financial_risk.

Lists tables and their columns from a PostgreSQL database.
Used to verify that db_init.py created tables correctly.
"""

import argparse
import os
import sys
from typing import Optional

from psycopg import sql


def get_connection(host: str, port: int, database: str, user: str, password: str, sslmode: str = "require"):
    """Create database connection."""
    try:
        import psycopg

        return psycopg.connect(
            host=host,
            port=port,
            dbname=database,
            user=user,
            password=password,
            sslmode=sslmode,
        )
    except ImportError:
        print("Error: psycopg not installed. Run: pip install psycopg[binary]")
        sys.exit(1)
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)


def get_tables(cursor, schema: str = "public") -> list[dict]:
    """Get Risk Analyst tables in the specified schema."""
    cursor.execute(
        """
        SELECT
            table_name,
            table_type
        FROM information_schema.tables
        WHERE table_schema = %s
          AND table_name IN ('dim_metric', 'fact_history')
        ORDER BY table_name
        """,
        (schema,),
    )
    return [{"name": row[0], "type": row[1]} for row in cursor.fetchall()]


def get_columns(cursor, table_name: str, schema: str = "public") -> list[dict]:
    """Get all columns for a table."""
    cursor.execute(
        """
        SELECT
            column_name,
            data_type,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema, table_name),
    )

    columns = []
    for row in cursor.fetchall():
        col_name, data_type, char_len, num_prec, num_scale, nullable, default = row

        # Format the data type with length/precision
        if char_len:
            type_str = f"{data_type.upper()}({char_len})"
        elif num_prec and num_scale:
            type_str = f"{data_type.upper()}({num_prec},{num_scale})"
        elif num_prec:
            type_str = f"{data_type.upper()}({num_prec})"
        else:
            type_str = data_type.upper()

        columns.append(
            {
                "name": col_name,
                "type": type_str,
                "nullable": nullable == "YES",
                "default": default,
            }
        )

    return columns


def get_primary_keys(cursor, table_name: str, schema: str = "public") -> list[str]:
    """Get primary key columns for a table."""
    cursor.execute(
        """
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = %s
            AND tc.table_name = %s
        ORDER BY kcu.ordinal_position
        """,
        (schema, table_name),
    )
    return [row[0] for row in cursor.fetchall()]


def get_row_count(cursor, table_name: str, schema: str = "public") -> int:
    """Get row count for a table."""
    cursor.execute(
        sql.SQL("SELECT COUNT(*) FROM {}.{}").format(
            sql.Identifier(schema),
            sql.Identifier(table_name.lower()),
        )
    )
    return cursor.fetchone()[0]


def print_table_summary(tables: list[dict], show_counts: bool = False):
    """Print summary of all tables."""
    print(f"\n{'='*60}")
    print(f"RISK ANALYST DATABASE TABLES SUMMARY ({len(tables)} tables)")
    print(f"{'='*60}")

    if not tables:
        print("No Risk Analyst tables found.")
        return

    for table in tables:
        count_str = f" [{table.get('row_count', 0)} rows]" if show_counts else ""
        print(f"  - {table['name']}{count_str}")


def print_table_details(
    table_name: str,
    columns: list[dict],
    primary_keys: list[str],
    row_count: Optional[int] = None,
):
    """Print detailed info for a single table."""
    print(f"\n{'='*60}")
    print(f"TABLE: {table_name}")
    if row_count is not None:
        print(f"ROWS: {row_count}")
    print(f"{'='*60}")

    if not columns:
        print("  No columns found.")
        return

    # Calculate column widths
    name_width = max(len(c["name"]) for c in columns)
    type_width = max(len(c["type"]) for c in columns)

    # Print header
    print(f"  {'COLUMN'.ljust(name_width)}  {'TYPE'.ljust(type_width)}  NULLABLE  PK")
    print(f"  {'-'*name_width}  {'-'*type_width}  --------  --")

    # Print columns
    for col in columns:
        is_pk = "YES" if col["name"] in primary_keys else ""
        nullable = "YES" if col["nullable"] else "NO"
        print(
            f"  {col['name'].ljust(name_width)}  "
            f"{col['type'].ljust(type_width)}  "
            f"{nullable.ljust(8)}  {is_pk}"
        )


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Verify Risk Analyst database tables and columns",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all Risk Analyst tables
  python db_verify.py --database mydb

  # Show details for specific table
  python db_verify.py --database mydb --table dim_metric

  # Show all tables with row counts
  python db_verify.py --database mydb --counts

  # Show details for all tables
  python db_verify.py --database mydb --all

Environment Variables:
  DB_HOST      PostgreSQL host (default: localhost)
  DB_PORT      PostgreSQL port (default: 5432)
  DB_NAME      Database name
  DB_USER      Database user (default: postgres)
  DB_PASSWORD  Database password
        """,
    )

    parser.add_argument(
        "--host",
        default=os.environ.get("DB_HOST", "localhost"),
        help="Database host",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("DB_PORT", "5432")),
        help="Database port",
    )
    parser.add_argument(
        "--database",
        default=os.environ.get("DB_NAME", ""),
        help="Database name",
    )
    parser.add_argument(
        "--user",
        default=os.environ.get("DB_USER", "postgres"),
        help="Database user",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("DB_PASSWORD", ""),
        help="Database password (prefer DB_PASSWORD env var)",
    )
    parser.add_argument(
        "--schema",
        default="public",
        help="Database schema (default: public)",
    )
    parser.add_argument(
        "--table",
        "-t",
        help="Show details for specific table",
    )
    parser.add_argument(
        "--all",
        "-a",
        action="store_true",
        help="Show details for all tables",
    )
    parser.add_argument(
        "--counts",
        "-c",
        action="store_true",
        help="Include row counts",
    )
    parser.add_argument(
        "--no-ssl",
        action="store_true",
        help="Disable SSL (use when connecting through SSH tunnel to localhost)",
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    if not args.database:
        print("Error: Database name required. Use --database or set DB_NAME env var")
        sys.exit(1)

    # Connect to database
    sslmode = "disable" if args.no_ssl else "require"
    print(f"Connecting to {args.user}@{args.host}:{args.port}/{args.database}...")
    conn = get_connection(
        host=args.host,
        port=args.port,
        database=args.database,
        user=args.user,
        password=args.password,
        sslmode=sslmode,
    )
    cursor = conn.cursor()

    try:
        # Get Risk Analyst tables
        tables = get_tables(cursor, args.schema)

        if not tables:
            print(f"No Risk Analyst tables found in schema '{args.schema}'")
            return

        # Get row counts if requested
        if args.counts:
            for table in tables:
                try:
                    table["row_count"] = get_row_count(cursor, table["name"], args.schema)
                except Exception:
                    table["row_count"] = -1

        # Show specific table
        if args.table:
            matching = [t for t in tables if t["name"].lower() == args.table.lower()]
            if not matching:
                print(f"Table '{args.table}' not found")
                print("\nAvailable Risk Analyst tables:")
                for t in tables:
                    print(f"  - {t['name']}")
                return

            table = matching[0]
            columns = get_columns(cursor, table["name"], args.schema)
            primary_keys = get_primary_keys(cursor, table["name"], args.schema)
            row_count = get_row_count(cursor, table["name"], args.schema) if args.counts else None
            print_table_details(table["name"], columns, primary_keys, row_count)

        # Show all tables with details
        elif args.all:
            for table in tables:
                columns = get_columns(cursor, table["name"], args.schema)
                primary_keys = get_primary_keys(cursor, table["name"], args.schema)
                row_count = table.get("row_count") if args.counts else None
                print_table_details(table["name"], columns, primary_keys, row_count)

        # Show summary
        else:
            print_table_summary(tables, show_counts=args.counts)

    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
