"""
Alert data generator: Fact_Alert -> CSV.

Source: seeding_scripts/db_seed_facts.py (AlertGenerator)
Reads dim_account.csv, dim_product.csv, flagged_trade.csv.
"""

import csv
import random
import string
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .models import AlertRecord
from .csv_writer import write_csv


@dataclass
class DimAccountData:
    account_id: str
    account_name: str
    account_number: str


@dataclass
class DimProductData:
    isin: str


def _load_accounts(csv_path: Path) -> list[DimAccountData]:
    accounts = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            accounts.append(DimAccountData(
                account_id=row["account_id"],
                account_name=row["account_name"],
                account_number=row["account_number"],
            ))
    return accounts


def _load_products(csv_path: Path) -> list[DimProductData]:
    products = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            products.append(DimProductData(isin=row["product_isin"]))
    return products


def _load_flagged_trade_ids(csv_path: Path) -> list[str]:
    trade_ids = []
    if not csv_path.exists():
        return trade_ids
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            trade_ids.append(row["trade_id"])
    return list(set(trade_ids))


class AlertGenerator:
    """Generates Fact_Alert records."""

    def __init__(
        self,
        rng: random.Random,
        accounts: list[DimAccountData],
        products: list[DimProductData],
        flagged_trade_ids: list[str] = None,
    ):
        self.rng = rng
        self.accounts = accounts
        self.products = products
        self.flagged_trade_ids = flagged_trade_ids or []

    def generate(self, count: int) -> list[AlertRecord]:
        alerts = []
        for i in range(count):
            account = self.rng.choice(self.accounts)
            product = self.rng.choice(self.products)
            alert_date = self._random_date_within_days(90)

            if self.flagged_trade_ids:
                alert_trade_id = self.rng.choice(self.flagged_trade_ids)
            else:
                chars = string.ascii_uppercase + string.digits
                alert_trade_id = "".join(self.rng.choice(chars) for _ in range(10))

            hour = self.rng.randint(8, 18)
            minute = self.rng.randint(0, 59)
            second = self.rng.randint(0, 59)
            alert_time = alert_date.replace(hour=hour, minute=minute, second=second, microsecond=0)

            alert = AlertRecord(
                alert_id=f"MSP{(i+1):04d}",
                alert_date=alert_date,
                alert_isin=product.isin,
                alert_summary="Possible market surveillance alert",
                alert_time=alert_time,
                alert_trade_id=alert_trade_id,
                alert_account_id=account.account_id,
                alert_account_name=account.account_name,
                alert_account_number=account.account_number,
            )
            alerts.append(alert)
        return alerts

    def _random_date_within_days(self, days: int) -> datetime:
        today = datetime.now()
        days_ago = self.rng.randint(0, days)
        return today - timedelta(days=days_ago)


def generate_alerts(rng: random.Random, output_dir: Path, alert_count: int = 10):
    """Generate Fact_Alert CSV."""
    print(f"  Loading dimension data for alerts...")
    accounts = _load_accounts(output_dir / "dim_account.csv")
    products = _load_products(output_dir / "dim_product.csv")
    flagged_trade_ids = _load_flagged_trade_ids(output_dir / "flagged_trade.csv")
    print(f"    Loaded: {len(accounts)} accounts, {len(products)} products, {len(flagged_trade_ids)} Flagged_Trade IDs")

    print(f"  Generating {alert_count} alerts...")
    gen = AlertGenerator(rng, accounts, products, flagged_trade_ids)
    alerts = gen.generate(alert_count)
    print(f"    Generated: {len(alerts)} alerts")

    write_csv(alerts, output_dir / "fact_alert.csv")
    print(f"  fact_alert.csv: {len(alerts)} records")

    return alerts
