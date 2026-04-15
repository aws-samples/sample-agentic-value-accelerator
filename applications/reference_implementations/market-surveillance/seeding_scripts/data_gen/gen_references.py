"""
Reference data generator: 29 REF_* tables -> CSV files.

Source: seeding_scripts/seeding_references.py
Pure static data - no randomization, no database code.
"""

import csv
from pathlib import Path

from .constants import (
    SIMPLE_REF_TABLES,
    REF_BOOK,
    REF_ECOMM_APP,
    REF_TRADE_SIDE,
    REF_TRADE_SOURCE,
    REF_TRADE_TYPE,
    REF_GOVT_BOND_LIQUIDITY,
)


def generate_reference_csvs(output_dir: Path, skip_tables: set[str] | None = None):
    """Generate CSV files for reference tables.

    Args:
        output_dir: Directory to write CSV files to.
        skip_tables: Optional set of table names (e.g. ``{"ref_book"}``) to
            skip because customer-provided data already exists.
    """
    skip_tables = skip_tables or set()
    output_dir.mkdir(parents=True, exist_ok=True)

    count = 0

    # Simple single-column tables
    for table_name, (col_name, values) in SIMPLE_REF_TABLES.items():
        if table_name in skip_tables:
            print(f"  {table_name}.csv: SKIPPED (customer data)")
            continue
        path = output_dir / f"{table_name}.csv"
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow([col_name])
            for v in values:
                writer.writerow([v])
        count += 1
        print(f"  {table_name}.csv: {len(values)} records")

    # REF_Book
    if "ref_book" in skip_tables:
        print(f"  ref_book.csv: SKIPPED (customer data)")
    else:
        path = output_dir / "ref_book.csv"
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(["book_code", "book_description", "book_type"])
            for b in REF_BOOK:
                writer.writerow([b.code, b.description, b.book_type])
        count += 1
        print(f"  ref_book.csv: {len(REF_BOOK)} records")

    # REF_eComm_App
    path = output_dir / "ref_ecomm_app.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["ref_ecomm_app_code", "ref_ecomm_app_type"])
        for a in REF_ECOMM_APP:
            writer.writerow([a.code, a.app_type])
    count += 1
    print(f"  ref_ecomm_app.csv: {len(REF_ECOMM_APP)} records")

    # REF_Trade_Side
    path = output_dir / "ref_trade_side.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["ref_trade_side_code", "ref_trade_side_name"])
        for s in REF_TRADE_SIDE:
            writer.writerow([s.code, s.name])
    count += 1
    print(f"  ref_trade_side.csv: {len(REF_TRADE_SIDE)} records")

    # REF_Trade_Source (code + name columns)
    path = output_dir / "ref_trade_source.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["ref_trade_source_code", "ref_trade_source_name"])
        for s in REF_TRADE_SOURCE:
            writer.writerow([s.code, s.name])
    count += 1
    print(f"  ref_trade_source.csv: {len(REF_TRADE_SOURCE)} records")

    # REF_Trade_Type
    path = output_dir / "ref_trade_type.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["ref_trade_type_code", "ref_trade_type_name"])
        for t in REF_TRADE_TYPE:
            writer.writerow([t.code, t.name])
    count += 1
    print(f"  ref_trade_type.csv: {len(REF_TRADE_TYPE)} records")

    # REF_Government_Bond_Liquidity_Threshold
    path = output_dir / "ref_government_bond_liquidity_threshold.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["govt_liq_currency", "0 -2 Years", "3 \u2013 5 Years",
                         "6 \u2013 10 Years", "11 \u2013 20 Years", "21 \u2013 30 Years"])
        for l in REF_GOVT_BOND_LIQUIDITY:
            writer.writerow([l.currency, l.years_0_2, l.years_3_5,
                             l.years_6_10, l.years_11_20, l.years_21_30])
    count += 1
    print(f"  ref_government_bond_liquidity_threshold.csv: {len(REF_GOVT_BOND_LIQUIDITY)} records")

    print(f"\n  Total: {count} reference CSV files generated")
    return count
