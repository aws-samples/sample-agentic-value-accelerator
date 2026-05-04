"""
Basic eComm data generator: Fact_eComm (IM/ActivityLog/RFQ) -> CSV.

Source: seeding_scripts/db_seed_facts.py (ECommGenerator)
Reads dim_account.csv, dim_actor.csv, dim_product.csv.
"""

import csv
import random
import string
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .constants import (
    INSTANT_MESSAGES, WEEKDAYS,
    APP_TYPE_MAP, APP_IM_CODES, APP_ACTIVITY_CODES, APP_RFQ_CODES,
)
from .models import ECommRecord
from .csv_writer import write_csv


@dataclass
class DimAccountData:
    account_id: str
    account_name: str
    account_number: str
    account_type: str


@dataclass
class DimActorData:
    trader_id: str
    name: str
    organization: str
    account_id: str


@dataclass
class DimProductData:
    isin: str
    description_short: str


def _load_accounts(csv_path: Path) -> list[DimAccountData]:
    accounts = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            accounts.append(DimAccountData(
                account_id=row["account_id"],
                account_name=row["account_name"],
                account_number=row["account_number"],
                account_type=row["account_type"],
            ))
    return accounts


def _load_actors(csv_path: Path) -> list[DimActorData]:
    actors = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            actors.append(DimActorData(
                trader_id=row["actor_trader_id"],
                name=row["actor_trader_name"],
                organization=row["actor_organization"],
                account_id=row["actor_account_id"],
            ))
    return actors


def _load_products(csv_path: Path) -> list[DimProductData]:
    products = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            products.append(DimProductData(
                isin=row["product_isin"],
                description_short=row["product_description_short"],
            ))
    return products


class ECommGenerator:
    """Generates Fact_eComm records: IM, Activity Log, RFQ."""

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
        self._row_counter = 0
        self._app_counter = {"App": 0, "ActivityLog": 0, "RFQ": 0}

    def generate(self, count: int) -> list[ECommRecord]:
        """Generate eComm records: ~40% IM, ~30% Activity, ~30% RFQ."""
        records = []

        im_count = max(1, int(count * 0.4))
        activity_count = max(1, int(count * 0.3))
        rfq_count = max(1, count - im_count - activity_count)

        for _ in range(im_count):
            records.extend(self._generate_instant_messenger_conversation())
        for _ in range(activity_count):
            records.extend(self._generate_activity_log_entry())
        for _ in range(rfq_count):
            records.extend(self._generate_rfq_conversation())

        return records

    def _get_next_row_id(self) -> str:
        self._row_counter += 1
        return str(self._row_counter).zfill(6)

    def _get_next_app_code(self, app_type: str) -> str:
        codes = {
            "App": APP_IM_CODES,
            "ActivityLog": APP_ACTIVITY_CODES,
            "RFQ": APP_RFQ_CODES,
        }[app_type]
        self._app_counter[app_type] += 1
        return codes[(self._app_counter[app_type] - 1) % len(codes)]

    def _get_abbreviation(self, name: str) -> str:
        words = name.split()
        if len(words) >= 2:
            return "".join(w[0].upper() for w in words[:3])
        return name[:3].upper()

    def _make_timestamp(self, base_date: datetime) -> datetime:
        hour = self.rng.randint(8, 18)
        minute = self.rng.randint(0, 59)
        second = self.rng.randint(0, 59)
        return base_date.replace(hour=hour, minute=minute, second=second, microsecond=0)

    def _random_date_within_days(self, days: int) -> datetime:
        today = datetime.now()
        days_ago = self.rng.randint(0, days)
        return today - timedelta(days=days_ago)

    def _generate_instant_messenger_conversation(self) -> list[ECommRecord]:
        records = []
        app_code = self._get_next_app_code("App")
        conv_date = self._random_date_within_days(90)
        weekday = WEEKDAYS[conv_date.weekday() % 5]

        actor1 = self.rng.choice(self.actors)
        actor2 = self.rng.choice([a for a in self.actors if a.trader_id != actor1.trader_id])

        num_messages = self.rng.randint(2, 5)
        current_sender = actor1
        current_receiver = actor2

        for seq in range(1, num_messages + 1):
            message = self.rng.choice(INSTANT_MESSAGES)
            record = ECommRecord(
                conversation_id=self._get_next_row_id(),
                app_code=app_code,
                app_type=APP_TYPE_MAP[app_code],
                date=conv_date,
                message_body=message,
                timestamp=self._make_timestamp(conv_date),
                weekday=weekday,
                from_organization=current_sender.organization,
                from_actor=current_sender.name,
                to_organization=current_receiver.organization,
                to_actor=current_receiver.name,
                event_sequence=seq,
                action="NA",
                mic="NA",
                bid=None,
                offer=None,
                price_type="NA",
                instrument_id="NA",
                instrument_des="NA",
            )
            records.append(record)
            current_sender, current_receiver = current_receiver, current_sender

        return records

    def _generate_activity_log_entry(self) -> list[ECommRecord]:
        app_code = self._get_next_app_code("ActivityLog")
        conv_date = self._random_date_within_days(90)
        weekday = WEEKDAYS[conv_date.weekday() % 5]
        timestamp = self._make_timestamp(conv_date)

        actor = self.rng.choice(self.actors)
        chars = string.ascii_uppercase + string.digits
        trade_id = "".join(self.rng.choice(chars) for _ in range(10))

        message = (
            f"{actor.organization} ({actor.name}) booked trade {trade_id}. "
            f"Trade is complete. Price execution time is {timestamp.strftime('%Y-%m-%d %H:%M:%S')}"
        )

        record = ECommRecord(
            conversation_id=self._get_next_row_id(),
            app_code=app_code,
            app_type=APP_TYPE_MAP[app_code],
            date=conv_date,
            message_body=message,
            timestamp=timestamp,
            weekday=weekday,
            from_organization=actor.organization,
            from_actor=actor.name,
            to_organization="NA",
            to_actor="NA",
            event_sequence=1,
            action="NA",
            mic="NA",
            bid=None,
            offer=None,
            price_type="NA",
            instrument_id="NA",
            instrument_des="NA",
        )
        return [record]

    def _generate_rfq_conversation(self) -> list[ECommRecord]:
        records = []
        app_code = self._get_next_app_code("RFQ")
        conv_date = self._random_date_within_days(90)
        weekday = WEEKDAYS[conv_date.weekday() % 5]

        account = self.rng.choice(self.accounts)
        product = self.rng.choice(self.products)
        org_abbrev = self._get_abbreviation(account.account_name)
        bid_price = round(self.rng.uniform(95.0, 105.0), 2)

        rfq_sequence = [
            {"action": "RFQNew", "has_bid": False},
            {"action": "RFQQuoteGiven", "has_bid": True},
            {"action": "RFQClientAccepted", "has_bid": True},
            {"action": "RFQTraderAccepted", "has_bid": True},
        ]

        for seq, rfq_step in enumerate(rfq_sequence, start=1):
            record = ECommRecord(
                conversation_id=self._get_next_row_id(),
                app_code=app_code,
                app_type=APP_TYPE_MAP[app_code],
                date=conv_date,
                message_body="NA",
                timestamp=self._make_timestamp(conv_date),
                weekday=weekday,
                from_organization=account.account_name,
                from_actor="NA",
                to_organization="NA",
                to_actor="NA",
                event_sequence=seq,
                action=rfq_step["action"],
                mic=org_abbrev,
                bid=bid_price if rfq_step["has_bid"] else None,
                offer=None,
                price_type="Price" if rfq_step["has_bid"] else "NA",
                instrument_id=product.isin,
                instrument_des=product.description_short,
            )
            records.append(record)

        return records


def generate_ecomm(rng: random.Random, output_dir: Path, ecomm_count: int = 20):
    """Generate basic Fact_eComm CSV."""
    print(f"  Loading dimension data for eComm...")
    accounts = _load_accounts(output_dir / "dim_account.csv")
    actors = _load_actors(output_dir / "dim_actor.csv")
    products = _load_products(output_dir / "dim_product.csv")
    print(f"    Loaded: {len(accounts)} accounts, {len(actors)} actors, {len(products)} products")

    if not accounts or not actors or not products:
        print("Error: Missing dimension CSVs.")
        return []

    print(f"  Generating ~{ecomm_count} eComm conversations...")
    gen = ECommGenerator(rng, accounts, actors, products)
    records = gen.generate(ecomm_count)
    print(f"    Generated: {len(records)} eComm records")

    write_csv(records, output_dir / "fact_ecomm.csv")
    print(f"  fact_ecomm.csv: {len(records)} records")

    return records
