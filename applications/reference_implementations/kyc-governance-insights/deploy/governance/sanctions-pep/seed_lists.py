#!/usr/bin/env python3
"""Seed the sanctions + PEP DynamoDB tables from seed_lists.json.

Usage:
    python3 seed_lists.py --prefix kyc-gov [--region us-east-1]

Table names follow the CFN convention: <prefix>-sanctions-list, <prefix>-pep-list.
Run once after the sanctions-pep CloudFormation stack is created.
"""

import argparse
import json
import os

import boto3


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefix", default="kyc-gov")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    parser.add_argument("--file", default=os.path.join(os.path.dirname(__file__), "seed_lists.json"))
    args = parser.parse_args()

    with open(args.file) as f:
        data = json.load(f)

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    sanctions = dynamodb.Table(f"{args.prefix}-sanctions-list")
    pep = dynamodb.Table(f"{args.prefix}-pep-list")

    with sanctions.batch_writer() as batch:
        for item in data["sanctions"]:
            batch.put_item(Item=item)
    with pep.batch_writer() as batch:
        for item in data["pep"]:
            batch.put_item(Item=item)

    print(f"Seeded {len(data['sanctions'])} sanctions + {len(data['pep'])} PEP entries "
          f"into {args.prefix}-sanctions-list / {args.prefix}-pep-list ({args.region})")


if __name__ == "__main__":
    main()
