"""What a deployment failure is allowed to tell the caller.

`api/routes/deployments.py` used to put `str(e)` into the 500 body at ten sites and
persist it to `error_message` at four of them. Both halves are the same disclosure: the
calls these routes wrap are boto3 calls, botocore renders a ClientError with the
service's own message copied verbatim, and for an AccessDenied that message is AWS's
"User: <caller arn> is not authorized to perform: <action> on resource: <target arn>" -
the account id, the ECS task role, and the bucket or state machine. The persisted half
was the slower route to the same place: `GET /deployments/{id}/status` returns
`error_message` verbatim and is gated at Role.VIEWER.

The tests that matter here are the last two. Everything above them pins the behaviour of
the two helpers; `test_no_route_interpolates_a_caught_exception_into_a_response` walks the
module's AST and is the only one that would fail if someone added an eleventh site, which
is the way this defect got in the first ten times.
"""

import ast
import inspect
import logging
import os
import re
import pytest

import api.routes.deployments as deployments


# A structurally realistic AccessDenied, with the account id masked to zeros - the
# disclosure property does not depend on the digits being real, only on the text being
# the service's and not ours. UNIQUE_TOKEN is what the assertions actually look for, so
# a substring match cannot pass by accident on a common word.
UNIQUE_TOKEN = "Zq7GraniteFerret"
ACCESS_DENIED = (
    "An error occurred (AccessDeniedException) when calling the StartExecution "
    "operation: User: arn:aws:sts::000000000000:assumed-role/ava-backend-task-"
    f"{UNIQUE_TOKEN}/abc is not authorized to perform: states:StartExecution on "
    "resource: arn:aws:states:us-east-1:000000000000:stateMachine:ava-deploy"
)

ERROR_REF_RE = re.compile(r"error_ref=([0-9a-f]{12})")


class _FakeSvc:
    """Records what update_status was asked to persist, or raises if told to."""

    def __init__(self, raises: bool = False):
        self.raises = raises
        self.calls: list[dict] = []

    def update_status(self, deployment_id, new_status, **kwargs):
        if self.raises:
            raise ValueError(f"Invalid transition for {deployment_id}")
        self.calls.append({"deployment_id": deployment_id, "status": new_status, **kwargs})


def _raise_access_denied():
    raise RuntimeError(ACCESS_DENIED)


# --- _client_safe_error ------------------------------------------------------------


def test_the_returned_message_carries_none_of_the_exception_text():
    try:
        _raise_access_denied()
    except Exception:
        message = deployments._client_safe_error("Pipeline start failed")

    assert UNIQUE_TOKEN not in message
    assert "arn:aws" not in message
    assert "not authorized" not in message
    assert message.startswith("Pipeline start failed")


def test_the_message_carries_a_correlation_id_an_operator_can_grep_for():
    try:
        _raise_access_denied()
    except Exception:
        message = deployments._client_safe_error("Delivery failed")

    match = ERROR_REF_RE.search(message)
    assert match, f"no error_ref in {message!r}"
    # Worth stating in the body, because the body is the only place a caller learns the
    # detail exists at all. Without it a 500 reads as "no further information".
    assert "backend logs" in message


def test_two_failures_get_different_correlation_ids():
    refs = []
    for _ in range(2):
        try:
            _raise_access_denied()
        except Exception:
            refs.append(ERROR_REF_RE.search(deployments._client_safe_error("Delivery failed")).group(1))
    assert refs[0] != refs[1], "a shared ref cannot distinguish two failures in the log"


def test_the_exception_and_its_traceback_do_reach_the_log(caplog):
    """The detail is not discarded, it is moved. Redacting without logging is worse."""
    with caplog.at_level(logging.ERROR, logger=deployments.logger.name):
        try:
            _raise_access_denied()
        except Exception:
            message = deployments._client_safe_error("Delivery failed")

    ref = ERROR_REF_RE.search(message).group(1)
    record = next(r for r in caplog.records if ref in r.getMessage())
    assert record.exc_info is not None, "no traceback attached - logger.exception is the point"
    assert UNIQUE_TOKEN in logging.Formatter().format(record), (
        "the formatted record must still contain the service's message"
    )


def test_the_deployment_id_is_logged_but_the_summary_stays_a_literal(caplog):
    with caplog.at_level(logging.ERROR, logger=deployments.logger.name):
        try:
            _raise_access_denied()
        except Exception:
            message = deployments._client_safe_error("Delivery failed", "dep-1234")

    assert "dep-1234" in caplog.text
    assert "dep-1234" not in message, "the caller supplied it; echoing it back adds nothing"


# --- _fail_deployment --------------------------------------------------------------


def test_the_persisted_error_is_exactly_what_the_caller_is_told():
    """One string for both, so the record and the response cannot come to disagree."""
    svc = _FakeSvc()
    try:
        _raise_access_denied()
    except Exception:
        returned = deployments._fail_deployment(svc, "dep-1", "Destroy pipeline failed")

    assert len(svc.calls) == 1
    assert svc.calls[0]["error_message"] == returned
    assert svc.calls[0]["status"] == deployments.DeploymentStatus.FAILED


def test_nothing_disclosing_is_persisted():
    """The half that outlives the request, and the one a VIEWER can read back."""
    svc = _FakeSvc()
    try:
        _raise_access_denied()
    except Exception:
        deployments._fail_deployment(svc, "dep-1", "Delivery failed")

    persisted = svc.calls[0]["error_message"]
    assert UNIQUE_TOKEN not in persisted
    assert "arn:aws" not in persisted


def test_a_bookkeeping_failure_does_not_hide_the_real_cause(caplog):
    """update_status raising must not replace the 500 that names the actual problem."""
    svc = _FakeSvc(raises=True)
    with caplog.at_level(logging.ERROR, logger=deployments.logger.name):
        try:
            _raise_access_denied()
        except Exception:
            returned = deployments._fail_deployment(svc, "dep-1", "Pipeline start failed")

    assert returned.startswith("Pipeline start failed")
    assert ERROR_REF_RE.search(returned)
    assert "Could not mark deployment dep-1 FAILED" in caplog.text


# --- the two guards that would catch a regression -----------------------------------


def test_reading_a_test_result_needs_the_role_that_can_create_one():
    """Every writer of _test_results is OPERATOR; the reader used to be VIEWER.

    Checked through the actual dependency rather than by reading the decorator, because
    the default parameter is where the level really lives.
    """
    from core.rbac import Role

    def _level(fn):
        for param in inspect.signature(fn).parameters.values():
            dep = getattr(param.default, "dependency", None)
            if dep is not None:
                return inspect.getclosurevars(dep).nonlocals.get("min_role")
        return None

    reader = _level(deployments.get_test_result)
    assert reader == Role.OPERATOR, f"get_test_result is gated at {reader!r}"
    for writer in (deployments.test_deployment, deployments.run_test_script):
        assert _level(writer) >= reader, (
            f"{writer.__name__} writes _test_results at a level below the reader"
        )


def test_no_route_interpolates_a_caught_exception_into_a_response():
    """The drift guard, and the only test here that fails on a new eleventh site.

    Walks every `except ... as <name>` handler and fails if <name> is interpolated into
    an f-string that reaches a caller - `raise HTTPException(detail=f"...{e}")` or
    `error_message=f"...{e}"`/`=str(e)`. An AST walk rather than a grep because a grep
    for `{e}` misses `{exc}`, `{err}` and `{status_err}`, and every one of those spellings
    is already in this repo.

    Two allowed shapes, both deliberate: `detail=str(e)` where `e` is a ValueError this
    codebase raised itself (resolve_dependencies' "Required foundation ... has no active
    deployment" is the message an operator needs), and any use inside a `logger.*` call,
    which is where the detail is supposed to go.
    """
    tree = ast.parse(inspect.getsource(deployments))
    violations = []

    for handler in (n for n in ast.walk(tree) if isinstance(n, ast.ExceptHandler)):
        if not handler.name:
            continue
        caught = handler.name
        for call in (n for n in ast.walk(handler) if isinstance(n, ast.Call)):
            func = call.func
            # Skip logging calls - the log is the intended destination.
            if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) \
                    and func.value.id == "logger":
                continue
            is_response = isinstance(func, ast.Name) and func.id == "HTTPException"
            keywords = {kw.arg for kw in call.keywords if kw.arg}
            if not (is_response or {"error_message", "detail"} & keywords):
                continue
            for kw in call.keywords:
                if kw.arg not in ("detail", "error_message"):
                    continue
                # Only f-strings are flagged. A bare str(e) of our own ValueError is
                # allowed; an f-string wrapping it is how AWS text got out.
                if not isinstance(kw.value, ast.JoinedStr):
                    continue
                names = {n.id for n in ast.walk(kw.value) if isinstance(n, ast.Name)}
                if caught in names:
                    violations.append(f"line {call.lineno}: {kw.arg}=f-string interpolating {caught!r}")

    assert not violations, (
        "a caught exception is being interpolated into a response:\n  "
        + "\n  ".join(violations)
        + "\nUse _client_safe_error / _fail_deployment instead."
    )
