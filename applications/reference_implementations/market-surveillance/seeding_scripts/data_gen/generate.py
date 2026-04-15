"""
CLI orchestrator for data generation (entry point).

Usage:
    python -m seeding_scripts.data_gen.generate \
        --seed 42 --output-dir ./seeding_scripts/synthetic_data \
        --accounts 10 --products 15 --actors 20 \
        --trades 50 --alerts 10 --ecomm 20
"""

import argparse
import csv
import os
import random
import sys
import time
from pathlib import Path

from .gen_references import generate_reference_csvs
from .gen_dimensions import generate_dimensions
from .gen_trades import generate_trades
from .gen_flagged_trade import generate_flagged_trades
from .gen_alerts import generate_alerts
from .gen_ecomm_synth import generate_ecomm_synth
from .gen_ecomm_from_xml import generate_ecomm_from_xml


# =============================================================================
# CUSTOMER DATA MAPPING
#
# Maps pre-existing customer CSV filenames (in --data-dir) to the output
# filenames that generators would normally produce.  When a customer CSV
# exists it is copied (with lowercase headers) to the output directory and
# the corresponding generation phase is skipped.
# =============================================================================

CUSTOMER_CSV_MAP = {
    "dim_account.csv": "dim_account.csv",
    "dim_actor.csv": "dim_actor.csv",
    "dim_product.csv": "dim_product.csv",
    "fact_trade.csv": "fact_trade.csv",
    "flagged_trade.csv": "flagged_trade.csv",
    "fact_alert.csv": "fact_alert.csv",
    "ref_book.csv": "ref_book.csv",
}

# Output files produced by each phase (used to decide if a phase can be
# skipped entirely when all its outputs already come from customer data).
PHASE_OUTPUTS = {
    "dimensions": {"dim_account.csv", "dim_actor.csv", "dim_product.csv"},
    "trades": {"fact_trade.csv"},
    "flagged_trade": {"flagged_trade.csv"},
    "alerts": {"fact_alert.csv"},
    "ecomm_synth": {"fact_ecomm_synth.csv"},
}

# Phases that should always be skipped regardless of customer data.
ALWAYS_SKIP_PHASES: set[str] = set()


def copy_customer_csvs(data_dir: Path, output_dir: Path) -> set[str]:
    """Copy customer-provided CSVs to *output_dir* with lowercase headers.

    Returns the set of output filenames that were copied (e.g.
    ``{"dim_account.csv", "fact_trade.csv", ...}``).
    """
    copied: set[str] = set()
    for customer_csv, output_csv in CUSTOMER_CSV_MAP.items():
        src = data_dir / customer_csv
        if not src.exists():
            continue

        dst = output_dir / output_csv
        with open(src, "r", newline="", encoding="utf-8-sig") as fin:
            reader = csv.DictReader(fin)
            # Normalise headers to lowercase
            fieldnames = [h.lower() for h in (reader.fieldnames or [])]
            with open(dst, "w", newline="", encoding="utf-8") as fout:
                writer = csv.DictWriter(fout, fieldnames=fieldnames)
                writer.writeheader()
                for row in reader:
                    writer.writerow({k.lower(): v for k, v in row.items()})

        copied.add(output_csv)
        print(f"  Copied {customer_csv} -> {output_csv}")
    return copied


def should_skip_phase(phase: str, existing_files: set[str]) -> bool:
    """Return True if *phase* should be skipped."""
    if phase in ALWAYS_SKIP_PHASES:
        return True
    outputs = PHASE_OUTPUTS.get(phase)
    if outputs and outputs.issubset(existing_files):
        return True
    return False


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate synthetic data as CSV files (no database needed)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate with defaults
  python -m seeding_scripts.data_gen.generate --output-dir ./seeding_scripts/synthetic_data

  # Generate with custom counts and seed
  python -m seeding_scripts.data_gen.generate \\
      --seed 42 --output-dir ./seeding_scripts/synthetic_data \\
      --accounts 10 --products 15 --actors 20 \\
      --trades 50 --alerts 10 --ecomm 20

  # Dry run (show plan without generating)
  python -m seeding_scripts.data_gen.generate --dry-run
        """,
    )

    parser.add_argument("--seed", type=int, help="Random seed for reproducible generation")
    parser.add_argument("--output-dir", type=str,
                        default="./seeding_scripts/synthetic_data",
                        help="Output directory for CSV files")
    parser.add_argument("--data-dir", type=str,
                        default="./seeding_scripts/data",
                        help="Directory with pre-existing customer CSV files (default: ./seeding_scripts/data)")
    parser.add_argument("--xml-dir", type=str,
                        default="./seeding_scripts/customer_xml/xml_out",
                        help="Directory with pre-generated XML files for ecomm (default: ./seeding_scripts/customer_xml/xml_out)")
    parser.add_argument("--accounts", type=int, default=10, help="Number of accounts (default: 10)")
    parser.add_argument("--products", type=int, default=15, help="Number of products (default: 15)")
    parser.add_argument("--actors", type=int, default=20, help="Number of actors (default: 20)")
    parser.add_argument("--trades", type=int, default=50, help="Number of trades (default: 50)")
    parser.add_argument("--alerts", type=int, default=10, help="Number of alerts (default: 10)")
    parser.add_argument("--ecomm", type=int, default=20, help="Number of eComm conversations (default: 20)")
    parser.add_argument("--start", type=str, help="Start from this phase (references, dimensions, trades, flagged_trade, alerts, ecomm_synth)")
    parser.add_argument("--end", type=str, help="Stop after this phase")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without generating")

    return parser.parse_args()


PHASE_ORDER = [
    "references",
    "dimensions",
    "trades",
    "flagged_trade",
    "alerts",
    "ecomm_synth",
]


def main():
    args = parse_args()

    print("=" * 60)
    print("Data Generation Orchestrator")
    print("=" * 60)

    output_dir = Path(args.output_dir)
    data_dir = Path(args.data_dir)
    seed = args.seed

    if seed is not None:
        print(f"Using random seed: {seed}")

    print(f"Output directory: {output_dir}")
    print(f"Customer data directory: {data_dir}")
    print(f"\nRecord counts:")
    print(f"  Accounts:    {args.accounts}")
    print(f"  Products:    {args.products}")
    print(f"  Actors:      {args.actors}")
    print(f"  Trades:      {args.trades}")
    print(f"  Alerts:      {args.alerts}")
    print(f"  eComm:       {args.ecomm}")

    # Determine phase range
    phases = PHASE_ORDER[:]
    if args.start:
        if args.start not in PHASE_ORDER:
            print(f"Error: Unknown phase '{args.start}'. Valid: {', '.join(PHASE_ORDER)}")
            sys.exit(1)
        phases = phases[phases.index(args.start):]
    if args.end:
        if args.end not in PHASE_ORDER:
            print(f"Error: Unknown phase '{args.end}'. Valid: {', '.join(PHASE_ORDER)}")
            sys.exit(1)
        end_idx = PHASE_ORDER.index(args.end)
        start_idx = PHASE_ORDER.index(phases[0])
        phases = phases[:end_idx - start_idx + 1]

    print(f"\nPhases to execute: {', '.join(phases)}")

    if args.dry_run:
        print("\n[DRY RUN] No data will be generated.")
        sys.exit(0)

    # Locate sample_conversations.txt
    script_dir = Path(__file__).parent.parent
    conversations_file = str(script_dir / "sample_conversations.txt")

    output_dir.mkdir(parents=True, exist_ok=True)
    start_time = time.time()

    # Copy pre-existing customer CSVs to the output directory (with
    # lowercase headers) so downstream generators can read them.
    existing_files: set[str] = set()
    if data_dir.is_dir():
        print(f"\n{'='*60}")
        print("Copying customer-provided CSVs")
        print(f"{'='*60}")
        existing_files = copy_customer_csvs(data_dir, output_dir)
        if existing_files:
            print(f"\n  {len(existing_files)} customer CSV(s) copied to output directory")
        else:
            print("  No customer CSVs found")

    # Determine which reference tables to skip (only ref_book for now)
    ref_skip_tables: set[str] = set()
    if "ref_book.csv" in existing_files:
        ref_skip_tables.add("ref_book")

    # Execute phases in dependency order with isolated RNG per phase
    phase_offset = 0

    for phase in phases:
        phase_offset += 1000
        phase_seed = (seed + phase_offset) if seed is not None else None
        phase_rng = random.Random(phase_seed)

        if should_skip_phase(phase, existing_files):
            print(f"\n{'='*60}")
            print(f"Phase: {phase} [SKIPPED - customer data present]")
            print(f"{'='*60}")
            continue

        print(f"\n{'='*60}")
        print(f"Phase: {phase}")
        print(f"{'='*60}")

        if phase == "references":
            generate_reference_csvs(output_dir, skip_tables=ref_skip_tables)

        elif phase == "dimensions":
            generate_dimensions(
                phase_rng, output_dir,
                account_count=args.accounts,
                actor_count=args.actors,
                product_count=args.products,
            )

        elif phase == "trades":
            generate_trades(phase_rng, output_dir, trade_count=args.trades)

        elif phase == "flagged_trade":
            generate_flagged_trades(phase_rng, output_dir, alert_count=args.alerts)

        elif phase == "alerts":
            generate_alerts(phase_rng, output_dir, alert_count=args.alerts)

        elif phase == "ecomm_synth":
            generate_ecomm_from_xml(
                phase_rng, output_dir,
                xml_dir=args.xml_dir,
            )

    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"GENERATION COMPLETE ({elapsed:.1f}s)")
    print(f"{'='*60}")
    print(f"Output: {output_dir}")

    # List generated files
    csv_files = sorted(output_dir.glob("*.csv"))
    print(f"\nGenerated {len(csv_files)} CSV files:")
    for f in csv_files:
        size = f.stat().st_size
        print(f"  {f.name} ({size:,} bytes)")


if __name__ == "__main__":
    main()
