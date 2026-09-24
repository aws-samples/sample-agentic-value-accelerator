"""The last three `urlopen` call sites, and the two different fixes they needed.

They look alike and are not:

  * core/cache_prewarm.py calls THIS app on its own loopback port. The public-address
    check would refuse that, correctly, so it needs `fetch_internal`. The test that
    matters here is the negative one: `fetch` really does refuse the same URL, which is
    why the choice is not interchangeable.
  * services/govern_operations_service.py calls api.pagerduty.com with
    `Authorization: Token token=<key>`. urllib's redirect handler keeps that header
    across a host change, so a 302 replays the PagerDuty token to the host named in it.
  * api/routes/frontier_agents.py calls signin.aws.amazon.com with the temporary session
    credentials in the QUERY STRING. Dropping Authorization cannot help when the secret
    is in the URL, so the only safe redirect count is zero.

The frontier_agents and PagerDuty error paths are tested for what they do NOT say. Both
used to interpolate the exception into text that reaches a reader, and a refusal that
names the target it refused to reach is a port scan with extra steps.

frontier_agents' /deploy arms are in the same file and the same class of leak, so they are
covered here too. They are the slower version of it: the exception never entered the 500
body, but `error_message=str(e)` parked it on the deployment record, and
GET /deployments/{id}/status hands that field straight back to a VIEWER. The tests below
assert the stored field as well as the response, because fixing only the response leaves
the disclosure intact one GET later.

Two of the tests below pin behaviour the conversion had to PRESERVE rather than behaviour
it introduced, and they pass against the pre-conversion code too. That is what a
regression guard is for, but it is not coverage of the conversion, so they are labelled
as such instead of being counted twice.
"""

import asyncio
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Any, Dict, List, Optional, Tuple

import pytest

import boto3
from fastapi import HTTPException

from api.routes import frontier_agents
from core import cache_prewarm, safe_fetch
from core.safe_fetch import SafeFetchError
from core.ttl_cache import clear_all
from models.deployment import Deployment, DeploymentStatus
from services.govern_operations_service import GovernOperationsService


@pytest.fixture(autouse=True)
def _no_cross_test_cache():
    """The Govern TTL cache is module-level; a neighbouring test's entry would answer for
    a call this file expects to make."""
    clear_all()
    yield
    clear_all()


# --- a real loopback server, so the prewarm tests mock nothing ------------------------


class _Recorder(BaseHTTPRequestHandler):
    """Records every request line and header, then answers per the class attributes."""

    seen: List[Tuple[str, Optional[str]]] = []
    redirect_to: Optional[str] = None
    status: int = 200

    def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler's naming
        type(self).seen.append((self.path, self.headers.get("X-Prewarm")))
        if type(self).redirect_to:
            self.send_response(302)
            self.send_header("Location", type(self).redirect_to)
            self.end_headers()
            return
        payload = b'{"ok": true}'
        self.send_response(type(self).status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):  # keep pytest output readable
        pass


@pytest.fixture
def loopback_server():
    _Recorder.seen = []
    _Recorder.redirect_to = None
    _Recorder.status = 200
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Recorder)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", _Recorder
    finally:
        server.shutdown()
        server.server_close()


def test_prewarm_still_reaches_the_apps_own_loopback_port(loopback_server):
    """PRESERVED BEHAVIOUR, not new coverage: this passes against the pre-conversion
    urlopen version too. It is here because fetch_internal is only correct if it still
    warms anything, and "the sweep silently stopped warming" is invisible in production."""
    base, recorder = loopback_server

    cache_prewarm._warm_once(base)

    paths = [path for path, _hdr in recorder.seen]
    assert len(paths) == len(cache_prewarm._ENDPOINTS)
    for ep in cache_prewarm._ENDPOINTS:
        assert f"/api/v1/{ep}" in paths
    # X-Prewarm marks these in access logs and nothing more: grep the backend and its only
    # hits are in cache_prewarm.py, so no route or middleware reads it. It is asserted
    # because losing it makes prewarm traffic indistinguishable from user traffic.
    assert {hdr for _path, hdr in recorder.seen} == {"1"}


def test_the_public_fetch_would_have_refused_that_same_url(loopback_server):
    """Documents safe_fetch's own rule rather than a reviewed line: `fetch` refuses
    loopback, so "harden it by using fetch everywhere" would silently disable
    pre-warming. It is the reason the two helpers are not interchangeable here."""
    base, _recorder = loopback_server

    with pytest.raises(SafeFetchError) as exc:
        safe_fetch.fetch(f"{base}/api/v1/govern/security/posture", timeout=5)

    assert exc.value.reason == "blocked_loopback_address"


def test_prewarm_does_not_follow_a_redirect(loopback_server):
    """A prewarm response is discarded and the request carries no credential (X-Prewarm
    authorizes nothing), but a redirect is still a way to aim an unattended GET - one that
    in a development deployment runs under the dev-auth bypass, with a 120s timeout, 11
    times a sweep - at something other than the app it is meant to warm."""
    base, recorder = loopback_server
    recorder.redirect_to = "/api/v1/somewhere-else"

    cache_prewarm._warm_once(base)

    paths = [path for path, _hdr in recorder.seen]
    assert "/api/v1/somewhere-else" not in paths
    # Every endpoint was still attempted: one refusal must not abort the sweep.
    assert len(paths) == len(cache_prewarm._ENDPOINTS)


def test_prewarm_keeps_its_own_timeout(monkeypatch):
    """A timeout is mandatory on every call, and this one is sized for the ~60-90s cold
    region-discovery scan; the safe_fetch default of 10s would time out every sweep."""
    calls: List[Dict[str, Any]] = []

    def _recording_fetch_internal(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return safe_fetch.SafeResponse(status=200, body=b"{}", final_url=url)

    monkeypatch.setattr(safe_fetch, "fetch_internal", _recording_fetch_internal)

    cache_prewarm._warm_once("http://127.0.0.1:8000")

    assert len(calls) == len(cache_prewarm._ENDPOINTS)
    assert {c["timeout"] for c in calls} == {cache_prewarm._PER_CALL_TIMEOUT_S}


# --- PagerDuty: the Authorization header must not be able to reach another host -------


class _EmptyTable:
    """A readable partition with nothing in it - a measurement, not a failure."""

    def query(self, **kwargs) -> Dict[str, Any]:
        return {"Items": []}


def _ops_svc(monkeypatch, api_key: Optional[str] = "pd-test-key") -> GovernOperationsService:
    svc = GovernOperationsService(
        table_name="ops-table", region="us-east-2", pagerduty_api_key=api_key
    )
    monkeypatch.setattr(svc, "_get_table", lambda: _EmptyTable())
    return svc


def test_pagerduty_oncall_goes_through_safe_fetch_with_the_token_and_a_timeout(monkeypatch):
    captured: Dict[str, Any] = {}

    def _fake_fetch_json(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return {
            "oncalls": [
                {
                    "user": {"id": "PU1", "name": "Ada", "email": "ada@example.com"},
                    "escalation_level": 1,
                    "schedule": {"summary": "Primary"},
                    "end": "2026-09-16T17:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(safe_fetch, "fetch_json", _fake_fetch_json)
    svc = _ops_svc(monkeypatch)

    resp = svc._fetch_pagerduty_oncall()

    assert captured["url"] == "https://api.pagerduty.com/oncalls?time_zone=UTC"
    assert captured["headers"]["Authorization"] == "Token token=pd-test-key"
    assert captured["timeout"] == 10
    assert resp.live is True and resp.source == "pagerduty"
    assert resp.primary.name == "Ada"
    assert resp.schedule_name == "Primary"


def test_a_refused_pagerduty_fetch_falls_back_without_naming_the_target(monkeypatch):
    """The fall-through still discloses that this is the stored rota, and still does not
    hand the caller the resolved address of the host safe_fetch just refused."""
    calls: List[str] = []

    def _refuse(url, **kwargs):
        calls.append(url)
        raise SafeFetchError(
            "blocked_link_local_address", "host=api.pagerduty.com resolved=169.254.169.254"
        )

    monkeypatch.setattr(safe_fetch, "fetch_json", _refuse)
    svc = _ops_svc(monkeypatch)

    resp = svc._fetch_current_oncall()

    # Assert the refusal actually came through the converted seam. Without this the test
    # passes against the urlopen version too: that one ignores the monkeypatch, really
    # calls PagerDuty, gets a 401 for the fake key, and lands on the same caveat text.
    assert calls == ["https://api.pagerduty.com/oncalls?time_zone=UTC"]
    assert resp.source == "dynamodb"
    assert "PagerDuty is configured but did not answer" in resp.note
    assert "169.254" not in resp.note
    assert "blocked_link_local_address" not in resp.note


def test_pagerduty_is_only_called_when_a_key_is_configured(monkeypatch):
    """PRESERVED BEHAVIOUR, not new coverage: with no key neither version makes an
    outbound call, so this passes pre-conversion too. Worth pinning because the note is
    what tells a reader which of the two silent states they are looking at."""

    def _explode(url, **kwargs):
        raise AssertionError("no PagerDuty call may be made without a key")

    monkeypatch.setattr(safe_fetch, "fetch_json", _explode)
    svc = _ops_svc(monkeypatch, api_key=None)
    monkeypatch.delenv("PAGERDUTY_API_KEY", raising=False)
    svc.pagerduty_api_key = None

    resp = svc._fetch_current_oncall()

    assert "PAGERDUTY_API_KEY" in resp.note


# --- Console federation: the credential is in the URL, so no redirect is acceptable ---


class _FakeSTS:
    def assume_role(self, **kwargs):
        return {
            "Credentials": {
                "AccessKeyId": "fake-session-id",
                "SecretAccessKey": "fake-session-key",
                "SessionToken": "fake-session-token",
            }
        }


@pytest.fixture
def federation_env(monkeypatch):
    monkeypatch.setenv(
        "FRONTIER_AGENTS_FEDERATION_ROLE_ARN",
        "arn:aws:iam::000000000000:role/ava-federation",
    )
    monkeypatch.setenv("AWS_REGION", "us-east-2")
    monkeypatch.setattr(boto3, "client", lambda *a, **k: _FakeSTS())


def _federate(agent_id: str = "aws-devops"):
    req = frontier_agents.FrontierAgentFederateRequest(
        agent_id=agent_id, operator_app_url="https://app.example.com/space-1"
    )
    return asyncio.run(frontier_agents.federate_operator_app(req, None))


def test_signin_token_exchange_refuses_every_redirect(monkeypatch, federation_env):
    captured: Dict[str, Any] = {}

    def _fake_fetch_json(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return {"SigninToken": "signin-token-abc"}

    monkeypatch.setattr(safe_fetch, "fetch_json", _fake_fetch_json)

    resp = _federate()

    assert captured["url"].startswith("https://signin.aws.amazon.com/federation?")
    # The session credentials travel in the query string, so a followed 302 would replay
    # them to the host that asked for the redirect.
    assert captured["max_redirects"] == 0
    assert captured["timeout"] == 10
    assert "SigninToken=signin-token-abc" in resp.signin_url
    # The credentials went out as the Session parameter and must not come back in the URL
    # handed to the browser.
    assert "fake-session-key" not in resp.signin_url


def test_a_refused_token_exchange_returns_a_reason_not_the_target(monkeypatch, federation_env):
    def _refuse(url, **kwargs):
        raise SafeFetchError(
            "blocked_link_local_address", "host=signin.aws.amazon.com resolved=169.254.169.254"
        )

    monkeypatch.setattr(safe_fetch, "fetch_json", _refuse)

    with pytest.raises(HTTPException) as exc:
        _federate()

    detail = exc.value.detail
    assert exc.value.status_code == 500
    assert "blocked_link_local_address" in detail
    assert "169.254" not in detail
    assert "signin.aws.amazon.com" not in detail
    # safe_fetch refuses to honour SAFE_FETCH_ALLOWED_PRIVATE_CIDRS for link-local at all,
    # so pointing an operator at it here would send them to a dead end.
    assert "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" not in detail


def test_a_private_address_refusal_names_the_setting_that_would_permit_it(
    monkeypatch, federation_env
):
    """The refusal has to be actionable as well as quiet. "blocked_private_address" alone
    reads as a bug; an operator whose split-horizon DNS answers internally for this host
    cannot guess that the platform has a switch for exactly that case."""

    def _refuse(url, **kwargs):
        raise SafeFetchError(
            "blocked_private_address", "host=signin.aws.amazon.com resolved=10.11.12.13"
        )

    monkeypatch.setattr(safe_fetch, "fetch_json", _refuse)

    with pytest.raises(HTTPException) as exc:
        _federate()

    detail = exc.value.detail
    assert "SAFE_FETCH_ALLOWED_PRIVATE_CIDRS" in detail
    # Actionable still does not mean "here is the address we resolved".
    assert "10.11.12.13" not in detail
    assert "signin.aws.amazon.com" not in detail


def test_a_failed_assume_role_does_not_echo_the_account_or_the_role_arns(
    monkeypatch, federation_env
):
    """The echo one arm above the getSigninToken one, which the first pass missed.
    botocore's AccessDenied text names the account id, the calling task role and the
    federation role; an ADMIN caller's browser must not be handed all three."""

    class _DeniedSTS:
        def assume_role(self, **kwargs):
            raise RuntimeError(
                "An error occurred (AccessDenied) when calling the AssumeRole operation: "
                "User: arn:aws:sts::000000000000:assumed-role/ava-backend-task/6b21 is not "
                "authorized to perform: sts:AssumeRole on resource: "
                "arn:aws:iam::000000000000:role/ava-federation"
            )

    monkeypatch.setattr(boto3, "client", lambda *a, **k: _DeniedSTS())

    with pytest.raises(HTTPException) as exc:
        _federate()

    detail = exc.value.detail
    assert exc.value.status_code == 500
    assert "arn:aws" not in detail
    assert "000000000000" not in detail
    assert "AccessDenied" not in detail
    assert "ava-backend-task" not in detail
    # Still says which step failed and what to check, or the operator has nothing.
    assert "federation role" in detail
    assert "sts:AssumeRole" in detail


def test_a_missing_registry_does_not_echo_the_path_it_looked_in(monkeypatch):
    """Same class of echo, same file: a 500 that prints where the image keeps its files is
    reconnaissance, and the path is already in the log."""

    class _Settings:
        FRONTIER_AGENTS_REGISTRY_PATH = "/opt/ava/aaas/frontier_agents/registry.json"

    monkeypatch.setattr(frontier_agents, "_registry_cache", None)
    monkeypatch.setattr(frontier_agents, "settings", _Settings())

    with pytest.raises(HTTPException) as exc:
        frontier_agents._load_registry()

    detail = exc.value.detail
    assert exc.value.status_code == 500
    assert "/opt/ava" not in detail
    # The setting to fix is named; the value it currently holds is not.
    assert "FRONTIER_AGENTS_REGISTRY_PATH" in detail


def test_a_malformed_token_response_does_not_echo_the_exception(monkeypatch, federation_env):
    """The generic arm. `{e}` there used to carry whatever urllib had to say about a URL
    that contains live session credentials."""

    def _no_token(url, **kwargs):
        return {"Message": "Session expired"}

    monkeypatch.setattr(safe_fetch, "fetch_json", _no_token)

    with pytest.raises(HTTPException) as exc:
        _federate()

    assert exc.value.detail == "Could not obtain SigninToken"


def test_the_security_agent_deeplink_still_survives_the_conversion(monkeypatch, federation_env):
    """Preserved behaviour: aws-security federates to the console deeplink built from the
    operator app URL's last path segment, and returns no second tab."""

    monkeypatch.setattr(safe_fetch, "fetch_json", lambda url, **kw: {"SigninToken": "tok"})

    resp = _federate(agent_id="aws-security")

    assert "securityagent%2Fhome" in resp.signin_url
    assert "agent-spaces%2Fspace-1" in resp.signin_url
    assert resp.operator_app_url == ""


# --- /deploy: the leak that took an extra GET -----------------------------------------
#
# These three arms had no test at all. The IaC-directory one only ever echoed a path; the
# other two also wrote the botocore text onto the deployment record, which is a GET away
# from any VIEWER.

_BUCKET = "fsi-frontier-agents-aws-devops-0916120000"

# The shape botocore actually produces for a denied PutObject: the bucket, the account id
# and the calling task role, all in one string.
_S3_DENIED = (
    "An error occurred (AccessDenied) when calling the PutObject operation: "
    f"User: arn:aws:sts::000000000000:assumed-role/ava-backend-task/6b21 is not authorized "
    f"to perform: s3:PutObject on resource: arn:aws:s3:::{_BUCKET}/deployments/x.zip"
)

# StepFunctions quotes the state machine ARN back, which carries the account id.
_SFN_DENIED = (
    "An error occurred (AccessDeniedException) when calling the StartExecution operation: "
    "User: arn:aws:sts::000000000000:assumed-role/ava-backend-task/6b21 is not authorized "
    "to perform: states:StartExecution on resource: "
    "arn:aws:states:us-east-2:000000000000:stateMachine:ava-frontier-agents"
)

_SECRETS = (
    "arn:aws",
    "000000000000",
    "AccessDenied",
    "ava-backend-task",
    "not authorized",
    _BUCKET,
)


class _FakeDeploySvc:
    """Records what would be persisted, and applies it to the record like the real one.

    `update_status` assigning to `deployment.error_message` is the whole point: that
    attribute is what deployments.py returns as the `"error_message"` key of
    GET /deployments/{id}/status, so asserting it is asserting the read path.
    """

    def __init__(self):
        self.deployment: Optional[Deployment] = None
        self.updates: List[Dict[str, Any]] = []
        self.table = self

    def create_deployment(self, req, created_by: str = "system") -> Deployment:
        self.deployment = Deployment(
            deployment_name=req.deployment_name,
            template_id=req.template_id,
            iac_type=req.iac_type,
            framework_id=req.framework_id,
            aws_account="000000000000",
            aws_region=req.aws_region,
            s3_bucket=_BUCKET,
            parameters=req.parameters,
        )
        return self.deployment

    def update_status(self, deployment_id, new_status, message=None, s3_key=None,
                      error_message=None, outputs=None) -> Deployment:
        self.updates.append({"status": new_status, "error_message": error_message})
        if error_message:
            self.deployment.error_message = error_message
        self.deployment.status = new_status
        return self.deployment

    def _to_item(self, deployment) -> Dict[str, Any]:
        return {"pk": f"DEPLOY#{deployment.deployment_id}"}

    def put_item(self, **kwargs):  # self.table is self
        return {}


class _FakeSFN:
    def __init__(self, raises: Optional[str] = None):
        self.raises = raises

    def start_execution(self, **kwargs):
        if self.raises:
            raise RuntimeError(self.raises)
        return {"executionArn": "arn:aws:states:us-east-2:000000000000:execution:x:y"}


class _FakePipelineSvc:
    def __init__(self, raises: Optional[str] = None):
        self.sfn_client = _FakeSFN(raises)
        self.state_machine_arn = "arn:aws:states:us-east-2:000000000000:stateMachine:ava"


class _FakeS3:
    def __init__(self, raises: Optional[str] = None):
        self.raises = raises

    def put_object(self, **kwargs):
        if self.raises:
            raise RuntimeError(self.raises)
        return {}


@pytest.fixture
def deploy_env(monkeypatch, tmp_path):
    """A registry entry whose IaC directory really exists on disk under tmp_path."""
    iac_dir = tmp_path / "aaas" / "frontier_agents" / "devops" / "iac" / "terraform"
    iac_dir.mkdir(parents=True)
    (iac_dir / "main.tf").write_text('resource "null_resource" "x" {}\n')

    class _Settings:
        AWS_REGION = "us-east-2"
        FRONTIER_AGENTS_PATH = str(tmp_path / "aaas" / "frontier_agents")

    monkeypatch.setattr(frontier_agents, "settings", _Settings())
    monkeypatch.setattr(
        frontier_agents,
        "_registry_cache",
        {
            "agents": [
                {
                    "id": "aws-devops",
                    "supported_iac_types": ["terraform"],
                    "iac_path": "frontier_agents/devops/iac",
                }
            ]
        },
    )
    svc = _FakeDeploySvc()
    monkeypatch.setattr(frontier_agents, "_get_deploy_svc", lambda: svc)
    return svc, tmp_path


def _deploy():
    req = frontier_agents.FrontierAgentDeployRequest(
        deployment_name="devops-1", agent_id="aws-devops", iac_type="terraform",
        aws_region="us-east-2",
    )
    return asyncio.run(frontier_agents.deploy_frontier_agent(req, None))


def _error_ref(text: str) -> str:
    match = re.search(r"error_ref=([0-9a-f]{12})\b", text)
    assert match, f"no error_ref in {text!r}"
    return match.group(1)


def test_a_missing_iac_directory_does_not_echo_the_path_it_resolved(monkeypatch, tmp_path):
    """Third echo of the same class in this file, and the one with no test. The resolved
    directory is where the image keeps its files; agent_id and iac_type came from the
    caller and were validated against the registry, so naming those back is not a leak.

    The image root carries a token rather than being spelled as a literal path: the first
    version of this test asserted `"/opt/ava" not in detail` and could not fail on
    Windows, where Path renders the same directory with backslashes. A token survives
    either separator, so it trips on any rendering of the path.
    """
    image_root = tmp_path / "ava-image-root-9f3c" / "frontier_agents"

    class _Settings:
        AWS_REGION = "us-east-2"
        FRONTIER_AGENTS_PATH = str(image_root)

    monkeypatch.setattr(frontier_agents, "settings", _Settings())
    monkeypatch.setattr(
        frontier_agents,
        "_registry_cache",
        {"agents": [{"id": "aws-devops", "supported_iac_types": ["terraform"],
                     "iac_path": "frontier_agents/devops/iac"}]},
    )
    # No deploy service is reachable from here, and that is the assertion: this arm must
    # refuse before create_deployment mints a bucket.
    monkeypatch.setattr(
        frontier_agents, "_get_deploy_svc",
        lambda: pytest.fail("no deployment record may be created for a missing IaC dir"),
    )

    with pytest.raises(HTTPException) as exc:
        _deploy()

    detail = exc.value.detail
    assert exc.value.status_code == 500
    assert "ava-image-root-9f3c" not in detail
    assert str(tmp_path) not in detail
    assert str(image_root.parent / "frontier_agents/devops/iac" / "terraform") not in detail
    # Still says which agent/IaC combination is unavailable, or the caller cannot tell a
    # packaging gap from an outage.
    assert "terraform" in detail and "aws-devops" in detail


def test_packaging_failure_keeps_the_botocore_text_off_the_deployment_record(
    monkeypatch, deploy_env
):
    """The confirmed residual. The first pass took the botocore text out of the 500 body
    and left `error_message=str(e)` on the record, which GET /deployments/{id}/status
    returns to any VIEWER - the same disclosure, one GET later."""
    svc, _tmp = deploy_env
    monkeypatch.setattr(boto3, "client", lambda *a, **k: _FakeS3(raises=_S3_DENIED))

    with pytest.raises(HTTPException) as exc:
        _deploy()

    detail = exc.value.detail
    assert exc.value.status_code == 500
    stored = svc.deployment.error_message
    assert svc.updates and svc.updates[-1]["status"] == DeploymentStatus.FAILED
    for secret in _SECRETS:
        assert secret not in detail, f"{secret!r} reached the response body"
        assert secret not in stored, f"{secret!r} reached the deployment record"
    # An operator gets the stage and a handle into the logger.exception traceback, and the
    # record and the body agree on that handle.
    assert "Packaging the agent's IaC failed" in stored
    assert _error_ref(stored) == _error_ref(detail)


def test_pipeline_start_failure_keeps_the_state_machine_arn_off_the_record(
    monkeypatch, deploy_env
):
    """Second arm, same leak: StartExecution's AccessDenied text carries the state machine
    ARN and therefore the account id."""
    svc, _tmp = deploy_env
    monkeypatch.setattr(boto3, "client", lambda *a, **k: _FakeS3())
    monkeypatch.setattr(
        frontier_agents, "_get_pipeline_svc", lambda: _FakePipelineSvc(raises=_SFN_DENIED)
    )

    with pytest.raises(HTTPException) as exc:
        _deploy()

    detail = exc.value.detail
    assert exc.value.status_code == 500
    stored = svc.deployment.error_message
    assert svc.updates and svc.updates[-1]["status"] == DeploymentStatus.FAILED
    for secret in _SECRETS:
        assert secret not in detail, f"{secret!r} reached the response body"
        assert secret not in stored, f"{secret!r} reached the deployment record"
    assert "Starting the deployment pipeline failed" in stored
    assert _error_ref(stored) == _error_ref(detail)


def test_a_successful_deploy_stores_no_error_message(monkeypatch, deploy_env):
    """The floor under the two tests above: they would both pass if /deploy had simply
    stopped working, so pin that the happy path still packages, starts the execution and
    leaves error_message unset."""
    svc, tmp_path = deploy_env
    monkeypatch.setattr(boto3, "client", lambda *a, **k: _FakeS3())
    pipeline = _FakePipelineSvc()
    monkeypatch.setattr(frontier_agents, "_get_pipeline_svc", lambda: pipeline)

    resp = asyncio.run(
        frontier_agents.deploy_frontier_agent(
            frontier_agents.FrontierAgentDeployRequest(
                deployment_name="devops-1", agent_id="aws-devops", iac_type="terraform",
                aws_region="us-east-2",
            ),
            None,
        )
    )

    assert resp.error_message is None
    assert svc.updates == []
    assert resp.execution_arn == "arn:aws:states:us-east-2:000000000000:execution:x:y"
    assert resp.s3_key.endswith("aws-devops-terraform.zip")
