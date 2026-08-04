#!/usr/bin/env python3
"""Seed the sample account data into the S3 data bucket, with recent timestamps.

The bundled fixtures in data/accounts/*/profile.json use fixed timestamps so the
repo is deterministic. Those dates drift into the past over time, which makes the
demo look stale ("five movements in 48h" but dated weeks ago).

This script shifts every account's timestamps forward so the account's *latest*
transaction lands a few hours before now, then uploads the result to S3. The shift
is a single constant delta per account, so all the carefully designed relative
spacing is preserved exactly (e.g. A705's 48-hour smurfing window, A305's 32-minute
velocity burst) — only the absolute window moves to "recent".

Usage:
    python scripts/seed_data.py --bucket <data-bucket> [--region us-east-1] [--prefix samples/payments_fraud]

The bucket name is the `data_bucket` Terraform output.
"""

import argparse
import datetime as dt
import glob
import json
import os

import boto3

# The most recent transaction in each account lands this many hours before "now",
# so the data always reads as fresh/recent at deploy time.
LATEST_OFFSET_HOURS = 3

ACCOUNTS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "accounts")


def _parse(ts: str) -> dt.datetime:
    return dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _fmt(d: dt.datetime) -> str:
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def shift_profile(profile: dict, now: dt.datetime) -> dict:
    """Shift all transaction timestamps so the latest lands LATEST_OFFSET_HOURS ago."""
    txns = profile.get("transactions", [])
    if not txns:
        return profile
    latest = max(_parse(t["timestamp"]) for t in txns)
    target_latest = now - dt.timedelta(hours=LATEST_OFFSET_HOURS)
    delta = target_latest - latest
    for t in txns:
        t["timestamp"] = _fmt(_parse(t["timestamp"]) + delta)
    return profile


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed sample data into S3 with recent timestamps.")
    ap.add_argument("--bucket", required=True, help="S3 data bucket (Terraform output: data_bucket)")
    ap.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
    ap.add_argument("--prefix", default="samples/payments_fraud", help="S3 key prefix")
    ap.add_argument("--dry-run", action="store_true", help="Print shifted dates without uploading")
    args = ap.parse_args()

    now = dt.datetime.now(dt.timezone.utc)
    s3 = None if args.dry_run else boto3.client("s3", region_name=args.region)

    for pf in sorted(glob.glob(os.path.join(ACCOUNTS_DIR, "*", "profile.json"))):
        profile = json.load(open(pf))
        acct = profile["account_id"]
        shift_profile(profile, now)
        body = json.dumps(profile, indent=2)
        key = f"{args.prefix}/{acct}/profile.json"
        if args.dry_run:
            ts = [t["timestamp"] for t in profile.get("transactions", [])]
            span = f"{min(ts)} -> {max(ts)}" if ts else "(no txns)"
            print(f"  {acct}: {span}")
        else:
            s3.put_object(Bucket=args.bucket, Key=key, Body=body.encode("utf-8"),
                          ContentType="application/json")
            print(f"  uploaded s3://{args.bucket}/{key}")

    print("done" + (" (dry run)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
