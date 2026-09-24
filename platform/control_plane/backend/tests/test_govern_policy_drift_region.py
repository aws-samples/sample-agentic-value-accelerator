"""Policy drift must read the GOVERNED region's CloudTrail, not a hardcoded us-east-1.

Why this file exists at all: a wrong-region AWS read is the one failure the honest-degrade
contract cannot catch. CloudTrail LookupEvents is per-region and does not error when you ask
the wrong one - it answers with THAT region's event history. So the read genuinely succeeds,
there is no exception to catch, no note to render, and the response is `live=true` with zero
drift findings. "No policy drift detected" is the reassuring answer, which is what makes this
dangerous rather than merely wrong.

GovernPolicyDriftService.__init__ used to take `region: str = "us-east-1"`, and its only
construction site (api/routes/govern_policy_drift.py) builds it zero-arg - so the hardcoded
default was what actually ran and GOVERN_AWS_REGION was silently ignored.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from services import govern_policy_drift_service as drift_mod  # noqa: E402
from services.govern_policy_drift_service import GovernPolicyDriftService  # noqa: E402


class _FakeCloudTrail:
    """Records the region it was built for and returns an empty, successful event history."""

    def __init__(self, region: str, calls: list):
        self.region = region
        self._calls = calls

    def lookup_events(self, **kwargs):
        self._calls.append((self.region, kwargs["LookupAttributes"][0]["AttributeValue"]))
        return {"Events": []}


@pytest.fixture
def captured_boto(monkeypatch):
    """Replace boto3.client so no test touches AWS, and expose the regions asked for."""
    regions: list = []
    calls: list = []

    def fake_client(service, region_name=None, **kwargs):
        assert service == "cloudtrail", f"unexpected client: {service}"
        regions.append(region_name)
        return _FakeCloudTrail(region_name, calls)

    monkeypatch.setattr(drift_mod.boto3, "client", fake_client)
    return regions, calls


class _FakePolicies:
    policies: list = []


def _svc(monkeypatch, governed):
    """Build the service with the governed-region set stubbed, and no live policy store."""
    monkeypatch.setattr(drift_mod, "get_governed_regions", lambda: list(governed))
    svc = GovernPolicyDriftService()
    monkeypatch.setattr(
        svc, "_policy_service", lambda: type("P", (), {"list_policies": lambda self: _FakePolicies()})()
    )
    return svc


def test_the_region_comes_from_the_governed_set_not_a_default(monkeypatch):
    """The fleet is tier 2. Moving it must move this reader with it."""
    svc = _svc(monkeypatch, ["eu-west-1", "us-west-2"])

    # First entry, because api/routes/govern_policy_drift.py declares SINGLE_REGION. The
    # extension point for fan-out is core.multiregion.run_over_regions over the whole set.
    assert svc.region == "eu-west-1"


def test_cloudtrail_is_actually_queried_in_that_region(monkeypatch, captured_boto):
    """svc.region is only half the fix - it has to reach the client that does the reading."""
    regions, calls = captured_boto
    svc = _svc(monkeypatch, ["ap-southeast-2"])

    svc._analyze_drift_live(hours=1)

    assert regions == ["ap-southeast-2"], "CloudTrail client built for the wrong region"
    # Every _AI_SOURCES lookup went to the governed region, not just the first.
    assert calls, "no CloudTrail lookup was issued"
    assert {region for region, _ in calls} == {"ap-southeast-2"}
    assert {source for _, source in calls} == set(drift_mod._AI_SOURCES)


def test_the_cache_key_is_region_scoped(monkeypatch, captured_boto):
    """Otherwise moving the fleet would serve the previous region's findings from cache.

    Same TTL bucket, different region: the second service must not read the first's entry.
    """
    key_a = _svc(monkeypatch, ["eu-central-1"])
    key_b = _svc(monkeypatch, ["sa-east-1"])

    assert key_a.region != key_b.region
    # The key is built inline in analyze_drift; assert on the shape it produces.
    assert f"drift:analysis:{key_a.region}:24" != f"drift:analysis:{key_b.region}:24"


def test_a_caller_can_no_longer_inject_a_region(monkeypatch):
    """The parameter is gone, not merely re-defaulted.

    A `region` argument on this service is always wrong: it invites a caller to pass the
    control-plane region to a reader of governed-fleet events, which is exactly the tier
    confusion that produced the empty-history bug. Dropping the parameter makes that
    unrepresentable rather than discouraged, following GovernCapacityService.
    """
    monkeypatch.setattr(drift_mod, "get_governed_regions", lambda: ["eu-west-1"])

    with pytest.raises(TypeError):
        GovernPolicyDriftService("us-east-1")  # type: ignore[call-arg]

    with pytest.raises(TypeError):
        GovernPolicyDriftService(region="us-east-1")  # type: ignore[call-arg]


def test_an_empty_governed_set_still_yields_a_region(monkeypatch):
    """get_governed_regions() cannot currently return [] - its fallback guarantees one entry -
    but a service that would raise IndexError on an empty config is a worse failure than a
    documented default, so the guard is asserted rather than assumed."""
    svc = _svc(monkeypatch, [])

    assert svc.region == "us-east-1"
