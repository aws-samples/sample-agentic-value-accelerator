"""
Consolidated constants for data generation.

All hardcoded reference data and lookup lists extracted from:
- seeding_scripts/seeding_references.py
- seeding_scripts/db_seed.py
- seeding_scripts/seed_data_trade.py
- seeding_scripts/db_seed_facts.py
- seeding_scripts/seed_ecomm_synth.py
"""

from dataclasses import dataclass


# =============================================================================
# REFERENCE TABLE DATA (from seeding_references.py)
# =============================================================================

# Simple single-column reference tables

REF_ACCOUNT_SUB_TYPE = [
    "Back Office",
    "GSE",
    "Hedge Fund",
    "Insurance firm",
    "Internal Trading Desk",
    "Pension fund",
]

REF_ACCOUNT_TYPE = ["Client", "Internal"]

REF_ALERT_SUMMARY = ["Possible market surveillance alert", "Possible Wash Trading"]

REF_ALGORITHM_FLAG = ["True", "False"]

REF_ASSET_CLASS_NAME = ["Debt", "Equity"]

REF_BUSINESS_AREA = ["Business_Area1", "Business_Area2", "Business_Area3"]

REF_BUSINESS_UNIT_NAME = ["BU1", "BUG1"]

REF_CAPACITY_TYPE = ["CapacityType1", "CapacityType2", "CapacityType3"]

REF_COUNTRY_NAME = ["US", "Canada"]

REF_CURRENCY_CODE = ["USD", "CAD"]

REF_DEALER_NAME = ["Bank ABC"]

REF_EVENT_TYPE = ["Execution"]

REF_REG_CODE = [f"RegCode{i}" for i in range(1, 11)]

REF_IS_VOICE_TRADE_FLAG = ["Y", "N"]

REF_LEGAL_ENTITY_CODE = ["LegalEntity1", "LegalEntity2", "LegalEntity3"]

REF_ENTITY_NUMBER = ["EntityNum1", "EntityNum2", "EntityNum3"]

REF_PRODUCT_SUB_TYPE = [
    "Government Bond",
    "Corporate Bond",
    "Agency Security",
]

REF_PRODUCT_TYPE = [
    "Government Bond",
    "Corporate Bond",
    "Agency Security",
]

REF_RISK_AREA_NAME = ["Risk_Area1", "Risk_Area2", "NA"]

REF_ROLE = ["Assistant", "Clerk", "Sales", "Trader"]

REF_TRADE_STATE = ["State1", "State2", "State3"]

REF_TRADING_DESK = ["Trading_Desk1", "Trading_Desk2", "NA"]

REF_VENUE_NAME = ["Venue1", "Venue2", "Venue3"]


# Multi-column reference tables

@dataclass
class BookRecord:
    """REF_Book table record."""
    code: str
    description: str
    book_type: str


REF_BOOK = [
    BookRecord("C3R5D", "Customer business with hedge funds", "Customer Trading"),
    BookRecord("S2V6X", "Customer business with asset managers", "Customer Trading"),
    BookRecord("V4P7N", "Customer business with insurance companies", "Customer Trading"),
    BookRecord("K8M3W", "Customer business with corporate businesses", "Customer Trading"),
    BookRecord("N5K8H", "Outright holdings", "Customer Trading"),
    BookRecord("B9X33", "Hedging futures with treasuries", "Hedging"),
    BookRecord("T4R8U", "Hedging IG corporates with treasuries", "Hedging"),
    BookRecord("H7G3J", "Hedging IG corporates with treasuries", "Hedging"),
    BookRecord("F1E4D", "Hedging HY corporates with treasuries", "Hedging"),
    BookRecord("R9Q4P", "Bank treasury trading", "Treasury"),
    BookRecord("V2K5M", "All Instruments", "Repo"),
]


@dataclass
class EcommAppRecord:
    """REF_eComm_App table record."""
    code: str
    app_type: str


REF_ECOMM_APP = [
    EcommAppRecord("App1", "Email"),
    EcommAppRecord("App2", "Email"),
    EcommAppRecord("App3", "Email"),
    EcommAppRecord("App4", "Instant Messenger"),
    EcommAppRecord("App5", "Instant Messenger"),
    EcommAppRecord("App6", "Instant Messenger"),
    EcommAppRecord("App7", "Instant Messenger"),
    EcommAppRecord("App8", "Phone - desk"),
    EcommAppRecord("App9", "Phone - cellular"),
    EcommAppRecord("ActivityLog", "Activity Log"),
    EcommAppRecord("RFQ1", "RFQ System"),
]


@dataclass
class TradeSideRecord:
    """REF_Trade_Side table record."""
    code: str
    name: str


REF_TRADE_SIDE = [
    TradeSideRecord("B", "Buy"),
    TradeSideRecord("S", "Sell"),
]


@dataclass
class TradeSourceRecord:
    """REF_Trade_Source table record."""
    code: str
    name: str


REF_TRADE_SOURCE = [
    TradeSourceRecord(f"SourceCode{i}", f"SourceName{i}") for i in range(0, 10)
]


@dataclass
class TradeTypeRecord:
    """REF_Trade_Type table record."""
    code: str
    name: str


REF_TRADE_TYPE = [
    TradeTypeRecord(f"TypeCode{i}", f"TypeName{i}") for i in range(0, 10)
]


@dataclass
class GovtBondLiquidityRecord:
    """REF_Government_Bond_Liquidity_Threshold table record."""
    currency: str
    years_0_3: int
    years_4_7: int
    years_8_15: int
    years_16_25: int
    years_26_30: int


REF_GOVT_BOND_LIQUIDITY = [
    GovtBondLiquidityRecord("USD", 450, 180, 120, 75, 40),
    GovtBondLiquidityRecord("EUR", 280, 130, 95, 60, 30),
    GovtBondLiquidityRecord("GBP", 200, 80, 55, 35, 20),
    GovtBondLiquidityRecord("JPY", 230, 90, 65, 40, 25),
    GovtBondLiquidityRecord("CAD", 180, 70, 50, 35, 15),
    GovtBondLiquidityRecord("NZD", 55, 40, 30, 20, 8),
    GovtBondLiquidityRecord("AUD", 60, 45, 30, 20, 8),
]


# =============================================================================
# DERIVED MAPS (computed from reference data)
# =============================================================================

BOOK_CODES = [b.code for b in REF_BOOK]
TRADE_TYPE_MAP = {t.code: t.name for t in REF_TRADE_TYPE}
SOURCE_CODES = [s.code for s in REF_TRADE_SOURCE]
SOURCE_NAME_MAP = {s.code: s.name for s in REF_TRADE_SOURCE}
SIDE_NAME_MAP = {"S": "Sell", "B": "Buy"}
APP_TYPE_MAP = {e.code: e.app_type for e in REF_ECOMM_APP}
APP_IM_CODES = [e.code for e in REF_ECOMM_APP if e.app_type == "Instant Messenger"]
APP_ACTIVITY_CODES = [e.code for e in REF_ECOMM_APP if e.app_type == "Activity Log"]
APP_RFQ_CODES = [e.code for e in REF_ECOMM_APP if e.app_type == "RFQ System"]


# =============================================================================
# ALL REFERENCE TABLES REGISTRY
# Maps table_name -> (column_name_or_None, data_list)
# For simple tables: column_name is the single PK column name
# For multi-column tables: column_name is None (handled separately)
# =============================================================================

SIMPLE_REF_TABLES = {
    "ref_account_sub_type": ("ref_account_sub_type", REF_ACCOUNT_SUB_TYPE),
    "ref_account_type": ("ref_account_type", REF_ACCOUNT_TYPE),
    "ref_alert_summary": ("ref_alert_summary", REF_ALERT_SUMMARY),
    "ref_algorithm_flag": ("ref_algorithm_flag", REF_ALGORITHM_FLAG),
    "ref_asset_class_name": ("ref_asset_class_name", REF_ASSET_CLASS_NAME),
    "ref_business_area": ("ref_business_area", REF_BUSINESS_AREA),
    "ref_business_unit_name": ("ref_business_unit_name", REF_BUSINESS_UNIT_NAME),
    "ref_capacity_type": ("ref_capacity_type", REF_CAPACITY_TYPE),
    "ref_country_name": ("ref_country_name", REF_COUNTRY_NAME),
    "ref_currency_code": ("ref_currency_code", REF_CURRENCY_CODE),
    "ref_dealer_name": ("ref_dealer_name", REF_DEALER_NAME),
    "ref_event_type": ("ref_event_type", REF_EVENT_TYPE),
    "ref_reg_code": ("ref_reg_code", REF_REG_CODE),
    "ref_isvoicetrade_flag": ("ref_isvoicetrade_flag", REF_IS_VOICE_TRADE_FLAG),
    "ref_legal_entity_code": ("ref_legal_entity_code", REF_LEGAL_ENTITY_CODE),
    "ref_entity_number": ("ref_entity_number", REF_ENTITY_NUMBER),
    "ref_product_sub_type": ("ref_product_sub_type", REF_PRODUCT_SUB_TYPE),
    "ref_product_type": ("ref_product_type", REF_PRODUCT_TYPE),
    "ref_risk_area_name": ("ref_risk_area_name", REF_RISK_AREA_NAME),
    "ref_role": ("ref_role", REF_ROLE),
    "ref_trade_state": ("ref_trade_state", REF_TRADE_STATE),
    "ref_trading_desk": ("ref_trading_desk", REF_TRADING_DESK),
    "ref_venue_name": ("ref_venue_name", REF_VENUE_NAME),
}


# =============================================================================
# DIMENSION GENERATION CONSTANTS (from db_seed.py)
# =============================================================================

CLIENT_ACCOUNT_NAMES = [
    "Acme Capital Partners",
    "Globex Asset Management",
    "Pinnacle Investment Group",
    "Atlas Wealth Advisors",
    "Sentinel Demo Capital",
    "Apex Fund Strategies",
    "Meridian Global Holdings",
    "Summit Demo Partners",
    "Zenith Investment Group",
    "Nexus Asset Management",
    "Federal Home Loan Mortgage Agency",
    "Federal National Mortgage Agency",
    "Government National Mortgage Agency",
]

CLIENT_SUB_TYPES = ["Pension fund", "Hedge Fund", "Insurance firm", "GSE"]

INTERNAL_ACCOUNT_NAMES = ["Corporate Desk", "Government Desk"]
INTERNAL_SUB_TYPES = ["Internal Trading Desk", "Back Office"]

REG_CODES = ["RegCode1", "RegCode2", "RegCode3"]
ENTITY_NUMBERS = ["EntityNum1", "EntityNum2", "EntityNum3"]
ACCOUNT_COUNTRIES = ["US", "Canada"]

# Actor generation data
FIRST_NAMES = [
    "James", "Emma", "Michael", "Sophia", "William", "Olivia", "Alexander",
    "Isabella", "Benjamin", "Charlotte", "Daniel", "Amelia", "Matthew", "Mia",
    "Joseph", "Harper", "David", "Evelyn", "Andrew", "Abigail",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
]

RISK_AREAS = ["Risk_Area1", "Risk_Area2", "NA"]
BUSINESS_AREAS = ["Business_Area1", "Business_Area2", "Business_Area3"]
BUSINESS_UNITS = ["BU1", "BUG1"]
TRADING_DESKS = ["Trading_Desk1", "Trading_Desk2", "NA"]

# Product generation data
BOND_TICKERS = [
    "ACME", "GLBX", "PNCL", "APEX", "MDNR", "ZNTH", "NXUS", "XYZ", "ATLS",
    "SMTD", "VNRD", "ZITH", "MRDN", "APXF", "GLXM", "PNLG", "NXAM", "SMTX", "ATLD", "ZNXR",
]

# Actor account_name options per product type
ACTOR_ACCOUNT_NAME_MAP = {
    "Corporate Bond": ["Corporate Desk", "Back Office"],
    "Government Bond": ["Government Desk"],
}

# Actor product types
ACTOR_PRODUCT_TYPES = ["Corporate Bond", "Government Bond"]

# Business area -> actor_account_id suffix
BUSINESS_AREA_SUFFIX_MAP = {
    "Business_Area1": "1",
    "Business_Area2": "2",
    "Business_Area3": "1",
}

# Internal organization name
INTERNAL_ORGANIZATION = "ABC Bank"


# =============================================================================
# TRADE GENERATION CONSTANTS (from seed_data_trade.py)
# =============================================================================

ALGORITHM_FLAGS = ["False", "True"]
EVENT_TYPES = ["Execution"]
INVOICE_TRADE_FLAGS = ["Y", "N"]
LEGAL_ENTITIES = ["LegalEntity1", "LegalEntity2", "LegalEntity3"]
SIDE_CODES = ["S", "B"]
TRADE_STATES = ["State1", "State2", "State3"]
TRADE_VENUES = ["Venue1", "Venue2", "Venue3"]
TRADER_CAPACITIES = ["CapacityType1", "CapacityType2", "CapacityType3"]

MIN_PRICE = 95.0
MAX_PRICE = 110.0

QUANTITIES = [1_000_000, 2_000_000, 5_000_000, 10_000_000, 15_000_000,
              20_000_000, 25_000_000, 30_000_000, 40_000_000, 50_000_000]


# =============================================================================
# ECOMM GENERATION CONSTANTS (from db_seed_facts.py)
# =============================================================================

INSTANT_MESSAGES = [
    "Hi there!",
    "Thanks",
    "Done",
    "Can we proceed with the trade?",
    "Looking good",
    "Confirmed",
    "Let me check",
    "Sounds good",
    "Perfect",
    "Got it",
    "I'll get back to you shortly",
    "Please hold",
    "Checking availability",
    "Ready when you are",
    "All set",
]

RFQ_ACTIONS = ["RFQNew", "RFQQuoteGiven", "RFQClientAccepted", "RFQTraderAccepted"]

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]


# =============================================================================
# SYNTHETIC ECOMM CONSTANTS (from seed_ecomm_synth.py)
# =============================================================================

WEEKDAY_ABBREV = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri"}

EXECUTION_KEYWORDS = ["done", "execute", "executed", "confirmed", "agreed", "deal"]

CLIENT_NAMES = [
    "John", "Sarah", "Mike", "Lisa", "David", "Emily", "Chris", "Amanda",
    "Robert", "Jennifer", "Tom", "Michelle", "James", "Rachel", "Mark", "Laura",
]
