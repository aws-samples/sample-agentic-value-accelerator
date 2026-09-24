"""GET /evaluations/apps: an empty account is 200 + [], not 404.

The route used to raise 404 when an account had no successful deployments and no
evaluation runs, and the module docstring documented that as deliberate. It is a
status-code error either way: 404 on a COLLECTION says "this route does not
exist", so every client - browser fetch, curl, an SDK, a synthetic canary -
takes its error path over a read that in fact succeeded and honestly found
nothing. Emptiness is a fact about the account, not about the route.

What these tests pin, in both directions:

* the empty case is 200 with a JSON array of length 0;
* the populated case is unchanged - deployments with no runs, deployments with
  runs, and the lastRun/history/status projection all still come back;
* the SINGLE-ITEM routes still 404. That is the load-bearing negative: the fix
  must not turn "no such deployment" into a 200, and GET /apps/{id} 404s by
  scanning the very list that just changed shape, so it is the one most likely
  to regress. Covered for both a populated and an empty account.
* GET /apps/{id}/suites (collection, 200 + []) versus GET /apps/{id}/suite
  (single item, 404) - the sibling pair that shows the distinction is drawn on
  collection-vs-item and not on emptiness;
* a FAILED inventory read is still 503. "Empty" and "I could not tell" are
  different answers, and an expired-credential backend must not be able to
  report itself as an empty account.

The router is mounted on a bare FastAPI app rather than the real app factory:
the subject is this module's status codes, and the factory would drag in the
full settings/middleware chain for no added coverage. RBAC is satisfied by
patching core.rbac._extract_role, which keeps the test independent of whatever
USE_DEV_AUTH/ENVIRONMENT happen to be set to.
"""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import api.routes.evaluations as route
import core.rbac as rbac


class _Store:
    """The slice of EvaluationStore that these routes touch."""

    def __init__(self, runs=None, suites=None):
        self._runs = list(runs or [])
        self._suites = list(suites or [])

    def all_runs(self):
        return sorted(self._runs, key=lambda r: r.get("startedAt", ""), reverse=True)

    def get_run(self, run_id):
        return next((r for r in self._runs if r.get("id") == run_id), None)

    def save_run(self, run):  # pragma: no cover - only a stale 'running' run writes
        self._runs = [r for r in self._runs if r.get("id") != run.get("id")] + [run]

    def suites_for_deployment(self, deployment_id):
        return [s for s in self._suites if s.get("target_deployment_id") == deployment_id]


def _run(run_id, deployment_id, app_name, started="2026-09-01T00:00:00Z", status="completed"):
    return {
        "id": run_id,
        "deploymentId": deployment_id,
        "appName": app_name,
        "startedAt": started,
        "status": status,
        "overallScore": 91.0,
        "hardGatesPassed": 3,
        "hardGatesTotal": 3,
        "evaluatorsPassed": 5,
        "evaluatorsTotal": 6,
        "verdict": "autonomy-eligible",
    }


def _deployment(deployment_id, name, framework="strands"):
    return {
        "deploymentId": deployment_id,
        "name": name,
        "framework": framework,
        "runtimeArn": f"arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/{deployment_id}",
        "guardrailId": "",
        "guardrailVersion": "DRAFT",
    }


@pytest.fixture
def client(monkeypatch):
    """A TestClient plus a setter for the two things list_apps reads.

    Returns (client, install) where install(deployments=..., runs=..., suites=...)
    swaps both sources. _deployed_apps is patched at the module level, which also
    keeps its 15s inventory cache out of the test.
    """
    monkeypatch.setattr(rbac, "_extract_role", lambda request: rbac.Role.ADMIN)

    app = FastAPI()
    app.include_router(route.router)

    state = {"deployments": [], "store": _Store()}
    monkeypatch.setattr(route, "_deployed_apps", lambda: list(state["deployments"]))
    monkeypatch.setattr(route, "get_store", lambda: state["store"])

    def install(deployments=None, runs=None, suites=None):
        state["deployments"] = list(deployments or [])
        state["store"] = _Store(runs=runs, suites=suites)

    return TestClient(app), install


# --- the collection --------------------------------------------------------

def test_empty_account_returns_200_and_empty_list(client):
    """No deployments, no runs: a successful read that found nothing."""
    c, install = client
    install(deployments=[], runs=[])

    res = c.get("/evaluations/apps")

    assert res.status_code == 200, res.text
    assert res.json() == []


def test_populated_account_still_returns_apps(client):
    """A deployment with no runs and a run-only deployment both survive, with
    the lastRun/history/status projection intact."""
    c, install = client
    install(
        deployments=[_deployment("dep-1", "Loan Advisor")],
        runs=[
            _run("run-2", "dep-1", "Loan Advisor", started="2026-09-02T00:00:00Z"),
            _run("run-1", "dep-1", "Loan Advisor", started="2026-09-01T00:00:00Z"),
            _run("run-3", "dep-gone", "Retired Agent", started="2026-08-01T00:00:00Z"),
        ],
    )

    res = c.get("/evaluations/apps")

    assert res.status_code == 200, res.text
    apps = {a["deploymentId"]: a for a in res.json()}
    assert set(apps) == {"dep-1", "dep-gone"}

    dep1 = apps["dep-1"]
    assert dep1["name"] == "Loan Advisor"
    assert dep1["framework"] == "strands"
    assert dep1["status"] == "evaluated"
    # all_runs sorts newest first, and lastRun is the first one seen.
    assert dep1["lastRun"]["id"] == "run-2"
    assert [h["id"] for h in dep1["history"]] == ["run-2", "run-1"]

    # A deployment that only exists in run history is still evaluable.
    assert apps["dep-gone"]["name"] == "Retired Agent"
    assert apps["dep-gone"]["lastRun"]["id"] == "run-3"


def test_deployment_without_runs_is_never_evaluated(client):
    """The empty-collection fix must not disturb the per-app default status."""
    c, install = client
    install(deployments=[_deployment("dep-1", "Loan Advisor")], runs=[])

    body = c.get("/evaluations/apps").json()

    assert len(body) == 1
    assert body[0]["status"] == "never-evaluated"
    assert body[0]["lastRun"] is None
    assert body[0]["history"] == []


# --- the single-item routes must still 404 ---------------------------------

def test_single_app_route_404s_for_unknown_id_when_populated(client):
    c, install = client
    install(deployments=[_deployment("dep-1", "Loan Advisor")], runs=[])

    res = c.get("/evaluations/apps/dep-nope")

    assert res.status_code == 404, res.text
    assert "dep-nope" in res.json()["detail"]


def test_single_app_route_404s_for_unknown_id_when_account_is_empty(client):
    """The fix turns the collection into [], and get_app scans that list - so
    an empty account must still produce a per-id 404, not a 200."""
    c, install = client
    install(deployments=[], runs=[])

    res = c.get("/evaluations/apps/dep-nope")

    assert res.status_code == 404, res.text
    assert "dep-nope" in res.json()["detail"]


def test_single_app_route_returns_the_named_app(client):
    c, install = client
    install(deployments=[_deployment("dep-1", "Loan Advisor")], runs=[])

    res = c.get("/evaluations/apps/dep-1")

    assert res.status_code == 200, res.text
    assert res.json()["deploymentId"] == "dep-1"


# --- the sibling pair: suites (collection) vs suite (item) -----------------

def test_suites_collection_is_200_and_empty(client):
    c, install = client
    install(deployments=[_deployment("dep-1", "Loan Advisor")], runs=[], suites=[])

    res = c.get("/evaluations/apps/dep-1/suites")

    assert res.status_code == 200, res.text
    assert res.json() == []


def test_current_suite_item_route_404s_when_absent(client):
    c, install = client
    install(deployments=[_deployment("dep-1", "Loan Advisor")], runs=[], suites=[])

    res = c.get("/evaluations/apps/dep-1/suite")

    assert res.status_code == 404, res.text
    assert "dep-1" in res.json()["detail"]


def test_suites_collection_returns_versions_when_present(client):
    c, install = client
    install(
        deployments=[_deployment("dep-1", "Loan Advisor")],
        runs=[],
        suites=[{"id": "suite-a", "name": "v1", "createdAt": "2026-09-01T00:00:00Z",
                 "target_deployment_id": "dep-1", "cases": [{"input": "hi"}]}],
    )

    res = c.get("/evaluations/apps/dep-1/suites")

    assert res.status_code == 200, res.text
    assert res.json() == [{"id": "suite-a", "name": "v1",
                           "createdAt": "2026-09-01T00:00:00Z", "caseCount": 1}]


# --- a failed read is not an empty read ------------------------------------

def test_inventory_failure_is_503_not_an_empty_collection(client, monkeypatch):
    """Expired credentials must not be reportable as "you have no agents".

    `monkeypatch` here is the same function-scoped instance the client fixture
    used, so this overrides its patch and is undone with it.
    """
    c, install = client
    install(deployments=[], runs=[])

    def _boom():
        raise HTTPException(status_code=503, detail="Deployments inventory unreachable")

    monkeypatch.setattr(route, "_deployed_apps", _boom)
    res = c.get("/evaluations/apps")

    assert res.status_code == 503, res.text
    assert res.json()["detail"].startswith("Deployments inventory unreachable")
