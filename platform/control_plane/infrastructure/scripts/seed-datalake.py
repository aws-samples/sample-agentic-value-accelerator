"""Glue Job: Seed FSI Iceberg Data Lake.

Generates realistic trading and risk data and writes to Iceberg tables via Spark.
"""

import sys
import random
import uuid
from datetime import date, datetime, timedelta

from awsglue.utils import getResolvedOptions
from pyspark.sql import SparkSession
from pyspark.sql.types import *
from pyspark.sql import Row

args = getResolvedOptions(sys.argv, ["JOB_NAME", "datalake_bucket"])
bucket = args["datalake_bucket"]

spark = SparkSession.builder.getOrCreate()

random.seed(42)

# --- Constants ---

SYMBOLS = ["AAPL", "MSFT", "AMZN", "GOOGL", "JPM", "GS", "MS", "BAC", "C", "WFC",
           "BRK.B", "V", "MA", "NVDA", "META", "TSLA", "UNH", "JNJ", "PG", "XOM"]

SECTORS = {"AAPL": "Technology", "MSFT": "Technology", "AMZN": "Consumer Discretionary",
           "GOOGL": "Technology", "JPM": "Financials", "GS": "Financials",
           "MS": "Financials", "BAC": "Financials", "C": "Financials", "WFC": "Financials",
           "BRK.B": "Financials", "V": "Financials", "MA": "Financials",
           "NVDA": "Technology", "META": "Technology", "TSLA": "Consumer Discretionary",
           "UNH": "Healthcare", "JNJ": "Healthcare", "PG": "Consumer Staples", "XOM": "Energy"}

BASE_PRICES = {"AAPL": 195, "MSFT": 430, "AMZN": 185, "GOOGL": 175, "JPM": 205,
               "GS": 470, "MS": 95, "BAC": 38, "C": 62, "WFC": 58,
               "BRK.B": 415, "V": 280, "MA": 465, "NVDA": 950, "META": 510,
               "TSLA": 180, "UNH": 540, "JNJ": 155, "PG": 165, "XOM": 115}

DESKS = ["Equities", "Fixed Income", "Derivatives", "Quant", "Prime Brokerage"]
COUNTERPARTIES = ["Citadel", "Bridgewater", "BlackRock", "Vanguard", "State Street",
                  "Fidelity", "PIMCO", "Two Sigma", "DE Shaw", "Renaissance"]
TRADERS = [f"TR-{i:03d}" for i in range(1, 21)]
ALGOS = ["TWAP", "VWAP", "POV", "IS", "ARRIVAL", None, None, None]
CURRENCIES = ["USD", "USD", "USD", "EUR", "GBP"]
REGIONS_LIST = ["North America", "North America", "Europe", "Asia Pacific", "Latin America"]
RATINGS = ["AAA", "AA+", "AA", "A+", "A", "BBB+", "BBB", "BB+", "BB"]
ALERT_TYPES = ["Structuring", "Velocity", "Large Transaction", "Unusual Pattern",
               "Sanctions Match", "PEP Match", "Dormant Account", "Round Tripping"]
ALERT_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
ALERT_STATUSES = ["OPEN", "OPEN", "INVESTIGATING", "ESCALATED", "CLOSED"]
ALERT_RULES = ["AML-001", "AML-002", "AML-003", "FRD-001", "FRD-002", "SAR-001", "KYC-001"]
ANALYSTS = [f"analyst-{i:02d}" for i in range(1, 6)]
TXN_TYPES = ["WIRE_OUT", "WIRE_IN", "ACH_CREDIT", "ACH_DEBIT", "CHECK_DEPOSIT",
             "ATM_WITHDRAWAL", "POS_PURCHASE", "INTERNAL_TRANSFER"]
MERCHANTS = ["Amazon", "Walmart", "Target", "Shell", "Costco", "Whole Foods",
             "Delta Airlines", "Marriott", "Apple Store", "Best Buy"]
COUNTRIES = ["US", "US", "US", "US", "GB", "DE", "SG", "HK", "CH", "KY"]
CHANNELS = ["ONLINE", "MOBILE", "BRANCH", "ATM", "WIRE"]
CUSTOMERS = [f"CUST-{i:05d}" for i in range(1, 201)]
ACCOUNTS = [f"ACCT-{i:08d}" for i in range(1, 301)]
DESCRIPTIONS = [
    "Multiple transactions just below reporting threshold",
    "Rapid movement of funds across accounts",
    "Transaction to high-risk jurisdiction",
    "Unusual activity for customer profile",
    "Potential layering pattern detected",
    "Large cash deposit followed by immediate wire",
]


def rand_date(start, end):
    return start + timedelta(days=random.randint(0, (end - start).days))


def rand_ts(start, end):
    d = rand_date(start, end)
    return datetime(d.year, d.month, d.day, random.randint(8, 17), random.randint(0, 59), random.randint(0, 59))


# --- Generators ---

def gen_trades(n=1500):
    start, end = date(2026, 1, 1), date(2026, 5, 15)
    rows = []
    for i in range(n):
        sym = random.choice(SYMBOLS)
        price = round(BASE_PRICES[sym] * random.uniform(0.9, 1.1), 2)
        qty = random.choice([100, 200, 500, 1000, 2000, 5000])
        td = rand_date(start, end)
        rows.append(Row(
            trade_id=f"TRD-{td.strftime('%Y%m%d')}-{i:06d}",
            trade_date=td, settlement_date=td + timedelta(days=2),
            symbol=sym, asset_class=random.choice(["Equity", "Fixed Income", "Derivatives"]),
            side=random.choice(["BUY", "SELL"]), quantity=qty, price=price,
            notional=round(price * qty, 2), currency=random.choice(CURRENCIES),
            counterparty=random.choice(COUNTERPARTIES), trader_id=random.choice(TRADERS),
            desk=random.choice(DESKS),
            status=random.choices(["SETTLED", "PENDING", "FAILED"], weights=[85, 12, 3])[0],
        ))
    return rows


def gen_orders(n=2000):
    start, end = date(2026, 1, 1), date(2026, 5, 15)
    rows = []
    for i in range(n):
        sym = random.choice(SYMBOLS)
        price = BASE_PRICES[sym] * random.uniform(0.9, 1.1)
        qty = random.choice([100, 200, 500, 1000, 2000])
        otype = random.choice(["MARKET", "LIMIT", "LIMIT", "STOP"])
        status = random.choices(["FILLED", "PARTIALLY_FILLED", "CANCELLED", "PENDING"], weights=[60, 15, 15, 10])[0]
        filled = qty if status == "FILLED" else (int(qty * random.uniform(0.2, 0.8)) if status == "PARTIALLY_FILLED" else 0)
        rows.append(Row(
            order_id=f"ORD-{i:08d}", timestamp=rand_ts(start, end),
            symbol=sym, side=random.choice(["BUY", "SELL"]), order_type=otype,
            quantity=qty,
            limit_price=round(price * random.uniform(0.99, 1.01), 2) if otype != "MARKET" else None,
            filled_quantity=filled,
            avg_fill_price=round(price * random.uniform(0.998, 1.002), 2) if filled > 0 else None,
            status=status, trader_id=random.choice(TRADERS), desk=random.choice(DESKS),
            algo=random.choice(ALGOS),
        ))
    return rows


def gen_market_data(n_days=90):
    start = date(2026, 2, 14)
    rows = []
    for d in range(n_days):
        cd = start + timedelta(days=d)
        if cd.weekday() >= 5:
            continue
        for sym in SYMBOLS:
            base = BASE_PRICES[sym] * (1 + random.uniform(-0.02, 0.02) * d / 90)
            o = round(base * random.uniform(0.99, 1.01), 2)
            c = round(base * random.uniform(0.99, 1.01), 2)
            h = round(max(o, c) * random.uniform(1.0, 1.02), 2)
            l = round(min(o, c) * random.uniform(0.98, 1.0), 2)
            vol = random.randint(5_000_000, 80_000_000)
            rows.append(Row(
                date=cd, symbol=sym, open=o, high=h, low=l, close=c,
                volume=vol, vwap=round((h + l + c) / 3, 2),
                market_cap=round(c * random.randint(1_000_000_000, 50_000_000_000) / 100, 0),
                sector=SECTORS[sym],
            ))
    return rows


def gen_exposures(n=500):
    start, end = date(2026, 1, 1), date(2026, 5, 15)
    rows = []
    for _ in range(n):
        limit = random.choice([10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000])
        gross = round(limit * random.uniform(0.3, 0.95), 2)
        rows.append(Row(
            snapshot_date=rand_date(start, end), counterparty=random.choice(COUNTERPARTIES),
            sector=random.choice(list(set(SECTORS.values()))),
            asset_class=random.choice(["Equity", "Fixed Income", "Derivatives", "FX"]),
            gross_exposure=gross, net_exposure=round(gross * random.uniform(0.4, 0.9), 2),
            limit_amount=float(limit), utilization_pct=round(gross / limit * 100, 1),
            rating=random.choice(RATINGS), region=random.choice(REGIONS_LIST),
        ))
    return rows


def gen_alerts(n=800):
    start, end = date(2026, 1, 1), date(2026, 5, 15)
    rows = []
    for i in range(n):
        rows.append(Row(
            alert_id=f"ALT-{i:06d}", created_at=rand_ts(start, end),
            alert_type=random.choice(ALERT_TYPES),
            severity=random.choices(ALERT_SEVERITIES, weights=[5, 20, 45, 30])[0],
            status=random.choice(ALERT_STATUSES), customer_id=random.choice(CUSTOMERS),
            account_id=random.choice(ACCOUNTS), amount=round(random.uniform(5000, 500000), 2),
            rule_name=random.choice(ALERT_RULES), description=random.choice(DESCRIPTIONS),
            assigned_to=random.choice(ANALYSTS),
        ))
    return rows


def gen_transactions(n=3000):
    start, end = date(2026, 1, 1), date(2026, 5, 15)
    rows = []
    for _ in range(n):
        is_sus = random.random() < 0.05
        amt = round(random.uniform(9000, 9999), 2) if is_sus else round(min(random.lognormvariate(6, 2), 999999.99), 2)
        rows.append(Row(
            transaction_id=f"TXN-{uuid.uuid4().hex[:12].upper()}",
            timestamp=rand_ts(start, end), customer_id=random.choice(CUSTOMERS),
            account_id=random.choice(ACCOUNTS), transaction_type=random.choice(TXN_TYPES),
            amount=amt, currency=random.choices(["USD", "EUR", "GBP", "CHF"], weights=[70, 15, 10, 5])[0],
            merchant=random.choice(MERCHANTS),
            country=random.choice(["KY", "CH", "SG", "HK"]) if is_sus else random.choice(COUNTRIES),
            channel=random.choice(CHANNELS),
            risk_score=round(random.uniform(0.7, 1.0), 3) if is_sus else round(random.uniform(0.0, 0.4), 3),
            is_flagged=is_sus,
        ))
    return rows


# --- Write to Iceberg ---

def write_iceberg(table_name, rows):
    print(f"Writing {len(rows)} rows to glue_catalog.{table_name}")
    df = spark.createDataFrame(rows)
    df.writeTo(f"glue_catalog.{table_name}").append()
    print(f"  ✓ {table_name} done")


print("=== Seeding FSI Iceberg Data Lake ===\n")

print("[fsi_trading]")
write_iceberg("fsi_trading.trades", gen_trades())
write_iceberg("fsi_trading.orders", gen_orders())
write_iceberg("fsi_trading.market_data", gen_market_data())

print("\n[fsi_risk]")
write_iceberg("fsi_risk.exposures", gen_exposures())
write_iceberg("fsi_risk.alerts", gen_alerts())
write_iceberg("fsi_risk.transactions", gen_transactions())

print("\n=== Done! Data lake seeded successfully. ===")
spark.stop()
