"""Path B M3b — AgentCore wrapper around the v1 service-approval runner.

Architecture summary:

  Backend POST /service-approval/runs
    → DDB row (status=PENDING)        ← unchanged from v1
    → bedrock-agentcore:InvokeAgentRuntime
        (replaces SFN start_execution; M3c does the backend cutover)
    → @app.entrypoint here returns within ms
    → background thread sets v1 env vars + calls v1 main()
        ← v1's RunnerContext + watcher + claude-code subprocess all run
          unchanged: same DDB schema, same S3 layout, same plugin tree.
    → app.complete_async_task() on exit
    → UI continues polling DDB exactly as today

The v1 entrypoint reads SLUG/SERVICE/FRAMEWORK/TESTING_MODE from os.environ
at RunnerContext-init time. SFN injected those via per-task container
overrides; here they come from the AgentCore invoke payload. We set them
in os.environ BEFORE invoking v1 main() so RunnerContext picks them up
without any code change to the v1 module.

The v1 entrypoint also uses a pty wrapper (the lesson we learned the hard
way mid-conversation) to defeat Node's stdout buffering. AgentCore microVMs
support pty allocation — verified by the M3a probe. So we keep the v1
behavior verbatim.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
import traceback
from datetime import datetime, timezone
from typing import Any, Dict

import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp

# Make the v1 entrypoint importable. We copied it as v1_entrypoint.py to
# avoid module-name collision with the v1 runner's `entrypoint.py` (some
# tooling looks for that exact filename).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("m3b")

app = BedrockAgentCoreApp()


def _seed_ddb_row(env_overrides: Dict[str, str]) -> None:
    """Populate the required ServiceApprovalRun fields BEFORE v1 main()
    takes over.

    Why this exists: the v1 entrypoint's RunnerContext writes only
    `status`, `phases`, and `updated_at` — it relied on the backend's
    create_run() to have written `service`, `framework`, `testing_mode`,
    `created_at` first. In M3b we invoke AgentCore directly without going
    through the backend's create_run path (M3c does that), so those
    required fields would be missing from the row, which makes the
    backend's list_runs Pydantic-validate-and-skip the row, which makes
    the run invisible in the UI.

    Same root-cause fix we applied in M1's RunStateStore.mark_running.

    Removed once M3c lands and the backend always writes the row first
    (this becomes a no-op idempotent setdefault then)."""
    region = os.environ.get("AWS_REGION", "us-east-1")
    table_name = os.environ.get("SERVICE_APPROVAL_TABLE")
    if not table_name:
        logger.warning("SERVICE_APPROVAL_TABLE unset; skipping seed")
        return
    slug = env_overrides["SLUG"]
    try:
        table = boto3.resource("dynamodb", region_name=region).Table(table_name)
        existing = (table.get_item(Key={"pk": "GLOBAL", "sk": slug})
                    .get("Item") or {})
        # Only set fields the row is missing — never overwrite values the
        # backend's create_run already populated. setdefault semantics.
        now = datetime.now(timezone.utc).isoformat()
        seeded = {
            "pk": "GLOBAL",
            "sk": slug,
            # Backend's _from_item strips (pk, sk) before Pydantic-validating
            # against ServiceApprovalRun, which requires a top-level `slug`
            # field. Without this the row passes-through DDB but
            # silently disappears from the UI's list_runs response.
            "slug": existing.get("slug") or slug,
            "service": existing.get("service") or env_overrides["SERVICE"],
            "framework": existing.get("framework") or env_overrides["FRAMEWORK"],
            "testing_mode": existing.get("testing_mode") or env_overrides["TESTING_MODE"],
            "created_at": existing.get("created_at") or now,
            "updated_at": now,
            # Preserve any phases/status the v1 watcher wrote between
            # mark_running and now (small race window). v1's next put_item
            # will overwrite anyway, but be defensive.
            **{k: v for k, v in existing.items()
               if k not in ("pk", "sk", "service", "framework",
                            "testing_mode", "created_at", "updated_at")},
        }
        table.put_item(Item=seeded)
        logger.info("[slug=%s] seeded DDB row with required fields", slug)
    except Exception:
        logger.exception("[slug=%s] DDB seed failed (run may not show in UI)",
                         slug)


def _parse_payload(payload: Dict[str, Any]) -> Dict[str, str]:
    """Extract the four fields the v1 RunnerContext expects from env vars.
    Same shape backend's create_run produces today, so M3c cutover is
    just `start_execution` → `invoke_agent_runtime` with the same JSON."""
    if not isinstance(payload, dict):
        raise ValueError(f"payload must be JSON object, got {type(payload).__name__}")
    for key in ("slug", "service"):
        if not payload.get(key) or not isinstance(payload[key], str):
            raise ValueError(f"payload.{key} required (string)")
    return {
        "SLUG": payload["slug"],
        "SERVICE": payload["service"],
        "FRAMEWORK": payload.get("framework") or "ccmv4",
        "TESTING_MODE": payload.get("testing_mode") or "skip",
    }


def _run_pipeline(env_overrides: Dict[str, str], task_id: Any) -> None:
    """Background worker. Imports + calls v1 entrypoint's main() with the
    payload's slug/service/framework/testing_mode threaded through env vars.

    The v1 main() blocks for the full pipeline duration (30-90 min on
    Opus). That's fine here because:
      - This runs on a daemon thread, not the @app.entrypoint thread
      - app.add_async_task keeps /ping HealthyBusy throughout
      - lifecycleConfiguration on the runtime allows up to 8h maxLifetime
    """
    slug = env_overrides.get("SLUG", "<unknown>")
    rc = 1
    try:
        # Inject the v1's expected env vars BEFORE importing v1_entrypoint.
        # RunnerContext reads them at __init__ time; setting them after
        # import would only affect re-instantiation.
        os.environ.update(env_overrides)
        logger.info("[slug=%s] starting v1 pipeline via AgentCore wrapper", slug)

        # Seed the DDB row with required ServiceApprovalRun fields the v1
        # entrypoint doesn't write itself. Without this seed, the run
        # exists in DDB but Pydantic-validates as malformed in list_runs
        # and never appears in the UI. M3c removes this once the backend
        # writes the row first.
        _seed_ddb_row(env_overrides)

        # Late import — gives os.environ.update above time to settle and
        # avoids importing boto3 + heavy deps at module-load time of the
        # @app.entrypoint thread.
        import v1_entrypoint
        rc = v1_entrypoint.main()
        logger.info("[slug=%s] v1 main() returned exit=%s", slug, rc)
    except Exception as e:
        logger.exception("[slug=%s] v1 pipeline crashed: %s", slug, e)
        # v1's main() catches its own exceptions and writes mark_done(failed)
        # to DDB. If we're catching here, something failed BEFORE main()
        # could update DDB — but we don't have a context to write the row
        # ourselves at this layer (would need to import RunnerContext, etc).
        # Best-effort: log loudly. M3b tail-watching from CW logs is enough.
    finally:
        try:
            app.complete_async_task(task_id)
            logger.info("[slug=%s] async task %s marked complete (exit=%s)",
                        slug, task_id, rc)
        except Exception:
            logger.exception("[slug=%s] complete_async_task failed", slug)


@app.entrypoint
def handle(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Detached entrypoint. Returns within ms; the v1 pipeline runs on
    a background thread for the full pipeline duration (30-90 min)."""
    try:
        env_overrides = _parse_payload(payload)
    except ValueError as e:
        logger.warning("rejected payload: %s", e)
        return {"status": "rejected", "error": str(e)}

    slug = env_overrides["SLUG"]
    logger.info("entrypoint slug=%s service=%s framework=%s mode=%s",
                slug, env_overrides["SERVICE"],
                env_overrides["FRAMEWORK"], env_overrides["TESTING_MODE"])

    task_id = app.add_async_task(f"v1-pipeline-{slug}")
    threading.Thread(
        target=_run_pipeline,
        args=(env_overrides, task_id),
        daemon=True,
        name=f"v1-pipeline-{slug}",
    ).start()

    return {"status": "accepted", "slug": slug, "task_id": task_id}


if __name__ == "__main__":
    app.run()
