"""The AgentCore fleet inventory must page, and must not publish a ceiling as a total.

This is the file the original symptom came from: the Operations Hub reported a 1-agent
fleet against a real fleet of 36. Every list here used to read ONE page
(`list_agents(maxResults=100)`) and publish `total=len(items)`. Nothing raised - the
request is legal, it just answers a smaller question than the caller asked - so the
understatement arrived under a Live badge with no caveat attached.

These tests drive the real botocore paginator through `Stubber` rather than a fake client,
for the same reason as `test_aws_paging.py`: the fix rests on the paginator's own behaviour.
It also pins one fact worth knowing - `bedrock-agent` and `bedrock-agentcore-control` spell
their continuation token `nextToken`, lowercase. A hand-rolled `NextToken` loop against
these services would read page one, see no `NextToken`, and conclude it was done - the
exact bug being fixed, reintroduced by the fix. The paginator reads the token field out of
the service model, so it cannot make that mistake.

`GovernAgentCoreService` builds clients in `_bedrock_agent()` / `_agentcore()`, so tests
substitute those methods on the instance.
"""

from datetime import datetime, timezone

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import Stubber

from services.govern_agentcore_service import GovernAgentCoreService

NOW = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _client(service):
    return boto3.client(
        service,
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _agent_summary(i):
    return {
        "agentId": f"AG{i}",
        "agentName": f"agent-{i}",
        "agentStatus": "PREPARED",
        "updatedAt": NOW,
    }


def _runtime(i):
    return {
        "agentRuntimeArn": f"arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/r{i}",
        "agentRuntimeId": f"RT{i}",
        "agentRuntimeVersion": "1",
        "agentRuntimeName": f"runtime-{i}",
        # Non-empty because botocore enforces `min: 1` on this member. (It enforces min and
        # never max, which is the asymmetry behind the original CloudTrail clamp bug.)
        "description": f"runtime {i}",
        "lastUpdatedAt": NOW,
        "status": "READY",
    }


def _gateway(i):
    return {
        "gatewayId": f"GW{i}",
        "name": f"gw-{i}",
        "status": "READY",
        "createdAt": NOW,
        "updatedAt": NOW,
        "authorizerType": "CUSTOM_JWT",
    }


def _target(i):
    return {
        "targetId": f"TG{i}",
        "name": f"target-{i}",
        "status": "READY",
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def _service(bedrock=None, agentcore=None):
    svc = GovernAgentCoreService(region="us-east-1")
    if bedrock is not None:
        svc._bedrock_agent = lambda: bedrock
    if agentcore is not None:
        svc._agentcore = lambda: agentcore
    return svc


# --- the fleet count ------------------------------------------------------------------


def test_fleet_count_includes_agents_past_the_first_page():
    """The original defect in one assertion: page two has to be counted.

    Two pages per inventory. The old single-page read would have reported 2 + 2 = 4.
    """
    ba, ac = _client("bedrock-agent"), _client("bedrock-agentcore-control")
    sba, sac = Stubber(ba), Stubber(ac)
    sba.add_response("list_agents", {"agentSummaries": [_agent_summary(1), _agent_summary(2)],
                                     "nextToken": "t1"})
    sba.add_response("list_agents", {"agentSummaries": [_agent_summary(3)]})
    sac.add_response("list_agent_runtimes", {"agentRuntimes": [_runtime(1)], "nextToken": "t1"})
    sac.add_response("list_agent_runtimes", {"agentRuntimes": [_runtime(2), _runtime(3)]})

    with sba, sac:
        result = _service(ba, ac)._fetch_agents()

    assert result.total == 6
    assert result.bedrock_agents == 3
    assert result.agentcore_runtimes == 3
    assert result.live is True
    assert result.note is None          # an exact total carries no caveat


def test_lowercase_next_token_is_followed():
    """These services spell it `nextToken`; a hand-rolled `NextToken` loop would stop at
    page one and silently reintroduce the bug. The paginator reads the real field name."""
    ba = _client("bedrock-agent")
    s = Stubber(ba)
    s.add_response("list_agents", {"agentSummaries": [_agent_summary(1)], "nextToken": "t1"})
    s.add_response("list_agents", {"agentSummaries": [_agent_summary(2)]})

    with s:
        pages = list(ba.get_paginator("list_agents").paginate())

    assert len(pages) == 2              # the token was recognised and followed
    s.assert_no_pending_responses()


def test_bounded_fleet_walk_is_disclosed_as_a_floor(monkeypatch):
    """When the bound really does bite, the fleet count must be labelled a floor.

    Truncation DETECTION is covered against the real paginator in test_aws_paging.py. What
    is unverified there is the wiring in this service: that `page.note` actually reaches
    the response instead of being computed and dropped. So the helper is stubbed to report
    truncation and the assertion is about propagation.
    """
    from core.aws_paging import PageResult
    import services.govern_agentcore_service as mod

    monkeypatch.setattr(
        mod, "paginate_bounded",
        lambda client, op, key, **kw: PageResult(
            items=[_agent_summary(1)] if op == "list_agents" else [],
            truncated=(op == "list_agents"), op=op,
        ),
    )
    result = _service(object(), object())._fetch_agents()

    assert result.live is True
    assert "floor" in result.note


# --- a measured zero is live data -----------------------------------------------------


def test_empty_fleet_from_two_reachable_apis_is_live():
    """`live = len(agents) > 0` was the truthiness form of the same bug.

    An account that genuinely runs no agents is a MEASURED zero from two APIs that both
    answered. Reporting live=False also defeated get_or_load's `should_cache=r.live`, so
    both AWS calls re-issued on every single request.
    """
    ba, ac = _client("bedrock-agent"), _client("bedrock-agentcore-control")
    sba, sac = Stubber(ba), Stubber(ac)
    sba.add_response("list_agents", {"agentSummaries": []})
    sac.add_response("list_agent_runtimes", {"agentRuntimes": []})

    with sba, sac:
        result = _service(ba, ac)._fetch_agents()

    assert result.total == 0
    assert result.live is True
    # The old note said "none deployed or access denied" - opposite facts, one a clean bill
    # of health and one a broken integration. Both detectors answered, so it is the first.
    assert "No agents deployed" in result.note
    assert "access denied" not in result.note.lower()


def test_one_failed_detector_is_partial_not_a_smaller_fleet():
    ba, ac = _client("bedrock-agent"), _client("bedrock-agentcore-control")
    sba, sac = Stubber(ba), Stubber(ac)
    sba.add_response("list_agents", {"agentSummaries": [_agent_summary(1)]})
    sac.add_client_error("list_agent_runtimes", service_error_code="AccessDeniedException")

    with sba, sac:
        result = _service(ba, ac)._fetch_agents()

    assert result.total == 1
    assert result.live is True               # one inventory did answer
    assert "Partial" in result.note
    assert "AgentCore runtimes" in result.note


def test_both_detectors_failing_is_not_an_empty_fleet():
    ba, ac = _client("bedrock-agent"), _client("bedrock-agentcore-control")
    sba, sac = Stubber(ba), Stubber(ac)
    sba.add_client_error("list_agents", service_error_code="AccessDeniedException")
    sac.add_client_error("list_agent_runtimes", service_error_code="AccessDeniedException")

    with sba, sac:
        result = _service(ba, ac)._fetch_agents()

    assert result.live is False
    assert result.total == 0
    assert "Neither" in result.note
    assert "No agents deployed" not in result.note


# --- gateway targets: two independently truncatable walks -----------------------------


def test_gateway_targets_walks_both_levels():
    ac = Stubber(c := _client("bedrock-agentcore-control"))
    ac.add_response("list_gateways", {"items": [_gateway(1)], "nextToken": "t1"})
    ac.add_response("list_gateways", {"items": [_gateway(2)]})
    ac.add_response("list_gateway_targets", {"items": [_target(1)], "nextToken": "t1"})
    ac.add_response("list_gateway_targets", {"items": [_target(2)]})
    ac.add_response("list_gateway_targets", {"items": [_target(3)]})

    with ac:
        result = _service(agentcore=c)._fetch_gateway_targets()

    assert result.total == 3              # 2 for gateway 1 (paged), 1 for gateway 2
    assert result.live is True
    assert "3 gateway target(s) discovered across 2 gateway(s)." == result.note
    ac.assert_no_pending_responses()


def test_a_gateway_whose_targets_fail_is_counted_not_silently_skipped():
    """The total is short for a reason, and the reader has to be told which reason."""
    ac = Stubber(c := _client("bedrock-agentcore-control"))
    ac.add_response("list_gateways", {"items": [_gateway(1), _gateway(2)]})
    ac.add_response("list_gateway_targets", {"items": [_target(1)]})
    ac.add_client_error("list_gateway_targets", service_error_code="ThrottlingException")

    with ac:
        result = _service(agentcore=c)._fetch_gateway_targets()

    assert result.total == 1
    assert result.live is True            # one gateway's targets were genuinely read
    assert "1 of 2 gateway(s)" in result.note
    assert "floor" in result.note


def test_unreadable_gateway_list_is_not_zero_targets():
    """Without the gateway list there is nothing to count, so "0 across 0" would be a
    fabricated zero. It must degrade to live=False instead."""
    ac = Stubber(c := _client("bedrock-agentcore-control"))
    ac.add_client_error("list_gateways", service_error_code="AccessDeniedException")

    with ac:
        result = _service(agentcore=c)._fetch_gateway_targets()

    assert result.live is False
    assert result.source == "unavailable"
    assert "unavailable or not permitted" in result.note
    assert "discovered across 0 gateway(s)" not in (result.note or "")


def test_scoped_gateway_id_skips_the_gateway_list_entirely():
    """One caller passes a gateway_id; that path must not pay for a full gateway walk."""
    ac = Stubber(c := _client("bedrock-agentcore-control"))
    ac.add_response("list_gateway_targets", {"items": [_target(1)]},
                    {"gatewayIdentifier": "GW9", "maxResults": 100})

    with ac:
        result = _service(agentcore=c)._fetch_gateway_targets(gateway_id="GW9")

    assert result.total == 1
    assert result.targets[0].gateway_id == "GW9"
    ac.assert_no_pending_responses()      # list_gateways was never called


# --- policy engines -------------------------------------------------------------------


def test_policy_engines_page_and_report_an_exact_total():
    ac = Stubber(c := _client("bedrock-agentcore-control"))
    # policyEngineId has min length 12 and policyEngineArn min 76, both enforced by botocore.
    def engine(suffix):
        # 14, not 12: the 63-char ARN prefix below needs 13+ to clear the ARN's own min 76.
        pe_id = f"PE{suffix}".ljust(14, "0")
        return {
            "policyEngineId": pe_id, "name": f"pe-{suffix}", "createdAt": NOW, "updatedAt": NOW,
            "policyEngineArn": (
                "arn:aws:bedrock-agentcore:us-east-1:123456789012:policy-engine/" + pe_id
            ),
            "status": "READY", "statusReasons": [],
        }

    ac.add_response("list_policy_engines", {"policyEngines": [engine(1)], "nextToken": "t1"})
    ac.add_response("list_policy_engines", {"policyEngines": [engine(2)]})

    # `_fetch_*` rather than the public `list_policy_engines`, which memoises through
    # get_or_load and would make this test order-dependent.
    with ac:
        result = _service(agentcore=c)._fetch_policy_engines_list()

    assert result.total == 2
    assert result.live is True
    assert "2 policy engine(s) discovered." in result.note


def test_policy_engine_failure_degrades_rather_than_publishing_a_partial_count():
    ac = Stubber(c := _client("bedrock-agentcore-control"))
    ac.add_client_error("list_policy_engines", service_error_code="AccessDeniedException")

    with ac:
        result = _service(agentcore=c)._fetch_policy_engines_list()

    assert result.live is False
    assert result.total == 0
    assert "unavailable or not permitted" in result.note
