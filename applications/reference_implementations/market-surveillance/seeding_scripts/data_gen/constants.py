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

REF_FRB_CODE = [f"FRBcode{i}" for i in range(1, 11)]

REF_IS_VOICE_TRADE_FLAG = ["Y", "N"]

REF_LEGAL_ENTITY_CODE = ["LegalEntity1", "LegalEntity2", "LegalEntity3"]

REF_MLI_NUMBER = ["MLInumber1", "MLInumber2", "MLInumber3"]

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
    BookRecord("A7X9B", "Customer business with hedge funds", "Customer Trading"),
    BookRecord("Q4W8Z", "Customer business with asset managers", "Customer Trading"),
    BookRecord("T6R1P", "Customer business with insurance companies", "Customer Trading"),
    BookRecord("M2N7X", "Customer business with corporate businesses", "Customer Trading"),
    BookRecord("L9K2J", "Outright holdings", "Customer Trading"),
    BookRecord("Z3X73", "Hedging futures with treasuries", "Hedging"),
    BookRecord("R8T4Y", "Hedging IG corporates with treasuries", "Hedging"),
    BookRecord("F1G7H", "Hedging IG corporates with treasuries", "Hedging"),
    BookRecord("D5E8F", "Hedging HY corporates with treasuries", "Hedging"),
    BookRecord("P3Q8R", "Bank treasury trading", "Treasury"),
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
    years_0_2: int
    years_3_5: int
    years_6_10: int
    years_11_20: int
    years_21_30: int


REF_GOVT_BOND_LIQUIDITY = [
    GovtBondLiquidityRecord("USD", 500, 200, 150, 100, 50),
    GovtBondLiquidityRecord("EUR", 300, 145, 112, 80, 35),
    GovtBondLiquidityRecord("GBP", 220, 90, 67, 45, 25),
    GovtBondLiquidityRecord("JPY", 250, 100, 77, 55, 30),
    GovtBondLiquidityRecord("CAD", 200, 80, 62, 45, 20),
    GovtBondLiquidityRecord("NZD", 61, 50, 37, 25, 10),
    GovtBondLiquidityRecord("AUD", 67, 50, 37, 25, 10),
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
    "ref_frb_code": ("ref_frb_code", REF_FRB_CODE),
    "ref_isvoicetrade_flag": ("ref_isvoicetrade_flag", REF_IS_VOICE_TRADE_FLAG),
    "ref_legal_entity_code": ("ref_legal_entity_code", REF_LEGAL_ENTITY_CODE),
    "ref_mli_number": ("ref_mli_number", REF_MLI_NUMBER),
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
    "Vanguard Demo Capital",
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

FRB_CODES = ["FRBcode1", "FRBcode2", "FRBcode3"]
MLI_NUMBERS = ["MLInumber1", "MLInumber2", "MLInumber3"]
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
