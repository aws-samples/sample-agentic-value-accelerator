"""
Synthetic eComm data generator: trade-correlated conversations -> CSV.

Source: seeding_scripts/seed_ecomm_synth.py (SyntheticECommSeeder)
12-step pipeline. Reads fact_trade.csv, dim_account.csv, dim_actor.csv, sample_conversations.txt.
"""

import csv
import os
import random
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from .constants import (
    WEEKDAY_ABBREV, EXECUTION_KEYWORDS,
    APP_TYPE_MAP, APP_IM_CODES, CLIENT_NAMES,
)
from .models import SyntheticECommRecord
from .csv_writer import write_csv


@dataclass
class TradeData:
    """Trade data from fact_trade.csv."""
    trade_id: str
    trade_product: str
    trade_price: Optional[float]
    trade_qty: int
    trade_time: datetime
    trade_trader_id: str
    trade_trader_name: str
    trade_account_id: str
    trade_account_name: str
    trade_isin: str
    trade_side_name: str


@dataclass
class DimAccountData:
    account_id: str
    account_name: str
    account_type: str


@dataclass
class DimActorData:
    trader_id: str
    name: str
    organization: str
    account_id: str


# =============================================================================
# CONVERSATION TEMPLATES
# =============================================================================


def load_conversation_templates(filepath: str) -> list[dict]:
    """Load conversation templates from sample_conversations.txt."""
    templates = []

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        raw_templates = content.split('Conversation Template ')

        for raw in raw_templates[1:]:
            lines = raw.strip().split('\n')
            if not lines:
                continue

            header = lines[0]
            if ' - ' in header:
                name = header.split(' - ', 1)[1].strip().lower().replace(' ', '_').replace('/', '_')
            else:
                name = f"template_{len(templates) + 1}"

            messages = []
            for line in lines[1:]:
                line = line.strip()
                if not line or line == '---':
                    continue

                if line.startswith('Trader:'):
                    sender = "trader"
                    text = line[7:].strip()
                elif line.startswith('Client:'):
                    sender = "client"
                    text = line[7:].strip()
                else:
                    continue

                is_execution = any(kw in text.lower() for kw in [
                    "works for me", "take it", "do it", "that works",
                    "take the offer", "done", "perfect", "agreed"
                ])

                messages.append({
                    "sender": sender,
                    "text": text,
                    "is_execution": is_execution
                })

            if messages:
                templates.append({
                    "name": name,
                    "messages": messages
                })

        print(f"  Loaded {len(templates)} conversation templates from {filepath}")

    except FileNotFoundError:
        print(f"Error: {filepath} not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        sys.exit(1)

    if not templates:
        print(f"Error: No valid templates found in {filepath}")
        sys.exit(1)

    return templates


# =============================================================================
# DATA LOADING
# =============================================================================


def _load_trades_from_csv(csv_path: Path) -> list[TradeData]:
    """Load trade data from fact_trade.csv."""
    trades = []
    with open(csv_path, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('trade_event_type') == 'RFQ':
                continue
            if not row.get('trade_price'):
                continue

            trade_time = row.get('trade_time', '')
            if isinstance(trade_time, str):
                try:
                    trade_time = datetime.strptime(trade_time, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    trade_time = datetime.now()

            trades.append(TradeData(
                trade_id=row.get('trade_id', ''),
                trade_product=row.get('trade_product', ''),
                trade_price=float(row['trade_price']) if row.get('trade_price') else None,
                trade_qty=int(row.get('trade_qty', 0)),
                trade_time=trade_time,
                trade_trader_id=row.get('trade_trader_id', ''),
                trade_trader_name=row.get('trade_trader_name', ''),
                trade_account_id=row.get('trade_account_id', ''),
                trade_account_name=row.get('trade_account_name', ''),
                trade_isin=row.get('trade_isin', ''),
                trade_side_name=row.get('trade_side_name', ''),
            ))
    return trades


def _load_accounts_from_csv(csv_path: Path) -> list[DimAccountData]:
    accounts = []
    with open(csv_path, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            accounts.append(DimAccountData(
                account_id=row["account_id"],
                account_name=row["account_name"],
                account_type=row["account_type"],
            ))
    return accounts


def _load_actors_from_csv(csv_path: Path) -> list[DimActorData]:
    actors = []
    with open(csv_path, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            actors.append(DimActorData(
                trader_id=row["actor_trader_id"],
                name=row["actor_trader_name"],
                organization=row["actor_organization"],
                account_id=row["actor_account_id"],
            ))
    return actors


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_weekday_abbreviation(dt: datetime) -> str:
    """Step 9: Get abbreviated weekday (Mon-Fri)."""
    weekday = dt.weekday()
    if weekday >= 5:
        return "Fri"
    return WEEKDAY_ABBREV.get(weekday, "Mon")


# =============================================================================
# SYNTHETIC ECOMM SEEDER
# =============================================================================


class SyntheticECommSeeder:
    """
    Orchestrates synthetic eComm data generation (12-step pipeline).

    1. Generate conversation skeletons from templates
    2. Cross-reference trades
    3. Inject trade values into conversations
    4. Enforce 1:1 trade-conversation mapping
    5. Map trade timestamps to conversations
    6. Identify exact execution message
    7. Attach timestamp to execution message
    8. Map trader names from trade records
    9. Add abbreviated weekday
    10. Assign organizations to participants
    11. Populate eComm table fields
    12. Resolve app code
    """

    def __init__(self, rng: random.Random, templates: list[dict]):
        self.rng = rng
        self.templates = templates
        self.ecomm_records: list[SyntheticECommRecord] = []
        self.trades: list[TradeData] = []
        self.accounts: list[DimAccountData] = []
        self.actors: list[DimActorData] = []
        self._used_trade_ids: set[str] = set()
        self._conversation_counter = 122
        self._app_counter = 0

    def generate_conversation_skeleton(self) -> dict:
        """Step 1: Select random template."""
        return self.rng.choice(self.templates).copy()

    def inject_trade_values(self, template: dict, trade: TradeData,
                            trader_name: str, client_name: str) -> list[dict]:
        """Step 3: Inject trade values into conversation placeholders."""
        messages = []

        price_str = f"{trade.trade_price:.2f}" if trade.trade_price else "market"
        size_mm = trade.trade_qty / 1_000_000

        bid_price = price_str
        offer_price = f"{trade.trade_price + 0.25:.2f}" if trade.trade_price else "market"
        counter_price = f"{trade.trade_price + 0.10:.2f}" if trade.trade_price else "market"
        final_price = price_str
        tighter_bid = f"{trade.trade_price - 0.05:.2f}" if trade.trade_price else "market"
        tighter_offer = f"{trade.trade_price + 0.15:.2f}" if trade.trade_price else "market"

        confirmation_phrases = ["Done", "Confirmed", "Agreed", "Works", "Perfect"]
        confirmation = self.rng.choice(confirmation_phrases)

        for msg in template["messages"]:
            text = msg["text"]

            replacements = {
                "{Trader_Name}": trader_name,
                "{Client_Name}": client_name,
                "{Instrument}": trade.trade_product,
                "{Size}": f"{size_mm:.0f}",
                "{Bid_Price}": bid_price,
                "{Offer_Price}": offer_price,
                "{Counter_Price}": counter_price,
                "{Final_Price}": final_price,
                "{Tighter_Bid}": tighter_bid,
                "{Tighter_Offer}": tighter_offer,
                "{Target_Price}": counter_price,
                "{Negotiated_Price}": counter_price,
                "{Minimum_Price}": tighter_bid,
                "{Better_Price}": final_price,
                "{Price}": price_str,
                "{Confirmation_Phrase}": confirmation,
                "{Original_Size}": f"{size_mm * 0.5:.0f}",
                "{New_Size}": f"{size_mm:.0f}",
                "{Original_Price}": tighter_bid,
                "{New_Price}": offer_price,
                "{Smaller_Size}": f"{size_mm * 0.5:.0f}",
            }

            for placeholder, value in replacements.items():
                text = text.replace(placeholder, value)

            messages.append({
                "sender": msg["sender"],
                "text": text,
                "is_execution": msg.get("is_execution", False),
            })
        return messages

    def identify_execution_message(self, messages: list[dict]) -> int:
        """Step 6: Find the execution message index."""
        for i, msg in enumerate(messages):
            if msg.get("is_execution", False):
                return i

        for i, msg in enumerate(messages):
            text_lower = msg["text"].lower()
            if any(keyword in text_lower for keyword in EXECUTION_KEYWORDS):
                return i

        return len(messages) - 1

    def map_timestamps(self, messages: list[dict], trade_time: datetime,
                       execution_idx: int) -> list[dict]:
        """Steps 5, 7: Map timestamps to messages (strictly sequential)."""
        timestamped_messages = []

        if execution_idx > 0:
            total_pre_window = self.rng.randint(5, 30)
            for i in range(execution_idx):
                proportion = (execution_idx - i) / execution_idx
                offset_minutes = max(1, int(total_pre_window * proportion))
                if offset_minutes > 1:
                    jitter = self.rng.randint(0, min(2, offset_minutes - 1))
                else:
                    jitter = 0
                timestamp = trade_time - timedelta(minutes=offset_minutes - jitter)
                timestamped_messages.append({**messages[i], "timestamp": timestamp})

        timestamped_messages.append({**messages[execution_idx], "timestamp": trade_time})

        current_time = trade_time
        for i in range(execution_idx + 1, len(messages)):
            increment = self.rng.randint(1, 5)
            current_time = current_time + timedelta(minutes=increment)
            timestamped_messages.append({**messages[i], "timestamp": current_time})

        return timestamped_messages

    def map_trader_names(self, trade: TradeData) -> tuple[str, str]:
        """Step 8: Map trader names from trade records."""
        trader_name = trade.trade_trader_name
        trader_org = None

        for actor in self.actors:
            if actor.trader_id == trade.trade_trader_id or actor.name == trade.trade_trader_name:
                trader_org = actor.organization
                if not trader_name:
                    trader_name = actor.name
                break

        if not trader_org:
            trader_org = trade.trade_account_name or "Trading Desk"

        return trader_name, trader_org

    def assign_organizations(self, trade: TradeData) -> tuple[str, str, str, str]:
        """Step 10: Assign organizations to participants."""
        trader_name, trader_org = self.map_trader_names(trade)

        client_accounts = [a for a in self.accounts if a.account_type == "Client"]
        if client_accounts:
            client_account = self.rng.choice(client_accounts)
            client_org = client_account.account_name
        else:
            client_org = "External Client"

        client_name = self.rng.choice(CLIENT_NAMES)

        return client_name, client_org, trader_name, trader_org

    def resolve_app_code(self) -> tuple[str, str]:
        """Step 12: Cycle through IM app codes."""
        if not APP_IM_CODES:
            return ("App4", "Instant Messenger")

        app_code = APP_IM_CODES[self._app_counter % len(APP_IM_CODES)]
        self._app_counter += 1
        app_type = APP_TYPE_MAP.get(app_code, "Instant Messenger")
        return app_code, app_type

    def build_ecomm_records(self, messages: list[dict], trade: TradeData,
                            client_name: str, client_org: str,
                            trader_name: str, trader_org: str,
                            weekday: str, app_code: str, app_type: str,
                            conversation_id: str) -> list[SyntheticECommRecord]:
        """Step 11: Build eComm records from conversation messages."""
        records = []
        trade_date = trade.trade_time.date()

        for i, msg in enumerate(messages):
            if msg["sender"] == "trader":
                from_name = trader_name
                from_org = trader_org
                to_name = client_name
                to_org = client_org
            else:
                from_name = client_name
                from_org = client_org
                to_name = trader_name
                to_org = trader_org

            record = SyntheticECommRecord(
                conversation_id=f"{conversation_id}_{i + 1:03d}",
                app_code=app_code,
                app_type=app_type,
                date=trade_date.strftime("%Y-%m-%d"),
                message_body=msg["text"],
                timestamp=msg["timestamp"],
                weekday=weekday,
                from_organization=from_org,
                from_actor=from_name,
                to_organization=to_org,
                to_actor=to_name,
                event_sequence=i + 1,
                instrument_id=trade.trade_isin,
            )
            records.append(record)

        return records

    def _get_unmapped_trade(self) -> Optional[TradeData]:
        """Step 4 helper: Get an unmapped trade (1:1 enforcement)."""
        for trade in self.trades:
            if trade.trade_id not in self._used_trade_ids:
                self._used_trade_ids.add(trade.trade_id)
                return trade
        return None

    def _get_next_conversation_id(self) -> str:
        self._conversation_counter += 1
        return str(self._conversation_counter)

    def generate_all(self, count: int) -> bool:
        """Main pipeline: generate synthetic eComm data."""
        actual_count = min(count, len(self.trades))
        if actual_count < count:
            print(f"  Note: Limited to {actual_count} conversations (one per trade)")

        generated = 0
        for i in range(actual_count):
            trade = self._get_unmapped_trade()
            if not trade:
                print(f"  Stopped at {generated}: No more unmapped trades")
                break

            template = self.generate_conversation_skeleton()
            client_name, client_org, trader_name, trader_org = self.assign_organizations(trade)
            messages = self.inject_trade_values(template, trade, trader_name, client_name)
            execution_idx = self.identify_execution_message(messages)
            messages = self.map_timestamps(messages, trade.trade_time, execution_idx)
            weekday = get_weekday_abbreviation(trade.trade_time)
            app_code, app_type = self.resolve_app_code()
            conversation_id = self._get_next_conversation_id()

            records = self.build_ecomm_records(
                messages, trade,
                client_name, client_org,
                trader_name, trader_org,
                weekday, app_code, app_type,
                conversation_id
            )
            self.ecomm_records.extend(records)
            generated += 1

        print(f"    Generated: {generated} conversations, {len(self.ecomm_records)} total records")
        return True


def generate_ecomm_synth(
    rng: random.Random,
    output_dir: Path,
    conversations_file: str,
    conversation_count: int = 20,
):
    """Generate synthetic Fact_eComm CSV (trade-correlated)."""
    print(f"  Loading conversation templates...")
    templates = load_conversation_templates(conversations_file)

    print(f"  Loading trades from fact_trade.csv...")
    trades = _load_trades_from_csv(output_dir / "fact_trade.csv")
    print(f"    Loaded: {len(trades)} non-RFQ trades with prices")

    print(f"  Loading dimension data...")
    accounts = _load_accounts_from_csv(output_dir / "dim_account.csv")
    actors = _load_actors_from_csv(output_dir / "dim_actor.csv")
    print(f"    Loaded: {len(accounts)} accounts, {len(actors)} actors")

    if not trades:
        print("Error: No trades found. Run trade generation first.")
        return []

    print(f"  Generating {conversation_count} synthetic eComm conversations...")
    seeder = SyntheticECommSeeder(rng, templates)
    seeder.trades = trades
    seeder.accounts = accounts
    seeder.actors = actors

    seeder.generate_all(conversation_count)

    write_csv(seeder.ecomm_records, output_dir / "fact_ecomm_synth.csv")
    print(f"  fact_ecomm_synth.csv: {len(seeder.ecomm_records)} records")

    return seeder.ecomm_records
