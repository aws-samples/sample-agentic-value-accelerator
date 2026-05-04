#!/usr/bin/env python3
"""
Database Data Inspection Script.

Queries all tables from a PostgreSQL database and outputs data
in readable format for validation. Supports console output and CSV export.
"""

import argparse
import csv
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from psycopg import sql


@dataclass
class TableConfig:
    """Configuration for table categories and their default row limits."""

    REF_LIMIT: int = 0  # No limit for reference tables (typically small)
    DIM_LIMIT: int = 100
    FACT_LIMIT: int = 50
    OTHER_LIMIT: int = 100


class DatabaseManager:
    """Handles database connections with retry logic and SSL support."""

    def __init__(
        self,
        host: str,
        port: int,
        database: str,
        user: str,
        password: str,
        sslmode: str = "require",
        max_retries: int = 3,
    ):
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.password = password
        self.sslmode = sslmode
        self.max_retries = max_retries
        self._conn = None

    def connect(self):
        """Create database connection with retry logic."""
        try:
            import psycopg
        except ImportError:
            print("Error: psycopg2 not installed. Run: pip install psycopg[binary]")
            sys.exit(1)

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                self._conn = psycopg.connect(
                    host=self.host,
                    port=self.port,
                    dbname=self.database,
                    user=self.user,
                    password=self.password,
                    sslmode=self.sslmode,
                )
                return self._conn
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    wait_time = 2**attempt
                    print(f"Connection attempt {attempt} failed, retrying in {wait_time}s...")
                    time.sleep(wait_time)

        print(f"Error connecting to database after {self.max_retries} attempts: {last_error}")
        sys.exit(1)

    def close(self):
        """Close the database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    @property
    def connection(self):
        """Get the current connection."""
        return self._conn


class TableInspector:
    """Discovers tables and queries data from the database."""

    def __init__(self, cursor, schema: str = "public"):
        self.cursor = cursor
        self.schema = schema
        self._table_cache = None

    def get_all_tables(self) -> list[str]:
        """Get all table names in the schema."""
        if self._table_cache is not None:
            return self._table_cache

        self.cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
                AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """,
            (self.schema,),
        )
        self._table_cache = [row[0] for row in self.cursor.fetchall()]
        return self._table_cache

    def get_tables_by_prefix(self, prefix: str) -> list[str]:
        """Get tables matching a prefix."""
        all_tables = self.get_all_tables()
        return [t for t in all_tables if t.startswith(prefix)]

    def get_table_columns(self, table_name: str) -> list[dict]:
        """Get column information for a table."""
        self.cursor.execute(
            """
            SELECT
                column_name,
                data_type,
                is_nullable
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (self.schema, table_name),
        )
        return [
            {"name": row[0], "type": row[1], "nullable": row[2] == "YES"}
            for row in self.cursor.fetchall()
        ]

    def get_row_count(self, table_name: str) -> int:
        """Get exact row count for a table."""
        self.cursor.execute(
            sql.SQL("SELECT COUNT(*) FROM {}.{}").format(
                sql.Identifier(self.schema),
                sql.Identifier(table_name.lower()),
            )
        )
        return self.cursor.fetchone()[0]

    def get_table_data(
        self, table_name: str, limit: Optional[int] = None
    ) -> tuple[list[str], list[tuple]]:
        """Get data from a table with optional row limit."""
        columns = self.get_table_columns(table_name)
        column_names = [c["name"] for c in columns]

        base_query = sql.SQL("SELECT * FROM {}.{}").format(
            sql.Identifier(self.schema),
            sql.Identifier(table_name.lower()),
        )
        if limit and limit > 0:
            query = sql.SQL("{} LIMIT {}").format(base_query, sql.Literal(limit))
        else:
            query = base_query

        self.cursor.execute(query)
        rows = self.cursor.fetchall()

        return column_names, rows

    def get_foreign_keys(self, table_name: str) -> list[dict]:
        """Get foreign key relationships for a table."""
        self.cursor.execute(
            """
            SELECT
                kcu.column_name,
                ccu.table_name AS foreign_table,
                ccu.column_name AS foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = %s
                AND tc.table_name = %s
            """,
            (self.schema, table_name),
        )
        return [
            {"column": row[0], "foreign_table": row[1], "foreign_column": row[2]}
            for row in self.cursor.fetchall()
        ]


class DataValidator:
    """Performs data validation checks on tables."""

    def __init__(self, cursor, schema: str = "public"):
        self.cursor = cursor
        self.schema = schema

    def get_null_analysis(self, table_name: str) -> list[dict]:
        """Analyze null/empty values per column."""
        self.cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (self.schema, table_name),
        )
        columns = [row[0] for row in self.cursor.fetchall()]

        results = []
        for col in columns:
            self.cursor.execute(
                sql.SQL(
                    "SELECT"
                    " COUNT(*) as total,"
                    " COUNT({col}) as non_null,"
                    " COUNT(*) - COUNT({col}) as null_count"
                    " FROM {schema}.{table}"
                ).format(
                    col=sql.Identifier(col),
                    schema=sql.Identifier(self.schema),
                    table=sql.Identifier(table_name.lower()),
                )
            )
            row = self.cursor.fetchone()
            total, non_null, null_count = row

            null_pct = (null_count / total * 100) if total > 0 else 0
            results.append(
                {
                    "column": col,
                    "total": total,
                    "non_null": non_null,
                    "null_count": null_count,
                    "null_pct": round(null_pct, 2),
                }
            )

        return results

    def check_foreign_key_integrity(
        self, table_name: str, column: str, foreign_table: str, foreign_column: str
    ) -> dict:
        """Check foreign key integrity between tables."""
        self.cursor.execute(
            sql.SQL(
                "SELECT COUNT(*)"
                " FROM {schema}.{table} t"
                " WHERE t.{column} IS NOT NULL"
                " AND NOT EXISTS ("
                " SELECT 1 FROM {schema}.{foreign_table} f"
                " WHERE f.{foreign_column} = t.{column}"
                ")"
            ).format(
                schema=sql.Identifier(self.schema),
                table=sql.Identifier(table_name.lower()),
                column=sql.Identifier(column),
                foreign_table=sql.Identifier(foreign_table.lower()),
                foreign_column=sql.Identifier(foreign_column),
            )
        )
        orphan_count = self.cursor.fetchone()[0]

        self.cursor.execute(
            sql.SQL("SELECT COUNT(*) FROM {}.{} WHERE {} IS NOT NULL").format(
                sql.Identifier(self.schema),
                sql.Identifier(table_name.lower()),
                sql.Identifier(column),
            )
        )
        total_refs = self.cursor.fetchone()[0]

        return {
            "table": table_name,
            "column": column,
            "foreign_table": foreign_table,
            "foreign_column": foreign_column,
            "total_references": total_refs,
            "orphan_count": orphan_count,
            "integrity_ok": orphan_count == 0,
        }

    def get_column_distribution(
        self, table_name: str, column: str, top_n: int = 10
    ) -> list[dict]:
        """Get value distribution for a column."""
        self.cursor.execute(
            sql.SQL(
                "SELECT {col}, COUNT(*) as cnt"
                " FROM {schema}.{table}"
                " WHERE {col} IS NOT NULL"
                " GROUP BY {col}"
                " ORDER BY cnt DESC"
                " LIMIT {limit}"
            ).format(
                col=sql.Identifier(column),
                schema=sql.Identifier(self.schema),
                table=sql.Identifier(table_name.lower()),
                limit=sql.Literal(top_n),
            )
        )
        rows = self.cursor.fetchall()

        self.cursor.execute(
            sql.SQL("SELECT COUNT(*) FROM {}.{} WHERE {} IS NOT NULL").format(
                sql.Identifier(self.schema),
                sql.Identifier(table_name.lower()),
                sql.Identifier(column),
            )
        )
        total = self.cursor.fetchone()[0]

        return [
            {
                "value": row[0],
                "count": row[1],
                "percentage": round(row[1] / total * 100, 2) if total > 0 else 0,
            }
            for row in rows
        ]


class ConsoleExporter:
    """Exports data to console using tabulate for formatting."""

    def __init__(self):
        try:
            from tabulate import tabulate

            self.tabulate = tabulate
        except ImportError:
            print("Error: tabulate not installed. Run: pip install tabulate")
            sys.exit(1)

    def print_table_data(
        self,
        table_name: str,
        columns: list[str],
        rows: list[tuple],
        row_count: int,
        limit: Optional[int] = None,
    ):
        """Print table data in a formatted way."""
        print(f"\n{'='*70}")
        print(f"TABLE: {table_name}")
        print(f"Total Rows: {row_count}")
        if limit and limit < row_count:
            print(f"Showing: {min(limit, len(rows))} rows (limited)")
        print(f"{'='*70}")

        if not rows:
            print("  (No data)")
            return

        # Truncate long values for display
        display_rows = []
        for row in rows:
            display_row = []
            for val in row:
                str_val = str(val) if val is not None else "NULL"
                if len(str_val) > 50:
                    str_val = str_val[:47] + "..."
                display_row.append(str_val)
            display_rows.append(display_row)

        print(self.tabulate(display_rows, headers=columns, tablefmt="grid"))

    def print_validation_summary(
        self,
        table_name: str,
        row_count: int,
        null_analysis: list[dict],
        fk_checks: list[dict],
    ):
        """Print validation summary for a table."""
        print(f"\n--- Validation: {table_name} ---")
        print(f"Row Count: {row_count}")

        # Null analysis (only show columns with nulls)
        cols_with_nulls = [n for n in null_analysis if n["null_count"] > 0]
        if cols_with_nulls:
            print("\nColumns with NULL values:")
            null_data = [
                [n["column"], n["null_count"], f"{n['null_pct']}%"]
                for n in cols_with_nulls
            ]
            print(
                self.tabulate(
                    null_data, headers=["Column", "Null Count", "Null %"], tablefmt="simple"
                )
            )

        # FK integrity
        if fk_checks:
            print("\nForeign Key Integrity:")
            fk_data = [
                [
                    f"{fk['column']} -> {fk['foreign_table']}.{fk['foreign_column']}",
                    fk["total_references"],
                    fk["orphan_count"],
                    "OK" if fk["integrity_ok"] else "FAIL",
                ]
                for fk in fk_checks
            ]
            print(
                self.tabulate(
                    fk_data,
                    headers=["Relationship", "Total Refs", "Orphans", "Status"],
                    tablefmt="simple",
                )
            )

    def print_distribution(self, table_name: str, column: str, distribution: list[dict]):
        """Print column value distribution."""
        print(f"\nDistribution: {table_name}.{column}")
        dist_data = [[d["value"], d["count"], f"{d['percentage']}%"] for d in distribution]
        print(
            self.tabulate(dist_data, headers=["Value", "Count", "Percentage"], tablefmt="simple")
        )


class CSVExporter:
    """Exports data to CSV files."""

    def __init__(self, output_dir: str):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_table(
        self, table_name: str, columns: list[str], rows: list[tuple]
    ) -> str:
        """Export a table to CSV file."""
        filepath = self.output_dir / f"{table_name}.csv"

        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(columns)
            writer.writerows(rows)

        return str(filepath)

    def export_validation_report(
        self, validation_results: list[dict]
    ) -> str:
        """Export validation results to a summary CSV."""
        filepath = self.output_dir / "_validation_report.csv"

        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "Table",
                    "Row Count",
                    "Columns with Nulls",
                    "FK Integrity Issues",
                ]
            )
            for result in validation_results:
                writer.writerow(
                    [
                        result["table"],
                        result["row_count"],
                        result["null_columns"],
                        result["fk_issues"],
                    ]
                )

        return str(filepath)


def get_table_limit(table_name: str, config: TableConfig, full_export: bool) -> Optional[int]:
    """Determine row limit based on table prefix."""
    if full_export:
        return None

    # Use lowercase prefixes to match PostgreSQL table names
    table_lower = table_name.lower()
    if table_lower.startswith("ref_"):
        return config.REF_LIMIT if config.REF_LIMIT > 0 else None
    elif table_lower.startswith("dim_"):
        return config.DIM_LIMIT
    elif table_lower.startswith("fact_"):
        return config.FACT_LIMIT
    else:
        return config.OTHER_LIMIT


def categorize_tables(tables: list[str]) -> dict[str, list[str]]:
    """Group tables by category (prefix)."""
    # Use lowercase prefixes to match PostgreSQL table names
    categories = {
        "ref_": [],
        "dim_": [],
        "fact_": [],
        "fr_": [],
        "Other": [],
    }

    for table in tables:
        matched = False
        table_lower = table.lower()
        for prefix in ["ref_", "dim_", "fact_", "fr_"]:
            if table_lower.startswith(prefix):
                categories[prefix].append(table)
                matched = True
                break
        if not matched:
            categories["Other"].append(table)

    return {k: v for k, v in categories.items() if v}


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Inspect and export database data for validation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Quick console view (default)
  python db_dump.py --database mydb

  # Export to CSV
  python db_dump.py --database mydb --format csv --output ./exports/

  # Specific tables only
  python db_dump.py --database mydb --table Dim_Account Fact_Trade

  # Filter by prefix (e.g., only reference tables)
  python db_dump.py --database mydb --tables REF_

  # Full export without row limits
  python db_dump.py --database mydb --format csv --output ./exports/ --full-export

  # Skip validation
  python db_dump.py --database mydb --no-validate

Environment Variables:
  DB_HOST      PostgreSQL host (default: localhost)
  DB_PORT      PostgreSQL port (default: 5432)
  DB_NAME      Database name
  DB_USER      Database user (default: postgres)
  DB_PASSWORD  Database password (required)
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
        "--sslmode",
        default="require",
        choices=["disable", "require", "verify-ca", "verify-full"],
        help="SSL mode for RDS connection (default: require)",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["console", "csv"],
        default="console",
        help="Output format (default: console)",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="./db_export",
        help="Output directory for CSV export (default: ./db_export)",
    )
    parser.add_argument(
        "--table",
        "-t",
        nargs="+",
        help="Specific table(s) to inspect",
    )
    parser.add_argument(
        "--tables",
        help="Filter tables by prefix (e.g., REF_, Dim_, Fact_)",
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        help="Override default row limit for all tables",
    )
    parser.add_argument(
        "--full-export",
        action="store_true",
        help="Export all rows without limits",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip validation checks",
    )
    parser.add_argument(
        "--distribution",
        "-d",
        nargs="+",
        metavar="TABLE.COLUMN",
        help="Show distribution for specific columns (e.g., Fact_Trade.Trade_Event_Type)",
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    if not args.database:
        print("Error: Database name required. Use --database or set DB_NAME env var")
        sys.exit(1)

    if not args.password:
        print("Error: Database password required. Set DB_PASSWORD env var")
        sys.exit(1)

    # Connect to database
    print(f"Connecting to {args.user}@{args.host}:{args.port}/{args.database}...")
    db_manager = DatabaseManager(
        host=args.host,
        port=args.port,
        database=args.database,
        user=args.user,
        password=args.password,
        sslmode=args.sslmode,
    )
    conn = db_manager.connect()
    cursor = conn.cursor()

    try:
        inspector = TableInspector(cursor, args.schema)
        validator = DataValidator(cursor, args.schema)
        config = TableConfig()

        # Determine which tables to process
        if args.table:
            tables = args.table
        elif args.tables:
            tables = inspector.get_tables_by_prefix(args.tables)
        else:
            tables = inspector.get_all_tables()

        if not tables:
            print("No tables found matching criteria")
            return

        print(f"Found {len(tables)} tables to process")

        # Set up exporters
        console_exporter = ConsoleExporter()
        csv_exporter = CSVExporter(args.output) if args.format == "csv" else None

        # Group tables by category for organized output
        categorized = categorize_tables(tables)
        validation_results = []

        for category, category_tables in categorized.items():
            print(f"\n{'#'*70}")
            print(f"# {category} Tables ({len(category_tables)} tables)")
            print(f"{'#'*70}")

            for table_name in sorted(category_tables):
                try:
                    # Determine row limit
                    if args.limit is not None:
                        limit = args.limit if args.limit > 0 else None
                    else:
                        limit = get_table_limit(table_name, config, args.full_export)

                    # Get data
                    row_count = inspector.get_row_count(table_name)
                    columns, rows = inspector.get_table_data(table_name, limit)

                    # Output data
                    if args.format == "console":
                        console_exporter.print_table_data(
                            table_name, columns, rows, row_count, limit
                        )
                    else:
                        # For CSV, get all data if full export
                        if args.full_export:
                            columns, rows = inspector.get_table_data(table_name, None)
                        filepath = csv_exporter.export_table(table_name, columns, rows)
                        print(f"  Exported: {table_name} ({row_count} rows) -> {filepath}")

                    # Validation
                    if not args.no_validate:
                        null_analysis = validator.get_null_analysis(table_name)
                        fk_info = inspector.get_foreign_keys(table_name)

                        fk_checks = []
                        for fk in fk_info:
                            check = validator.check_foreign_key_integrity(
                                table_name,
                                fk["column"],
                                fk["foreign_table"],
                                fk["foreign_column"],
                            )
                            fk_checks.append(check)

                        if args.format == "console":
                            console_exporter.print_validation_summary(
                                table_name, row_count, null_analysis, fk_checks
                            )

                        # Track for CSV validation report
                        null_cols = len([n for n in null_analysis if n["null_count"] > 0])
                        fk_issues = len([f for f in fk_checks if not f["integrity_ok"]])
                        validation_results.append(
                            {
                                "table": table_name,
                                "row_count": row_count,
                                "null_columns": null_cols,
                                "fk_issues": fk_issues,
                            }
                        )

                except Exception as e:
                    print(f"  Error processing {table_name}: {e}")

        # Handle distribution requests
        if args.distribution:
            print(f"\n{'#'*70}")
            print("# Column Distributions")
            print(f"{'#'*70}")

            for dist_spec in args.distribution:
                try:
                    table, column = dist_spec.split(".")
                    distribution = validator.get_column_distribution(table, column)
                    console_exporter.print_distribution(table, column, distribution)
                except ValueError:
                    print(f"  Invalid format: {dist_spec} (use TABLE.COLUMN)")
                except Exception as e:
                    print(f"  Error getting distribution for {dist_spec}: {e}")

        # Export validation report for CSV format
        if csv_exporter and validation_results and not args.no_validate:
            report_path = csv_exporter.export_validation_report(validation_results)
            print(f"\nValidation report: {report_path}")

        # Summary
        print(f"\n{'='*70}")
        print("SUMMARY")
        print(f"{'='*70}")
        print(f"Tables processed: {len(tables)}")
        if args.format == "csv":
            print(f"Output directory: {args.output}")
        if not args.no_validate and validation_results:
            total_rows = sum(v["row_count"] for v in validation_results)
            tables_with_issues = len([v for v in validation_results if v["fk_issues"] > 0])
            print(f"Total rows: {total_rows:,}")
            print(f"Tables with FK issues: {tables_with_issues}")

    finally:
        cursor.close()
        db_manager.close()


if __name__ == "__main__":
    main()
