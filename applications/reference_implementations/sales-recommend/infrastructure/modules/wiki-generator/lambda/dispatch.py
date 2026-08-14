"""
Dispatch Lambda for the wiki generator.

Triggered two ways:
  1. EventBridge Scheduler (or a direct/manual invoke) with no S3 `Records` —
     reads the managed repo list from env (REPOS_BUCKET / REPOS_KEY).
  2. S3 ObjectCreated event (ad-hoc uploads under the manual/ prefix) — reads
     the object named in the event.

Reads the file (newline-delimited repo URLs; blank lines and `#` comments
ignored) and starts ONE CodeBuild build per URL, passing REPO_URL as an
environment-variable override.

Environment:
  CODEBUILD_PROJECT  Name of the CodeBuild project to start builds on.
  REPOS_BUCKET       Bucket holding the managed repo list (scheduler path).
  REPOS_KEY          Key of the managed repo list (scheduler path).
"""

from __future__ import annotations

import logging
import os
import urllib.parse

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CODEBUILD_PROJECT = os.environ["CODEBUILD_PROJECT"]
REPOS_BUCKET = os.environ.get("REPOS_BUCKET", "")
REPOS_KEY = os.environ.get("REPOS_KEY", "")

s3 = boto3.client("s3")
codebuild = boto3.client("codebuild")


def parse_urls(body: str) -> list[str]:
    """Return de-duplicated repo URLs from the file body.

    One URL per line. Lines that are blank or start with '#' are ignored.
    Order is preserved; duplicates are dropped.
    """
    seen: set[str] = set()
    urls: list[str] = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line not in seen:
            seen.add(line)
            urls.append(line)
    return urls


def _resolve_targets(event) -> list[tuple[str, str]]:
    """Figure out which (bucket, key) file(s) to read.

    S3-event invokes carry `Records`; scheduler/manual invokes don't, so we fall
    back to the managed repo list from env.
    """
    records = (event or {}).get("Records") if isinstance(event, dict) else None
    if records:
        return [
            (r["s3"]["bucket"]["name"],
             urllib.parse.unquote_plus(r["s3"]["object"]["key"]))
            for r in records
        ]
    if REPOS_BUCKET and REPOS_KEY:
        return [(REPOS_BUCKET, REPOS_KEY)]
    return []


def handler(event, _context):
    started, failed = [], []

    targets = _resolve_targets(event)
    if not targets:
        logger.warning("No target file resolved (no Records and no REPOS_* env).")
        return {"started": started, "failed": failed}

    for bucket, key in targets:
        logger.info("Processing s3://%s/%s", bucket, key)
        obj = s3.get_object(Bucket=bucket, Key=key)
        body = obj["Body"].read().decode("utf-8", errors="replace")
        urls = parse_urls(body)
        logger.info("Found %d repo URL(s) in %s", len(urls), key)

        for url in urls:
            try:
                resp = codebuild.start_build(
                    projectName=CODEBUILD_PROJECT,
                    environmentVariablesOverride=[
                        {"name": "REPO_URL", "value": url, "type": "PLAINTEXT"},
                    ],
                )
                build_id = resp["build"]["id"]
                logger.info("Started build %s for %s", build_id, url)
                started.append({"url": url, "buildId": build_id})
            except Exception as exc:  # noqa: BLE001 - report per-URL, keep going
                logger.error("Failed to start build for %s: %s", url, exc)
                failed.append({"url": url, "error": str(exc)})

    logger.info("Dispatch complete: %d started, %d failed", len(started), len(failed))
    return {"started": started, "failed": failed}
