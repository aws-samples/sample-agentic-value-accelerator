"""Inspector2 vulnerability + coverage reads: a failed call must not become a verdict.

Two sites in `govern_security_service.py` survived the first paging pass because they already
used a real paginator, so they did not match the `maxResults=N`-with-no-paging shape. Both
were still wrong, in the two ways this sweep keeps finding:

1. `_coverage_count` swallowed every error as `return 0`, and the caller reads
   `total == 0 and covered == 0` as "Inspector2 not enabled or has no scan coverage". So an
   account with Inspector2 enabled, a clean bill of health, and no `inspector2:ListCoverage`
   permission was reported as not enabled at all. Failure is not emptiness.

2. `_fetch_vulnerabilities` bounded its walk at `max_findings` and published
   `total=len(findings)` with `note=None`. The bound is the caller's own display ceiling, so
   stopping on it is expected - but the number is still rendered as a total, and on an account
   with more active findings than the ceiling it is a floor.

The negative tests are the load-bearing ones. A caveat that fires when nothing is wrong is
unfalsifiable, and "not enabled" must still be reachable when the evidence genuinely supports
it, or the fix would have replaced a false negative with a permanent false positive.
"""

from datetime import datetime, timezone

import boto3
import pytest
from botocore.stub import Stubber

from services.govern_security_service import GovernSecurityService

NOW = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _client():
    return boto3.client(
        "inspector2",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def _finding(i, severity="HIGH"):
    return {
        "findingArn": f"arn:aws:inspector2:us-east-1:123456789012:finding/f{i}",
        "awsAccountId": "123456789012",
        "type": "PACKAGE_VULNERABILITY",
        "description": f"finding {i}",
        "severity": severity,
        "firstObservedAt": NOW,
        "lastObservedAt": NOW,
        "updatedAt": NOW,
        "status": "ACTIVE",
        "remediation": {},
        "resources": [{"type": "AWS_EC2_INSTANCE", "id": f"i-{i:017x}"}],
        "packageVulnerabilityDetails": {
            "vulnerabilityId": f"CVE-2026-{1000 + i}",
            "source": "NVD",
        },
    }


def _covered(i):
    return {
        "resourceId": f"i-{i:017x}",
        "resourceType": "AWS_EC2_INSTANCE",
        "scanType": "PACKAGE",
        "accountId": "123456789012",
    }


def _svc(client):
    """A service whose only AWS client is the stubbed one.

    `_fetch_vulnerabilities` builds its own client via boto3.client, so the constructor is
    patched at the module level by the fixture below rather than on the instance.
    """
    svc = GovernSecurityService(region="us-east-1")
    return svc


@pytest.fixture
def stubbed(monkeypatch):
    """Yield (service, Stubber) with boto3.client('inspector2') pinned to the stubbed client."""
    client = _client()
    import services.govern_security_service as mod

    real = boto3.client

    def fake(service_name, **kw):
        if service_name == "inspector2":
            return client
        return real(service_name, **kw)

    monkeypatch.setattr(mod.boto3, "client", fake)
    s = Stubber(client)
    s.activate()
    try:
        yield _svc(client), s
    finally:
        s.deactivate()


# --- the coverage read: a denied call is not a disabled service ------------------------


def test_unreadable_coverage_does_not_become_not_enabled(stubbed):
    """The bug. Zero findings is real; zero coverage is an artifact of AccessDenied.

    Under the old code this returned live=False with "Inspector2 not enabled or has no scan
    coverage in this region." - a clean, confident, wrong statement about the account.
    """
    svc, s = stubbed
    s.add_response("list_findings", {"findings": []})
    s.add_client_error("list_coverage", service_error_code="AccessDeniedException")

    result = svc._fetch_vulnerabilities(100)

    assert result.live is True                    # ListFindings genuinely answered
    assert result.total == 0
    assert "not enabled or has no scan coverage" not in (result.note or "")
    assert "could not be confirmed" in result.note
    assert "ListCoverage" in result.note


def test_no_findings_and_no_coverage_still_reports_not_enabled(stubbed):
    """The negative case that keeps the verdict usable: when BOTH reads succeed and both are
    empty, "not enabled" is the honest read and must still be reachable."""
    svc, s = stubbed
    s.add_response("list_findings", {"findings": []})
    s.add_response("list_coverage", {"coveredResources": []})

    result = svc._fetch_vulnerabilities(100)

    assert result.live is False
    assert "not enabled or has no scan coverage" in result.note


def test_no_findings_with_real_coverage_is_a_clean_bill_of_health(stubbed):
    svc, s = stubbed
    s.add_response("list_findings", {"findings": []})
    s.add_response("list_coverage", {"coveredResources": [_covered(1), _covered(2)]})

    result = svc._fetch_vulnerabilities(100)

    assert result.live is True
    assert result.total == 0
    assert result.covered_resources == 2
    assert "Inspector2 enabled" in result.note


def test_coverage_pages_past_the_first(stubbed):
    svc, s = stubbed
    s.add_response("list_findings", {"findings": [_finding(1)]})
    s.add_response("list_coverage", {"coveredResources": [_covered(1)], "nextToken": "t1"})
    s.add_response("list_coverage", {"coveredResources": [_covered(2), _covered(3)]})

    result = svc._fetch_vulnerabilities(100)

    assert result.covered_resources == 3
    assert result.note is None            # exact findings, exact coverage: no caveat at all
    s.assert_no_pending_responses()


def test_coverage_page_size_is_the_api_maximum(stubbed):
    """ListCoverage's maxResults maximum is 200, not the 100 that reads as a round default.

    Stubber asserts the expected parameters, so this pins the value.
    """
    svc, s = stubbed
    s.add_response("list_findings", {"findings": []})
    s.add_response("list_coverage", {"coveredResources": [_covered(1)]}, {"maxResults": 200})

    result = svc._fetch_vulnerabilities(100)

    assert result.covered_resources == 1  # Stubber asserted the parameter set matched


def test_the_coverage_maximum_is_what_the_service_model_says():
    """Pins 200 to the model rather than to a comment."""
    shape = _client().meta.service_model.operation_model("ListCoverage").input_shape
    assert shape.members["maxResults"].metadata["max"] == 200


# --- the findings walk: a ceiling reported as a total ----------------------------------


def test_findings_past_the_first_page_are_counted(stubbed):
    svc, s = stubbed
    s.add_response("list_findings", {"findings": [_finding(1), _finding(2)], "nextToken": "t1"})
    s.add_response("list_findings", {"findings": [_finding(3)]})
    s.add_response("list_coverage", {"coveredResources": [_covered(1)]})

    result = svc._fetch_vulnerabilities(100)

    assert result.total == 3
    assert result.note is None
    s.assert_no_pending_responses()


def test_hitting_the_display_ceiling_is_disclosed_as_a_floor(stubbed):
    """max_findings=2 against three available findings. Legal, expected - and a floor.

    The ceiling is the caller's, so this is not a defect in the read; it is a defect only if
    `total` is presented as a total, which is exactly what note=None did.
    """
    svc, s = stubbed
    s.add_response("list_findings", {"findings": [_finding(1), _finding(2)], "nextToken": "t1"})
    s.add_response("list_coverage", {"coveredResources": [_covered(1)]})

    result = svc._fetch_vulnerabilities(2)

    assert result.total == 2
    assert result.live is True
    assert "floor" in result.note


def test_an_exact_read_that_lands_on_the_ceiling_carries_no_caveat(stubbed):
    """Two findings, a ceiling of exactly two, no continuation token. Indistinguishable from
    truncation inside the walk; the only honest discriminator is the absent token."""
    svc, s = stubbed
    s.add_response("list_findings", {"findings": [_finding(1), _finding(2)]})
    s.add_response("list_coverage", {"coveredResources": [_covered(1)]})

    result = svc._fetch_vulnerabilities(2)

    assert result.total == 2
    assert result.note is None
    assert "floor" not in (result.note or "")


def test_a_failed_findings_read_degrades_instead_of_reporting_zero_vulnerabilities(stubbed):
    svc, s = stubbed
    s.add_client_error("list_findings", service_error_code="AccessDeniedException")

    result = svc._fetch_vulnerabilities(100)

    assert result.live is False
    assert result.total == 0
    assert result.source == "unavailable-fallback"
    s.assert_no_pending_responses()       # coverage was never asked for


def test_findings_page_size_is_the_api_maximum(stubbed):
    svc, s = stubbed
    s.add_response(
        "list_findings",
        {"findings": [_finding(1)]},
        {
            "filterCriteria": {"findingStatus": [{"comparison": "EQUALS", "value": "ACTIVE"}]},
            "maxResults": 100,
        },
    )
    s.add_response("list_coverage", {"coveredResources": [_covered(1)]})

    result = svc._fetch_vulnerabilities(100)

    assert result.total == 1               # Stubber asserted the parameter set matched


def test_both_operations_are_paginable_so_the_paginator_path_is_correct():
    """paginate_bounded raises rather than silently reading one page if this ever flips."""
    c = _client()
    assert c.can_paginate("list_findings") is True
    assert c.can_paginate("list_coverage") is True
