"""Service Approval pipeline runner — Claude Code + plugin invocation.

Reads run parameters from environment variables (set by Step Functions via
container overrides), launches the upstream `service-approval` Claude Code
plugin against Bedrock, and concurrently mirrors the plugin's per-phase output
to S3 + DynamoDB so the AVA UI streams real artifacts as they land.

The plugin writes to `<workdir>/.service-approval/<service-slug>/` with the
9-phase layout (00-intake … 08-evidence). A watcher thread polls that tree,
uploads new/changed files to s3://<bucket>/<run-slug>/<phase-dir>/..., and
updates the DDB run record's per-phase file counts and status.

Environment:
  AWS_REGION, SERVICE_APPROVAL_TABLE, SERVICE_APPROVAL_BUCKET,
  BEDROCK_MODEL_ID (defaults to us.anthropic.claude-sonnet-4-20250514-v1:0),
  SLUG, SERVICE, FRAMEWORK, TESTING_MODE.
"""

from __future__ import annotations

import logging
import os
import pty
import re
import select
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("runner")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

PARTITION_KEY = "GLOBAL"
PLUGIN_SRC = Path("/opt/service-approval-plugin")

PHASES = [
    {"key": "intake",    "label": "Intake",    "phase_dir": "00-intake"},
    {"key": "assess",    "label": "Assess",    "phase_dir": "01-assess"},
    {"key": "research",  "label": "Research",  "phase_dir": "02-research"},
    {"key": "validate",  "label": "Validate",  "phase_dir": "03-validate"},
    {"key": "map",       "label": "Map",       "phase_dir": "04-map"},
    {"key": "generate",  "label": "Generate",  "phase_dir": "05-generate"},
    {"key": "test",      "label": "Test",      "phase_dir": "06-test"},
    {"key": "summarize", "label": "Summarize", "phase_dir": "07-summarize"},
    {"key": "evidence",  "label": "Evidence",  "phase_dir": "08-evidence"},
]
PHASE_DIR_TO_KEY: Dict[str, str] = {p["phase_dir"]: p["key"] for p in PHASES}

SLUG_RE = re.compile(r"[^a-z0-9-]+")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _service_slug(service: str) -> str:
    """Match the plugin's own slugification — lower-case, alnum + hyphen."""
    return SLUG_RE.sub("", service.lower()) or "service"


class RunDeletedExternally(Exception):
    """Raised by RunnerContext._save_run when a conditional put_item fails
    because the slug row no longer exists in DynamoDB. The watcher uses
    this signal to stop its loop, which lets the AgentCore async task
    complete and the microVM hit its idle timeout — preventing the
    "watcher resurrects deleted rows forever" pathology Path B has
    by default."""

    def __init__(self, slug: str) -> None:
        super().__init__(f"run row deleted externally: {slug}")
        self.slug = slug


# ----------------------------------------------------------------------------
# Run state — DynamoDB + S3 helpers
# ----------------------------------------------------------------------------

class RunnerContext:
    def __init__(self) -> None:
        self.region = os.environ["AWS_REGION"]
        self.table_name = os.environ["SERVICE_APPROVAL_TABLE"]
        self.bucket = os.environ["SERVICE_APPROVAL_BUCKET"]
        # Use a Bedrock inference profile that supports cross-region routing —
        # the plugin's long-running runs need it.
        self.model_id = os.environ.get(
            "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"
        )
        self.slug = os.environ["SLUG"]
        self.service = os.environ["SERVICE"]
        self.framework = os.environ.get("FRAMEWORK", "ccmv4")
        self.testing_mode = os.environ.get("TESTING_MODE", "skip")

        self.ddb = boto3.resource("dynamodb", region_name=self.region).Table(self.table_name)
        self.s3 = boto3.client("s3", region_name=self.region)

    # -- DDB ---------------------------------------------------------------

    def _load_run(self) -> dict:
        resp = self.ddb.get_item(Key={"pk": PARTITION_KEY, "sk": self.slug})
        return resp.get("Item") or {}

    def _save_run(self, item: dict) -> None:
        """Persist the run item, but ONLY if the row still exists.

        Without the conditional, a watcher tick that runs after the user
        clicks Delete in the UI silently re-creates the row — and because
        the AgentCore async-task heartbeat is the watcher itself, the
        microVM session never goes idle, so it lives until maxLifetime
        (8h) and the watcher resurrects the row on every tick.

        With ``attribute_exists(sk)`` the put fails when the row is gone.
        Caller handles ``RunDeletedExternally`` by stopping the watcher,
        which lets the async task complete and the microVM hit its
        idle timeout normally."""
        item["pk"] = PARTITION_KEY
        item["sk"] = self.slug
        item["updated_at"] = _now_iso()
        try:
            self.ddb.put_item(
                Item=item,
                ConditionExpression="attribute_exists(sk)",
            )
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise RunDeletedExternally(self.slug) from e
            raise

    def mark_running(self) -> None:
        item = self._load_run()
        item["status"] = "running"
        item.setdefault("phases", [
            {"key": p["key"], "label": p["label"], "status": "pending", "file_count": 0}
            for p in PHASES
        ])
        self._save_run(item)

    def update_phases_from_counts(self, counts: Dict[str, int]) -> None:
        """Update DDB phase records from a snapshot of artifact counts.

        Status semantics (a phase is "started" the moment its artifact dir
        has any files; status only flips forward, never backward):
          - The latest started phase → running (claude is producing artifacts)
          - Earlier started phases  → complete (claude moved on)
          - Empty phases between two started phases → complete (implicitly
            skipped — plugin chose not to emit artifacts there)
          - When NOTHING has files yet: the first DDB-tracked phase is shown
            as running so the UI surfaces forward motion before the first
            artifact lands.
          - All other not-yet-started phases → pending

        Idempotent — safe to call every watcher tick."""
        item = self._load_run()
        phases = item.get("phases") or []
        ddb_keys = {p.get("key") for p in phases}

        # Highest PHASES index whose artifact dir has any files.
        last_with_files = -1
        for idx, p in enumerate(PHASES):
            if counts.get(p["phase_dir"], 0) > 0:
                last_with_files = idx

        # When nothing has files yet, surface the first DDB-tracked phase
        # as running so the UI doesn't sit on all-pending while claude boots.
        # Once any phase has files, downstream phases stay pending until
        # they themselves emit artifacts — only one running phase at a time.
        startup_front_idx: Optional[int] = None
        if last_with_files == -1:
            for idx, p in enumerate(PHASES):
                if p["key"] in ddb_keys:
                    startup_front_idx = idx
                    break

        for idx, p in enumerate(PHASES):
            count = counts.get(p["phase_dir"], 0)
            existing = next((x for x in phases if x.get("key") == p["key"]), None)
            if existing is None:
                continue
            existing["file_count"] = count

            if count > 0 and idx < last_with_files:
                # A later phase has artifacts — claude moved past this one.
                if existing.get("status") != "complete":
                    existing["status"] = "complete"
                    existing.setdefault("started_at", _now_iso())
                    existing["completed_at"] = _now_iso()
            elif count > 0:
                # Latest phase producing artifacts — actively running.
                if existing.get("status") in (None, "pending"):
                    existing["status"] = "running"
                    existing.setdefault("started_at", _now_iso())
            elif idx < last_with_files:
                # No files but a later phase has files — implicitly skipped.
                if existing.get("status") in (None, "pending"):
                    existing["status"] = "complete"
            elif idx == startup_front_idx:
                # Pre-start: surface the first phase as running.
                if existing.get("status") in (None, "pending"):
                    existing["status"] = "running"
                    existing.setdefault("started_at", _now_iso())
        item["phases"] = phases
        self._save_run(item)

    def mark_done(self, status: str, error: Optional[str] = None,
                  approval_report_path: Optional[str] = None) -> None:
        item = self._load_run()
        item["status"] = status
        if error:
            item["error"] = error
        if approval_report_path:
            item["approval_report_path"] = approval_report_path
        # Any phase still pending/running at completion → reflect terminal state.
        for p in item.get("phases") or []:
            if p.get("status") in ("pending", "running"):
                p["status"] = "complete" if status == "completed" else "failed"
        self._save_run(item)

    # -- S3 ----------------------------------------------------------------

    def upload(self, local: Path, key_suffix: str) -> None:
        key = f"{self.slug}/{key_suffix}"
        ctype = _content_type_for(local)
        try:
            self.s3.upload_file(str(local), self.bucket, key,
                                ExtraArgs={"ContentType": ctype})
        except ClientError:
            logger.exception("Failed to upload %s -> s3://%s/%s", local, self.bucket, key)


def _content_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".json": "application/json",
        ".md": "text/markdown",
        ".yaml": "application/yaml",
        ".yml": "application/yaml",
        ".tf": "text/plain",
        ".guard": "text/plain",
        ".log": "text/plain",
        ".py": "text/x-python",
        ".ts": "text/typescript",
    }.get(suffix, "application/octet-stream")


# ----------------------------------------------------------------------------
# Workdir setup — give claude-code a clean directory with the plugin attached
# ----------------------------------------------------------------------------

def _prepare_workdir() -> Path:
    """Create /tmp/run/<slug>/ with the plugin tree symlinked in. The plugin
    discovers .claude-plugin, commands, skills, .mcp.json from the cwd."""
    work = Path("/tmp/run") / os.environ["SLUG"]
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True, exist_ok=True)

    # claude-code 2.1+ discovers project slash commands at
    # `.claude/commands/<name>.md`, not bare `commands/`. The plugin only ships
    # bare `commands/`, so we have to build the .claude/ tree ourselves and
    # symlink commands into it. Without this, every onboarding run exits with
    # "Unknown command: /service-approval" because claude-code can't see it.
    claude_dir = work / ".claude"
    claude_dir.mkdir(exist_ok=True)
    plugin_commands = PLUGIN_SRC / "commands"
    if plugin_commands.exists():
        (claude_dir / "commands").symlink_to(plugin_commands)

    # Everything else (skills/, schemas/, tools/, data/, .mcp.json,
    # .claude-plugin/) is symlinked at the workdir root because the plugin's
    # SKILL.md files reference these by relative path. Bare `commands/` kept
    # for any tooling that still reads the plugin layout directly.
    for name in (".claude-plugin", "commands", "skills", "rules",
                 "schemas", "tools", "data", ".mcp.json"):
        src = PLUGIN_SRC / name
        if src.exists():
            (work / name).symlink_to(src)

    # The plugin's intake skill expects an ./input/ directory; an empty one
    # short-circuits the interactive seeding flow.
    (work / "input").mkdir(exist_ok=True)
    return work


# ----------------------------------------------------------------------------
# Watcher — mirror .service-approval/<service-slug>/ to S3 as files appear
# ----------------------------------------------------------------------------

class ArtifactWatcher(threading.Thread):
    """Mirror the plugin's `.service-approval/` output to S3.

    The canonical service slug isn't known when this runner starts — the
    plugin's Intake skill writes to `.service-approval/_staging/<ts>/...`
    first, and Phase 0 (Assess) atomically promotes that to
    `.service-approval/<canonical-slug>/` only after deriving the slug from
    the SAR's `service_prefix`. The canonical slug rarely matches the input
    service name (e.g. input "amazonapigateway" → canonical "apigateway").

    Rather than pre-compute a slug that won't match, we scan
    `.service-approval/` itself and upload from the first non-private
    subdirectory the plugin creates. Anything under `_staging/` or `_logs/`
    is mirrored to S3 under a `_logs/` prefix so it's visible but doesn't
    inflate phase counts."""

    PRIVATE_DIRS = {"_staging", "_logs"}

    # Directory names that should NEVER be mirrored to S3. The plugin's
    # generate-iac skill scaffolds CDK + CDKTF TypeScript projects and runs
    # `npm install` against them to validate compilation. That installs
    # ~15,000 files of node_modules per project — bloats S3 storage by
    # ~500 MB/run and does nothing useful (regenerable on demand). Same
    # logic applies to .git, __pycache__, .venv, .terraform — all
    # regenerable scratch.
    _SKIP_PATH_COMPONENTS = {
        "node_modules",
        ".git",
        "__pycache__",
        ".venv",
        ".terraform",
        "cdk.out",
        ".pytest_cache",
        ".mypy_cache",
    }

    @classmethod
    def _should_skip(cls, rel: Path) -> bool:
        """Return True if any segment of the relative path is in the skip
        list. Used by both scan loops (canonical + staging) so the rule is
        applied consistently."""
        return any(part in cls._SKIP_PATH_COMPONENTS for part in rel.parts)

    def __init__(self, ctx: RunnerContext, sa_root: Path, stop: threading.Event) -> None:
        super().__init__(daemon=True)
        self.ctx = ctx
        self.sa_root = sa_root  # .../.service-approval (parent of canonical slug dir)
        self.stop = stop
        self._uploaded: Dict[str, Tuple[int, float]] = {}  # rel_path -> (size, mtime)

    def _canonical_root(self) -> Optional[Path]:
        """First non-private subdirectory of `.service-approval/` — the
        canonical slug dir created by the plugin after Intake → Assess
        promotion. None until the plugin has written it."""
        if not self.sa_root.exists():
            return None
        for child in sorted(self.sa_root.iterdir()):
            if child.is_dir() and child.name not in self.PRIVATE_DIRS:
                return child
        return None

    def _scan_once(self) -> Dict[str, int]:
        counts: Dict[str, int] = {p["phase_dir"]: 0 for p in PHASES}
        canonical = self._canonical_root()

        # Mirror anything under .service-approval/_staging/ as _logs/ so
        # pre-promotion artifacts are still visible in S3.
        staging = self.sa_root / "_staging"
        if staging.exists():
            for f in staging.rglob("*"):
                if not f.is_file():
                    continue
                try:
                    rel = f.relative_to(self.sa_root)
                except ValueError:
                    continue
                if self._should_skip(rel):
                    continue
                self._upload_if_new(f, f"_logs/{rel.as_posix()}")

        if canonical is None:
            return counts

        for f in canonical.rglob("*"):
            if not f.is_file():
                continue
            try:
                rel = f.relative_to(canonical)
            except ValueError:
                continue
            if self._should_skip(rel):
                continue
            parts = rel.parts
            if not parts:
                continue
            phase_dir = parts[0]
            if phase_dir not in counts:
                # Pipeline emits log files (mcp-calls.log, pipeline.log) at
                # the slug root. Upload them under a synthetic prefix so
                # they're visible but don't inflate phase counts.
                rel_for_s3 = f"_logs/{rel.as_posix()}"
            else:
                counts[phase_dir] += 1
                rel_for_s3 = rel.as_posix()
            self._upload_if_new(f, rel_for_s3)
        return counts

    def _upload_if_new(self, f: Path, rel_for_s3: str) -> None:
        try:
            stat = f.stat()
        except OSError:
            return
        sig = (stat.st_size, stat.st_mtime)
        if self._uploaded.get(rel_for_s3) == sig:
            return
        self.ctx.upload(f, rel_for_s3)
        self._uploaded[rel_for_s3] = sig

    def run(self) -> None:
        tick = 0
        while not self.stop.is_set():
            try:
                counts = self._scan_once()
                self.ctx.update_phases_from_counts(counts)
                if tick % 6 == 0:  # ~ every 30s
                    canon = self._canonical_root()
                    total = sum(counts.values())
                    logger.info(
                        "watcher tick=%d canonical=%s files=%d phase_counts=%s",
                        tick, canon.name if canon else None, total, counts,
                    )
                tick += 1
            except RunDeletedExternally as e:
                # User deleted the run from the UI. Stop the watcher loop
                # so the async-task heartbeat ends and the microVM can
                # idle-timeout. Without this signal, the watcher keeps
                # writing — which keeps the session "busy" — and the
                # microVM never goes idle until maxLifetime (8h cap).
                logger.warning("Run %s deleted externally; stopping watcher", e.slug)
                self.stop.set()
                break
            except Exception:
                logger.exception("Watcher tick failed")
            self.stop.wait(5.0)
        # Final flush so we never lose the last few writes from the plugin.
        # Skip if we exited due to external delete — the row is gone, the
        # conditional put would just fail again with no useful effect.
        try:
            counts = self._scan_once()
            self.ctx.update_phases_from_counts(counts)
        except RunDeletedExternally:
            pass
        except Exception:
            logger.exception("Final watcher flush failed")


# ----------------------------------------------------------------------------
# Plugin log tailer — surface pipeline.log + mcp-calls.log to CloudWatch live
# ----------------------------------------------------------------------------

class PluginLogTailer(threading.Thread):
    """Tail `pipeline.log` and `mcp-calls.log` from the canonical slug dir to
    stdout as they're written. Without this the only way to see plugin
    activity is to wait for the watcher's 5s S3 upload cycle.

    Re-discovers the canonical root every iteration so it works whether
    the plugin writes to `_staging/<ts>/...` first or directly to
    `<canonical>/...`."""

    LOG_FILES = ("pipeline.log", "mcp-calls.log")

    def __init__(self, sa_root: Path, stop: threading.Event) -> None:
        super().__init__(daemon=True)
        self.sa_root = sa_root
        self.stop = stop
        # path -> (inode, offset)
        self._cursors: Dict[str, Tuple[int, int]] = {}

    def _candidate_log_paths(self) -> list:
        if not self.sa_root.exists():
            return []
        paths = []
        for child in self.sa_root.iterdir():
            if not child.is_dir():
                continue
            for name in self.LOG_FILES:
                p = child / name
                if p.exists():
                    paths.append(p)
            # _staging/<ts>/<phase>/ also has logs in some plugin versions —
            # walk one level deeper for safety.
            if child.name == "_staging":
                for sub in child.iterdir():
                    if sub.is_dir():
                        for name in self.LOG_FILES:
                            p = sub / name
                            if p.exists():
                                paths.append(p)
        return paths

    def _drain(self, p: Path) -> None:
        try:
            stat = p.stat()
        except OSError:
            return
        key = str(p)
        prev = self._cursors.get(key)
        # Inode changed (file rotated/recreated) → start over.
        offset = 0 if prev is None or prev[0] != stat.st_ino else prev[1]
        if offset >= stat.st_size:
            self._cursors[key] = (stat.st_ino, offset)
            return
        try:
            with p.open("rb") as f:
                f.seek(offset)
                data = f.read()
            text = data.decode("utf-8", errors="replace")
            tag = "pipeline" if p.name == "pipeline.log" else "mcp"
            for line in text.splitlines():
                if line.strip():
                    sys.stdout.write(f"[{tag}] {line}\n")
            sys.stdout.flush()
            self._cursors[key] = (stat.st_ino, stat.st_size)
        except OSError:
            logger.exception("Tailer drain failed for %s", p)

    def run(self) -> None:
        while not self.stop.is_set():
            try:
                for p in self._candidate_log_paths():
                    self._drain(p)
            except Exception:
                logger.exception("Tailer iteration failed")
            self.stop.wait(2.0)


# ----------------------------------------------------------------------------
# Claude CLI invocation
# ----------------------------------------------------------------------------

def _run_claude(workdir: Path, ctx: RunnerContext) -> int:
    env = os.environ.copy()
    env["CLAUDE_CODE_USE_BEDROCK"] = "1"
    env["AWS_REGION"] = ctx.region
    env["ANTHROPIC_MODEL"] = ctx.model_id
    # Disable interactive prompts the plugin's intake skill might emit.
    env["CI"] = "1"

    framework_flag = f"--framework={ctx.framework}"
    skip_test = "--skip-test" if ctx.testing_mode == "skip" else ""
    prompt = (
        f"/service-approval --service={ctx.service} {framework_flag} {skip_test}\n"
        f"\nNon-interactive run. Treat ./input/ as empty. "
        f"Use defaults wherever the orchestrator would normally prompt."
    ).strip()

    cmd = [
        "claude",
        "--print",
        "--debug",
        "--verbose",
        "--permission-mode", "bypassPermissions",
        prompt,
    ]
    logger.info("Launching claude in %s with model=%s", workdir, ctx.model_id)

    # Node block-buffers stdout in 4KB chunks when it detects a pipe — that's
    # why claude --print --verbose appears silent for minutes between artifact
    # writes. Allocate a pty for stdout/stderr so Node sees a tty and switches
    # to line-buffered output. stdin stays on /dev/null so --print remains
    # headless. setsid() runs claude in its own session so signals targeting
    # this Python process don't accidentally hit the child.
    primary, secondary = pty.openpty()
    proc = subprocess.Popen(
        cmd, cwd=str(workdir), env=env,
        stdin=subprocess.DEVNULL,
        stdout=secondary, stderr=secondary,
        close_fds=True, start_new_session=True,
    )
    os.close(secondary)

    try:
        while True:
            try:
                ready, _, _ = select.select([primary], [], [], 1.0)
            except (OSError, ValueError):
                break
            if primary in ready:
                try:
                    chunk = os.read(primary, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                sys.stdout.write(chunk.decode("utf-8", errors="replace"))
                sys.stdout.flush()
            if proc.poll() is not None:
                # Drain any remaining buffered output before exiting.
                while True:
                    try:
                        chunk = os.read(primary, 65536)
                    except OSError:
                        chunk = b""
                    if not chunk:
                        break
                    sys.stdout.write(chunk.decode("utf-8", errors="replace"))
                    sys.stdout.flush()
                break
    finally:
        try:
            os.close(primary)
        except OSError:
            pass
    return proc.wait()


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def main() -> int:
    ctx = RunnerContext()
    logger.info("Starting service-approval runner slug=%s service=%s framework=%s mode=%s model=%s",
                ctx.slug, ctx.service, ctx.framework, ctx.testing_mode, ctx.model_id)

    workdir = _prepare_workdir()
    sa_root = workdir / ".service-approval"

    try:
        ctx.mark_running()
    except RunDeletedExternally:
        # User deleted the row before the watcher's first write. No work
        # to do — exit early, the microVM goes idle and AgentCore reaps it.
        logger.warning("Run %s deleted before mark_running; exiting clean", ctx.slug)
        return 0

    stop = threading.Event()
    watcher = ArtifactWatcher(ctx, sa_root, stop)
    watcher.start()
    tailer = PluginLogTailer(sa_root, stop)
    tailer.start()

    rc = 1
    try:
        rc = _run_claude(workdir, ctx)
    except Exception as e:
        logger.exception("Claude invocation crashed")
        try:
            ctx.mark_done("failed", error=f"runner crash: {e}")
        except RunDeletedExternally:
            pass  # row was deleted from UI; nothing more to record
        return 1
    finally:
        stop.set()
        watcher.join(timeout=15)
        tailer.join(timeout=5)

    # Every mark_done below may race with a UI-side delete. Wrap each so
    # the process can return cleanly instead of crashing on the missing
    # row — the UI already knows the run is gone, no extra signal needed.
    def _safe_mark_done(status: str, **kwargs) -> None:
        try:
            ctx.mark_done(status, **kwargs)
        except RunDeletedExternally:
            logger.info("Skipping final mark_done(%s); row deleted externally", status)

    if rc != 0:
        _safe_mark_done("failed", error=f"claude exited with code {rc}")
        return rc

    canonical = watcher._canonical_root()
    approval = "07-summarize/APPROVAL-REPORT.md"
    if canonical and (canonical / approval).exists():
        _safe_mark_done("completed", approval_report_path=approval)
    else:
        _safe_mark_done("failed", error="approval report missing — see _logs/pipeline.log")
        return 1
    logger.info("Pipeline completed for %s", ctx.slug)
    return 0


if __name__ == "__main__":
    sys.exit(main())
