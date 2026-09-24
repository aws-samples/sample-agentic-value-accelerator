#!/usr/bin/env python3
"""
SUPERSEDED — do not use on a Terraform-managed distribution.

The `svc-gateway` origin, the `/svc/*` behaviour and this `x-origin-verify` header are now
owned by iac/terraform/ui (see var.svc_gateway_domain and var.origin_verify_secret_name).
Terraform reads the secret from Secrets Manager at apply time and sets the header itself.

Running this script against that distribution reintroduces the split that caused the
console's governance APIs to be served without authentication: because the origin and
behaviour lived outside Terraform, the edge auth function was never applied to them, and a
`terraform apply` would delete them with no diff to warn anyone. Kept only for
distributions that predate the Terraform-managed UI module.

Phase 2 — add (or remove) the `x-origin-verify` Origin Custom Header on the svc-gateway
origin of a CloudFront distribution. Injected at the edge only, so it is never sent to the
browser; it travels CloudFront -> console gateway -> backend, where the origin-verify
authorizer checks it.

For `add`, the secret value is read straight from AWS Secrets Manager by id/ARN — it is never
passed on the command line, written to disk, or echoed. Uses only the AWS CLI (via subprocess)
+ stdlib json (no boto3 dependency).

Usage:
  python3 phase2-cf-inject-header.py add    <dist-id> <secret-id-or-arn> [origin-id]
  python3 phase2-cf-inject-header.py remove <dist-id>                    [origin-id]

origin-id defaults to "svc-gateway" (the origin added in Phase 1).
"""
import json
import subprocess
import sys

HEADER = "x-origin-verify"
DEFAULT_ORIGIN = "svc-gateway"


def aws(*args, capture=True):
    r = subprocess.run(["aws", *args], capture_output=capture, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr or "")
        raise SystemExit(f"aws {' '.join(a for a in args if not a.startswith('kyc/'))} failed ({r.returncode})")
    return r.stdout


def fetch_secret(secret_id):
    out = aws("secretsmanager", "get-secret-value", "--secret-id", secret_id,
              "--query", "SecretString", "--output", "text")
    return out.strip()


def find_origin(cfg, origin_id):
    for o in cfg["Origins"]["Items"]:
        if o["Id"] == origin_id:
            return o
    raise SystemExit(f"origin '{origin_id}' not found on distribution")


def set_header(origin, name, value):
    och = origin.setdefault("CustomHeaders", {"Quantity": 0, "Items": []})
    items = [h for h in och.setdefault("Items", []) if h["HeaderName"].lower() != name.lower()]
    items.append({"HeaderName": name, "HeaderValue": value})
    och["Items"] = items
    och["Quantity"] = len(items)


def remove_header(origin, name):
    och = origin.get("CustomHeaders")
    if not och:
        return
    items = [h for h in och.get("Items", []) if h["HeaderName"].lower() != name.lower()]
    och["Items"] = items
    och["Quantity"] = len(items)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    action, dist_id = sys.argv[1], sys.argv[2]

    doc = json.loads(aws("cloudfront", "get-distribution-config", "--id", dist_id))
    etag, cfg = doc["ETag"], doc["DistributionConfig"]

    if action == "add":
        if len(sys.argv) < 4:
            raise SystemExit("add requires <secret-id-or-arn>")
        origin_id = sys.argv[4] if len(sys.argv) > 4 else DEFAULT_ORIGIN
        set_header(find_origin(cfg, origin_id), HEADER, fetch_secret(sys.argv[3]))
    elif action == "remove":
        origin_id = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_ORIGIN
        remove_header(find_origin(cfg, origin_id), HEADER)
    else:
        raise SystemExit(f"unknown action '{action}'")

    import os
    tmp = "/tmp/cf-newcfg.json"
    try:
        with open(tmp, "w") as f:
            json.dump(cfg, f)
        aws("cloudfront", "update-distribution", "--id", dist_id,
            "--distribution-config", f"file://{tmp}", "--if-match", etag)
    finally:
        # the temp config embeds the secret value in plaintext — never leave it on disk
        if os.path.exists(tmp):
            os.remove(tmp)
    print(f"OK: {action} {HEADER} on {dist_id} origin '{origin_id}' (was ETag {etag})")


if __name__ == "__main__":
    main()
