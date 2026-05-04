"""
Generic table inserter: CSV -> INSERT batches.

Reads CSV header, builds INSERT INTO {table} ({cols}) VALUES (%s, ...),
executes in batches of 1000 rows with progress reporting.
"""

import re
from pathlib import Path

from .csv_loader import load_csv
from .db_connection import DatabaseManager


BATCH_SIZE = 1000

_SPECIAL_CHARS = re.compile(r"[^a-zA-Z0-9_]")


def _quote_identifier(name: str) -> str:
    """Wrap identifier in double-quotes if it contains special characters."""
    if _SPECIAL_CHARS.search(name):
        escaped = name.replace('"', '""')
        return f'"{escaped}"'
    return name


def insert_csv_into_table(
    db: DatabaseManager,
    table_name: str,
    csv_path: Path,
    column_mapping: dict[str, str] = None,
    dry_run: bool = False,
) -> int:
    """
    Insert CSV data into a database table.

    Args:
        db: DatabaseManager instance (connected)
        table_name: Target database table name
        csv_path: Path to CSV file
        column_mapping: Optional CSV column -> DB column name mapping
        dry_run: If True, show plan without executing

    Returns:
        Number of rows inserted
    """
    fieldnames, rows = load_csv(csv_path)

    if not rows:
        print(f"    {table_name}: 0 rows (empty CSV)")
        return 0

    # Map CSV column names to DB column names
    if column_mapping:
        db_columns = [column_mapping.get(f, f) for f in fieldnames]
    else:
        db_columns = fieldnames

    # Build INSERT query
    placeholders = ", ".join(["%s"] * len(db_columns))
    cols_str = ", ".join(_quote_identifier(c) for c in db_columns)
    query = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders})"

    if dry_run:
        print(f"    [DRY RUN] {table_name}: {len(rows)} rows from {csv_path.name}")
        print(f"    Query: INSERT INTO {table_name} ({cols_str}) VALUES (...)")
        return 0

    # Insert in batches
    total_inserted = 0
    for batch_start in range(0, len(rows), BATCH_SIZE):
        batch = rows[batch_start:batch_start + BATCH_SIZE]

        params = [
            tuple(row.get(f) for f in fieldnames)
            for row in batch
        ]

        if db.executemany(query, params):
            db.commit()
            total_inserted += len(batch)
        else:
            print(f"    FAILED at rows {batch_start}-{batch_start + len(batch)}")
            db.rollback()
            return total_inserted

    return total_inserted
