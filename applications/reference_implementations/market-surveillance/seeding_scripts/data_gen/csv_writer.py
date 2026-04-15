"""
Utility: write dataclass lists to CSV files.
"""

import csv
import dataclasses
from datetime import datetime, date
from pathlib import Path
from typing import Any


def _format_value(value: Any) -> str:
    """Format a value for CSV output."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    return str(value)


def write_csv(records: list, output_path: Path, fieldnames: list[str] = None):
    """
    Write a list of dataclass records to a CSV file.

    Args:
        records: List of dataclass instances
        output_path: Path to write the CSV file
        fieldnames: Column names (defaults to dataclass field names)
    """
    if not records:
        return

    if fieldnames is None:
        fieldnames = [f.name for f in dataclasses.fields(records[0])]

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()

        for record in records:
            row = dataclasses.asdict(record)
            formatted_row = {k: _format_value(v) for k, v in row.items()}
            writer.writerow(formatted_row)
