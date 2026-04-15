"""
CSV loader: Read CSVs into row dicts.

Handles: empty string -> None, basic type coercion.
"""

import csv
from datetime import datetime
from pathlib import Path
from typing import Any


def _coerce_value(value: str) -> Any:
    """Coerce a CSV string value to an appropriate Python type."""
    if value == "" or value is None or value.strip().lower() == "n/a":
        return None

    # Try integer
    try:
        return int(value)
    except ValueError:
        pass

    # Try float
    try:
        return float(value)
    except ValueError:
        pass

    # Try datetime (YYYY-MM-DD HH:MM:SS)
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        pass

    # Try date (YYYY-MM-DD)
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        pass

    # Try date (MM/DD/YYYY — 4-digit year)
    try:
        return datetime.strptime(value, "%m/%d/%Y")
    except ValueError:
        pass

    # Try date (MM/DD/YY — 2-digit year)
    try:
        return datetime.strptime(value, "%m/%d/%y")
    except ValueError:
        pass

    # Try time-only (HH:MM:SS)
    try:
        return datetime.strptime(value, "%H:%M:%S").time()
    except ValueError:
        pass

    return value


def load_csv(path: Path) -> tuple[list[str], list[dict]]:
    """
    Load a CSV file and return (fieldnames, rows_as_dicts).

    Handles: empty string -> None, basic type coercion.
    """
    with open(path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = []
        for row in reader:
            coerced = {k: _coerce_value(v) for k, v in row.items()}
            rows.append(coerced)

    return list(fieldnames), rows
