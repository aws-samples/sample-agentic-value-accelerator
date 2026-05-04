"""
Trade data generator: Fact_Trade -> CSV.

Source: seeding_scripts/seed_data_trade.py (TradeGenerator)
Loads dimension data from CSVs instead of database.
"""

import csv
import random
import string
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .constants import (
    ALGORITHM_FLAGS, BOOK_CODES, INVOICE_TRADE_FLAGS, LEGAL_ENTITIES,
    SIDE_CODES, SIDE_NAME_MAP, TRADE_STATES, TRADE_VENUES,
    TRADER_CAPACITIES, SOURCE_CODES, SOURCE_NAME_MAP,
    TRADE_TYPE_MAP, MIN_PRICE, MAX_PRICE, QUANTITIES,
    REF_DEALER_NAME,
)
from .models import TradeRecord
from .csv_writer import write_csv


@dataclass
class DimAccountData:
    """Minimal account data for trade generation."""
    account_id: str
    account_name: str


@dataclass
class DimActorData:
    """Minimal actor data for trade generation."""
    trader_id: str
    name: str


@dataclass
class DimProductData:
    """Minimal product data for trade generation."""
    isin: str
    description_short: str


def _load_dim_accounts(csv_path: Path) -> list[DimAccountData]:
    """Load account data from dim_account.csv."""
    accounts = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            accounts.append(DimAccountData(
                account_id=row["account_id"],
                account_name=row["account_name"],
            ))
    return accounts


def _load_dim_actors(csv_path: Path) -> list[DimActorData]:
    """Load actor data from dim_actor.csv."""
    actors = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            actors.append(DimActorData(
                trader_id=row["actor_trader_id"],
                name=row["actor_trader_name"],
            ))
    return actors


def _load_dim_products(csv_path: Path) -> list[DimProductData]:
    """Load product data from dim_product.csv."""
    products = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            products.append(DimProductData(
                isin=row["product_isin"],
                description_short=row["product_description_short"],
            ))
    return products


def _random_alphanumeric(rng: random.Random, length: int, caps_only: bool = True) -> str:
    if caps_only:
        chars = string.ascii_uppercase + string.digits
    else:
        chars = string.ascii_letters + string.digits
    return "".join(rng.choice(chars) for _ in range(length))


class TradeGenerator:
    """Generates Fact_Trade records."""

    def __init__(
        self,
        rng: random.Random,
        accounts: list[DimAccountData],
        actors: list[DimActorData],
        products: list[DimProductData],
    ):
        self.rng = rng
        self.accounts = accounts
        self.actors = actors
        self.products = products
        self._used_trade_ids = set()
        self._used_ticket_ids = set()

    def generate(self, count: int) -> list[TradeRecord]:
        """Generate trade records: ~80% Trade, ~20% RFQ."""
        trades = []

        trade_count = max(1, int(count * 0.8))
        rfq_count = max(1, count - trade_count)

        for _ in range(trade_count):
            trades.append(self._generate_trade_event())
        for _ in range(rfq_count):
            trades.append(self._generate_rfq_event())

        self.rng.shuffle(trades)
        return trades

    def _generate_unique_trade_id(self) -> str:
        while True:
            trade_id = _random_alphanumeric(self.rng, 10, caps_only=False)
            if trade_id not in self._used_trade_ids:
                self._used_trade_ids.add(trade_id)
                return trade_id

    def _generate_unique_ticket_id(self) -> str:
        while True:
            ticket_id = _random_alphanumeric(self.rng, 9, caps_only=True)
            if ticket_id not in self._used_ticket_ids:
                self._used_ticket_ids.add(ticket_id)
                return ticket_id

    def _make_trade_timestamp(self, base_date: datetime) -> datetime:
        hour = self.rng.randint(8, 18)
        minute = self.rng.randint(0, 59)
        second = self.rng.randint(0, 59)
        return base_date.replace(hour=hour, minute=minute, second=second, microsecond=0)

    def _random_date_within_days(self, days: int) -> datetime:
        today = datetime.now()
        days_ago = self.rng.randint(0, days)
        date = today - timedelta(days=days_ago)
        weekday = date.weekday()
        if weekday == 5:
            date -= timedelta(days=1)
        elif weekday == 6:
            date -= timedelta(days=2)
        return date

    def _generate_base_trade(self, event_type: str) -> dict:
        account = self.rng.choice(self.accounts)
        actor = self.rng.choice(self.actors)
        product = self.rng.choice(self.products)

        trade_date = self._random_date_within_days(90)
        entry_date = trade_date - timedelta(days=self.rng.randint(0, 2))
        weekday = entry_date.weekday()
        if weekday == 5:
            entry_date -= timedelta(days=1)
        elif weekday == 6:
            entry_date -= timedelta(days=2)

        side_code = self.rng.choice(SIDE_CODES)
        side_name = SIDE_NAME_MAP[side_code]
        source = self.rng.choice(SOURCE_CODES)
        trade_type_code = self.rng.choice(list(TRADE_TYPE_MAP.keys()))
        trade_type_name = TRADE_TYPE_MAP[trade_type_code]

        return {
            "trade_date": trade_date,
            "trade_entry_date": entry_date,
            "trade_event_type": event_type,
            "trade_algorithm_flag": self.rng.choice(ALGORITHM_FLAGS),
            "trade_book_code": self.rng.choice(BOOK_CODES),
            "trade_dealer_count": None,
            "trade_dealer_name": self.rng.choice(REF_DEALER_NAME),
            "trade_isvoicetrade": self.rng.choice(INVOICE_TRADE_FLAGS),
            "trade_legal_entity": self.rng.choice(LEGAL_ENTITIES),
            "trade_qty": self.rng.choice(QUANTITIES),
            "trade_side_code": side_code,
            "trade_side_name": side_name,
            "trade_source_code": source,
            "trade_source_name": SOURCE_NAME_MAP[source],
            "trade_standard_id": _random_alphanumeric(self.rng, 6, caps_only=True),
            "trade_state": self.rng.choice(TRADE_STATES),
            "trade_ticket_id": self._generate_unique_ticket_id(),
            "trade_time": self._make_trade_timestamp(trade_date),
            "trade_type_code": trade_type_code,
            "trade_type_name": trade_type_name,
            "trade_venue": self.rng.choice(TRADE_VENUES),
            "trade_account_id": account.account_id,
            "trade_account_name": account.account_name,
            "trade_trader_id": actor.trader_id,
            "trade_trader_capacity": self.rng.choice(TRADER_CAPACITIES),
            "trade_trader_name": actor.name,
            "trade_isin": product.isin,
            "trade_asset_class_name": "Debt",
            "trade_product": product.description_short,
        }

    def _generate_trade_event(self) -> TradeRecord:
        base = self._generate_base_trade("Trade")
        price = round(self.rng.uniform(MIN_PRICE, MAX_PRICE), 2)
        notional = int((price / 100.0) * base["trade_qty"])
        return TradeRecord(
            trade_id=self._generate_unique_trade_id(),
            trade_algorithm_flag=base["trade_algorithm_flag"],
            trade_book_code=base["trade_book_code"],
            trade_date=base["trade_date"],
            trade_dealer_count=base["trade_dealer_count"],
            trade_dealer_name=base["trade_dealer_name"],
            trade_entry_date=base["trade_entry_date"],
            trade_event_type=base["trade_event_type"],
            trade_isvoicetrade=base["trade_isvoicetrade"],
            trade_legal_entity=base["trade_legal_entity"],
            trade_notional=notional,
            trade_price=price,
            trade_qty=base["trade_qty"],
            trade_side_code=base["trade_side_code"],
            trade_side_name=base["trade_side_name"],
            trade_source_code=base["trade_source_code"],
            trade_source_name=base["trade_source_name"],
            trade_standard_id=base["trade_standard_id"],
            trade_state=base["trade_state"],
            trade_ticket_id=base["trade_ticket_id"],
            trade_time=base["trade_time"],
            trade_type_code=base["trade_type_code"],
            trade_type_name=base["trade_type_name"],
            trade_venue=base["trade_venue"],
            trade_account_id=base["trade_account_id"],
            trade_account_name=base["trade_account_name"],
            trade_trader_id=base["trade_trader_id"],
            trade_trader_capacity=base["trade_trader_capacity"],
            trade_trader_name=base["trade_trader_name"],
            trade_isin=base["trade_isin"],
            trade_asset_class_name=base["trade_asset_class_name"],
            trade_product=base["trade_product"],
        )

    def _generate_rfq_event(self) -> TradeRecord:
        base = self._generate_base_trade("RFQ")
        return TradeRecord(
            trade_id=f"RFQ_{self._generate_unique_trade_id()}",
            trade_algorithm_flag=base["trade_algorithm_flag"],
            trade_book_code=base["trade_book_code"],
            trade_date=base["trade_date"],
            trade_dealer_count=base["trade_dealer_count"],
            trade_dealer_name=base["trade_dealer_name"],
            trade_entry_date=base["trade_entry_date"],
            trade_event_type=base["trade_event_type"],
            trade_isvoicetrade=base["trade_isvoicetrade"],
            trade_legal_entity=base["trade_legal_entity"],
            trade_notional=None,
            trade_price=None,
            trade_qty=base["trade_qty"],
            trade_side_code=base["trade_side_code"],
            trade_side_name=base["trade_side_name"],
            trade_source_code=base["trade_source_code"],
            trade_source_name=base["trade_source_name"],
            trade_standard_id=base["trade_standard_id"],
            trade_state=base["trade_state"],
            trade_ticket_id=base["trade_ticket_id"],
            trade_time=base["trade_time"],
            trade_type_code=base["trade_type_code"],
            trade_type_name=base["trade_type_name"],
            trade_venue=base["trade_venue"],
            trade_account_id=base["trade_account_id"],
            trade_account_name=base["trade_account_name"],
            trade_trader_id=base["trade_trader_id"],
            trade_trader_capacity=base["trade_trader_capacity"],
            trade_trader_name=base["trade_trader_name"],
            trade_isin=base["trade_isin"],
            trade_asset_class_name=base["trade_asset_class_name"],
            trade_product=base["trade_product"],
        )


def generate_trades(rng: random.Random, output_dir: Path, trade_count: int = 50):
    """Generate Fact_Trade CSV from dimension CSVs."""
    print(f"  Loading dimension data from CSVs...")
    accounts = _load_dim_accounts(output_dir / "dim_account.csv")
    actors = _load_dim_actors(output_dir / "dim_actor.csv")
    products = _load_dim_products(output_dir / "dim_product.csv")
    print(f"    Loaded: {len(accounts)} accounts, {len(actors)} actors, {len(products)} products")

    if not accounts or not actors or not products:
        print("Error: Missing dimension CSVs. Run dimension generation first.")
        return []

    print(f"  Generating {trade_count} trades...")
    gen = TradeGenerator(rng, accounts, actors, products)
    trades = gen.generate(trade_count)

    trade_events = sum(1 for t in trades if t.trade_event_type == "Trade")
    rfq_events = len(trades) - trade_events
    print(f"    Generated: {len(trades)} trades ({trade_events} Trade, {rfq_events} RFQ)")

    write_csv(trades, output_dir / "fact_trade.csv")
    print(f"  fact_trade.csv: {len(trades)} records")

    return trades
