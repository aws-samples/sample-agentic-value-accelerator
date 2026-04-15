"""
Flagged_Trade generator: Flagged_Trade -> CSV.

Source: seeding_scripts/seed_flagged_trade.py (FlaggedTradeGenerator)
Reads fact_trade.csv for trade IDs (filters out RFQ events).
"""

import csv
import random
from pathlib import Path

from .models import FlaggedTradeRecord
from .csv_writer import write_csv


def _load_trade_ids(csv_path: Path) -> list[str]:
    """Load trade IDs from fact_trade.csv, excluding RFQ events."""
    trade_ids = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            trade_id = row["trade_id"]
            if not trade_id.startswith("RFQ_"):
                trade_ids.append(trade_id)
    return trade_ids


class FlaggedTradeGenerator:
    """Generates Flagged_Trade records linking alerts to trades."""

    def __init__(self, rng: random.Random, trade_ids: list[str]):
        self.rng = rng
        self.trade_ids = trade_ids

    def generate(self, alert_count: int, min_trades: int = 1, max_trades: int = 3) -> list[FlaggedTradeRecord]:
        """Generate Flagged_Trade records. Each alert links to 1-3 trades."""
        records = []

        if not self.trade_ids:
            print("Warning: No trade IDs available to link")
            return records

        for alert_id in range(1, alert_count + 1):
            num_trades = self.rng.randint(min_trades, min(max_trades, len(self.trade_ids)))
            selected_trades = self.rng.sample(self.trade_ids, num_trades)
            for trade_id in selected_trades:
                records.append(FlaggedTradeRecord(
                    trade_alert_id=alert_id,
                    trade_id=trade_id,
                ))

        return records


def generate_flagged_trades(
    rng: random.Random,
    output_dir: Path,
    alert_count: int = 10,
    min_trades: int = 1,
    max_trades: int = 3,
):
    """Generate Flagged_Trade CSV from fact_trade.csv."""
    print(f"  Loading trade IDs from fact_trade.csv...")
    trade_ids = _load_trade_ids(output_dir / "fact_trade.csv")
    print(f"    Loaded: {len(trade_ids)} non-RFQ trade IDs")

    if not trade_ids:
        print("Error: No trade IDs found. Run trade generation first.")
        return []

    print(f"  Generating Flagged_Trade links for {alert_count} alerts ({min_trades}-{max_trades} trades each)...")
    gen = FlaggedTradeGenerator(rng, trade_ids)
    records = gen.generate(alert_count, min_trades, max_trades)

    unique_alerts = len(set(r.trade_alert_id for r in records))
    unique_trades = len(set(r.trade_id for r in records))
    print(f"    Generated: {len(records)} Flagged_Trade records ({unique_alerts} alerts -> {unique_trades} unique trades)")

    write_csv(records, output_dir / "flagged_trade.csv")
    print(f"  flagged_trade.csv: {len(records)} records")

    return records
