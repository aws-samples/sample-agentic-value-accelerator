"""
Dataclasses for each table record.

Consolidated from:
- db_seed.py (AccountRecord, ActorRecord, ProductRecord)
- seed_data_trade.py (TradeRecord)
- seed_flagged_trade.py (FlaggedTradeRecord)
- db_seed_facts.py (AlertRecord, ECommRecord)
- seed_ecomm_synth.py (SyntheticECommRecord)
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class AccountRecord:
    """Represents a Dim_Account row."""
    account_id: str
    account_country: str
    account_frb_code: str
    account_mli_number: str
    account_organization: str
    account_name: str
    account_number: str
    account_type: str
    account_sub_type: str


@dataclass
class ActorRecord:
    """Represents a Dim_Actor row."""
    actor_trader_id: str
    actor_account_id: str
    actor_account_name: str
    actor_email_address: str
    actor_trader_name: str
    actor_position: str
    actor_risk_area: str
    actor_standard_id: str
    actor_organization: str
    actor_business_area: str
    actor_business_unit_name: str
    actor_trading_desk: str
    actor_product_type: str
    actor_category: str


@dataclass
class ProductRecord:
    """Represents a Dim_Product row."""
    product_isin: str
    product_bbgid: str
    product_country_of_issue: str
    product_currency_of_issue: str
    product_cusip: str
    product_description_long: str
    product_description_short: str
    product_issue_date: str
    product_maturity_date: str
    product_category: str
    product_type: str
    product_sub_type: str


@dataclass
class TradeRecord:
    """Represents a Fact_Trade row."""
    trade_id: str
    trade_algorithm_flag: str
    trade_book_code: str
    trade_date: datetime
    trade_dealer_count: Optional[int]
    trade_dealer_name: str
    trade_entry_date: datetime
    trade_event_type: str
    trade_isvoicetrade: str
    trade_legal_entity: str
    trade_notional: Optional[int]
    trade_price: Optional[float]
    trade_qty: int
    trade_side_code: str
    trade_side_name: str
    trade_source_code: str
    trade_source_name: str
    trade_standard_id: str
    trade_state: str
    trade_ticket_id: str
    trade_time: datetime
    trade_type_code: str
    trade_type_name: str
    trade_venue: str
    trade_account_id: str
    trade_account_name: str
    trade_trader_id: str
    trade_trader_capacity: str
    trade_trader_name: str
    trade_isin: str
    trade_asset_class_name: str
    trade_product: str


@dataclass
class FlaggedTradeRecord:
    """Represents a Flagged_Trade row linking alerts to trades."""
    trade_alert_id: str
    trade_id: str


@dataclass
class AlertRecord:
    """Represents a Fact_Alert row."""
    alert_id: str
    alert_date: datetime
    alert_isin: str
    alert_summary: str
    alert_time: datetime
    alert_trade_id: str
    alert_account_id: str
    alert_account_name: str
    alert_account_number: str


@dataclass
class ECommRecord:
    """Represents a Fact_eComm row (basic IM/RFQ)."""
    conversation_id: str
    app_code: str
    app_type: str
    date: datetime
    message_body: str
    timestamp: datetime
    weekday: str
    from_organization: str
    from_actor: str
    to_organization: str
    to_actor: str
    event_sequence: int
    action: str
    mic: str
    bid: Optional[float]
    offer: Optional[float]
    price_type: str
    instrument_id: str
    instrument_des: str


@dataclass
class SyntheticECommRecord:
    """Represents a fact_ecomm row (one row per conversation, XML body columns)."""
    conversation_id: str
    app_code: str
    app_type: str
    date: str               # From XML ConversationDate (e.g., "05/02/2025")
    start_timestamp: str    # From XML StartTimestamp (e.g., "13:41:33.858-05:00")
    end_timestamp: str      # From XML EndTimestamp
    timezone: str           # From XML Timezone (e.g., "IANA:America/New_York")
    participants_body: str  # Raw XML string of <Participants> element
    chat_body: str          # Raw XML string of <Chat> element
