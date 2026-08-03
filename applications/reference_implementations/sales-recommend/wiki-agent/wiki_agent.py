#!/usr/bin/env python3
"""
Repo -> Repository vetting report generator.

Given a REPO_URL, this:
  1. Normalizes the URL to a stable slug (host/owner/repo).
  2. Shallow-clones the repo.
  3. Packs a filtered, LLM-friendly view of the codebase.
  4. Uses a Strands agent (Claude) driven by vetting_prompt.md to produce ONE
     structured Markdown vetting report answering the questions a technical /
     business decision-maker asks before adopting external code (architecture,
     security, cost, licensing, testing, deployment, resilience, etc.).
  5. Writes <prefix>/<host>/<owner>/<repo>.md + a .metadata.json sidecar to the
     Knowledge Base S3 bucket (one file == one repo == one vector, because the
     data source uses chunking = NONE).
  6. Triggers a Bedrock Knowledge Base ingestion job.

Designed to run inside AWS CodeBuild. REPO_URL is passed as an environment
variable override at `start-build` time; everything else comes from the
CodeBuild project environment (wired by Terraform).
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import boto3
from strands import Agent
from strands.models import BedrockModel
from strands.types.exceptions import MaxTokensReachedException

# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------
logger = logging.getLogger("wiki_agent")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _h = logging.StreamHandler(sys.stdout)
    _h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(_h)

# --------------------------------------------------------------------------
# Configuration (from environment)
# --------------------------------------------------------------------------
REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "global.anthropic.claude-sonnet-4-6")
KB_DATA_BUCKET = os.environ.get("KB_DATA_BUCKET", "")
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
DATA_SOURCE_ID = os.environ.get("DATA_SOURCE_ID", "")
S3_PREFIX = os.environ.get("S3_PREFIX", "repos").strip("/")
REPO_URL = os.environ.get("REPO_URL", "").strip()
REPO_BRANCH = os.environ.get("REPO_BRANCH", "").strip()
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()

# Packing limits — keep the synthesis input well within the model context.
MAX_TOTAL_CHARS = 180_000
MAX_FILE_CHARS = 12_000

IGNORE_DIRS = {
    ".git", ".github", ".gitlab", "node_modules", "vendor", "dist", "build",
    "out", "target", ".terraform", "__pycache__", ".venv", "venv", ".mypy_cache",
    ".pytest_cache", ".next", ".nuxt", "coverage", ".idea", ".vscode", "bin",
    "obj", ".gradle", ".cache", "site-packages", ".turbo",
}
IGNORE_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".pdf", ".zip",
    ".gz", ".tar", ".tgz", ".7z", ".rar", ".mp4", ".mov", ".mp3", ".wav",
    ".woff", ".woff2", ".ttf", ".eot", ".otf", ".class", ".jar", ".so", ".dll",
    ".dylib", ".exe", ".bin", ".lock", ".pyc", ".map", ".min.js", ".min.css",
}
# Files worth pulling first — they carry the most signal about the project.
PRIORITY_NAMES = (
    "readme", "package.json", "pyproject.toml", "setup.py", "requirements.txt",
    "go.mod", "cargo.toml", "pom.xml", "build.gradle", "composer.json",
    "gemfile", "dockerfile", "docker-compose", "makefile", "main.tf",
    "serverless.yml", "template.yaml", "openapi", "swagger",
)
# Map file extensions -> language for metadata.
EXT_LANG = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".jsx": "JavaScript", ".go": "Go", ".rs": "Rust", ".java": "Java",
    ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".cpp": "C++", ".c": "C",
    ".kt": "Kotlin", ".swift": "Swift", ".scala": "Scala", ".sh": "Shell",
    ".tf": "Terraform", ".sql": "SQL", ".r": "R", ".m": "Objective-C",
}


# --------------------------------------------------------------------------
# URL normalization
# --------------------------------------------------------------------------
def normalize_repo_url(raw: str) -> dict[str, str]:
    """Return {host, owner, repo, slug, clone_url} for a repo URL.

    Handles https, ssh (git@host:owner/repo.git) and trailing .git. The slug
    is a stable, S3-safe key that maps a repo to exactly one location so
    re-runs overwrite in place.
    """
    url = raw.strip()
    ssh = re.match(r"^git@([^:]+):(.+?)(?:\.git)?/?$", url)
    if ssh:
        host, path = ssh.group(1), ssh.group(2)
    else:
        if "://" not in url:
            url = "https://" + url
        parsed = urlparse(url)
        host = parsed.netloc
        path = parsed.path.strip("/")
        if path.endswith(".git"):
            path = path[:-4]

    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Cannot parse owner/repo from URL: {raw!r}")
    owner, repo = parts[0], parts[1]

    def _safe(s: str) -> str:
        return re.sub(r"[^a-z0-9._-]", "-", s.lower())

    host_s, owner_s, repo_s = _safe(host), _safe(owner), _safe(repo)
    slug = f"{host_s}/{owner_s}/{repo_s}"

    clone_url = f"https://{host}/{owner}/{repo}.git"
    if GITHUB_TOKEN and "github.com" in host:
        clone_url = f"https://x-access-token:{GITHUB_TOKEN}@{host}/{owner}/{repo}.git"

    return {
        "host": host_s, "owner": owner_s, "repo": repo_s,
        "slug": slug, "clone_url": clone_url,
        "display": f"{owner}/{repo}",
    }


# --------------------------------------------------------------------------
# Clone + pack
# --------------------------------------------------------------------------
def clone_repo(clone_url: str, dest: Path) -> str:
    """Shallow-clone and return the resolved commit SHA (or 'unknown')."""
    cmd = ["git", "clone", "--depth", "1"]
    if REPO_BRANCH:
        cmd += ["--branch", REPO_BRANCH]
    cmd += [clone_url, str(dest)]
    # Avoid leaking a token into logs.
    logger.info("Cloning %s", re.sub(r"x-access-token:[^@]+@", "***@", clone_url))
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    try:
        sha = subprocess.run(
            ["git", "-C", str(dest), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        return sha[:12] or "unknown"
    except subprocess.CalledProcessError:
        return "unknown"


def _is_priority(name: str) -> bool:
    low = name.lower()
    return any(p in low for p in PRIORITY_NAMES)


def pack_repo(root: Path) -> tuple[str, dict[str, int]]:
    """Build a filtered, LLM-friendly text view + a language histogram.

    Priority files (README, manifests, IaC) come first, then a breadth-first
    sample of source files, capped by MAX_TOTAL_CHARS.
    """
    lang_counts: dict[str, int] = {}
    collected: list[tuple[bool, Path]] = []

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in IGNORE_DIRS for part in path.relative_to(root).parts):
            continue
        ext = path.suffix.lower()
        if ext in IGNORE_EXTS or path.name.endswith((".min.js", ".min.css")):
            continue
        try:
            if path.stat().st_size > 1_500_000:
                continue
        except OSError:
            continue
        lang = EXT_LANG.get(ext)
        if lang:
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
        collected.append((_is_priority(path.name), path))

    # Priority files first, then the rest.
    collected.sort(key=lambda t: (not t[0], str(t[1])))

    tree_lines: list[str] = []
    body_parts: list[str] = []
    total = 0
    for _prio, path in collected:
        rel = path.relative_to(root).as_posix()
        tree_lines.append(rel)
        if total >= MAX_TOTAL_CHARS:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeError):
            continue
        if not text.strip():
            continue
        snippet = text[:MAX_FILE_CHARS]
        block = f"\n===== FILE: {rel} =====\n{snippet}\n"
        if total + len(block) > MAX_TOTAL_CHARS:
            block = block[: MAX_TOTAL_CHARS - total]
        body_parts.append(block)
        total += len(block)

    tree = "\n".join(tree_lines[:400])
    packed = f"## FILE TREE (partial)\n{tree}\n\n## FILE CONTENTS\n{''.join(body_parts)}"
    return packed, lang_counts


# --------------------------------------------------------------------------
# Synthesis (Strands agent)
# --------------------------------------------------------------------------
SYSTEM_PROMPT_FILE = os.environ.get(
    "VETTING_PROMPT_FILE",
    str(Path(__file__).parent / "vetting_prompt.md"),
)


def load_system_prompt() -> str:
    """Load the repository vetting system prompt from disk.

    Kept in a separate .md file so it can be edited without touching code.
    """
    try:
        return Path(SYSTEM_PROMPT_FILE).read_text(encoding="utf-8")
    except OSError as exc:
        logger.error("Could not read vetting prompt %s: %s", SYSTEM_PROMPT_FILE, exc)
        raise

USER_TEMPLATE = """Vet the repository **{display}** and produce the full report per your instructions.

Analysis Date: {date}
Repository URL: {repo_url}
Primary languages (detected): {languages}
Last analyzed commit: {commit}

Base every finding ONLY on the evidence below. Where the provided view is
partial and a section is not determinable, say so explicitly rather than
guessing.

Below is a partial, filtered view of the repository:

{packed}
"""

_META_RE = re.compile(r"```metadata\s*(.*?)```", re.DOTALL)


def synthesize_profile(meta: dict, packed: str, languages: list[str], commit: str) -> tuple[str, dict]:
    """Call the model; return (markdown_report, extracted_metadata_dict).

    If the model hits the output-token ceiling (Strands raises
    MaxTokensReachedException and discards the partial text), retry once with a
    hard concision directive. Keeping the report bounded also matters because
    the KB embeds each profile as a single vector (Titan v2 ~8k token limit).
    """
    model = BedrockModel(model_id=MODEL_ID, region_name=REGION, max_tokens=16384)
    prompt = USER_TEMPLATE.format(
        display=meta["display"],
        date=datetime.now(timezone.utc).date().isoformat(),
        repo_url=REPO_URL,
        languages=", ".join(languages) or "unknown",
        commit=commit,
        packed=packed,
    )

    try:
        text = str(Agent(system_prompt=load_system_prompt(), model=model)(prompt)).strip()
    except MaxTokensReachedException:
        logger.warning("Report hit the token ceiling; retrying with a hard concision directive.")
        concise_prompt = (
            prompt
            + "\n\nIMPORTANT: Your previous attempt was too long and was cut off. "
            "Produce the SAME report but keep it UNDER 900 words total — be terse, "
            "use short bullets, no filler, and prioritize sections 1-6. Still end "
            "with the ```metadata block."
        )
        text = str(Agent(system_prompt=load_system_prompt(), model=model)(concise_prompt)).strip()

    extracted: dict = {}
    m = _META_RE.search(text)
    if m:
        try:
            extracted = json.loads(m.group(1))
        except json.JSONDecodeError:
            logger.warning("Could not parse model metadata block; continuing.")
        # Strip the metadata fence from the published Markdown.
        text = _META_RE.sub("", text).strip()
    return text, extracted


# --------------------------------------------------------------------------
# S3 write + ingestion
# --------------------------------------------------------------------------
def build_metadata(meta: dict, languages: list[str], commit: str, extracted: dict) -> dict:
    """Bedrock KB sidecar. Values must be string / number / bool / string-list."""
    attrs = {
        "repo": meta["display"],
        "repo_url": REPO_URL,
        "host": meta["host"],
        "owner": meta["owner"],
        "name": meta["repo"],
        "commit_sha": commit,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    if languages:
        attrs["languages"] = languages
    domain = extracted.get("domain")
    if isinstance(domain, str) and domain:
        attrs["domain"] = domain
    caps = extracted.get("key_capabilities")
    if isinstance(caps, list) and caps:
        attrs["key_capabilities"] = [str(c) for c in caps][:6]
    overall_risk = extracted.get("overall_risk")
    if isinstance(overall_risk, str) and overall_risk:
        attrs["overall_risk"] = overall_risk
    return {"metadataAttributes": attrs}


def write_to_s3(s3, meta: dict, profile_md: str, metadata: dict) -> str:
    key = f"{S3_PREFIX}/{meta['slug']}.md"
    s3.put_object(
        Bucket=KB_DATA_BUCKET, Key=key,
        Body=profile_md.encode("utf-8"), ContentType="text/markdown",
    )
    s3.put_object(
        Bucket=KB_DATA_BUCKET, Key=f"{key}.metadata.json",
        Body=json.dumps(metadata, indent=2).encode("utf-8"),
        ContentType="application/json",
    )
    logger.info("Wrote s3://%s/%s (+ .metadata.json)", KB_DATA_BUCKET, key)
    return key


def trigger_ingestion() -> None:
    if not (KNOWLEDGE_BASE_ID and DATA_SOURCE_ID):
        logger.warning("KNOWLEDGE_BASE_ID/DATA_SOURCE_ID not set; skipping ingestion.")
        return
    client = boto3.client("bedrock-agent", region_name=REGION)

    # A Bedrock KB data source allows only ONE in-progress ingestion job at a
    # time. Concurrent per-repo builds collide, so retry on conflict. An
    # ingestion job re-scans the WHOLE data source, so it's fine if another
    # build's job ends up covering this repo's file too — the profile is
    # already in S3. Never fail the build just because a job was already
    # running: give up gracefully after retries.
    max_attempts = 6
    for attempt in range(1, max_attempts + 1):
        try:
            resp = client.start_ingestion_job(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                dataSourceId=DATA_SOURCE_ID,
                description=f"wiki-agent: {REPO_URL}",
            )
            job = resp.get("ingestionJob", {})
            logger.info("Started ingestion job %s (status=%s)",
                        job.get("ingestionJobId"), job.get("status"))
            return
        except client.exceptions.ConflictException as exc:
            wait = min(30, 5 * attempt)
            logger.info(
                "An ingestion job is already running (attempt %d/%d): %s — "
                "retrying in %ds", attempt, max_attempts, exc, wait,
            )
            time.sleep(wait)

    logger.warning(
        "Could not start an ingestion job after %d attempts (another job kept "
        "running). The profile is already in S3 and will be picked up by the "
        "next ingestion run.", max_attempts,
    )


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main() -> int:
    if not REPO_URL:
        logger.error("REPO_URL is required (pass via CodeBuild env override).")
        return 2
    if not KB_DATA_BUCKET:
        logger.error("KB_DATA_BUCKET is required.")
        return 2

    meta = normalize_repo_url(REPO_URL)
    logger.info("Processing repo slug=%s", meta["slug"])

    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp) / "repo"
        commit = clone_repo(meta["clone_url"], dest)
        packed, lang_counts = pack_repo(dest)

    languages = [l for l, _ in sorted(lang_counts.items(), key=lambda kv: -kv[1])][:6]
    profile_md, extracted = synthesize_profile(meta, packed, languages, commit)

    metadata = build_metadata(meta, languages, commit, extracted)
    s3 = boto3.client("s3", region_name=REGION)
    write_to_s3(s3, meta, profile_md, metadata)
    trigger_ingestion()

    logger.info("Done: %s", meta["slug"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
