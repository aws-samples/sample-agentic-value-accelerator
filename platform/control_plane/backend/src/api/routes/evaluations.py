"""Operate → Evaluation routes.

Wire contract matches frontend/src/components/evaluation/api.ts (camelCase).

Status-code contract, applied uniformly here:

* A COLLECTION route answers an empty collection with 200 and `[]`. "There are
  no evaluated applications" is a fact about the account, not about the route,
  and a 404 says the route does not exist — which sends every client down its
  error path over a successful read. GET /apps and GET /apps/{id}/suites both
  follow this.
* A SINGLE-ITEM route 404s when that specific id is absent: GET
  /apps/{deployment_id}, GET /apps/{deployment_id}/suite, GET /runs/{run_id},
  DELETE /suites/{suite_id}. That 404 is about the named resource and is real.
* An upstream read that FAILED is never flattened into emptiness — the
  deployments inventory raises 503 with the reason (see _deployed_apps), so an
  expired-credential backend cannot masquerade as an empty account.
"""

import json
import logging
import queue as queue_mod
import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, Response, StreamingResponse

from core.config import settings
from core.rbac import Role, require_role
from models.evaluations import (
    EvaluatedApp,
    EvalRun,
    JudgePreviewCase,
    PairwiseRequest,
    RunCreateRequest,
    RunSummary,
    SuiteCreateRequest,
)
from services.evaluation_pairwise import pairwise_compare
from services.evaluation_calibration import run_calibration
from services.evaluation_enrollment import draft_suite_for_deployment
from services.evaluation_report import build_compare_report, build_report, to_html
from services.evaluation_runner import (
    EVALUATORS_BY_ID,
    JUDGE_MODEL_ID,
    AgentCoreInvoker,
    evaluate_cases,
    new_run_id,
    recommend_optimizations,
)
from services.evaluation_service import get_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/evaluations", tags=["evaluations"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run_summary(run: dict) -> RunSummary:
    return RunSummary(**{k: run.get(k) for k in RunSummary.model_fields if k in run})


STALE_RUN_SECONDS = 45 * 60

# In-process pubsub for live run streaming (SSE). Runs execute in a daemon
# thread of this same process, so an in-memory bus is exact; a future queue
# worker would replace this with its own event channel.
_subscribers: Dict[str, List["queue_mod.Queue"]] = {}
_subs_lock = threading.Lock()


def _publish(run_id: str, event: dict) -> None:
    with _subs_lock:
        for q in list(_subscribers.get(run_id, [])):
            try:
                q.put_nowait(event)
            except Exception:  # a slow/dead subscriber must never block the run
                pass


def _reconcile(run: dict) -> dict:
    """A run left 'running' beyond any plausible duration was stranded by a
    process restart mid-evaluation (runs execute in a daemon thread). Flip it
    to failed on read so nothing spins forever."""
    if run.get("status") == "running":
        try:
            started = datetime.strptime(run.get("startedAt", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            return run
        if (datetime.now(timezone.utc) - started).total_seconds() > STALE_RUN_SECONDS:
            # `run` may be a projected summary — persist the flip onto the
            # FULL record so cases/results are not clobbered.
            full = get_store().get_run(str(run.get("id"))) or run
            run = {**full, "status": "failed", "error": "Run stranded — backend restarted mid-evaluation"}
            get_store().save_run(run)
    return run


_inventory_cache: dict = {"at": 0.0, "data": None, "table": None}
_INVENTORY_TTL = 15.0


def _map_deployment_item(i: dict) -> Optional[dict]:
    """Normalize one deployments-table item into the evaluator's view.

    The table has THREE writers, each with its own shape, and agents must be
    evaluable no matter which one deployed them:
    - DeploymentService (platform Deployments flow): deployment_name /
      framework_id / status "deployed", runtime ARN nested under outputs as
      agent_runtime_arn OR agentcore_runtime_arn (both are first-class
      aliases there and in the deployment success hook);
    - the deployment success hook lambda (same outputs conventions);
    - the foundry deploy script's control_plane.sh registration: top-level
      name / framework / agent_runtime_arn / status SUCCEEDED.
    Reference applications (outputs carry only a ui_url) have no agent
    runtime — they are flagged so callers can say "not evaluable" precisely
    instead of failing generically. Returns None for non-successful records.
    """
    if str(i.get("status", "")).upper() not in ("SUCCEEDED", "COMPLETED", "DEPLOYED"):
        return None
    outputs = i.get("outputs") or {}
    # Runtime ARN detection is by VALUE, not key name: every writer spells the
    # key differently (agent_runtime_arn, agentcore_runtime_arn, CamelCase
    # AgentRuntimeArn in reference-app CloudFormation outputs, ...) and each
    # new spelling used to be a bug. A bedrock-agentcore runtime ARN is
    # unmistakable whatever it is called. Known keys are checked first so an
    # explicit field always wins over an incidental mention.
    runtime_arn = str(
        i.get("agent_runtime_arn") or i.get("runtime_arn")
        or outputs.get("agent_runtime_arn") or outputs.get("agentcore_runtime_arn")
        or outputs.get("runtime_arn") or ""
    )
    if not runtime_arn:
        for source in (outputs, i):
            for v in source.values():
                if isinstance(v, str) and v.startswith("arn:aws:bedrock-agentcore:") and ":runtime/" in v:
                    runtime_arn = v
                    break
            if runtime_arn:
                break
    return {
        "deploymentId": str(i.get("id") or i.get("deployment_id") or ""),
        "name": str(i.get("name") or i.get("deployment_name") or i.get("template_name")
                    or i.get("use_case_id") or "Unnamed"),
        "framework": str(i.get("framework") or i.get("framework_id") or ""),
        # Identity hints for registry matching during auto-enrollment
        "templateId": str(i.get("template_id") or ""),
        "useCaseId": str(i.get("use_case_id") or ""),
        "runtimeArn": runtime_arn,
        # No runtime ARN = nothing to invoke, whatever the deployment is (web
        # app, gateway, observability server, supporting infra). All of them
        # get the judge-only path — guessing "web app" from output key names
        # proved unreliable (langfuse/gateway records carry host keys, or no
        # outputs at all).
        "isWebApp": not runtime_arn,
        # Optional output guardrail applied to responses before judging
        "guardrailId": str(i.get("guardrail_id") or ""),
        "guardrailVersion": str(i.get("guardrail_version") or "DRAFT"),
    }


def _deployed_apps() -> List[dict]:
    """Successful AgentCore deployments from the deployments table.

    A missing table means the platform isn't deployed here → genuinely empty
    (the frontend shows its demo catalog). Any OTHER failure — expired
    credentials above all — raises 503 so the UI shows an honest error
    instead of silently masquerading as demo data. Fresh Session per call so
    refreshed credentials are picked up without a backend restart. Cached
    briefly — the inventory changes on deploys, not per page view."""
    import time as time_mod

    import boto3
    from botocore.exceptions import ClientError

    if _inventory_cache["data"] is not None and time_mod.monotonic() - _inventory_cache["at"] < _INVENTORY_TTL:
        return list(_inventory_cache["data"])
    try:
        # Reuse the cached connection (pool) across calls; rebuild only after a
        # failure — same connection-reuse-vs-refresh tradeoff as EvaluationStore.
        if _inventory_cache["table"] is None:
            _inventory_cache["table"] = boto3.session.Session().resource(
                "dynamodb", region_name=settings.AWS_REGION).Table(settings.DEPLOYMENTS_TABLE_NAME)
        table = _inventory_cache["table"]
        items = []
        kwargs = {}
        while True:  # paginate — a deployment past the 1MB page must not vanish
            resp = table.scan(**kwargs)
            items.extend(resp.get("Items", []))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        data = [d for d in (_map_deployment_item(i) for i in items) if d]
        _inventory_cache.update(at=time_mod.monotonic(), data=data)
        return list(data)
    except ClientError as exc:
        _inventory_cache["table"] = None  # likely expired creds — rebuild next call
        code = exc.response.get("Error", {}).get("Code", "")
        if code == "ResourceNotFoundException":
            logger.info("deployments table absent — treating inventory as empty")
            return []
        logger.warning("deployments inventory unavailable: %s", exc)
        raise HTTPException(status_code=503,
                            detail=f"Deployments inventory unreachable ({code}) — backend AWS credentials may have expired")
    except Exception as exc:
        _inventory_cache["table"] = None
        logger.warning("deployments inventory unavailable: %s", exc)
        raise HTTPException(status_code=503,
                            detail=f"Deployments inventory unreachable ({type(exc).__name__}) — backend AWS credentials may have expired")


# Zero-click enrollment: deployments without a suite get a draft scaffolded
# in the background the first time the fleet is listed — registry-matched
# when the use case is known, generic or judge-only (web apps) otherwise.
# Creation only: the first RUN stays a human decision, and a deployment is
# attempted once per process (a user deleting a suite is not fought).
_auto_enroll_seen: set = set()
_auto_enroll_lock = threading.Lock()


def _auto_enroll_missing(deps: List[dict]) -> None:
    import os

    if os.environ.get("EVALUATION_AUTO_ENROLL", "true").lower() == "false":
        return
    with _auto_enroll_lock:
        todo = [d for d in deps if d.get("deploymentId") and d["deploymentId"] not in _auto_enroll_seen]
        for d in todo:
            _auto_enroll_seen.add(d["deploymentId"])
    if not todo:
        return

    def _work():
        store = get_store()
        for dep in todo:
            try:
                if store.suites_for_deployment(dep["deploymentId"]):
                    continue
                suite = draft_suite_for_deployment(dep, settings.AWS_REGION)
                store.save_suite(suite)
                logger.info("auto-enrolled %s with draft suite %s", dep["deploymentId"], suite["id"])
            except Exception as exc:  # never let enrollment failures surface to deploys or pages
                logger.warning("auto-enroll failed for %s (non-fatal, will retry next process): %s",
                               dep.get("deploymentId"), exc)
                with _auto_enroll_lock:
                    _auto_enroll_seen.discard(dep.get("deploymentId"))

    threading.Thread(target=_work, daemon=True, name="auto-enroll").start()


@router.get("/apps", response_model=List[EvaluatedApp])
def list_apps(_=Depends(require_role(Role.VIEWER))):
    """Every evaluable application: successful deployments, plus any deployment
    that has evaluation runs on record.

    An account with neither is an empty collection, so this answers 200 with
    `[]`. It does NOT 404 — see the status-code contract in the module
    docstring. A failed inventory read still raises 503 from _deployed_apps."""
    store = get_store()
    apps: dict[str, EvaluatedApp] = {}

    deployed = _deployed_apps()
    _auto_enroll_missing(deployed)
    for dep in deployed:
        if dep["deploymentId"]:
            apps[dep["deploymentId"]] = EvaluatedApp(
                deploymentId=dep["deploymentId"], name=dep["name"], framework=dep["framework"],
                isWebApp=bool(dep.get("isWebApp")),
            )

    for run in (_reconcile(r) for r in store.all_runs()):
        dep_id = run.get("deploymentId", "")
        app = apps.get(dep_id) or EvaluatedApp(deploymentId=dep_id, name=run.get("appName", dep_id))
        summary = _run_summary(run)
        app.history.append(summary)
        if app.lastRun is None:
            app.lastRun = summary
            app.status = "running" if summary.status == "running" else "evaluated"
        apps[dep_id] = app

    return list(apps.values())


@router.get("/apps/{deployment_id}", response_model=EvaluatedApp)
def get_app(deployment_id: str, _=Depends(require_role(Role.VIEWER))):
    apps = list_apps(_)
    for app in apps:
        if app.deploymentId == deployment_id:
            return app
    raise HTTPException(status_code=404, detail=f"No evaluation state for deployment {deployment_id}")


@router.get("/apps/{deployment_id}/suite")
async def get_current_suite(deployment_id: str, _=Depends(require_role(Role.VIEWER))):
    """Latest suite for a deployment — the suite builder opens pre-filled
    with the current cases instead of an empty editor."""
    suites = get_store().suites_for_deployment(deployment_id)
    if not suites:
        raise HTTPException(status_code=404, detail=f"No suite exists for deployment {deployment_id}")
    return suites[0]


@router.get("/apps/{deployment_id}/suites")
async def list_suites(deployment_id: str, _=Depends(require_role(Role.VIEWER))):
    """All suite versions for a deployment, newest first — the first entry is
    what Run Evaluation will use.

    A deployment with no suites is an empty collection: 200 and `[]`, never a
    404. The sibling GET /apps/{id}/suite asks for one named resource, so that
    one does 404."""
    return [
        {"id": s.get("id"), "name": s.get("name"), "createdAt": s.get("createdAt"),
         "caseCount": len(s.get("cases") or [])}
        for s in get_store().suites_for_deployment(deployment_id)
    ]


@router.delete("/runs/{run_id}")
def delete_run(run_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Delete a run record — operator cleanup for runs whose scores are known
    garbage (e.g. judged a crashed agent's error output). Suites and other
    runs are untouched."""
    if not get_store().delete_run(run_id):
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return {"deleted": run_id}


@router.delete("/suites/{suite_id}")
async def delete_suite(suite_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Delete a suite version — failed authoring iterations shouldn't linger.
    Deleting the current suite promotes the next-newest; completed runs are
    untouched (they carry their own copy of the suite's name and cases)."""
    if not get_store().delete_suite(suite_id):
        raise HTTPException(status_code=404, detail=f"Suite {suite_id} not found")
    return {"deleted": suite_id}


@router.get("/runs/{run_id}", response_model=EvalRun)
async def get_run(run_id: str, _=Depends(require_role(Role.VIEWER))):
    run = get_store().get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    run = _reconcile(run)
    return EvalRun(**{k: v for k, v in run.items() if k in EvalRun.model_fields})


@router.post("/suites", status_code=201)
async def create_suite(req: SuiteCreateRequest, _=Depends(require_role(Role.OPERATOR))):
    unknown = [e.id for e in req.evaluators if e.id not in EVALUATORS_BY_ID]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown evaluators: {unknown}")
    suite = {
        "id": f"suite-{uuid.uuid4().hex[:10]}",
        "name": req.name,
        "target_deployment_id": req.target_deployment_id,
        "cases": req.cases,
        "evaluators": [e.model_dump() for e in req.evaluators],
        "latency_sla_ms": req.latency_sla_ms,
        "cost_budget_usd": req.cost_budget_usd,
        "repeats": req.repeats,
        "createdAt": _now(),
    }
    get_store().save_suite(suite)
    return {"suiteId": suite["id"]}


@router.post("/runs", status_code=202)
async def start_run(req: RunCreateRequest, _=Depends(require_role(Role.OPERATOR))):
    store = get_store()
    suites = store.suites_for_deployment(req.deployment_id)
    suite = store.get_suite(req.suite_id) if req.suite_id else (suites[0] if suites else None)
    if not suite or not suite.get("cases"):
        raise HTTPException(status_code=422, detail="No evaluation suite with test cases exists for this deployment — create one first")

    dep = next((d for d in _deployed_apps() if d["deploymentId"] == req.deployment_id), None)

    # Validate EVERYTHING before persisting the run — a 422 after the save
    # would strand a permanent 'running' record with no worker behind it.
    configured = suite.get("evaluators", [])
    enabled_list = [e["id"] for e in configured if e.get("enabled", True)]
    if configured and not enabled_list:
        raise HTTPException(status_code=422, detail="All evaluators are disabled in this suite")
    enabled = enabled_list or None
    thresholds = {e["id"]: float(e["threshold"]) for e in configured}
    invoker = (
        AgentCoreInvoker(
            dep["runtimeArn"], settings.AWS_REGION,
            guardrail_id=dep.get("guardrailId") or None,
            guardrail_version=dep.get("guardrailVersion") or "DRAFT",
        )
        if dep and dep.get("runtimeArn")
        else None
    )
    if invoker is None and not all(c.get("agentResponse") for c in suite["cases"]):
        if dep and dep.get("isWebApp"):
            raise HTTPException(status_code=422, detail=(
                "This deployment has no AgentCore runtime to invoke (web application or supporting service) — live "
                "invocation does not apply. To evaluate its outputs anyway, add cases with recorded "
                "agentResponse values (judge-only mode)."))
        raise HTTPException(status_code=422, detail="Deployment has no runtime ARN and the suite cases carry no canned responses — nothing to evaluate")

    prior = store.runs_for_deployment(req.deployment_id)
    app_name = (
        req.app_name
        or (dep or {}).get("name")
        or (prior[0].get("appName") if prior else None)
        or req.deployment_id
    )
    run_id = new_run_id()
    run = {
        "id": run_id, "deploymentId": req.deployment_id,
        "appName": app_name,
        "suiteName": suite["name"], "suiteId": suite["id"],
        "judgeModel": JUDGE_MODEL_ID,
        "startedAt": _now(), "status": "running",
        "results": [], "cases": [],
    }
    store.save_run(run)

    def _execute():
        done_cases: list = []

        def _step(note: str):
            # Persist live progress so the UI can show what is being judged
            # right now, plus every case completed so far.
            store.save_run({**run, "cases": list(done_cases), "progressNote": note})
            _publish(run_id, {"type": "update"})

        def _case_done(case: dict):
            done_cases.append(case)
            _step(f"Completed case {len(done_cases)}/{len(suite['cases'])}")

        try:
            outcome = evaluate_cases(
                cases=suite["cases"], region=settings.AWS_REGION,
                evaluator_ids=enabled, thresholds=thresholds, invoker=invoker,
                latency_sla_ms=float(suite.get("latency_sla_ms") or 8000),
                cost_budget_usd=float(suite.get("cost_budget_usd") or 0.10),
                repeats=int(suite.get("repeats") or 1),
                on_progress=_case_done, on_step=_step,
            )
            store.save_run({**run, **outcome, "status": "completed", "progressNote": None})
        except Exception as exc:
            logger.exception("evaluation run %s failed", run_id)
            store.save_run({**run, "status": "failed", "error": str(exc)})
        finally:
            _publish(run_id, {"type": "done"})

    threading.Thread(target=_execute, daemon=True, name=f"eval-{run_id}").start()
    return {"runId": run_id}


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str, token: Optional[str] = None):
    """Server-sent events for a live run — each event tells the client to
    refetch; the stream ends when the run reaches a terminal state.

    Auth: EventSource cannot send headers, so the JWT rides a query param and
    is validated here (dev-auth mode skips validation like every other route).
    The generator is async and drains a thread-fed queue non-blockingly — a
    sync generator would pin one AnyIO threadpool token per open stream for
    the run's whole lifetime, exhausting the pool at ~40 viewers."""
    from core.rbac import _decode_jwt, _is_dev_auth_allowed

    if not _is_dev_auth_allowed():
        if not token:
            raise HTTPException(status_code=401, detail="Missing authorization token")
        try:
            _decode_jwt(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    store = get_store()
    if not store.get_run(run_id):
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    q: "queue_mod.Queue" = queue_mod.Queue()
    with _subs_lock:
        _subscribers.setdefault(run_id, []).append(q)

    async def gen():
        import asyncio

        from starlette.concurrency import run_in_threadpool

        idle_ticks = 0
        try:
            yield 'retry: 3000\n\ndata: {"type": "update"}\n\n'
            while True:
                try:
                    ev = q.get_nowait()
                except queue_mod.Empty:
                    idle_ticks += 1
                    if idle_ticks >= 10:  # ~10s idle → check terminal state
                        idle_ticks = 0
                        run = await run_in_threadpool(store.get_run, run_id)
                        if not run or run.get("status") != "running":
                            yield 'data: {"type": "done"}\n\n'
                            break
                        yield ": keepalive\n\n"
                    await asyncio.sleep(1)
                    continue
                idle_ticks = 0
                yield f"data: {json.dumps(ev)}\n\n"
                if ev.get("type") == "done":
                    break
        finally:
            with _subs_lock:
                try:
                    _subscribers.get(run_id, []).remove(q)
                except ValueError:
                    pass

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


_BADGE_COLORS = {"autonomy-eligible": "#059669", "conditional": "#d97706", "blocked": "#dc2626"}


def _badge_svg(label: str, value: str, color: str) -> str:
    lw, vw = int(len(label) * 6.3) + 14, int(len(value) * 6.3) + 14
    w = lw + vw
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="20" role="img" aria-label="{label}: {value}">'
        f'<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/>'
        f'<stop offset="1" stop-opacity=".1"/></linearGradient>'
        f'<clipPath id="r"><rect width="{w}" height="20" rx="3" fill="#fff"/></clipPath>'
        f'<g clip-path="url(#r)"><rect width="{lw}" height="20" fill="#555"/>'
        f'<rect x="{lw}" width="{vw}" height="20" fill="{color}"/>'
        f'<rect width="{w}" height="20" fill="url(#s)"/></g>'
        f'<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">'
        f'<text x="{lw / 2}" y="14">{label}</text>'
        f'<text x="{lw + vw / 2}" y="14">{value}</text></g></svg>'
    )


@router.get("/apps/{deployment_id}/badge.svg")
async def evaluation_badge(deployment_id: str):
    """CI-style status badge — embeddable anywhere an <img> works, so no auth
    (it reveals only the verdict and score, same as the fleet page)."""
    runs = [r for r in get_store().runs_for_deployment(deployment_id) if r.get("status") == "completed"]
    if runs:
        verdict = str(runs[0].get("verdict", "conditional"))
        value = f"{verdict} · {runs[0].get('overallScore')}%"
        color = _BADGE_COLORS.get(verdict, "#64748b")
    else:
        value, color = "not evaluated", "#64748b"
    return Response(_badge_svg("evaluation", value, color), media_type="image/svg+xml",
                    headers={"Cache-Control": "no-cache, max-age=300"})


@router.post("/compare/pairwise")
def compare_pairwise(req: PairwiseRequest, _=Depends(require_role(Role.OPERATOR))):
    """Head-to-head battles between two runs' answers, position-bias
    cancelled by order swapping. Battles take minutes (dozens of judge
    calls) while API Gateway caps requests at ~29s, so they run in a worker
    thread: this returns {"status": "generating"} immediately and the client
    re-POSTs until the cached result appears. Cached per run pair — answers
    are immutable once a run completes. A 'generating' marker older than 10
    minutes is a stranded worker (restart) and is retaken."""
    store = get_store()
    cached = store.get_pairwise(req.run_id_a, req.run_id_b)
    if cached and cached.get("battles"):
        return {k: v for k, v in cached.items() if k not in ("pk", "updatedAt")}
    if cached and cached.get("status") == "failed":
        store.save_pairwise(req.run_id_a, req.run_id_b, {"status": "retrying", "startedAt": _now()})
        cached = None  # fall through and retake
    if cached and cached.get("status") in ("generating", "retrying"):
        try:
            started = datetime.strptime(cached.get("startedAt", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - started).total_seconds() < 600:
                return {"status": "generating"}
        except ValueError:
            pass
    run_a, run_b = store.get_run(req.run_id_a), store.get_run(req.run_id_b)
    if not run_a or not run_b:
        raise HTTPException(status_code=404, detail="One or both runs not found")
    if run_a.get("status") != "completed" or run_b.get("status") != "completed":
        raise HTTPException(status_code=422, detail="Both runs must be completed")
    store.save_pairwise(req.run_id_a, req.run_id_b, {"status": "generating", "startedAt": _now()})

    def _battle():
        try:
            result = pairwise_compare(run_a, run_b, settings.AWS_REGION)
            if not result["battles"]:
                store.save_pairwise(req.run_id_a, req.run_id_b,
                                    {"status": "failed",
                                     "error": "The runs share no cases with stored answers to battle"})
                return
            store.save_pairwise(req.run_id_a, req.run_id_b, result)
        except Exception as exc:
            logger.exception("pairwise battle failed")
            store.save_pairwise(req.run_id_a, req.run_id_b, {"status": "failed", "error": str(exc)})

    threading.Thread(target=_battle, daemon=True, name="pairwise").start()
    return {"status": "generating"}


@router.get("/runs/{run_id}/report")
async def export_report(run_id: str, format: str = "md", _=Depends(require_role(Role.VIEWER))):
    """Self-contained evaluation report — the model-risk-management artifact
    for this run. format=html renders a print-styled page (browser Print →
    Save as PDF is the PDF pipeline)."""
    run = get_store().get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    md = build_report(run)
    if format == "html":
        return Response(to_html(md, f"Evaluation report — {run.get('appName')}"), media_type="text/html")
    return PlainTextResponse(
        md, media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="evaluation-{run_id}.md"'},
    )


@router.get("/compare/report")
async def export_compare_report(a: str, b: str, format: str = "md", _=Depends(require_role(Role.VIEWER))):
    """A/B comparison report for two runs. Includes the head-to-head battle
    section when one has been run for this pair (it is never auto-run here —
    that is dozens of judge calls the reader should trigger deliberately)."""
    store = get_store()
    run_a, run_b = store.get_run(a), store.get_run(b)
    if not run_a or not run_b:
        raise HTTPException(status_code=404, detail="One or both runs not found")
    md = build_compare_report(run_a, run_b, store.get_pairwise(a, b))
    if format == "html":
        return Response(to_html(md, f"A/B report — {run_b.get('appName')} vs {run_a.get('appName')}"),
                        media_type="text/html")
    return PlainTextResponse(
        md, media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="ab-report-{a}-vs-{b}.md"'},
    )


@router.post("/judge-calibration")
def judge_calibration(_=Depends(require_role(Role.OPERATOR))):
    """Meta-evaluation: run the judge against answers with KNOWN defects and
    report agreement. Run after any rubric or judge-model change."""
    return run_calibration(settings.AWS_REGION)


@router.post("/apps/{deployment_id}/enroll", status_code=201)
def enroll_deployment(deployment_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Auto-enrollment: draft a suite scaffold for a deployment that has none,
    from the foundry registry plus an advisory model pass. Never overwrites a
    curated suite."""
    store = get_store()
    if store.suites_for_deployment(deployment_id):
        raise HTTPException(status_code=409, detail="Deployment already has a suite — edit it in the suite builder")
    dep = next((d for d in _deployed_apps() if d["deploymentId"] == deployment_id), None)
    if not dep:
        raise HTTPException(status_code=404, detail=f"No deployment {deployment_id}")
    try:
        suite = draft_suite_for_deployment(dep, settings.AWS_REGION)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    store.save_suite(suite)
    return {"suiteId": suite["id"], "caseCount": len(suite["cases"]), "draft": True}


@router.post("/runs/{run_id}/recommendations")
async def generate_recommendations(run_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Optimization advice for a completed run — synthesized from the failing
    judge verdicts, cached on the run record. This is the 'optimize' step of
    the evaluate → optimize → A/B loop."""
    store = get_store()
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if run.get("status") != "completed":
        raise HTTPException(status_code=422, detail="Recommendations require a completed run")
    if run.get("recommendations"):
        return {"recommendations": run["recommendations"]}
    # Generation takes 30-60s but API Gateway caps integrations at ~29s, so
    # it runs in a worker thread; the client polls GET /runs/{id} and the
    # recommendations appear on the run record. A 'generating' lock older
    # than 3 minutes is stale (restart mid-generation) and is retaken.
    if run.get("recommendationsStatus") == "generating":
        try:
            started = datetime.strptime(run.get("recommendationsStartedAt", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - started).total_seconds() < 180:
                return {"status": "generating"}
        except ValueError:
            pass
    store.save_run({**run, "recommendationsStatus": "generating",
                    "recommendationsStartedAt": _now(), "recommendationsError": None})

    def _generate():
        try:
            recs = recommend_optimizations(run=run, region=settings.AWS_REGION)
            store.save_run({**run, "recommendations": recs,
                            "recommendationsStatus": None, "recommendationsError": None})
        except Exception as exc:
            logger.exception("recommendations failed for %s", run_id)
            store.save_run({**run, "recommendationsStatus": None, "recommendationsError": str(exc)})

    threading.Thread(target=_generate, daemon=True, name=f"recs-{run_id}").start()
    return {"status": "generating"}


@router.post("/judge-preview")
def judge_preview(case: JudgePreviewCase, _=Depends(require_role(Role.OPERATOR))):
    """Judge-only mode: score one provided (input, response) pair live via
    Bedrock, no deployed agent required. This is the 'the judge is real'
    demo endpoint."""
    evaluator_ids: Optional[List[str]] = case.evaluatorIds
    if evaluator_ids:
        unknown = [e for e in evaluator_ids if e not in EVALUATORS_BY_ID]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown evaluators: {unknown}")
    else:
        evaluator_ids = [e for e, spec in EVALUATORS_BY_ID.items() if spec.kind == "judge"]
    outcome = evaluate_cases(
        cases=[{"input": case.input, "expectedBehavior": case.expectedBehavior, "agentResponse": case.agentResponse}],
        region=settings.AWS_REGION, evaluator_ids=evaluator_ids,
    )
    return outcome
