#!/usr/bin/env python3
"""
Attach the AVA FSI SSO edge auth CloudFront Function to Case Management's
existing CloudFront distribution.

Case Management builds its distribution imperatively in deploy.sh via
aws cloudfront create-distribution — creation happens once, and re-runs
find the existing distribution and leave it alone. That means we can't
add the CF Function by editing the create-distribution JSON; we have to
attach it after-the-fact via UpdateDistribution.

This script is idempotent:
  1. Reads AVA_FSI_APP_SIGNING_SECRET + AVA_UI_LOGIN_URL from env.
     No-op if either is empty (opt-in).
  2. Creates or updates the CF Function ${project}-jwt-${region_suffix}.
  3. Publishes it, then mutates the distribution's DefaultCacheBehavior:
       - FunctionAssociations = [{viewer-request, <fn arn>}]
       - AllowedMethods = includes OPTIONS/PUT/POST/PATCH/DELETE so bootstrap
         + normal requests pass through unchanged.
       - ForwardedValues.Cookies = "all" so ava_session reaches the function.

Usage:
    python3 attach_cf_auth.py <cf_dist_id> <project_name>

Expected env:
    AWS_REGION or AWS_DEFAULT_REGION
    AVA_FSI_APP_SIGNING_SECRET  (empty disables auth — script exits 0)
    AVA_UI_LOGIN_URL            (empty is fine; users get 302 to '/')
"""
import copy
import os
import sys
from pathlib import Path

import boto3

FUNCTION_JS_PATH = Path(__file__).parent / "jwt_auth_function.js"


def main(distribution_id: str, project_name: str) -> int:
    signing_secret = os.environ.get("AVA_FSI_APP_SIGNING_SECRET", "")
    login_url = os.environ.get("AVA_UI_LOGIN_URL", "")

    if not signing_secret:
        print("AVA_FSI_APP_SIGNING_SECRET is empty — skipping SSO edge auth attach")
        return 0

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
    region_suffix = region.replace("-", "")
    fn_name = f"{project_name}-jwt-{region_suffix}"[:64]  # CF Function names are max 64 chars

    if not FUNCTION_JS_PATH.exists():
        print(f"ERROR: {FUNCTION_JS_PATH} not found", file=sys.stderr)
        return 1

    fn_source = FUNCTION_JS_PATH.read_text() \
        .replace("__SIGNING_SECRET__", signing_secret) \
        .replace("__LOGIN_URL__", login_url)

    cf = boto3.client("cloudfront")

    # ── 1. Create or update the CF Function (upserts) ────────────────────────
    print(f"Ensuring CloudFront Function: {fn_name}")
    try:
        existing = cf.describe_function(Name=fn_name, Stage="DEVELOPMENT")
        fn_etag = existing["ETag"]
        cf.update_function(
            Name=fn_name,
            IfMatch=fn_etag,
            FunctionCode=fn_source.encode(),
            FunctionConfig={
                "Comment": "AVA FSI SSO — HMAC-verifies handoff tokens",
                "Runtime": "cloudfront-js-2.0",
            },
        )
        # Refresh ETag after update
        fn_etag = cf.describe_function(Name=fn_name, Stage="DEVELOPMENT")["ETag"]
        print("  Updated existing function")
    except cf.exceptions.NoSuchFunctionExists:
        created = cf.create_function(
            Name=fn_name,
            FunctionConfig={
                "Comment": "AVA FSI SSO — HMAC-verifies handoff tokens",
                "Runtime": "cloudfront-js-2.0",
            },
            FunctionCode=fn_source.encode(),
        )
        fn_etag = created["ETag"]
        print("  Created new function")

    # ── 2. Publish (DEVELOPMENT → LIVE) ──────────────────────────────────────
    publish = cf.publish_function(Name=fn_name, IfMatch=fn_etag)
    fn_arn = publish["FunctionSummary"]["FunctionMetadata"]["FunctionARN"]
    print(f"  Published: {fn_arn}")

    # ── 3. Attach to distribution's default cache behavior ───────────────────
    print(f"Attaching to distribution: {distribution_id}")
    got = cf.get_distribution_config(Id=distribution_id)
    config = got["DistributionConfig"]
    dist_etag = got["ETag"]

    updated = copy.deepcopy(config)
    dcb = updated["DefaultCacheBehavior"]

    # Function association — replace whatever was there with just our function.
    dcb["FunctionAssociations"] = {
        "Quantity": 1,
        "Items": [{"FunctionARN": fn_arn, "EventType": "viewer-request"}],
    }

    # Cookies must be forwarded so ava_session reaches the function.
    # Case Management's default behavior uses legacy ForwardedValues (not
    # CachePolicy), so we mutate that shape. If a future edit migrates to
    # CachePolicy, this block would need to be reworked to a policy that
    # forwards cookies (e.g. AllViewerExceptHostHeader).
    if "ForwardedValues" in dcb:
        dcb["ForwardedValues"]["Cookies"] = {"Forward": "all"}
        dcb["ForwardedValues"]["QueryString"] = True

    # Allow the methods the bootstrap 302 + regular use need. GET/HEAD alone
    # is fine for static UI but breaks any /api/* proxy that gets added later.
    dcb["AllowedMethods"] = {
        "Quantity": 7,
        "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
    }

    if updated == config:
        print("  Distribution config already matches — skipping UpdateDistribution")
    else:
        cf.update_distribution(Id=distribution_id, IfMatch=dist_etag, DistributionConfig=updated)
        print("  Distribution updated — propagation takes ~10-15 min")

    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: attach_cf_auth.py <cf_dist_id> <project_name>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
