#!/usr/bin/env python3
"""Seed the kyc-agent-evaluators table from evaluator-definitions.json.

The evaluations stack creates the tables; this loads the evaluator definitions
so the Evaluations dashboard shows real rows. Idempotent (put_item overwrites).

Usage: python3 seed_evaluations.py [--region us-east-1]
"""
import argparse
import json
import os
from decimal import Decimal

import boto3


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    ap.add_argument("--file", default=os.path.join(os.path.dirname(__file__), "evaluations", "evaluator-definitions.json"))
    ap.add_argument("--table", default="kyc-agent-evaluators")
    args = ap.parse_args()

    with open(args.file) as f:
        # DynamoDB rejects Python floats — parse all numbers as Decimal.
        data = json.load(f, parse_float=Decimal)

    evaluators = data.get("evaluationConfig", {}).get("evaluators", [])
    if not evaluators:
        print("No evaluators found in definitions file.")
        return

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    n = 0
    with table.batch_writer() as batch:
        for ev in evaluators:
            item = dict(ev)
            # Table HASH key is evaluator_id; map from the definition's `id`.
            item["evaluator_id"] = ev.get("id") or ev.get("evaluator_id")
            if not item["evaluator_id"]:
                continue
            batch.put_item(Item=item)
            n += 1
    print(f"Seeded {n} evaluators into {args.table} ({args.region})")


if __name__ == "__main__":
    main()
