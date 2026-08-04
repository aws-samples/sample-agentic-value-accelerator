#!/usr/bin/env python3
"""Fetch real fixed-income ETF prices to ground the demo's seed data.

DEV-TIME ONLY. This script is NOT shipped to AWS and is NOT imported by the agent
container, the lambdas, or the CDK app. Run it once locally to (re)generate the
prices used to seed fund positions in deploy.sh and to build the Code Interpreter
analytics prompt. The numbers it prints are realistic because they come from the
market, not from the model's imagination.

Source: Yahoo Finance public chart API (no key, no SDK). The `fetch_yfinance`
approach is borrowed/adapted from quant-weather/scripts/data/download_market_data.py
(lines 85-107), trimmed to a stdlib-only HTTP call so there is nothing to install.

A SNAPSHOT pulled during planning is embedded below as an offline fallback, so a
deploy never depends on the network being reachable.

Usage:
    python scripts/seed_data/fetch_bond_etf_prices.py            # live, all symbols
    python scripts/seed_data/fetch_bond_etf_prices.py --offline  # use embedded snapshot
    python scripts/seed_data/fetch_bond_etf_prices.py --symbols AGG,TLT
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = REPO_ROOT / "configs" / "market_symbols.json"

# Snapshot captured live from Yahoo Finance during planning (~2026-06-29). Used as
# the offline fallback and as the committed source of truth for deploy.sh seeds.
SNAPSHOT = {
    "as_of": "2026-06-29",
    "source": "Yahoo Finance public chart API",
    "latest_price": {
        "AGG": 99.32, "SHY": 82.14, "IEF": 94.95, "TLT": 87.37, "LQD": 109.58,
        "HYG": 79.93, "TIP": 109.83, "MUB": 107.65, "EMB": 96.67,
    },
    "long_name": {
        "AGG": "iShares Core U.S. Aggregate Bond ETF",
        "SHY": "iShares 1-3 Year Treasury Bond ETF",
        "IEF": "iShares 7-10 Year Treasury Bond ETF",
        "TLT": "iShares 20+ Year Treasury Bond ETF",
        "LQD": "iShares iBoxx $ Investment Grade Corporate Bond ETF",
        "HYG": "iShares iBoxx $ High Yield Corporate Bond ETF",
        "TIP": "iShares TIPS Bond ETF",
        "MUB": "iShares National Muni Bond ETF",
        "EMB": "iShares J.P. Morgan USD Emerging Markets Bond ETF",
    },
    # ~13 monthly closes (chronological, 2025-07 .. 2026-06) for the analytics prompt.
    "monthly_close": {
        "AGG": [94.81, 95.93, 97.01, 97.61, 98.20, 97.61, 98.50, 99.75,
                97.97, 98.11, 98.40, 99.01, 99.35],
        "TLT": [86.92, 86.60, 89.37, 90.29, 90.21, 87.16, 87.13, 90.82,
                86.69, 85.62, 85.76, 87.36, 87.47],
    },
    # Market context.
    "ust_10y_yield_pct": 4.38,
}

# Yahoo Finance public chart endpoint (same host/shape quant-weather's yfinance uses).
_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"


def load_symbols() -> list[str]:
    cfg = json.loads(CONFIG_PATH.read_text())
    return list(cfg["symbols"])


def _assert_https(url: str) -> str:
    """Reject any non-https URL before it reaches urlopen (which would otherwise honor
    file://, ftp://, and custom schemes — the vector bandit B310 flags). This URL is built
    from the hardcoded https Yahoo Finance endpoint, so this enforces that invariant rather
    than asserting it in a comment. Returns the URL unchanged; raises ValueError otherwise."""
    if not isinstance(url, str) or not url.lower().startswith("https://"):
        raise ValueError(f"refusing non-https URL for outbound request: {url!r}")
    return url


def fetch_yfinance(symbol: str) -> dict | None:
    """Adapted from quant-weather download_market_data.fetch_yfinance — stdlib only.
    Returns {symbol, price, previous_close, currency, long_name} or None."""
    url = _CHART_URL.format(symbol=symbol)
    req = urllib.request.Request(_assert_https(url), headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310  # nosemgrep  (dynamic-urllib: scheme pinned https by _assert_https)
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"  {symbol}: fetch failed ({type(e).__name__}: {e})", file=sys.stderr)
        return None
    try:
        meta = data["chart"]["result"][0]["meta"]
    except (KeyError, IndexError, TypeError):
        return None
    return {
        "symbol": symbol,
        "price": meta.get("regularMarketPrice"),
        "previous_close": meta.get("chartPreviousClose"),
        "currency": meta.get("currency", "USD"),
        "long_name": meta.get("longName", meta.get("shortName", symbol)),
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--symbols", default=None, help="Comma-separated subset; default: all in configs/market_symbols.json")
    p.add_argument("--offline", action="store_true", help="Skip the network; print the embedded snapshot")
    args = p.parse_args()

    symbols = (
        [s.strip().upper() for s in args.symbols.split(",")]
        if args.symbols else load_symbols()
    )

    if args.offline:
        print("Offline snapshot (as_of {as_of}, source {source}):".format(**SNAPSHOT))
        for sym in symbols:
            price = SNAPSHOT["latest_price"].get(sym, "?")
            name = SNAPSHOT["long_name"].get(sym, sym)
            print(f"  {sym:4s} {price:>8}  {name}")
        return 0

    print(f"Fetching {len(symbols)} symbols from Yahoo Finance ...")
    rows = []
    for sym in symbols:
        row = fetch_yfinance(sym) or {
            "symbol": sym, "price": SNAPSHOT["latest_price"].get(sym),
            "previous_close": None, "currency": "USD",
            "long_name": SNAPSHOT["long_name"].get(sym, sym),
        }
        rows.append(row)
        src = "live" if row["previous_close"] is not None else "snapshot-fallback"
        print(f"  {sym:4s} {str(row['price']):>8}  {row['long_name']}  [{src}]")

    print("\nUse these to ground the deploy.sh position seeds and the Code Interpreter prompt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
