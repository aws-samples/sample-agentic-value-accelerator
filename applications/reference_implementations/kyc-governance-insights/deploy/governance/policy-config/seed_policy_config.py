#!/usr/bin/env python3
"""Seed the kyc-gov policy-config DynamoDB table with the baseline configuration.

Reads ./seed_policy_config.json and writes each tenant row. Idempotent (PutItem
overwrites by tenant_id). No thresholds are hardcoded here — the values live in
the JSON seed data, which initialises the config store the policy-cascade service
reads at runtime.

Usage:
  python3 seed_policy_config.py --prefix kyc-gov --region us-east-1
"""
import argparse
import datetime
import json
import os
from decimal import Decimal

import boto3


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="kyc-gov")
    ap.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    ap.add_argument("--table", default=None,
                    help="Override table name (default: <prefix>-policy-config)")
    args = ap.parse_args()

    table_name = args.table or f"{args.prefix}-policy-config"
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "seed_policy_config.json")) as fh:
        seed = json.load(fh)

    ddb = boto3.resource("dynamodb", region_name=args.region)
    table = ddb.Table(table_name)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for tenant in seed["tenants"]:
        item = {
            "tenant_id": tenant["tenant_id"],
            "risk_escalate_threshold": int(tenant["risk_escalate_threshold"]),
            "risk_block_threshold": int(tenant["risk_block_threshold"]),
            "prohibited_jurisdictions": set(tenant["prohibited_jurisdictions"]),
            # Sanctions/PEP fuzzy-match thresholds — read at request time by the
            # sanctions-pep service (Decimal: DynamoDB rejects float).
            "sanctions_threshold": Decimal(str(tenant["sanctions_threshold"])),
            "pep_threshold": Decimal(str(tenant["pep_threshold"])),
            "version": int(tenant.get("version", 1)),
            "updated_by": tenant.get("updated_by", "seed"),
            "updated_at": now,
        }
        table.put_item(Item=item)
        print(f"seeded tenant_id={item['tenant_id']} "
              f"escalate={item['risk_escalate_threshold']} "
              f"block={item['risk_block_threshold']} "
              f"prohibited={sorted(item['prohibited_jurisdictions'])} "
              f"sanctions={item['sanctions_threshold']} pep={item['pep_threshold']}")

    print(f"done: seeded {len(seed['tenants'])} tenant(s) into {table_name}")


if __name__ == "__main__":
    main()
