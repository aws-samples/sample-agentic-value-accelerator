#!/usr/bin/env python3
"""Phase 3 seed — narrative-locked governance fixture for the KYC console.

Populates the "real infra" read path so the UI fetches pinned Basic-Mode values
from DynamoDB instead of computing them client-side:

  * kyc-evaluation-results  <- fixtures/evaluations-pinned.json
        Pinned Acme (APPROVE / grounding 0.98 / Cedar ALLOW) and Omega
        (REJECT / grounding 0.0 / Cedar DENY / sanctions) evaluation records,
        surfaced by the registry proxy's `GET /evaluations`.

  * kyc-metrics-history     <- generated here (30 days, deterministic)
        Synthetic-but-plausible daily governance metrics for the trend charts.
        Created if the table is absent. There is no read route for this table
        yet (see the Phase 3 design note follow-ups) — seeding it now keeps the
        fixture portable and ready.

Design constraints honoured:
  * Idempotent — every write is a put_item, so re-running overwrites with the
    same values. Run this to reset a demo account to known-good state.
  * Portable   — table names + region come from args/env only. NO ARNs, no
    account IDs. Works in any account that has the console-services stack.

Usage:
  python3 seed_phase3.py [--region us-east-1]
                         [--evaluations-table kyc-evaluation-results]
                         [--metrics-table kyc-metrics-history]
                         [--fixture fixtures/evaluations-pinned.json]
                         [--skip-metrics]
"""
import argparse
import json
import math
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FIXTURE = os.path.join(HERE, "fixtures", "evaluations-pinned.json")


# ----------------------------------------------------------------------------
# kyc-evaluation-results  (pinned evaluation records)
# ----------------------------------------------------------------------------
def seed_evaluations(dynamodb, table_name, fixture_path):
    with open(fixture_path) as f:
        # DynamoDB rejects Python floats — parse numbers as Decimal.
        data = json.load(f, parse_float=Decimal)

    tenant_id = data.get("tenant_id", "fsi-demo")
    records = data.get("records", [])
    if not records:
        print("No records in fixture; nothing to seed.")
        return

    table = dynamodb.Table(table_name)
    n = 0
    with table.batch_writer() as batch:
        for rec in records:
            item = dict(rec)
            item.pop("_comment", None)
            # HASH evaluator_id + RANGE timestamp are required keys.
            if not item.get("evaluator_id") or not item.get("timestamp"):
                print(f"   (skipped record without keys: {item.get('evaluation_id')})")
                continue
            item.setdefault("tenant_id", tenant_id)
            batch.put_item(Item=item)
            n += 1
    print(f"Seeded {n} pinned evaluation records into {table_name}")


# ----------------------------------------------------------------------------
# kyc-metrics-history  (30 days of deterministic synthetic metrics)
# ----------------------------------------------------------------------------
def _mulberry32(seed):
    """Deterministic PRNG — mirrors the UI's governanceMetricsData.ts generator
    so the seeded history has the same character (seed 42, gentle improvement,
    a drift bump around days 18-22)."""
    state = seed & 0xFFFFFFFF

    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rand


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _gauss(rand, mean, sd):
    u1 = rand() or 0.001
    u2 = rand()
    z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
    return mean + z * sd


def generate_metrics_history(days=30):
    rand = _mulberry32(42)
    start = datetime(2026, 5, 26, tzinfo=timezone.utc)
    out = []
    for i in range(days):
        date = start + timedelta(days=i)
        is_weekend = date.weekday() >= 5

        drift = 0.0
        if 18 <= i <= 22:
            drift = math.sin((i - 18) / 4 * math.pi) * 0.06
        improvement = i * 0.0003
        volume_base = 220 if is_weekend else 850
        volume = round(volume_base * (0.9 + rand() * 0.2))

        fpr = _clamp(0.78 - improvement + _gauss(rand, 0, 0.015) * (1.5 if is_weekend else 1) + drift * 0.5, 0.60, 0.95)
        escalation = _clamp(0.22 - improvement * 0.5 + _gauss(rand, 0, 0.02) + drift * 1.2, 0.10, 0.55)
        t2d = _clamp(108 - improvement * 200 + _gauss(rand, 0, 15) + drift * 300, 45, 600)
        override = _clamp(0.04 - improvement * 0.3 + _gauss(rand, 0, 0.008) + drift * 1.5, 0.01, 0.25)
        stp = _clamp(0.68 + improvement * 0.5 + _gauss(rand, 0, 0.02) - drift * 1.5, 0.30, 0.85)
        agreement = _clamp(0.94 + improvement * 0.2 + _gauss(rand, 0, 0.012) - drift * 1.8, 0.70, 0.99)
        policy = _clamp(0.042 + _gauss(rand, 0, 0.005) + drift * 0.8, 0.01, 0.20)
        sar_conversion = _clamp(0.11 + _gauss(rand, 0, 0.015) - drift * 0.3, 0.02, 0.30)
        eval_acc = _clamp(0.94 + improvement - drift * 1.0 + _gauss(rand, 0, 0.008), 0.75, 0.98)

        def d(x, p):
            return Decimal(str(round(x, p)))

        out.append({
            "metric_series": "governance-daily",
            "date": date.strftime("%Y-%m-%d"),
            "day_index": i,
            "volume": volume,
            "false_positive_rate": d(fpr, 4),
            "escalation_rate": d(escalation, 4),
            "time_to_decision_median_s": d(t2d, 1),
            "override_rate": d(override, 4),
            "stp_rate": d(stp, 4),
            "sar_conversion_rate": d(sar_conversion, 4),
            "agent_agreement_rate": d(agreement, 4),
            "policy_trigger_rate": d(policy, 4),
            "eval_accuracy": d(eval_acc, 4),
        })
    return out


def ensure_metrics_table(dynamodb, client, table_name):
    """Create kyc-metrics-history (HASH metric_series, RANGE date) if absent."""
    try:
        client.describe_table(TableName=table_name)
        return
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
    print(f"Creating table {table_name} ...")
    client.create_table(
        TableName=table_name,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "metric_series", "AttributeType": "S"},
            {"AttributeName": "date", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "metric_series", "KeyType": "HASH"},
            {"AttributeName": "date", "KeyType": "RANGE"},
        ],
    )
    dynamodb.Table(table_name).wait_until_exists()
    print(f"   {table_name} is active.")


def seed_metrics(dynamodb, client, table_name):
    ensure_metrics_table(dynamodb, client, table_name)
    rows = generate_metrics_history()
    table = dynamodb.Table(table_name)
    with table.batch_writer() as batch:
        for row in rows:
            batch.put_item(Item=row)
    print(f"Seeded {len(rows)} daily metric points into {table_name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    ap.add_argument("--evaluations-table", default="kyc-evaluation-results")
    ap.add_argument("--metrics-table", default="kyc-metrics-history")
    ap.add_argument("--fixture", default=DEFAULT_FIXTURE)
    ap.add_argument("--skip-metrics", action="store_true")
    args = ap.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    client = boto3.client("dynamodb", region_name=args.region)

    print(f"== Phase 3 seed ({args.region}) ==")
    seed_evaluations(dynamodb, args.evaluations_table, args.fixture)
    if not args.skip_metrics:
        seed_metrics(dynamodb, client, args.metrics_table)
    print("Done.")


if __name__ == "__main__":
    main()
