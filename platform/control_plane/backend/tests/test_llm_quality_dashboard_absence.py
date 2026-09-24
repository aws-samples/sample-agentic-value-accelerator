"""A missing CloudWatch dashboard is a MEASURED absence, not an unmeasured failure.

The inverse of the mistake the rest of this round keeps finding. Elsewhere a failed call was
being published as a fact ("0 agents", "Inspector2 not enabled"). Here a fact was being
published as a failure.

`get_llm_monitoring_status` guarded the dashboard probe with
`except cw.exceptions.DashboardNotFoundError`, which reads exactly like the right handler and
is dead code. botocore keys the exception class it RAISES on the wire error code
(`ResourceNotFound`) while *also* synthesising a separate attribute named after the model's
error shape (`DashboardNotFoundError`). The two are unrelated classes with no inheritance
between them, so every missing dashboard fell through to the generic failure branch.

That mattered more than the `dashboard_deployed` flag, which is False either way. The generic
branch appends a caveat - "Could not check whether the AVA-LLM-Quality dashboard exists" -
which was simply untrue: the API answered, clearly, that it does not exist. And because
`live = not caveats` gates the WHOLE payload, the genuine measurements of guardrail
monitoring, custom metrics and alarms all lost their Live badge to that false caveat.

`test_the_shape_named_attribute_cannot_catch_the_raised_error` pins the botocore behaviour
itself, so a future version that unifies the two names fails here rather than silently
invalidating the comment explaining the fix.
"""

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import Stubber


def _client(service):
    """A credential-free client for `service`, safe to hand to a Stubber.

    The dummy keys matter: without them botocore resolves the ambient credential chain at
    call time, so whether a test touched the network depended on the machine it ran on.
    """
    return boto3.client(
        service,
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _cw():
    return _client("cloudwatch")


# --- the botocore behaviour the fix rests on ------------------------------------------


def test_the_shape_named_attribute_cannot_catch_the_raised_error():
    """Measured, not assumed. Both names exist; only one is ever raised."""
    cw = _cw()
    s = Stubber(cw)
    s.add_client_error(
        "get_dashboard",
        service_error_code="ResourceNotFound",
        service_message="Dashboard AVA-LLM-Quality does not exist",
        http_status_code=404,
    )
    with s:
        with pytest.raises(ClientError) as exc:
            cw.get_dashboard(DashboardName="AVA-LLM-Quality")

    raised = type(exc.value)
    assert raised.__name__ == "ResourceNotFound"
    assert not issubclass(raised, cw.exceptions.DashboardNotFoundError)
    assert cw.exceptions.DashboardNotFoundError is not cw.exceptions.from_code("ResourceNotFound")


def test_the_service_model_maps_the_code_to_the_shape_which_is_the_trap():
    """The model DOES map ResourceNotFound -> DashboardNotFoundError. That is precisely why
    the dead handler looked correct: the model is right, and botocore's factory keys on the
    code anyway. The model is not authoritative for what gets raised."""
    op = _cw().meta.service_model.operation_model("GetDashboard")
    by_code = {
        s.metadata.get("error", {}).get("code"): s.name for s in op.error_shapes
    }
    assert by_code["ResourceNotFound"] == "DashboardNotFoundError"


# --- and the behaviour that depends on it ---------------------------------------------


def _status(monkeypatch, dashboard_error_code, **stub_message):
    """Drive get_llm_monitoring_status with everything but the dashboard probe succeeding."""
    from services import govern_llm_quality_service as mod

    cw = _cw()
    s = Stubber(cw)
    # The probes that run before the dashboard check. Empty results are fine; the assertions
    # below are about the dashboard caveat, not these values.
    s.add_response("list_metrics", {"Metrics": []})
    s.add_response("list_metrics", {"Metrics": []})
    s.add_response("describe_alarms", {"MetricAlarms": []})
    if dashboard_error_code is None:
        s.add_response("get_dashboard", {"DashboardBody": "{}", "DashboardName": "AVA-LLM-Quality"})
    else:
        s.add_client_error(
            "get_dashboard", service_error_code=dashboard_error_code,
            service_message=stub_message.get("msg", "boom"), http_status_code=404,
        )

    # _fetch_monitoring_status also builds a bedrock client and calls ListGuardrails, so it
    # has to be stubbed too. It used to fall through to a REAL boto3 client, which made these
    # tests depend on the ambient AWS environment in a way that changed their verdict rather
    # than just slowing them down:
    #
    #   - No credentials (a clean CI container): NoCredentialsError is a BotoCoreError, so the
    #     service sets guardrails_caveat. `bedrock_metrics_active` is False from the stubbed
    #     empty ListMetrics, so guardrail_monitoring stays False, the caveat is kept, and
    #     `live = not caveats` goes False - failing the `result.live is True` assertion in
    #     test_a_missing_dashboard_is_not_reported_as_an_unreadable_one.
    #   - Real credentials on a developer laptop: the call succeeds against whatever account
    #     is configured, so the same test passes for a reason that has nothing to do with the
    #     dashboard behaviour it exists to pin, and it makes a live AWS call to do it.
    #
    # An empty guardrails list is the right stub: it is a measured answer, so it adds no
    # caveat, which isolates `live` to the dashboard probe under test. get_guardrail is never
    # reached from an empty list, so it needs no response queued.
    bedrock = _client("bedrock")
    bs = Stubber(bedrock)
    bs.add_response("list_guardrails", {"guardrails": []})

    clients = {"cloudwatch": cw, "bedrock": bedrock}

    def fake(service_name, **kw):
        # Hard failure, not a fall-through to the real client. A new AWS call added to
        # _fetch_monitoring_status should break this test loudly rather than silently start
        # reaching the network and make the result depend on the runner's credentials.
        if service_name not in clients:
            raise AssertionError(
                f"_fetch_monitoring_status built an unstubbed {service_name!r} client; "
                "stub it here rather than letting the test call AWS."
            )
        return clients[service_name]

    monkeypatch.setattr(mod.boto3, "client", fake)
    svc = mod.GovernLlmQualityService(region="us-east-1")
    with s, bs:
        return svc._fetch_monitoring_status()


def test_a_missing_dashboard_is_not_reported_as_an_unreadable_one(monkeypatch):
    """The bug. The dashboard genuinely does not exist, and that is a measurement."""
    result = _status(monkeypatch, "ResourceNotFound", msg="Dashboard AVA-LLM-Quality does not exist")

    assert result.dashboard_deployed is False
    assert "Could not check whether" not in (result.note or "")
    # No caveat from this probe, so the rest of the payload keeps its Live badge.
    assert result.live is True
    assert result.source == "aws-apis"


def test_a_genuinely_unreadable_dashboard_still_degrades(monkeypatch):
    """The negative case. AccessDenied is not an absence, and must still drop off Live -
    otherwise the fix would have replaced a false caveat with a missing one."""
    result = _status(monkeypatch, "AccessDeniedException", msg="not authorized")

    assert result.dashboard_deployed is False
    assert "Could not check whether" in result.note
    assert result.live is False
    assert result.source == "aws-apis-partial"


def test_a_deployed_dashboard_is_reported_as_deployed(monkeypatch):
    result = _status(monkeypatch, None)

    assert result.dashboard_deployed is True
    assert result.live is True
    assert result.note is None
